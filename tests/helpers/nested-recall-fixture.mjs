import assert from 'node:assert/strict';
import {operationDefaults} from '../../src/workflow/catalog.js';
import {computeDefinitionIdentity,definitionRefKey} from '../../src/workflow/definitions.js';
import {prepareCreateFromSelection} from '../../src/workflow/composition.js';
import {createNativeRecallController} from '../../src/workflow/native-recall.js';
import {workflowSignature} from '../../src/workflow/runtime.js';
import {recallHostFixture} from './native-recall-host-fixture.mjs';

const node=(id,operation,settings={})=>({id,type:'workflow',...operationDefaults(operation),...settings});
export const recallAddress=(instancePath,nodeId='hotkey',workflowId='nested-recall')=>({workflowId,instancePath,nodeId});
const definition=(id,memorySetId)=>{
 const identity=computeDefinitionIdentity({id,version:1,name:id,interface:[],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{hotkey:node('hotkey','hotkey-arm',{actorId:'mara',memorySetId}),recall:node('recall','recall',{actorId:'mara',memorySetId})},wires:{}}});
 assert.equal(identity.ok,true,JSON.stringify(identity.error));return {...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash};
};
export function nestedRecallFixture(){
 const left=definition('left-recall','left-memories'),right=definition('right-recall','right-memories');
 const wrapper=(id,definition,enabled=true)=>({id,type:'subgraph',definition:{id:definition.id,version:definition.version,semanticHash:definition.semanticHash},enabled,parameterOverrides:{},roleOverrides:{},nodeBindingOverrides:{}});
 const collision=JSON.stringify(['nested-recall',['left'],'hotkey']);
 const graph={id:'nested-recall',schema:3,runtime:2,mode:'native-unified',nodes:{send:node('send','on-send'),generate:node('generate','generate-reply'),review:node('review','review-publish'),left:wrapper('left',left),right:wrapper('right',right),disabled:wrapper('disabled',left,false),off:node('off','hotkey-arm',{actorId:'mara',memorySetId:'off',enabled:false}),[collision]:node(collision,'hotkey-arm',{actorId:'mara',memorySetId:'root-memories'})},wires:{activation:{id:'activation',route:'wire',from:'send',fromPort:'activation',to:'generate',toPort:'activation'},draft:{id:'draft',route:'wire',from:'generate',fromPort:'draft',to:'review',toPort:'draft'}},definitions:{[definitionRefKey(left)]:left,[definitionRefKey(right)]:right},portals:{}};
 const scope={userId:'u',chatId:'chat',workflowId:graph.id,actorId:'mara'},listeners=[];let owner={};
 const controller=createNativeRecallController({getActive:()=>({owner,scope,graph,signature:workflowSignature(graph)}),registerHotkey:entry=>{listeners.push(entry);return {ok:true,data:{dispose(){entry.closed=true;}}};}});
 return {graph,scope,controller,listeners,collision,replaceDocument(){owner={};controller.resetDocument(owner);}};
}
export function nestedRecallHostFixture(options={}){
 const fixture=recallHostFixture(options),nodeIds=Object.keys(fixture.graph.nodes).filter(id=>!['send','generate','review'].includes(id));
 const extracted=prepareCreateFromSelection(fixture.graph,{nodeIds,definitionId:'native-recall-system',name:'Native Recall'});
 assert.equal(extracted.ok,true,JSON.stringify(extracted.error));Object.assign(fixture.graph,extracted.data.candidate);
 const address={workflowId:fixture.graph.id,instancePath:[extracted.data.instanceId],nodeId:'hotkey'};
 return {...fixture,address};
}
