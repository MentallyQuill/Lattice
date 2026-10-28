const fail=message=>({ok:false,error:{code:'WORKFLOW_EXAMPLE_METADATA_FAILED',message}});
const valid=value=>value&&value.schemaVersion===1&&typeof value.exampleId==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.exampleId)&&Object.keys(value).every(key=>['schemaVersion','exampleId','actorBindings'].includes(key))&&(value.actorBindings===undefined||value.actorBindings&&typeof value.actorBindings==='object'&&!Array.isArray(value.actorBindings)&&Object.entries(value.actorBindings).every(([key,id])=>['character:rowan.png','character:iris.png'].includes(key)&&typeof id==='string'&&id.length>0&&id.length<=256));
/** Authenticated library metadata, never provenance accepted from imported graph fields. */
export function createWorkflowExampleOrigins({store,getUserId}){
 const origins=new WeakMap();
 const get=graph=>{const entry=graph&&origins.get(graph);return entry&&entry.userId===getUserId()?structuredClone(entry.origin):null;};
 const remember=(graph,origin)=>{if(!graph||!valid(origin))return fail('Open a registered example before preparing its files.');origins.set(graph,{userId:getUserId(),origin:structuredClone(origin)});return {ok:true};};
 const name=id=>'workflow-origin-'+id+'.json';
 return Object.freeze({get,remember,
  async read(id,graph){const user=getUserId(),result=await store.read(name(id));if(user!==getUserId())return fail('The user changed while reading example setup.');if(!result.ok)return result;if(!result.data.exists)return {ok:true};let origin;try{origin=JSON.parse(result.data.content);}catch{}if(!valid(origin))return fail('The saved example setup is unreadable. Keep the workflow and retry file access.');return remember(graph,origin);},
  async write(id,origin){if(!valid(origin))return fail('The saved example setup is invalid.');const user=getUserId(),before=await store.read(name(id));if(!before.ok)return before;if(user!==getUserId())return fail('The user changed before saving example setup.');const content=JSON.stringify(origin);if(before.data.exists&&before.data.content===content)return {ok:true};const result=await store.write({name:name(id),expectedRevision:before.data.revision,content,intentId:'origin-'+crypto.randomUUID()});if(user!==getUserId())return fail('The user changed while saving example setup.');return result.ok&&result.data.acknowledged===true?{ok:true}:fail('The workflow file was saved, but its example setup is not confirmed. Retry Save before closing this draft.');},
 });
}
/** Keep failed creation metadata retryable without creating another library ID. */
export function withWorkflowExampleOrigins(library,origins,session){
 const pending=new WeakMap();
 const wrappers=Object.fromEntries(['save','adopt','saveAs'].map(method=>[method,async request=>{
  const graph=session.current(),token=session.capture(),origin=origins.get(graph);if(!origin)return library[method](request);
  let prior=pending.get(token),result;
  if(prior){const retried=await origins.write(prior.result.data.id,prior.origin);if(!retried.ok)return retried;pending.delete(token);origins.remember(prior.result.data.graph,prior.origin);if(prior.json===request.json&&prior.method===method)return prior.result;if(method!=='save')return fail('The earlier workflow copy is now saved. Newer edits remain in this draft; choose Save again to keep them.');}
  result=await library[method](request);if(!result.ok)return result;
  const saved=await origins.write(result.data.id,origin);if(!saved.ok){pending.set(token,{method,json:request.json,origin,result});return saved;}
  origins.remember(result.data.graph,origin);return result;
 }]));
 return Object.freeze({...library,...wrappers,async read(id){const result=await library.read(id);if(!result.ok)return result;const origin=await origins.read(id,result.data.graph);return origin.ok?result:origin;}});
}
