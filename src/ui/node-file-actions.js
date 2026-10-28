import {validateNodeFileTarget,nodeFileTargetId} from '../workflow/node-file-targets.js?v=0.29.1';
import {canonicalFileName,inferManagedFileFormat} from '../workflow/managed-file-policy.js?v=0.29.1';
const fail=(code,message)=>({ok:false,error:{code,message}});
const keyFor=node=>node.operation==='story-clock'?'clockId':node.operation==='random-pick'?'ledgerId':'targetId';
/** Qualified authoring actions; picking a handle never persists document contents. */
export function createNodeFileActions(ports){
 const actions={
  saveNodeFile(selection,settings){
   const captured=ports.capture(selection);if(!captured.ok)return captured;
   const previous=captured.data.node.fileTarget??{};
   if(previous.bindingId&&(settings.name!==previous.name||settings.format!==previous.format||(settings.path??'')!==(previous.path??captured.data.view?.settings?.path??'')))return fail('FILE_COPY_REQUIRED','Keep the original file unchanged. Choose Create new copy to use a different name, type or path.');
   if(previous.managed===true){
    if(settings.format!==(captured.data.view?.settings?.format??inferManagedFileFormat(captured.data.node)))return fail('FILE_COPY_REQUIRED','Choose a new destination to change this file’s type.');
    const intent={managed:true,name:settings.name,format:settings.format,missing:settings.missing,visibility:settings.visibility};
    const valid=validateNodeFileTarget(intent);if(!valid.ok)return valid;
    intent.name=canonicalFileName(settings.name,settings.format);
    return ports.commit(captured.data,selection,{fileTarget:intent});
   }
   const checked=validateNodeFileTarget(settings);if(!checked.ok)return checked;
   const bindingId=previous.bindingId??'';
   return ports.commit(captured.data,selection,{fileTarget:{...checked.data,bindingId}});
  },
  async chooseNodeFile(selection,request){
   const captured=ports.capture(selection);if(!captured.ok)return captured;
   const explicit={...request.settings};delete explicit.managed;
   if(request.mode==='open'&&!explicit.name?.trim())explicit.name=canonicalFileName('Document',explicit.format);
   const checked=validateNodeFileTarget(explicit);if(!checked.ok)return checked;
   const access=ports.access(),binding=access.snapshot?.()?.[checked.data.bindingId];
   const storage=captured.data.view?.storage??access.storage;
   const changingFormat=checked.data.bindingId && (binding?.format??captured.data.node.fileTarget?.format)!==checked.data.format;
   if(changingFormat&&!request.newCopy)return fail('FILE_COPY_REQUIRED','Create a new copy to change the file type. The original file stays unchanged.');
   let path=checked.data.path;
   if(['server','host'].includes(storage)&&ports.choosePath){const selected=await ports.choosePath({mode:request.mode,name:checked.data.name,path,format:checked.data.format});if(!selected.ok)return selected;if(!ports.isCurrent(captured.data,selection))return fail('STALE_CONTEXT','The selected node or document changed while choosing the file.');path=selected.data.path;}
   const chosen=await access.choose({mode:request.mode,name:checked.data.name,format:checked.data.format,...(path!==undefined?{path}:{}),...(['native','server'].includes(storage)?{storage}:{})});if(!chosen.ok)return chosen;
   if(request.newCopy&&chosen.data.bindingId===captured.data.node.fileTarget?.bindingId)return fail('FILE_COPY_REQUIRED','Choose a different file for the new copy.');
   if(changingFormat&&chosen.data.bindingId===checked.data.bindingId)return fail('FILE_COPY_REQUIRED','Choose a different file for this conversion. The original file is unchanged.');
   if(!ports.isCurrent(captured.data,selection))return fail('STALE_CONTEXT','The selected node or document changed while choosing the file.');
   const node=captured.data.node;
   const shared=Object.values(captured.data.nodes??{}).find(other=>other.id!==node.id && other.fileTarget?.bindingId===chosen.data.bindingId && nodeFileTargetId(other));
   if(shared){
    if(shared.fileTarget.format!==checked.data.format)return fail('FILE_FORMAT_CONFLICT','Nodes sharing a file must use the same format.');
    return ports.commit(captured.data,selection,{[keyFor(node)]:nodeFileTargetId(shared),fileTarget:structuredClone(shared.fileTarget)});
   }
   const splitShared=node.fileTarget?.bindingId && node.fileTarget.bindingId!==chosen.data.bindingId && Object.values(captured.data.nodes??{}).some(other=>other.id!==node.id && nodeFileTargetId(other)===nodeFileTargetId(node));
   const targetId=(!request.newCopy&&!splitShared && (node.fileTarget?.bindingId||captured.data.view?.legacy||node.operation==='story-clock'&&request.mode==='open')?nodeFileTargetId(node):null)||'file-'+crypto.randomUUID();
   let content=checked.data.content;
   if(node.operation==='story-clock'){
    try{const clock=JSON.parse(content);if(clock&&typeof clock==='object'&&!Array.isArray(clock))content=JSON.stringify({...clock,clockId:targetId},null,2);}catch{return fail('INVALID_FILE_TARGET','Story Clock initial contents must be valid JSON.');}
   }
   const configured={...checked.data,bindingId:chosen.data.bindingId,name:chosen.data.name,...(typeof chosen.data.path==='string'?{path:chosen.data.path}:{}),content};
   const valid=validateNodeFileTarget(configured);if(!valid.ok)return valid;
   return ports.commit(captured.data,selection,{[keyFor(node)]:targetId,fileTarget:valid.data});
  },
  createNodeFileCopy(selection,settings){return actions.chooseNodeFile(selection,{mode:'save',settings:{...settings,bindingId:''},newCopy:true});},
  openNodeFile(selection){const captured=ports.capture(selection);return captured.ok?ports.openFile?.(captured.data,selection)??fail('FILE_OPEN_UNAVAILABLE','Opening this file is unavailable.'):captured;},
  importNodeFile(selection){const captured=ports.capture(selection);return captured.ok?ports.importFile?.(captured.data,selection)??fail('FILE_IMPORT_UNAVAILABLE','Importing an input copy is unavailable.'):captured;},
  downloadNodeFile(selection){const captured=ports.capture(selection);return captured.ok?ports.downloadFile?.(captured.data,selection)??fail('FILE_DOWNLOAD_UNAVAILABLE','Downloading this file is unavailable.'):captured;}
 };
 return actions;
}
