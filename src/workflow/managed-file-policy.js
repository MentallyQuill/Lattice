import { sha256Text } from './definition-data.js?v=0.29.0';
import { cloneJsonValue } from './operations/json-data.js?v=0.29.0';
import { freeze } from './record-data.js?v=0.29.0';
import { decodeJson, validateJsonSchema } from './operations/json-decode.js?v=0.29.0';
import { validateNodeFileTarget } from './node-file-targets.js?v=0.29.0';
const suffixes=Object.freeze({text:'txt',markdown:'md',json:'json',jsonl:'jsonl',csv:'csv'});
const fail=(message)=>({ok:false,error:{code:'INVALID_MANAGED_FILE',message,field:'fileTarget'}});
const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=4096;
export function inferManagedFileFormat(node,{inputFormat,inputKind}={}) {
    if(['story-clock','commit-outcomes','random-pick'].includes(node.operation))return 'json';
    if(node.fileTarget?.format)return node.fileTarget.format;
    if(node.schema||inputKind==='data'||['add','add-unique','upsert','update-fields'].includes(node.mode))return 'json';
    return Object.hasOwn(suffixes,inputFormat)?inputFormat:'text';
}
function schemaInitial(schema,depth=0){
    if(depth>16)throw Error();
    if(Object.hasOwn(schema,'const'))return schema.const;
    if(schema.enum)return schema.enum[0];
    if(schema.type==='object')return Object.fromEntries((schema.required??[]).map(key=>[key,schemaInitial(schema.properties?.[key]??{},depth+1)]));
    if(schema.type==='array'){if((schema.minItems??0)>1000)throw Error();return Array.from({length:schema.minItems??0},()=>schemaInitial(schema.items??{},depth+1));}
    if(schema.type==='string'){if((schema.minLength??0)>10000)throw Error();return ' '.repeat(schema.minLength??0);}
    if(['number','integer'].includes(schema.type))return schema.type==='integer'?Math.ceil(schema.minimum??Math.min(0,schema.maximum??0)):schema.minimum??Math.min(0,schema.maximum??0);
    if(schema.type==='boolean')return false;
    return null;
}
/** Friendly labels never grant path authority. Only the final known suffix is normalized. */
export function canonicalFileName(name,format='text') {
    const suffix=suffixes[format];if(!suffix)throw new TypeError('Unsupported file format.');
    let base=String(name??'').split(/[\\/]/).at(-1).replace(/[<>:"|?*\x00-\x1f]/g,'_').trim().replace(/^[. ]+|[. ]+$/g,'');
    while(/\.(?:txt|md|markdown|json|jsonl|csv)$/i.test(base))base=base.replace(/\.(?:txt|md|markdown|json|jsonl|csv)$/i,'');
    base=base.replace(/[. ]+$/g,'')||'Untitled';
    if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base='_'+base;
    return base.slice(0,240)+'.'+suffix;
}
/** Pure authored-intent resolution. workflowId must come from trusted document ownership. */
export function resolveManagedFileNode(raw,{workflowId,address,legacyDocuments=[],actorId,inputFormat,inputKind,inputColumns}={}) {
    const checked=cloneJsonValue(raw);if(!checked.ok)return fail('Managed files require bounded own node data.');
    const node=checked.data.value,target=node.fileTarget??{};
    if(target.managed!==true)return {ok:true,data:{node:freeze(node),definition:null}};
    const valid=validateNodeFileTarget(target);if(!valid.ok)return valid;
    if(!['read-file','write-file','story-clock','commit-outcomes','random-pick'].includes(node.operation)||target.bindingId||target.path||Object.keys(target).some(key=>!['managed','name','format','missing','visibility','content','bindingId','path'].includes(key)))return fail('Managed intent cannot contain imported file authority.');
    if(node.operation==='write-file'&&node.destinationMode!=='own')return fail('Connected writers inherit the exact source file.');
    if(!id(workflowId)||!id(address?.nodeId??node.id)||!Array.isArray(address?.instancePath??[])||(address?.instancePath??[]).some(part=>!id(part)))return fail('Managed files require trusted workflow and qualified node ownership.');
    const controlKey=node.operation==='story-clock'?'clockId':node.operation==='random-pick'?'ledgerId':'targetId';
    const specialized=['story-clock','commit-outcomes','random-pick'].includes(node.operation),format=inferManagedFileFormat(node,{inputFormat,inputKind});
    if(!Object.hasOwn(suffixes,format)||specialized&&target.format!==undefined&&target.format!=='json')return fail('Choose a compatible file format.');
    if(format==='csv'){const columns=cloneJsonValue(node.columns?.length?node.columns:inputColumns??[]);if(!columns.ok||!Array.isArray(columns.data.value)||!columns.data.value.length||columns.data.value.length>128||columns.data.value.some(value=>typeof value!=='string'||!value.length)||new Set(columns.data.value).size!==columns.data.value.length)return fail('CSV requires unique declared column names.');node.columns=columns.data.value;}
    const visibility=target.visibility??(node.actorScope==='presence'?{kind:'actor-private',actorId:node.actorId??actorId}:{kind:'public'});
    if(!visibility||!['public','hidden','actor-private'].includes(visibility.kind)||visibility.kind==='actor-private'&&!id(visibility.actorId)||node.actorScope==='presence'&&(visibility.kind!=='actor-private'||visibility.actorId!==(node.actorId??actorId)))return fail('Managed files must preserve the selected actor scope.');
    const targetId='managed:'+sha256Text(JSON.stringify([workflowId,address?.instancePath??[],address?.nodeId??node.id,visibility.kind,visibility.actorId??null])).slice(7);
    let initial='[]';
    if(format==='json'&&!specialized&&node.schema){try{const schema=JSON.parse(node.schema);if(!validateJsonSchema(schema).ok)return fail('Choose a supported JSON schema.');const value=schemaInitial(schema);if(!decodeJson(value,{mode:'check',schema}).ok)return fail('The schema needs a valid initial managed value.');initial=JSON.stringify(value);}catch{return fail('Choose a valid bounded JSON schema.');}}
    const content=node.operation==='story-clock'?JSON.stringify({schemaVersion:1,clockId:targetId,calendarId:'story-calendar',dayLengthMinutes:1440,absoluteMinute:0,revision:1,unit:'minute',originMinute:0,originDay:1,timeEvidence:{kind:'explicit'}}):format==='json'?initial:format==='csv'?(node.columns??[]).map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')+'\r\n':'';
    const definition={targetId,bindingId:'',name:canonicalFileName(target.name||node.title||node.operation,format),format,missing:target.missing??'create',content,visibility};
    const {targetId:unused,...fileTarget}=definition;
    return {ok:true,data:freeze({node:{...node,[controlKey]:targetId,fileTarget},definition})};
}
/** Allocate trusted binding metadata only. Provider initialization writes wait for acceptance. */
export async function prepareManagedNodeFiles(nodes,context) {
    try {
        const resolved=[],definitions=[],grants=new Map(),key=address=>JSON.stringify([address.workflowId,address.instancePath,address.nodeId]);
        const entries=(Array.isArray(nodes)?nodes:Object.values(nodes??{})).map(entry=>entry.node?entry:{node:entry,address:{nodeId:entry.id,instancePath:[]}});
        const candidates=[];
        for(const wrapped of entries){
            const checked=resolveManagedFileNode(wrapped.node,{...context,address:wrapped.address,inputFormat:wrapped.inputFormat,inputKind:wrapped.inputKind,inputColumns:wrapped.inputColumns});if(!checked.ok)return checked;
            candidates.push(checked.data);
        }
        const indexed=new Map(entries.map((entry,index)=>[key(entry.address),index]));
        // Explicit typed connections share the commit-owned ledger. Model outcome IDs never select it.
        for(let index=0;index<entries.length;index++){
            if(entries[index].node.operation!=='random-pick'||!candidates[index].definition)continue;
            const sinks=new Set(),pending=[key(entries[index].address)],visited=new Set();
            while(pending.length){
                const source=pending.pop();if(visited.has(source))continue;visited.add(source);
                for(const edge of context.edges??[]){
                    if(key(edge.from)!==source||edge.from.portId!=='out')continue;
                    const destination=indexed.get(key(edge.to));if(destination===undefined)continue;
                    const operation=entries[destination].node.operation;
                    if(operation==='commit-outcomes'&&edge.to.portId==='outcomes'&&candidates[destination].definition)sinks.add(destination);
                    else if(['effect-author','stage-outcome'].includes(operation)&&edge.to.portId==='in')pending.push(key(edge.to));
                }
            }
            if(sinks.size>1)return {ok:false,error:{code:'MANAGED_OUTCOME_AMBIGUOUS',message:'Choose one outcomes file for this random selection; its connected commits own different files.',field:'fileTarget',nodeId:entries[index].node.id}};
            if(sinks.size){const sink=candidates[[...sinks][0]];if(entries[index].node.fileTarget.visibility&&JSON.stringify(entries[index].node.fileTarget.visibility)!==JSON.stringify(sink.definition.visibility))return fail('Connected outcome files must preserve the same privacy.');candidates[index]={node:freeze({...candidates[index].node,ledgerId:sink.definition.targetId,fileTarget:sink.node.fileTarget}),definition:sink.definition};}
        }
        for(let index=0;index<entries.length;index++){
            if(context.isCurrent?.()!==true)return {ok:false,error:{code:'STALE_FILE_SCOPE',message:'The managed file scope changed.'}};
            const candidate=candidates[index];let node=candidate.node;
            if(candidate.definition){
                if(typeof context.access?.ensureManaged!=='function')return {ok:false,error:{code:'FILE_ACCESS_REQUIRED',message:'Managed file storage is unavailable.'}};
                const granted=grants.has(candidate.definition.targetId)?{ok:true,data:grants.get(candidate.definition.targetId)}:await context.access.ensureManaged(candidate.definition,{scope:context.scope,isCurrent:context.isCurrent,managed:true});
                if(context.isCurrent()!==true)return {ok:false,error:{code:'STALE_FILE_SCOPE',message:'The managed file scope changed.'}};
                if(!granted?.ok)return granted;
                const definition=granted.data;
                if(definition?.targetId!==candidate.definition.targetId||!id(definition.bindingId)||definition.format!==candidate.definition.format||definition.content!==candidate.definition.content||JSON.stringify(definition.visibility)!==JSON.stringify(candidate.definition.visibility))return fail('The managed provider changed the captured file definition.');
                const fileTarget=Object.fromEntries(['bindingId','name','format','missing','content','visibility','path'].filter(key=>Object.hasOwn(definition,key)).map(key=>[key,definition[key]]));node=freeze({...node,fileTarget});if(!grants.has(definition.targetId)){definitions.push(definition);grants.set(definition.targetId,definition);}
            }
            resolved.push(node);
        }
        return {ok:true,data:freeze({nodes:resolved,definitions})};
    }catch{return fail('Managed files could not be prepared safely.');}
}
