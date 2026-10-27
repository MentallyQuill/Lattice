import {documentHistoryHeader,inspectDocumentHistory,lookupDocumentHistory,validateDocumentHistory} from '../workflow/document-history.js?v=0.28.1';
import {validChatSourceBinding} from '../workflow/chat-prefix-binding.js?v=0.28.1';
import {cloneJsonValue} from '../workflow/operations/json-data.js?v=0.28.1';
import {sha256Text} from '../workflow/definition-data.js?v=0.28.1';
const fail=(code,message,cancelled=false)=>({ok:false,...(cancelled?{cancelled:true}:{}),error:{code,message}});
const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=value=>{const checked=cloneJsonValue(value);return checked.ok?checked.data.value:null;};
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const validVisibility=value=>plain(value)&&(['public','hidden'].includes(value.kind)&&Object.keys(value).length===1||value.kind==='actor-private'&&id(value.actorId)&&Object.keys(value).length===2);
const hash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const coordinators=new WeakMap();
const formats={json:['JSON document','application/json','.json'],jsonl:['JSON Lines document','application/x-ndjson','.jsonl'],csv:['CSV document','text/csv','.csv'],text:['Text document','text/plain','.txt'],markdown:['Markdown document','text/markdown','.md']};
function fileAvailability(supported){
    if(supported)return null;
    if(globalThis.isSecureContext===false)return Object.freeze({code:'FILE_ACCESS_INSECURE',message:'Direct file saving requires a secure page. Open SillyTavern over HTTPS or localhost, then choose the file again. File uploads and downloads do not grant this access.'});
    if(typeof globalThis.navigator?.brave?.isBrave==='function')return Object.freeze({code:'FILE_ACCESS_BRAVE',message:'Brave is not exposing direct file saving. Enable “File System Access API” at brave://flags/#file-system-access-api and relaunch Brave, or use Chrome or Edge. File uploads and downloads do not grant this access.'});
    return Object.freeze({code:'FILE_ACCESS_UNSUPPORTED',message:'This browser does not provide direct file saving. Open this workflow in desktop Chrome or Edge. File uploads and downloads do not grant this access.'});
}
const changedError=cause=>cause?.name==='AbortError'?fail('FILE_CANCELLED','The file selection was cancelled.',true):cause?.name==='NotAllowedError'||cause?.name==='SecurityError'?fail('FILE_PERMISSION','Choose this file again to grant file access.'):fail('FILE_ACCESS_FAILED','The selected file could not be accessed.');
function captureUpdate(value){
    try{
        if(!plain(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return null;
        const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(value),allowed=['targetId','expectedRevision','expectedContent','projectedDocument','intentId','fingerprint','sourceBinding','expectedBindingFingerprint'];
        if(keys.some(key=>typeof key!=='string'||!allowed.includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))return null;
        if(keys.length!==(Object.hasOwn(descriptors,'sourceBinding')?8:6))return null;
        const result={};
        for(const key of keys){const checked=cloneJsonValue(descriptors[key].value);if(!checked.ok)return null;result[key]=checked.data.value;}
        return result;
    }catch{return null;}
}
function indexedPersistence(indexedDB){
    if(!indexedDB)return null;
    const opened=new Promise((resolve,reject)=>{
        const request=indexedDB.open('lattice-node-files',1);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('state'))request.result.createObjectStore('state');};
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('File database blocked'));
    });
    async function transaction(mode,value){
        const db=await opened;
        return new Promise((resolve,reject)=>{
            const tx=db.transaction('state',mode,mode==='readwrite'?{durability:'strict'}:undefined),store=tx.objectStore('state');
            const request=mode==='readwrite'?store.put(value,'files'):store.get('files');let result;
            request.onsuccess=()=>{result=request.result;};request.onerror=()=>reject(request.error);
            tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error);
        });
    }
    return {load:()=>transaction('readonly'),save:value=>transaction('readwrite',value)};
}
/** Native handles and durable write identities remain origin-local. */
export function createNodeFileAccess(options={}){
    const openPicker=options.showOpenFilePicker??globalThis.showOpenFilePicker?.bind(globalThis),savePicker=options.showSaveFilePicker??globalThis.showSaveFilePicker?.bind(globalThis);
    const supported=typeof openPicker==='function'&&typeof savePicker==='function',availability=fileAvailability(supported);
    const persistence=options.persistence??indexedPersistence(options.indexedDB??globalThis.indexedDB);
    let bindings=[],records={},restoredReady=false;
    const coordinator=options.persistence??options.indexedDB??globalThis.indexedDB??{};
    function enqueue(action){
        const before=coordinators.get(coordinator)??Promise.resolve();
        const pending=before.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('lattice-node-files-write',action):action());
        coordinators.set(coordinator,pending.catch(()=>{}));return pending;
    }
    async function refresh(){try{const state=await persistence.load();bindings=(state?.bindings??[]).map(row=>({...row,status:bindings.find(old=>old.bindingId===row.bindingId&&old.generation===row.generation)?.status??'permission-required'}));records=state?.records??{};return {ok:true};}catch{return fail('FILE_STORAGE_FAILED','Local file state could not be restored.');}}
    const listeners=new Set();
    const changed=()=>{try{options.onChange?.();}catch{}for(const listener of listeners){try{listener();}catch{}}};
    const ready=(async()=>{try{if(!persistence)return fail('FILE_STORAGE_UNAVAILABLE','Durable local file storage is unavailable.');const state=await persistence.load();bindings=(state?.bindings??[]).map(row=>({...row,status:'permission-required'}));records=state?.records??{};restoredReady=true;changed();return {ok:true,data:{persistent:true}};}catch{return fail('FILE_STORAGE_FAILED','Local file bindings could not be restored.');}})();
    const snapshot=()=>Object.fromEntries(bindings.map(({bindingId,name,format,status})=>[bindingId,{bindingId,name,format,status}]));
    async function choose(settings){
        const {mode,bindingId,name,format}=settings??{};
        if(!['open','save'].includes(mode)||typeof name!=='string'||!name.trim()||name.length>255||/[<>:"/\\|?*\x00-\x1f]/.test(name)||!formats[format])return fail('INVALID_FILE_SELECTION','Choose a filename and supported document format.');
        const picker=mode==='open'?openPicker:savePicker;
        if(typeof picker!=='function')return fail('FILE_ACCESS_UNSUPPORTED',availability.message);
        try{
            const [description,mime,extension]=formats[format],configuration={types:[{description,accept:{[mime]:[extension]}}],...(mode==='open'?{multiple:false,mode:'readwrite'}:{suggestedName:name})};
            // The picker must start before the first await, while the click is active.
            const selection=picker(configuration),selected=await selection,handle=mode==='open'?selected?.[0]:selected;
            if(!handle)return fail('FILE_CANCELLED','The file selection was cancelled.',true);
            if(typeof handle.queryPermission==='function'&&await handle.queryPermission({mode:'readwrite'})!=='granted')return fail('FILE_PERMISSION','Choose this file again to grant read and write access.');
            const restored=await ready;if(!restored.ok)return restored;
            const pending=enqueue(async()=>{
                const refreshed=await refresh();if(!refreshed.ok)return refreshed;
                let same;
                for(const row of bindings){try{if(handle===row.handle||typeof handle.isSameEntry==='function'&&await handle.isSameEntry(row.handle)){same=row;break;}}catch{}}
                if(same&&same.format!==format&&bindingId!==same.bindingId)return fail('FILE_FORMAT_CONFLICT','This file is already bound with a different document format.');
                if(same&&same.format===format&&same.name===(handle.name||name)&&!!same.initializeEmpty===(mode==='save')){if(same.status!=='ready'){same.status='ready';changed();}return {ok:true,data:{bindingId:same.bindingId,name:same.name}};}
                const identity=same?.bindingId??crypto.randomUUID(),entry={bindingId:identity,name:handle.name||name,format,generation:crypto.randomUUID(),handle,initializeEmpty:mode==='save',status:'ready'};
                const next=[...bindings.filter(row=>row.bindingId!==identity),entry];
                let nextRecords=records;
                if(same){nextRecords={};for(const [key,record] of Object.entries(records)){const parts=JSON.parse(key);if(parts[4]===same.bindingId&&parts[5]===same.generation)parts[5]=entry.generation;nextRecords[JSON.stringify(parts)]=record;}}
                try{await persistence.save({bindings:next,records:nextRecords});}catch{return fail('FILE_STORAGE_FAILED','The selected file binding could not be persisted.');}
                bindings=next;records=nextRecords;changed();return {ok:true,data:{bindingId:identity,name:entry.name}};
            });return pending;
        }catch(cause){return changedError(cause);}
    }
    function backend(definitions,controls={}){
        const captured=Array.isArray(definitions)&&definitions.length<=128?definitions.map(own):[];
        const targets=new Map((Array.isArray(captured)?captured:[]).filter(plain).map(row=>[row.targetId,row]));
        const capturedBindings=new Map(bindings.map(row=>[row.bindingId,{...row}]));
        const initialCapture=restoredReady?Promise.resolve():ready.then(()=>{for(const row of bindings)capturedBindings.set(row.bindingId,{...row});});
        const capturedScope=own(controls.scope),isCurrent=controls.isCurrent,signal=controls.signal;
        const valid=plain(capturedScope)&&id(capturedScope.userId)&&id(capturedScope.chatId)&&(capturedScope.actorId===undefined||id(capturedScope.actorId))&&typeof isCurrent==='function'&&Array.isArray(definitions)&&captured.length===definitions.length&&captured.every(row=>plain(row)&&id(row.targetId)&&id(row.bindingId)&&typeof row.name==='string'&&Object.hasOwn(formats,row.format)&&typeof row.content==='string'&&['create','error'].includes(row.missing)&&validVisibility(row.visibility)&&canonical(targets.get(row.targetId))===canonical(row));
        function current(targetId){
            if(!valid)return fail('INVALID_FILE_BACKEND_CONFIG','Capture explicit file definitions and a valid user/chat scope.');
            try{if(signal?.aborted)return fail('CANCELLED','File access was cancelled.');if(isCurrent()!==true)return fail('STALE_FILE_SCOPE','The captured workflow or user/chat changed.');}catch{return fail('STALE_FILE_SCOPE','The captured file scope could not be verified.');}
            const definition=targets.get(targetId),binding=definition&&capturedBindings.get(definition.bindingId);
            if(!definition)return fail('FILE_TARGET_UNAUTHORIZED','This file target was not captured.');
            if(!binding)return fail('FILE_BINDING_MISSING','Choose a local file for this node.');
            if(binding.name!==definition.name)return fail('FILE_NAME_CONFLICT','The configured filename differs from its selected native file. Choose the destination again.');
            if(binding.format!==definition.format)return fail('FILE_FORMAT_CONFLICT','This file target disagrees with its selected binding format.');
            if(bindings.find(row=>row.bindingId===binding.bindingId)?.generation!==binding.generation)return fail('STALE_FILE_BINDING','The selected file changed after this workflow was captured.');
            return {ok:true,data:{definition,binding}};
        }
        function status(binding,value){const live=bindings.find(row=>row.bindingId===binding.bindingId&&row.generation===binding.generation);if(live&&live.status!==value){live.status=value;changed();}}
        const recordKey=targetId=>JSON.stringify([capturedScope.userId,capturedScope.chatId,capturedScope.actorId??null,targetId,targets.get(targetId)?.bindingId,capturedBindings.get(targets.get(targetId)?.bindingId)?.generation]);
        async function disk(binding,definition){
            try{const file=await binding.handle.getFile();if(file.size>262144)throw Object.assign(new Error('Document byte limit exceeded'),{code:'FILE_DOCUMENT_LIMIT'});const content=await file.text();if(typeof content!=='string'||new TextEncoder().encode(content).byteLength>262144)throw Object.assign(new Error('Document byte limit exceeded'),{code:'FILE_DOCUMENT_LIMIT'});return {content,revision:sha256Text(content)};}
            catch(cause){if(cause?.name==='NotFoundError'&&definition.missing==='create')return {content:null,revision:'missing:'+sha256Text(definition.content)};throw cause;}
        }
        function effectiveContent(binding,definition,raw){
            const saved=Object.entries(records).some(([key,record])=>{const identity=JSON.parse(key);return identity[4]===binding.bindingId&&identity[5]===binding.generation&&record.receipts?.length>0;});
            if(raw===null)return definition.content;
            return raw===''&&binding.initializeEmpty===true&&definition.missing==='create'&&!saved?definition.content:raw;
        }
        async function read(targetId){
            const restored=await ready;if(!restored.ok)return restored;
            await initialCapture;
            const refreshed=await refresh();if(!refreshed.ok)return refreshed;
            const checked=current(targetId);if(!checked.ok)return checked;
            const {definition,binding}=checked.data;
            try{
                if(typeof binding.handle.queryPermission==='function'&&await binding.handle.queryPermission({mode:'readwrite'})!=='granted'){status(binding,'permission-required');return fail('FILE_PERMISSION','Choose this file again to grant read and write access.');}
                const {content,revision}=await disk(binding,definition);status(binding,'ready');
                const after=current(targetId);if(!after.ok)return after;
                const reconciled=await reconcile(binding,revision);if(!reconciled.ok)return reconciled;
                return {ok:true,data:{targetId,format:definition.format,content:effectiveContent(binding,definition,content),revision,receipts:structuredClone(records[recordKey(targetId)]?.receipts??[]),history:structuredClone(records[recordKey(targetId)]?.history??{schemaVersion:1,epoch:0,head:null}),...(records[recordKey(targetId)]?.sourceBinding?{sourceBinding:structuredClone(records[recordKey(targetId)].sourceBinding)}:{})}};
            }catch(cause){if(cause?.code==='FILE_DOCUMENT_LIMIT')return fail('FILE_DOCUMENT_LIMIT','File documents must fit the existing 262,144-byte admission bound.');status(binding,cause?.name==='NotAllowedError'||cause?.name==='SecurityError'?'permission-required':'unavailable');return cause?.name==='NotFoundError'?fail('FILE_NOT_FOUND','The selected file is missing.'):changedError(cause);}
        }
        function retainedMetadata(record){const {receipts,pending,sourceBinding,...metadata}=record??{};return metadata;}
        async function reconcile(binding,hash){
            let next=records,dirty=false;
            for(const [key,record] of Object.entries(records)){
                const identity=JSON.parse(key),pending=record.pending;
                if(identity[4]!==binding.bindingId||identity[5]!==binding.generation||!pending)continue;
                if(hash!==pending.afterHash&&hash!==pending.beforeHash)return fail('PERSISTENCE_UNKNOWN','A pending file write differs from both reviewed versions. Reconcile this file before continuing.');
                const receipts=hash===pending.afterHash?[...record.receipts,{intentId:pending.intentId,fingerprint:pending.fingerprint,revision:pending.revision}]:record.receipts;
                const metadata=hash===pending.afterHash?pending.sourceBinding:record.sourceBinding;
                next={...next,[key]:{...retainedMetadata(record),receipts,...(metadata?{sourceBinding:metadata}:{})}};dirty=true;
            }
            if(dirty){try{await persistence.save({bindings,records:next});records=next;}catch{return fail('PERSISTENCE_UNKNOWN','The recovered file receipt could not be persisted.');}}
            return {ok:true};
        }
        function load(targetId){return enqueue(()=>read(targetId));}
        async function lookupHistory(targetId,query){
            const capturedQuery=own(query);if(!plain(capturedQuery))return fail('INVALID_HISTORY_QUERY','Use bounded own history identities.');
            const loaded=await load(targetId);if(!loaded.ok)return loaded;
            const stored=records[recordKey(targetId)];
            if(stored?.legacyAssociation)return lookupDocumentHistory({targetId,scope:capturedScope,history:stored.history,pages:stored.historyPages??{}},capturedQuery);
            const visibility=targets.get(targetId).visibility??{kind:'public'};
            return {ok:true,data:{epoch:0,visibility,privateActorIds:visibility.kind==='actor-private'?[visibility.actorId]:[],...(capturedQuery.outcomes?{outcomes:[]}:{}),...(capturedQuery.progression?{progression:{knownIdentityKeys:[],eventIdentities:[]}}:{})}};
        }
        function adoptLegacy(targetId,request){
            let snapshot,pages;
            try{
                const descriptors=Object.getOwnPropertyDescriptors(request);
                if(Reflect.ownKeys(request).some(key=>!['snapshot','pages'].includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))throw Error('Own legacy data required');
                snapshot=own(descriptors.snapshot?.value);pages=descriptors.pages?.value;
            }catch{return Promise.resolve(fail('INVALID_DOCUMENT_HISTORY','Adoption requires trusted own legacy snapshot and archive data.'));}
            const header=documentHistoryHeader(snapshot?.history);
            if(!plain(snapshot)||snapshot.targetId!==targetId||canonical(snapshot.scope)!==canonical(capturedScope)||!Object.hasOwn(formats,snapshot.format)||typeof snapshot.content!=='string'||!Array.isArray(snapshot.receipts)||snapshot.receipts.length>256||snapshot.receipts.some(receipt=>!plain(receipt)||!id(receipt.intentId)||!hash(receipt.fingerprint)||!(id(receipt.revision)||Number.isSafeInteger(receipt.revision)&&receipt.revision>=0))||snapshot.sourceBinding!==undefined&&!validChatSourceBinding(snapshot.sourceBinding)||!header.ok)return Promise.resolve(fail('INVALID_DOCUMENT_HISTORY','Legacy adoption must match the captured scope and target and contain checked save identities.'));
            const inspected=inspectDocumentHistory({targetId,scope:capturedScope,history:header.data,pages});
            if(!inspected.ok)return Promise.resolve(inspected);
            const historyPages=Object.fromEntries(inspected.data.pages.map(page=>[page.pageId,page]));
            return enqueue(async()=>{
                const validated=await validateDocumentHistory({targetId,scope:capturedScope,history:header.data,pages:historyPages});if(!validated.ok)return validated;
                const loaded=await read(targetId);if(!loaded.ok)return loaded;
                const key=recordKey(targetId),existing=records[key]??{receipts:[]};
                if(existing.legacyAssociation)return {ok:true,data:{adopted:true}};
                if(loaded.data.content!==snapshot.content||loaded.data.format!==snapshot.format)return {ok:true,data:{adopted:false}};
                const receipts=[...existing.receipts];
                for(const receipt of snapshot.receipts){const previous=receipts.find(item=>item.intentId===receipt.intentId);if(previous&&previous.fingerprint!==receipt.fingerprint)return fail('FILE_INTENT_CONFLICT','Legacy and local receipt identities disagree.');if(!previous)receipts.push(receipt);}
                if(receipts.length>256)return fail('FILE_RECEIPT_LIMIT','The merged legacy receipts exceed this file’s checked capacity.');
                const metadata={...existing,legacyAssociation:true,history:header.data,historyPages,receipts,...(!existing.sourceBinding&&snapshot.sourceBinding?{sourceBinding:snapshot.sourceBinding}:{})};
                const checked=current(targetId);if(!checked.ok)return checked;
                let latest;try{latest=await disk(checked.data.binding,checked.data.definition);}catch(cause){return cause?.name==='NotFoundError'?fail('FILE_NOT_FOUND','The selected file disappeared during migration.'):changedError(cause);}
                if(latest.revision!==loaded.data.revision||effectiveContent(checked.data.binding,checked.data.definition,latest.content)!==snapshot.content)return {ok:true,data:{adopted:false}};
                const after=current(targetId);if(!after.ok)return after;
                const next={...records,[key]:metadata};
                try{await persistence.save({bindings,records:next});records=next;return {ok:true,data:{adopted:true}};}catch{return fail('FILE_JOURNAL_FAILED','Legacy file history could not be durably associated.');}
            });
        }
        async function settle(change,writeControls){
            if(writeControls.signal?.aborted)return fail('CANCELLED','File settlement was cancelled.');
            const loaded=await read(change.targetId);if(!loaded.ok)return loaded;
            if(change.projectedDocument?.format!==loaded.data.format)return fail('FILE_FORMAT_CONFLICT','The prepared document must retain its selected file format.');
            const existing=loaded.data.receipts.find(receipt=>receipt.intentId===change.intentId);
            if(existing)return existing.fingerprint===change.fingerprint?{ok:true,data:{applied:true,acknowledged:true,revision:existing.revision}}:fail('FILE_INTENT_CONFLICT','This saved intent identity has different content.');
            if(loaded.data.receipts.length>=256)return fail('FILE_RECEIPT_LIMIT','This file reached its receipt capacity; reconcile its durable history before another write.');
            if(loaded.data.revision!==change.expectedRevision||loaded.data.content!==change.expectedContent)return fail('FILE_REVISION_CONFLICT','The file changed after this projection was reviewed.');
            if(loaded.data.format==='json'&&loaded.data.history.epoch>0){
                let previous,next;try{previous=JSON.parse(loaded.data.content);next=JSON.parse(change.projectedDocument.content);}catch{}
                if(plain(previous)&&Object.hasOwn(previous,'historyCheckpoint')){const marker=previous.historyCheckpoint;if(!plain(marker)||Object.keys(marker).length!==2||marker.targetId!==change.targetId||marker.epoch!==loaded.data.history.epoch||!plain(next)||canonical(next.historyCheckpoint)!==canonical(marker))return fail('DOCUMENT_HISTORY_CHANGED','Preserve this document’s checked history marker when updating its active state.');}
            }
            if(change.sourceBinding&&sha256Text(canonical(loaded.data.sourceBinding??null))!==change.expectedBindingFingerprint)return fail('FILE_REVISION_CONFLICT','The stored chat source binding changed before this write.');
            const checked=current(change.targetId);if(!checked.ok)return checked;
            const {binding,definition}=checked.data,key=recordKey(change.targetId),revision=sha256Text(change.projectedDocument.content);
            const pendingRecord={...records[key],receipts:records[key]?.receipts??[],pending:{intentId:change.intentId,fingerprint:change.fingerprint,beforeHash:loaded.data.revision,afterHash:revision,revision,...(change.sourceBinding?{sourceBinding:change.sourceBinding}:{})}};
            const journal={...records,[key]:pendingRecord};
            try{await persistence.save({bindings,records:journal});records=journal;}catch{return fail('FILE_JOURNAL_FAILED','The write intent could not be durably recorded; no disk write was started.');}
            const beforeWrite=current(change.targetId);if(!beforeWrite.ok)return beforeWrite;
            if(writeControls.signal?.aborted)return fail('CANCELLED','File settlement was cancelled.');
            let writer;
            try{
                if(typeof binding.handle.queryPermission==='function'&&await binding.handle.queryPermission({mode:'readwrite'})!=='granted'){status(binding,'permission-required');return fail('FILE_PERMISSION','Choose this file again to grant read and write access.');}
                const latest=await disk(binding,definition),latestText=latest.content;
                if(latest.revision!==change.expectedRevision||effectiveContent(binding,definition,latestText)!==change.expectedContent)return fail('FILE_REVISION_CONFLICT','The file changed while the pending write was persisted.');
                const afterRead=current(change.targetId);if(!afterRead.ok)return afterRead;
                if(writeControls.signal?.aborted)return fail('CANCELLED','File settlement was cancelled.');
                writer=await binding.handle.createWritable();
                const beforeBytes=current(change.targetId);if(!beforeBytes.ok){await writer.abort?.();return beforeBytes;}
                if(writeControls.signal?.aborted){await writer.abort?.();return fail('CANCELLED','File settlement was cancelled.');}
                await writer.write(change.projectedDocument.content);
                const beforeClose=current(change.targetId);if(!beforeClose.ok){await writer.abort?.();return beforeClose;}
                if(writeControls.signal?.aborted){await writer.abort?.();return fail('CANCELLED','File settlement was cancelled.');}
                await writer.close();writer=null;
                let actual;try{actual=await disk(binding,definition);}catch{return fail('PERSISTENCE_UNKNOWN','The file was closed but its resulting bytes could not be verified.');}
                if(actual.revision!==revision)return fail('PERSISTENCE_UNKNOWN','The file differs from the intended bytes after close; reconcile its pending intent.');
                const next={...records,[key]:{...retainedMetadata(records[key]),receipts:[...(records[key]?.receipts??[]),{intentId:change.intentId,fingerprint:change.fingerprint,revision}],...(change.sourceBinding?{sourceBinding:change.sourceBinding}:{})}};
                try{await persistence.save({bindings,records:next});records=next;return {ok:true,data:{applied:true,acknowledged:true,revision}};}catch{return {ok:true,data:{applied:true,acknowledged:false,revision}};}
            }catch(cause){try{await writer?.abort?.();}catch{}if(cause?.name==='NotAllowedError'||cause?.name==='SecurityError'){status(binding,'permission-required');return changedError(cause);}return cause?.name==='AbortError'?fail('CANCELLED','File settlement was cancelled.'):fail('FILE_WRITE_FAILED','The selected file could not be saved.');}
        }
        function compareAndSwap(update,writeControls={}){
            const capturedUpdate=captureUpdate(update);
            if(!plain(capturedUpdate)||!id(capturedUpdate.targetId)||!id(capturedUpdate.intentId)||!id(capturedUpdate.expectedRevision)||typeof capturedUpdate.expectedContent!=='string'||!hash(capturedUpdate.fingerprint)||!plain(capturedUpdate.projectedDocument)||!formats[capturedUpdate.projectedDocument.format]||typeof capturedUpdate.projectedDocument.content!=='string')return Promise.resolve(fail('INVALID_FILE_BACKEND_UPDATE','Use a plain bounded prepared document update with a stable intent fingerprint.'));
            if(capturedUpdate.sourceBinding&&(!validChatSourceBinding(capturedUpdate.sourceBinding)||!hash(capturedUpdate.expectedBindingFingerprint)))return Promise.resolve(fail('INVALID_FILE_BACKEND_UPDATE','A chat-bound write needs a valid captured source binding and baseline fingerprint.'));
            const capturedWriteControls={signal:writeControls.signal};
            return enqueue(()=>settle(capturedUpdate,capturedWriteControls));
        }
        return Object.freeze({load,compareAndSwap,lookupHistory,adoptLegacy});
    }
    return Object.freeze({backend,supported,native:supported,availability,ready,snapshot,choose,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}});
}
let sharedAccess;
export function getNodeFileAccess(){return sharedAccess??=createNodeFileAccess();}
export function setNodeFileAccess(adapter=null){sharedAccess=adapter??undefined;}
