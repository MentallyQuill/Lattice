import { fixtureGraph as starterGraph } from './helpers/workflow-fixtures.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { installMock } from './mock.js';
installMock();
const S = await import('../src/state.js?v=0.27.3');
const { installStarter } = await import('../src/workflow/starters.js?v=0.27.3');
const { prepareWorkflowProjection, projectPreparedWorkflow } = await import('../src/ui/workflow-surface.js?v=0.27.3');
const { prepareWorkspaceViews } = await import('../src/ui/workspace-preparation.js?v=0.27.3');
const project = (root, options) => projectPreparedWorkflow(prepareWorkflowProjection(root, options));
test('preparing the current starter leaves Lattice disabled and the active document unchanged', () => {
    const before = S.activeWorkflow();
    for (const id of ['unified-basic']) {
        const graph = installStarter(id); assert.equal(graph.schema,3); assert.equal(graph.runtime,2);
        assert.equal(S.settings().enabled,false); assert.equal(S.activeWorkflow(),before);
    }
});
test('authored zero-call operation layouts project without connection or model effects', () => {
    let bindings=0;
    for (const id of ['literal-cleanup','structured-guidance']) {
        const view=project(starterGraph(id),{resolveBinding(){bindings++;throw new Error('No model needed');}});
        assert.equal(view.callBound,0); assert.equal(view.issues.length,0);
        assert.equal(view.nodes.some(node=>node.operation==='compose'||node.operation==='text-rules'),true);
    }
    assert.equal(bindings,0);
});
test('current malformed and retired documents produce diagnostics before binding or review effects', () => {
    for (const schema of [1,2,99]) {
        let effects=0; const graph={...starterGraph('native-guidance'),schema};
        const view=project(graph,{resolveBinding(){effects++;},candidateStatus(){effects++;}});
        assert.ok(view.issues.length); assert.equal(view.nodes.length,0); assert.equal(effects,0);
    }
    let reads=0;const graph=starterGraph('structured-guidance');Object.defineProperty(graph.nodes,'secret',{enumerable:true,get(){reads++;throw new Error('getter');}});
    assert.ok(project(graph).issues.length);assert.equal(reads,0);
});
test('Notes receive prepared organization cards with no executable pins', () => {
    const root=starterGraph('structured-guidance');root.nodes.note={id:'note',type:'note',content:'雪 · author note',x:10,y:20};
    const result=prepareWorkspaceViews(root);assert.equal(result.ok,true,JSON.stringify(result));
    const card=result.data.preparedViews[0].drawBase.nativeCards.note;
    assert.equal(card.canonicalTitle,'Note');assert.equal(card.family,'Organization');assert.equal(card.body,'雪 · author note');assert.deepEqual(card.ports,[]);assert.equal(card.hostResult,false);
});
test('valid groups without declared members prepare from actual node membership', async () => {
    const root = starterGraph('structured-guidance'); root.groups.visual = { id: 'visual', title: 'Visual', collapsed: false }; root.nodes['compose-json'].inGroup = 'visual';
    const { exportWorkflow, parseWorkflow } = await import('../src/workflow/packages.js');
    for (const graph of [root, parseWorkflow(JSON.stringify(exportWorkflow(root))).data]) {
        const prepared = prepareWorkspaceViews(graph); assert.equal(prepared.ok, true, JSON.stringify(prepared));
        const view = projectPreparedWorkflow(prepared.data.workflow); assert.deepEqual(view.groups[0].members, ['compose-json']); assert.equal(view.groups[0].callBound, 0);
    }
    const { siblingWorkflow } = await import('./fixtures/workflow-prepared-fixture.mjs');
    const nested = structuredClone(siblingWorkflow()), definition = Object.values(nested.definitions)[0];
    definition.body.groups ??= {}; definition.body.groups.visual = { id: 'visual', title: 'Child visual', collapsed: false }; definition.body.nodes.work.inGroup = 'visual';
    const prepared = prepareWorkspaceViews(nested); assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const child = projectPreparedWorkflow(prepared.data.workflow,{viewPath:['first/path']});assert.deepEqual(child.groups[0].members,['work']);
});
test('plain malformed portable presentation cannot run object coercion during preparation', async () => {
    const root=starterGraph('structured-guidance');root.nodes['compose-json'].alias={toString:false};root.nodes['compose-json'].title={toString:false};root.nodes['compose-json'].compact={toString:false};
    const {exportWorkflow,parseWorkflow}=await import('../src/workflow/packages.js');
    let envelope;try{envelope=exportWorkflow(root);}catch(error){assert.match(error.message,/alias|title|compact|presentation|setting/i);return;}
    const parsed=parseWorkflow(JSON.stringify(envelope));if(!parsed.ok){assert.ok(parsed.error.message);return;}
    let prepared;assert.doesNotThrow(()=>{prepared=prepareWorkspaceViews(parsed.data);});
    if(!prepared.ok){assert.ok(prepared.error.message);return;}
    const view=projectPreparedWorkflow(prepared.data.workflow),node=view.nodes.find(node=>node.id==='compose-json');
    assert.equal(node.alias,'');assert.equal(node.compact,false);assert.equal(node.title,'Compose');
    const draw=prepared.data.preparedViews[0].drawBase;assert.equal(draw.nodes['compose-json'].presentation.alias,'');assert.equal(draw.nodes['compose-json'].presentation.compact,false);
});
