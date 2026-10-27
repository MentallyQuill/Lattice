import {validateNodeFileTarget,nodeFileTargetId} from '../workflow/node-file-targets.js?v=0.29.0';
const fail=(code,message)=>({ok:false,error:{code,message}});
const keyFor=node=>node.operation==='story-clock'?'clockId':node.operation==='random-pick'?'ledgerId':'targetId';
/** Qualified authoring actions; picking a handle never persists document contents. */
export function createNodeFileActions(ports){
 const actions={
  saveNodeFile(selection,settings){
   const captured=ports.capture(selection);if(!captured.ok)return captured;
   if((captured.data.view?.storage??ports.access?.()?.storage)==='server')return actions.chooseNodeFile(selection,{mode:'save',settings});
   const checked=validateNodeFileTarget(settings);if(!checked.ok)return checked;
   const previous=captured.data.node.fileTarget??{};
   const bindingId=checked.data.name===previous.name&&checked.data.path===previous.path?previous.bindingId??'':'';
   return ports.commit(captured.data,selection,{fileTarget:{...checked.data,bindingId}});
  },
  async chooseNodeFile(selection,request){
   const captured=ports.capture(selection);if(!captured.ok)return captured;
   const checked=validateNodeFileTarget(request.settings);if(!checked.ok)return checked;
   const access=ports.access(),binding=access.snapshot?.()?.[checked.data.bindingId];
   const storage=captured.data.view?.storage??access.storage;
   const changingFormat=checked.data.bindingId && (binding?.format??captured.data.node.fileTarget?.format)!==checked.data.format;
   const chosen=await access.choose({mode:request.mode,name:checked.data.name,format:checked.data.format,...(Object.hasOwn(checked.data,'path')?{path:checked.data.path}:{}),...(changingFormat?{bindingId:checked.data.bindingId}:{}),...(storage==='native'&&access.storage==='server'?{storage:'native'}:{})});if(!chosen.ok)return chosen;
   if(!ports.isCurrent(captured.data,selection))return fail('STALE_CONTEXT','The selected node or document changed while choosing the file.');
   const node=captured.data.node;
   const shared=Object.values(captured.data.nodes??{}).find(other=>other.id!==node.id && other.fileTarget?.bindingId===chosen.data.bindingId && nodeFileTargetId(other));
   if(shared){
    if(shared.fileTarget.format!==checked.data.format)return fail('FILE_FORMAT_CONFLICT','Nodes sharing a file must use the same format.');
    return ports.commit(captured.data,selection,{[keyFor(node)]:nodeFileTargetId(shared),fileTarget:structuredClone(shared.fileTarget)});
   }
   const splitShared=node.fileTarget?.bindingId && node.fileTarget.bindingId!==chosen.data.bindingId && Object.values(captured.data.nodes??{}).some(other=>other.id!==node.id && nodeFileTargetId(other)===nodeFileTargetId(node));
   const targetId=(!splitShared && (node.fileTarget?.bindingId||captured.data.view?.legacy||node.operation==='story-clock'&&request.mode==='open')?nodeFileTargetId(node):null)||'file-'+crypto.randomUUID();
   let content=checked.data.content;
   if(node.operation==='story-clock'){
    try{const clock=JSON.parse(content);if(clock&&typeof clock==='object'&&!Array.isArray(clock))content=JSON.stringify({...clock,clockId:targetId},null,2);}catch{return fail('INVALID_FILE_TARGET','Story Clock initial contents must be valid JSON.');}
   }
   const configured={...checked.data,bindingId:chosen.data.bindingId,name:chosen.data.name,...(typeof chosen.data.path==='string'?{path:chosen.data.path}:{}),content};
   const valid=validateNodeFileTarget(configured);if(!valid.ok)return valid;
   return ports.commit(captured.data,selection,{[keyFor(node)]:targetId,fileTarget:valid.data});
  }
 };
 return actions;
}
