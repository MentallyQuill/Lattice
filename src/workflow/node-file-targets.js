import { cloneJsonValue } from './operations/json-data.js?v=0.29.0';
import { freeze, plain } from './record-data.js?v=0.29.0';
const fail=(code,message)=>({ok:false,error:{code,message,field:'fileTarget'}});
export const NODE_FILE_TARGET_CONTROL=freeze({type:'object',default:{},label:'File',editor:'json',max:8,hidden:true,exposable:false});
export const FILE_HANDLING_CONTROL=freeze({type:'enum',default:'',label:'File handling',values:['','replace','append']});
export const nodeFileFormats=Object.freeze(['json','jsonl','csv','text','markdown']);
const id=value=>typeof value==='string'&&!!value.trim()&&value.length<=256&&!/[\r\n\0]/.test(value);
export const validNodeFileName=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256&&!/[<>:"/\\|?*\x00-\x1f]/.test(value)&&!['.','..'].includes(value)&&!/[. ]$/.test(value)&&! /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
/** Authored intent only. A binding ID is resolved exclusively by the file service. */
export function validateNodeFileTarget(raw={}) {
    const checked=cloneJsonValue(raw);if(!checked.ok)return fail('INVALID_FILE_TARGET','File settings require bounded own JSON data.');
    const value=checked.data.value,keys=['bindingId','name','format','missing','content','visibility','path','managed'];
    if(!plain(value)||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))return fail('INVALID_FILE_TARGET','Use the declared File settings.');
    if(!Object.keys(value).length)return {ok:true,data:{}};
    if(Object.hasOwn(value,'managed')){
        if(value.managed!==true||value.bindingId||value.path||Object.hasOwn(value,'content'))return fail('INVALID_FILE_TARGET','Managed intent cannot import bindings, paths or initial story contents.');
        const allowed={...value};delete allowed.managed;
        const valid=validateNodeFileTarget(allowed);if(!valid.ok)return valid;
        return {ok:true,data:freeze({...value})};
    }
    const target={bindingId:'',name:'',format:'text',missing:'create',content:'',visibility:{kind:'public'},...value};
    if(Object.hasOwn(target,'path')){
        if(typeof target.path!=='string'||target.path.length>4096||/[\0\r\n]/.test(target.path))return fail('INVALID_FILE_TARGET','Use a file path of at most 4,096 characters.');
        if(target.path.trim()){
            target.name=target.path.split(/[\\/]/).at(-1);
            if(!validNodeFileName(target.name))return fail('INVALID_FILE_TARGET','Include a valid filename at the end of the file path.');
        }
    }
    const mark=target.visibility;
    if(typeof target.bindingId!=='string'||target.bindingId!==''&&!id(target.bindingId)||typeof target.name!=='string'||target.name!==''&&!validNodeFileName(target.name)||!nodeFileFormats.includes(target.format)||!['create','error'].includes(target.missing)||typeof target.content!=='string'||target.content.length>100000||!plain(mark)||Object.keys(mark).some(key=>!['kind','actorId'].includes(key))||!['public','hidden','actor-private'].includes(mark.kind)||(mark.kind==='actor-private'?!id(mark.actorId):Object.hasOwn(mark,'actorId')))return fail('INVALID_FILE_TARGET','Choose a filename, supported format, creation policy and visibility.');
    target.visibility=mark.kind==='actor-private'?{kind:mark.kind,actorId:mark.actorId}:{kind:mark.kind};
    return {ok:true,data:freeze(target)};
}
/** Storage identity stays the authored logical ID; bindingId is never substituted for it. */
export function nodeFileTargetId(node) {
    const property=(key,fallback)=>{const value=Object.getOwnPropertyDescriptor(node,key);return value&&Object.hasOwn(value,'value')?value.value:fallback;};
    const operation=property('operation');
    if(operation==='write-file')return property('destinationMode','connected')==='own'?property('targetId',''):null;
    if(operation==='random-pick')return property('ledgerId','')||null;
    if(operation==='story-clock')return property('clockId','')||'lattice-default-clock';
    if(operation==='commit-outcomes')return property('targetId','')||'lattice-default-outcomes';
    if(operation==='read-file')return property('targetId','')||'lattice-default-notes';
    return null;
}
/** Capture all graph destinations together so incompatible nodes cannot authorize one file. */
export function captureNodeFileTargets(nodes,{legacyDocuments=[]}={}) {
    try {
        const definitions=new Map(),bindings=new Map(),required=[];
        for(const node of Array.isArray(nodes)?nodes:Object.values(nodes??{})){
            if(!['read-file','write-file','story-clock','commit-outcomes','random-pick'].includes(node.operation))continue;
            const field=Object.getOwnPropertyDescriptor(node,'fileTarget');
            if(field&&!Object.hasOwn(field,'value'))return fail('INVALID_FILE_TARGET','File settings require own data.');
            const checked=validateNodeFileTarget(field?.value??{});if(!checked.ok)return checked;
            const fileTarget=checked.data,targetId=nodeFileTargetId(node);
            if(!targetId){if(Object.keys(fileTarget).length&&node.operation==='random-pick')return fail('FILE_SETUP_REQUIRED','Choose an outcomes identity for the selected file.');continue;}
            if(!id(targetId))return fail('FILE_SETUP_REQUIRED','Choose a logical document identity in the File section.');
            required.push({targetId,nodeId:node.id});
            if(!Object.keys(fileTarget).length)continue;
            if(!fileTarget.bindingId||!fileTarget.name)return fail('FILE_SETUP_REQUIRED','Choose a local file and filename in the File section.');
            const definition={targetId,...fileTarget};
            if(definitions.has(targetId)&&JSON.stringify(definitions.get(targetId))!==JSON.stringify(definition)||bindings.has(fileTarget.bindingId)&&bindings.get(fileTarget.bindingId)!==targetId)return fail('FILE_TARGET_CONFLICT','Nodes sharing a destination must use the same logical identity, file and settings.');
            definitions.set(targetId,definition);bindings.set(fileTarget.bindingId,targetId);
        }
        for(const {targetId,nodeId} of required)if(!definitions.has(targetId)&&!legacyDocuments.some(doc=>doc.targetId===targetId))return {ok:false,error:{code:'FILE_SETUP_REQUIRED',message:'Choose a file and filename in this node’s File section.',field:'fileTarget',nodeId}};
        return {ok:true,data:freeze({definitions:[...definitions.values()],targetIds:[...new Set(required.map(item=>item.targetId))]})};
    }catch{return fail('INVALID_FILE_TARGET','File destinations could not be captured safely.');}
}
