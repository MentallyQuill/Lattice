import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compiled } from './helpers/svelte-compile.mjs';
import { JSDOM } from 'jsdom';
import { prepareNodeControlChange } from '../src/workflow/ports.js';
import { describeOperation } from '../src/workflow/catalog.js';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLMediaElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);


async function fixture(name, view, actions, prop = 'view') {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-detail-panels-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const leaf = await compiled(name, directory);
        const harness = await compiled(name + 'Harness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions } = $props(); let view = $state.raw(initial); export function update(next) { view = next; }</script><Leaf ${prop}={view} {actions} />`);
        mounted = mount(harness.component, { target: host, props: { initial: view, actions } }); flushSync();
        return { host, update(next) { mounted.update(next); flushSync(); }, async close() { await unmount(mounted); host.remove(); const target = resolve(directory), rel = relative(resolve(tmpdir()), target); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(target, { recursive: true, force: true }); } };
    } catch (error) {
        if (mounted) await unmount(mounted); host.remove(); const rel = relative(resolve(tmpdir()), resolve(directory)); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(directory, { recursive: true, force: true }); throw error;
    }
}
const address = { workflowId: 'root', instancePath: ['instance/one'], nodeId: 'compose' };
const node = extra => ({ selectionKey: JSON.stringify(address), revision: 'revision1', address, title: 'My wording', canonicalTitle: 'Compose', iconPath: 'M3 5h18', family: 'Shaping', phase: 'pre', alias: 'My wording', compact: false, enabled: true, readOnly: false, canPresent: true, model: null, ports: [{ id: 'out', label: 'Output', direction: 'output', kind: 'text' }], controls: [{ key: 'sections', label: 'Sections', editor: 'json', representation: 'json-value', value: [{ name: 'intro', text: 'Hello' }] }], ...extra });
const change = (element, value) => { element.value = value; element.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync(); };
const input = (element, value) => { element.value = value; element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync(); };
const success = () => ({ ok: true });

const boundary = extra => node({ title: 'Scene', canonicalTitle: 'Scene', controls: [], model: null,
    boundary: { id: 'scene', label: 'Scene', direction: 'input', kind: 'context', required: true, kinds: ['context', 'text', 'data'] }, ...extra });

test('boundary drafts retain label and required across roots while unsupported types use the current interface', async () => {
    const edits = [], f = await fixture('NodeDetails', boundary(), { editInterface: (...args) => { edits.push(args); return success(); } });
    try {
        input(f.host.querySelector('[aria-label="Node name"]'), 'Unsaved scene');
        change(f.host.querySelector('[aria-label="Subgraph port type"]'), 'text');
        const required = f.host.querySelector('[aria-label="Required subgraph port"]'); required.checked = false;
        required.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync();
        f.update(boundary({ address: { ...address, workflowId: 'other-root' } }));
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Scene');
        f.update(boundary({ revision: 'revision2' }));
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Unsaved scene');
        assert.equal(f.host.querySelector('[aria-label="Subgraph port type"]').value, 'text');
        assert.equal(f.host.querySelector('[aria-label="Required subgraph port"]').checked, false);
        assert.deepEqual(edits, [], 'restoring boundary fields requires an explicit Save');
        f.update(boundary({ address: { ...address, workflowId: 'other-root' } }));
        f.update(boundary({ revision: 'revision3', boundary: { ...boundary().boundary, kind: 'data', kinds: ['context', 'data'] } }));
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Unsaved scene');
        assert.equal(f.host.querySelector('[aria-label="Subgraph port type"]').value, 'data', 'removed artifact kinds cannot be restored');
        assert.equal(f.host.querySelector('[aria-label="Required subgraph port"]').checked, false);
        f.host.querySelector('[data-save-boundary]').click(); await tick(); flushSync();
        assert.deepEqual(edits[0], [{ selectionKey: JSON.stringify(address), revision: 'revision3', address }, { kind: 'update', id: 'scene', label: 'Unsaved scene', artifactKind: 'data', required: false }]);
    } finally { await f.close(); }
});

test('changing a boundary capability expires its pending acknowledgment and replacing the port discards its draft', async () => {
    const pending = [], original = boundary(), f = await fixture('NodeDetails', original, { editInterface: () => new Promise(resolve => pending.push(resolve)) });
    try {
        input(f.host.querySelector('[aria-label="Node name"]'), 'Pending scene');
        change(f.host.querySelector('[aria-label="Subgraph port type"]'), 'text');
        f.host.querySelector('[data-save-boundary]').click(); flushSync();
        f.update(boundary({ revision: 'revision2', boundary: { ...original.boundary, kind: 'data', kinds: ['context', 'data'] } }));
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Pending scene');
        assert.equal(f.host.querySelector('[aria-label="Subgraph port type"]').value, 'data');
        assert.equal(f.host.querySelector('[data-save-boundary]').disabled, false);
        pending[0](success()); await tick(); flushSync();
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Pending scene', 'the old acknowledgment cannot erase a revalidated draft');
        f.update(boundary({ revision: 'revision3', boundary: { ...original.boundary, id: 'replacement', label: 'Replacement port', direction: 'output' } }));
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Replacement port');
        assert.equal(f.host.querySelector('[aria-label="Subgraph port type"]').value, 'context');
    } finally { await f.close(); }
});

test('boundary details edit the interface port and the Edit menu supplies ordinary deletion', async () => {
    const edits = [], ordinary = [];
    const f = await fixture('NodeDetails', boundary(), {
        editInterface: (captured, edit) => { edits.push([captured, edit]); return success(); },
        duplicate: () => ordinary.push('duplicate'), remove: () => ordinary.push('remove'), editField: () => ordinary.push('field'),
    });
    try {
        const label = f.host.querySelector('[aria-label="Node name"]'); assert.ok(label);
        assert.equal(label.value, 'Scene');
        assert.match(f.host.textContent, /Deleting this node removes its port and attached connections/);
        input(label, 'Story context'); change(f.host.querySelector('[aria-label="Subgraph port type"]'), 'text');
        const required = f.host.querySelector('[aria-label="Required subgraph port"]'); required.checked = false; required.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        flushSync(); f.host.querySelector('[data-save-boundary]').click(); await tick(); flushSync();
        const captured = { selectionKey: JSON.stringify(address), revision: 'revision1', address };
        assert.deepEqual(edits, [[captured, { kind: 'update', id: 'scene', label: 'Story context', artifactKind: 'text', required: false }]]);
        assert.equal(f.host.querySelector('[data-add-boundary], [data-remove-boundary]'), null);
        assert.equal(f.host.querySelector('[aria-label="Enabled"]'), null, 'boundaries are interface declarations rather than enabled operations');
        assert.equal([...f.host.querySelectorAll('button')].some(button => button.textContent === 'Duplicate'), false);
        assert.equal(f.host.querySelector('[aria-label="Node commands"]'), null);
        const menus = await fixture('WorkspaceMenus', { history: {}, selectionActions: { delete: true } }, { command: command => ordinary.push(command) }, 'state');
        try {
            menus.host.querySelector('[data-menu="Edit"]').click(); await tick(); flushSync();
            menus.host.querySelector('[role="menuitem"][aria-label="Delete selection"]').click(); await tick(); flushSync();
            assert.equal(edits.length, 1); assert.deepEqual(ordinary, ['delete-selection']);
        } finally { await menus.close(); }
    } finally { await f.close(); }
});

test('read-only boundary controls reject raw events and interface failures preserve a newer qualified selection', async () => {
    const edits = [], removed = [], pending = [];
    const f = await fixture('NodeDetails', boundary({ readOnly: true }), {
        editInterface: (captured, edit) => { edits.push([captured, edit]); return new Promise(resolve => pending.push(resolve)); },
        remove: (...args) => removed.push(args),
    });
    try {
        const label = f.host.querySelector('[aria-label="Node name"]'); assert.ok(label); assert.equal(label.disabled, true);
        for (const control of f.host.querySelectorAll('[data-boundary-controls] input, [data-boundary-controls] select, [data-boundary-controls] button')) assert.equal(control.disabled, true);
        input(label, 'Forbidden'); change(f.host.querySelector('[aria-label="Subgraph port type"]'), 'text');
        f.host.querySelector('[data-save-boundary]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        const menus = await fixture('WorkspaceMenus', { history: {}, readOnly: true, selectionActions: { delete: false } }, { command: command => removed.push(command) }, 'state');
        try {
            menus.host.querySelector('[data-menu="Edit"]').click(); await tick(); flushSync();
            const deleteButton = menus.host.querySelector('[role="menuitem"][aria-label="Delete selection"]'); assert.equal(deleteButton.disabled, true);
            deleteButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        } finally { await menus.close(); }
        assert.deepEqual(edits, []); assert.deepEqual(removed, []);
        f.update(boundary()); input(f.host.querySelector('[aria-label="Node name"]'), 'First draft');
        f.host.querySelector('[data-save-boundary]').click(); flushSync();
        input(f.host.querySelector('[aria-label="Node name"]'), 'Newer draft');
        pending[0]({ ok: false, error: { code: 'OLD', message: 'Obsolete port error' } }); await tick(); flushSync();
        assert.doesNotMatch(f.host.textContent, /Obsolete port error/); assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Newer draft');
        f.host.querySelector('[data-save-boundary]').click(); flushSync();
        f.update(boundary({ selectionKey: 'sibling-boundary', revision: 'revision2', address: { ...address, instancePath: ['instance/two'] } }));
        pending[1]({ ok: false, error: { code: 'STALE', message: 'Wrong sibling error' } }); await tick(); flushSync();
        assert.doesNotMatch(f.host.textContent, /Wrong sibling error/); assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Scene');
        assert.deepEqual(edits[1][0], { selectionKey: JSON.stringify(address), revision: 'revision1', address });
    } finally { await f.close(); }
});

test('acknowledged boundary saves clear their draft after the synchronous commit revision so Undo restores every field', async () => {
    const original = boundary();
    const f = await fixture('NodeDetails', original, {
        editInterface: (captured, edit) => {
            assert.equal(captured.revision, 'revision1');
            f.update(boundary({ revision: 'saved-revision', title: edit.label, boundary: { ...original.boundary, label: edit.label, kind: edit.artifactKind, required: edit.required } }));
            return success();
        },
    });
    try {
        input(f.host.querySelector('[aria-label="Node name"]'), 'Saved scene');
        change(f.host.querySelector('[aria-label="Subgraph port type"]'), 'text');
        const required = f.host.querySelector('[aria-label="Required subgraph port"]'); required.checked = false; required.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        flushSync(); f.host.querySelector('[data-save-boundary]').click(); await tick(); flushSync();
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Saved scene');
        f.update({ ...original, revision: 'undo-revision' });
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Scene');
        assert.equal(f.host.querySelector('[aria-label="Subgraph port type"]').value, 'context');
        assert.equal(f.host.querySelector('[aria-label="Required subgraph port"]').checked, true);
        f.update(boundary({ revision: 'manager-revision', boundary: { ...original.boundary, label: 'Manager label', kind: 'data', required: false } }));
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Manager label');
        assert.equal(f.host.querySelector('[aria-label="Subgraph port type"]').value, 'data');
        assert.equal(f.host.querySelector('[aria-label="Required subgraph port"]').checked, false);
    } finally { await f.close(); }
});

test('boundary revision changes preserve truly unsaved fields and delayed save acknowledgments cannot clear newer drafts', async () => {
    const original = boundary(), pending = [];
    const f = await fixture('NodeDetails', original, {
        editInterface: (captured, edit) => {
            f.update(boundary({ revision: 'saved-revision', boundary: { ...original.boundary, label: edit.label, kind: edit.artifactKind, required: edit.required } }));
            return new Promise(resolve => pending.push(resolve));
        },
    });
    try {
        input(f.host.querySelector('[aria-label="Node name"]'), 'Unsaved scene');
        change(f.host.querySelector('[aria-label="Subgraph port type"]'), 'text');
        const required = f.host.querySelector('[aria-label="Required subgraph port"]'); required.checked = false; required.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync();
        f.update({ ...original, revision: 'unrelated-revision' });
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Unsaved scene');
        assert.equal(f.host.querySelector('[aria-label="Subgraph port type"]').value, 'text');
        assert.equal(f.host.querySelector('[aria-label="Required subgraph port"]').checked, false);
        f.host.querySelector('[data-save-boundary]').click(); flushSync();
        input(f.host.querySelector('[aria-label="Node name"]'), 'Newer scene');
        change(f.host.querySelector('[aria-label="Subgraph port type"]'), 'data');
        pending[0](success()); await tick(); flushSync();
        f.update({ ...original, revision: 'undo-revision' });
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Newer scene');
        assert.equal(f.host.querySelector('[aria-label="Subgraph port type"]').value, 'data');
        assert.equal(f.host.querySelector('[aria-label="Required subgraph port"]').checked, false);
    } finally { await f.close(); }
});

test('boundary cards have no bespoke actions and support ordinary canvas selection', async () => {
    const bubbled = [];
    const card = { id: 'entry', x: 0, y: 0, w: 260, type: 'subgraph-input', className: 'pc-node', title: 'Story context', titleHint: 'Story context', label: 'Story context', iconPath: 'M1 2', body: null, ports: [], compact: false, hostResult: false, enabled: true, boundary: { direction: 'input', editable: true } };
    const f = await fixture('NodeCard', card, { hoverPin() {}, hostResult() {}, group() {} }, 'card');
    try {
        f.host.addEventListener('pointerdown', () => bubbled.push('pointer drag')); f.host.addEventListener('mousedown', () => bubbled.push('drag')); f.host.addEventListener('click', () => bubbled.push('select'));
        assert.equal(f.host.querySelector('button'), null);
        f.host.querySelector('[data-id="entry"]').click(); assert.deepEqual(bubbled, ['select']);
        f.update({ ...card, boundary: { direction: 'output', editable: false } });
        assert.equal(f.host.querySelector('button'), null);
        f.update({ ...card, boundary: undefined }); assert.equal(f.host.querySelector('[data-boundary-actions]'), null);
    } finally { await f.close(); }
});

test('selected deterministic details keep canonical identity and guard readonly semantic edits separately from presentation', async () => {
    const calls = [];
    const f = await fixture('NodeDetails', node({ readOnly: true }), { present: (...args) => { calls.push(['present', ...args]); return success(); }, editControl: (...args) => { calls.push(['control', ...args]); return success(); }, editField: (...args) => { calls.push(['field', ...args]); return success(); } });
    try {
        assert.match(f.host.textContent, /Compose/); assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'My wording');
        assert.equal(f.host.querySelector('[data-model-controls]'), null);
        assert.equal(f.host.querySelector('[aria-label="Sections"]').disabled, true);
        change(f.host.querySelector('[aria-label="Node name"]'), 'Alias two');
        assert.equal(calls.length, 1); assert.deepEqual(calls[0], ['present', { selectionKey: JSON.stringify(address), revision: 'revision1', address }, 'alias', 'Alias two']);
        input(f.host.querySelector('[aria-label="Sections"]'), '[]'); f.host.querySelector('[data-save-control="sections"]').click();
        assert.equal(calls.length, 1, 'raw events cannot bypass readonly semantic guard');
        f.update(node({ readOnly: true, canPresent: false })); change(f.host.querySelector('[aria-label="Node name"]'), 'blocked');
        assert.equal(calls.length, 1, 'presentation permission has its own guard');
    } finally { await f.close(); }
});

test('model controls honor producer allowed modes and show inherited effective binding separately', async () => {
    const calls = [], inherit = { value: 'inherit', label: 'Use role binding' }, override = { value: 'override', label: 'Override' };
    const model = { role: 'Analysis', roleEditable: true, effective: 'Reasoner · profile model', source: 'Instance role override', profile: { mode: 'inherit', allowedModes: [inherit, override], value: null, options: [{ value: 'profileA', label: 'Reasoner' }] }, model: { mode: 'block', allowedModes: [inherit, override, { value: 'block', label: 'Block inheritance' }], value: null } };
    const f = await fixture('NodeDetails', node({ canonicalTitle: 'Response Plan', model }), { editBinding: (...args) => { calls.push(args); return success(); }, editField: success });
    try {
        assert.match(f.host.textContent, /Effective connection: Reasoner · profile model/); assert.match(f.host.textContent, /Instance role override/);
        assert.equal(f.host.querySelector('[aria-label="Connection mode"]'),null);
        assert.equal(f.host.querySelector('[aria-label="Connection profile"]'),null);
        assert.equal(f.host.querySelector('[data-reset-profile]').disabled,true);
        assert.equal(f.host.querySelector('[aria-label="Model mode"]').value,'block');
        change(f.host.querySelector('[aria-label="Model mode"]'),'inherit');await tick();flushSync();
        assert.deepEqual(calls[0],[{selectionKey:JSON.stringify(address),revision:'revision1',address},'model','inherit',null]);
        f.update(node({model,readOnly:true}));change(f.host.querySelector('[aria-label="Model mode"]'),'inherit');assert.equal(calls.length,1);
        f.update(node({ model: null })); assert.equal(f.host.querySelector('[data-model-controls]'), null);
    } finally { await f.close(); }
});

test('shared instance bindings can be configured while authored node controls remain read-only', async () => {
    const calls = [], allowedModes = [{ value: 'inherit', label: 'Inherit role' }, { value: 'override', label: 'Override' }];
    const model = { role: 'Analysis', roleEditable: true, editable: true, effective: 'Inherited connection', source: 'Containing instance', profile: { mode: 'override', allowedModes, value: 'profileA', options: [{ value: 'profileA', label: 'Reasoner' }] }, model: { mode: 'inherit', allowedModes, value: null } };
    const view = node({ controls: [], readOnly: true, model });
    const f = await fixture('NodeDetails', view, { editBinding: (...args) => { calls.push(['binding', ...args]); return success(); }, editField: (...args) => { calls.push(['field', ...args]); return success(); } });
    try {
        const reset=f.host.querySelector('[data-reset-profile]');assert.equal(reset.disabled,false);reset.click();await tick();flushSync();
        assert.deepEqual(calls,[['binding',{selectionKey:JSON.stringify(address),revision:'revision1',address},'profileId','inherit',null]]);
        const role = f.host.querySelector('[aria-label="Model role"]');
        assert.equal(role.disabled, true); change(role, 'Forbidden role');
        assert.equal(calls.length, 1, 'binding authority does not grant authored field edits');
        f.update(node({ ...view, revision: 'library', model: { ...model, editable: false } }));
        assert.equal(f.host.querySelector('[data-reset-profile]').disabled,true);f.host.querySelector('[data-reset-profile]').click();
        change(f.host.querySelector('[aria-label="Model mode"]'), 'override');
        assert.equal(f.host.querySelector('[aria-label="Model identifier"]'), null);
        assert.equal(calls.length, 1, 'a revoked binding capability also rejects raw events');
    } finally { await f.close(); }
});

test('shared model controls distinguish the definition model from an explicit profile default', async () => {
    const calls = [], inherited = { value: 'inherit', label: 'Use definition model' }, override = { value: 'override', label: 'Override' }, profileDefault = { value: 'block', label: 'Use profile model' };
    const model = { role: 'Analysis', roleEditable: false, editable: true, profileDefaultModel: true, effective: 'Saved connection · saved-model', source: 'Definition', profile: { mode: 'inherit', allowedModes: [{ value: 'inherit', label: 'Use definition binding' }, override], value: null, effectiveValue: 'profileA', options: [{ value: 'profileA', label: 'Saved connection' }] }, model: { mode: 'inherit', allowedModes: [inherited, override, profileDefault], value: null, effectiveValue: 'saved-model' } };
    const view = node({ controls: [], readOnly: true, model });
    const f = await fixture('NodeDetails', view, { editBinding: (...args) => { calls.push(args); return success(); } });
    try {
        const mode = () => f.host.querySelector('[aria-label="Model mode"]');
        assert.equal(mode().selectedOptions[0].textContent, 'Use definition model');
        assert.equal(f.host.querySelector('[data-reset-profile]').textContent,'Use definition connection');assert.equal(f.host.querySelector('[data-reset-profile]').disabled,true);
        change(mode(), 'inherit'); assert.equal(calls.length, 0, 'the untouched definition has no instance override to reset');
        change(mode(), 'block'); await tick(); flushSync();
        assert.deepEqual(calls[0].slice(1), ['model', 'block', null]);
        f.update(node({ ...view, revision: 'profile-default', model: { ...model, model: { ...model.model, mode: 'block', effectiveValue: null } } }));
        assert.equal(mode().selectedOptions[0].textContent, 'Use profile model');
        change(mode(), 'inherit'); await tick(); flushSync();
        assert.deepEqual(calls[1].slice(1), ['model', 'inherit', null], 'resetting is distinct from saving a profile default');
    } finally { await f.close(); }
});

test('model role dispatch rechecks the current role capability in editable bodies and after reactive removal', async () => {
    const calls = [], inherit = { value: 'inherit', label: 'Use role binding' };
    const model = { role: 'Analysis', roleEditable: false, effective: 'Reasoner', source: 'Root role', profile: { mode: 'inherit', allowedModes: [inherit], value: null }, model: { mode: 'inherit', allowedModes: [inherit], value: null } };
    const f = await fixture('NodeDetails', node({ readOnly: false, model }), { editField: (...args) => { calls.push(args); return success(); } });
    try {
        const role = f.host.querySelector('[aria-label="Model role"]');
        assert.equal(role.disabled, true); change(role, 'Forbidden role');
        assert.equal(calls.length, 0, 'an editable body does not grant a noneditable model role');
        f.update(node({ readOnly: false, model: { ...model, roleEditable: true } }));
        assert.equal(role.disabled, false); change(role, 'Allowed role');
        assert.deepEqual(calls, [[{ selectionKey: JSON.stringify(address), revision: 'revision1', address }, 'modelRole', 'Allowed role']]);
        f.update(node({ readOnly: false, model }));
        assert.equal(f.host.querySelector('[aria-label="Model role"]'), role, 'reactive permission update retains the mounted input');
        assert.equal(role.disabled, true); change(role, 'Revoked role');
        assert.equal(calls.length, 1, 'the handler checks current capability after it is removed');
        f.update(node({ model: null })); assert.equal(f.host.querySelector('[aria-label="Model role"]'), null); assert.equal(calls.length, 1);
    } finally { await f.close(); }
});

test('JSON drafts preserve connected pins on complete-candidate rejection and raw schema text is never converted to an object', async () => {
    const graph = { id: 'root', schema: 3, runtime: 2, mode: 'native-pre', definitions: {}, portals: {}, nodes: { source: { id: 'source', type: 'workflow', operation: 'compose' }, compose: { id: 'compose', type: 'workflow', operation: 'compose', sections: [{ name: 'intro', text: 'Hello' }], model: 'portable-model' } }, wires: { edge: { id: 'edge', route: 'wire', from: 'source', fromPort: 'out', to: 'compose', toPort: 'section.intro' } } };
    const before = structuredClone(graph), values = [];
    const f = await fixture('NodeDetails', node(), { editControl: (captured, key, value) => { values.push(value); const prepared = prepareNodeControlChange(graph, { nodeId: captured.address.nodeId, controls: { [key]: value } }); return prepared.ok ? success() : prepared; } });
    try {
        input(f.host.querySelector('[aria-label="Sections"]'), '{broken'); f.host.querySelector('[data-save-control="sections"]').click(); flushSync();
        assert.equal(values.length, 0); assert.match(f.host.textContent, /valid JSON/);
        input(f.host.querySelector('[aria-label="Sections"]'), '[]'); f.host.querySelector('[data-save-control="sections"]').click(); await tick(); flushSync();
        assert.deepEqual(values, [[]]); assert.match(f.host.querySelector('[data-diagnostic]').textContent, /port|endpoint/i);
        assert.equal(f.host.querySelector('[aria-label="Sections"]').value, '[]'); assert.deepEqual(graph, before, 'rejected draft cannot mutate source graph, bindings or connected pins');
        const text = '  {"type":"object","required":["name"]}  ';
        f.update(node({ revision: 'schema-revision', canonicalTitle: 'JSON Decode', controls: [{ key: 'schema', label: 'Schema', editor: 'json', representation: 'json-text', allowEmpty: true, value: '' }] }));
        input(f.host.querySelector('[aria-label="Schema"]'), text); f.host.querySelector('[data-save-control="schema"]').click(); await tick(); flushSync();
        assert.equal(values.at(-1), text, 'raw JSON schema whitespace/string representation is preserved');
        input(f.host.querySelector('[aria-label="Schema"]'), ''); f.host.querySelector('[data-save-control="schema"]').click(); await tick(); flushSync(); assert.equal(values.at(-1), '', 'empty optional schema remains valid JSON-text setting');
    } finally { await f.close(); }
});

test('obsolete validation responses cannot leak into a new draft or qualified selection', async () => {
    const pending = [], captures = [];
    const f = await fixture('NodeDetails', node(), { editControl: (captured, key, value) => { captures.push(captured); return new Promise(resolve => pending.push(resolve)); } });
    try {
        input(f.host.querySelector('[aria-label="Sections"]'), '[]'); f.host.querySelector('[data-save-control="sections"]').click();
        input(f.host.querySelector('[aria-label="Sections"]'), '[{"name":"new","text":"New draft"}]');
        pending[0]({ ok: false, error: { code: 'OLD_ERROR', message: 'Old failure' } }); await tick(); flushSync();
        assert.doesNotMatch(f.host.textContent, /Old failure/); assert.match(f.host.querySelector('[aria-label="Sections"]').value, /New draft/);
        f.host.querySelector('[data-save-control="sections"]').click();
        const changed = node({ selectionKey: 'sibling', revision: 'revision2', address: { ...address, instancePath: ['instance/two'] }, controls: [{ key: 'sections', label: 'Sections', editor: 'json', representation: 'json-value', value: [] }] });
        f.update(changed); pending[1]({ ok: false, error: { code: 'STALE', message: 'Wrong sibling failure' } }); await tick(); flushSync();
        assert.deepEqual(captures[1], { selectionKey: JSON.stringify(address), revision: 'revision1', address });
        assert.doesNotMatch(f.host.textContent, /Wrong sibling failure/); assert.equal(f.host.querySelector('[aria-label="Sections"]').value, '[]');
    } finally { await f.close(); }
});

const terminal = nodeId => ({ kind: 'terminal', address: { workflowId: 'root', instancePath: [], nodeId } });
const selector = nodeId => ({ handleId: 'opaque-' + nodeId, runId: 'run-one', terminal: terminal(nodeId) });
const preview = extra => ({ sourceKey: 'source-one', title: 'Apply Reply', status: 'current', choices: [{ key: 'applyA', label: 'First host result', kind: 'candidate', target: terminal('applyA') }, { key: 'applyB', label: 'Second host result', kind: 'candidate', target: terminal('applyB') }], selectedKey: null, pinned: false, followSelection: true, sections: [{ id: 'candidate', label: 'Recorded candidate', kind: 'candidate', text: 'Bounded recorded preview', format: 'structured-text', truncated: true }], issues: [], busy: false, runHere: { enabled: true, callBound: 2 }, review: { selector: selector('applyA'), canApply: true, fresh: true, selectedRootTerminal: true, mode: 'root' }, ...extra });

test('preview requires an explicit matching root terminal and never turns recorded text or target runs into Apply authority', async () => {
    const applied = [], runs = [];
    const f = await fixture('OutputPreview', preview(), { runHere: (...args) => runs.push(args), apply: value => applied.push(value) });
    try {
        const apply = () => f.host.querySelector('[data-preview-apply]');
        assert.equal(apply().disabled, true, 'multiple terminals require explicit selection');
        assert.match(f.host.textContent, /display limit does not mean the model stopped early/);
        assert.equal(f.host.querySelector('select'), null, 'preview follows the target selected on the canvas');
        f.update(preview({ selectedKey: 'applyB' })); assert.equal(apply().disabled, true, 'selected terminal must match the opaque handle');
        f.update(preview({ selectedKey: 'applyA' })); assert.equal(apply().disabled, false); apply().click(); assert.deepEqual(applied, [selector('applyA')]); assert.equal('text' in applied[0], false);
        f.host.querySelector('[data-run-here]').click(); assert.deepEqual(runs, [['source-one', terminal('applyA')]]); assert.match(f.host.querySelector('[data-run-here]').textContent, /maximum 2 requests/);
        for (const extra of [{ status: 'stale' }, { status: 'removed' }, { review: { ...preview().review, mode: 'target' } }, { review: { ...preview().review, fresh: false } }, { busy: true }]) {
            f.update(preview({ selectedKey: 'applyA', ...extra })); assert.equal(apply().disabled, true); apply().click();
        }
        assert.equal(applied.length, 1, 'disabled or obsolete review states dispatch no apply');
    } finally { await f.close(); }
});

test('hierarchical run details retain stable rows, supplied primitive counters and truthful unknown usage with explicit navigation', async () => {
    const jumps = [];
    const row = (key, title, kind, depth, status) => ({ key, title, kind, depth, status, address: { workflowId: 'root', instancePath: depth ? ['subgraph'] : [], nodeId: key }, durationMs: null, attempts: 0, callBound: 0, usage: null });
    const view = { runId: 'run-details', status: 'failed', elapsedMs: null, actualCalls: 1, callBound: 2, completedCount: 1, executableCount: 3, rows: [row('subgraph', 'Formatting stack', 'instance', 0, 'failed'), { ...row('failed', 'Text Rules', 'primitive', 1, 'failed'), issue: 'RULE_WORKER_TIMEOUT: Rule exceeded deadline' }, row('blocked', 'JSON Decode', 'primitive', 1, 'blocked'), { ...row('complete', 'Independent plan', 'primitive', 0, 'completed'), durationMs: 1250, attempts: 1, callBound: 2, usage: { inputTokens: 300, outputTokens: 42, totalTokens: null, cost: null } }] };
    const f = await fixture('RunDetails', view, { jump: (...args) => jumps.push(args) });
    try {
        assert.match(f.host.textContent, /1 of 3 stages complete/); assert.match(f.host.textContent, /1 of 2 requests/);
        assert.deepEqual([...f.host.querySelectorAll('[data-run-row]')].map(row => row.dataset.runRow), ['subgraph', 'failed', 'blocked', 'complete']);
        assert.equal(f.host.querySelector('[data-run-row="failed"]').dataset.depth, '1');
        assert.match(f.host.textContent, /Elapsed: Unknown/); assert.match(f.host.textContent, /Input tokens: 300/); assert.match(f.host.textContent, /Total tokens: Unknown/); assert.match(f.host.textContent, /Cost: Unknown/); assert.match(f.host.textContent, /1\.25s/);
        assert.equal(jumps.length, 0, 'rendering never steals selection or navigation');
        f.host.querySelector('[aria-label="Open Text Rules in graph"]').click();
        assert.deepEqual(jumps, [['run-details', view.rows[1].address]]);
        f.update({ ...view, status: 'cancelled', rows: view.rows.map(row => ({ ...row, status: 'cancelled' })) });
        assert.equal(jumps.length, 1, 'state feedback does not navigate implicitly');
    } finally { await f.close(); }
});

test('catalog-described primitive controls stay ordinary explicit editors with no model or run effects', async () => {
    const f = await fixture('NodeDetails', null, {});
    try {
        for (const [operation, settings] of [['compose', { sections: [{ name: 'intro', text: 'Hello' }] }], ['text-rules', { rules: [{ kind: 'literal', pattern: 'very', replacement: '' }] }], ['json-decode', { schema: '' }], ['select-fields', { fields: [{ name: 'name', path: ['name'] }] }], ['context-join', { inputs: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }] }], ['smart-compactor', { method: 'select' }], ['pattern-scan', {}]]) {
            const phase = operation === 'pattern-scan' ? 'post' : 'pre';
            const work = { id: 'work', type: 'workflow', operation, operationVersion: 1, ...settings };
            const g = { id: 'root', schema: 3, runtime: 2, mode: 'native-' + phase, nodes: { work }, wires: {}, definitions: {}, portals: {} };
            const result = describeOperation(g, work); assert.equal(result.ok, true, JSON.stringify(result));
            const { descriptor, ports } = result.data;
            const controls = descriptor.controls.map(key => {
                const d = descriptor.controlDescriptors[key], value = work[key] === undefined ? descriptor.defaults[key] : work[key];
                return { key, label: d.label ?? key, value, editor: d.type === 'enum' ? 'enum' : d.type === 'boolean' ? 'boolean' : d.type === 'integer' ? 'number' : d.editor === 'json' || d.type === 'array' ? 'json' : 'text', ...(d.type === 'enum' ? { options: d.values.map(value => ({ value, label: value })) } : {}), ...(d.type === 'integer' ? { min: d.min, max: d.max } : {}), ...(d.editor === 'json' || d.type === 'array' ? { representation: d.type === 'string' ? 'json-text' : 'json-value', allowEmpty: d.type === 'string' } : {}) };
            });
            f.update(node({ revision: operation, canonicalTitle: descriptor.title, controls, ports }));
            assert.match(f.host.textContent, new RegExp('Canonical type: ' + descriptor.title));
            assert.equal(f.host.querySelector('[data-model-controls]'), null);
            for (const control of controls) {
                const editor = f.host.querySelector('[aria-label="' + control.label + '"]'); assert.ok(editor, operation + '/' + control.key);
                if (control.editor === 'json') assert.equal(editor.value, control.representation === 'json-text' ? control.value : JSON.stringify(control.value, null, 2));
            }
            if (operation === 'context-join') assert.doesNotMatch(f.host.textContent, /Edit inputs inside/, 'actual body editor is not confused with the exposed-parameter picker');
        }
    } finally { await f.close(); }
});

test('recording preview preserves actual output addresses, artifact kinds and removed pinned source without implicit requests', async () => {
    const calls = [], output = { workflowId: 'root', instancePath: ['first/sibling', 'nested|part'], nodeId: 'decode', portId: 'data/output' };
    const choices = [{ key: 'data', label: 'Decoded data', kind: 'data', target: output }, { key: 'text', label: 'Source text', kind: 'text', target: { ...output, portId: 'text/output' } }];
    const f = await fixture('OutputPreview', preview({ choices, selectedKey: 'data', review: null, sections: [{ id: 'data', label: 'Output', kind: 'data', format: 'json-prefix-text', text: '{"value":"partial', truncated: true }, { id: 'missing', label: 'Input', kind: 'text', format: 'omitted', text: 'Artifact omitted: recording-byte-limit', truncated: false }] }), { pin: (...args) => calls.push(['pin', ...args]), follow: () => calls.push(['follow']), runHere: (...args) => calls.push(['run', ...args]), select: (...args) => calls.push(['select', ...args]) });
    try {
        assert.equal(calls.length, 0); assert.equal(f.host.querySelector('[data-preview-apply]'), null);
        assert.equal(f.host.querySelector('[data-artifact-kind="data"] pre').textContent, '{"value":"partial'); assert.match(f.host.textContent, /JSON prefix is shown as text/); assert.ok(f.host.querySelector('[data-diagnostic]'));
        f.host.querySelector('button[aria-pressed="false"]').click(); assert.deepEqual(calls[0], ['pin', 'source-one', output]);
        f.update(preview({ choices, selectedKey: 'data', review: null, pinned: true, followSelection: false, status: 'removed', statusDetail: 'Pinned source was removed. Recording preserved.' }));
        assert.match(f.host.textContent, /Source removed/); assert.match(f.host.textContent, /Recording preserved/); assert.equal(f.host.querySelector('[data-run-here]').disabled, true);
        f.host.querySelector('[data-run-here]').click(); assert.equal(calls.length, 1);
        const pin = f.host.querySelector('[aria-label="Pin preview"]'); assert.equal(pin.getAttribute('aria-pressed'), 'true');
        pin.click(); assert.deepEqual(calls[1], ['follow']);
    } finally { await f.close(); }
});

test('reject addresses the explicitly selected terminal rather than an unrelated retained selector', async () => {
    const rejected = [];
    const f = await fixture('OutputPreview', preview({ selectedKey: 'applyB' }), { reject: value => rejected.push(value) });
    try {
        const button = () => [...f.host.querySelectorAll('button')].find(button => button.textContent === 'Reject reply');
        assert.equal(button().disabled, true); button().click(); assert.equal(rejected.length, 0);
        f.update(preview({ selectedKey: 'applyA', status: 'stale' })); assert.equal(button().disabled, false); button().click(); assert.deepEqual(rejected, [selector('applyA')]);
    } finally { await f.close(); }
});


test('the identity editor clears a canonical alias and disabled nodes expose Blocks run without inspector presentation switches', async () => {
    const calls = [], f = await fixture('NodeDetails', node({ enabled: false, familyColor: 'var(--pc-family-shaping)' }), { present: (...args) => { calls.push(args); return success(); }, duplicate() {}, remove() {} });
    try {
        const name = f.host.querySelector('header [aria-label="Node name"]');
        assert.ok(name, 'the editable identity belongs to the header');
        assert.equal(name.value, 'My wording');
        assert.match(f.host.textContent, /Blocks run/);
        assert.equal(f.host.querySelector('[aria-label="Compact card"], [aria-label="Enabled"]'), null);
        assert.equal(f.host.querySelector('footer'), null);
        assert.equal([...f.host.querySelectorAll('legend')].some(legend => legend.textContent === 'Presentation'), false);
        change(name, 'Compose'); await tick(); flushSync();
        assert.deepEqual(calls, [[{ selectionKey: JSON.stringify(address), revision: 'revision1', address }, 'alias', '']]);
        f.update(node({ alias: '', title: 'Compose' }));
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Compose');
        assert.equal(f.host.querySelector('[data-canonical-title]'), null, 'canonical names are not duplicated');
    } finally { await f.close(); }
});

test('primary controls precede collapsed purpose groups, and only changed provenance is shown', async () => {
    const f = await fixture('NodeDetails', node({ controls: [
        { key: 'instructions', label: 'Instructions', editor: 'text', value: 'Write clearly', group: 'Main', effective: 'Write clearly', source: 'Saved setting' },
        { key: 'count', label: 'Count', editor: 'number', value: 2, min: 0, max: 10, group: 'Limits', effective: '3', source: 'Effective instance override' },
        { key: 'style', label: 'Style', editor: 'enum', value: 'plain', options: [{ value: 'plain', label: 'Plain' }, { value: 'formal', label: 'Formal' }], group: 'Advanced', advanced: true, exposureNote: 'Inherited from enclosing instance' },
    ] }), { editControl: success });
    try {
        assert.equal(f.host.querySelector('[aria-label="Instructions"]').closest('details'), null);
        const limits = f.host.querySelector('[data-control-group="Limits"]');
        assert.ok(limits); assert.equal(limits.open, false); assert.match(limits.querySelector('summary').textContent, /Limits/);
        assert.equal(f.host.querySelector('[aria-label="Count"]'), null, 'collapsed advanced controls mount when opened');
        limits.querySelector('summary').click(); flushSync(); await tick();
        assert.equal(f.host.querySelector('[aria-label="Count"]').closest('details'), limits);
        f.host.querySelector('[data-control-group="Advanced"] summary').click(); flushSync(); await tick();
        assert.equal(f.host.querySelector('[aria-label="Instructions"]').compareDocumentPosition(limits) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
        assert.doesNotMatch(f.host.textContent, /Effective: Write clearly|Saved setting/);
        assert.match(f.host.textContent, /Effective: 3/);
        assert.match(f.host.textContent, /Inherited from enclosing instance/);
    } finally { await f.close(); }
});

test('advanced model settings start collapsed and retain optional model drafts', async () => {
    const inherit = { value: 'inherit', label: 'Inherit role' }, override = { value: 'override', label: 'Override' };
    const model = { role: 'Analysis', roleEditable: true, effective: 'Reasoner · saved-model', source: 'Containing role', profile: { mode: 'inherit', allowedModes: [inherit, override], value: null }, model: { mode: 'inherit', allowedModes: [inherit, override], value: null } };
    const edits = [], f = await fixture('NodeDetails', node({ model }), { editBinding: (...args) => { edits.push(args); return success(); } });
    try {
        const group = f.host.querySelector('[data-model-controls]');
        assert.equal(group.tagName, 'DETAILS'); assert.equal(group.open, false);
        assert.equal(group.querySelector('[aria-label="Connection profile"]'),null);
        assert.equal(group.querySelector('[data-binding-advanced]'),null);
        assert.equal(group.querySelector('summary').textContent,'Advanced model settings');
        group.open=true;change(f.host.querySelector('[aria-label="Model mode"]'), 'override');
        assert.equal(edits.length, 0); assert.equal(group.open, true, 'the opened advanced panel keeps its staged override editor visible');
        f.update(node({ revision: 'issue', model: { ...model, issue: 'Choose a connection to run.' } }));
        assert.equal(group.open, true); assert.match(f.host.querySelector('[data-diagnostic]').textContent, /Choose a connection to run/);
    } finally { await f.close(); }
});


const modifierOptions = [
    { type: 'trim', label: 'Trim', defaultSettings: Object.freeze({ edges: 'both' }), fields: [{ key: 'edges', label: 'Edges', value: 'both', editor: 'enum', options: [{ value: 'both', label: 'Both' }, { value: 'start', label: 'Start' }, { value: 'end', label: 'End' }] }] },
    { type: 'wrap', label: 'Wrap', defaultSettings: Object.freeze({ prefix: '', suffix: '' }), fields: [{ key: 'prefix', label: 'Prefix', editor: 'text', value: '' }, { key: 'suffix', label: 'Suffix', editor: 'text', value: '' }] },
    { type: 'replace', label: 'Replace', defaultSettings: Object.freeze({ pattern: 'text', replacement: '', caseSensitive: true, occurrence: 'all' }), fields: [{ key: 'pattern', label: 'Find', editor: 'text', value: 'text' }, { key: 'replacement', label: 'Replace with', editor: 'text', value: '' }] },
];
const modifier = (id, type, settings, enabled = true) => ({ id, type, version: 1, enabled, settings });
const modifierView = (items = [], extra = {}) => node({ modifiers: { items, options: modifierOptions, editable: true, outputPortId: 'out' }, ...extra });
const toggle = (element, value) => { element.checked = value; element.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync(); };

test('eligible text modifiers quick toggles add immutable defaults and retain disabled entries', async () => {
    const edits = []; let revision = 1, current = modifierView();
    const f = await fixture('NodeDetails', current, { editModifiers: (captured, items) => { edits.push([captured, items]); current = modifierView(structuredClone(items), { revision: 'saved-' + ++revision }); f.update(current); return success(); } });
    try {
        assert.ok(f.host.querySelector('[data-modifier-controls]'));
        toggle(f.host.querySelector('[aria-label="Trim output"]'), true); await tick(); flushSync();
        assert.equal(edits.length, 1); const first = edits[0][1][0];
        assert.match(first.id, /^[A-Za-z0-9_-]{1,64}$/);
        assert.deepEqual({ ...first, id: 'checked' }, { id: 'checked', type: 'trim', version: 1, enabled: true, settings: { edges: 'both' } });
        assert.notEqual(first.settings, modifierOptions[0].defaultSettings);
        toggle(f.host.querySelector('[aria-label="Trim output"]'), false); await tick(); flushSync();
        assert.equal(current.modifiers.items.length, 1); assert.equal(current.modifiers.items[0].id, first.id); assert.equal(current.modifiers.items[0].enabled, false);
        assert.match(f.host.textContent, /Disabled/);
        toggle(f.host.querySelector('[aria-label="Wrap output"]'), true); await tick(); flushSync();
        assert.equal(current.modifiers.items.length, 2); assert.notEqual(current.modifiers.items[0].id, current.modifiers.items[1].id);
        assert.deepEqual(modifierOptions[1].defaultSettings, { prefix: '', suffix: '' });
        f.update(node()); assert.equal(f.host.querySelector('[data-modifier-controls]'), null, 'unsupported outputs have no modifier tray');
    } finally { await f.close(); }
});

test('modifier order, enabled and removal actions submit the complete ordered stack', async () => {
    const edits = [], initial = [modifier('trim-a', 'trim', { edges: 'start' }), modifier('wrap-a', 'wrap', { prefix: '<', suffix: '>' })];
    let current = modifierView(initial), revision = 1;
    const f = await fixture('NodeDetails', current, { editModifiers: (captured, items) => { edits.push(items); current = modifierView(structuredClone(items), { revision: 'saved-' + ++revision }); f.update(current); return success(); } });
    try {
        assert.equal(f.host.querySelector('[aria-label="Move Trim up"]').disabled, true);
        f.host.querySelector('[aria-label="Move Wrap up"]').click(); await tick(); flushSync();
        assert.deepEqual(edits[0].map(item => item.id), ['wrap-a', 'trim-a']);
        assert.deepEqual(edits[0][0].settings, { prefix: '<', suffix: '>' });
        toggle(f.host.querySelector('[aria-label="Enable Wrap modifier"]'), false); await tick(); flushSync();
        assert.equal(edits[1][0].enabled, false); assert.equal(edits[1][0].id, 'wrap-a');
        f.host.querySelector('[aria-label="Remove Wrap modifier"]').click(); await tick(); flushSync();
        assert.deepEqual(edits[2], [initial[0]]);
        change(f.host.querySelector('[aria-label="Add text modifier"]'), 'replace'); await tick(); flushSync();
        assert.deepEqual(edits[3].map(item => item.type), ['trim', 'replace']);
        assert.deepEqual(edits[3][1].settings, { pattern: 'text', replacement: '', caseSensitive: true, occurrence: 'all' });
    } finally { await f.close(); }
});

test('modifier settings stage both fields for explicit validation, then acknowledged revisions let undo restore values', async () => {
    const edits = [], original = [modifier('wrap-a', 'wrap', { prefix: '<', suffix: '>' })]; let revision = 1;
    const f = await fixture('NodeDetails', modifierView(original), { editModifiers: (captured, items) => { edits.push(items); f.update(modifierView(structuredClone(items), { revision: 'saved-' + ++revision })); return success(); } });
    try {
        input(f.host.querySelector('[aria-label="Wrap Prefix"]'), '['); input(f.host.querySelector('[aria-label="Wrap Suffix"]'), ']');
        assert.equal(edits.length, 0); assert.deepEqual(original[0].settings, { prefix: '<', suffix: '>' });
        f.host.querySelector('[aria-label="Save Wrap settings"]').click(); await tick(); flushSync();
        assert.deepEqual(edits, [[modifier('wrap-a', 'wrap', { prefix: '[', suffix: ']' })]]);
        f.update(modifierView(original, { revision: 'undo' }));
        assert.equal(f.host.querySelector('[aria-label="Wrap Prefix"]').value, '<'); assert.equal(f.host.querySelector('[aria-label="Wrap Suffix"]').value, '>');
    } finally { await f.close(); }
});

test('modifier validation errors and drafts survive unrelated revisions and qualified navigation', async () => {
    const pending = [], items = [modifier('wrap-a', 'wrap', { prefix: '<', suffix: '>' })];
    const f = await fixture('NodeDetails', modifierView(items), { editModifiers: () => new Promise(resolve => pending.push(resolve)) });
    try {
        input(f.host.querySelector('[aria-label="Wrap Prefix"]'), 'Unsaved'); f.host.querySelector('[aria-label="Save Wrap settings"]').click();
        pending[0]({ ok: false, error: { code: 'INVALID', message: 'Rejected complete stack' } }); await tick(); flushSync();
        assert.equal(f.host.querySelector('[data-diagnostic]').dataset.severity, 'error');
        f.update(modifierView(items, { revision: 'unrelated' })); assert.equal(f.host.querySelector('[aria-label="Wrap Prefix"]').value, 'Unsaved'); assert.equal(f.host.querySelector('[data-diagnostic]').dataset.severity, 'error');
        f.update(modifierView(items, { address: { ...address, workflowId: 'other-root' } })); assert.equal(f.host.querySelector('[aria-label="Wrap Prefix"]').value, '<');
        f.update(modifierView(items, { revision: 'return' })); assert.equal(f.host.querySelector('[aria-label="Wrap Prefix"]').value, 'Unsaved'); assert.equal(f.host.querySelector('[data-diagnostic]').dataset.severity, 'error');
        f.host.querySelector('[aria-label="Save Wrap settings"]').click(); input(f.host.querySelector('[aria-label="Wrap Prefix"]'), 'Newer');
        pending[1](success()); await tick(); flushSync();
        assert.equal(f.host.querySelector('[aria-label="Wrap Prefix"]').value, 'Newer');
    } finally { await f.close(); }
});

test('modifier semantic permissions reject raw events and the bounded tray cannot append a seventeenth entry', async () => {
    const edits = [], items = [modifier('wrap-a', 'wrap', { prefix: '<', suffix: '>' })];
    const f = await fixture('NodeDetails', modifierView(items, { readOnly: true }), { editModifiers: (...args) => { edits.push(args); return success(); } });
    try {
        for (const control of f.host.querySelectorAll('[data-modifier-controls] input, [data-modifier-controls] select, [data-modifier-controls] textarea, [data-modifier-controls] button')) assert.equal(control.disabled, true);
        toggle(f.host.querySelector('[aria-label="Trim output"]'), true); input(f.host.querySelector('[aria-label="Wrap Prefix"]'), 'Forbidden');
        f.host.querySelector('[aria-label="Save Wrap settings"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        f.host.querySelector('[aria-label="Remove Wrap modifier"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        assert.deepEqual(edits, []);
        f.update(modifierView(items, { modifiers: { items, options: modifierOptions, editable: false, outputPortId: 'out' } })); toggle(f.host.querySelector('[aria-label="Trim output"]'), true); assert.deepEqual(edits, []);
        const full = Array.from({ length: 16 }, (_, index) => modifier('trim-' + index, 'trim', { edges: 'both' }));
        f.update(modifierView(full)); assert.equal(f.host.querySelector('[aria-label="Add text modifier"]').disabled, true); assert.equal(f.host.querySelector('[aria-label="Wrap output"]').disabled, true);
        change(f.host.querySelector('[aria-label="Add text modifier"]'), 'replace'); toggle(f.host.querySelector('[aria-label="Wrap output"]'), true); assert.deepEqual(edits, []);
    } finally { await f.close(); }
});

test('short choices are keyboard native segmented radios while longer enums retain a dropdown', async () => {
    const edits = [], controls = [
        { key: 'style', label: 'Style', editor: 'enum', value: 'plain', options: [{ value: 'plain', label: 'Plain' }, { value: 'formal', label: 'Formal' }] },
        { key: 'source', label: 'Source', editor: 'enum', value: 'one', options: [{ value: 'one', label: 'Selected system prompt' }, { value: 'two', label: 'Selected prompt entry' }] },
    ];
    const f = await fixture('NodeDetails', node({ controls }), { editControl: (...args) => { edits.push(args); return success(); } });
    try {
        const group = f.host.querySelector('[role="radiogroup"][aria-label="Style"]'); assert.ok(group);
        const chosen = group.querySelector('input[value="formal"]'); chosen.checked = true; chosen.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await tick(); flushSync();
        assert.equal(edits[0][1], 'style'); assert.equal(edits[0][2], 'formal');
        assert.equal(f.host.querySelector('[aria-label="Source"]').tagName, 'SELECT');
        f.update(node({ controls, readOnly: true }));
        const blocked = f.host.querySelector('[role="radiogroup"] input[value="plain"]'); assert.equal(blocked.disabled, true); blocked.checked = true; blocked.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await tick(); flushSync();
        assert.equal(edits.length, 1);
    } finally { await f.close(); }
});

test('structured row and raw views share parent Save validation and keep invalid text through revisions', async () => {
    const values = [], controls = [{ key: 'sections', label: 'Sections', editor: 'json', representation: 'json-value', structured: 'sections', value: [{ name: 'intro', text: 'Hello' }] }];
    const f = await fixture('NodeDetails', node({ controls }), { editControl: (captured, key, value) => { values.push(value); return success(); } });
    try {
        input(f.host.querySelector('[aria-label="Section 1 text"]'), 'New text'); assert.equal(values.length, 0);
        f.host.querySelector('[data-save-control="sections"]').click(); await tick(); flushSync(); assert.deepEqual(values, [[{ name: 'intro', text: 'New text' }]]);
        f.host.querySelector('[aria-label="Edit Sections as JSON"]').click(); flushSync();
        input(f.host.querySelector('[aria-label="Sections"]'), '{unfinished'); f.host.querySelector('[data-save-control="sections"]').click(); flushSync();
        assert.equal(values.length, 1); assert.equal(f.host.querySelector('[aria-label="Sections"]').getAttribute('aria-invalid'), 'true'); assert.match(f.host.querySelector('[data-diagnostic]').textContent, /valid JSON/);
        f.update(node({ controls, revision: 'unrelated' })); assert.equal(f.host.querySelector('[aria-label="Sections"]').value, '{unfinished'); assert.equal(f.host.querySelector('[aria-label="Sections"]').getAttribute('aria-invalid'), 'true');
        f.update(node({ controls, revision: 'read-only', readOnly: true })); input(f.host.querySelector('[aria-label="Sections"]'), '[]'); f.host.querySelector('[data-save-control="sections"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); assert.equal(values.length, 1);
    } finally { await f.close(); }
});

test('a delayed modifier settings acknowledgment clears its saved draft after reorder so Undo restores saved values', async () => {
    const initial = [modifier('trim-a', 'trim', { edges: 'both' }), modifier('wrap-a', 'wrap', { prefix: '<', suffix: '>' })];
    const pending = [], edits = []; let revision = 1;
    const f = await fixture('NodeDetails', modifierView(initial), { editModifiers: (captured, items) => {
        edits.push({ captured, items: structuredClone(items) });
        f.update(modifierView(structuredClone(items), { revision: 'saved-' + ++revision }));
        return edits.length === 1 ? new Promise(resolve => pending.push(resolve)) : success();
    } });
    try {
        input(f.host.querySelector('[aria-label="Wrap Prefix"]'), '[');
        f.host.querySelector('[aria-label="Save Wrap settings"]').click(); flushSync();
        assert.equal(edits.length, 1); assert.equal(edits[0].items[1].settings.prefix, '[');
        f.host.querySelector('[aria-label="Move Wrap up"]').click(); await tick(); flushSync();
        assert.deepEqual(edits[1].items.map(item => item.id), ['wrap-a', 'trim-a']);
        assert.match(f.host.textContent, /Unsaved/, 'the pending acknowledgment still owns the submitted draft');
        pending[0](success()); await tick(); flushSync();
        assert.doesNotMatch(f.host.textContent, /Unsaved/, 'reordering the same entries does not invalidate a saved settings acknowledgment');
        f.update(modifierView(initial, { revision: 'undo-settings' }));
        assert.equal(f.host.querySelector('[aria-label="Wrap Prefix"]').value, '<', 'the acknowledged draft must not hide Undo');
    } finally { await f.close(); }
});

for (const changeWhilePending of ['newer-draft', 'remove-readd', 'qualified-return']) {
    test(`an obsolete modifier settings acknowledgment preserves ${changeWhilePending} after reorder`, async () => {
        const initial = [modifier('trim-a', 'trim', { edges: 'both' }), modifier('wrap-a', 'wrap', { prefix: '<', suffix: '>' })];
        const pending = []; let edits = 0, revision = 1, saved;
        const f = await fixture('NodeDetails', modifierView(initial), { editModifiers: (captured, items) => {
            saved = structuredClone(items);
            f.update(modifierView(saved, { revision: 'saved-' + ++revision }));
            return ++edits === 1 ? new Promise(resolve => pending.push(resolve)) : success();
        } });
        try {
            input(f.host.querySelector('[aria-label="Wrap Prefix"]'), '['); f.host.querySelector('[aria-label="Save Wrap settings"]').click(); flushSync();
            f.host.querySelector('[aria-label="Move Wrap up"]').click(); await tick(); flushSync();
            if (changeWhilePending === 'newer-draft') input(f.host.querySelector('[aria-label="Wrap Prefix"]'), 'Newer');
            else if (changeWhilePending === 'remove-readd') {
                f.host.querySelector('[aria-label="Remove Wrap modifier"]').click(); await tick(); flushSync();
                assert.equal(f.host.querySelector('[aria-label="Wrap Prefix"]'), null);
                f.update(modifierView(initial, { revision: 'restore-entry' }));
                input(f.host.querySelector('[aria-label="Wrap Prefix"]'), 'Replacement draft');
            } else {
                f.update(modifierView(saved, { revision: 'sibling', address: { ...address, instancePath: ['instance/two'] } }));
                f.update(modifierView(saved, { revision: 'return' }));
            }
            const expected = changeWhilePending === 'newer-draft' ? 'Newer' : changeWhilePending === 'remove-readd' ? 'Replacement draft' : '[';
            pending[0](success()); await tick(); flushSync();
            assert.equal(f.host.querySelector('[aria-label="Wrap Prefix"]').value, expected);
            assert.match(f.host.textContent, /Unsaved/, 'an older acknowledgment cannot erase a draft from a newer generation or node visit');
            f.update(modifierView(initial, { revision: 'undo-settings' }));
            assert.equal(f.host.querySelector('[aria-label="Wrap Prefix"]').value, expected);
        } finally { await f.close(); }
    });
}


for (const editor of ['json', 'lines']) {
    test(`an acknowledged ${editor} control Save clears its draft after synchronous revision publication so Undo is visible`, async () => {
        const control = { key: 'words', label: 'Words', editor, value: ['Before'], ...(editor === 'json' ? { representation: 'json-value' } : {}) };
        const original = node({ controls: [control] }), edits = [];
        const f = await fixture('NodeDetails', original, { editControl: (captured, key, value) => {
            edits.push({ captured, key, value });
            f.update(node({ revision: 'saved-control', controls: [{ ...control, value }] }));
            return success();
        } });
        try {
            input(f.host.querySelector('[aria-label="Words"]'), editor === 'json' ? '["After"]' : 'After');
            f.host.querySelector('[data-save-control="words"]').click(); await tick(); flushSync();
            assert.deepEqual(edits[0].value, ['After']);
            f.update({ ...original, revision: 'undo-control' });
            assert.equal(f.host.querySelector('[aria-label="Words"]').value, editor === 'json' ? '[\n  "Before"\n]' : 'Before', 'an accepted draft cannot keep masking the restored saved value');
        } finally { await f.close(); }
    });
}

test('an acknowledged model override clears its draft after synchronous revision publication so Undo restores the binding', async () => {
    const allowedModes = [{ value: 'inherit', label: 'Inherit role' }, { value: 'override', label: 'Override' }];
    const model = { role: 'Analysis', roleEditable: true, effective: 'Connection · Before', source: 'Node override', profile: { mode: 'inherit', allowedModes, value: null }, model: { mode: 'override', allowedModes, value: 'Before' } };
    const original = node({ controls: [], model });
    const f = await fixture('NodeDetails', original, { editBinding: (captured, field, mode, value) => {
        assert.equal(field, 'model'); assert.equal(mode, 'override'); assert.equal(value, 'After');
        f.update(node({ revision: 'saved-binding', controls: [], model: { ...model, effective: 'Connection · After', model: { ...model.model, value } } }));
        return success();
    } });
    try {
        input(f.host.querySelector('[aria-label="Model identifier"]'), 'After'); change(f.host.querySelector('[aria-label="Model identifier"]'), 'After'); await tick(); flushSync();
        f.update({ ...original, revision: 'undo-binding' });
        assert.equal(f.host.querySelector('[aria-label="Model identifier"]').value, 'Before');
    } finally { await f.close(); }
});

for (const changeWhilePending of ['newer-draft', 'qualified-return', 'editor-contract', 'newer-save']) {
    test(`a delayed control acknowledgment preserves ${changeWhilePending} after publishing its saved revision`, async () => {
        const control = { key: 'words', label: 'Words', editor: 'json', representation: 'json-value', value: ['Before'] };
        const pending = []; let revision = 1, saved;
        const f = await fixture('NodeDetails', node({ controls: [control] }), { editControl: (captured, key, value) => {
            if (!pending.length) {
                saved = node({ revision: 'saved-' + ++revision, controls: [{ ...control, value }] });
                f.update(saved);
            }
            return new Promise(resolve => pending.push(resolve));
        } });
        try {
            input(f.host.querySelector('[aria-label="Words"]'), '["After"]'); f.host.querySelector('[data-save-control="words"]').click(); flushSync();
            if (changeWhilePending === 'newer-draft') input(f.host.querySelector('[aria-label="Words"]'), '["Newer"]');
            else if (changeWhilePending === 'qualified-return') {
                f.update({ ...saved, address: { ...address, instancePath: ['instance/two'] } });
                f.update(saved);
            } else if (changeWhilePending === 'editor-contract') {
                f.update(node({ revision: 'lines-contract', controls: [{ key: 'words', label: 'Words', editor: 'lines', value: ['Replacement'] }] }));
                input(f.host.querySelector('[aria-label="Words"]'), 'Replacement draft');
            } else {
                f.host.querySelector('[data-save-control="words"]').click(); flushSync();
                assert.equal(pending.length, 2);
            }
            pending[0](success()); await tick(); flushSync();
            const expected = changeWhilePending === 'newer-draft' ? '["Newer"]' : changeWhilePending === 'editor-contract' ? 'Replacement draft' : '["After"]';
            assert.equal(f.host.querySelector('[aria-label="Words"]').value, expected);
            if (changeWhilePending === 'newer-save') {
                pending[1]({ ok: false, error: { code: 'LATEST', message: 'Latest validation failure' } }); await tick(); flushSync();
                assert.equal(f.host.querySelector('[data-diagnostic]').dataset.severity, 'error'); assert.equal(f.host.querySelector('[aria-label="Words"]').value, '["After"]', 'the older acknowledgment did not erase the newer pending save');
            } else if (changeWhilePending !== 'editor-contract') {
                f.update(node({ revision: 'undo-control', controls: [control] }));
                assert.equal(f.host.querySelector('[aria-label="Words"]').value, expected, 'a stale acknowledgment cannot erase a later draft or a draft restored on a new visit');
            }
        } finally { await f.close(); }
    });
}


test('an older modifier settings acknowledgment cannot release a newer pending Save of the same draft', async () => {
    const initial = [modifier('wrap-a', 'wrap', { prefix: '<', suffix: '>' })], pending = [];
    const f = await fixture('NodeDetails', modifierView(initial), { editModifiers: (captured, items) => {
        if (!pending.length) f.update(modifierView(structuredClone(items), { revision: 'saved-first' }));
        return new Promise(resolve => pending.push(resolve));
    } });
    try {
        input(f.host.querySelector('[aria-label="Wrap Prefix"]'), '['); f.host.querySelector('[aria-label="Save Wrap settings"]').click(); flushSync();
        f.host.querySelector('[aria-label="Save Wrap settings"]').click(); flushSync(); assert.equal(pending.length, 2);
        pending[0](success()); await tick(); flushSync();
        assert.equal(f.host.querySelector('[aria-label="Save Wrap settings"]').disabled, true, 'the older success must not release the latest validation');
        pending[1]({ ok: false, error: { code: 'LATEST', message: 'Latest modifier failure' } }); await tick(); flushSync();
        assert.equal(f.host.querySelector('[data-diagnostic]').dataset.severity, 'error'); assert.match(f.host.textContent, /Unsaved/); assert.equal(f.host.querySelector('[aria-label="Wrap Prefix"]').value, '[');
    } finally { await f.close(); }
});

test('the identity header displays a preserved saved title when no alias exists and shows its canonical subtitle', async () => {
    const f = await fixture('NodeDetails', node({ alias: '', title: 'Saved wording', canonicalTitle: 'Compose' }), { present: success });
    try {
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Saved wording');
        assert.match(f.host.querySelector('[data-canonical-title]').textContent, /Compose/);
        f.update(node({ alias: '', title: 'Compose', canonicalTitle: 'Compose' }));
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Compose');
        assert.equal(f.host.querySelector('[data-canonical-title]'), null);
    } finally { await f.close(); }
});

test('model binding issues remain visible outside collapsed advanced settings and preserve distinct effective connections', async () => {
    const allowedModes = [{ value: 'inherit', label: 'Inherit role' }, { value: 'override', label: 'Override' }];
    const issue = 'Assign a fixed connection to this node or its model role.';
    const model = { role: 'Analysis', roleEditable: true, effective: '  ' + issue + '  ', source: 'Inherited from Analysis', issue, profile: { mode: 'inherit', allowedModes, value: null }, model: { mode: 'inherit', allowedModes, value: null } };
    const f = await fixture('NodeDetails', node({ controls: [], model }), { editBinding: success });
    try {
        const group = f.host.querySelector('[data-model-controls]');
        assert.equal(group.open, false);
        assert.equal(group.querySelector('summary').textContent,'Advanced model settings');
        assert.equal(f.host.querySelectorAll('[data-diagnostic]').length, 1, 'the detailed binding failure must appear only once');
        assert.equal(f.host.querySelector('[data-diagnostic]').dataset.severity, 'error');
        assert.doesNotMatch(group.textContent, /Effective connection:/, 'the identical effective failure is omitted after trimming');
        assert.match(group.textContent, /Inherited from Analysis/);
        f.update(node({ revision: 'distinct-effective', controls: [], model: { ...model, effective: 'Reasoner · saved-model' } }));
        assert.match(group.textContent, /Effective connection: Reasoner · saved-model/, 'an effective binding distinct from the issue remains useful');
        assert.equal(f.host.querySelectorAll('[data-diagnostic]').length, 1);
        assert.equal(group.querySelector('summary').textContent,'Advanced model settings');
    } finally { await f.close(); }
});
test('single-line identifiers commit compact text inputs, guard disabled events and retain multiline textarea values', async () => {
    const identifier = { key: 'curveId', label: 'Curve ID', editor: 'text', singleLine: true, value: 'curve-a' };
    const prose = { key: 'instructions', label: 'Instructions', editor: 'text', value: 'Write a scene.' };
    const edits = [], f = await fixture('NodeDetails', node({ controls: [identifier, prose] }), { editControl: (...args) => { edits.push(args); return success(); } });
    try {
        const compact = f.host.querySelector('[aria-label="Curve ID"]');
        assert.equal(compact.tagName, 'INPUT'); assert.equal(compact.type, 'text'); assert.equal(compact.value, 'curve-a');
        assert.equal(f.host.querySelector('[aria-label="Instructions"]').tagName, 'TEXTAREA', 'prose editors keep their existing multiline affordance');
        change(compact, 'curve-b'); await tick(); flushSync();
        assert.equal(edits.length, 1); assert.equal(edits[0][1], 'curveId'); assert.equal(edits[0][2], 'curve-b');
        f.update(node({ revision: 'readonly-identifier', readOnly: true, controls: [identifier, prose] }));
        const disabled = f.host.querySelector('[aria-label="Curve ID"]'); assert.equal(disabled.disabled, true);
        change(disabled, 'blocked'); await tick(); flushSync(); assert.equal(edits.length, 1, 'raw disabled events cannot write identifiers');
        for (const value of ['first\nsecond', 'first\rsecond']) {
            f.update(node({ revision: 'multiline-' + value.charCodeAt(5), controls: [{ ...identifier, value }, prose] }));
            const multiline = f.host.querySelector('[aria-label="Curve ID"]');
            assert.equal(multiline.tagName, 'TEXTAREA', 'either newline form preserves the multiline editor');
            assert.equal(multiline.value, value.replace(/\r/g, '\n'), 'line breaks remain visible instead of being stripped by a text input');
            assert.equal(edits.length, 1, 'switching editor shape never rewrites the saved identifier');
        }
    } finally { await f.close(); }
});

test('producer contract capability changes preserve compatible boundary fields and expire old acknowledgments', async () => {
    const pending = [], original = boundary({ editorContractKey: 'boundary-types-a' });
    const f = await fixture('NodeDetails', original, { editInterface: () => new Promise(resolve => pending.push(resolve)) });
    try {
        input(f.host.querySelector('[aria-label="Node name"]'), 'Retained boundary');
        change(f.host.querySelector('[aria-label="Subgraph port type"]'), 'text');
        const required = f.host.querySelector('[aria-label="Required subgraph port"]'); required.checked = false;
        required.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync();
        f.host.querySelector('[data-save-boundary]').click(); flushSync();
        f.update(boundary({ editorContractKey: 'boundary-types-b', revision: 'revision2', boundary: { ...original.boundary, kind: 'data', kinds: ['context', 'data'] } }));
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Retained boundary');
        assert.equal(f.host.querySelector('[aria-label="Required subgraph port"]').checked, false);
        assert.equal(f.host.querySelector('[aria-label="Subgraph port type"]').value, 'data');
        f.update(boundary({ editorContractKey: 'boundary-types-a', revision: 'revision3' }));
        assert.equal(f.host.querySelector('[aria-label="Subgraph port type"]').value, 'data', 'obsolete type does not resurface when the capability returns');
        pending[0](success()); await tick(); flushSync();
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Retained boundary', 'an earlier contract acknowledgment stays expired when the contract returns');
        f.update(boundary({ editorContractKey: 'replacement-port', revision: 'revision4', boundary: { ...original.boundary, id: 'replacement', direction: 'output', label: 'Replacement' } }));
        assert.equal(f.host.querySelector('[aria-label="Node name"]').value, 'Replacement');
    } finally { await f.close(); }
});
