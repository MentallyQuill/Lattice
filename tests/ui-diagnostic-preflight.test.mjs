import assert from 'node:assert/strict';
import test from 'node:test';
import { starterGraph } from '../src/workflow/starters.js?v=0.27.2';
import { prepareWorkflowPlanner } from '../src/workflow/resolve.js?v=0.27.2';
import { unifiedRecipeHost } from './helpers/unified-recipe-host.mjs';
import { prepareWorkflowProjection, projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.2';
import { prepareWorkspaceViews, projectWorkspacePanels } from '../src/ui/workspace-preparation.js?v=0.27.2';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.2';
import { previewDiagnostics } from '../src/ui/preview-diagnostics.js?v=0.27.2';
import { presentDiagnostic } from '../src/ui/diagnostics.js?v=0.27.2';

test('planner identifies only selected dependency paths that need SillyTavern generation', () => {
    const graph = starterGraph('unified-basic');
    graph.nodes.text = { id: 'text', type: 'workflow', operation: 'compose', phase: 'post', sections: [{ name: 'Text', text: 'Independent preview' }] };
    const prepared = prepareWorkflowPlanner(graph);
    assert.equal(prepared.ok, true);
    const draft = prepared.data.summarize({ workflowId: graph.id, instancePath: [], nodeId: 'generate-reply', portId: 'draft' });
    assert.equal(draft.ok, true);
    assert.equal(draft.data.requiresNativeGeneration, true);
    const text = prepared.data.summarize({ workflowId: graph.id, instancePath: [], nodeId: 'text', portId: 'out' });
    assert.equal(text.ok, true);
    assert.equal(text.data.requiresNativeGeneration, false);
});

test('Preview shows a concrete preparation failure without a second generic empty-state complaint', () => {
    const graph = starterGraph('unified-basic');
    graph.nodes.text = { id: 'text', type: 'workflow', operation: 'compose', phase: 'post', sections: [{ name: 'Text', text: 'Independent preview' }] };
    const prepared = prepareWorkspaceViews(graph).data;
    const editor = createGraphViewSession({ root: graph, activationId: 'diagnostic-preview', ...prepared }).data.readEditor();
    const target = { workflowId: graph.id, instancePath: [], nodeId: 'text', portId: 'out' };
    const state = { availability: 'current', busy: false, preparationError: { code: 'BINDING_MISSING', message: 'Choose a connection profile from the dropdown beneath this node.' } };
    const view = projectPreparedWorkflow(prepared.workflow, { ...state, selectedTarget: target });
    const panel = projectWorkspacePanels(editor, view, state, 'revision', target, null).outputPreview;
    assert.equal(panel.emptyMessage, '');
    assert.equal(panel.diagnostics.length, 1);
    assert.match(panel.diagnostics[0].message, /connection/i);
    assert.ok(!panel.diagnostics[0].message.includes('artifact'));
});

test('native target projection explains manual restriction without invalidating ordinary Send', () => {
    const graph = starterGraph('unified-basic');
    const prepared = prepareWorkflowProjection(graph);
    const root = projectPreparedWorkflow(prepared);
    assert.deepEqual(root.issues, []);
    const target = { workflowId: graph.id, instancePath: [], nodeId: 'generate-reply', portId: 'draft' };
    const selected = projectPreparedWorkflow(prepared, { selectedTarget: target });
    assert.equal(selected.targetSummary.requiresNativeGeneration, true);
    assert.match(selected.targetSummary.issues.join(' '), /send a message/i);
    assert.equal(selected.diagnostics[0].severity, 'info');
});

test('Run details retain the originating support code and addressed cause', () => {
    const graph = starterGraph('unified-basic');
    const prepared = prepareWorkspaceViews(graph).data;
    const editor = createGraphViewSession({ root: graph, activationId: 'diagnostic-rows', ...prepared }).data.readEditor();
    const address = { workflowId: graph.id, instancePath: [], nodeId: 'generate-reply' };
    const error = { code: 'REQUEST_FAILED', message: 'The provider request failed.' };
    const workflow = projectPreparedWorkflow(prepared.workflow);
    workflow.rows = [{ address, node: graph.nodes['generate-reply'], kind: 'primitive', status: 'failed', error, executableCount: 1, completedCount: 0 }];
    const panel = projectWorkspacePanels(editor, workflow, { busy: false }, 'revision', null, null).runDetails;
    assert.equal(panel.rows[0].diagnostics[0].technical.code, 'REQUEST_FAILED');
    assert.deepEqual(panel.rows[0].diagnostics[0].address, address);
});

test('model setup retains its actionable binding cause and support code in Details', () => {
    const graph = starterGraph('unified-basic');
    graph.nodes.helper = { id: 'helper', type: 'workflow', operation: 'response-plan' };
    const prepared = prepareWorkflowProjection(graph, { resolveBinding: () => ({ ok: false, error: { code: 'BINDING_MISSING', message: 'Choose a connection profile from the dropdown beneath this node.' } }) });
    const helper = projectPreparedWorkflow(prepared).nodes.find(node => node.id === 'helper');
    assert.equal(helper.issueDiagnostic.technical.code, 'BINDING_MISSING');
    assert.match(helper.issueDiagnostic.message, /connection/i);
});

test('selected preview status stays accurate while another step is running', () => {
    const address = { workflowId: 'workflow', instancePath: [], nodeId: 'selected' };
    const preview = row => previewDiagnostics({ workflow: { rows: [{ address, ...row }] }, state: { busy: true }, target: { ...address, portId: 'out' }, selectedKey: 'selected', sections: [], enabled: true });
    assert.match(preview({ status: 'queued' }).emptyMessage, /waiting.*earlier/i);
    assert.match(preview({ status: 'skipped' }).emptyMessage, /skipped/i);
    assert.match(preview({ status: 'running' }).emptyMessage, /running/i);
    const blocked = preview({ status: 'blocked' });
    assert.equal(blocked.diagnostics[0].technical.code, 'UPSTREAM_FAILED');
    assert.match(blocked.diagnostics[0].message, /earlier step failed/i);
    const failed = preview({ status: 'failed', error: { code: 'REQUEST_FAILED', message: 'The provider request failed.' } });
    assert.equal(failed.emptyMessage, '');
    assert.equal(failed.diagnostics[0].technical.code, 'REQUEST_FAILED');
});

test('Preview uses the selected output state even when its node completed', () => {
    const address = { workflowId: 'workflow', instancePath: [], nodeId: 'branch' };
    const view = previewDiagnostics({ workflow: { result: { previewStatus: 'skipped' }, rows: [{ address, status: 'completed' }] }, state: {}, target: { ...address, portId: 'no' }, selectedKey: 'selected', sections: [], enabled: true });
    assert.match(view.emptyMessage, /skipped/i);
    const running = previewDiagnostics({ workflow: { result: { previewStatus: 'skipped' }, rows: [{ address, status: 'running' }] }, state: { busy: true, availability: 'superseded', runState: {} }, target: { ...address, portId: 'no' }, selectedKey: 'selected', sections: [], enabled: true });
    assert.match(running.emptyMessage, /running/i);
    assert.doesNotMatch(running.emptyMessage, /skipped/);
    const previousError = previewDiagnostics({ workflow: { result: { errorDiagnostic: presentDiagnostic({ code: 'REQUEST_FAILED' }) }, rows: [{ address, status: 'running' }] }, state: { busy: true, availability: 'superseded', runState: {} }, target: { ...address, portId: 'no' }, selectedKey: 'selected', sections: [], enabled: true });
    assert.equal(previousError.diagnostics.length, 0);
    assert.match(previousError.emptyMessage, /running/i);
    const preparing = previewDiagnostics({ workflow: { result: { errorDiagnostic: presentDiagnostic({ code: 'REQUEST_FAILED' }) }, rows: [{ address, status: 'failed', error: { code: 'REQUEST_FAILED' } }] }, state: { busy: true, availability: 'superseded', runState: null }, target: { ...address, portId: 'no' }, selectedKey: 'selected', sections: [], enabled: true });
    assert.equal(preparing.diagnostics.length, 0);
    assert.match(preparing.emptyMessage, /workflow is running/i);
});

test('earlier output notice preserves the reply application outcome', () => {
    const view = previewDiagnostics({ workflow: { result: { ok: true } }, state: { availability: 'stale', status: 'Reply applied locally. Saving is unconfirmed.' }, sections: [{ text: 'Earlier reply' }], selectedKey: 'review' });
    assert.equal(view.statusDetail, 'Reply applied locally. Saving is unconfirmed.');
    assert.match(view.historyNotice, /earlier run/i);
    const issue = presentDiagnostic({ code: 'APPLY_UNVERIFIED' });
    const unverified = previewDiagnostics({ workflow: { result: { ok: true, applyIssue: issue.message, applyDiagnostic: issue } }, state: { status: issue.message }, sections: [], selectedKey: 'review' });
    assert.equal(unverified.statusDetail, '');
    assert.deepEqual(unverified.diagnostics, [issue]);
});

test('manual native generation is rejected before any auxiliary model dependency runs', async () => {
    const graph = starterGraph('unified-basic');
    graph.nodes = {
        context: { id: 'context', type: 'workflow', operation: 'scene-context', visibilityMode: 'public' },
        model: { id: 'model', type: 'workflow', operation: 'response-plan' },
        ...graph.nodes,
    };
    graph.wires.request = { id: 'request', route: 'wire', from: 'context', fromPort: 'out', to: 'model', toPort: 'in' };
    graph.wires.guidance = { id: 'guidance', route: 'wire', from: 'model', fromPort: 'out', to: 'generate-reply', toPort: 'guidance' };
    const host = unifiedRecipeHost(graph, { request: async () => ({ ok: true, data: { text: 'A direction.', finish: 'stop' } }) });
    const result = await host.controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'generate-reply', portId: 'draft' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'NATIVE_OWNER_MISSING');
    assert.equal(host.calls(), 0, 'Unsupported previews must not spend model requests');
    assert.match(result.error.message, /send a message/i);
});


test('cached Run details refresh a changed support code and address even when message text matches', () => {
    const graph = starterGraph('unified-basic');
    const prepared = prepareWorkspaceViews(graph).data;
    const editor = createGraphViewSession({ root: graph, activationId: 'diagnostic-cache', ...prepared }).data.readEditor();
    const workflow = projectPreparedWorkflow(prepared.workflow);
    const cause = { code: 'REQUEST_FAILED', message: 'Same support text', address: { workflowId: graph.id, instancePath: [], nodeId: 'generate-reply' } };
    const first = projectWorkspacePanels(editor, workflow, { preparationError: cause }, 'one', null, null, workflow, prepared.idleRunRows);
    cause.code = 'BINDING_MISSING'; cause.address = { workflowId: graph.id, instancePath: [], nodeId: 'review-publish' };
    const next = projectWorkspacePanels(editor, workflow, { preparationError: cause }, 'two', null, null, workflow, prepared.idleRunRows);
    assert.equal(next.runDetails.diagnostics[0].technical.code, 'BINDING_MISSING');
    assert.deepEqual(next.runDetails.diagnostics[0].address, cause.address);
    assert.equal(first.runDetails.diagnostics[0].technical.code, 'REQUEST_FAILED');
    assert.ok(Object.isFrozen(first.runDetails));
});

test('cached Details includes detached model diagnostics before freezing and refreshes changed cause', () => {
    const graph = starterGraph('unified-basic');
    graph.nodes.helper = { id: 'helper', type: 'workflow', operation: 'response-plan' };
    const prepared = prepareWorkspaceViews(graph, { resolveBinding: () => ({ ok: false, error: { code: 'BINDING_MISSING', message: 'Choose a connection.' } }) }).data;
    const editor = createGraphViewSession({ root: graph, activationId: 'diagnostic-model', ...prepared }).data.readEditor();
    const workflow = projectPreparedWorkflow(prepared.workflow, { selectedId: 'helper' });
    const row = { ...workflow.nodes.find(node => node.id === 'helper') };
    workflow.nodes = workflow.nodes.map(node => node.id === 'helper' ? row : node);
    const first = projectWorkspacePanels(editor, workflow, {}, 'one', null, null).nodeDetails;
    assert.equal(first.model.issueDiagnostic.technical.code, 'BINDING_MISSING');
    assert.ok(Object.isFrozen(first.model.issueDiagnostic));
    row.issueDiagnostic = presentDiagnostic({ code: 'REQUEST_FAILED', address: row.address });
    const next = projectWorkspacePanels(editor, workflow, {}, 'two', null, null).nodeDetails;
    assert.equal(next.model.issueDiagnostic.technical.code, 'REQUEST_FAILED');
    assert.equal(first.model.issueDiagnostic.technical.code, 'BINDING_MISSING');
    assert.strictEqual(next.controls, first.controls);
    assert.equal(next.editorContractKey, first.editorContractKey);
});
