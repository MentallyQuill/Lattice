import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.3';
import { projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.3';
import { prepareWorkspaceViews, projectWorkspacePanels } from '../src/ui/workspace-preparation.js?v=0.27.3';
import { projectNodeGuide, projectCommentGuide } from '../src/ui/node-guide.js?v=0.27.3';

test('Details carries a detached current node card for its guide, including dynamic ports', () => {
    const root = fixtureGraph('structured-guidance');
    const node = root.nodes['compose-json'];
    node.presentation = { alias: 'Scene direction', compact: false };
    node.sections = [{ name: 'Direction', text: 'Keep the scene brief.' }];
    const prepared = prepareWorkspaceViews(root);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({root, activationId: 'guide', ...prepared.data}).data;
    const view = projectPreparedWorkflow(prepared.data.workflow, {selectedId: node.id});
    const details = projectWorkspacePanels(session.readEditor(), view, {}, 'revision', null, null).nodeDetails;
    assert.equal(details.guideKey, 'compose');
    assert.equal(details.guideCard.title, 'Scene direction');
    assert.equal(details.guideCard.x, 0);
    assert.equal(details.guideCard.y, 0);
    assert.ok(details.guideCard.ports.some(port => port.port === 'section.Direction'));
    assert.ok(Object.isFrozen(details.guideCard));
    assert.ok(Object.isFrozen(details.guideCard.ports));
    assert.throws(() => { details.guideCard.ports[0].label = 'Changed only in preview'; }, TypeError);
    const runtime = projectWorkspacePanels(session.readEditor(), view, { busy: true, status: 'Running' }, 'runtime-revision', null, null).nodeDetails;
    assert.strictEqual(runtime.guideCard, details.guideCard, 'unchanged guide card survives runtime publication');
    assert.strictEqual(runtime.controls, details.controls);
    assert.notStrictEqual(runtime, details, 'revision envelope remains fresh');
    assert.notEqual(session.readEditor().prepared.drawBase.nativeCards[node.id].ports[0].label, 'Changed only in preview');
});

test('guide settings explain visible controls and supplementary node and comment options', () => {
    const guide = projectNodeGuide({guideKey: 'compose', operation: 'compose', controls: [{key: 'mode', label: 'Mode'}], phaseEditable: true, modifiers: {}, model: {}, guideCard: null});
    assert.ok(guide.settings.some(setting => setting.key === 'mode'));
    assert.ok(guide.settings.some(setting => setting.key === 'profileId'));
    assert.ok(guide.settings.every(setting => typeof setting.description === 'string' && setting.description.length > 15));
    const comment = projectCommentGuide({id: 'comment', content: 'A scene brief'});
    assert.equal(comment.key, 'comment');
    assert.ok(comment.settings.every(setting => typeof setting.description === 'string' && setting.description.length > 15));
});

test('System guide exposes its run toggle alongside ordinary wrapper settings', () => {
    const guide = projectNodeGuide({ guideKey: 'subgraph', system: true, controls: [], guideCard: null });
    assert.ok(guide.settings.some(setting => setting.key === 'enabled'));
});
