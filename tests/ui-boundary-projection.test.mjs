import test from 'node:test';
import assert from 'node:assert/strict';
import { siblingWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
import { makeLocalCopy } from '../src/workflow/definition-library.js?v=0.27.2';
import { prepareWorkspaceViews, prepareLibraryViews, projectEditorDraw, projectWorkspacePanels } from '../src/ui/workspace-preparation.js?v=0.27.2';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.2';
import { projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.2';
import { nodeCard } from '../src/canvas/presentation.js?v=0.27.2';

test('boundary cards and details expose the declared port identity and semantic label for owned and pinned bodies', () => {
    const local = makeLocalCopy(siblingWorkflow(), { instancePath: ['first/path'], id: 'private-plan' }); assert.equal(local.ok, true, JSON.stringify(local));
    const root = local.data.candidate, before = structuredClone(root), prepared = prepareWorkspaceViews(root), library = prepareLibraryViews(root.id, root.definitions);
    assert.equal(prepared.ok, true, JSON.stringify(prepared)); assert.equal(library.ok, true, JSON.stringify(library));
    const session = createGraphViewSession({ root, activationId: 'boundary', navigation: [...prepared.data.navigation, ...library.data.navigation], preparedViews: [...prepared.data.preparedViews, ...library.data.preparedViews] }).data;
    for (const [path, editable] of [[['first/path'], true], [['second'], false]]) {
        assert.equal(session.openInstance(path).ok, true);
        for (const [id, direction, portId, label, kind, required] of [['entry', 'input', 'scene', 'Scene', 'context', true], ['exit', 'output', 'proposal', 'Proposal', 'guidance', false]]) {
            session.updateView({ selection: { primary: { kind: 'node', id }, multi: [] }, nodePresentation: { [id]: { alias: 'Visual alias' } } });
            const drawing = projectEditorDraw(session.readEditor()), card = nodeCard(drawing.nodes[id], { graph: drawing });
            assert.equal(card.title, label, 'semantic port label heads the boundary even if an old presentation alias exists');
            assert.deepEqual(card.boundary, { direction, editable });
            const workflow = projectPreparedWorkflow(prepared.data.workflow, { viewPath: path, selectedId: id });
            const panel = projectWorkspacePanels(session.readEditor(), workflow, { busy: false }, 'boundary:1', null, null).nodeDetails;
            assert.ok(panel); assert.equal(panel.title, label); assert.equal(panel.readOnly, !editable);
            assert.deepEqual(panel.boundary, { id: portId, label, direction, kind, required, kinds: ['context', 'draft', 'patches', 'candidate', 'guidance', 'text', 'data'] });
            assert.deepEqual(panel.address, { workflowId: root.id, instancePath: path, nodeId: id });
        }
    }
    const ref = library.data.preparedViews[0].definitionRef;
    assert.equal(session.openLibrary(ref).ok, true); session.updateView({ selection: { primary: { kind: 'node', id: 'entry' }, multi: [] } });
    const editor = session.readEditor(), drawing = projectEditorDraw(editor), card = nodeCard(drawing.nodes.entry, { graph: drawing });
    assert.deepEqual(card.boundary, { direction: 'input', editable: false });
    const panel = projectWorkspacePanels(editor, { graphId: root.id, selectedId: 'unrelated', nodes: [], profiles: [], targets: [], rows: [], issues: [], callBound: 0 }, { busy: false }, 'library:1', null, null).nodeDetails;
    assert.equal(panel.readOnly, true); assert.equal(panel.boundary.id, 'scene'); assert.equal(panel.title, 'Scene');
    assert.deepEqual(root, before, 'display projection does not author presentation or change definition metadata');
});
