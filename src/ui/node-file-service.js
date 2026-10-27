import {cloneServerFileData} from './server-file-access.js?v=0.29.0';
const fail=(code,message)=>({ok:false,error:{code,message}});
const captureData=value=>{const copied=cloneServerFileData(value);return copied===undefined?fail('INVALID_FILE_BACKEND_CONFIG','Use bounded plain file data.'):{ok:true,data:{value:copied}};};
/** New destinations belong to the host. Previously granted browser files retain their own authority. */
export function createNodeFileService({server,native}){
 const snapshot=()=>({...Object.fromEntries(Object.entries(native.snapshot()).map(([key,value])=>[key,{...value,storage:'native'}])),...server.snapshot()});
 return Object.freeze({
  storage:'server',native:false,
  get supported(){return server.supported;},get nativeSupported(){return native.supported;},
  get availability(){return server.availability;},get nativeAccessIssue(){return native.availability;},get location(){return server.location;},
  ready:server.ready,refresh:()=>server.refresh?.()??server.ready,snapshot,
  subscribe(listener){const offNative=native.subscribe(listener),offServer=server.subscribe(listener);return()=>{offNative();offServer();};},
  choose(settings){return (settings?.storage==='native'?native:server).choose(settings);},
  backend(definitions,controls){
   const copied=captureData(definitions),captured=copied.ok&&Array.isArray(copied.data.value)?copied.data.value:[];
   const nativeBackend=native.backend(captured,controls),serverBackend=server.backend(captured,controls);
   const targets=new Map(captured.map(definition=>[definition.targetId,definition.bindingId]));
   const select=async targetId=>{await native.ready;return native.snapshot()[targets.get(targetId)]?nativeBackend:serverBackend;};
   return Object.freeze({
    async load(targetId,options){return (await select(targetId)).load(targetId,options);},
    async compareAndSwap(update,writeControls={}){
     const checked=captureData(update);if(!checked.ok)return fail('INVALID_FILE_BACKEND_UPDATE','Use a plain prepared file update.');
     const request=checked.data.value,signal=writeControls.signal;
     return (await select(request.targetId)).compareAndSwap(request,{signal});
    },
    async lookupHistory(targetId,query){const checked=captureData(query);if(!checked.ok)return checked;return (await select(targetId)).lookupHistory(targetId,checked.data.value);},
    async adoptLegacy(targetId,request){const checked=captureData(request);if(!checked.ok)return checked;return (await select(targetId)).adoptLegacy(targetId,checked.data.value);},
   });
  },
 });
}
