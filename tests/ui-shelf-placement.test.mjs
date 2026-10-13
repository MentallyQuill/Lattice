import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { starterGraph } from '../src/workflow/starters.js?v=0.27.3';
import { prepareNativeConnectionEdit } from '../src/workflow/connection-edits.js?v=0.27.3';
import { checkedCandidateArtifacts } from '../src/workflow/checked-candidate.js?v=0.27.3';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js?v=0.27.3';
import * as preparation from '../src/ui/workspace-preparation.js?v=0.27.3';
import * as history from '../src/history.js?v=0.27.3';

test('actual shelf placement measures only the new checked card and commits final coordinates once', async () => {
    const root = starterGraph('unified-basic'); history.reset(root);
    const original = structuredClone(root), context = {sessionId:'shelf-placement',viewPath:[],readOnly:false};
    const capture = captureGraphEditContext(root, () => context).data;
    const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
    const start = source.indexOf('function prepareShelfNodeCreation('), end = source.indexOf('\n}', start) + 2;
    let measured, cancellations = 0;
    const env = {
        prepareNativeCreation: (_, command) => prepareNativeConnectionEdit(root, {...command,viewPath:[]}),
        prepareNodePlacementCard: preparation.prepareNodePlacementCard, checkedCandidateArtifacts,
        prepareNodePlacement: () => assert.fail('Admitted shelf measurement must not repeat raw-root admission'),
        prepareWorkspaceViews: () => assert.fail('Placement must not prepare workflow, run, profile and all-card projections'),
        workspaceInputs: () => assert.fail('Placement must not consult host binding preparation'),
        scopeCommand: () => ({viewPath:[]}),
        canvas: {cancelGesture(){cancellations++;}, nodeLayer:{}, host:{getBoundingClientRect:()=>({left:10,top:20,width:1000,height:800})},toGraph:(x,y)=>({x:x-10,y:y-20})},
        measureNodeCard: (_, card) => {measured=card;return {width:240,height:100};},
    };
    const place = Function('env', 'with(env){'+source.slice(start,end)+';return prepareShelfNodeCreation;}')(env);
    const result = place(capture, {kind:'create',operation:'scene-context'});
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(cancellations,1); assert.equal(measured.title,'Scene Context');
    const id = result.data.addedNodeIds[0];
    assert.equal(result.data.candidate.nodes[id].x,380); assert.equal(result.data.candidate.nodes[id].y,350);
    assert.deepEqual(root,original,'Measuring and repreparing cannot mutate the active root');
    const committed = commitPreparedGraph(root,{...result.data,context:capture});
    assert.equal(committed.ok,true,JSON.stringify(committed)); assert.equal(root.nodes[id].x,380);
    assert.ok(history.undo(root)); assert.equal(history.undo(root),null); assert.deepEqual(root.nodes,original.nodes);
});
