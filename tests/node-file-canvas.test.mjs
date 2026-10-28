import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './canvas-fixture.mjs';
import { prepareWorkspaceViews, projectNodeProfiles } from '../src/ui/workspace-preparation.js?v=0.29.0';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.29.0';
import { projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.29.0';

const fileTarget = { bindingId: 'disk-notes', name: 'campaign-notes.md', format: 'markdown', missing: 'create', content: '', visibility: { kind: 'public' } };

test('ready source and inherited destination retain the configured filename without a model profile', () => {
    const root = { id: 'canvas-files', schema: 3, runtime: 2, mode: 'native-unified', nodes: { read: { id: 'read', type: 'workflow', operation: 'read-file', targetId: 'notes', fileTarget, x: 0, y: 0 }, write: { id: 'write', type: 'workflow', operation: 'write-file', destinationMode: 'connected', x: 300, y: 0 }, format: { id: 'format', type: 'workflow', operation: 'format', x: 600, y: 0 } }, wires: { reference: { id: 'reference', route: 'wire', from: 'read', fromPort: 'reference', to: 'write', toPort: 'reference' } }, groups: {}, definitions: {}, portals: {} };
    const prepared = prepareWorkspaceViews(root, { workflowData: { available: true, documents: [], nodeFiles: { supported: true, bindings: { 'disk-notes': { name: 'campaign-notes.md', format: 'markdown', status: 'ready' } } } } });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root, activationId: 'canvas-files', ...prepared.data }).data;
    const editor = session.readEditor(), workflow = projectPreparedWorkflow(prepared.data.workflow), rows = projectNodeProfiles(editor, workflow, 'r1');
    for (const id of ['read', 'write']) {
        const row = rows.find(row => row.id === id);
        assert.ok(row, id + ' retains its filename decoration after setup is complete');
        assert.equal(row.readiness.state, 'ready');
        assert.equal(row.fileLabel, 'campaign-notes.md');
        assert.equal(row.hasProfile, false); assert.equal(row.model, ''); assert.equal(row.label, '');
        assert.deepEqual(row.selection.address, { workflowId: 'canvas-files', instancePath: [], nodeId: id });
    }
    assert.equal(rows.some(row => row.id === 'format'), false, 'a pure transform has no file decoration');
});

test('filename decoration survives readiness clearing without moving card pins or showing model controls', async () => {
    const env = fixture();
    try {
        const before = env.canvas.endpoint('b', 'in', 'in'), selection = { selectionKey: 'b', revision: 'r1', address: { workflowId: env.graph.id, instancePath: [], nodeId: 'b' } };
        const row = { id: 'b', selection, value: '', label: '', model: '', fileLabel: 'campaign-notes.md', hasProfile: false, editable: true, options: [], readiness: { state: 'setup', label: 'Setup Required', description: 'Choose a location', issues: [], deferred: [] } };
        env.canvas.setNodeProfiles([row]);
        const stack = env.host.querySelector('.pc-node-decoration-stack');
        assert.equal(stack.querySelector('.node-file-meta')?.textContent, 'campaign-notes.md');
        assert.ok(stack.querySelector('.pc-node-readiness'));
        env.canvas.setNodeProfiles([{ ...row, readiness: { state: 'ready', label: 'Ready', description: '', issues: [], deferred: [] } }]);
        const profile = env.host.querySelector('.pc-node-profile[data-id="b"]'), filename = profile?.querySelector('.node-file-meta');
        assert.ok(filename, 'the last non-model filename decoration cannot be filtered out');
        assert.equal(filename.title, 'campaign-notes.md');
        assert.equal(filename.getAttribute('aria-label'), 'File: campaign-notes.md');
        assert.equal(profile.getAttribute('aria-label'), 'Node file');
        assert.equal(profile.querySelector('.pc-node-readiness'), null);
        assert.equal(profile.querySelector('.node-model-meta'), null);
        assert.equal(profile.querySelector('.profile-picker'), null);
        assert.deepEqual(env.canvas.endpoint('b', 'in', 'in'), before);
        assert.deepEqual(env.canvas.visualBoundsOf(env.b), { x: 350, y: 7, w: 160, h: 91 }, 'fallback framing reserves filename space above the existing card');
    } finally { await env.canvas.destroy(); }
});
