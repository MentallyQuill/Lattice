import { artifactVisibility } from '../artifact-privacy.js?v=0.27.3';
import { cloneJsonValue } from './json-data.js?v=0.27.3';
import { decodeJson } from './json-decode.js?v=0.27.3';
import { formatRecords } from './format-records.js?v=0.27.3';
import { prepareDocumentMutation } from './document-mutations.js?v=0.27.3';
import { freeze } from '../record-data.js?v=0.27.3';
import { workflowDataPresetFor } from '../workflow-data-defaults.js?v=0.27.3';

const references = new WeakMap();
const fail=(code,message)=>({ok:false,error:{code,message}});
const formats=['json','jsonl','csv','text','markdown'];
const own=value=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error();
    const out=Object.create(null);
    for(const key of Reflect.ownKeys(value)){
        const property=Object.getOwnPropertyDescriptor(value,key);
        if(typeof key!=='string'||!property.enumerable||!Object.hasOwn(property,'value'))throw new Error();
        Object.defineProperty(out,key,{value:property.value,enumerable:true});
    }
    return out;
};
const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256;
const port=(id,label,kind,direction,required=false)=>({id,label,kind,direction,required,cardinality:'one'});
const control=(type,value,label,extra={})=>({type,default:value,label,...extra});
const enumControl=(value,label,values)=>control('enum',value,label,{values});
const textControl=(value,label,maxLength=2048)=>control('string',value,label,{maxLength});
const schemaControl=textControl('','Schema',100000);
schemaControl.editor='json';
const controls={
    format:{inputMode:enumControl('records','Input',['records','json-text']),format:enumControl('json','Serialization',formats),jsonShape:enumControl('records','JSON shape',['records','single']),mapping:enumControl('preserve','Fields',['preserve','select']),fields:control('array',[],'Field mapping',{items:'record',max:128,editor:'json'}),schema:schemaControl,columns:control('array',[],'CSV columns',{items:'string',max:128}),separator:textControl('\n','Separator'),trailingSeparator:control('boolean',false,'Trailing separator')},
    'read-file':{targetId:textControl(workflowDataPresetFor('read-file').targetId,'Data source',256),schema:schemaControl,columns:control('array',[],'CSV columns',{items:'string',max:128})},
    'write-file':{mode:enumControl('append','Mutation',['append','add','add-unique','upsert','update-fields','replace']),collectionPath:textControl('','Collection JSON Pointer'),missingPath:enumControl('error','Missing collection',['error','create']),key:textControl('id','Identity field',256),fieldPolicy:enumControl('merge','Upsert policy',['merge','replace']),fields:control('array',[],'Updated fields',{items:'string',max:128}),schema:schemaControl,columns:control('array',[],'CSV columns',{items:'string',max:128}),separator:textControl('\n','Separator'),emptyPolicy:enumControl('omit','Separator for empty destination',['omit','include']),trailingSeparator:control('boolean',false,'Trailing separator')},
};
controls['project-document']={...structuredClone(controls['write-file']),format:enumControl('json','Document format',formats)};controls['project-document'].mode.default='add';
for(const operation of ['read-file','write-file'])Object.assign(controls[operation],{actorScope:enumControl('selected','Actor scope',['selected','presence']),actorId:textControl('','Present actor identity',256)});
const registration=(id,title,phase,input,output,hostOperation=false)=>({id,title,family:id==='read-file'?'Input':id==='write-file'?'Output':'Shaping',phase,operationVersion:1,minimumSchema:3,minimumRuntime:2,input,output,defaults:Object.fromEntries(Object.entries(controls[id]).map(([key,value])=>[key,structuredClone(value.default)])),controls:Object.keys(controls[id]),controlDescriptors:controls[id],requestBound:0,modelRole:null,terminal:id==='write-file',dynamicPorts:true,...(hostOperation?{rootOnly:true,hostOperation:true}:{})});
export const FILE_OPERATIONS={format:registration('format','Format','both','data','data'),'read-file':registration('read-file','Read File','both',null,'text',true),'write-file':registration('write-file','Write to File','post','data','data',true),'project-document':registration('project-document','Project Document','both','text','data')};
function resolve(rawNode,rawOptions={}){
    try{
        const node=own(rawNode),options=own(rawOptions);
        if(node.type!==undefined&&node.type!=='workflow')return fail('INVALID_SETTINGS','File operations require a workflow node.');
        if(node.operationVersion!==undefined&&node.operationVersion!==1)return fail('INVALID_SETTINGS','File operation version must be 1.');
        const base=Object.hasOwn(FILE_OPERATIONS,node.operation)&&FILE_OPERATIONS[node.operation];
        if(!base)return fail('UNKNOWN_OPERATION','Unknown file operation.');
        const phase=options.phase??node.phase??(base.phase==='post'?'post':'pre');
        if(!['pre','post'].includes(phase)||base.phase!=='both'&&phase!==base.phase||node.phase!==undefined&&node.phase!==phase)return fail('INVALID_PHASE','File operation requires its configured workflow phase.');
        const captured=cloneJsonValue(Object.fromEntries(base.controls.map(key=>[key,Object.hasOwn(node,key)?node[key]:base.defaults[key]])));
        if(!captured.ok)return fail('INVALID_SETTINGS','File controls require bounded own JSON data.');
        const settings=captured.data.value;
        if(node.operation==='read-file'&&settings.targetId==='')settings.targetId=base.defaults.targetId;
        for(const [key,descriptor] of Object.entries(base.controlDescriptors)){
            const value=settings[key];
            if(descriptor.type==='string'&&(typeof value!=='string'||value.length>descriptor.maxLength)||descriptor.type==='enum'&&!descriptor.values.includes(value)||descriptor.type==='boolean'&&typeof value!=='boolean'||descriptor.type==='array'&&(!Array.isArray(value)||value.length>descriptor.max||descriptor.items==='string'&&value.some(item=>typeof item!=='string')))return fail('INVALID_SETTINGS','File controls require their declared type and bound.');
        }
        let schema;
        if(settings.schema!==''){
            try{schema=JSON.parse(settings.schema);}catch{return fail('UNSUPPORTED_SCHEMA','Schema must be raw JSON in the supported subset.');}
            const checked=decodeJson(null,{mode:'check',schema});
            if(!checked.ok&&checked.error.code!=='SCHEMA_MISMATCH')return checked;
        }
        if(node.operation==='format'&&settings.jsonShape==='single'&&settings.format!=='json')return fail('INVALID_SETTINGS','Single-object shape applies only to JSON serialization.');
        if(['read-file','write-file'].includes(node.operation)&&(settings.actorScope==='presence'?!id(settings.actorId):settings.actorId!==''))return fail('INVALID_SETTINGS','Presence scope requires a configured actor; selected scope uses the native selection.');
        if(node.operation==='read-file'&&!id(settings.targetId))return fail('INVALID_SETTINGS','Select an authorized target identity.');
        if(['write-file','project-document'].includes(node.operation)&&(['add-unique','upsert','update-fields'].includes(settings.mode)&&!id(settings.key)||settings.mode==='update-fields'&&(!settings.fields.length||settings.fields.some(field=>!id(field))||new Set(settings.fields).size!==settings.fields.length)))return fail('INVALID_SETTINGS','Keyed updates require an identity field and selected unique fields.');
        let ports;
        if(node.operation==='format')ports=[port('in','Records / raw JSON',settings.inputMode==='records'?'data':'text','input',true),port('records','Validated records','data','output'),port('text','Serialized text','text','output'),port('report','Format report','data','output')];
        else if(node.operation==='read-file')ports=[port('text','Contents','text','output'),port('document','Parsed document','data','output'),port('value','Parsed value','data','output'),port('reference','Live file reference','data','output')];
        else if(node.operation==='project-document')ports=[port('source','Original document','text','input',true),port(['append','replace'].includes(settings.mode)?'text':'records',['append','replace'].includes(settings.mode)?'Text':'Records',['append','replace'].includes(settings.mode)?'text':'data','input',true),port('text','Projected document text','text','output'),port('data','Projected document data','data','output'),port('receipt','Projection receipt','data','output')];
        else ports=[port('reference','Live file reference','data','input',true),port(['append','replace'].includes(settings.mode)?'text':'records',['append','replace'].includes(settings.mode)?'Text':'Records',['append','replace'].includes(settings.mode)?'text':'data','input',true),port('evidence','Canonical source evidence','data','input'),port('projection','Projected document','data','output'),port('receipt','Staging receipt','data','output')];
        if(settings.actorScope==='presence')ports.unshift(port('presence','Confirmed live actor presence','data','input',true));
        return {ok:true,data:{node:freeze({id:id(node.id)?node.id:'file-operation',type:'workflow',operation:node.operation,operationVersion:1,phase,...settings}),settings:freeze(settings),schema,ports,descriptor:{...base,phase}}};
    }catch{return fail('INVALID_SETTINGS','File settings must be own plain data properties.');}
}
export function describeFileNode(node,options={}){const resolved=resolve(node,options);return resolved.ok?{ok:true,data:{descriptor:resolved.data.descriptor,ports:resolved.data.ports}}:resolved;}
function inputArtifacts(raw,ports){
    try{
        const inputs=own(raw),out={};
        for(const [key,value] of Object.entries(inputs)){
            const pin=ports.find(port=>port.id===key&&port.direction==='input');
            if(!pin)return fail('INVALID_INPUT','Unexpected input '+key+'.');
            const artifact=own(value);
            if(artifact.kind!==pin.kind)return fail('INVALID_INPUT','Input '+key+' requires '+pin.kind+'.');
            if(key==='reference'){
                const captured=references.get(artifact.value);
                if(!captured)return fail('FILE_REFERENCE_UNAUTHORIZED','Use the exact live reference emitted by authorized Read File.');
                const metadata=cloneJsonValue(Object.fromEntries(Object.entries(artifact).filter(([field])=>field!=='value')));
                if(!metadata.ok)return metadata;
                out[key]={...metadata.data.value,value:artifact.value};
            }else{
                const checked=cloneJsonValue(value);if(!checked.ok)return checked;
                if(artifact.kind==='text'&&typeof checked.data.value.text!=='string'||artifact.kind==='data'&&!Object.hasOwn(checked.data.value,'value'))return fail('INVALID_INPUT','Input artifacts require their declared payload.');
                out[key]=freeze(checked.data.value);
            }
        }
        if(ports.some(port=>port.direction==='input'&&port.required&&!Object.hasOwn(out,port.id)))return fail('MISSING_INPUT','Connect every required file input.');
        return {ok:true,data:out};
    }catch{return fail('INVALID_INPUT','File inputs require own plain artifact data.');}
}
const visibilityOf = artifactVisibility;
function output(outputs,reports){
    const checked={};
    for(const [key,value] of Object.entries(outputs)){
        const bounded=cloneJsonValue(value);if(!bounded.ok)return fail('OUTPUT_LIMIT','File output exceeds the downstream bounded artifact contract.');
        checked[key]=key==='reference'?freeze({...bounded.data.value,value:value.value}):freeze(bounded.data.value);
    }
    return {ok:true,outputs:checked,reports:freeze(reports)};
}
const capabilityErrorMessages=Object.freeze({
    ABORTED:'The file operation was cancelled.',
    CANCELLED:'The file operation was cancelled.',
    FILE_CAPTURE_RELEASED:'This file capture has been released; read the selected target again.',
    STALE_FILE_SCOPE:'The captured user, chat or file scope changed.',
    FILE_TARGET_UNAUTHORIZED:'The selected storage target is not authorized for this workflow.',
    FILE_NOT_FOUND:'The selected storage target is unavailable; select an existing target or explicit template.',
    FILE_BACKEND_FAILED:'The selected storage target could not be accessed.',
    FILE_REFERENCE_UNAUTHORIZED:'Use the exact live reference captured by authorized Read File.',
    FILE_INTENT_UNAUTHORIZED:'The captured file intent is unavailable for this workflow.',
    FILE_INTENT_CONFLICT:'The stable intent identity already refers to different proposed content.',
    FILE_REVISION_CONFLICT:'The selected document changed after it was read; review a fresh projection.',
    FILE_EVIDENCE_FAILED:'The canonical source evidence could not be verified.',
    FILE_FINGERPRINT_FAILED:'The prepared file intent could not be fingerprinted.',
    FILE_ACCEPTANCE_REQUIRED:'File settlement requires an accepted root workflow.',
    FILE_RECEIPT_LIMIT:'Save receipts are full. Preview a history checkpoint in Workflow Data before continuing.',
    DOCUMENT_HISTORY_CHANGED:'The document history changed; read and review a fresh projection.',
    DOCUMENT_HISTORY_LIMIT:'The native history archive reached its bounded capacity.',
    DOCUMENT_HISTORY_MISSING:'A required native history page is missing.',
    INVALID_DOCUMENT_HISTORY:'The native history archive is invalid; preserve it before reconciliation.',
    HISTORY_LOOKUP_REQUIRED:'This document requires its checked native history lookup.',
    FILE_DOCUMENT_LIMIT:'The projected document exceeds supported storage bounds.',
    PERSISTENCE_UNKNOWN:'The previous file write has an unknown outcome; reconcile the selected target before retrying.',
    INVALID_FILE_CONFIG:'The trusted storage configuration is unavailable.',
    INVALID_FILE_SNAPSHOT:'The selected target did not provide a valid bounded document snapshot.',
    INVALID_FILE_INTENT:'The host did not provide a valid stable intent identity and evidence.',
    INVALID_FILE_CONTROLS:'The file settlement controls are invalid.',
    INVALID_FILE_BACKEND_CONFIG:'The selected storage backend configuration is invalid.',
    INVALID_FILE_METADATA:'The selected storage target has invalid metadata.',
    INVALID_FILE_BACKEND_UPDATE:'The selected storage backend rejected the prepared update.',
    INVALID_FILE_BACKEND_RESULT:'The selected storage backend returned an invalid result.',
    PRIVATE_DESTINATION:'Restricted records require a permitted destination preserving actor scope.',
    FILE_SCOPE_UNAVAILABLE:'The selected target scope could not be authorized.',
    ACTOR_PRESENCE_UNVERIFIED:'Use this actor’s exact confirmed live scene presence.',
    ACTOR_GRANT_REQUIRED:'The captured actor authority is unavailable.',
    STALE_ACTOR_SCOPE:'The captured actor source, user or chat changed.',
    ACTOR_NOT_LOADED:'Select an actual loaded canonical actor.',
    ACTOR_FILE_SCOPE_MISMATCH:'The live file capture must belong to the configured present actor.',
    EFFECTS_REJECTED:'The retained workflow effects were rejected.',
    STALE_EFFECT_SCOPE:'The captured workflow scope changed before staging.',
    EFFECTS_ALREADY_PUBLISHED:'This workflow has already published its accepted effects.',
    EFFECTS_SEALED:'The accepted effect set is sealed; no new file intent can be staged.',
    EFFECT_ID_CONFLICT:'The stable effect identity already refers to different proposed content.',
    DUPLICATE_EFFECT_TARGET:'Compose updates to one target into a single final projection.',
    EFFECT_BUNDLE_LIMIT:'The proposed effect set exceeds supported review bounds.',
    INVALID_STAGED_EFFECT:'The trusted host could not retain this prepared file intent.',
    EFFECT_CAPABILITY_FAILED:'The trusted host could not stage the prepared file intent.',
});
function response(raw,allowEmpty=false){
    try{
        const envelope=own(raw);
        if(envelope.ok===false){
            const error=own(envelope.error);
            if(Object.hasOwn(envelope,'data')||!id(error.code)||typeof error.message!=='string'||error.message.length>4096)return fail('INVALID_FILE_RESPONSE','File capability failure requires a bounded own error envelope.');
            // Backend messages, nested details, paths and authority fields are private diagnostics.
            // Only known codes and locally authored public messages cross the node boundary.
            return Object.hasOwn(capabilityErrorMessages,error.code)?fail(error.code,capabilityErrorMessages[error.code]):fail('FILE_CAPABILITY_FAILED','The trusted file capability failed; no successful result was accepted.');
        }
        if(envelope.ok!==true||Object.hasOwn(envelope,'error')||!allowEmpty&&!Object.hasOwn(envelope,'data'))return fail('INVALID_FILE_RESPONSE','File capability requires an own Result envelope.');
        return {ok:true,data:envelope.data};
    }catch{return fail('INVALID_FILE_RESPONSE','File capability result requires own data properties.');}
}
function validVisibility(value){return value&&typeof value==='object'&&!Array.isArray(value)&&(['public','hidden'].includes(value.kind)&&Object.keys(value).length===1||value.kind==='actor-private'&&id(value.actorId)&&Object.keys(value).length===2);}
function permits(source,destination){return source.kind==='public'||source.kind==='actor-private'&&destination.kind==='actor-private'&&source.actorId===destination.actorId||destination.kind==='hidden';}
function parseSnapshot(snapshot,settings,schema){
    if(['text','markdown'].includes(snapshot.format)&&schema!==undefined)return fail('UNSUPPORTED_SCHEMA','Plain document text has no implicit structured fields.');
    return prepareDocumentMutation(snapshot,{operation:'replace',content:snapshot.content,...(schema===undefined?{}:{schema}),...(snapshot.format==='csv'?{columns:settings.columns}:{})});
}
function mutationSettings(settings,inputs,schema,format){return settings.mode==='append'?{operation:'append-text',text:inputs.text.text,separator:settings.separator,emptyPolicy:settings.emptyPolicy,trailingSeparator:settings.trailingSeparator}:settings.mode==='replace'?{operation:'replace',content:inputs.text.text,...(schema===undefined?{}:{schema}),...(format==='csv'?{columns:settings.columns}:{})}:{operation:settings.mode,records:Array.isArray(inputs.records.value)?inputs.records.value:[inputs.records.value],collectionPath:settings.collectionPath,missingPath:settings.missingPath,...(schema===undefined?{}:{schema}),...(format==='csv'?{columns:settings.columns}:{}),...(['add-unique','upsert','update-fields'].includes(settings.mode)?{key:settings.key}:{}),...(settings.mode==='upsert'?{fieldPolicy:settings.fieldPolicy}:{}),...(settings.mode==='update-fields'?{fields:settings.fields}:{})};}
/** Pure formatting and trusted root-only storage staging; this module never commits or writes. */
export async function executeFileNode(node,namedInputs,execution={}){
    let local,files;
    try{local=own(execution);if(local.files!==undefined)files=own(local.files);}catch{return fail('INVALID_PORTS','File execution requires own trusted capabilities.');}
    if(local.signal!==undefined){try{Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(local.signal);}catch{return fail('INVALID_PORTS','Cancellation requires a genuine AbortSignal.');}}
    const cancelled=()=>local.signal?.aborted===true;
    if(cancelled())return fail('ABORTED','File operation cancelled.');
    const resolved=resolve(node,local);if(!resolved.ok)return resolved;
    const {node:capturedNode,settings,schema,ports}=resolved.data,operation=capturedNode.operation;
    if(!['format','project-document'].includes(operation)&&local.root!==true)return fail('ROOT_ONLY','Storage capabilities are reserved for a root workflow.');
    const checked=inputArtifacts(namedInputs,ports);if(!checked.ok)return checked;
    const inputs=checked.data; let visibility=visibilityOf(inputs);
    let exactPresence,presenceStamp;
    if(settings.actorScope==='presence'){
        exactPresence=own(namedInputs).presence;presenceStamp=JSON.stringify(inputs.presence);
        const value=inputs.presence.value,mark=visibilityOf(inputs.presence);
        if(!value||value.schemaVersion!==1||value.recordType!=='scene-presence'||value.status!=='present'||value.actorId!==settings.actorId||!['sceneId','sourceId','revision'].every(key=>id(value[key]))||mark.kind==='hidden'||mark.kind==='actor-private'&&mark.actorId!==settings.actorId)return fail('ACTOR_FILE_SCOPE_MISMATCH','Use the configured actor’s exact confirmed source presence.');
    }
    async function actorScope(reference){
        if(settings.actorScope!=='presence')return {ok:true};
        if(cancelled())return fail('ABORTED','Actor file operation cancelled.');
        if(typeof local.authorizeActorFileScope!=='function')return fail('FILE_SCOPE_UNAVAILABLE','Present-actor files require trusted live actor authority.');
        const unchanged=()=>{const current=cloneJsonValue(exactPresence);return current.ok&&JSON.stringify(current.data.value)===presenceStamp;};
        if(!unchanged()||id(reference?.scope?.actorId)&&reference.scope.actorId!==settings.actorId)return fail('ACTOR_FILE_SCOPE_MISMATCH','Actor file inputs changed or the reference belongs to another actor.');
        let allowed;try{allowed=response(await local.authorizeActorFileScope(Object.freeze({actorId:settings.actorId,presence:exactPresence,...(reference?{reference}:{})})));}catch{return fail('FILE_SCOPE_UNAVAILABLE','The present actor’s file authority could not be checked.');}
        if(cancelled())return fail('ABORTED','Actor file operation cancelled during scope validation.');
        if(!unchanged())return fail('ACTOR_FILE_SCOPE_MISMATCH','The exact actor presence changed during scope validation.');
        if(!allowed.ok)return allowed;const captured=cloneJsonValue(allowed.data);
        return captured.ok&&captured.data.value?.actorId===settings.actorId&&Object.keys(captured.data.value).length===1?{ok:true}:fail('ACTOR_FILE_SCOPE_MISMATCH','File authority must match the captured configured actor.');
    }
    const initialScope=await actorScope(inputs.reference?.value);if(!initialScope.ok)return initialScope;
    if(operation==='project-document'){
        const snapshot={targetId:'pure-projection',revision:0,format:settings.format,content:inputs.source.text};
        const mutation=mutationSettings(settings,inputs,schema,snapshot.format);
        const projection=prepareDocumentMutation(snapshot,mutation);if(!projection.ok)return projection;
        visibility=visibilityOf({inputs,projection:projection.data});
        const projected=projection.data.projectedDocument;
        return output({text:{kind:'text',text:projected.content,visibility},data:{kind:'data',value:Object.hasOwn(projected,'value')?projected.value:{format:projected.format,content:projected.content},visibility},receipt:{kind:'data',value:{status:'proposed',...projection.data.receipt},visibility}},[{code:'DOCUMENT_PROJECTED',actualCalls:0,operation:projection.data.operation}]);
    }
    if(operation==='format'){
        const source=settings.inputMode==='json-text'?decodeJson(inputs.in.text):{ok:true,data:{value:inputs.in.value}};
        if(!source.ok)return source;
        visibility=visibilityOf({inputs,decoded:source.data.value});
        const formatted=formatRecords(source.data.value,{format:settings.format,...(settings.format==='json'&&settings.jsonShape==='single'?{jsonShape:'single'}:{}),...(settings.mapping==='select'?{fields:settings.fields}:{}),...(schema===undefined?{}:{schema}),...(settings.format==='csv'?{columns:settings.columns}:['text','markdown'].includes(settings.format)?{separator:settings.separator,trailingSeparator:settings.trailingSeparator}:{})});
        if(!formatted.ok)return formatted;
        visibility=visibilityOf({inputs,decoded:source.data.value,records:formatted.data.records});
        return output({records:{kind:'data',value:formatted.data.records,visibility},text:{kind:'text',text:formatted.data.text,visibility},report:{kind:'data',value:{serialization:formatted.data.serialization,findings:formatted.data.report,count:formatted.data.records.length},visibility}},[{code:'FORMATTED_RECORDS',actualCalls:0,count:formatted.data.records.length}]);
    }
    if(operation==='read-file'){
        if(typeof files?.read!=='function')return fail('INVALID_PORTS','Read File requires the trusted files.read capability.');
        let loaded;try{loaded=response(await files.read(settings.targetId));}catch{return fail(cancelled()?'ABORTED':'FILE_READ_FAILED','The authorized file could not be read.');}
        if(cancelled())return fail('ABORTED','Ignore the cancelled file read.');
        if(!loaded.ok)return loaded;
        const loadedScope=await actorScope();if(!loadedScope.ok)return loadedScope;
        let snapshot,fileRef;
        try{
            const content=own(loaded.data),checkedSnapshot=cloneJsonValue(content.snapshot),ref=cloneJsonValue(content.fileRef);
            if(!checkedSnapshot.ok||!ref.ok)return fail('INVALID_FILE_RESPONSE','Read File requires bounded document and live reference data.');
            snapshot=checkedSnapshot.data.value;fileRef=content.fileRef;
            if(!snapshot||typeof snapshot!=='object'||!ref.data.value.scope||typeof ref.data.value.scope!=='object'||!id(ref.data.value.scope.userId)||!id(ref.data.value.scope.chatId)||Object.keys(ref.data.value.scope).some(key=>!['userId','chatId','actorId'].includes(key))||Object.hasOwn(ref.data.value.scope,'actorId')&&!id(ref.data.value.scope.actorId)||!Object.isFrozen(fileRef)||Object.keys(ref.data.value).length!==5||snapshot.targetId!==settings.targetId||ref.data.value.kind!=='file-reference'||ref.data.value.backend!=='host-store'||ref.data.value.targetId!==snapshot.targetId||ref.data.value.revision!==snapshot.revision)return fail('INVALID_FILE_RESPONSE','The reference must match the exact target and observed revision.');
        }catch{return fail('INVALID_FILE_RESPONSE','Read File requires an own document/reference result.');}
        const checkedScope=await actorScope(fileRef);if(!checkedScope.ok)return checkedScope;
        const parsed=parseSnapshot(snapshot,settings,schema);if(!parsed.ok)return parsed;
        const value=parsed.data.projectedDocument?.value;
        let fileVisibility=visibilityOf({value,...(id(fileRef.scope?.actorId)?{visibility:{kind:'actor-private',actorId:fileRef.scope.actorId}}:{})});
        if(typeof local.fileVisibility==='function'){
            let policy;try{policy=response(await local.fileVisibility(freeze({reference:fileRef,snapshot:freeze(snapshot)})));}catch{return fail('FILE_SCOPE_UNAVAILABLE','The file visibility policy could not be checked.');}
            if(cancelled())return fail('ABORTED','File read cancelled during scope validation.');
            if(!policy.ok)return policy;
            const mark=cloneJsonValue(policy.data);
            if(!mark.ok||!validVisibility(mark.data.value)||!permits(fileVisibility,mark.data.value))return fail('PRIVATE_DESTINATION','A file policy cannot declassify captured actor or record privacy.');
            fileVisibility=mark.data.value;
        }
        const finalScope=await actorScope(fileRef);if(!finalScope.ok)return finalScope;
        if(settings.actorScope==='presence'&&fileVisibility.kind==='actor-private'&&fileVisibility.actorId!==settings.actorId)return fail('ACTOR_FILE_SCOPE_MISMATCH','The private document belongs to a different actor.');
        fileVisibility=visibilityOf({visibility:fileVisibility,inputs});
        const produced=output({text:{kind:'text',text:snapshot.content,visibility:fileVisibility},document:{kind:'data',value:{targetId:snapshot.targetId,revision:snapshot.revision,format:snapshot.format,...(value===undefined?{}:{value})},visibility:fileVisibility},...(value===undefined?{}:{value:{kind:'data',value,visibility:fileVisibility}}),reference:{kind:'data',value:fileRef,visibility:fileVisibility}},[{code:'FILE_READ',actualCalls:0,targetId:snapshot.targetId,revision:snapshot.revision}]);
        if(produced.ok && value===undefined)produced.outputStates={value:{status:'skipped',reason:{code:'FILE_VALUE_UNAVAILABLE',message:'Plain text and Markdown documents have no parsed structured value.'}}};
        if(produced.ok)references.set(fileRef,{snapshot:freeze(snapshot),visibility:freeze(fileVisibility),actorId:settings.actorScope==='presence'?settings.actorId:fileRef.scope.actorId??(fileVisibility.kind==='actor-private'?fileVisibility.actorId:undefined)});
        return produced;
    }
    if(typeof files?.prepare!=='function'||typeof local.createIntentId!=='function'||typeof local.stageFileIntent!=='function'||typeof local.authorizeFileWrite!=='function')return fail('INVALID_PORTS','Write to File requires trusted preparation, stable identity, scope authorization and staging capabilities.');
    const captured=references.get(inputs.reference.value),snapshot=captured.snapshot;
    if(settings.actorScope==='presence'&&captured.actorId!==undefined&&captured.actorId!==settings.actorId)return fail('ACTOR_FILE_SCOPE_MISMATCH','Write requires the same present actor that captured the live file reference.');
    const evidence=inputs.evidence===undefined?[]:Array.isArray(inputs.evidence.value)?inputs.evidence.value:[inputs.evidence.value];
    if(evidence.length>128)return fail('EVIDENCE_LIMIT','At most 128 canonical evidence records can accompany one write.');
    const mutation=mutationSettings(settings,inputs,schema,snapshot.format);
    const projection=prepareDocumentMutation(snapshot,mutation);if(!projection.ok)return projection;
    visibility=visibilityOf({inputs,projection:projection.data});
    let authorized,intent,prepared;
    try{
        authorized=response(await local.authorizeFileWrite(freeze({reference:inputs.reference.value,visibility,evidence:freeze(evidence),projection:freeze(projection.data)})));
        if(cancelled())return fail('ABORTED','File staging cancelled during scope validation.');
        if(!authorized.ok)return authorized;
        const authorizedScope=await actorScope(inputs.reference.value);if(!authorizedScope.ok)return authorizedScope;
        const policy=cloneJsonValue(authorized.data),destination=policy.ok?policy.data.value.destinationVisibility:null;
        if(!validVisibility(destination)||!permits(visibility,destination)||!permits(captured.visibility,destination))return fail('PRIVATE_DESTINATION','Restricted records require a permitted destination preserving actor scope.');
        intent=response(await local.createIntentId(capturedNode,freeze(evidence)));
        if(cancelled())return fail('ABORTED','File staging cancelled during identity capture.');
        if(!intent.ok)return intent;
        const identityScope=await actorScope(inputs.reference.value);if(!identityScope.ok)return identityScope;
        if(!id(intent.data))return fail('INVALID_FILE_INTENT','The host must derive a bounded stable canonical intent identity.');
        prepared=response(await files.prepare(inputs.reference.value,freeze(mutation),freeze({intentId:intent.data,evidence})));
        if(cancelled())return fail('ABORTED','File staging cancelled during preparation.');
        if(!prepared.ok)return prepared;
        const preparedScope=await actorScope(inputs.reference.value);if(!preparedScope.ok)return preparedScope;
        const proposed=own(prepared.data),plan=cloneJsonValue(proposed.plan);
        if(!plan.ok||proposed.status!=='staged'||plan.data.value.targetId!==snapshot.targetId||plan.data.value.expectedRevision!==snapshot.revision||JSON.stringify(plan.data.value)!==JSON.stringify(projection.data)||typeof proposed.handle!=='object'||proposed.handle===null)return fail('INVALID_FILE_RESPONSE','Prepared intent must preserve the exact checked document projection.');
        const produced=output({projection:{kind:'data',value:plan.data.value.projectedDocument,visibility:destination},receipt:{kind:'data',value:{intentId:intent.data,targetId:snapshot.targetId,expectedRevision:snapshot.revision,status:'staged',...plan.data.value.receipt},visibility:destination}},[{code:'FILE_INTENT_STAGED',actualCalls:0,targetId:snapshot.targetId,operation:plan.data.value.operation}]);
        if(!produced.ok)return produced;produced.artifact=produced.outputs.receipt;
        const staged=response(await local.stageFileIntent(prepared.data,freeze(evidence)),true);
        if(cancelled())return fail('ABORTED','File staging cancelled; retained intents must be rejected by host cancellation.');
        if(!staged.ok)return staged;const stagedScope=await actorScope(inputs.reference.value);return stagedScope.ok?produced:stagedScope;
    }catch{return fail(cancelled()?'ABORTED':'FILE_STAGE_FAILED','The trusted file intent could not be prepared or staged.');}
}
