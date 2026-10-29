import {parseWorkflowDocument,serializeWorkflowDocument} from '../workflow/document-file.js?v=0.30.3';
import {computeDefinitionIdentity,definitionRefKey} from '../workflow/definition-data.js?v=0.30.3';
import {remapExampleMetadata} from '../workflow/example-metadata.js?v=0.30.3';
import {viewIdentityKey} from './view-state.js?v=0.30.3';

const fail=(code,message,extra={})=>({ok:false,error:{code,message,...extra}});
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id);
const INDEX='workflow-library-index.json';
const documentName=id=>'workflow-'+id+'.json';
const freshId=()=> 'wf-'+crypto.randomUUID();

/** A same-user copy keeps model configuration, but receives no existing file grant. */
function independentCopy(graph) {
    const snapshots=graph.definitions??{},copies=new Map(),active=new Set();
    const detach=target=>{const result=structuredClone(target);if(Object.keys(result).length){result.bindingId='';delete result.path;}return result;};
    const reference=ref=>{const original=snapshots[definitionRefKey(ref)];if(!original)return structuredClone(ref);const copy=definition(original);return {id:copy.id,version:copy.version,semanticHash:copy.semanticHash};};
    const parameterTarget=(original,parameter)=>{
        let scope=original.body;
        for(const id of parameter.target.instancePath){scope=snapshots[definitionRefKey(scope.nodes[id].definition)]?.body;if(!scope)return null;}
        return scope.nodes[parameter.target.nodeId];
    };
    function document(original) {
        const copy=structuredClone(original);
        for(const [id,node] of Object.entries(copy.nodes)) {
            if(node.fileTarget)node.fileTarget=detach(node.fileTarget);
            if(node.type==='workflow'&&node.operation==='for-each'&&node.helper?.id)node.helper=reference(node.helper);
            if(node.type==='subgraph') {
                const originalDefinition=snapshots[definitionRefKey(original.nodes[id].definition)];
                for(const [key,value] of Object.entries(node.parameterOverrides??{})) {
                    const parameter=originalDefinition?.parameters.find(item=>item.id===key),target=parameter&&parameterTarget(originalDefinition,parameter);
                    if(parameter?.target.controlId==='fileTarget'&&value&&typeof value==='object')node.parameterOverrides[key]=detach(value);
                    if(parameter?.target.controlId==='helper'&&target?.operation==='for-each'&&value?.id)node.parameterOverrides[key]=reference(value);
                }
                node.definition=reference(node.definition);
            }
        }
        if(copy.definitions)copy.definitions=Object.fromEntries(Object.values(original.definitions).map(value=>{const next=definition(value);return [definitionRefKey(next),next];}));
        return copy;
    }
    function definition(original) {
        const key=definitionRefKey(original);if(copies.has(key))return copies.get(key);
        if(active.has(key))throw new Error('Recursive workflow definitions cannot be copied.');active.add(key);
        const next={...structuredClone(original),body:document(original.body)};
        const checked=computeDefinitionIdentity(next,{snapshots:{...snapshots,...Object.fromEntries([...copies.values()].map(value=>[definitionRefKey(value),value]))}});
        if(!checked.ok)throw new Error(checked.error.message);
        const result={...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};copies.set(key,result);active.delete(key);return result;
    }
    const copied=document(graph),references=Object.fromEntries([...copies].map(([key,value])=>[key,{id:value.id,version:value.version,semanticHash:value.semanticHash}]));
    return {graph:copied,references};
}

/** Shared authored documents live in host files; settings contain no library index. */
export function createWorkflowLibrary({store,serialize=serializeWorkflowDocument,parse=parseWorkflowDocument,createId=freshId,getScope=()=>null}) {
    const listeners=new Set(),drafts=new Map(),creations=new Map();
    const notify=event=>{for(const listener of listeners)try{listener(event);}catch{ /* UI listeners cannot invalidate acknowledged saves. */ }};
    const current=scope=>scope===getScope();
    const stale=()=>fail('STALE_LIBRARY_CONTEXT','The user changed while saving. The attempted workflow is retained.');
    function creation(kind,json,name) {
        const scope=getScope(),key=JSON.stringify([kind,name??'',json]);
        if(!creations.has(scope))creations.set(scope,new Map());const pending=creations.get(scope);
        if(!pending.has(key))pending.set(key,createId());
        return {id:pending.get(key),finish(result){if(result.ok){pending.delete(key);if(!pending.size)creations.delete(scope);}return result;}};
    }
    async function index() {
        let result;try{result=await store.read(INDEX);}catch{return fail('WORKFLOW_INDEX_UNAVAILABLE','The saved workflow list is unavailable. Your documents are preserved.');}if(!result.ok)return result;
        if(!result.data.exists)return {ok:true,data:{entries:[],revision:null}};
        try {
            const value=JSON.parse(result.data.content);
            if(value.schema!==1||!Array.isArray(value.entries)||value.entries.some(entry=>!validId(entry.id)||typeof entry.name!=='string')||new Set(value.entries.map(entry=>entry.id)).size!==value.entries.length)throw Error();
            return {ok:true,data:{entries:value.entries,revision:result.data.revision}};
        }catch{return fail('WORKFLOW_INDEX_INVALID','The saved workflow list could not be read. Existing documents have been preserved.');}
    }
    async function register(entry,scope) {
        for(let attempt=0;attempt<3;attempt++) {
            const loaded=await index();if(!current(scope))return stale();if(!loaded.ok)return loaded;
            const entries=loaded.data.entries.filter(item=>item.id!==entry.id);entries.push(entry);
            const content=JSON.stringify({schema:1,entries});let result;
            try{result=await store.write({name:INDEX,expectedRevision:loaded.data.revision,content,intentId:createId()});}catch{return fail('WORKFLOW_INDEX_UNAVAILABLE','The saved workflow list could not be confirmed. Your document is retained.');}
            if(!current(scope))return stale();
            if(result.ok)return result.data.acknowledged===true&&result.data.content===content&&typeof result.data.revision==='string'?result:fail('WORKFLOW_ACK_MISSING','The workflow list save was not acknowledged.');
            if(!/CONFLICT|STALE/.test(result.error?.code??''))return result;
        }
        return fail('WORKFLOW_INDEX_CONFLICT','The workflow is saved, but the saved workflow list changed. Retry to add it to the list.');
    }
    async function read(id) {
        if(!validId(id))return fail('WORKFLOW_ID_INVALID','Choose a saved workflow.');
        const scope=getScope();let result;try{result=await store.read(documentName(id));}catch{return fail('WORKFLOW_READ_FAILED','The saved workflow is unavailable.');}
        if(!current(scope))return stale();if(!result.ok)return result;
        if(!result.data.exists)return fail('WORKFLOW_MISSING','This saved workflow is unavailable.');
        const parsed=parse(result.data.content);if(!parsed.ok)return parsed;
        return {ok:true,data:{...parsed.data,id,name:parsed.data.graph.name||'Untitled',revision:result.data.revision,json:result.data.content,source:{kind:'library',id,name:parsed.data.graph.name||'Untitled',revision:result.data.revision}}};
    }
    async function save({id,expectedRevision,json}) {
        if(!validId(id)||!(expectedRevision===null||typeof expectedRevision==='string'))return fail('WORKFLOW_ID_INVALID','Choose a saved workflow and its saved revision.');
        const parsed=parse(json);if(!parsed.ok)return parsed;
        const scope=getScope();
        if(!drafts.has(scope))drafts.set(scope,new Map());const scopeDrafts=drafts.get(scope);
        const previous=scopeDrafts.get(id),attemptId=previous?.json===json&&previous.expectedRevision===expectedRevision?previous.intentId:createId();
        const draft={id,json,expectedRevision,intentId:attemptId};scopeDrafts.set(id,draft);
        let result;
        try { result=await store.write({name:documentName(id),expectedRevision,content:json,intentId:attemptId}); }
        catch {return fail('WORKFLOW_SAVE_FAILED','The workflow save could not be confirmed. Your draft is retained.');}
        if(!current(scope))return stale();if(!result.ok)return result;
        if(result.data.acknowledged!==true||typeof result.data.revision!=='string'||result.data.content!==json)return fail('WORKFLOW_ACK_MISSING','The workflow save could not be confirmed. Your draft is retained.');
        const entry={id,name:parsed.data.graph.name||'Untitled'};
        const registered=await register(entry,scope);
        if(!registered.ok)return {...registered,data:{...entry,revision:result.data.revision,documentAcknowledged:true}};
        if(scopeDrafts.get(id)===draft)scopeDrafts.delete(id);if(!scopeDrafts.size)drafts.delete(scope);
        const data={...parsed.data,...entry,revision:result.data.revision,json,acknowledged:true,concurrency:'verified-write',source:{kind:'library',...entry,revision:result.data.revision}};
        notify({type:'saved',...entry,revision:data.revision});return {ok:true,data};
    }
    return Object.freeze({
        async list(){const scope=getScope(),result=await index();return !current(scope)?stale():result.ok?{ok:true,data:result.data.entries}:result;},
        read,save,
        async adopt({json,name}) {
            const parsed=parse(json);if(!parsed.ok)return parsed;
            const created=creation('adopt',json,name),id=created.id;if(!validId(id))return fail('WORKFLOW_ID_INVALID','A saved workflow identity could not be created.');
            if(name?.trim())parsed.data.graph.name=name.trim();
            const encoded=serialize(parsed.data.graph,parsed.data.workspaceViews,{exampleMetadata:parsed.data.exampleMetadata});if(!encoded.ok)return encoded;
            // Changing document storage is not a copy/export and preserves the user's existing configuration.
            return created.finish(await save({id,expectedRevision:null,json:encoded.data.json}));
        },
        async saveAs({json,name}) {
            const parsed=parse(json);if(!parsed.ok)return parsed;
            const created=creation('copy',json,name),id=created.id;if(!validId(id))return fail('WORKFLOW_ID_INVALID','A new workflow identity could not be created.');
            let copied;try{copied=independentCopy(parsed.data.graph);}catch{return fail('WORKFLOW_COPY_FAILED','The independent workflow copy could not be prepared. Your original remains open.');}
            copied.graph.id=id;copied.graph.name=name?.trim()||parsed.data.graph.name||'Untitled';
            let views=parsed.data.workspaceViews?structuredClone(parsed.data.workspaceViews):null;
            if(views){
                const activeIndex=views.views.findIndex(view=>viewIdentityKey(view.identity)===views.activeKey);
                const remap=value=>{
                    if(Array.isArray(value))return value.map(remap);
                    if(!value||typeof value!=='object')return value;
                    const reference=value.id&&value.version&&value.semanticHash?copied.references[definitionRefKey(value)]:null;
                    if(reference)return {...value,...reference};
                    return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='workflowId'&&item===parsed.data.graph.id?id:remap(item)]));
                };
                views=remap(views);views.activeKey=viewIdentityKey(views.views[activeIndex]?.identity??{kind:'root',workflowId:id});
            }
            const metadata=parsed.data.exampleMetadata?remapExampleMetadata(parsed.data.exampleMetadata,{definitions:copied.references}):undefined;
            const encoded=serialize(copied.graph,views,{exampleMetadata:metadata});if(!encoded.ok)return encoded;
            return created.finish(await save({id,expectedRevision:null,json:encoded.data.json}));
        },
        recovery:()=>[...(drafts.get(getScope())?.values()??[])].map(value=>({...value})),
        subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
        capabilities:Object.freeze({persistent:true,actualFiles:true,verifiedAcknowledgement:true,concurrency:'verified-write',crossDeviceCAS:false}),
    });
}
