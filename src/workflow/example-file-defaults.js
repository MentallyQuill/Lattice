import {REMASTERED_WORKFLOW_EXAMPLE_DATA} from './remastered-example-data.js?v=0.29.0';
import {EXAMPLE_FILE_FIXTURES} from './example-file-fixture-data.js?v=0.29.0';
import {resolveManagedFileNode} from './managed-file-policy.js?v=0.29.0';
import {nodeFileTargetId} from './node-file-targets.js?v=0.29.0';
const actors={'character:rowan.png':'Rowan','character:iris.png':'Iris'};
const key=address=>JSON.stringify([address.workflowId,address.instancePath,address.nodeId]);
const clone=value=>structuredClone(value);
const fail=message=>({ok:false,error:{code:'INVALID_EXAMPLE_DEFAULTS',message}});
const logical=node=>node.operation==='story-clock'?node.clockId:node.operation==='random-pick'?node.ledgerId:node.targetId;
const explicit=node=>!!(node.fileTarget?.bindingId||node.fileTarget?.path||node.fileTarget?.content);
/** Host-only preparation for an explicitly opened registered lesson. Graph template IDs are not provenance. */
export function prepareExampleFileDefaults({exampleId,nodes,workflowId,previousWorkflowId,actorBindings={},canonicalDocuments={},legacyDocuments=[]}){
 const registered=REMASTERED_WORKFLOW_EXAMPLE_DATA.find(entry=>entry.id===exampleId);
 if(!registered||typeof workflowId!=='string'||!workflowId.trim())return fail('Open a registered lesson with a trusted workflow identity.');
 const sources=Object.values(registered.packages[0].graph.nodes),entries=clone(Array.isArray(nodes)?nodes:Object.values(nodes??{})).map(entry=>entry.node?entry:{node:entry,address:{workflowId,instancePath:[],nodeId:entry.id}});
 const initialTemplates={},fileOwners={},actorChoices=[],clocks=new Map(),resources=new Map();
 const replaceActors=text=>text.replace(/character:(?:rowan|iris)\.png/g,from=>typeof actorBindings[from]==='string'&&actorBindings[from].length?actorBindings[from]:from);
 // Compare each field with its registered source so choices apply once, even when two roles swap actors.
 const remap=(value,source)=>typeof value==='string'?value===source?replaceActors(value):value:Array.isArray(value)?value.map((item,index)=>remap(item,source?.[index])):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([name,item])=>[name,remap(item,source?.[name])])):value;
 for(const entry of entries){
  const node=entry.node;
  if(!entry.address||entry.address.nodeId!==node.id||!Array.isArray(entry.address.instancePath))return fail('Example files require qualified node addresses.');
  if(explicit(node)||node.fileTarget?.managed!==true&&(Object.hasOwn(canonicalDocuments,nodeFileTargetId(node))||legacyDocuments.some(value=>value.targetId===nodeFileTargetId(node))))continue;
  const source=sources.find(source=>source.operation===node.operation&&(source.id===node.id||node.id.startsWith(source.id+'-'))&&(logical(source)===logical(node)||node.operation==='story-clock'&&node.fileTarget?.managed===true));
  if(source)entry.node=remap(node,source);
  if(!source||!['read-file','story-clock','random-pick','commit-outcomes'].includes(node.operation))continue;
  const target=logical(source),fixtureName=target==='sword-souls'?'sword-souls-99.json':target+(target==='campaign-notebook'?'.txt':'.json');
  let content=EXAMPLE_FILE_FIXTURES[fixtureName];if(content===undefined)continue;
  const format=fixtureName.endsWith('.txt')?'text':'json';if(node.fileTarget?.format&&node.fileTarget.format!==format)continue;
  const privateActor=target.startsWith('rowan-')?'character:rowan.png':target.startsWith('iris-')?'character:iris.png':source.actorScope==='presence'?source.actorId:null;
  if(privateActor&&(node.actorId??'')!==(source.actorId??'')&&node.actorId!==actorBindings[privateActor]){entry.node=node;continue;}
  if(privateActor&&node.fileTarget?.visibility&&(node.fileTarget.visibility.kind!=='actor-private'||node.fileTarget.visibility.actorId!==actorBindings[privateActor])){entry.node=node;continue;}
  if(privateActor&&!actorBindings[privateActor]){if(!actorChoices.some(choice=>choice.sampleActorId===privateActor))actorChoices.push({sampleActorId:privateActor,label:actors[privateActor]??'Lesson character'});continue;}
  if(privateActor){entry.node.actorId=actorBindings[privateActor];if(exampleId==='lesson-29')content='[]';}
  content=replaceActors(content);
  entry.node.fileTarget={managed:true,name:node.fileTarget?.name||target,format,missing:node.fileTarget?.missing??'create',visibility:privateActor?{kind:'actor-private',actorId:actorBindings[privateActor]}:node.fileTarget?.visibility??{kind:'public'}};
  const resolved=resolveManagedFileNode(entry.node,{workflowId,address:entry.address});if(!resolved.ok)return resolved;
  initialTemplates[key(entry.address)]=content;
  const resourceKey=JSON.stringify([entry.address.workflowId,entry.address.instancePath,target,entry.node.fileTarget.visibility]);
  if(!resources.has(resourceKey))resources.set(resourceKey,[]);resources.get(resourceKey).push(entry);
  if(node.operation==='story-clock'){
   // Previous ownership comes only from trusted host identity, never editable clock control text.
   const previous=resolveManagedFileNode(entry.node,{workflowId:previousWorkflowId??workflowId,address:entry.address});if(!previous.ok)return previous;
   clocks.set(target,{current:resolved.data.definition.targetId,previous:previous.data.definition.targetId});
   entry.node.clockId=resolved.data.definition.targetId;
  }
 }
 for(const group of resources.values())if(group.length>1){const owner=group.find(entry=>entry.node.operation==='commit-outcomes')??group[0];for(const entry of group)if(entry!==owner)fileOwners[key(entry.address)]=clone(owner.address);}
 // Keep authored schedule expectations aligned with their scoped clock source.
 for(const entry of entries){
  const source=sources.find(source=>source.operation===entry.node.operation&&(source.id===entry.node.id||entry.node.id.startsWith(source.id+'-')));
  const clock=source?.operation==='time-trigger'?clocks.get(source.clockId):null;
  if(clock&&(entry.node.clockId===source.clockId||entry.node.clockId===clock.current||entry.node.clockId===clock.previous))entry.node.clockId=clock.current;
 }
 for(const [sampleActorId,label] of Object.entries(actors))if(!actorBindings[sampleActorId]&&!actorChoices.some(choice=>choice.sampleActorId===sampleActorId)&&entries.some(entry=>sources.some(source=>source.operation===entry.node.operation&&(source.id===entry.node.id||entry.node.id.startsWith(source.id+'-')))&&JSON.stringify(entry.node).includes(sampleActorId)))actorChoices.push({sampleActorId,label});
 return {ok:true,data:{nodes:entries,initialTemplates,fileOwners,actorChoices}};
}
