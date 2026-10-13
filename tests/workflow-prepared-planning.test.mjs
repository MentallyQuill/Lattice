import assert from 'node:assert/strict';
import test from 'node:test';
import * as planning from '../src/workflow/resolve.js?v=0.27.3';
import { prepareCompositionViews } from '../src/workflow/composition-views.js';
import { fixtureGraph as starterGraph } from './helpers/workflow-fixtures.mjs';
import { cloneWorkflowDocument } from '../src/workflow/document.js';
import { siblingWorkflow,nestedWorkflow } from './fixtures/workflow-prepared-fixture.mjs';

const graph3=()=>cloneWorkflowDocument(starterGraph('native-guidance')).data;
const target=(graph,nodeId,portId='out')=>({workflowId:graph.id,instancePath:[],nodeId,portId});
test('prepared summaries share one checked inventory and preserve the full resolver closure',()=>{
    assert.equal(typeof planning.prepareWorkflowPlanner,'function');
    const root=graph3(),before=structuredClone(root),prepared=planning.prepareWorkflowPlanner(root);assert.equal(prepared.ok,true);
    for(const choice of [undefined,target(root,'scene-context'),target(root,'response-plan'),target(root,'guidance')]) {
        const summary=prepared.data.summarize(choice),full=planning.resolveWorkflow(root,choice===undefined?{}:{target:choice});
        assert.equal(summary.ok,full.ok);assert.equal(summary.data.callBound,full.data.callBound);assert.deepEqual(summary.data.requiredBindingAddresses,full.data.primitives.filter(unit=>unit.included&&unit.requestBound).map(unit=>unit.address));
        assert.ok(!('primitives' in summary.data));assert.ok(summary.data.requiredBindingAddresses.every(address=>prepared.data.inventory.primitives.some(unit=>unit.address===address)));
    }
    assert.deepEqual(root,before);assert.equal(Object.isFrozen(root),false);assert.equal(Object.isFrozen(root.nodes['response-plan']),false);
    const views=prepareCompositionViews(root,prepared.data);assert.equal(views.ok,true);assert.equal(prepareCompositionViews(root,prepared.data),views);
    root.wires.cycle={id:'cycle',route:'wire',from:'guidance',fromPort:'out',to:'scene-context',toPort:'in'};
    assert.equal(prepared.data.summarize(target(root,'scene-context')).ok,true,'summaries never inspect the current source again');assert.equal(prepareCompositionViews(root,prepared.data),views);
    assert.equal(planning.resolveWorkflow(root).ok,false,'explicit full resolution still checks the current source');
});
test('nested boundary and primitive summaries preserve the exact shared resolver mapping',()=>{
    const root=nestedWorkflow(),prepared=planning.prepareWorkflowPlanner(root);assert.equal(prepared.ok,true,JSON.stringify(prepared.error));
    for(const target of [undefined,{workflowId:root.id,instancePath:[],nodeId:'first/path',portId:'proposal'},{workflowId:root.id,instancePath:['first/path'],nodeId:'work',portId:'proposal'},{workflowId:root.id,instancePath:['first/path','work'],nodeId:'work',portId:'out'}]) {
        const summary=prepared.data.summarize(target),full=planning.resolveWorkflow(root,target===undefined?{}:{target});assert.equal(summary.ok,full.ok);
        if(!summary.ok){assert.deepEqual(summary.error,full.error);continue;}
        assert.equal(summary.data.callBound,full.data.callBound);assert.deepEqual(summary.data.requiredBindingAddresses,full.data.primitives.filter(unit=>unit.included&&unit.requestBound).map(unit=>unit.address));
    }
    const views=prepareCompositionViews(root,prepared.data);assert.equal(views.data.views.length,4);assert.equal(prepareCompositionViews(root,prepared.data),views);
});
test('unfinished roots retain inventory while target completeness stays local and cycles stay global',()=>{
    assert.equal(typeof planning.prepareWorkflowPlanner,'function');const root=graph3();delete root.nodes['review-publish'];delete root.wires.draft;
    // Use a valid pre-phase request operation with its input deliberately unconnected.
    root.nodes.unfinished={id:'unfinished',type:'workflow',operation:'response-plan'};
    const prepared=planning.prepareWorkflowPlanner(root);assert.equal(prepared.ok,true);assert.equal(prepared.data.summarize().error.code,'MISSING_TERMINAL');assert.equal(prepared.data.summarize(target(root,'response-plan')).ok,true);assert.equal(prepared.data.summarize(target(root,'unfinished')).error.code,'MISSING_INPUT');
    root.nodes.a={id:'a',type:'workflow',operation:'reroute',phase:'pre',artifactKind:'context'};root.nodes.b={id:'b',type:'workflow',operation:'reroute',phase:'pre',artifactKind:'context'};
    root.wires.a={id:'a',route:'wire',from:'a',fromPort:'out',to:'b',toPort:'in'};root.wires.b={id:'b',route:'wire',from:'b',fromPort:'out',to:'a',toPort:'in'};
    assert.equal(planning.prepareWorkflowPlanner(root).error.code,'CYCLE');
});
test('sibling qualified addresses and wrapper closures use the same checked completeness selection',()=>{
    for (const variant of ['complete','disabled','missing']) {
        const root=siblingWorkflow();
        if(variant==='disabled')root.nodes['first/path'].enabled=false;
        if(variant==='missing')delete root.wires.a;
        const prepared=planning.prepareWorkflowPlanner(root);assert.equal(prepared.ok,true);
        const targets=[undefined,{workflowId:root.id,instancePath:[],nodeId:'first/path',portId:'proposal'},{workflowId:root.id,instancePath:['second'],nodeId:'work',portId:'out'}];
        for (const target of targets) {
            const summary=prepared.data.summarize(target),full=planning.resolveWorkflow(root,target===undefined?{}:{target});assert.equal(summary.ok,full.ok);
            if(!summary.ok)assert.deepEqual(summary.error,full.error);
            else {assert.equal(summary.data.callBound,full.data.callBound);assert.deepEqual(summary.data.requiredBindingAddresses,full.data.primitives.filter(unit=>unit.included&&unit.requestBound).map(unit=>unit.address));}
        }
        const views=prepareCompositionViews(root,prepared.data);assert.equal(views.ok,true);assert.equal(views.data.views.length,3);
        assert.notDeepEqual(prepared.data.inventory.primitives.filter(unit=>unit.address.nodeId==='work').map(unit=>unit.address.instancePath)[0],prepared.data.inventory.primitives.filter(unit=>unit.address.nodeId==='work').map(unit=>unit.address.instancePath)[1]);
    }
});
test('composition reuse rejects foreign and mismatched plans without reading or freezing caller objects',()=>{
    const root=graph3();let reads=0;const foreign={get inventory(){reads++;throw new Error('foreign');}};
    assert.equal(prepareCompositionViews(root,foreign).error.code,'INVALID_PREPARED_PLANNER');assert.equal(reads,0);assert.equal(Object.isFrozen(foreign),false);
    assert.equal(typeof planning.prepareWorkflowPlanner,'function');const prepared=planning.prepareWorkflowPlanner(root).data;
    assert.equal(prepareCompositionViews(structuredClone(root),prepared).error.code,'INVALID_PREPARED_PLANNER');
});
