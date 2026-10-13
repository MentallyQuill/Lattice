import {nativeVisibility} from './introspection/host-memory.js?v=0.27.2';
import {artifactVisibility,validVisibilityMetadata} from './artifact-privacy.js?v=0.27.2';
import {cloneJsonValue} from './operations/json-data.js?v=0.27.2';
import {plain,freeze} from './record-data.js?v=0.27.2';
const good=data=>({ok:true,data});
const fail=(code,message)=>({ok:false,error:{code,message}});
const id=value=>typeof value==='string'&&!!value.trim()&&value.length<=256;
const keys=['name','description','personality','scenario'];
const own=(value,key)=>{const property=value&&Object.getOwnPropertyDescriptor(value,key);if(!property)return undefined;if(!property.enumerable||!Object.hasOwn(property,'value'))throw Error();return property.value;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function disclosure(material){
 const explicit=nativeVisibility(material);if(!explicit.ok)throw Error();
 const label=own(material,'visibility');if(label===undefined&&Object.hasOwn(material??{},'visibility'))throw Error();
 if(label!==undefined&&!validVisibilityMetadata(material))throw Error();
 const mark=label===undefined?{kind:'public'}:typeof label==='string'?{kind:label,...(label==='actor-private'?{actorId:own(material,'actorId')??own(own(material,'scope'),'actorId')}:{})}:label;
 return {...explicit.data,mark};
}
const permits=(label,actorId)=>label.mark.kind!=='hidden'&&(label.mark.kind!=='actor-private'||label.mark.actorId===actorId)&&(!label.present||label.visibleTo.includes(actorId));
function configPorts(raw){
 if(!plain(raw))return null;const ports={};
 for(const key of Reflect.ownKeys(raw)){if(typeof key!=='string'||!['context','userId','isCurrent','signal','selectActor','authorizePresence','readMemories','projectMessage','authorizeHolderEvent'].includes(key))return null;ports[key]=own(raw,key);}
 if(['context','userId','isCurrent','authorizePresence'].some(key=>typeof ports[key]!=='function')||['selectActor','readMemories','projectMessage','authorizeHolderEvent'].some(key=>ports[key]!==undefined&&typeof ports[key]!=='function')||ports.signal!==undefined&&!(ports.signal instanceof AbortSignal))return null;
 return ports;
}
/** Private, per-run actor authority. Tokens and provenance never enter portable graph data. */
export function createNativeActorContext(rawPorts){
 let ports;try{ports=configPorts(rawPorts);}catch{}if(!ports)return fail('INVALID_ACTOR_PORTS','Actor context requires trusted own host capabilities.');
 const grants=new WeakMap(),artifacts=new WeakMap(),guidances=new WeakMap(),contexts=new WeakMap(),producers=new WeakMap();let closed=false;
 const current=()=>{try{if(closed||ports.signal?.aborted)return false;const live=ports.isCurrent()===true;return live&&!closed&&!ports.signal?.aborted;}catch{return false;}};
 function host(){
  if(!current())throw Error();const userId=ports.userId(),c=ports.context();if(!id(userId)||!plain(c))throw Error();
  const getChat=own(c,'getCurrentChatId'),chatId=typeof getChat==='function'?getChat.call(c):own(c,'chatId');
  const characters=own(c,'characters'),chat=own(c,'chat'),selectedIndex=own(c,'characterId');if(!id(chatId)||!Array.isArray(characters)||characters.length>10000||!Array.isArray(chat)||chat.length>10000)throw Error();
  const actors=new Map();for(let index=0;index<characters.length;index++){const wrapper=own(characters,String(index));if(!wrapper)continue;if(!plain(wrapper))throw Error();const avatar=own(wrapper,'avatar');if(avatar!==undefined&&(!id(avatar)||avatar.length>240))throw Error();const actorId='character:'+(avatar??index);if(actors.has(actorId))throw Error();actors.set(actorId,{wrapper,data:own(wrapper,'data')??wrapper,index});}
  const selected=typeof ports.selectActor==='function'?ports.selectActor(c):[...actors].find(([,actor])=>actor.index===selectedIndex)?.[0];
  if(!id(selected)||!actors.has(selected)||!current()||ports.userId()!==userId)throw Error();return {c,userId,chatId,chat,characters,actors,selected,selectedIndex};
 }
 function material(actorId,frame){
  const actor=frame.actors.get(actorId);if(!actor||!plain(actor.data))throw Error();
  const wrapperLabel=disclosure(actor.wrapper),dataLabel=disclosure(actor.data),fields={};
  for(const key of keys){const value=own(actor.data,key);if(value!==undefined&&typeof value!=='string')throw Error();if(typeof value==='string'){if(value.length>100000)throw Error();fields[key]=value;}}
  const start=Math.max(0,frame.chat.length-1000),refs=frame.chat.slice(start),messages=refs.map((message,index)=>{
   if(!plain(message))throw Error();const projected=ports.projectMessage?ports.projectMessage(message,start+index):message;if(!current()||!plain(projected))throw Error();const text=own(projected,'mes'),isUser=own(message,'is_user'),isSystem=own(message,'is_system'),swipeId=own(projected,'swipe_id'),label=disclosure(message);
   if(text!==undefined&&typeof text!=='string'||typeof text==='string'&&text.length>100000)throw Error();
   return {id:'chat:'+(start+index),text,role:isUser?'user':isSystem?'system':'assistant',swipeId,label,tool:own(message,'is_tool')===true};
  });
  const stamp=JSON.stringify({actorId,selected:frame.selected,selectedIndex:frame.selectedIndex,loaded:[...frame.actors.keys()],fields,wrapperLabel,dataLabel,messages});if(new TextEncoder().encode(stamp).length>4000000)throw Error();
  return {actor,fields,wrapperLabel,dataLabel,start,refs,messages,stamp};
 }
 function verify(presence,actorId){
  const checked=cloneJsonValue(presence);if(!checked.ok)return fail('ACTOR_PRESENCE_UNVERIFIED','Use this run’s exact checked scene presence.');const value=checked.data.value?.value;
  const mark=artifactVisibility(checked.data.value);if(!plain(value)||checked.data.value.kind!=='data'||value.schemaVersion!==1||value.recordType!=='scene-presence'||value.actorId!==actorId||value.status!=='present'||!['sceneId','sourceId','revision'].every(key=>id(value[key]))||mark.kind==='hidden'||mark.kind==='actor-private'&&mark.actorId!==actorId)return fail('ACTOR_PRESENCE_UNVERIFIED','Use this actor’s confirmed current source presence.');
  const request=freeze({actorId,sceneId:value.sceneId,sourceId:value.sourceId,revision:value.revision});let response;
  try{response=ports.authorizePresence(presence,request);}catch{return fail('ACTOR_PRESENCE_UNVERIFIED','The live presence source could not be authorized.');}
  const copied=cloneJsonValue(response);if(!current()||!copied.ok||copied.data.value.ok!==true||!['sourceId','revision','sceneId'].every(key=>copied.data.value.data?.source?.[key]===value[key]))return fail('ACTOR_PRESENCE_UNVERIFIED','The live presence source could not be authorized.');return good({value,request});
 }
 function authorizeActor(actorId,presence){
  if(!id(actorId))return fail('ACTOR_NOT_LOADED','Select an actual loaded canonical actor.');
  try{const frame=host();if(!frame.actors.has(actorId))return fail('ACTOR_NOT_LOADED','Select an actual loaded canonical actor.');const source=material(actorId,frame),verified=verify(presence,actorId);if(!verified.ok)return verified;
   const grant=Object.freeze({}),entry={actorId,presence,frame,source,scope:freeze({userId:frame.userId,chatId:frame.chatId,actorId})};grants.set(grant,entry);const checked=checkActorGrant(grant);return checked.ok?good({grant,scope:entry.scope}):checked;
  }catch{return fail(current()?'INVALID_ACTOR_SOURCE':'STALE_ACTOR_SCOPE','Actor source or scope is unavailable.');}
 }
 function checkActorGrant(grant){
  const entry=grants.get(grant);if(!entry)return fail('ACTOR_GRANT_REQUIRED','Use the exact privately captured actor grant.');
  try{const verified=entry.presence?verify(entry.presence,entry.actorId):good({});if(!verified.ok)return verified;const frame=host(),actor=frame.actors.get(entry.actorId);if(frame.userId!==entry.scope.userId||frame.chatId!==entry.scope.chatId||frame.chat!==entry.frame.chat||frame.characters!==entry.frame.characters||frame.selected!==entry.frame.selected||frame.selectedIndex!==entry.frame.selectedIndex||actor?.wrapper!==entry.source.actor.wrapper||actor?.data!==entry.source.actor.data||!entry.source.refs.every((message,index)=>frame.chat[entry.source.start+index]===message))throw Error();
   const captured={...frame,chat:frame.chat.slice(0,entry.source.start+entry.source.refs.length)};const source=material(entry.actorId,captured);if(source.stamp!==entry.source.stamp||!current())throw Error();return good({scope:entry.scope});
  }catch{return fail('STALE_ACTOR_SCOPE','Actor scope, source or loaded selection changed.');}
 }
 function authorizeSelectedActor(){
  try{const frame=host(),actorId=frame.selected,source=material(actorId,frame),grant=Object.freeze({}),entry={actorId,presence:null,frame,source,scope:freeze({userId:frame.userId,chatId:frame.chatId,actorId})};grants.set(grant,entry);const checked=checkActorGrant(grant);return checked.ok?good({grant,scope:entry.scope}):checked;}catch{return fail('STALE_ACTOR_SCOPE','The loaded native actor scope is unavailable.');}
 }
 async function actorContext(actorId,request,presence){
  let checked,exactData;try{if(!plain(request)||Reflect.ownKeys(request).some(key=>typeof key!=='string'||!['sceneId','sourceId','revision','signal','data'].includes(key)))throw Error();const signal=own(request,'signal');if(signal!==undefined&&signal!==ports.signal)throw Error();exactData=own(request,'data');checked=cloneJsonValue(Object.fromEntries(['sceneId','sourceId','revision'].map(key=>[key,own(request,key)])));}catch{}
  if(!checked?.ok)return fail('INVALID_ACTOR_REQUEST','Use the live actor request scope and signal.');request=checked.data.value;
  if(exactData!==undefined){const input=authorizeModelInputs({data:exactData});if(!input.ok)return input;if(input.data.scope&&input.data.scope.actorId!==actorId)return fail('ACTOR_MODEL_SCOPE','Character Direction Data must retain this actor’s exact current authority.');}
  const authorized=authorizeActor(actorId,presence);if(!authorized.ok)return authorized;const {grant,scope}=authorized.data,entry=grants.get(grant);
  if(!['sceneId','sourceId','revision'].every(key=>request[key]===entry.presence.value[key]))return fail('ACTOR_PRESENCE_UNVERIFIED','The requested scene must match the exact retained source.');
  if(exactData!==undefined){const input=authorizeModelInputs({data:exactData});if(!input.ok)return input;if(input.data.scope&&input.data.scope.actorId!==actorId)return fail('ACTOR_MODEL_SCOPE','Character Direction Data must retain this actor’s exact current authority.');const live=checkActorGrant(grant);if(!live.ok)return live;}
  let remaining=100000;const messages=[],omissions=[];for(const message of entry.source.messages.slice(-12)){if(typeof message.text!=='string'||message.tool){omissions.push({id:message.id,reason:'unsupported message'});continue;}if(!permits(message.label,actorId)){omissions.push({id:message.id,reason:'restricted actor visibility'});continue;}if(message.text.length>remaining)return fail('ACTOR_CONTEXT_LIMIT','Narrow the bounded actor scene source.');remaining-=message.text.length;messages.push({id:message.id,role:message.role,text:message.text});}
  const fields={};if(permits(entry.source.wrapperLabel,actorId)&&permits(entry.source.dataLabel,actorId)){for(const [key,text]of Object.entries(entry.source.fields)){if(text.length>16000||text.length>remaining){omissions.push({id:'character:'+key,reason:'character field limit'});continue;}remaining-=text.length;fields[key]=text;}}else omissions.push({id:'character',reason:'restricted actor visibility'});
  let memories=[];if(ports.readMemories){let response;try{response=await ports.readMemories(actorId,{scope,presence,grant,signal:ports.signal});}catch{return fail('ACTOR_MEMORY_UNAVAILABLE','Authorized actor memories could not be read.');}const live=checkActorGrant(grant);if(!live.ok)return live;const copied=cloneJsonValue(response);if(!copied.ok||copied.data.value.ok!==true||!Array.isArray(copied.data.value.data)||copied.data.value.data.length>64)return fail('ACTOR_MEMORY_UNAVAILABLE','Authorized memories require a bounded actor list.');memories=copied.data.value.data;if(memories.some(memory=>!plain(memory)||Object.keys(memory).some(key=>!['memoryId','actorId','visibility','text'].includes(key))||!id(memory.memoryId)||memory.actorId!==actorId||memory.visibility!=='actor-private'||typeof memory.text!=='string'||memory.text.length>4096))return fail('ACTOR_MEMORY_SCOPE_MISMATCH','Authorized memories must belong only to this actor.');}
  const live=checkActorGrant(grant);if(!live.ok)return live;if(exactData!==undefined){const input=authorizeModelInputs({data:exactData});if(!input.ok)return input;if(input.data.scope&&input.data.scope.actorId!==actorId)return fail('ACTOR_MODEL_SCOPE','Character Direction Data must retain this actor’s exact current authority.');const captured=checkActorGrant(grant);if(!captured.ok)return captured;}const result=cloneJsonValue({scope:{actorId,sceneId:request.sceneId},visibility:'actor-private',context:{messages,character:{actorId,fields},omissions},memories});if(!result.ok)return fail('ACTOR_CONTEXT_LIMIT','Actor context exceeds the bounded data contract.');let scoped=contexts.get(presence);if(!scoped){scoped=new Map();contexts.set(presence,scoped);}scoped.set(actorId,grant);return good(freeze(result.data.value));
 }
 function retainScopedArtifact(artifact,grant){const checked=checkActorGrant(grant);if(!checked.ok)return checked;const mark=artifactVisibility(artifact);if(mark.kind!=='actor-private'||mark.actorId!==checked.data.scope.actorId||!Object.isFrozen(artifact))return fail('ACTOR_ARTIFACT_SCOPE','Retain only a checked immutable artifact in its captured actor scope.');artifacts.set(artifact,grant);return good({retained:true});}
 function authorizeModelInputs(inputs){
  if(!plain(inputs))return fail('ACTOR_MODEL_SCOPE','Model inputs require checked named artifacts.');const mark=artifactVisibility(inputs);if(mark.kind==='public')return current()?good({scope:null}):fail('STALE_ACTOR_SCOPE','Model source scope changed.');if(mark.kind!=='actor-private')return fail('ACTOR_MODEL_SCOPE','Auxiliary models cannot receive hidden or mixed actor scopes.');let selected;
  for(const input of Object.values(inputs)){const visibility=artifactVisibility(input);if(visibility.kind==='public')continue;const grant=artifacts.get(input),checked=checkActorGrant(grant);if(!checked.ok||checked.data.scope.actorId!==mark.actorId)return fail('ACTOR_MODEL_SCOPE','Private model inputs require their exact captured actor authority.');selected??=grant;}
  return selected?good({scope:grants.get(selected).scope,grant:selected}):fail('ACTOR_MODEL_SCOPE','Private model inputs require captured actor authority.');
 }
 function authorizeEventInputs(node,inputs){
  if(!['actor-context','character-direction','prompted-memory'].includes(node?.operation))return good({});
  const grant=contexts.get(inputs?.presence)?.get(node.actorId),checked=checkActorGrant(grant);if(!checked.ok)return fail('ACTOR_CONTEXT_CHANGED','The actor model must use its exact live captured context.');
  if(node.operation==='character-direction'&&Object.hasOwn(inputs,'data')){const input=authorizeModelInputs(inputs);if(!input.ok)return input;if(input.data.scope&&input.data.scope.actorId!==checked.data.scope.actorId)return fail('ACTOR_MODEL_SCOPE','Character Direction Data must retain its captured actor context scope.');if(!checkActorGrant(grant).ok)return fail('ACTOR_CONTEXT_CHANGED','The actor model must use its exact live captured context.');}
  if(node.operation==='prompted-memory'){if(typeof ports.authorizeHolderEvent!=='function')return fail('ACTOR_TRIGGER_UNVERIFIED','Prompted Memory requires an exact live ordered holder event.');let raw;try{raw=ports.authorizeHolderEvent(inputs.event,{actorId:node.actorId});}catch{return fail('ACTOR_TRIGGER_UNVERIFIED','The ordered holder trigger could not be authorized.');}const response=cloneJsonValue(raw),event=inputs.event?.value;if(!response.ok||response.data.value.ok!==true||response.data.value.data?.actorId!==node.actorId||response.data.value.data?.eventId!==event?.eventId||!['sourceId','revision','sceneId'].every(key=>response.data.value.data?.source?.[key]===(key==='sceneId'?event?.sceneId:event?.source?.[key]))||!checkActorGrant(grant).ok)return fail('ACTOR_TRIGGER_UNVERIFIED','Prompted Memory requires its exact current holder event and source.');}
  return good({grant,scope:checked.data.scope});
 }
 function captureScopedResult(rawResult,grant){const checked=checkActorGrant(grant);if(!checked.ok)return checked;if(rawResult?.ok!==true)return fail('ACTOR_ARTIFACT_SCOPE','Capture only a successful owned private producer.');producers.set(rawResult,grant);return good({retained:true});}
 function retainScopedOutput(inputs,artifact,producer){const mark=artifactVisibility(artifact);if(mark.kind==='public')return good({retained:true});
  const captured=producers.get(producer?.rawResult);if(captured){const source=producer.rawResult.outputs?.[producer.portId]??(producer.portId==='out'?producer.rawResult.artifact:undefined);const checked=cloneJsonValue(source),output=cloneJsonValue(artifact);if(!checked.ok||!output.ok||!same(checked.data.value,output.data.value))return fail('ACTOR_ARTIFACT_SCOPE','The private output must preserve its exact captured producer payload.');return retainScopedArtifact(artifact,captured);}
  const checked=authorizeModelInputs(inputs);if(!checked.ok||!checked.data.grant)return fail('ACTOR_ARTIFACT_SCOPE','Private outputs must retain their actor source authority.');return retainScopedArtifact(artifact,checked.data.grant);}
 function retainGuidance(payload){
  try{const {node,inputs,artifact,rawResult}=payload;if(node.operation!=='character-direction'||rawResult?.ok!==true||!rawResult.reports?.some(report=>report.operation==='character-direction'&&report.actualCalls===1)||artifact.kind!=='guidance'||artifact.text!==rawResult.artifact?.text||artifact.scope?.actorId!==node.actorId)return fail('ACTOR_GUIDANCE_UNVERIFIED','Retain only the exact checked Character Direction output.');const authorized=authorizeEventInputs(node,inputs);if(!authorized.ok)return authorized;const retained=retainScopedArtifact(artifact,authorized.data.grant);if(retained.ok)guidances.set(artifact,authorized.data.grant);return retained;}catch{return fail('ACTOR_GUIDANCE_UNVERIFIED','Character guidance source is unavailable.');}
 }
 function authorizeGuidance(artifact){const grant=guidances.get(artifact);if(!grant)return fail('ACTOR_GUIDANCE_UNVERIFIED','Private native guidance requires its exact retained actor producer.');const checked=checkActorGrant(grant);if(!checked.ok)return checked;try{return host().selected===checked.data.scope.actorId?good({authorized:true,scope:checked.data.scope}):fail('ACTOR_GUIDANCE_SCOPE','Native generation requires the currently selected actor’s guidance.');}catch{return fail('STALE_ACTOR_SCOPE','Native actor selection changed.');}}
 return good(Object.freeze({actorContext,authorizeActor,authorizeSelectedActor,checkActorGrant,authorizeEventInputs,captureScopedResult,retainScopedArtifact,retainScopedOutput,authorizeModelInputs,retainGuidance,authorizeGuidance,release(){closed=true;}}));
}
