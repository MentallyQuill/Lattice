import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compiled } from './helpers/svelte-compile.mjs';
import { JSDOM } from 'jsdom';
import { prepareNodeControlChange } from '../src/workflow/ports.js';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);


async function fixture(view, actions) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-detail-drafts-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    const cleanup = async () => {
        if (mounted) await unmount(mounted); host.remove();
        const target = resolve(directory), rel = relative(resolve(tmpdir()), target);
        assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(target, { recursive: true, force: true });
    };
    try {
        const source = await readFile(new URL('../ui/NodeDetails.svelte', import.meta.url), 'utf8');
        const leaf = await compiled('NodeDetails', directory, source);
        const harness = await compiled('DetailDraftHarness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions } = $props(); let view = $state.raw(initial), visible = $state(true); export function update(next) { view = next; } export function setMounted(next) { visible = next; }</script>{#if visible}<Leaf {view} {actions} />{/if}`);
        mounted = mount(harness.component, { target: host, props: { initial: view, actions } }); flushSync();
        return { host, update(next) { mounted.update(next); flushSync(); }, setMounted(next) { mounted.setMounted(next); flushSync(); }, close: cleanup };
    } catch (error) { await cleanup(); throw error; }
}
const address = { workflowId: 'root', instancePath: [], nodeId: 'scan' };
const savedRules = [{ id: 'delve', pattern: 'delve', label: 'Keep this preference' }, { id: 'weave', pattern: 'weave' }];
const initialGraph = () => ({ id: 'root', schema: 3, runtime: 2, mode: 'native-post', roles: {}, definitions: {}, portals: {}, wires: {}, groups: {}, nodes: { scan: { id: 'scan', type: 'workflow', operation: 'pattern', operationVersion: 1, enabled: true, rules: structuredClone(savedRules), caseSensitive: true, exemptions: ['delve safely'], protectedLiterals: ['weave'], model: 'portable-model', presentation: { alias: 'Saved wording' } } } });
const node = (graph = initialGraph(), extra = {}) => ({ selectionKey: 'selected-scan', revision: 'revision1', address, title: 'Pattern', canonicalTitle: 'Pattern', iconPath: 'M3 5h18', family: 'Surface', phase: 'post', alias: 'Saved wording', compact: false, enabled: true, readOnly: false, canPresent: true, model: null, ports: [], controls: [
    { key: 'rules', label: 'rules', editor: 'json', representation: 'json-value', value: graph.nodes.scan.rules, effective: JSON.stringify(graph.nodes.scan.rules), source: 'Saved setting', help: 'Canonical rules retain their IDs and labels.' },
    { key: 'caseSensitive', label: 'case Sensitive', editor: 'boolean', value: graph.nodes.scan.caseSensitive },
    { key: 'exemptions', label: 'exemptions', editor: 'lines', value: graph.nodes.scan.exemptions },
], ...extra });
const editor = f => f.host.querySelector('[aria-label="rules"]');
const save = f => f.host.querySelector('[data-save-control="rules"]');
const input = (element, value) => { element.value = value; element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync(); };
const settle = async () => { await tick(); flushSync(); };
async function savedFixture() {
    let graph = initialGraph(), revision = 1, f;
    const edits = [];
    f = await fixture(node(graph), { editControl(captured, key, value) {
        assert.deepEqual(captured, { selectionKey: 'selected-scan', revision: 'revision' + revision, address });
        edits.push({ key, value: structuredClone(value) });
        const prepared = prepareNodeControlChange(graph, { nodeId: captured.address.nodeId, controls: { [key]: value } });
        if (!prepared.ok) return prepared;
        graph = prepared.data.candidate; revision++;
        f.update(node(graph, { revision: 'revision' + revision }));
        return { ok: true };
    } });
    return { ...f, graph: () => graph, edits };
}
function toggleCase(f) {
    const checkbox = f.host.querySelector('[aria-label="case Sensitive"]');
    checkbox.checked = false; checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync();
}

test('an invalid JSON draft and error survive an unrelated saved checkbox revision for the selected node', async () => {
    const f = await savedFixture();
    try {
        const textarea = editor(f);
        input(textarea, '{"phrase":'); save(f).click(); flushSync();
        assert.equal(textarea.getAttribute('aria-invalid'), 'true'); assert.match(f.host.querySelector('[data-diagnostic]').textContent, /valid JSON/);
        assert.deepEqual(f.edits, [], 'invalid JSON never dispatches a saved-field edit');
        toggleCase(f); await settle();
        assert.equal(editor(f), textarea, 'the mounted editor remains connected');
        assert.equal(editor(f).value, '{"phrase":', 'unrelated saved revision must retain invalid unsaved text');
        assert.equal(editor(f).getAttribute('aria-invalid'), 'true'); assert.match(f.host.querySelector('[data-diagnostic]').textContent, /valid JSON/);
        assert.equal(f.graph().nodes.scan.caseSensitive, false); assert.deepEqual(f.graph().nodes.scan.rules, savedRules);
        assert.equal(f.graph().nodes.scan.model, 'portable-model'); assert.deepEqual(f.graph().nodes.scan.presentation, { alias: 'Saved wording' });
        assert.deepEqual(f.edits, [{ key: 'caseSensitive', value: false }]);
    } finally { await f.close(); }
});

test('invalid JSON drafts survive changing roots and returning without saving either workflow', async () => {
    const f = await savedFixture();
    try {
        input(editor(f), '{"phrase":'); save(f).click(); flushSync();
        const other = initialGraph(); other.id = 'other-root'; other.nodes.scan.rules = [{ id: 'other', pattern: 'Other committed rules' }];
        f.update(node(other, { address: { ...address, workflowId: 'other-root' } }));
        assert.equal(editor(f).value, JSON.stringify(other.nodes.scan.rules, null, 2));
        input(editor(f), '["other draft"]');
        f.update(node(f.graph(), { revision: 'revision2' }));
        assert.equal(editor(f).value, '{"phrase":');
        assert.equal(editor(f).getAttribute('aria-invalid'), 'true');
        assert.match(f.host.querySelector('[data-diagnostic]').textContent, /valid JSON/);
        save(f).click(); await settle();
        assert.deepEqual(f.edits, [], 'returning to invalid text never publishes a control edit');
        assert.deepEqual(f.graph().nodes.scan.rules, savedRules);
        assert.deepEqual(other.nodes.scan.rules, [{ id: 'other', pattern: 'Other committed rules' }]);
        f.update(node(other, { address: { ...address, workflowId: 'other-root' } }));
        assert.equal(editor(f).value, '["other draft"]', 'each root retains its own pending text');
    } finally { await f.close(); }
});

test('unmounting the inspector expires its private cached drafts before a fresh instance uses the same address', async () => {
    const edits = [], f = await fixture(node(), { editControl: (...args) => { edits.push(args); return { ok: true }; } });
    try {
        input(editor(f), '{"phrase":'); save(f).click(); flushSync();
        f.update(node(undefined, { address: { ...address, workflowId: 'other-root' } }));
        input(editor(f), '["other private draft"]');
        f.update(node()); assert.equal(editor(f).value, '{"phrase":');
        const previousInspector = f.host.querySelector('.pc-node-details');
        f.setMounted(false); assert.equal(previousInspector.isConnected, false);
        f.setMounted(true);
        assert.notEqual(f.host.querySelector('.pc-node-details'), previousInspector, 'this is a new instance from the same imported component module');
        assert.equal(editor(f).value, JSON.stringify(savedRules, null, 2));
        assert.equal(editor(f).getAttribute('aria-invalid'), 'false');
        assert.equal(f.host.querySelector('[data-diagnostic]'), null);
        f.update(node(undefined, { address: { ...address, workflowId: 'other-root' } }));
        assert.equal(editor(f).value, JSON.stringify(savedRules, null, 2), 'the other qualified cached draft is also private to the destroyed instance');
        assert.deepEqual(edits, [], 'destroying and mounting inspectors never publishes unsaved edits');
    } finally { await f.close(); }
});

test('a restored draft cannot cross a changed editor contract for the same field', async () => {
    const edits = [], f = await fixture(node(), { editControl: (...args) => { edits.push(args); return { ok: true }; } });
    try {
        input(editor(f), '{"phrase":'); save(f).click(); flushSync();
        f.update(node(undefined, { address: { ...address, workflowId: 'other-root' } }));
        f.update(node(undefined, { revision: 'revision2', controls: [{ key: 'rules', label: 'rules', editor: 'lines', value: ['Current line setting'] }] }));
        assert.equal(editor(f).value, 'Current line setting', 'a JSON draft must not become line data');
        assert.equal(editor(f).getAttribute('aria-invalid'), 'false'); assert.deepEqual(edits, []);
        input(editor(f), 'Unsaved lines');
        f.update(null); f.update(node(undefined, { revision: 'revision3' }));
        assert.equal(editor(f).value, JSON.stringify(savedRules, null, 2), 'line text must not become a JSON-value draft');
        assert.deepEqual(edits, []);
    } finally { await f.close(); }
});

for (const nextAddress of [
    { ...address, workflowId: 'other-root' },
    { ...address, instancePath: ['sibling/part', 'nested|part'] },
    { kind: 'library', definitionRef: { id: 'definition', version: 1, semanticHash: 'pinned' }, nodeId: 'scan' },
]) {
    test(`returning from ${'kind' in nextAddress ? 'a library definition' : nextAddress.workflowId === 'root' ? 'a sibling instance' : 'another root'} expires pending callbacks even at the same revision`, async () => {
        const pending = [], captures = [], f = await fixture(node(), { editControl(captured) { captures.push(captured); return new Promise(resolve => pending.push(resolve)); } });
        try {
            input(editor(f), '["first draft"]'); save(f).click(); flushSync();
            f.update(node(undefined, { address: nextAddress }));
            assert.equal(editor(f).value, JSON.stringify(savedRules, null, 2));
            input(editor(f), '["separate draft"]');
            f.update(node()); assert.equal(editor(f).value, '["first draft"]'); assert.equal(save(f).disabled, false);
            save(f).click(); flushSync(); assert.equal(save(f).disabled, true);
            pending[0]({ ok: true }); await settle();
            assert.equal(editor(f).value, '["first draft"]'); assert.equal(save(f).disabled, true, 'old completion cannot release the newer save');
            pending[1]({ ok: false, error: { code: 'CURRENT', message: 'Current root rejected this draft' } }); await settle();
            assert.equal(f.host.querySelector('[data-diagnostic]').dataset.severity, 'error'); assert.equal(save(f).disabled, false);
            assert.deepEqual(captures.map(capture => capture.address), [address, address]);
            f.update(node(undefined, { address: nextAddress })); assert.equal(editor(f).value, '["separate draft"]');
        } finally { await f.close(); }
    });
}

test('valid JSON and line drafts survive other saves and require their own explicit Save', async () => {
    const f = await savedFixture();
    try {
        const nextRules = [{ id: 'delve', pattern: 'Delve', label: 'Keep this preference' }, { id: 'tapestry', pattern: 'tapestry' }];
        const raw = JSON.stringify(nextRules, null, 4);
        input(editor(f), raw); input(f.host.querySelector('[aria-label="exemptions"]'), 'new exemption\nsecond exemption');
        assert.deepEqual(f.edits, [], 'typing does not autosave');
        toggleCase(f); await settle();
        assert.equal(editor(f).value, raw); assert.equal(f.host.querySelector('[aria-label="exemptions"]').value, 'new exemption\nsecond exemption');
        assert.deepEqual(f.graph().nodes.scan.rules, savedRules); assert.deepEqual(f.graph().nodes.scan.exemptions, ['delve safely']);
        save(f).click(); await settle();
        assert.deepEqual(f.graph().nodes.scan.rules, nextRules); assert.equal(f.host.querySelector('[aria-label="exemptions"]').value, 'new exemption\nsecond exemption');
        assert.deepEqual(f.graph().nodes.scan.exemptions, ['delve safely']);
        f.host.querySelector('[data-save-control="exemptions"]').click(); await settle();
        assert.deepEqual(f.graph().nodes.scan.exemptions, ['new exemption', 'second exemption']);
        assert.deepEqual(f.edits.map(edit => edit.key), ['caseSensitive', 'rules', 'exemptions']);
        assert.doesNotMatch(f.host.textContent, /Saved setting/); assert.match(f.host.textContent, /Canonical rules retain their IDs and labels/);
        assert.deepEqual(f.graph().nodes.scan.protectedLiterals, ['weave']);
    } finally { await f.close(); }
});

for (const oldResult of [{ ok: true }, { ok: false, error: { code: 'OLD_REVISION', message: 'Obsolete validation failure' } }]) {
    test(`revision invalidates pending ${oldResult.ok ? 'success' : 'error'} without deleting retained text or releasing a newer Save`, async () => {
        const pending = [], captures = [];
        const f = await fixture(node(), { editControl(captured) { captures.push(captured); return new Promise(resolve => pending.push(resolve)); } });
        try {
            input(editor(f), '["first"]'); save(f).click(); flushSync(); assert.equal(save(f).disabled, true);
            f.update(node(undefined, { revision: 'revision2' }));
            assert.equal(editor(f).value, '["first"]'); assert.equal(save(f).disabled, false, 'obsolete pending write no longer locks the retained draft');
            assert.equal(pending.length, 1, 'a revision does not retry or autosave');
            input(editor(f), '["second"]'); save(f).click(); flushSync(); assert.equal(save(f).disabled, true);
            assert.deepEqual(captures.map(capture => capture.revision), ['revision1', 'revision2']);
            pending[0](oldResult); await settle();
            assert.equal(editor(f).value, '["second"]'); assert.equal(save(f).disabled, true); assert.doesNotMatch(f.host.textContent, /Obsolete validation failure/);
            pending[1]({ ok: false, error: { code: 'CURRENT', message: 'Current validation failure' } }); await settle();
            assert.equal(editor(f).value, '["second"]'); assert.equal(save(f).disabled, false); assert.equal(f.host.querySelector('[data-diagnostic]').dataset.severity, 'error');
        } finally { await f.close(); }
    });
}

for (const change of [{ selectionKey: 'another-selection' }, { address: { ...address, instancePath: ['other-instance'] } }, { address: { kind: 'library', definitionRef: { id: 'definition', version: 1, semanticHash: 'pinned' }, nodeId: 'scan' } }]) {
    test(`selection identity clears drafts and rejects callbacks after ${'selectionKey' in change ? 'selection' : 'kind' in change.address ? 'library address' : 'qualified address'} changes`, async () => {
        const pending = [];
        const f = await fixture(node(), { editControl() { return new Promise(resolve => pending.push(resolve)); } });
        try {
            input(editor(f), '["private draft"]'); save(f).click(); flushSync();
            const graph = initialGraph(); graph.nodes.scan.rules = [{ id: 'other', pattern: 'other saved value' }];
            f.update(node(graph, change));
            assert.equal(editor(f).value, JSON.stringify(graph.nodes.scan.rules, null, 2)); assert.equal(save(f).disabled, false);
            pending[0]({ ok: false, error: { code: 'OTHER_NODE', message: 'Wrong node validation' } }); await settle();
            assert.equal(editor(f).value, JSON.stringify(graph.nodes.scan.rules, null, 2)); assert.doesNotMatch(f.host.textContent, /Wrong node validation/);
        } finally { await f.close(); }
    });
}
