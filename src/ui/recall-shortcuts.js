import {validateRecallQueueProposal,validateRecallScope} from '../workflow/recall-state.js?v=0.27.2';
const fail=(code,message)=>({ok:false,error:{code,message}});
const editable=element=>['INPUT','TEXTAREA','SELECT'].includes(element?.tagName)||element?.isContentEditable===true||element?.getAttribute?.('role')==='textbox';
const isolated=element=>!!element?.closest?.('[role="menu"], .pc-workspace-overlay');
/** DOM listeners only forward an exact shortcut; native controller rechecks its live scope. */
export function createRecallShortcutRegistry(document,options={}){
 const entries=new Map();let disposed=false,listening=false;
 const key=hotkey=>JSON.stringify([hotkey.code,hotkey.ctrl,hotkey.alt,hotkey.shift,hotkey.meta]);
 function handle(event){
  if(isolated(event.target)||isolated(document.activeElement)||disposed||event.defaultPrevented||event.repeat||event.isComposing||editable(event.target)||editable(document.activeElement)||(event.composedPath?.()??[]).some(element=>editable(element)||isolated(element)))return;
  const entry=entries.get(key({code:event.code,ctrl:event.ctrlKey===true,alt:event.altKey===true,shift:event.shiftKey===true,meta:event.metaKey===true}));if(!entry)return;
  let result;try{result=entry.onPress();}catch{return;}
  if(result?.ok!==true||disposed||entries.get(entry.key)!==entry)return;
  event.preventDefault();try{options.changed?.(result.data);}catch{/* Display observers cannot grant a request. */}
 }
 function detach(){if(listening&&!entries.size){document.removeEventListener('keydown',handle,true);listening=false;}}
 return Object.freeze({register(request){
  if(disposed||typeof document?.addEventListener!=='function'||typeof document?.removeEventListener!=='function')return fail('RECALL_HOTKEY_UNAVAILABLE','The keyboard listener is unavailable.');
  const scope=validateRecallScope(request?.scope);if(!scope.ok||typeof request?.nodeId!=='string'||!request.nodeId.trim()||request.nodeId.length>256||typeof request.onPress!=='function')return fail('INVALID_RECALL_HOTKEY','Use a scoped native Recall shortcut.');
  const checked=validateRecallQueueProposal({schemaVersion:1,type:'recall-arm-proposal',actorId:scope.data.actorId,memorySetId:'shortcut-validation',target:'both',uses:'next-match',consumeOn:'accepted',hotkey:request.hotkey});if(!checked.ok)return checked;
  const shortcut=key(checked.data.hotkey);if(entries.has(shortcut))return fail('RECALL_HOTKEY_CONFLICT','This shortcut is already assigned to another active Recall Shortcut. Choose a different key.');
  const entry={key:shortcut,onPress:request.onPress};entries.set(shortcut,entry);if(!listening){document.addEventListener('keydown',handle,true);listening=true;}
  return {ok:true,data:{dispose(){if(entries.get(shortcut)===entry)entries.delete(shortcut);detach();}}};
 },dispose(){disposed=true;entries.clear();detach();}});
}
