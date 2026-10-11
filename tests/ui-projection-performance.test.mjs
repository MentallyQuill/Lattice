import test from 'node:test';
import assert from 'node:assert/strict';
import * as preparation from '../src/ui/workspace-preparation.js?v=0.27.0';
import { prepareWorkflowProjection, projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.0';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.0';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
import { prepareGraphCandidate } from '../src/workflow/composition.js?v=0.27.0';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js?v=0.27.0';
import * as history from '../src/history.js?v=0.27.0';
import { runWorkflow } from '../src/workflow/runtime.js?v=0.27.0';

test('endpoint attachments visit each wire once and retain direct and portal navigation', () => {
    assert.equal(typeof preparation.prepareEndpointAttachments, 'function');
    let edgeReads = 0;
    const wires = {};
    for (let i = 0; i < 80; i++) {
        const edge = { id: 'w' + i, route: 'wire', from: 'source', fromPort: 'out', to: 'n' + i, toPort: 'in' };
        Object.defineProperty(edge, 'from', { enumerable: true, get() { edgeReads++; return 'source'; } });
        wires[edge.id] = edge;
    }
    wires.subscriber = { id: 'subscriber', route: 'portal', portalId: 'p', to: 'n0', toPort: 'in' };
    const nativeCards = Object.fromEntries(['source', ...Array.from({ length: 80 }, (_, i) => 'n' + i)].map(id => [id, { canonicalTitle: id, ports: [{ port: id === 'source' ? 'out' : 'in', dir: id === 'source' ? 'out' : 'in', label: id }] }]));
    const attached = preparation.prepareEndpointAttachments({ nativeCards, wires, portals: { p: { id: 'p', label: 'Published', source: { nodeId: 'source', portId: 'out' } } } });
    assert.ok(edgeReads <= 160, 'wire endpoint indexing must be linear, reads=' + edgeReads);
    assert.equal(attached[JSON.stringify(['source', 'out', 'out'])].jumps.length, 81);
    assert.deepEqual(attached[JSON.stringify(['n0', 'in', 'in'])].originalBindings, [{ kind: 'direct', id: 'w0' }, { kind: 'portal', id: 'subscriber', portalId: 'p' }]);
});

test('camera and runtime publications retain immutable authored controls and unchanged run rows', () => {
    const root = fixtureGraph('structured-guidance'), prepared = preparation.prepareWorkspaceViews(root);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root, activationId: 'stable-panels', ...prepared.data }).data;
    const workflow = projectPreparedWorkflow(prepared.data.workflow, { selectedId: 'compose-json' });
    const panel = (revision, state = {}) => preparation.projectWorkspacePanels({ ...session.readEditor(), documentNamespace: 'retained-document' }, workflow, state, revision, null, null, workflow, prepared.data.idleRunRows);
    const first = panel('before');
    session.updateView({ camera: { x: 12, y: 34, zoom: .8 } });
    const next = panel('after', { status: 'Running elsewhere' });
    assert.equal(next.nodeDetails.controls, first.nodeDetails.controls);
    assert.equal(next.nodeDetails.ports, first.nodeDetails.ports);
    assert.equal(next.runDetails, first.runDetails);
    assert.equal(next.nodeDetails.editorContractKey, first.nodeDetails.editorContractKey);
    assert.equal(typeof next.nodeDetails.editorContractKey, 'string');
    assert.equal(next.nodeDetails.documentNamespace, 'retained-document');
    assert.equal(next.nodeDetails.revision, 'after');
    assert.equal(Object.isFrozen(next.nodeDetails.controls), true);
});

test('workflow projection summarizes only root and actual selected targets lazily', () => {
    const root = fixtureGraph('structured-guidance');
    const originalSet = Map.prototype.set;
    let summaries = 0;
    Map.prototype.set = function(key, value) {
        if (value && typeof value === 'object' && Object.hasOwn(value, 'callBound') && Object.hasOwn(value, 'issues') && Object.hasOwn(value, 'requiredBindingAddresses')) summaries++;
        return originalSet.call(this, key, value);
    };
    try {
        const prepared = prepareWorkflowProjection(root);
        const rootView = projectPreparedWorkflow(prepared);
        assert.equal(typeof rootView.callBound, 'number');
        assert.equal(summaries, 0, 'no target summaries should be prepared');
        const selectedTarget = rootView.targets[0];
        assert.ok(selectedTarget);
        const first = projectPreparedWorkflow(prepared, { selectedTarget });
        assert.equal(summaries, 1, 'one selected target summary is prepared');
        assert.equal(projectPreparedWorkflow(prepared, { selectedTarget }).targetSummary, first.targetSummary);
        assert.equal(summaries, 1, 'repeated selected target uses its summary');
        projectPreparedWorkflow(prepared, { selectedTarget: { ...selectedTarget, nodeId: 'unknown' } });
        assert.equal(summaries, 1, 'arbitrary invalid targets never enter summary cache');
    } finally { Map.prototype.set = originalSet; }
});

test('connection capability updates retain unrelated selected controls and schema', () => {
    const root = fixtureGraph('structured-guidance'), prepared = preparation.prepareWorkspaceViews(root);
    const session = createGraphViewSession({ root, activationId: 'capabilities', ...prepared.data }).data;
    const workflow = projectPreparedWorkflow(prepared.data.workflow, { selectedId: 'compose-json' });
    const first = preparation.projectWorkspacePanels(session.readEditor(), workflow, {}, 'one', null, null);
    const next = preparation.projectWorkspacePanels(session.readEditor(), { ...workflow, profiles: [{ id: 'new-profile', name: 'New profile' }] }, {}, 'two', null, null);
    assert.equal(next.nodeDetails.controls, first.nodeDetails.controls);
    assert.equal(next.nodeDetails.ports, first.nodeDetails.ports);
});

test('unchanged selected Details and preview payloads survive runtime status updates', () => {
    const root = fixtureGraph('structured-guidance'), prepared = preparation.prepareWorkspaceViews(root);
    const session = createGraphViewSession({ root, activationId: 'display-identity', ...prepared.data }).data;
    const workflow = projectPreparedWorkflow(prepared.data.workflow, { selectedId: 'compose-json' });
    const source = Object.freeze([{ kind: 'text', format: 'structured-text', text: 'Output', truncated: false, readable: { kind: 'text', text: 'Output', truncated: false } }]);
    const displayed = { ...workflow, result: { ok: true, sections: source, source: Object.freeze({ format: 'structured-text', text: '{"kind":"text","text":"Output"}', truncated: false, policy: 'safe-recording' }) } };
    const first = preparation.projectWorkspacePanels(session.readEditor(), displayed, {}, 'one', null, null);
    const next = preparation.projectWorkspacePanels(session.readEditor(), displayed, { status: 'Unrelated runtime message' }, 'one', null, null);
    assert.equal(next.nodeDetails, first.nodeDetails);
    assert.equal(next.outputPreview.sections, first.outputPreview.sections);
    assert.equal(next.outputPreview.choices, first.outputPreview.choices);
});

test('retained artifact Source and Readable references survive new recording status envelopes', async () => {
    const root = fixtureGraph('structured-guidance');
    const target = { workflowId: root.id, instancePath: [], nodeId: 'compose-json', portId: 'out' };
    const result = await runWorkflow(root, { target });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const prepared = preparation.prepareWorkspaceViews(root);
    const session = createGraphViewSession({ root, activationId: 'retained-source', ...prepared.data }).data;
    const first = projectPreparedWorkflow(prepared.data.workflow, { selectedTarget: target, result });
    assert.equal(first.result.sections[0].readable.kind, 'text');
    assert.equal(first.result.source.policy, 'safe-recording');
    assert.equal(JSON.parse(first.result.source.text).kind, 'text');
    const recording = Object.freeze({ ...result.recording, status: 'running' });
    const next = projectPreparedWorkflow(prepared.data.workflow, { selectedTarget: target, result, recording, status: 'Other step running' });
    assert.strictEqual(next.result.sections, first.result.sections);
    assert.strictEqual(next.result.source, first.result.source);
    const before = preparation.projectWorkspacePanels(session.readEditor(), first, {}, 'same', target, null).outputPreview;
    const after = preparation.projectWorkspacePanels(session.readEditor(), next, { status: 'Other step running' }, 'same', target, null).outputPreview;
    assert.strictEqual(after.source, before.source);
    assert.strictEqual(after.sections, before.sections);
    assert.strictEqual(after.sections[0].readable, before.sections[0].readable);
});

for (const [fixture, selectedId] of [['structured-guidance', 'compose-json'], ['native-guidance', 'response-plan']]) {
    test('verified coordinate commit retains selected authored Details for ' + selectedId, () => {
        const root = fixtureGraph(fixture); history.reset(root);
        const prepared = preparation.prepareWorkspaceViews(root, { profiles: [{ id: 'connection', name: 'Connection' }], resolveBinding: () => ({ ok: true, data: { profileId: 'connection', model: 'model' } }) });
        assert.equal(prepared.ok, true, JSON.stringify(prepared));
        const session = createGraphViewSession({ root, activationId: 'coordinate-details', ...prepared.data }).data;
        const workflow = projectPreparedWorkflow(prepared.data.workflow, { selectedId });
        const panel = revision => preparation.projectWorkspacePanels({ ...session.readEditor(), documentNamespace: 'retained-coordinate-document' }, workflow, {}, revision, null, null, workflow, prepared.data.idleRunRows);
        const before = panel('before'), oldEntry = session.readEditor().prepared;
        const context = captureGraphEditContext(root, () => session.readEditContext()); assert.equal(context.ok, true);
        const candidate = structuredClone(root); candidate.nodes[selectedId].x = 333; candidate.nodes[selectedId].y = 444;
        const transition = prepareGraphCandidate(root, candidate); assert.equal(transition.ok, true, JSON.stringify(transition));
        const committed = commitPreparedGraph(root, { ...transition.data, context: context.data }); assert.equal(committed.ok, true, JSON.stringify(committed));
        assert.equal(session.applyCommittedCoordinates(committed.data).ok, true);
        assert.notEqual(session.readEditor().prepared, oldEntry, 'coordinate patch installs a new prepared entry');
        const after = panel('after');
        assert.equal(after.nodeDetails.controls, before.nodeDetails.controls);
        assert.equal(after.nodeDetails.ports, before.nodeDetails.ports);
        assert.ok(before.nodeDetails.guideCard);
        assert.equal(after.nodeDetails.guideCard, before.nodeDetails.guideCard);
        assert.equal(after.nodeDetails.model, before.nodeDetails.model);
        if (selectedId === 'response-plan') assert.ok(after.nodeDetails.model, 'test exercises retained model binding data');
        assert.notEqual(after.nodeDetails, before.nodeDetails, 'write envelope advances independently of authored payloads');
        assert.equal(after.nodeDetails.revision, 'after');
        assert.equal(after.nodeDetails.editorContractKey, before.nodeDetails.editorContractKey);
    });
}
