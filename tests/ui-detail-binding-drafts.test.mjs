import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compiled } from './helpers/svelte-compile.mjs';
import { JSDOM } from 'jsdom';
import { fixtureGraph as starterGraph } from './helpers/workflow-fixtures.mjs';
import { cloneWorkflowDocument } from '../src/workflow/document.js?v=0.27.1';
import { prepareNativeNodeEdit } from '../src/workflow/definition-library.js?v=0.27.1';
import { prepareGraphCandidate } from '../src/workflow/prepared-graph-edit.js?v=0.27.1';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js?v=0.27.1';
import { prepareWorkspaceViews, projectWorkspacePanels } from '../src/ui/workspace-preparation.js?v=0.27.1';
import { projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.1';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.1';
import * as history from '../src/history.js?v=0.27.1';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLMediaElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);

async function fixture(view, actions) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-binding-drafts-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    const close = async () => {
        if (mounted) await unmount(mounted); host.remove();
        const target = resolve(directory), rel = relative(resolve(tmpdir()), target);
        assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(target, { recursive: true, force: true });
    };
    try {
        const source = await readFile(new URL('../ui/NodeDetails.svelte', import.meta.url), 'utf8');
        const leaf = await compiled('NodeDetails', directory, source);
        const harness = await compiled('BindingHarness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions } = $props(); let view = $state.raw(initial); export function update(next) { view = next; }</script><Leaf {view} {actions} />`);
        mounted = mount(harness.component, { target: host, props: { initial: view, actions } }); flushSync();
        return { host, update(next) { mounted.update(next); flushSync(); }, close };
    } catch (error) { await close(); throw error; }
}
const change = (element, value) => { assert.ok(element, 'Expected the revealed editor'); element.value = value; element.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync(); };
const input = (element, value) => { assert.ok(element, 'Expected the revealed editor'); element.value = value; element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync(); };
const settle = async () => { await tick(); flushSync(); };
const editor = (f, field) => f.host.querySelector(`[aria-label="${field === 'profileId' ? 'Connection profile' : 'Model identifier'}"]`);
const mode = (f, field) => f.host.querySelector(`[aria-label="${field === 'profileId' ? 'Connection mode' : 'Model mode'}"]`);

// Run the actual schema-2/3 controller adapter, not an equivalent test implementation.
const controller = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
const start = controller.indexOf('function prepareNode('), end = controller.indexOf('\nfunction ', start + 1);
assert.ok(start >= 0 && end > start);
const prepareNode = Function('prepareNativeNodeEdit', 'cloneWorkflowDocument', 'prepareGraphCandidate', controller.slice(start, end) + ';return prepareNode;')(prepareNativeNodeEdit, cloneWorkflowDocument, prepareGraphCandidate);
const nodeId = 'response-plan';
function initialGraph(schema = 3, values = {}) {
    const original = starterGraph('native-guidance');
    const root = schema === 2 ? original : cloneWorkflowDocument(original).data;
    root.roles.Analysis = { profileId: 'role-profile', model: 'role-model' };
    Object.assign(root.nodes[nodeId], { profileId: null, model: null }, values);
    return root;
}
const options = {
    profiles: [{ id: 'role-profile', name: 'Role connection' }, { id: 'profileA', name: 'Chosen connection' }],
    resolveBinding(node, graph) {
        const role = graph.roles?.[node.modelRole ?? 'Analysis'];
        const profileId = node.profileId ?? role?.profileId ?? null, model = node.model ?? role?.model ?? null;
        return { ok: true, data: { profileId, model, display: [profileId, model].filter(Boolean).join(' · ') } };
    },
};
function projection(root, session, prepared, revision) {
    const workflow = projectPreparedWorkflow(prepared.workflow, { selectedId: nodeId });
    const panels = projectWorkspacePanels(session.readEditor(), workflow, { busy: false, status: '', availability: 'empty' }, revision, null, null);
    assert.ok(panels.nodeDetails?.model);
    return panels.nodeDetails;
}
async function savedFixture(schema, values = {}) {
    const root = initialGraph(schema, values), before = structuredClone(root);
    history.track(root);
    let revision = 1, prepared = prepareWorkspaceViews(root, options).data, f;
    assert.ok(prepared);
    const sessionResult = createGraphViewSession({ root, activationId: 'binding-editor', ...prepared });
    assert.equal(sessionResult.ok, true, JSON.stringify(sessionResult));
    const session = sessionResult.data, calls = [];
    const view = () => projection(root, session, prepared, 'revision' + revision);
    function commit(command) {
        const captured = captureGraphEditContext(root, () => session.readEditContext());
        assert.equal(captured.ok, true, JSON.stringify(captured));
        const result = prepareNode(root, { viewPath: [], nodeId, ...command });
        assert.equal(result.ok, true, JSON.stringify(result));
        const committed = commitPreparedGraph(root, { ...result.data, context: captured.data, viewPath: [] });
        assert.equal(committed.ok, true, JSON.stringify(committed));
        assert.equal(committed.data.changed, true);
        prepared = prepareWorkspaceViews(root, options).data; assert.ok(prepared);
        assert.equal(session.replacePreparedViews(prepared).ok, true);
        revision++; f.update(view());
        return { ok: true };
    }
    f = await fixture(view(), { editBinding(captured, field, selectedMode, value) {
        assert.deepEqual(captured, { selectionKey: view().selectionKey, revision: view().revision, address: view().address });
        calls.push({ captured, field, mode: selectedMode, value });
        return commit({ kind: 'binding', field, mode: selectedMode === 'inherit' ? 'remove' : 'set', ...(selectedMode === 'inherit' ? {} : { value: selectedMode === 'block' ? null : value }) });
    } });
    return { ...f, root, before, calls, view, unrelatedRevision: () => commit({ kind: 'enabled', value: false }) };
}

for (const schema of [2, 3]) test(`schema ${schema} Details keeps profile selection on the canvas and resets a saved connection directly`, async () => {
    const f = await savedFixture(schema, { profileId: 'profileA' });
    try {
        assert.equal(editor(f, 'profileId'), null, 'the canvas picker owns ordinary profile selection');
        assert.equal(mode(f, 'profileId'), null, 'Details has no profile Override draft path');
        assert.equal(f.host.querySelector('[data-model-controls]').open, false, 'advanced settings start collapsed');
        const reset = f.host.querySelector('[data-reset-profile]'); assert.ok(reset);
        assert.equal(reset.disabled, false); reset.click(); await settle();
        assert.deepEqual(f.calls.map(({field, mode, value}) => ({field, mode, value})), [{field:'profileId', mode:'inherit', value:null}]);
        assert.equal(Object.hasOwn(f.root.nodes[nodeId], 'profileId'), false);
        assert.deepEqual(f.root.roles.Analysis, f.before.roles.Analysis);
        assert.equal(typeof history.undo(f.root), 'string'); assert.equal(f.root.nodes[nodeId].profileId, 'profileA');
    } finally { await f.close(); }
});
test('clearing a model override on a node with its own connection restores the profile model', async () => {
    const f = await savedFixture(3, { profileId: 'profileA', model: 'custom-model' });
    try {
        assert.match(mode(f, 'model').querySelector('option[value="inherit"]').textContent, /Use profile model/);
        input(editor(f, 'model'), ''); change(editor(f, 'model'), ''); await settle();
        assert.equal(f.calls.length, 1);
        assert.equal(f.calls[0].field, 'model'); assert.equal(f.calls[0].mode, 'inherit');
        assert.equal(Object.hasOwn(f.root.nodes[nodeId], 'model'), false);
        assert.equal(f.root.nodes[nodeId].profileId, 'profileA');
        assert.equal(mode(f, 'model').value, 'inherit');
        assert.equal(editor(f, 'model'), null);
        assert.doesNotMatch(f.host.textContent, /Enter a model identifier/);
        assert.deepEqual(f.root.roles.Analysis, f.before.roles.Analysis);
    } finally { await f.close(); }
});

for (const schema of [2, 3]) for (const field of ['model']) {
    test(`schema ${schema} ${field} Override reveals a local editor, then a nonempty value commits through the real producer/projector`, async () => {
        const f = await savedFixture(schema), selected = field === 'profileId' ? 'profileA' : 'chosen-model';
        try {
            assert.equal(mode(f, field).value, 'inherit');
            if (field === 'profileId') assert.equal(editor(f, field).value, 'role-profile');
            else assert.equal(editor(f, field), null);
            const effective = f.view().model.effective, oldHistory = history.peek(f.root);
            change(mode(f, field), 'override');
            assert.equal(f.calls.length, 0, 'revealing an Override editor dispatches no saved null');
            assert.equal(mode(f, field).value, 'override'); assert.equal(editor(f, field).value, '');
            assert.deepEqual(f.root, f.before); assert.deepEqual(history.peek(f.root), oldHistory, 'choosing a mode does not create undo history');
            assert.match(f.host.textContent, new RegExp('Effective connection: ' + effective.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            change(editor(f, field), ''); await settle();
            if (field === 'model') { input(editor(f, field), '   '); change(editor(f, field), '   '); await settle(); }
            assert.equal(f.calls.length, 0, 'empty or whitespace-only drafts cannot become saved overrides');
            assert.deepEqual(f.root, f.before); assert.equal(f.root.nodes[nodeId][field], null);
            f.unrelatedRevision(); await settle();
            assert.equal(mode(f, field).value, 'override', 'an unrelated revision retains the local mode');
            assert.equal(editor(f, field).value, field === 'model' ? '   ' : '');
            assert.equal(f.calls.length, 0); assert.equal(f.root.nodes[nodeId][field], null);
            change(editor(f, field), selected); await settle();
            assert.equal(f.calls.length, 1); assert.equal(f.calls[0].mode, 'override'); assert.equal(f.calls[0].value, selected);
            assert.equal(f.calls[0].captured.revision, 'revision2', 'the eventual value edit captures the latest revision');
            assert.equal(f.root.nodes[nodeId][field], selected); assert.equal(f.view().model[field === 'profileId' ? 'profile' : 'model'].mode, 'override');
            assert.equal(editor(f, field).value, selected); assert.match(f.host.textContent, new RegExp(field === 'profileId' ? 'profileA' : 'chosen-model'));
            assert.deepEqual(f.root.roles.Analysis, f.before.roles.Analysis, 'node overrides never rewrite the containing role');
            const wireSnapshot = structuredClone(f.root.wires), otherValue = f.root.nodes[nodeId][field === 'model' ? 'profileId' : 'model'];
            change(mode(f, field), 'inherit'); await settle();
            assert.equal(f.calls.length, 2); assert.equal(f.calls[1].mode, 'inherit');
            assert.equal(Object.hasOwn(f.root.nodes[nodeId], field), false, 'Inherit removes the node override through the producer');
            assert.equal(mode(f, field).value, 'inherit');
            if (field === 'profileId') assert.equal(editor(f, field).value, 'role-profile');
            else assert.equal(editor(f, field), null);
            assert.deepEqual(f.root.roles.Analysis, f.before.roles.Analysis); assert.deepEqual(f.root.wires, wireSnapshot);
            assert.equal(f.root.nodes[nodeId][field === 'model' ? 'profileId' : 'model'], otherValue);
            assert.equal(typeof history.undo(f.root), 'string', 'a valid override and its removal retain an actual undo label');
            assert.equal(f.root.nodes[nodeId][field], selected);
        } finally { await f.close(); }
    });
}

const allowedModes = [{ value: 'inherit', label: 'Inherit role' }, { value: 'override', label: 'Override' }];
function plainView(extra = {}) {
    return { selectionKey: 'selected-plan', revision: 'revision1', address: { workflowId: 'root', instancePath: [], nodeId }, title: 'Response Plan', canonicalTitle: 'Response Plan', iconPath: 'M3 5h18', family: 'Shaping', phase: 'pre', alias: '', compact: false, enabled: true, readOnly: false, canPresent: true, controls: [], ports: [], model: { role: 'Analysis', roleEditable: true, effective: 'Actual role connection · role-model', source: 'Saved node override or containing role', profile: { mode: 'inherit', allowedModes, value: null, options: options.profiles.map(p => ({ value: p.id, label: p.name })) }, model: { mode: 'inherit', allowedModes, value: null } }, ...extra };
}


test('clearing a shared instance model override saves an explicit profile default instead of resetting it', async () => {
    const view = plainView({ readOnly: true });
    view.model.editable = true; view.model.profileDefaultModel = true;
    view.model.model = { mode: 'override', value: 'instance-model', effectiveValue: 'instance-model', allowedModes: [{ value: 'inherit', label: 'Use definition model' }, { value: 'override', label: 'Override' }, { value: 'block', label: 'Use profile model' }] };
    const calls = [], f = await fixture(view, { editBinding: (...args) => { calls.push(args); return { ok: true }; } });
    try {
        input(editor(f, 'model'), ''); change(editor(f, 'model'), ''); await settle();
        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].slice(1), ['model', 'block', null]);
        assert.doesNotMatch(f.host.textContent, /Enter a model identifier/);
    } finally { await f.close(); }
});



test('root switching restores a binding override draft only while its mode is supported', async () => {
    const calls = [], f = await fixture(plainView(), { editBinding: (...args) => { calls.push(args); return { ok: true }; } });
    try {
        change(mode(f, 'model'), 'override'); input(editor(f, 'model'), '   '); change(editor(f, 'model'), '   ');
        const other = plainView({ address: { workflowId: 'other-root', instancePath: [], nodeId } });
        f.update(other); assert.equal(editor(f, 'model'), null);
        change(mode(f, 'model'), 'override'); input(editor(f, 'model'), 'Other unsaved identifier');
        f.update(plainView({ revision: 'revision2' }));
        assert.equal(mode(f, 'model').value, 'override'); assert.equal(editor(f, 'model').value, '   ');
        assert.match(f.host.textContent, /Enter a model identifier/);
        assert.match(f.host.textContent, /Effective connection: Actual role connection · role-model/);
        assert.deepEqual(calls, [], 'browsing and invalid overrides never change committed bindings');
        f.update(other); assert.equal(editor(f, 'model').value, 'Other unsaved identifier');
        const unsupported = plainView({ revision: 'revision3' }); unsupported.model.model.allowedModes = [allowedModes[0]];
        f.update(unsupported);
        assert.equal(mode(f, 'model').value, 'inherit'); assert.equal(editor(f, 'model'), null, 'an unsupported restored override cannot reveal an editor');
        assert.doesNotMatch(f.host.textContent, /Enter a model identifier/); assert.deepEqual(calls, []);
    } finally { await f.close(); }
});
test('Inherit cancels unsaved override modes without writing null, and readonly or unsupported modes cannot stage a draft', async () => {
    const calls = [], f = await fixture(plainView(), { editBinding: (...args) => { calls.push(args); return { ok: true }; } });
    try {
        for (const field of ['model']) {
            change(mode(f, field), 'override'); assert.ok(editor(f, field));
            change(mode(f, field), 'inherit');
            if (field === 'profileId') assert.equal(editor(f, field).value, '');
            else assert.equal(editor(f, field), null);
            assert.equal(mode(f, field).value, 'inherit');
        }
        assert.equal(calls.length, 0, 'canceling an unsaved editor does not mutate saved inheritance');
        change(mode(f, 'model'), 'override'); input(editor(f, 'model'), '   '); change(editor(f, 'model'), '   ');
        f.update(plainView({ revision: 'revision2', readOnly: true }));
        assert.equal(editor(f, 'model').value, '   '); assert.equal(editor(f, 'model').disabled, true);
        assert.match(f.host.textContent, /Enter a model identifier/);
        input(editor(f, 'model'), 'forbidden'); change(editor(f, 'model'), 'forbidden'); change(mode(f, 'model'), 'inherit');
        assert.ok(editor(f, 'model'), 'a raw readonly mode event cannot discard the local override');
        assert.match(f.host.textContent, /Enter a model identifier/, 'a raw readonly input cannot stage text or clear the draft error'); assert.equal(calls.length, 0);
        f.update(plainView({ selectionKey: 'another', readOnly: true }));
        assert.equal(editor(f, 'profileId'), null); assert.equal(mode(f, 'profileId'), null); assert.equal(calls.length, 0);
        const view = plainView(); view.model.model.allowedModes = [allowedModes[0]];
        f.update(view); change(mode(f, 'model'), 'override'); assert.equal(editor(f, 'model'), null); assert.equal(calls.length, 0);
    } finally { await f.close(); }
});

for (const oldResult of [{ ok: true }, { ok: false, error: { code: 'OLD', message: 'Obsolete binding failure' } }]) {
    test(`an obsolete ${oldResult.ok ? 'success' : 'error'} cannot clear a newer binding draft after revision or mode changes`, async () => {
        const pending = [], calls = [], f = await fixture(plainView(), { editBinding: (...args) => { calls.push(args); return new Promise(resolve => pending.push(resolve)); } });
        try {
            change(mode(f, 'model'), 'override'); input(editor(f, 'model'), 'first'); change(editor(f, 'model'), 'first');
            assert.equal(calls.length, 1);
            f.update(plainView({ revision: 'revision2' }));
            assert.equal(editor(f, 'model').value, 'first');
            input(editor(f, 'model'), 'second'); change(editor(f, 'model'), 'second');
            assert.deepEqual(calls.map(call => call[0].revision), ['revision1', 'revision2']);
            pending[0](oldResult); await settle();
            assert.equal(editor(f, 'model').value, 'second'); assert.doesNotMatch(f.host.textContent, /Obsolete binding failure/);
            pending[1]({ ok: false, error: { code: 'CURRENT', message: 'Current binding failure' } }); await settle();
            assert.equal(f.host.querySelector('[data-diagnostic]').dataset.severity, 'error'); assert.equal(editor(f, 'model').value, 'second');
            const diagnosticId = f.host.querySelector('[data-diagnostic]').dataset.diagnostic;
            f.update(plainView({ revision: 'revision3' })); assert.equal(f.host.querySelector('[data-diagnostic]').dataset.diagnostic, diagnosticId, 'the retained binding draft keeps its validation error');
            input(editor(f, 'model'), 'third'); change(editor(f, 'model'), 'third');
            change(mode(f, 'model'), 'inherit'); assert.equal(editor(f, 'model'), null);
            pending[2](oldResult); await settle(); assert.equal(editor(f, 'model'), null); assert.doesNotMatch(f.host.textContent, /Obsolete binding failure|Current binding failure/);
            assert.equal(calls.length, 3, 'discarding an unsaved override does not dispatch a saved-null reset');
        } finally { await f.close(); }
    });
}

for (const extra of [{ selectionKey: 'another-plan' }, { address: { workflowId: 'root', instancePath: ['another-instance'], nodeId } }, { address: { kind: 'library', definitionRef: { id: 'definition', version: 1, semanticHash: 'pinned' }, nodeId }, readOnly: true }]) {
    test(`binding modes reset on a true ${extra.selectionKey ? 'selection' : extra.address.kind === 'library' ? 'library' : 'qualified address'} change and ignore old callbacks`, async () => {
        const pending = [], calls = [], f = await fixture(plainView(), { editBinding: (...args) => { calls.push(args); return new Promise(resolve => pending.push(resolve)); } });
        try {
            change(mode(f, 'model'), 'override'); input(editor(f, 'model'), 'private-model'); change(editor(f, 'model'), 'private-model');
            assert.equal(calls.length, 1);
            f.update(plainView(extra)); assert.equal(editor(f, 'model'), null); assert.equal(mode(f, 'model').value, 'inherit');
            pending[0]({ ok: false, error: { code: 'OTHER', message: 'Wrong node binding failure' } }); await settle();
            assert.equal(editor(f, 'model'), null); assert.doesNotMatch(f.host.textContent, /private-model|Wrong node binding failure/); assert.equal(calls.length, 1);
        } finally { await f.close(); }
    });
}

test('saved valid overrides remain directly editable and the effective summary is never derived from a draft', async () => {
    const f = await savedFixture(3, { profileId: 'profileA', model: 'saved-model' });
    try {
        assert.equal(editor(f, 'profileId'), null); assert.equal(editor(f, 'model').value, 'saved-model');
        const actualEffective = f.view().model.effective;
        input(editor(f, 'model'), 'unsaved-model');
        assert.equal(f.calls.length, 0); assert.equal(f.root.nodes[nodeId].model, 'saved-model');
        assert.match(f.host.textContent, /Effective connection: profileA · saved-model/); assert.equal(f.view().model.effective, actualEffective);
        f.unrelatedRevision(); await settle(); assert.equal(editor(f, 'model').value, 'unsaved-model');
        change(editor(f, 'model'), 'edited-model'); await settle(); assert.equal(f.root.nodes[nodeId].model, 'edited-model');
    } finally { await f.close(); }
});

test('a qualified pinned occurrence can reset an explicit null connection to its definition without staging a profile draft', async () => {
    const view = plainView({readOnly:true, address:{workflowId:'root', instancePath:['wrapper'], nodeId}});
    view.model.editable=true;
    view.model.profile={mode:'block', value:null, effectiveValue:null, allowedModes:[{value:'inherit',label:'Use definition binding'},{value:'override',label:'Override'},{value:'block',label:'Blocked by instance'}]};
    const calls=[],f=await fixture(view,{editBinding:(...args)=>{calls.push(args);return {ok:true};}});
    try {
        assert.equal(editor(f,'profileId'),null); assert.equal(mode(f,'profileId'),null);
        const reset=f.host.querySelector('[data-reset-profile]');assert.ok(reset);assert.equal(reset.disabled,false);
        reset.click();await settle();assert.deepEqual(calls,[[{selectionKey:view.selectionKey,revision:view.revision,address:view.address},'profileId','inherit',null]]);
    }finally{await f.close();}
});
