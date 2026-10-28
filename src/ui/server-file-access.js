import {validChatSourceBinding} from '../workflow/chat-prefix-binding.js?v=0.29.1';
import {captureHistoryAdoption,validHistoryReference,parseHistoryPage,validateHistoryTransfer} from '../workflow/file-history-transfer.js?v=0.29.1';
import {sha256Text} from '../workflow/definition-data.js?v=0.29.1';
const endpoint='/api/plugins/lattice-files';
const formats=new Set(['text','json','jsonl','csv','markdown']);
const fail=(code,message)=>({ok:false,error:{code,message}});
const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256&&!/[\r\n\0]/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/** Transport envelopes contain several documents; their aggregate bound is separate from each document's byte limit. */
export function cloneServerFileData(value){
    const ancestors=new Set(),encoder=new TextEncoder();let visited=0,bytes=0;
    const add=text=>{bytes+=encoder.encode(text).byteLength;if(bytes>2097152)throw Error('File transport exceeds limits.');};
    function copy(input,depth=0){
        if(depth>32||++visited>10000)throw Error('File transport structure exceeds limits.');
        if(input===null||typeof input==='string'||typeof input==='boolean'||typeof input==='number'&&Number.isFinite(input)){add(JSON.stringify(input));return input;}
        if(typeof input!=='object'||input===null)throw Error('Use plain JSON data.');
        const array=Array.isArray(input),prototype=Object.getPrototypeOf(input);
        if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw Error('Use plain JSON data.');
        if(ancestors.has(input))throw Error('Cyclic file data.');ancestors.add(input);add(array?'[]':'{}');
        const output=array?[]:{},keys=Reflect.ownKeys(input);let count=0;
        if(array&&keys.length!==input.length+1)throw Error('Use dense JSON arrays.');
        for(const key of keys){
            if(array&&key==='length')continue;
            const property=Object.getOwnPropertyDescriptor(input,key);
            if(typeof key!=='string'||!property||!Object.hasOwn(property,'value')||!property.enumerable||array&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=input.length))throw Error('Use own JSON data.');
            if(count++)add(',');if(!array)add(JSON.stringify(key)+':');
            Object.defineProperty(output,key,{value:copy(property.value,depth+1),enumerable:true,configurable:true,writable:true});
        }
        ancestors.delete(input);return output;
    }
    try{return copy(value);}catch{return undefined;}
}
const clone=cloneServerFileData;
const checking=Object.freeze({code:'FILE_SERVICE_CHECKING',message:'Checking the Lattice file service on the SillyTavern server…'});
const install=Object.freeze({code:'FILE_SERVICE_REQUIRED',message:'Install the Lattice file service on the SillyTavern server to use file paths. See the server file setup guide.'});
const unavailable=Object.freeze({code:'FILE_SERVICE_UNAVAILABLE',message:'The Lattice file service could not be reached. Check the SillyTavern server connection and retry.'});
const userIssue=Object.freeze({code:'FILE_SERVICE_USER',message:'Refresh file access for the current SillyTavern user before configuring or saving files.'});
const stale=()=>fail('STALE_FILE_SCOPE','The captured workflow or SillyTavern user changed.');
const unknown=()=>fail('PERSISTENCE_UNKNOWN','The server file save could not be confirmed. Verify the pending save before trying again.');
const visibility=value=>plain(value)&&(['public','hidden'].includes(value.kind)&&Object.keys(value).length===1||value.kind==='actor-private'&&id(value.actorId)&&Object.keys(value).length===2);
const revision=value=>typeof value==='string'&&value.trim().length>0&&value.length<=512||Number.isSafeInteger(value)&&value>=0;
const hash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const documentText=value=>typeof value==='string'&&new TextEncoder().encode(value).byteLength<=262144;
const validDefinition=value=>plain(value)&&id(value.targetId)&&id(value.bindingId)&&typeof value.name==='string'&&value.name.length>0&&value.name.length<=256&&formats.has(value.format)&&documentText(value.content)&&value.content.length<=100000&&['create','error'].includes(value.missing)&&visibility(value.visibility);
const validStored=(value,definition)=>plain(value)&&value.targetId===definition.targetId&&value.format===definition.format&&documentText(value.content)&&revision(value.revision)&&Array.isArray(value.receipts)&&value.receipts.length<=256&&value.receipts.every(item=>plain(item)&&id(item.intentId)&&hash(item.fingerprint)&&revision(item.revision));
function bindingView(raw){
    const value=clone(raw);
    if(!plain(value)||!id(value.bindingId)||!id(value.generation)||typeof value.name!=='string'||!value.name||value.name.length>256||typeof value.path!=='string'||!value.path||value.path.length>4096||!formats.has(value.format)||!['ready','permission-required','unavailable'].includes(value.status)||value.storage!=='server')return null;
    return {bindingId:value.bindingId,name:value.name,format:value.format,path:value.path,generation:value.generation,status:value.status,storage:'server'};
}
function statusView(raw){
    const value=clone(raw);
    if(!plain(value)||value.apiVersion!==1||!id(value.userId)||typeof value.basePath!=='string'||!value.basePath||value.basePath.length>4096||typeof value.platform!=='string'||typeof value.canUseAbsolutePaths!=='boolean'||!plain(value.bindings)||Object.keys(value.bindings).length>4096)return null;
    const bindings=Object.create(null);
    for(const [key,rawBinding] of Object.entries(value.bindings)){const binding=bindingView(rawBinding);if(!binding||key!==binding.bindingId)return null;bindings[key]=binding;}
    const chooserVersion=value.chooserVersion===1&&Array.isArray(value.operations)&&['configure','load','cas','history','adopt','roots','browse'].every(action=>value.operations.includes(action))?1:0;
    return {apiVersion:1,chooserVersion,userId:value.userId,basePath:value.basePath,platform:value.platform,canUseAbsolutePaths:value.canUseAbsolutePaths,bindings};
}
/** Same-origin server paths. The browser never receives a filesystem handle. */
export function createServerFileAccess(options={}){
    const fetcher=options.fetch??((...args)=>globalThis.fetch(...args));
    const readUser=()=>{try{const user=options.getUserId?.();return id(user)?user:null;}catch{return null;}};
    let state=null,issue=checking,refreshSequence=0;
    const listeners=new Set();
    const changed=()=>{for(const listener of listeners)try{listener();}catch{}};
    const supported=()=>!!state&&readUser()===state.userId;
    const availability=()=>supported()?null:state?userIssue:issue;
    const snapshot=()=>supported()?structuredClone(state.bindings):{};
    async function request(route,body,{signal,isCurrent=()=>true,uncertain=false}={}){
        const current=()=>{try{return !signal?.aborted&&isCurrent()===true;}catch{return false;}};
        if(!current())return signal?.aborted?fail('CANCELLED','Server file access was cancelled.'):stale();
        let sent=false;
        try{
            const context=options.getContext?.(),headers={...(context?.getRequestHeaders?.()??{}),...(body===undefined?{}:{'Content-Type':'application/json'})};
            if(!current())return signal?.aborted?fail('CANCELLED','Server file access was cancelled.'):stale();
            sent=true;
            const response=await fetcher(endpoint+'/'+route,{method:body===undefined?'GET':'POST',headers,credentials:'same-origin',cache:'no-store',redirect:'error',...(signal?{signal}:{}),...(body===undefined?{}:{body:JSON.stringify(body)})});
            if(!current())return uncertain?unknown():stale();
            if(route==='status'&&response.status===404)return fail(install.code,install.message);
            if(response.status===401||response.status===403)return fail('FILE_SERVICE_DENIED','This SillyTavern user is not allowed to access server files. Ask the host owner about access.');
            if(uncertain&&response.status>=500)return unknown();
            const raw=await response.json();
            if(!current())return uncertain?unknown():stale();
            const value=clone(raw);
            if(!plain(value)||typeof value.ok!=='boolean'||!value.ok&&(!plain(value.error)||!id(value.error.code)||typeof value.error.message!=='string'))return uncertain?unknown():fail('FILE_SERVICE_RESPONSE','The Lattice file service returned an invalid response.');
            if(!response.ok&&value.ok)return uncertain?unknown():fail('FILE_SERVICE_RESPONSE','The Lattice file service could not complete this request.');
            return value;
        }catch(error){
            if(uncertain&&sent)return unknown();
            if(signal?.aborted||error?.name==='AbortError')return fail('CANCELLED','Server file access was cancelled.');
            return fail(unavailable.code,unavailable.message);
        }
    }
    async function refresh(){
        const sequence=++refreshSequence,user=readUser();
        const result=await request('status',undefined,{isCurrent:()=>sequence===refreshSequence&&(user===null||readUser()===user)});
        if(sequence!==refreshSequence)return stale();
        if(!result.ok){state=null;issue=result.error.code===install.code?install:result.error.code==='STALE_FILE_SCOPE'?userIssue:result.error.code==='FILE_SERVICE_DENIED'?result.error:unavailable;changed();return result;}
        if(plain(result.data)&&result.data.apiVersion!==1){state=null;issue={code:'FILE_SERVICE_INCOMPATIBLE',message:'Update Lattice file support on the SillyTavern server.'};changed();return fail(issue.code,issue.message);}
        const next=statusView(result.data);
        if(!next){state=null;issue=unavailable;changed();return fail('FILE_SERVICE_RESPONSE','The Lattice file service returned invalid status information.');}
        if(user!==null&&next.userId!==user){state=null;issue=userIssue;changed();return stale();}
        state=next;issue=null;changed();return {ok:true,data:{persistent:true}};
    }
    const ready=refresh();
    async function browseRequest(route,path){
        const user=readUser();
        if(!supported())return fail(userIssue.code,userIssue.message);
        if(state.chooserVersion!==1)return fail('FILE_SERVICE_INCOMPATIBLE','Update Lattice file support on the SillyTavern server to browse folders.');
        if(route==='browse'&&(typeof path!=='string'||!path||path.length>4096||path.includes('\0')))return fail('INVALID_FILE_SELECTION','Choose a server folder.');
        const result=await request(route,{userId:user,...(route==='browse'?{path}:{})},{isCurrent:()=>readUser()===user&&state?.userId===user});
        if(!result.ok)return result;
        const value=result.data,pathValid=value=>typeof value==='string'&&!!value&&value.length<=4096&&!value.includes('\0'),nameValid=value=>typeof value==='string'&&!!value&&value.length<=256&&!/[\/\\\0]/.test(value);
        const valid=plain(value)&&value.chooserVersion===1&&(route==='roots'?Array.isArray(value.roots)&&value.roots.length<=32&&value.roots.every(row=>plain(row)&&nameValid(row.name)&&pathValid(row.path)):pathValid(value.path)&&(value.parent===null||pathValid(value.parent))&&typeof value.truncated==='boolean'&&Array.isArray(value.entries)&&value.entries.length<=200&&value.entries.every(row=>plain(row)&&nameValid(row.name)&&pathValid(row.path)&&['directory','file'].includes(row.kind)));
        return valid?result:fail('FILE_SERVICE_RESPONSE','The server returned an invalid folder listing.');
    }
    async function choose(settings){
        const captured=clone(settings),user=readUser();
        if(!plain(captured)||!['open','save'].includes(captured.mode)||typeof captured.name!=='string'||!captured.name.trim()||captured.name.length>256||!formats.has(captured.format)||captured.path!==undefined&&(typeof captured.path!=='string'||captured.path.length>4096||captured.path.includes('\0'))||captured.bindingId!==undefined&&captured.bindingId!==''&&!id(captured.bindingId))return fail('INVALID_FILE_SELECTION','Enter a file path, filename and supported format.');
        if(!user)return fail(userIssue.code,userIssue.message);
        const restored=await ready;
        if(readUser()!==user)return stale();
        if(!supported()){const currentIssue=availability();return fail(currentIssue?.code??restored.error?.code??unavailable.code,currentIssue?.message??unavailable.message);}
        const selected=await request('configure',{userId:user,path:captured.path??'',name:captured.name,format:captured.format,mode:captured.mode,...(captured.bindingId?{bindingId:captured.bindingId}:{})},{isCurrent:()=>readUser()===user&&state?.userId===user});
        if(!selected.ok)return selected;
        const binding=bindingView(selected.data);
        if(!binding||binding.format!==captured.format)return fail('FILE_SERVICE_RESPONSE','The Lattice file service returned an invalid configured file.');
        state.bindings[binding.bindingId]=binding;changed();return {ok:true,data:structuredClone(binding)};
    }
    function backend(definitions,controls={}){
        const branchBinding=controls.branchBinding===undefined?undefined:clone(controls.branchBinding),getBranchBinding=typeof controls.getBranchBinding==='function'?controls.getBranchBinding:null;
        const captured=clone(definitions),scope=clone(controls.scope),targets=new Map();
        const valid=Array.isArray(captured)&&captured.length<=128&&captured.every(validDefinition)&&plain(scope)&&id(scope.userId)&&id(scope.chatId)&&(scope.actorId===undefined||id(scope.actorId))&&typeof controls.isCurrent==='function';
        let coherent=valid;
        if(valid)for(const definition of captured){if(targets.has(definition.targetId)&&JSON.stringify(targets.get(definition.targetId))!==JSON.stringify(definition))coherent=false;targets.set(definition.targetId,definition);}
        const capturedBindings=new Map(Object.entries(snapshot()));
        const initialCapture=state?Promise.resolve({ok:true}):ready.then(result=>{if(result.ok)for(const [key,binding] of Object.entries(snapshot()))capturedBindings.set(key,binding);return result;});
        const current=signal=>{try{return readUser()===scope?.userId&&state?.userId===scope?.userId&&controls.isCurrent()===true&&!controls.signal?.aborted&&!signal?.aborted;}catch{return false;}};
        function check(targetId,signal){
            if(!coherent)return fail('INVALID_FILE_BACKEND_CONFIG','Capture explicit server file definitions and a valid user/chat scope.');
            if(controls.signal?.aborted||signal?.aborted)return fail('CANCELLED','Server file access was cancelled.');
            if(!current(signal))return stale();
            const definition=targets.get(targetId),binding=definition&&capturedBindings.get(definition.bindingId);
            if(!definition)return fail('FILE_TARGET_UNAUTHORIZED','This file target was not captured.');
            if(!binding)return fail('FILE_BINDING_MISSING','Configure this node’s server file path.');
            const live=state.bindings[binding.bindingId];
            if(!live||live.generation!==binding.generation)return fail('STALE_FILE_BINDING','The selected file changed after this workflow was captured.');
            if(binding.name!==definition.name)return fail('FILE_NAME_CONFLICT','The filename differs from the configured server file. Configure the path again.');
            if(binding.format!==definition.format)return fail('FILE_FORMAT_CONFLICT','The file format differs from the configured server binding.');
            return {ok:true,data:{definition,binding}};
        }
        async function call(route,targetId,extra={},writeControls={}){
            if(!coherent)return fail('INVALID_FILE_BACKEND_CONFIG','Capture explicit server file definitions and a valid user/chat scope.');
            if(readUser()!==scope.userId)return stale();
            const initialized=await initialCapture;if(!initialized.ok)return initialized;
            const checked=check(targetId,writeControls.signal);if(!checked.ok)return checked;
            const {definition,binding}=checked.data;
            const combinedSignal=controls.signal&&writeControls.signal&&typeof AbortSignal.any==='function'?AbortSignal.any([controls.signal,writeControls.signal]):writeControls.signal??controls.signal;
            let acceptedBranchBinding=branchBinding;
            if(route==='cas'&&getBranchBinding){try{const stamp=clone(getBranchBinding());acceptedBranchBinding=validChatSourceBinding(stamp)?stamp:undefined;}catch{acceptedBranchBinding=undefined;}}
            if(!check(targetId,writeControls.signal).ok)return stale();
            const result=await request(route,{userId:scope.userId,scope,definition,generation:binding.generation,...(acceptedBranchBinding?{branchBinding:acceptedBranchBinding}:{}),...extra},{signal:combinedSignal,isCurrent:()=>check(targetId,writeControls.signal).ok,uncertain:route==='cas'||route==='restore'});
            if(!result.ok)return result;
            if(route==='load'&&!validStored(result.data,definition))return fail('FILE_SERVICE_RESPONSE','The Lattice file service returned an invalid document.');
            if(['cas','restore'].includes(route)&&(!plain(result.data)||result.data.applied!==true||typeof result.data.acknowledged!=='boolean'||!revision(result.data.revision)))return unknown();
            if(route==='history'&&(!plain(result.data)||!Number.isSafeInteger(result.data.epoch)||result.data.epoch<0||!visibility(result.data.visibility)||!Array.isArray(result.data.privateActorIds)||result.data.privateActorIds.some(actor=>!id(actor))))return fail('FILE_SERVICE_RESPONSE','The Lattice file service returned invalid history.');
            if(route==='adopt'&&(!plain(result.data)||typeof result.data.adopted!=='boolean'))return fail('FILE_SERVICE_RESPONSE','The Lattice file service returned invalid migration information.');
            return result;
        }
        return Object.freeze({
            load:targetId=>call('load',targetId),
            async readVersion(targetId,input){
                const value=clone(input);if(!plain(value)||Object.keys(value).length!==1||!id(value.versionId))return fail('INVALID_FILE_RESTORE','Choose a retained version.');
                const selected=await call('version',targetId,{request:value});if(!selected.ok)return selected;
                const data=selected.data,invalid=()=>fail('FILE_RECOVERY_TRANSFER_INVALID','The selected recovery history could not be verified.');
                if(!plain(data)||data.transfer?.schemaVersion!==1||!id(data.transfer.token)||(data.transfer.head?.pageId??null)!==(data.snapshot?.history?.head??null))return invalid();
                const pages={},seen=new Set();let reference=data.transfer.head;
                while(reference!==null){
                    if(!validHistoryReference(reference)||seen.has(reference.pageId)||seen.size>=4096)return invalid();
                    seen.add(reference.pageId);const transferred=await call('version-page',targetId,{request:{token:data.transfer.token,reference}});if(!transferred.ok)return transferred;
                    const {pageText,previous}=transferred.data??{};if(typeof pageText!=='string'||sha256Text(pageText)!==reference.hash)return invalid();
                    const parsed=parseHistoryPage(pageText,previous);if(!parsed.ok)return parsed;
                    if(parsed.data.pageId!==reference.pageId)return invalid();
                    Object.defineProperty(pages,reference.pageId,{value:parsed.data,enumerable:true});reference=previous;
                }
                const checked=check(targetId);if(!checked.ok)return checked;
                const verified=await validateHistoryTransfer({...data,pages},{targetId,scope,visibility:checked.data.definition.visibility});
                const after=check(targetId);return after.ok?verified:after;
            },
            listVersions:targetId=>call('versions',targetId),
            restoreVersion(targetId,request){const value=clone(request);return plain(value)?call('restore',targetId,{request:value}):Promise.resolve(fail('INVALID_FILE_RESTORE','Choose a retained version and current revision.'));},
            compareAndSwap(update,writeControls={}){
                const value=clone(update);
                if(!plain(value)||!id(value.targetId)||!id(value.intentId)||!revision(value.expectedRevision)||!documentText(value.expectedContent)||!hash(value.fingerprint)||!plain(value.projectedDocument)||!formats.has(value.projectedDocument.format)||!documentText(value.projectedDocument.content))return Promise.resolve(fail('INVALID_FILE_BACKEND_UPDATE','Use a checked prepared document update with a stable intent fingerprint.'));
                return call('cas',value.targetId,{update:value},writeControls);
            },
            lookupHistory(targetId,query){const value=clone(query);return plain(value)?call('history',targetId,{query:value}):Promise.resolve(fail('INVALID_HISTORY_QUERY','Use a plain document history query.'));},
            async adoptLegacy(targetId,input){
                const initialized=await initialCapture;if(!initialized.ok)return initialized;const checked=check(targetId);if(!checked.ok)return checked;
                const captured=captureHistoryAdoption(input);if(!captured.ok)return captured;
                const verified=await validateHistoryTransfer({...captured.data,visibility:checked.data.definition.visibility},{targetId,scope,visibility:checked.data.definition.visibility});if(!verified.ok)return verified;
                const value=verified.data,pages=Object.values(value.pages).reverse(),started=await call('adopt-begin',targetId,{request:{}});if(!started.ok)return started;const token=started.data?.token;if(!id(token))return fail('FILE_RECOVERY_TRANSFER_INVALID','The archive transfer could not be started.');let reference=null;
                for(const page of pages){
                    const record={pageText:JSON.stringify(page),previous:reference},uploaded=await call('adopt-page',targetId,{request:{...record,token}});if(!uploaded.ok)return uploaded;
                    if(!validHistoryReference(uploaded.data)||uploaded.data.pageId!==page.pageId||uploaded.data.hash!==sha256Text(JSON.stringify(record)))return fail('FILE_RECOVERY_TRANSFER_INVALID','The saved archive transfer could not be verified.');
                    reference=uploaded.data;
                }
                return call('adopt',targetId,{request:{snapshot:value.snapshot,transfer:{schemaVersion:1,token,head:reference}}});
            },
        });
    }
    return Object.freeze({storage:'server',native:false,capabilities:Object.freeze({persistent:true,actualFiles:true,concurrency:'serialized-checked-write',crossDeviceCAS:true,concurrencyScope:'same-service-process',externalProcessCAS:false,verifiedAcknowledgement:true}),get supported(){return supported();},get availability(){return availability();},get serviceVersion(){return supported()?{apiVersion:1,chooserVersion:state.chooserVersion}:null;},get location(){return supported()?{basePath:state.basePath,platform:state.platform,canUseAbsolutePaths:state.canUseAbsolutePaths}:null;},ready,refresh,snapshot,roots:()=>browseRequest('roots'),browse:settings=>browseRequest('browse',settings?.path),choose,backend,subscribe(listener){if(typeof listener!=='function')return()=>{};listeners.add(listener);return()=>listeners.delete(listener);}});
}
