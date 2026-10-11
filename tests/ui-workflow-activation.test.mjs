import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installMock } from './mock.js';
import { starterGraph } from '../src/workflow/starters.js?v=0.26.0';
import { prepareWorkflowProjection, projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.26.0';
import { createWorkflowDocumentController } from '../src/ui/document-controller.js?v=0.26.0';
import { serializeWorkflowDocument } from '../src/workflow/document-file.js?v=0.26.0';
installMock();
const S = await import('../src/state.js?v=0.26.0');
const ok = data => ({ ok: true, data });
function fixture() {
    const original = S.createGraph('Current graph');
    S.activateWorkflow(original, { clean: true, source: { name: 'current.workflow.json' } });
    const imported = S.createGraph('Imported graph'), prompts = [];
    const files = { native: true, recents: () => [], clearRecent: async () => ok({}), open: async () => ok({ text: serializeWorkflowDocument(imported).data.json, source: { name: 'imported.workflow.json' } }), save: async () => ok({ source: { name: 'saved.workflow.json' }, downloaded: false }) };
    const env = { session: S.documentSession, files, create: () => S.createGraph('Untitled'), views: S.activeWorkspaceViews, recovery: S.recoveredWorkflows, activate: S.activateWorkflow, prompt: async name => { prompts.push(name); return 'discard'; } };
    return { original, imported, files, env, prompts, controller: createWorkflowDocumentController(env) };
}

test('New activates one detached document through the public lifecycle', async () => {
    const f = fixture(), events = [], unsubscribe = S.onWorkflowActivated(event => events.push(event));
    try {
        const result = await f.controller.newDocument(); assert.equal(result.ok, true);
        assert.notEqual(S.activeWorkflow(), f.original); assert.equal(S.activeWorkflow().name, 'Untitled');
        assert.equal(S.settings().recoveryDraft.graph.id, S.activeWorkflow().id);
        assert.equal(events.length, 1); assert.equal(events[0].previous, f.original); assert.equal(events[0].graph, S.activeWorkflow());
        assert.equal(S.documentSession.source(), null); assert.equal(S.documentSession.dirty(), true);
        assert.equal(Object.hasOwn(S.settings(), 'graphs'), false);
    } finally { unsubscribe(); }
});

test('cancelled document replacement preserves the active root and disk source', async () => {
    const f = fixture(), source = S.documentSession.source(); f.original.name = 'Edited graph'; S.touchGraph(f.original); f.env.prompt = async () => 'cancel';
    const result = await f.controller.newDocument(); assert.equal(result.ok, false);
    assert.equal(S.activeWorkflow(), f.original); assert.equal(S.documentSession.source(), source); assert.equal(S.documentSession.dirty(), true);
    assert.equal(S.settings().recoveryDraft.graph.name, 'Edited graph');
});

test('captured replacement guard cannot switch roots after another public activation', async () => {
    const f = fixture(); f.original.name = 'Edited graph'; let finish;
    f.env.prompt = () => new Promise(resolve => { finish = resolve; });
    const pending = f.controller.newDocument(); await Promise.resolve(); await Promise.resolve();
    assert.equal(typeof finish, 'function');
    const next = S.createGraph('Externally opened graph'); next.id = f.original.id;
    S.activateWorkflow(next, { clean: true, source: { name: 'other.workflow.json' } }); finish('discard');
    const result = await pending; assert.equal(result.ok, false); assert.equal(S.activeWorkflow(), next); assert.equal(S.documentSession.source().name, 'other.workflow.json');
});

test('Open activates the validated disk document and preserves its clean checkpoint', async () => {
    const f = fixture(); f.original.name = 'Edited graph';
    const result = await f.controller.open(); assert.equal(result.ok, true);
    assert.equal(S.activeWorkflow().id, f.imported.id); assert.equal(S.activeWorkflow().name, 'Imported graph');
    assert.equal(S.documentSession.source().name, 'imported.workflow.json'); assert.equal(S.documentSession.dirty(), false);
    assert.equal(f.prompts.length, 1); assert.equal(S.settings().recoveryDraft.graph.id, f.imported.id);
});

test('public activation refreshes the cached current workflow preparation', async () => {
    const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
    const start = source.indexOf('function refreshWorkflowPreparation('), end = source.indexOf('\n}', start) + 2;
    assert.ok(start >= 0);
    const first = starterGraph('native-guidance'), second = starterGraph('unified-basic'); second.name = 'New current workflow';
    S.activateWorkflow(first, { clean: true });
    const env = { current: first, workspacePrepared: { workflow: prepareWorkflowProjection(first) }, workspaceInputs: () => ({}), prepareWorkflowProjection };
    const refresh = Function('env', 'with(env){' + source.slice(start, end) + ';return refreshWorkflowPreparation;}')(env);
    const cached = env.workspacePrepared.workflow;
    const unsubscribe = S.onWorkflowActivated(({ graph }) => { env.current = graph; refresh(); });
    try {
        S.activateWorkflow(second, { clean: true });
        assert.notEqual(env.workspacePrepared.workflow, cached);
        assert.equal(projectPreparedWorkflow(env.workspacePrepared.workflow).graphId, second.id);
        assert.equal(projectPreparedWorkflow(env.workspacePrepared.workflow).name, 'New current workflow');
        assert.equal(projectPreparedWorkflow(env.workspacePrepared.workflow).phase, 'unified');
        assert.equal(Object.hasOwn(projectPreparedWorkflow(env.workspacePrepared.workflow), 'assigned'), false);
    } finally { unsubscribe(); }
});
