import test from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../src/ui/file-input.js';

test('file input snapshots preserve UTF-8 text and the selected basename', async () => {
    const file = new File(['First line\nSecond line — café\n'], 'notes.md');
    assert.deepEqual(await api.readTextFile(file), { ok: true, data: { fileName: 'notes.md', content: 'First line\nSecond line — café\n', loaded: true } });
});

test('files beyond the byte limit fail before any content read', async () => {
    const file = new File(['x'.repeat(400001)], 'large.txt');
    file.arrayBuffer = () => { throw Error('Oversized bytes must not be read'); };
    const result = await api.readTextFile(file);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'FILE_TOO_LARGE');
    assert.match(result.error.message, /400,000/);
});

test('decoded snapshots exceeding the text limit fail without truncation', async () => {
    const accepted = await api.readTextFile(new File(['🙂'.repeat(50000)], 'at-limit.txt'));
    assert.equal(accepted.ok, true);
    assert.equal(accepted.data.content.length, 100000);
    const rejected = await api.readTextFile(new File(['🙂'.repeat(50000) + 'x'], 'over-limit.txt'));
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, 'FILE_CONTENT_TOO_LARGE');
    assert.equal(Object.hasOwn(rejected, 'data'), false);
});

test('invalid UTF-8 fails explicitly instead of saving replacement characters', async () => {
    const result = await api.readTextFile(new File([new Uint8Array([0xc3, 0x28])], 'invalid.txt'));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'FILE_INVALID_UTF8');
    assert.match(result.error.message, /UTF-8/);
});

test('failed file reads return a recoverable error', async () => {
    const file = new File(['Text'], 'unreadable.txt');
    file.arrayBuffer = async () => { throw Error('Simulated inaccessible file'); };
    const result = await api.readTextFile(file);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'FILE_READ_FAILED');
    assert.match(result.error.message, /read/i);
});


test('snapshot filenames discard paths and normalize Unicode', async () => {
    const result = await api.readTextFile(new File([''], 'C:\\fakepath\\folder/notes-cafe\u0301.txt'));
    assert.deepEqual(result, { ok: true, data: { fileName: 'notes-caf\u00e9.txt', content: '', loaded: true } });
});


test('snapshot filenames reject missing or oversized basenames without truncation', async () => {
    const accepted = await api.readTextFile(new File([''], 'x'.repeat(251) + '.txt'));
    assert.equal(accepted.ok, true);
    assert.equal(accepted.data.fileName.length, 255);
    for (const name of ['', 'folder/', 'x'.repeat(252) + '.txt']) {
        const result = await api.readTextFile(new File([''], name));
        assert.equal(result.ok, false, name);
        assert.equal(result.error.code, 'FILE_NAME_INVALID');
        assert.equal(Object.hasOwn(result, 'data'), false);
    }
});


test('UTF-8 snapshots remove the leading BOM while preserving embedded BOMs and empty files', async () => {
    assert.deepEqual(await api.readTextFile(new File(['\ufeffFirst\ufefflast'], 'bom.txt')), { ok: true, data: { fileName: 'bom.txt', content: 'First\ufefflast', loaded: true } });
    assert.deepEqual(await api.readTextFile(new File([''], 'empty.json')), { ok: true, data: { fileName: 'empty.json', content: '', loaded: true } });
});

test('unsupported browser file readers fail explicitly', async () => {
    const file = new File(['Text'], 'notes.txt');
    file.arrayBuffer = undefined;
    const result = await api.readTextFile(file);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'FILE_READ_FAILED');
});

const { readFile, mkdtemp, writeFile, rm } = await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const { join, resolve, relative, isAbsolute } = await import('node:path');
const { pathToFileURL } = await import('node:url');
const { compiled } = await import('./helpers/svelte-compile.mjs');
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);

async function detailsFixture(view, actions) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-file-input-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    const close = async () => {
        if (mounted) await unmount(mounted); host.remove();
        const target = resolve(directory), rel = relative(resolve(tmpdir()), target);
        assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(target, { recursive: true, force: true });
    };
    try {
        const leaf = await compiled('NodeDetails', directory, await readFile(new URL('../ui/NodeDetails.svelte', import.meta.url), 'utf8'));
        const harness = await compiled('FileDetailsHarness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions } = $props(); let view = $state.raw(initial); export function update(next) { view = next; }</script><Leaf {view} {actions} />`);
        mounted = mount(harness.component, { target: host, props: { initial: view, actions } }); flushSync();
        return { host, update(next) { mounted.update(next); flushSync(); }, close };
    } catch (error) { await close(); throw error; }
}
const address = { workflowId: 'root', instancePath: ['first'], nodeId: 'file' };
const fileDetails = (extra = {}) => ({ selectionKey: 'selected-file', revision: 'revision1', address, title: 'File Input', canonicalTitle: 'File Input', iconPath: 'M3 5h18', family: 'Input', phase: 'pre', alias: '', compact: false, enabled: true, readOnly: false, canPresent: true, controls: [], model: null, ports: [{ id: 'out', label: 'Text', direction: 'output', kind: 'text' }], fileInput: { fileName: '', loaded: false }, ...extra });
const chooseFile = (input, file) => { Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync(); };
const settle = async () => { await tick(); flushSync(); };

test('File Input Details chooses a file with its captured selection and displays the saved snapshot name', async () => {
    const edits = [], file = new File(['Hello'], 'notes.md');
    const f = await detailsFixture(fileDetails(), { loadFile(captured, selected) { edits.push([captured, selected]); return { ok: true }; } });
    try {
        const input = f.host.querySelector('input[type="file"]'); assert.ok(input, 'Details has an actual file chooser');
        assert.equal(input.getAttribute('aria-label'), 'Choose file');
        assert.match(input.accept, /\.txt/); assert.match(input.accept, /\.md/); assert.match(input.accept, /\.json/);
        chooseFile(input, file); await settle();
        assert.deepEqual(edits, [[{ selectionKey: 'selected-file', revision: 'revision1', address }, file]]);
        f.update(fileDetails({ revision: 'revision2', fileInput: { fileName: 'notes.md', loaded: true } }));
        assert.equal(f.host.querySelector('input[type="file"]').getAttribute('aria-label'), 'Replace file');
        assert.match(f.host.textContent, /notes\.md/); assert.match(f.host.textContent, /embedded/); assert.match(f.host.textContent, /snapshot/);
    } finally { await f.close(); }
});

test('read-only file controls reject raw changes and stale read failures never appear on a sibling selection', async () => {
    const edits = [], pending = [], file = new File(['Text'], 'notes.txt');
    const f = await detailsFixture(fileDetails({ readOnly: true }), { loadFile(captured, selected) { edits.push([captured, selected]); return new Promise(resolve => pending.push(resolve)); } });
    try {
        let input = f.host.querySelector('input[type="file"]'); assert.equal(input.disabled, true);
        chooseFile(input, file); assert.deepEqual(edits, []);
        f.update(fileDetails()); input = f.host.querySelector('input[type="file"]');
        chooseFile(input, file); assert.equal(input.disabled, true); assert.match(f.host.textContent, /Loading file/);
        f.update(fileDetails({ selectionKey: 'second-file', address: { ...address, instancePath: ['second'] } }));
        pending[0]({ ok: false, error: { code: 'OLD', message: 'Wrong file failure' } }); await settle();
        assert.doesNotMatch(f.host.textContent, /Wrong file failure/); assert.doesNotMatch(f.host.textContent, /Loading file/);
        assert.equal(f.host.querySelector('input[type="file"]').disabled, false);
        assert.deepEqual(edits, [[{ selectionKey: 'selected-file', revision: 'revision1', address }, file]]);
    } finally { await f.close(); }
});

test('a failed file load shows its error and permits another selection without changing the saved name', async () => {
    const f = await detailsFixture(fileDetails({ fileInput: { fileName: 'original.md', loaded: true } }), { loadFile() { return { ok: false, error: { code: 'FILE_INVALID_UTF8', message: 'Choose UTF-8 text.' } }; } });
    try {
        chooseFile(f.host.querySelector('input[type="file"]'), new File(['Text'], 'new.md')); await settle();
        assert.equal(f.host.querySelector('[data-diagnostic] details code').textContent, 'FILE_INVALID_UTF8');
        assert.equal(f.host.querySelector('[data-diagnostic] details').open, false);
        assert.match(f.host.textContent, /original\.md/); assert.equal(f.host.querySelector('input[type="file"]').disabled, false);
    } finally { await f.close(); }
});

const { projectWorkspacePanels } = await import('../src/ui/workspace-preparation.js');
function preparedPanels(saved, descriptors, defaults = {}) {
    const metadata = { canonicalTitle: 'File Input', family: 'Input', iconPath: 'M3 5h18', controlDescriptors: descriptors, defaults, modelRole: null, ports: [{ port: 'out', label: 'Text', dir: 'out', kind: 'text' }] };
    const editor = { readOnly: false, view: { identity: { kind: 'root' }, key: 'root-view', nodePresentation: {} }, prepared: { identity: { kind: 'root', workflowId: 'root' }, savedGraph: { mode: 'native-pre', nodes: { file: saved } }, drawBase: { nativeCards: { file: metadata } }, effectiveNodes: { file: saved }, interface: [] } };
    const workflow = { selectedId: 'file', graphId: 'root', nodes: [{ id: 'file' }], profiles: [], targets: [], issues: [], callBound: 0, rows: [] };
    return projectWorkspacePanels(editor, workflow, {}, 'revision1', null, null).nodeDetails;
}

test('prepared File Input Details exposes the saved snapshot name and suppresses raw snapshot controls', () => {
    const panels = preparedPanels({ id: 'file', operation: 'file-input', fileName: 'notes.md', content: 'Embedded text', loaded: true }, {
        fileName: { type: 'string', default: '' }, content: { type: 'string', default: '' }, loaded: { type: 'boolean', default: false },
    });
    assert.deepEqual(panels.fileInput, { fileName: 'notes.md', loaded: true });
    assert.deepEqual(panels.controls, []);
    assert.equal(Object.hasOwn(panels.fileInput, 'content'), false);
});

test('prepared source controls use canonical defaults and the selected prompt source condition', () => {
    const descriptors = { source: { type: 'enum', values: ['system', 'prompt-entry'], default: 'system' }, promptId: { type: 'string', default: '', visibleWhen: { key: 'source', value: 'prompt-entry' }, help: 'Use a prompt identifier.' }, internal: { type: 'string', default: '', hidden: true } };
    const pending = preparedPanels({ id: 'file', operation: 'prompt-source', source: 'system', promptId: 'saved-prompt' }, descriptors);
    assert.deepEqual(pending.controls.map(control => control.key), ['source', 'form']);
    const entry = preparedPanels({ id: 'file', operation: 'prompt-source', source: 'prompt-entry', promptId: 'saved-prompt' }, descriptors);
    assert.deepEqual(entry.controls.map(control => control.key), ['source', 'promptId', 'form']);
    assert.equal(entry.controls[1].value, 'saved-prompt');
    assert.match(entry.controls.find(control => control.key === 'form').help, /Raw keeps the template/); assert.equal(entry.controls.find(control => control.key === 'form').value, 'raw');
    assert.equal(entry.fileInput, undefined);
    const fallback = preparedPanels({ id: 'file', operation: 'prompt-source' }, descriptors, { source: 'prompt-entry' });
    assert.deepEqual(fallback.controls.map(control => control.key), ['source', 'form']); assert.equal(fallback.controls[0].value, 'system', 'injected draw defaults cannot change the canonical source');
});
