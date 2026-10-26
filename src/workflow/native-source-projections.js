/** Current native character fields; private host projection, never portable authority. */
import {nativeVisibility} from './introspection/host-memory.js?v=0.28.1';
import {validVisibilityMetadata} from './artifact-privacy.js?v=0.28.1';
import {parseScope} from './source-manifests.js?v=0.28.1';
import {sha256Text} from './definition-data.js?v=0.28.1';
import {plain,freeze} from './record-data.js?v=0.28.1';
const projections=new WeakMap(),good=data=>({ok:true,data}),fail=code=>({ok:false,error:{code,message:'Current authorized native character material is required.'}});
const own=(value,key)=>{const p=value&&Object.getOwnPropertyDescriptor(value,key);if(!p)return undefined;if(!p.enumerable||!Object.hasOwn(p,'value'))throw Error();return p.value;};
const hash=value=>sha256Text(JSON.stringify(value));
function label(value){const native=nativeVisibility(value);if(!native.ok||!validVisibilityMetadata(value))throw Error();const raw=own(value,'visibility'),mark=raw===undefined?{kind:'public'}:typeof raw==='string'?{kind:raw,...(raw==='actor-private'?{actorId:own(value,'actorId')??own(own(value,'scope'),'actorId')}:{})}:raw;return {mark,visibleTo:native.data.present?native.data.visibleTo:null};}
const permits=(label,actor)=>label.mark.kind!=='hidden'&&(label.mark.kind==='public'||actor&&label.mark.actorId===actor)&&(label.visibleTo===null||actor&&label.visibleTo.includes(actor));
/** Constructor-only trusted capture. getActorGrant must close over a genuine current native actor capability. */
export function captureNativeCharacterProjection(ports){
 try{
  if(!plain(ports)||typeof ports.getContext!=='function'||typeof ports.getUserId!=='function'||typeof ports.isCurrent!=='function')return fail('SOURCE_CHARACTER_UNAUTHORIZED');
  ports={...ports};const parsed=parseScope(ports.scope);if(!parsed.ok)return parsed;const scope=parsed.data,grant=ports.getActorGrant?.()??null;
  const grantCheck=grant?.isCurrent,grantStamp=grant&&hash([grant.actorId,grant.scope]);
  const grantCurrent=()=>!grant?(ports.getActorGrant?.()??null)===null:grant.isCurrent===grantCheck&&hash([grant.actorId,grant.scope])===grantStamp&&grantCheck.call(grant)===true&&ports.getActorGrant()===grant;
  function read(){
   if(ports.signal?.aborted||ports.isCurrent()!==true||!grantCurrent())throw Error();const c=ports.getContext(),user=ports.getUserId(),chatId=c.getCurrentChatId?.()??own(c,'chatId');if(user!==scope.userId||chatId!==scope.chatId||grant&&(grant.scope.userId!==user||grant.scope.chatId!==chatId||grant.scope.branchId!==scope.branchId))throw Error();
   const characters=own(c,'characters'),selected=own(c,'characterId'),wrapper=characters&&own(characters,String(selected)),data=wrapper&&(own(wrapper,'data')??wrapper),avatar=wrapper&&own(wrapper,'avatar');
   if(wrapper&&!plain(wrapper)||data&&!plain(data))throw Error();const labels=wrapper?[label(wrapper),label(data)]:[],fields=[];
   if(labels.every(l=>permits(l,grant?.actorId)))for(const key of ['name','description','personality','scenario']){const text=data&&own(data,key);if(text!==undefined&&typeof text!=='string')throw Error();if(!text)continue;if(text.length>16000)throw Error('SOURCE_CHARACTER_LIMIT');{if(typeof avatar!=='string'||!avatar.trim()||avatar.length>240)throw Error('SOURCE_CHARACTER_IDENTITY_REQUIRED');const visibility=labels.some(l=>l.mark.kind==='actor-private'||l.visibleTo!==null)?{kind:'actor-private',actorId:grant.actorId}:{kind:'public'};fields.push({key,text,visibility});}}
   return {characters,selected,wrapper,data,avatar,stamp:hash([scope,selected,avatar,labels,fields]),fields};
  }
  const captured=read();let revoked=false;
  const current=()=>{try{if(revoked)return false;const next=read();const same=next.characters===captured.characters&&next.wrapper===captured.wrapper&&next.data===captured.data&&next.stamp===captured.stamp;if(!same)revoked=true;return same;}catch{revoked=true;return false;}};
  const recordScope=grant?{...scope,actorId:grant.actorId}:scope;
  const entries=captured.fields.map(({key,text,visibility})=>{const sourceId='character:'+hash([captured.avatar,key]).slice(7),revision=hash([text,visibility]);return {id:sourceId,revision,scope:recordScope,sourceRefs:[{sourceId,revision,kind:'character',scope:recordScope,span:{start:0,end:text.length,unit:'utf16'}}],visibility,text};});
  const view=freeze({scope:recordScope,entries,sourceSetKey:hash([recordScope,captured.avatar,entries.map(e=>[e.id,e.visibility])]),snapshotKey:hash(entries.map(e=>[e.id,e.revision]))}),projection=Object.freeze({});if(!current())return fail('SOURCE_CHARACTER_STALE');projections.set(projection,{view,current});return good(projection);
 }catch(error){return fail(['SOURCE_CHARACTER_LIMIT','SOURCE_CHARACTER_IDENTITY_REQUIRED'].includes(error?.message)?error.message:'SOURCE_CHARACTER_UNAVAILABLE');}
}
export function inspectNativeCharacterProjection(projection){const entry=projections.get(projection);return !entry?fail('SOURCE_CHARACTER_UNAUTHORIZED'):entry.current()?good(entry.view):fail('SOURCE_CHARACTER_STALE');}
