import test from 'node:test';import assert from 'node:assert/strict';
import {installWorkflowExample} from '../src/workflow/examples.js';import {describeAuthoredOperation} from '../src/workflow/catalog.js';import {projectNodeControls} from '../src/ui/node-control-projection.js';import {prepareNativeNodeEdit} from '../src/workflow/definition-library.js';
test('foundation Scene details uses the admitted runtime3 descriptor and selection-specific controls',()=>{
 const graph=installWorkflowExample('lesson-35').data.graph,node=Object.values(graph.nodes).find(n=>n.operation==='scene-context'),descriptor=describeAuthoredOperation(graph,node).data.descriptor,fields=projectNodeControls('scene-context',node,{phase:'pre',graph});
 const selection=fields.find(field=>field.key==='selection');assert.ok(selection);assert.deepEqual(selection.options.map(option=>option.value),['recent','before-window']);assert.equal(fields.find(field=>field.key==='keepRecentAssistantTurns').value,10);assert.equal(fields.some(field=>field.key==='recentMessages'),false);assert.equal(fields.some(field=>field.key==='activationMode'),false);
 const recent=projectNodeControls('scene-context',{...node,selection:'recent'},{phase:'pre',graph});assert.equal(recent.some(field=>field.key==='keepRecentAssistantTurns'),false);assert.equal(recent.some(field=>field.key==='recentMessages'),true);
});
test('foundation Scene protected window remains an atomic editable setting and deferred modes remain refused',()=>{
 const graph=installWorkflowExample('lesson-35').data.graph,node=Object.values(graph.nodes).find(n=>n.operation==='scene-context'),edited=prepareNativeNodeEdit(graph,{kind:'controls',viewPath:[],nodeId:node.id,controls:{keepRecentAssistantTurns:8}});assert.equal(edited.ok,true,JSON.stringify(edited.error));assert.equal(edited.data.candidate.nodes[node.id].keepRecentAssistantTurns,8);assert.equal(node.keepRecentAssistantTurns,10);
 for(const controls of [{selection:'since-cursor'},{activationMode:'events'}])assert.equal(prepareNativeNodeEdit(graph,{kind:'controls',viewPath:[],nodeId:node.id,controls}).ok,false);
});
