import assert from 'node:assert/strict';
import { createWorkflowFileAccess } from '../src/ui/workflow-file-access.js';

// A file handle double models the native external boundary: writes become visible
// only on close, permissions can be revoked, and identity is independent of name.
function handle(id, name = id + '.json', initial = 'old') {
    const state = { text: initial, modified: 1, permission: 'granted', writes: 0, aborts: 0, failWrite: false, failClose: false, missing: false };
    const file = () => ({ name, size: new TextEncoder().encode(state.text).length, lastModified: state.modified, text: async () => state.text });
    return { name, state, kind: 'file', isSameEntry: async other => other.identity === id, identity: id,
        queryPermission: async () => state.permission, requestPermission: async () => state.permission,
        getFile: async () => { if (state.missing) throw new DOMException('Missing', 'NotFoundError'); return file(); },
        createWritable: async () => { state.writes++; let pending;
            return { write: async text => { if (state.failWrite) throw new Error('write failed'); pending = text; }, close: async () => { if (state.failClose) throw new Error('close failed'); state.text = pending; state.modified++; }, abort: async () => { state.aborts++; } };
        },
    };
}

// IndexedDB itself is the external boundary. This fixture retains records across
// service instances and reproduces request/transaction completion ordering.
function database({ failRead = false, failWrite = false } = {}) {
    const stores = new Map();
    const db = { objectStoreNames: { contains: name => stores.has(name) }, createObjectStore: name => stores.set(name, new Map()),
        transaction(name) {
            const tx = { objectStore() { const store = stores.get(name); return {
                get(key) { const request = {}; queueMicrotask(() => { if (failRead) { request.error = new Error('read denied'); request.onerror?.(); return; } request.result = store.get(key); request.onsuccess?.({ target: request }); queueMicrotask(() => tx.oncomplete?.()); }); return request; },
                put(value, key) { const request = {}; queueMicrotask(() => { if (failWrite) { request.error = new Error('quota exceeded'); request.onerror?.(); return; } store.set(key, value); request.result = key; request.onsuccess?.({ target: request }); queueMicrotask(() => tx.oncomplete?.()); }); return request; },
            }; } }; return tx;
        },
    };
    return { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onupgradeneeded?.({ target: request }); request.onsuccess?.({ target: request }); }); return request; } };
}
const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };
const idb = database(), original = handle('original'), alternative = handle('alternative');
let selected = original, saveTarget = alternative, changes = 0;
const files = createWorkflowFileAccess({ indexedDB: idb, showOpenFilePicker: async () => [selected], showSaveFilePicker: async () => saveTarget, onChange: () => changes++ });
assert.equal(files.native, true);
await files.ready;
assert.deepEqual(must(files.recents()), []);
const opened = must(await files.open());
assert.equal(opened.text, 'old');
assert.equal(opened.source.name, 'original.json');
assert.equal(opened.source.handle, original);
const saved = must(await files.save('authored', opened.source));
assert.equal(saved.downloaded, false);
assert.equal(original.state.text, 'authored', 'same-file Save writes the open file rather than choosing another');
assert.equal(saved.source.handle, original);
assert.equal(must(files.recents()).length, 1);
const as = must(await files.save('copy', saved.source, { saveAs: true }));
assert.equal(as.source.handle, alternative);
assert.equal(alternative.state.text, 'copy');
assert.equal(original.state.text, 'authored');
assert.equal(must(files.recents())[0].name, 'alternative.json');

original.state.text = 'external'; // same byte length and timestamp: hash must detect it.
const conflict = await files.save('overwrite', saved.source);
assert.equal(conflict.error.code, 'FILE_CONFLICT');
assert.equal(original.state.text, 'external');
assert.equal(original.state.writes, 1, 'external changes are detected before any writable stream exists');
const refreshed = must(await files.readRecent(opened.source.id));
assert.equal(refreshed.text, 'external', 'Open Recent rereads disk rather than recalling graph snapshots');
original.state.permission = 'denied';
assert.equal((await files.readRecent(opened.source.id)).error.code, 'FILE_PERMISSION');
assert.equal((await files.save('blocked', refreshed.source)).error.code, 'FILE_PERMISSION');
original.state.permission = 'granted';
original.state.failWrite = true;
assert.equal((await files.save('failed', refreshed.source)).error.code, 'FILE_WRITE_FAILED');
assert.equal(original.state.text, 'external');
assert.equal(original.state.aborts, 1, 'failed streams are aborted and never closed into a successful save');
original.state.failWrite = false; original.state.failClose = true;
assert.equal((await files.save('failed-close', refreshed.source)).ok, false);
assert.equal(original.state.text, 'external');
original.state.failClose = false; original.state.missing = true;
assert.equal((await files.readRecent(opened.source.id)).error.code, 'FILE_NOT_FOUND');
original.state.missing = false;

selected = { ...original, name: 'renamed.json' };
const renamed = must(await files.open());
assert.equal(renamed.source.id, opened.source.id, 'same-entry identity deduplicates different handle objects and names');
assert.equal(must(files.recents()).length, 2);
assert.equal(must(files.recents())[0].name, 'renamed.json');
for (let n = 0; n < 12; n++) { selected = handle('file-' + n); must(await files.open()); }
assert.equal(must(files.recents()).length, 10);
const reloaded = createWorkflowFileAccess({ indexedDB: idb, showOpenFilePicker: async () => [selected], showSaveFilePicker: async () => saveTarget });
await reloaded.ready;
assert.deepEqual(must(reloaded.recents()), must(files.recents()), 'origin-local recent handles survive service recreation');
const recentId = must(reloaded.recents())[0].id;
assert.equal(must(await reloaded.readRecent(recentId)).text, 'old');
must(await reloaded.removeRecent(recentId));
assert.equal(must(reloaded.recents()).length, 9);
must(await reloaded.clearRecent());
assert.deepEqual(must(reloaded.recents()), []);
assert.equal(selected.state.text, 'old', 'clear/remove history does not delete or write files');
assert.ok(changes > 0);

const cancelledFiles = createWorkflowFileAccess({ indexedDB: database(), showOpenFilePicker: async () => { throw new DOMException('Cancelled', 'AbortError'); }, showSaveFilePicker: async () => { throw new DOMException('Cancelled', 'AbortError'); } });
await cancelledFiles.ready;
assert.equal((await cancelledFiles.open()).cancelled, true);
assert.equal((await cancelledFiles.save('draft', null)).cancelled, true);
assert.deepEqual(must(cancelledFiles.recents()), []);
let downloaded;
const fallback = createWorkflowFileAccess({ indexedDB: database(), pickFile: async () => ({ name: 'upload.json', text: async () => 'upload' }), download: async (text, name) => { downloaded = { text, name }; } });
await fallback.ready;
assert.equal(fallback.native, false);
const upload = must(await fallback.open());
assert.equal(upload.text, 'upload');
assert.equal(upload.source.kind, 'upload');
const download = must(await fallback.save('draft', upload.source, { suggestedName: 'draft.json' }));
assert.equal(download.downloaded, true, 'a browser download is never acknowledged as a saved disk file');
assert.equal(download.source, upload.source);
assert.deepEqual(downloaded, { text: 'draft', name: 'draft.json' });
assert.deepEqual(must(fallback.recents()), [], 'uploads/downloads cannot masquerade as reopenable native handles');
const raced = handle('raced'), normalWriter = raced.createWritable;
raced.createWritable = async () => { const writer = await normalWriter(); return { ...writer, close: async () => { await writer.close(); raced.state.text = 'changed after close'; } }; };
const racingFiles = createWorkflowFileAccess({ indexedDB: database(), showOpenFilePicker: async () => [raced], showSaveFilePicker: async () => raced });
const racingSource = must(await racingFiles.open()).source;
assert.equal((await racingFiles.save('authored bytes', racingSource)).error.code, 'FILE_CONFLICT', 'external edits immediately after close cannot become the authored save checkpoint');
assert.equal(raced.state.text, 'changed after close');

for (const broken of [database({ failRead: true }), database({ failWrite: true })]) {
    const retained = handle('storage-warning'), warnings = [];
    const failing = createWorkflowFileAccess({ indexedDB: broken, showOpenFilePicker: async () => [retained], showSaveFilePicker: async () => retained, onWarning: message => warnings.push(message) });
    await failing.ready;
    const opened = must(await failing.open()); assert.equal(opened.source.handle, retained);
    const saved = must(await failing.save('saved despite recent failure', opened.source)); assert.equal(saved.downloaded, false); assert.equal(retained.state.text, 'saved despite recent failure');
    must(await failing.open()); assert.equal(warnings.length, 1, 'report storage failure once while preserving successful file IO'); assert.match(warnings[0], /Recent workflow files.*persisted/);
}
console.log('workflow-file-access: ok');
