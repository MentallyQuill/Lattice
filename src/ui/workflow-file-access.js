const fail = (code, message, cancelled = false) => ({ ok: false, ...(cancelled ? { cancelled: true } : {}), error: { code, message } });
const cancelled = () => fail('FILE_CANCELLED', 'The file operation was cancelled.', true);
const pickerTypes = [{ description: 'Lattice workflow JSON', accept: { 'application/json': ['.json'] } }];
const LIMIT = 2000000;

function browserPickFile() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
        const finish = file => { input.remove(); resolve(file); };
        input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
        input.addEventListener('cancel', () => finish(null), { once: true });
        document.body.append(input);
        try { input.click(); } catch (error) { input.remove(); reject(error); }
    });
}

function browserDownload(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = name; link.hidden = true;
    try { document.body.append(link); link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0); }
}

async function fingerprint(file, text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Object.freeze({ lastModified: file.lastModified ?? null, size: file.size, hash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') });
}

const sameFingerprint = (a, b) => !!a && a.lastModified === b.lastModified && a.size === b.size && a.hash === b.hash;
const fileError = (cause, operation) => cause?.name === 'AbortError' ? cancelled()
    : cause?.name === 'NotAllowedError' || cause?.name === 'SecurityError' ? fail('FILE_PERMISSION', 'Permission to access this workflow file was denied. Choose it again or use Save As.')
        : cause?.name === 'NotFoundError' ? fail('FILE_NOT_FOUND', 'This workflow file is missing. Choose another file.')
            : fail(operation === 'read' ? 'FILE_READ_FAILED' : 'FILE_WRITE_FAILED', operation === 'read' ? 'The workflow file could not be read.' : 'The workflow file could not be saved. Your draft remains open.');

/** Native handles live only in this service and its origin-local IndexedDB store.
 * Inject picker/file/download boundaries for hosts and tests. No settings adapter.
 */
export function createWorkflowFileAccess(options = {}) {
    const openPicker = options.showOpenFilePicker ?? globalThis.showOpenFilePicker?.bind(globalThis);
    const savePicker = options.showSaveFilePicker ?? globalThis.showSaveFilePicker?.bind(globalThis);
    const indexedDB = options.indexedDB ?? globalThis.indexedDB;
    const pickFile = options.pickFile ?? browserPickFile, download = options.download ?? browserDownload;
    const native = typeof openPicker === 'function' && typeof savePicker === 'function';
    let db = null, recent = [], persistQueue = Promise.resolve();
    const warnings = new Set();
    const warn = message => { if (warnings.has(message)) return; warnings.add(message); try { options.onWarning?.(message); } catch { /* Feedback cannot invalidate a completed file operation. */ } };
    const changed = () => { try { options.onChange?.(); } catch { /* Rendering does not own file operations. */ } };
    const storageFailure = () => fail('RECENT_STORAGE_FAILED', 'Recent workflow files could not be persisted in this browser.');

    function transaction(mode, action) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('recents', mode), request = action(tx.objectStore('recents'));
            let value;
            request.onsuccess = () => { value = request.result; };
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => resolve(value);
            tx.onabort = tx.onerror = () => reject(tx.error);
        });
    }

    const ready = (async () => {
        if (!indexedDB) { changed(); return { ok: true, data: { persistent: false } }; }
        try {
            db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('lattice-workflow-files', 1);
                request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('recents')) request.result.createObjectStore('recents'); };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error('Recent file database is blocked.'));
            });
            const stored = await transaction('readonly', store => store.get('files'));
            recent = (Array.isArray(stored) ? stored : []).filter(item => typeof item?.id === 'string' && typeof item.name === 'string' && typeof item.handle?.getFile === 'function').slice(0, 10);
            changed();
            return { ok: true, data: { persistent: true } };
        } catch { db = null; changed(); const result = storageFailure(); warn(result.error.message); return result; }
    })();

    async function persist() {
        changed();
        if (!db) return { ok: true, data: { persistent: false } };
        const rows = [...recent];
        const write = persistQueue.then(() => transaction('readwrite', store => store.put(rows, 'files')));
        persistQueue = write.catch(() => {});
        try { await write; return { ok: true, data: { persistent: true } }; } catch { return storageFailure(); }
    }

    async function identify(handle) {
        for (const entry of recent) {
            try { if (handle === entry.handle || typeof handle.isSameEntry === 'function' && await handle.isSameEntry(entry.handle)) return entry.id; }
            catch { /* A revoked/missing old entry is not a match. */ }
        }
        return crypto.randomUUID();
    }

    async function remember(handle, name, id) {
        await ready;
        const identity = id ?? await identify(handle);
        recent = [{ id: identity, name, handle }, ...recent.filter(entry => entry.id !== identity)].slice(0, 10);
        const stored = await persist(); // A storage failure cannot undo a completed disk write/read.
        if (!stored.ok) warn(stored.error.message);
        return identity;
    }

    async function permission(handle, mode) {
        const descriptor = { mode };
        if (typeof handle.queryPermission !== 'function') return true;
        if (await handle.queryPermission(descriptor) === 'granted') return true;
        return typeof handle.requestPermission === 'function' && await handle.requestPermission(descriptor) === 'granted';
    }

    async function readHandle(handle, id) {
        try {
            if (!await permission(handle, 'read')) return fail('FILE_PERMISSION', 'Permission to read this workflow file was denied. Choose it again.');
            const file = await handle.getFile();
            if (file.size > LIMIT) return fail('MALFORMED_WORKFLOW', 'Workflow JSON must be at most 2,000,000 UTF-8 bytes.');
            const text = await file.text(), stamp = await fingerprint(file, text), name = handle.name || file.name || 'workflow.json';
            const identity = await remember(handle, name, id);
            return { ok: true, data: { text, source: Object.freeze({ kind: 'native', id: identity, name, handle, fingerprint: stamp }) } };
        } catch (cause) { return fileError(cause, 'read'); }
    }

    const service = {
        native, ready,
        recents: () => ({ ok: true, data: recent.map(({ id, name }) => ({ id, name })) }),
        async open() {
            try {
                // Picker starts immediately in the initiating click, before IDB awaits.
                if (native) { const handles = await openPicker({ multiple: false, types: pickerTypes }); return handles?.[0] ? readHandle(handles[0]) : cancelled(); }
                const file = await pickFile();
                if (!file) return cancelled();
                if (file.size > LIMIT) return fail('MALFORMED_WORKFLOW', 'Workflow JSON must be at most 2,000,000 UTF-8 bytes.');
                return { ok: true, data: { text: await file.text(), source: Object.freeze({ kind: 'upload', name: file.name || 'workflow.json' }) } };
            } catch (cause) { return fileError(cause, 'read'); }
        },
        async save(text, source = null, { saveAs = false, suggestedName = 'Untitled.workflow.json', download: downloadCopy = false } = {}) {
            if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > LIMIT) return fail('MALFORMED_WORKFLOW', 'Workflow JSON must be at most 2,000,000 UTF-8 bytes.');
            if (!native || downloadCopy) {
                try { const result = await download(text, suggestedName); return result?.ok === false ? result : { ok: true, data: { source, downloaded: true } }; }
                catch (cause) { return cause?.name === 'AbortError' ? cancelled() : fail('FILE_DOWNLOAD_FAILED', 'The workflow JSON copy could not be downloaded.'); }
            }
            let writer, handle, sameFile = !saveAs && source?.kind === 'native' && typeof source.handle?.getFile === 'function';
            try {
                handle = sameFile ? source.handle : await savePicker({ suggestedName, types: pickerTypes });
                if (!handle) return cancelled();
                if (!await permission(handle, 'readwrite')) return fail('FILE_PERMISSION', 'Permission to save this workflow file was denied. Use Save As to choose another file.');
                if (sameFile) {
                    const file = await handle.getFile(), textOnDisk = await file.text();
                    if (!sameFingerprint(source.fingerprint, await fingerprint(file, textOnDisk))) return fail('FILE_CONFLICT', 'This workflow file changed outside Lattice. Use Save As to preserve your draft without overwriting those changes.');
                }
                writer = await handle.createWritable();
                await writer.write(text);
                await writer.close();
                writer = null;
                const name = handle.name || suggestedName, id = await remember(handle, name, sameFile ? source.id : undefined);
                // Close is the success boundary. If metadata rereading is unavailable,
                // retain the successful save and require a fresh read before next Save.
                let stamp = null;
                try {
                    const file = await handle.getFile(), diskText = await file.text();
                    if (diskText !== text) return fail('FILE_CONFLICT', 'This workflow file changed immediately after saving. Your draft remains open; use Save As to preserve it.');
                    stamp = await fingerprint(file, diskText);
                } catch { /* Saved, metadata unavailable. */ }
                return { ok: true, data: { source: Object.freeze({ kind: 'native', id, name, handle, fingerprint: stamp }), downloaded: false } };
            } catch (cause) {
                if (writer) { try { await writer.abort?.(); } catch { /* Preserve the original write failure. */ } }
                return fileError(cause, 'write');
            }
        },
        async readRecent(id) {
            await ready;
            const entry = recent.find(item => item.id === id);
            return entry ? readHandle(entry.handle, entry.id) : fail('RECENT_NOT_FOUND', 'This workflow file is no longer in Open Recent.');
        },
        async clearRecent() { await ready; recent = []; return persist(); },
        async removeRecent(id) { await ready; recent = recent.filter(item => item.id !== id); return persist(); },
    };
    return Object.freeze(service);
}
