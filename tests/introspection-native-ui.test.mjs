import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compiled } from './helpers/svelte-compile.mjs';
import { JSDOM } from 'jsdom';
import { prepareNativeSearchCatalog, filterNativeSearchChoices, resolveNativeSearchChoice } from '../src/ui/native-search-catalog.js?v=0.27.0';
import { FAMILY_PALETTE, paletteForOperation } from '../src/ui/node-palette.js?v=0.27.0';
import { prepareWorkspaceViews, projectWorkspacePanels } from '../src/ui/workspace-preparation.js?v=0.27.0';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.0';
import { createWorkflowSession, projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.0';
import { prepareNodeControlChange } from '../src/workflow/ports.js?v=0.27.0';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js?v=0.27.0';
import { runWorkflow } from '../src/workflow/runtime.js?v=0.27.0';
import { state as actorState } from './fixtures/introspection.mjs';
import { createNativeWorkflowController } from '../src/workflow/host.js?v=0.27.0';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLMediaElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);

async function fixture(view, actions, name = 'NodeDetails') {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-introspection-details-')), host = document.createElement('div'); document.body.append(host);
    let mounted;
    const close = async () => { if (mounted) await unmount(mounted); host.remove(); const target = resolve(directory), rel = relative(resolve(tmpdir()), target); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(target, { recursive: true, force: true }); };
    try {
        const source = await readFile(new URL('../ui/' + name + '.svelte', import.meta.url), 'utf8'), leaf = await compiled(name, directory, source);
        const harness = await compiled('IntrospectionDetailsHarness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions } = $props(); let view = $state.raw(initial); export function update(next) { view = next; }</script><Leaf {view} {actions} />`);
        mounted = mount(harness.component, { target: host, props: { initial: view, actions } }); flushSync();
        return { host, update(next) { mounted.update(next); flushSync(); }, close };
    } catch (error) { await close(); throw error; }
}
const scope = mode => ({ schema: 3, runtime: 2, mode, workflowId: 'introspection-ui', viewPath: [], inDefinition: false });
const graph = (operation, controls = {}) => ({ id: 'introspection-ui', schema: 3, runtime: 2, mode: 'native-unified', nodes: { work: { id: 'work', type: 'workflow', operation, operationVersion: 1, ...controls } }, wires: {}, roles: {}, groups: {}, definitions: {}, portals: {} });
function details(root, revision = 'revision1') {
    const prepared = prepareWorkspaceViews(root); assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root, activationId: 'introspection-ui', ...prepared.data }); assert.equal(session.ok, true, JSON.stringify(session));
    session.data.updateView({ selection: { primary: { kind: 'node', id: 'work' }, multi: [] } });
    const workflow = projectPreparedWorkflow(prepared.data.workflow, { selectedId: 'work' });
    return projectWorkspacePanels(session.data.readEditor(), workflow, { busy: false }, revision, null, null).nodeDetails;
}
const input = (element, value, event = 'input') => { assert.ok(element); element.value = value; element.dispatchEvent(new dom.window.Event(event, { bubbles: true })); flushSync(); };
const rawEditor = (f, label) => { const toggle = f.host.querySelector('[aria-label="Edit ' + label + ' as JSON"]'); if (toggle) { toggle.click(); flushSync(); } return f.host.querySelector('[aria-label="' + label + '"]'); };
const chooseMode = (f, value) => { const group = f.host.querySelector('[role="radiogroup"][aria-label="Mode"]'); if (group) { const radio = group.querySelector('input[value="' + value + '"]'); assert.ok(radio); radio.checked = true; radio.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync(); } else input(f.host.querySelector('[aria-label="Mode"]'), value, 'change'); };
const settle = async () => { await tick(); flushSync(); };
const openControlGroup = (f, name) => { const group = f.host.querySelector('[data-control-group="' + name + '"]'); assert.ok(group, 'Missing ' + name + ' disclosure'); if (!group.open) { group.querySelector('summary').click(); flushSync(); } assert.equal(group.open, true); };

test('native picker discovers all six Introspection tools and phase-safe mode choices', () => {
    assert.ok(FAMILY_PALETTE.some(item => item.name === 'Introspection'));
    for (const phase of ['pre']) {
        const prepared = prepareNativeSearchCatalog(scope('native-unified')); assert.equal(prepared.ok, true, JSON.stringify(prepared));
        const catalog = prepared.data;
        for (const [operation, title] of [['reflect', 'Reflect'], ['internalize', 'Internalize'], ['express', 'Express'], ['context', 'Context'], ['memory', 'Memory'], ['state', 'State']]) {
            const choice = filterNativeSearchChoices(catalog, { query: title }).find(item => item.id === 'operation:' + operation);
            assert.ok(choice, title + ' is reachable through the real picker'); assert.equal(choice.family, 'Introspection'); assert.equal(choice.phase, phase);
            assert.equal(paletteForOperation(operation).group, title); assert.ok(paletteForOperation(operation).icon.length > 0);
            assert.equal(resolveNativeSearchChoice(catalog, choice.id).operation, operation);
        }
        assert.equal(catalog.choices.filter(item => item.family === 'Introspection').length, 6);
        for (const id of ['reflect:recall', 'reflect:scene', 'internalize:pattern', 'internalize:recovery', 'express:attention', 'express:inner-voice', 'context:perspective', 'context:focus', 'memory:recall', 'state:curve', 'state:track']) {
            assert.ok(resolveNativeSearchChoice(catalog, 'operation:' + id), id);
            assert.equal(catalog.choices.some(item => item.id === 'operation:' + id), false);
        }
        assert.equal(!!resolveNativeSearchChoice(catalog, 'operation:memory:commit'), true);
        const inner = prepareNativeSearchCatalog({ ...scope('native-' + phase), viewPath: ['child'], inDefinition: true }); assert.equal(inner.ok, true);
        assert.equal(inner.data.choices.some(item => item.id === 'operation:memory:commit'), false);
    }
});

test('prepared workflow discovery marks both-phase Introspection entries compatible in the containing phase', () => {
    for (const phase of ['pre', 'post']) {
        const root = graph('state', {phase}), prepared = prepareWorkspaceViews(root); assert.equal(prepared.ok, true, JSON.stringify(prepared));
        const workflow = projectPreparedWorkflow(prepared.data.workflow), family = workflow.families.find(item => item.name === 'Introspection');
        assert.ok(family); assert.equal(family.operations.length, 6);
        for (const entry of family.operations) { assert.equal(entry.compatible, true, entry.id); assert.equal(entry.phase, 'unified', entry.id); }
    }
});

test('actual State Details edit fractional numbers and JSON maps with complete-candidate validation', async () => {
    let root = graph('state', { mode: 'curve' }), revision = 1, f;
    const edits = [];
    f = await fixture(details(root), { editControl(captured, key, value) {
        edits.push({ revision: captured.revision, key, value: structuredClone(value) });
        const changed = prepareNodeControlChange(root, { nodeId: captured.address.nodeId, controls: { [key]: value } });
        if (!changed.ok) return changed;
        root = changed.data.candidate; f.update(details(root, 'revision' + ++revision)); return { ok: true };
    } });
    try {
        assert.equal(f.host.querySelector('[aria-label="Decay"]'), null, 'advanced controls mount after their disclosure opens');
        openControlGroup(f, 'Bounds'); openControlGroup(f, 'Phases');
        const decay = f.host.querySelector('[aria-label="Decay"]'); assert.equal(decay.type, 'number'); assert.equal(decay.step, '0.01'); assert.equal(decay.value, '0.25');
        const baseline = f.host.querySelector('[aria-label="Baseline"]'); assert.equal(baseline.step, 'any');
        input(decay, '0.35', 'change'); await settle(); assert.equal(root.nodes.work.decay, 0.35);
        const durations = rawEditor(f, 'Phase durations'); assert.equal(durations.tagName, 'TEXTAREA'); assert.deepEqual(JSON.parse(durations.value), { onset: 1, peak: 1, plateau: 1, decline: 1, aftermath: 1 });
        input(durations, '{broken'); f.host.querySelector('[data-save-control="durations"]').click(); flushSync(); assert.match(f.host.textContent, /valid JSON/); assert.equal(edits.length, 1);
        input(durations, '{"onset":0}'); f.host.querySelector('[data-save-control="durations"]').click(); await settle(); const rejected = prepareNodeControlChange(root, { nodeId: 'work', controls: { durations: JSON.parse(durations.value) } }); assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'INVALID_SETTINGS'); assert.equal(edits.length, 1, 'invalid durations stop before another edit callback'); assert.match(f.host.querySelector('[data-diagnostic]').textContent, /Action could not be completed/); assert.equal(durations.value, '{"onset":0}'); assert.equal(root.nodes.work.durations, undefined);
        input(durations, '{"onset":2,"peak":3}'); f.host.querySelector('[data-save-control="durations"]').click(); await settle(); assert.deepEqual(root.nodes.work.durations, { onset: 2, peak: 3 });
        chooseMode(f, 'value'); await settle();
        assert.equal(root.nodes.work.mode, 'value'); assert.equal(rawEditor(f, 'Phase durations'), null);
        for (const key of ['decay', 'durations', 'curveId', 'steps', 'baseline']) assert.equal(Object.hasOwn(root.nodes.work, key), false, 'mode change removes stale ' + key);
        const updates = rawEditor(f, 'Values'); assert.deepEqual(JSON.parse(updates.value), {});
        input(updates, '{"confidence":0.6}'); f.host.querySelector('[data-save-control="updates"]').click(); await settle(); assert.deepEqual(root.nodes.work.updates, { confidence: 0.6 });
    } finally { await f.close(); }
});

test('numeric Details never turn an empty number into a saved zero', async () => {
    const view = { selectionKey: 'numeric', revision: 'r1', address: { workflowId: 'numeric', instancePath: [], nodeId: 'work' }, title: 'State', canonicalTitle: 'State', iconPath: 'M3 5h18', family: 'Introspection', phase: 'pre', alias: '', compact: false, enabled: true, readOnly: false, canPresent: true, model: null, ports: [], controls: [{ key: 'decay', label: 'Decay', editor: 'number', value: 0.25, min: 0, max: 1, step: 0.01 }] }, edits = [];
    const f = await fixture(view, { editControl(captured, key, value) { edits.push(value); return { ok: true }; } });
    try {
        input(f.host.querySelector('[aria-label="Decay"]'), '', 'change'); await settle(); assert.deepEqual(edits, []); assert.match(f.host.textContent, /finite number/);
        input(f.host.querySelector('[aria-label="Decay"]'), '0.35', 'change'); await settle(); assert.deepEqual(edits, [0.35]);
    } finally { await f.close(); }
});

test('object drafts retain current revision guards when a mode removes their control', async () => {
    const pending = [], root = graph('state', { mode: 'curve' });
    const f = await fixture(details(root), { editControl(captured) { return new Promise(resolve => pending.push(resolve)); } });
    try {
        openControlGroup(f, 'Phases');
        input(rawEditor(f, 'Phase durations'), '{"onset":4}'); f.host.querySelector('[data-save-control="durations"]').click(); flushSync(); assert.equal(pending.length, 1);
        f.update(details(graph('state', { mode: 'value' }), 'revision2'));
        assert.equal(rawEditor(f, 'Phase durations'), null); assert.ok(rawEditor(f, 'Values'));
        pending[0]({ ok: false, error: { code: 'OLD', message: 'obsolete duration rejection' } }); await settle(); assert.doesNotMatch(f.host.textContent, /obsolete duration rejection/);
    } finally { await f.close(); }
});

test('portable native round-trip retains the selected mode controls and object shapes', () => {
    for (const [operation, controls] of [
        ['context', { mode: 'focus', method: 'select', pins: ['known fact'], purpose: 'Scene continuity', targetTokens: 800, maxTokens: 900, keepRecent: 3 }],
        ['memory', { mode: 'recall', query: 'last promise', limit: 5 }],
        ['state', { mode: 'curve', curveId: 'trust', decay: 0.35, baseline: 0.2, steps: 2, durations: { onset: 2, peak: 3 } }],
        ['state', { mode: 'value', updates: { confidence: 0.6 }, min: 0, max: 1 }],
    ]) {
        const root = graph(operation, controls), parsed = parseWorkflow(JSON.stringify(exportWorkflow(root))); assert.equal(parsed.ok, true, JSON.stringify(parsed));
        for (const [key, value] of Object.entries(controls)) assert.deepEqual(parsed.data.nodes.work[key], value, operation + ':' + key);
    }
});

test('actual recorded Introspection output displays the record payload in the selected data preview', async () => {
    const root = graph('state', { mode: 'value', updates: { confidence: 0.6 } }), target = { workflowId: root.id, instancePath: [], nodeId: 'work', portId: 'out' };
    let reads = 0, requests = 0;
    const result = await runWorkflow(root, { target, memory: { read: async () => { reads++; return { ok: true, artifact: actorState() }; } }, request: async () => { requests++; throw Error('No provider is needed'); } });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(reads, 1); assert.equal(requests, 0);
    const prepared = prepareWorkspaceViews(root, { result }); assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root, activationId: 'introspection-preview', ...prepared.data }).data;
    const workflow = projectPreparedWorkflow(prepared.data.workflow, { selectedId: 'work', selectedTarget: target });
    const panel = projectWorkspacePanels(session.readEditor(), workflow, { busy: false, availability: 'current' }, 'preview1', target, null).outputPreview;
    const f = await fixture(panel, {}, 'OutputPreview');
    try {
        const readable = JSON.parse(f.host.querySelector('[data-artifact-kind="data"] pre').textContent);
        assert.equal(readable.recordType, 'state-proposal'); assert.deepEqual(readable.payload.values, { confidence: 0.6 });
        f.host.querySelector('[aria-label="Source preview"]').click(); flushSync();
        assert.equal(f.host.querySelector('[data-preview-source]').textContent, panel.source.text);
        const record = JSON.parse(f.host.querySelector('[data-preview-source]').textContent);
        assert.equal(record.kind, 'data'); assert.equal(record.value.recordType, 'state-proposal'); assert.deepEqual(record.value.payload.values, { confidence: 0.6 });
        assert.equal(reads, 1); assert.equal(requests, 0, 'presentation does not read memory or request a provider');
    } finally { await f.close(); }
});

test('prepared accepted settlement status copies only display fields and does not invoke metadata getters', async () => {
    const root = graph('state'), target = { workflowId: root.id, instancePath: [], nodeId: 'work', portId: 'out' };
    const result = await runWorkflow(root, { target, memory: { read: async () => ({ ok: true, artifact: actorState() }) } }); assert.equal(result.ok, true, JSON.stringify(result.error));
    const commit = { status: 'save-unverified', published: true, receipts: [{intentId:'one',targetId:'memory',status:'save-unverified'}], service: { commit() { assert.fail('Display cannot invoke a memory service'); } } };
    const prepared = prepareWorkspaceViews(root, { result: { ...result, settlement: commit } }); assert.equal(prepared.ok, true);
    const shown = projectPreparedWorkflow(prepared.data.workflow, { selectedTarget: target }); assert.deepEqual(shown.result.settlement, {status:'save-unverified',published:true,receipts:[{intentId:'one',targetId:'memory',status:'save-unverified'}]}); assert.ok(Object.isFrozen(shown.result.settlement));
    let reads = 0;
    Object.defineProperty(commit, 'published', { get() { reads++; return true; } });
    const trapped = prepareWorkspaceViews(root, { result: { ...result, settlement: commit } }); assert.equal(trapped.ok, true);
    assert.equal(projectPreparedWorkflow(trapped.data.workflow, { selectedTarget: target }).result.settlement, undefined); assert.equal(reads, 0);
});
