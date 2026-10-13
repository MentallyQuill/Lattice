import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureGraph as starterGraph } from './helpers/workflow-fixtures.mjs';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.2';
import { projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.2';
import { prepareNativeConnectionEdit } from '../src/workflow/connection-edits.js?v=0.27.2';
import * as api from '../src/ui/workspace-preparation.js?v=0.27.2';
const activeId = 'lattice:active-sillytavern';
const profiles = [{ id: 'saved', name: 'Reasoning connection', api: 'openai', apiLabel: 'OpenAI', model: 'profile-model', endpoint: 'private-url', provider: 'private-route', secret: 'private-key' }];
function fixture(root, options = {}) {
    const prepared = api.prepareWorkspaceViews(root, { profiles, activeModel: { api: 'openai', apiLabel: 'OpenAI', model: 'host-model' }, ...options });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root, activationId: 'profiles', ...prepared.data }).data;
    return { prepared: prepared.data, session, view: () => projectPreparedWorkflow(prepared.data.workflow, { viewPath: session.readEditor().view.identity.instancePath ?? [] }), rows: () => api.projectNodeProfiles(session.readEditor(), projectPreparedWorkflow(prepared.data.workflow, { viewPath: session.readEditor().view.identity.instancePath ?? [] }), 'profiles:7') };
}
function rootFixture() {
    const root = structuredClone(starterGraph('native-guidance')); root.id = 'profile-root';
    root.nodes['response-plan'].profileId = 'saved'; root.nodes['response-plan'].model = 'node-model';
    return root;
}
test('prepared per-node controls expose only safe current profile metadata and qualified unselected addresses', () => {
    assert.equal(typeof api.projectNodeProfiles, 'function');
    const root = rootFixture(), before = structuredClone(root), f = fixture(root);
    const rows = f.rows(), plan = rows.find(row => row.id === 'response-plan');
    assert.equal(plan.value, 'saved'); assert.equal(plan.label, 'Reasoning connection'); assert.equal(plan.model, 'node-model');
    assert.equal(plan.editable, true);
    assert.deepEqual(plan.selection, { selectionKey: JSON.stringify([f.session.readEditor().view.key, 'response-plan']), revision: 'profiles:7', address: { workflowId: root.id, instancePath: [], nodeId: 'response-plan' } });
    assert.equal(f.session.readEditor().view.selection.primary, null);
    assert.deepEqual(plan.options, [{ value: activeId, label: 'Active SillyTavern model', apiLabel: 'OpenAI', model: 'host-model', active: true }, { value: 'saved', label: 'Reasoning connection', apiLabel: 'OpenAI', model: 'profile-model', active: false }]);
    assert.ok(!JSON.stringify(rows).includes('private-'));
    assert.ok(!rows.some(row => root.nodes[row.id].operation === 'scene-context'));
    assert.deepEqual(root, before);
});
test('model metadata remains detectable when completion-policy rejects execution and missing profiles stay unavailable', () => {
    const root = rootFixture(); delete root.nodes['response-plan'].model;
    const f = fixture(root, { resolveBinding: () => ({ ok: false, error: { message: 'Completion evidence unavailable' } }) });
    assert.equal(f.rows().find(row => row.id === 'response-plan').model, 'profile-model');
    root.nodes['response-plan'].profileId = 'missing';
    const missing = fixture(root).rows().find(row => row.id === 'response-plan');
    assert.equal(missing.value, 'missing'); assert.equal(missing.label, 'Unavailable connection · missing'); assert.equal(missing.model, '');
});
test('active metadata refresh respects node model overrides and cached camera/selection projection never resolves again', () => {
    const root = rootFixture(); root.nodes['response-plan'].profileId = activeId;
    let resolves = 0;
    const f = fixture(root, { resolveBinding: () => { resolves++; return { ok: false, error: { message: 'Unavailable' } }; } });
    const before = resolves;
    for (let i = 0; i < 5; i++) { f.session.updateView({ camera: { x: i, y: i, zoom: 1.1 }, selection: { primary: { kind: 'node', id: 'response-plan' }, multi: [] } }); assert.equal(f.rows().find(row => row.id === 'response-plan').model, 'node-model'); }
    assert.equal(resolves, before);
    delete root.nodes['response-plan'].model;
    assert.equal(fixture(root).rows().find(row => row.id === 'response-plan').model, 'host-model');
    assert.equal(fixture(root, { activeModel: { api: 'openai', apiLabel: 'OpenAI', model: 'changed-model' } }).rows().find(row => row.id === 'response-plan').model, 'changed-model');
});
test('model-free operation mode hides its control and readonly library nodes use detached profile metadata', async () => {
    const root = rootFixture();
    root.nodes['smart-compactor'].method = 'select';
    assert.ok(!fixture(root).rows().some(row => row.id === 'smart-compactor'));
    const { siblingWorkflow } = await import('./fixtures/workflow-prepared-fixture.mjs');
    const shared = siblingWorkflow(), f = fixture(shared);
    f.session.openInstance(['first/path']);
    const row = f.rows().find(row => row.id === 'work');
    assert.equal(row.editable, true); assert.deepEqual(row.selection.address.instancePath, ['first/path']);
    const library = api.prepareLibraryViews(shared.id, shared.definitions); assert.equal(library.ok, true);
    const librarySession = createGraphViewSession({ root: shared, activationId: 'library', preparedViews: [...f.prepared.preparedViews, ...library.data.preparedViews], navigation: [...f.prepared.navigation, ...library.data.navigation] }).data;
    assert.equal(librarySession.openLibrary(library.data.preparedViews[0].definitionRef).ok, true);
    const readonly = api.projectNodeProfiles(librarySession.readEditor(), f.view(), 'library:1').find(row => row.id === 'work');
    assert.equal(readonly.editable, false); assert.equal(readonly.selection.address.kind, 'library');
});

test('imported wand helpers can select Active with no saved profiles and library views retain the choice',async()=>{
 const {installWorkflowExample}=await import('../src/workflow/examples.js?v=0.27.2');
 const installed=installWorkflowExample('unified-broken-wand',{graphs:{},nativeBindings:{workflowGraphId:null},enabled:false});
 assert.equal(installed.ok,true,JSON.stringify(installed));
 const root=installed.data.graph, prepared=api.prepareWorkspaceViews(root,{profiles:[],activeModel:{apiLabel:'Host API',model:'host-model'}});
 assert.equal(prepared.ok,true,JSON.stringify(prepared));
 const roles=prepared.data.preparedViews.flatMap(view=>Object.values(view.drawBase.iterationBindings??{}).flatMap(bindings=>bindings.roles));
 assert.ok(roles.some(row=>row.role==='decision'));assert.ok(roles.some(row=>row.role==='effectAuthor'));
 for(const role of roles)assert.deepEqual(role.profile.options,[{value:activeId,label:'Active SillyTavern model'}]);
 const library=api.prepareLibraryViews(root.id,root.definitions);assert.equal(library.ok,true);
 for(const view of library.data.preparedViews)for(const bindings of Object.values(view.drawBase.iterationBindings??{}))for(const role of bindings.roles)assert.deepEqual(role.profile.options,[{value:activeId,label:'Active SillyTavern model'}]);
});

test('unified creation projects active profiles on every current text model operation and conditional mode', () => {
    let root = { id: 'unified-profile-catalog', schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, portals: {}, definitions: {} };
    const cases = [
        ['smart-compactor', { method: 'compress' }, 'pre'], ['response-plan', {}, 'pre'],
        ...['repair', 'contextual', 'strict'].map(mode => ['repair', { mode }, 'post']),
        ...['narration', 'character-voice', 'rhythm', 'register'].map(mode => ['style-transfer', { mode }, 'post']),
        ['style-transfer', { inputKind: 'text' }, 'pre'], ['format-transfer', {}, 'post'], ['format-transfer', { inputKind: 'text' }, 'pre'],
        ...['character', 'recall', 'scene'].map(mode => ['reflect', { mode }, 'pre']),
        ...['experience', 'pattern', 'recovery'].map(mode => ['internalize', { mode }, 'pre']),
        ['express', { mode: 'inner-voice' }, 'pre'], ['context', { mode: 'focus', method: 'compress' }, 'pre'],
        ['decision', {}, 'pre'], ['model-call', {}, 'pre'], ['model-call', { outputKind: 'data' }, 'pre'], ['enrich', {}, 'pre'],
        ['extract', { mode: 'model' }, 'post'], ['extract', { mode: 'model', inputKind: 'text' }, 'pre'], ['revise-draft', {}, 'post'],
        ...['recall', 'create', 'recall-or-create'].map(mode => ['prompted-memory', { actorId: 'character:mara', mode }, 'pre']),
        ['character-direction', { actorId: 'character:mara' }, 'pre'], ['item-use-trigger', { itemId: 'wand', mode: 'extract' }, 'post'],
        ['effect-author', {}, 'pre'],
    ];
    const addedIds = cases.map(([operation, controls, phase], index) => {
        const created = prepareNativeConnectionEdit(root, { kind: 'create', operation, controls, phase, graphPoint: { x: index * 100, y: 0 } });
        assert.equal(created.ok, true, operation + ':' + JSON.stringify(controls) + ' ' + JSON.stringify(created.error));
        root = created.data.candidate;
        const id = created.data.addedNodeIds[0];
        assert.equal(root.nodes[id].profileId, activeId, operation + ':' + JSON.stringify(controls));
        return id;
    });
    const rows = fixture(root).rows();
    assert.deepEqual(rows.map(row => row.id).sort(), [...addedIds].sort());
    for (const row of rows) {
        assert.equal(row.value, activeId); assert.equal(row.label, 'Active SillyTavern model'); assert.equal(row.model, 'host-model');
        assert.equal(row.options[0].value, activeId); assert.equal(row.editable, true);
        assert.deepEqual(row.selection.address, { workflowId: root.id, instancePath: [], nodeId: row.id });
    }
});

test('unified deterministic modes and host operations omit profile bars', () => {
    let root = { id: 'unified-profile-free', schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, portals: {}, definitions: {} };
    for (const [operation, controls, phase] of [
        ['smart-compactor', { method: 'select' }, 'pre'], ['repair', { mode: 'scan' }, 'post'], ['repair', { mode: 'inspect' }, 'post'],
        ['express', { mode: 'behavior' }, 'pre'], ['express', { mode: 'attention' }, 'pre'],
        ['context', { mode: 'assemble' }, 'pre'], ['context', { mode: 'perspective', actorId: 'character:mara' }, 'pre'], ['context', { mode: 'focus', method: 'select' }, 'pre'],
        ['extract', { mode: 'literal' }, 'post'], ['extract', { mode: 'literal', inputKind: 'text' }, 'pre'],
        ['item-use-trigger', { itemId: 'wand', mode: 'candidates' }, 'post'],
        ['on-send', {}, 'pre'], ['draft-event-source', {}, 'post'], ['review-publish', {}, 'post'],
        ['read-file', { targetId: 'story-notes' }, 'pre'], ['story-clock', { clockId: 'story-clock' }, 'pre'],
        ['time-trigger', { scheduleId: 'curse' }, 'post'], ['state', { mode: 'value' }, 'pre'],
    ]) {
        const created = prepareNativeConnectionEdit(root, { kind: 'create', operation, controls, phase, graphPoint: { x: 0, y: 0 } });
        assert.equal(created.ok, true, operation + ':' + JSON.stringify(controls) + ' ' + JSON.stringify(created.error));
        root = created.data.candidate;
    }
    assert.deepEqual(fixture(root).rows(), []);
});
