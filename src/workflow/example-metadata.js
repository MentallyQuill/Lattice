/** Descriptive singleton metadata. It never binds resources or grants execution. */
import {safeWorkflowData} from './contracts.js?v=0.30.3';
import {portsForNode} from './catalog.js?v=0.30.3';
import {definitionRefKey} from './definition-data.js?v=0.30.3';
const fail=(code,message)=>({ok:false,error:{code,message}}),good=data=>({ok:true,data});
const text=(v,max=256)=>typeof v==='string'&&v.length>0&&v.length<=max;
const closed=(v,required,optional=[])=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const safeKey=v=>text(v,128)&&!['__proto__','prototype','constructor'].includes(v);
const exactRef=v=>closed(v,['id','version','semanticHash'])&&text(v.id)&&Number.isSafeInteger(v.version)&&v.version>0&&/^sha256:[a-f0-9]{64}$/.test(v.semanticHash);
function shape(cp,rootKey){
 if(!closed(cp,['node','port','expect','target'])||!text(cp.node)||!text(cp.port)||!text(cp.expect,8192))return false;
 const at=cp.target;if(!closed(at,['rootKey','hops','nodeId'])||at.rootKey!==rootKey||!text(at.nodeId)||!Array.isArray(at.hops)||at.hops.length>7)return false;
 return at.hops.every(h=>closed(h,['kind','nodeId','expectedRef'])&&['subgraph','iteration-helper'].includes(h.kind)&&text(h.nodeId)&&exactRef(h.expectedRef));
}
export function inspectExampleCheckpoint(graph,checkpoint){
 try{
  let scope=graph;const snapshots=graph.definitions??{};
  for(const hop of checkpoint.target.hops){
   const node=scope.nodes?.[hop.nodeId],ref=hop.kind==='subgraph'&&node?.type==='subgraph'?node.definition:hop.kind==='iteration-helper'&&node?.operation==='for-each'?node.helper:null;
   if(!ref||definitionRefKey(ref)!==definitionRefKey(hop.expectedRef))return fail('EXAMPLE_CHECKPOINT','The checkpoint no longer matches its containing definition.');
   const definition=snapshots[definitionRefKey(ref)];if(!definition)return fail('EXAMPLE_CHECKPOINT','The checkpoint definition is unavailable.');scope={...definition.body,definitions:snapshots};
  }
  const node=scope.nodes?.[checkpoint.target.nodeId];if(!node||!portsForNode(scope,node).some(p=>p.id===checkpoint.port&&p.direction==='output'))return fail('EXAMPLE_CHECKPOINT','The checkpoint must name an available output port.');
  return good({node,scope});
 }catch{return fail('EXAMPLE_CHECKPOINT','The checkpoint must name an available output port.');}
}
export function inspectSingletonMetadata(input,graph,{pruneMissing=false}={}){
 try{
  if(!safeWorkflowData(input))return fail('EXAMPLE_METADATA','Use bounded own JSON example metadata.');
  if(!closed(input,['schema','id','title','rootKey','role','resourceRequirements'],['checkpoints'])||input.schema!==1||!safeKey(input.id)||!text(input.title)||!safeKey(input.rootKey)||!Array.isArray(input.resourceRequirements)||input.checkpoints!==undefined&&!Array.isArray(input.checkpoints))return fail('EXAMPLE_METADATA','Use complete singleton example metadata.');
  if(graph?.schema!==4||graph?.runtime!==3||graph?.mode!=='native-unified'||input.role!=='generation'||input.resourceRequirements.length)return fail('UNSUPPORTED_FOUNDATION_CAPABILITY','Foundation examples use one generation root without resource provisioning.');
  const metadata=structuredClone(input),checkpoints=metadata.checkpoints??[];if(checkpoints.length>256||checkpoints.some(cp=>!shape(cp,metadata.rootKey)))return fail('EXAMPLE_CHECKPOINT','Use bounded root or exact supported helper checkpoint addresses.');
  const retained=[];for(const cp of checkpoints){const checked=inspectExampleCheckpoint(graph,cp);if(!checked.ok){if(!pruneMissing)return checked;continue;}retained.push(cp);}
  if(metadata.checkpoints!==undefined)metadata.checkpoints=retained;
  return good(metadata);
 }catch{return fail('EXAMPLE_METADATA','Invalid singleton example metadata.');}
}
export function remapExampleMetadata(metadata,{nodes={},definitions={}}={}){
 const copy=structuredClone(metadata);if(copy.checkpoints)copy.checkpoints=copy.checkpoints.map(cp=>({...cp,target:{...cp.target,nodeId:cp.target.hops.length?cp.target.nodeId:nodes[cp.target.nodeId]??cp.target.nodeId,hops:cp.target.hops.map((hop,i)=>({...hop,nodeId:i===0?nodes[hop.nodeId]??hop.nodeId:hop.nodeId,expectedRef:definitions[definitionRefKey(hop.expectedRef)]??hop.expectedRef}))}}));return copy;
}
