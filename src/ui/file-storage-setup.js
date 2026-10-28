import {sha256Text} from '../workflow/definition-data.js?v=0.29.1';
const steps=['choice','download','install','restart','verify','complete'];
const statusFor=code=>({FILE_SERVICE_REQUIRED:'missing',FILE_SERVICE_INCOMPATIBLE:'incompatible',FILE_SERVICE_RESPONSE:'incompatible',FILE_SERVICE_DENIED:'denied',FILE_USER_REQUIRED:'denied',FILE_SERVICE_USER:'denied',FILE_PERMISSION:'denied'}[code]??'unreachable');
/** Optional setup changes preferences only; inside storage remains available throughout. */
export function createFileStorageSetup({access,preferences,getHost,downloadSetup}={}){
 let state={open:false,choice:null,status:'checking',step:'choice',hostId:'',userId:'',local:false,error:'',preferenceError:''},key='',revision=null,sequence=0,disposed=false,queue=Promise.resolve();
 const listeners=new Set(),emit=()=>{if(!disposed)for(const listener of listeners)try{listener();}catch{}};
 const identity=()=>{try{const host=getHost?.();return host&&typeof host.hostId==='string'&&host.hostId&&typeof host.userId==='string'&&host.userId?{hostId:host.hostId,userId:host.userId,local:host.local===true}:null;}catch{return null;}};
 const current=host=>{const live=identity();return !disposed&&live?.hostId===host?.hostId&&live?.userId===host?.userId;};
 const view=()=>({...state,effectiveMode:state.choice==='anywhere'&&state.status==='ready'?'anywhere':'inside'});
 async function restore(host){
  const next=host?'setup-'+sha256Text(JSON.stringify([host.hostId,host.userId])).slice(7,39)+'.json':'';
  if(next===key)return;key=next;revision=null;
  state={...state,...(host??{hostId:'',userId:'',local:false}),choice:null,step:'choice',status:'checking',open:!!host,error:'',preferenceError:''};emit();
  if(!next||!preferences)return;
  const result=await preferences.read(next);if(!current(host)||key!==next)return;
  if(!result.ok){state.preferenceError=result.error.message;emit();return;}
  revision=result.data.revision;
  try{const saved=JSON.parse(result.data.content);if(saved.schemaVersion===1&&['inside','anywhere'].includes(saved.choice)&&steps.includes(saved.step)){state.choice=saved.choice;state.step=saved.step;state.open=false;}}catch{}
 }
 async function persist(){
  const host=identity(),capturedKey=key,choice=state.choice,step=state.step;
  if(!host||!capturedKey||!choice||!preferences)return;
  const operation=async()=>{
   if(!current(host)||key!==capturedKey)return;
   let result;try{result=await preferences.write({name:capturedKey,expectedRevision:revision,content:JSON.stringify({schemaVersion:1,choice,step}),intentId:globalThis.crypto?.randomUUID?.()??'setup-'+Date.now()+'-'+Math.random()});}catch{result={ok:false,error:{message:'The file storage preference could not be saved.'}};}
   if(!current(host)||key!==capturedKey)return;
   if(result.ok&&result.data.acknowledged===true){revision=result.data.revision;state.preferenceError='';}else state.preferenceError=result.error?.message??'The file storage preference was not confirmed.';emit();
  };
  const pending=queue.then(operation);queue=pending.catch(()=>{});await pending;
 }
 async function check(){
  const ticket=++sequence,host=identity();await restore(host);if(!current(host)||ticket!==sequence)return;
  state.status='checking';state.error='';emit();
  let result;try{result=await access.refresh();}catch{result={ok:false,error:{code:'FILE_SERVICE_UNAVAILABLE',message:'The SillyTavern server could not be reached.'}};}
  if(!current(host)||ticket!==sequence)return;
  const compatible=result.ok&&access.serviceVersion?.apiVersion===1&&access.serviceVersion?.chooserVersion===1;
  state.status=compatible?'ready':result.ok?'incompatible':statusFor(result.error.code);
  state.error=result.ok?(compatible?'':'Update Lattice file support on the SillyTavern server.'):result.error.message;
  if(state.choice==='anywhere'&&compatible&&!(state.open&&state.step==='choice')){state.step='complete';await persist();}emit();
 }
 const ready=check();
 return Object.freeze({ready,view,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  async open(){await ready;if(state.step==='complete')state.step='choice';state.open=true;emit();await check();},check,
  async choose(choice){if(!['inside','anywhere'].includes(choice))return;await ready;await restore(identity());state.choice=choice;state.open=choice==='anywhere';state.step=choice==='inside'?'choice':state.status==='ready'?'complete':'download';await persist();if(choice==='anywhere')await check();emit();},
  async cancel(){state.open=false;++sequence;await persist();emit();},
  async next(){if(state.step==='verify')return check();state.step=steps[Math.min(steps.length-2,steps.indexOf(state.step)+1)];await persist();emit();},
  async back(){state.step=steps[Math.max(0,steps.indexOf(state.step)-1)];await persist();emit();},
  async download(){try{await downloadSetup?.();state.step='install';state.error='';await persist();}catch{state.error='Setup could not be downloaded. Check the connection and retry.';}emit();},
  dispose(){disposed=true;++sequence;listeners.clear();},
 });
}
