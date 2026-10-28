import {cloneServerFileData} from './server-file-access.js?v=0.30.1';
import {captureHistoryAdoption} from '../workflow/file-history-transfer.js?v=0.30.1';
const fail=(code,message)=>({ok:false,error:{code,message}});
const captureData=value=>{const copied=cloneServerFileData(value);return copied===undefined?fail('INVALID_FILE_BACKEND_CONFIG','Use bounded plain file data.'):{ok:true,data:{value:copied}};};
/** Default managed files belong to authenticated host storage; existing grants retain their provider. */
export function createNodeFileService({host,server,native,getStorageMode}){
 const adapters=[native,server,host].filter(Boolean),primary=host??server;
 const snapshot=()=>Object.fromEntries(adapters.flatMap(adapter=>Object.entries(adapter.snapshot()).map(([key,value])=>[key,{...value,storage:adapter.storage??'native'}])));
 const owner=bindingId=>adapters.find(adapter=>Object.hasOwn(adapter.snapshot(),bindingId));
 const providers=()=>Object.fromEntries(adapters.map(adapter=>[adapter.storage??'native',{storage:adapter.storage??'native',supported:adapter.supported,availability:adapter.availability,capabilities:adapter.capabilities??null,location:adapter.location??null}]));
 return Object.freeze({
  storage:host?'host':'server',native:false,
  get supported(){return primary.supported;},get nativeSupported(){return native.supported;},
  get availability(){return primary.availability;},get nativeAccessIssue(){return native.availability;},get location(){return primary.location;},
  get capabilities(){return primary.capabilities;},get providers(){return providers();},
  ready:primary.ready,async refresh(){const results=await Promise.all(adapters.map(adapter=>adapter.refresh?.()??adapter.ready));return results[adapters.indexOf(primary)];},snapshot,
  subscribe(listener){const disposers=adapters.map(adapter=>adapter.subscribe(listener));return()=>{for(const dispose of disposers)dispose();};},
  choose(settings){
   const previous=settings?.bindingId&&owner(settings.bindingId);
   if(previous)return previous.choose(settings);
   if(settings?.storage==='native')return native.choose(settings);
   if(settings?.storage==='server'||settings?.path){if(host&&getStorageMode?.()!=='anywhere')return Promise.resolve(fail('HOST_CUSTOM_LOCATION_REQUIRED','Enable custom locations in File storage to choose a server path.'));return server.choose(settings);}
   return primary.choose(settings);
  },
  async ensureManaged(definition,controls){
   const captured=captureData(definition);if(!captured.ok)return captured;
   await Promise.all(adapters.map(adapter=>adapter.ready));
   const value=captured.data.value;
   if(!value||typeof value!=='object'||Array.isArray(value))return fail('INVALID_FILE_BACKEND_CONFIG','Use a plain captured file definition.');
   if(controls?.managed===true){
    const {bindingId,path,storage,...intent}=value;
    return host?.ensureManaged?host.ensureManaged({...intent,bindingId:''},controls):fail('HOST_FILE_UNAVAILABLE','Automatic host file storage is unavailable.');
   }
   if(value.bindingId&&owner(value.bindingId))return {ok:true,data:value};
   if(value.bindingId||value.path||['native','server','host'].includes(value.storage)){
    const provider=value.storage==='native'?native:value.storage==='host'?host:value.storage==='server'||value.path?server:null;
    if(provider?.availability)return fail(provider.availability.code,provider.availability.message);
    return fail('FILE_BINDING_MISSING','The configured file authority is unavailable. Reconnect its original destination before saving.');
   }
   return fail('FILE_MANAGED_INTENT_REQUIRED','Prepare a trusted new managed destination or reconnect the configured file.');
  },
  backend(definitions,controls){
   const copied=captureData(definitions),captured=copied.ok&&Array.isArray(copied.data.value)?copied.data.value:[];
   const backends=new Map(adapters.map(adapter=>[adapter,adapter.backend(captured,controls)])),targets=new Map(captured.map(definition=>[definition.targetId,definition.bindingId]));
   const select=async targetId=>{await Promise.all(adapters.map(adapter=>adapter.ready));return backends.get(owner(targets.get(targetId))??primary);};
   return Object.freeze({
    async readVersion(targetId,request){const checked=captureData(request);if(!checked.ok)return checked;const provider=owner(targets.get(targetId));if(!provider||!controls.isCurrent())return fail('FILE_BINDING_MISSING','Reconnect the captured file before recovery.');const backend=backends.get(provider);return backend.readVersion?backend.readVersion(targetId,checked.data.value):fail('FILE_RECOVERY_UNAVAILABLE','This provider does not support recovery versions.');},
    async listVersions(targetId){const provider=owner(targets.get(targetId));if(!provider||!controls.isCurrent())return fail('FILE_BINDING_MISSING','Reconnect the captured file before recovery.');const backend=backends.get(provider);return backend.listVersions?backend.listVersions(targetId):fail('FILE_RECOVERY_UNAVAILABLE','This provider does not support recovery versions.');},
    async restoreVersion(targetId,request){const checked=captureData(request);if(!checked.ok)return checked;const provider=owner(targets.get(targetId));if(!provider||!controls.isCurrent())return fail('FILE_BINDING_MISSING','Reconnect the captured file before recovery.');const backend=backends.get(provider);return backend.restoreVersion?backend.restoreVersion(targetId,checked.data.value):fail('FILE_RECOVERY_UNAVAILABLE','This provider does not support recovery versions.');},
    async load(targetId,options){return (await select(targetId)).load(targetId,options);},
    async compareAndSwap(update,writeControls={}){
     const checked=captureData(update);if(!checked.ok)return fail('INVALID_FILE_BACKEND_UPDATE','Use a plain prepared file update.');
     const request=checked.data.value,signal=writeControls.signal;
     return (await select(request.targetId)).compareAndSwap(request,{signal});
    },
    async lookupHistory(targetId,query){const checked=captureData(query);if(!checked.ok)return checked;return (await select(targetId)).lookupHistory(targetId,checked.data.value);},
    async adoptLegacy(targetId,request){const checked=captureHistoryAdoption(request);if(!checked.ok)return checked;return (await select(targetId)).adoptLegacy(targetId,checked.data);},
   });
  },
 });
}
