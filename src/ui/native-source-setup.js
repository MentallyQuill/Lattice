/** Explicit native source setup. Display never enrolls, verifies, or saves. */
export function createNativeSourceSetup(env){
 let capture=null,active=null,sequence=0,notice='',issue='',observed=null;
 const fail=(code,message)=>({ok:false,error:{code,message}}),stale=()=>fail('STALE_SOURCE_SETUP','Refresh source setup in the current document and chat.');
 const read=()=>{try{const controller=env.controller(),document=env.documentToken(),result=controller?.inspectSources?.();return result?.ok&&document?{controller,document,state:result.data,scope:JSON.stringify(result.data.scope),signature:JSON.stringify(result.data)}:{issue:result?.error?.message??'Source setup requires an active native user and chat.'};}catch{return {issue:'Source setup is unavailable.'};}};
 const sameOwner=(a,b)=>!!a&&!!b&&!b.issue&&a.controller===b.controller&&a.document===b.document&&a.scope===b.scope;
 function cancel(){active?.abort.abort();active=null;capture=null;notice='';issue='';}
 function snapshot(){
  const now=read();if(observed&&!sameOwner(observed,now)){notice='';issue='';}observed=now;if(active&&!sameOwner(active.capture,now))cancel();
  if(now.issue){capture=null;return {key:'',status:'unavailable',activeSources:0,busy:false,notice:'',issue:now.issue};}
  if(!capture||!sameOwner(capture,now)||!active&&capture.signature!==now.signature)capture={...now,key:'source-setup-'+ ++sequence};
  return {key:capture.key,status:now.state.status,activeSources:now.state.activeSources,busy:!!active,notice,issue};
 }
 async function execute(key,action){
  const methods={setup:'setupSources',verify:'verifySources',reconcile:'reconcileSources'},method=Object.hasOwn(methods,action)?methods[action]:null,now=read();
  if(!method||!capture||key!==capture.key||!sameOwner(capture,now)||capture.signature!==now.signature)return stale();
  if(active)return fail('SOURCE_SETUP_BUSY','Wait for the current source setup action.');
  if(action==='setup'&&now.state.status!=='setup-required')return fail('SOURCE_SETUP_STATE','Use Verify saved sources or Reconcile sources for this chat.');
  const actionState=active={capture,abort:new AbortController()};issue='';notice='';env.changed?.();let result;
  try{result=await now.controller[method]({signal:actionState.abort.signal});}catch{result=fail('SOURCE_SETUP_FAILED','The native source action could not complete.');}
  const current=read();if(active!==actionState||actionState.abort.signal.aborted||!sameOwner(actionState.capture,current)){if(active===actionState)active=null;return stale();}
  active=null;capture=null;if(result?.ok)notice='Sources verified for this chat.';else issue=result?.error?.message??'Source setup failed.';env.changed?.();return result??fail('SOURCE_SETUP_FAILED',issue);
 }
 return {snapshot,execute,cancel};
}
