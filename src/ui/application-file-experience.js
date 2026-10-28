import {createHostFileStore} from './host-file-store.js?v=0.29.1';
import {createServerFileAccess} from './server-file-access.js?v=0.29.1';
import {createFileStorageSetup} from './file-storage-setup.js?v=0.29.1';
import {createWorkflowLibrary} from './workflow-library.js?v=0.29.1';
import {createWorkflowLibraryController} from './workflow-library-controller.js?v=0.29.1';
import {createWorkflowExampleOrigins,withWorkflowExampleOrigins} from './workflow-example-origin.js?v=0.29.1';
/** One application owner connects authenticated storage, shared authoring and optional setup. */
export function createApplicationFileExperience(ports){
 const store=ports.store??createHostFileStore({getUserId:ports.getUserId,getRequestHeaders:()=>ports.getNativeContext?.()?.getRequestHeaders?.()??{}});
 const server=ports.server??createServerFileAccess({getContext:ports.getNativeContext,getUserId:ports.getUserId});
 const preferences={read:async name=>{const result=await store.read(name);return result.ok&&!result.data.exists&&!ports.showWelcome?{...result,data:{...result.data,content:JSON.stringify({schemaVersion:1,choice:'inside',step:'choice'})}}:result;},write:request=>store.write(request)};
 const setup=createFileStorageSetup({access:server,preferences,getHost:ports.getHost,downloadSetup:ports.downloadSetup});
 ports.configureStorageMode?.(()=>setup.view().effectiveMode);
 const origins=createWorkflowExampleOrigins({store,getUserId:ports.getUserId});
 const library=withWorkflowExampleOrigins(createWorkflowLibrary({store,getScope:ports.getUserId}),origins,ports.session);
 const controller=createWorkflowLibraryController({session:ports.session,library,canAdopt:()=>!!ports.getUserId?.(),getContext:ports.getContext,isBusy:ports.isBusy,isBusyView:ports.isBusyView,activate:ports.activate,replace:ports.replace,persistSelection:ports.persistSelection,getSelection:ports.getSelection,prompt:ports.prompt,downloadCopy:ports.downloadCopy,changed:ports.changed});
 return Object.freeze({store,server,setup,library,controller,origins});
}
