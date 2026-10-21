import { parseScope } from '../source-manifests.js?v=0.27.5';
import { cloneJsonValue } from './json-data.js?v=0.27.5';
import { inspectContextData, parseRuntimeContext, canonicalContextData } from './context-data.js?v=0.27.5';
import { selectFilterUnits } from './filter-text.js?v=0.27.5';
import { artifactVisibility } from '../artifact-privacy.js?v=0.27.5';
import { own, plain, freeze, nodeAddress } from '../record-data.js?v=0.27.5';
const fail = (code,message) => ({ok:false,error:{code,message}});
const invalid = () => fail('INVALID_CHUNK_SETTINGS','Use supported Chunk controls and explicit bounded sizes.');
export const CHUNK_DEFAULTS = freeze({inputMode:'text',strategy:'paragraph',sizeUnit:'utf16',targetSize:2048,overlap:0,turnsPerChunk:3,separator:'\n\n',sentenceLocale:'en',tokenizerBinding:{},maxTokenizerCalls:4096,maxChunks:256});
export const CHUNK_OPERATION = {
 id:'chunk',operationVersion:1,title:'Chunk',family:'Derive',phase:'both',minimumSchema:4,minimumRuntime:3,input:'text',output:'data',requestBound:0,modelRole:null,terminal:false,dynamicPorts:true,
 controls:Object.keys(CHUNK_DEFAULTS),defaults:CHUNK_DEFAULTS,
 controlDescriptors:{
 inputMode:{type:'enum',values:['text','context'],default:'text',exposable:false},strategy:{type:'enum',values:['paragraph','sentence','fixed','assistant-turns'],default:'paragraph'},
 sizeUnit:{type:'enum',values:['utf16','tokens'],default:'utf16'},targetSize:{type:'integer',min:1,max:100000,default:2048},overlap:{type:'integer',min:0,max:99999,default:0},
 turnsPerChunk:{type:'integer',min:1,max:100,default:3},separator:{type:'string',default:'\n\n',maxLength:128},sentenceLocale:{type:'string',default:'en',maxLength:35},
 tokenizerBinding:{type:'object',max:3,default:{}},maxTokenizerCalls:{type:'integer',min:1,max:16384,default:4096},maxChunks:{type:'integer',min:1,max:1024,default:256},
 }
};
export function validateChunkSettings(value={}) {
 try {
  if(!plain(value)||Reflect.ownKeys(value).some(k=>!Object.hasOwn(CHUNK_DEFAULTS,k)))return invalid();
  const checked=cloneJsonValue(value);if(!checked.ok)return invalid();
  const s={...CHUNK_DEFAULTS,...checked.data.value};
  for(const [key,d] of Object.entries(CHUNK_OPERATION.controlDescriptors)) {
   const v=s[key];if(d.type==='enum'&&!d.values.includes(v)||d.type==='integer'&&(!Number.isSafeInteger(v)||v<d.min||v>d.max)||d.type==='string'&&(typeof v!=='string'||v.length>d.maxLength)||d.type==='object'&&(!plain(v)||Object.keys(v).length>d.max))return invalid();
  }
  if(s.overlap>=s.targetSize||s.sizeUnit==='tokens'&&s.targetSize>8192||s.strategy==='assistant-turns'&&(s.inputMode!=='context'||s.overlap!==0))return invalid();
  if((s.sizeUnit==='tokens'||Object.keys(s.tokenizerBinding).length>0)&&(!plain(s.tokenizerBinding)||Object.keys(s.tokenizerBinding).length!==3||!['tokenizerId','version','model'].every(key=>typeof s.tokenizerBinding[key]==='string'&&!!s.tokenizerBinding[key].trim()&&s.tokenizerBinding[key].length<=256)))return invalid();
  if(s.strategy==='sentence'&&(!s.sentenceLocale||s.sentenceLocale.length>35||Intl.Segmenter.supportedLocalesOf([s.sentenceLocale]).length!==1))return invalid();
  return {ok:true,data:freeze(s)};
 }catch{return invalid();}
}
export function chunkSettingsForNode(node) {
 try {
  if(!plain(node))return invalid();const settings={};
  for(const key of CHUNK_OPERATION.controls){const d=Object.getOwnPropertyDescriptor(node,key);if(d&&(!d.enumerable||!Object.hasOwn(d,'value')))return invalid();if(d)settings[key]=d.value;}
  return validateChunkSettings(settings);
 }catch{return invalid();}
}
export function describeChunk(node,{phase='pre'}={}) {
 if(own(node,'operation')!=='chunk'||own(node,'operationVersion')!==undefined&&own(node,'operationVersion')!==1)return invalid();
 if(!['pre','post'].includes(phase)||own(node,'phase')!==undefined&&own(node,'phase')!==phase)return fail('INVALID_PHASE','Chunk requires its effective pre or post phase.');
 const checked=chunkSettingsForNode(node);if(!checked.ok)return checked;
 const pin=(id,kind,direction,required=false,semanticShape)=>({id,label:id,kind,direction,required,cardinality:'one',...(semanticShape?{semanticShape}:{})});
 return {ok:true,data:{descriptor:{...CHUNK_OPERATION,phase},ports:[pin('in',checked.data.inputMode,'input',true),pin('sourceManifest','data','input',false,'source-manifest/v1'),pin('out','data','output',false,'records/chunk/v1'),pin('manifest','data','output',false,'derivation-manifest/v1'),pin('report','data','output',false,'chunk-report/v1')]}};
}
/** Literal Text only until reader-owned private source/pairing proofs are available. */
export async function executeChunk(node,inputs,local={}) {
 const identity=describeChunk(node,{phase:local.phase??own(node,'phase')??'pre'});if(!identity.ok)return identity;
 const checked=chunkSettingsForNode(node);if(!checked.ok)return checked;const s=checked.data;
 if(local.signal?.aborted)return fail('ABORTED','Chunk was stopped.');
 if(!inspectContextData(inputs).ok)return fail('INVALID_CHUNK_INPUT','Chunk requires complete bounded plain input data.');
 inputs=freeze(structuredClone(inputs));
 const input=own(inputs,'in');let text;
 if(s.inputMode==='context') {
  const parsed=parseRuntimeContext(input);if(!parsed.ok)return fail('INVALID_CHUNK_INPUT','Chunk requires valid bounded Context.');
  if(parsed.data.messages.length||inputs.sourceManifest)return fail(s.strategy==='assistant-turns'?'CHUNK_TURN_SOURCE_REQUIRED':'CHUNK_SOURCE_REQUIRED','Chunk requires a current private reader source and pairing proof.');
  text='';
 }else {
  if(!plain(input)||own(input,'kind')!=='text'||typeof own(input,'text')!=='string')return fail('INVALID_CHUNK_INPUT','Chunk requires exact Text.');
  text=input.text;
  if(inputs.sourceManifest!==undefined||own(input,'source')!==undefined||own(input,'sourceRefs')!==undefined)return fail('CHUNK_SOURCE_REQUIRED','Source-backed Chunk requires a current private reader proof.');
 }
 if(text.length>100000)return fail('CHUNK_LIMIT','Chunk input exceeds 100,000 UTF-16 units.');
 const metadata=own(input,'metadata');if(metadata!==undefined&&!plain(metadata))return fail('INVALID_CHUNK_INPUT','Chunk metadata must be a plain JSON object.');
 const address=nodeAddress(local.address);if(!address)return fail('INVALID_CHUNK_INPUT','Chunk requires a captured workflow node address.');
 const tokenizer=own(local,'chunkTokenizer'), counter=tokenizer&&own(tokenizer,'countTokens'), tokenizerBinding=tokenizer&&own(tokenizer,'binding');
 if(s.sizeUnit==='tokens'&&(typeof counter!=='function'||!cloneJsonValue(tokenizerBinding).ok||canonicalContextData(tokenizerBinding)!==canonicalContextData(s.tokenizerBinding)))return fail('TOKEN_COUNT_FAILED','Chunk requires an explicit matching tokenizer capability.');
 const capturedScope=own(local,'chunkScope')===undefined?undefined:parseScope(own(local,'chunkScope'));
 if(capturedScope&&!capturedScope.ok)return fail('CHUNK_SOURCE_MISMATCH','Chunk requires a valid captured execution scope.');
 const {sha256Text}=await import('../definition-data.js?v=0.27.5');
 const scope=capturedScope?.ok?capturedScope.data:{userId:'workflow:'+address.workflowId,chatId:'authored:'+JSON.stringify([address.instancePath,address.nodeId])};
 const visibility=artifactVisibility(inputs), settingsHash=sha256Text(canonicalContextData({...s,segmentationVersion:'lattice-chunk-1/intl-segmenter'})),definitionHash=sha256Text('chunk/1/lattice-chunk-1');
 const sourceIdentity=sha256Text(canonicalContextData([address,text]));
 const boundaries=[0,...Array.from(new Intl.Segmenter('en',{granularity:'grapheme'}).segment(text),part=>part.index+part.segment.length)];
 const natural=s.strategy==='paragraph'?selectFilterUnits(text,'paragraph').map(p=>p.end):s.strategy==='sentence'?Array.from(new Intl.Segmenter(s.sentenceLocale,{granularity:'sentence'}).segment(text),p=>p.index+p.segment.length):[];
 const records=[], measured=new Map();let start=0,previousEnd=0,overlapUnits=0,tokenizerCalls=0;
 const problem=(code,message)=>{throw {code,message};};
 const stopped=()=>{if(local.signal?.aborted)problem('ABORTED','Chunk was stopped.');};
 const verifyTokenizer=()=>{const current=own(tokenizer,'binding');if(!cloneJsonValue(current).ok||canonicalContextData(current)!==canonicalContextData(s.tokenizerBinding))problem('TOKEN_COUNT_FAILED','The selected Chunk tokenizer binding changed.');};
 const measure=async(from,to)=>{
  stopped();if(s.sizeUnit==='utf16')return to-from;
  verifyTokenizer();
  const key=from+':'+to;if(measured.has(key))return measured.get(key);
  if(tokenizerCalls>=s.maxTokenizerCalls)problem('CHUNK_LIMIT','Chunk exhausted its explicit tokenizer count bound.');
  tokenizerCalls++;let result;
  try {
   let onAbort;
   const aborted=new Promise((_,reject)=>{onAbort=()=>reject({code:'ABORTED',message:'Chunk was stopped.'});local.signal?.addEventListener('abort',onAbort,{once:true});});
   try {result=await Promise.race([Promise.resolve(counter.call(tokenizer,text.slice(from,to),{binding:s.tokenizerBinding,...(local.signal?{signal:local.signal}:{})})),aborted]);}
   finally{local.signal?.removeEventListener('abort',onAbort);}
  }catch(error){stopped();problem('TOKEN_COUNT_FAILED','The selected Chunk tokenizer could not count the exact text.');}
  stopped();verifyTokenizer();if(!cloneJsonValue(result).ok||!Number.isSafeInteger(own(result,'tokens'))||own(result,'tokens')<0)problem('TOKEN_COUNT_FAILED','The selected Chunk tokenizer returned an invalid count.');
  const count=own(result,'tokens');measured.set(key,count);return count;
 };
 let inputUnits;
 try {
  inputUnits=await measure(0,text.length);
  while(start<text.length) {
   stopped();let end=start;
   // Inspect every candidate in token mode: exact token counts need not be monotone.
   if(s.sizeUnit==='utf16')end=boundaries.findLast(boundary=>boundary>start&&boundary-start<=s.targetSize)??start;
   else for(const boundary of boundaries)if(boundary>start&&await measure(start,boundary)<=s.targetSize)end=boundary;
   if(end<=previousEnd) {
    if(start===previousEnd)problem('CHUNK_ATOM_TOO_LARGE','A complete Unicode grapheme cannot fit the chunk bound.');
    // Retry with less overlap; token counts are not assumed monotone even for suffixes.
    const before=start;start=previousEnd;
    for(const boundary of boundaries)if(boundary>before&&boundary<previousEnd&&await measure(boundary,previousEnd)<=s.overlap){start=boundary;break;}
    continue;
   }
   const preferred=natural.filter(n=>n>previousEnd&&n<=end&&boundaries.includes(n));
   for(let index=preferred.length-1;index>=0;index--)if(await measure(start,preferred[index])<=s.targetSize){end=preferred[index];break;}
   if(records.length>=s.maxChunks)problem('CHUNK_LIMIT','Chunk output exceeds maxChunks; no records were published.');
   const inputSpan={start,end,unit:'utf16'},body=text.slice(start,end),id=sha256Text(canonicalContextData([scope,sourceIdentity,1,settingsHash,inputSpan]));
   records.push({recordType:'chunk',id,revision:sha256Text(canonicalContextData([id,body,'unmapped',visibility,metadata??null])),scope,sourceRefs:[],visibility,text:body,ordinal:records.length,memberIds:[],inputSpan,mapping:'unmapped',...(metadata!==undefined?{metadata}:{})});
   overlapUnits+=previousEnd>start?await measure(start,previousEnd):0;previousEnd=end;
   if(end===text.length)break;
   const chunkStart=start;start=end;
   if(s.overlap&&s.sizeUnit==='utf16')start=boundaries.find(boundary=>boundary>=chunkStart&&boundary>=end-s.overlap&&boundary<end)??end;
   else if(s.overlap)for(const boundary of boundaries)if(boundary>=chunkStart&&boundary<end&&await measure(boundary,end)<=s.overlap){start=boundary;break;}
  }
 }catch(error){return fail(error.code??'INVALID_CHUNK_INPUT',error.message??'Chunk could not segment the admitted input.');}
 const manifest={type:'derivation-manifest',schemaVersion:1,scope,definitionHash,settingsHash,entries:records.map(r=>({id:r.id,revision:r.revision,sourceRefs:[],parents:[{id:sourceIdentity,revision:sourceIdentity}]}))};
 const report={schemaVersion:1,recordType:'chunk-report',status:records.length?'complete':'empty',strategy:s.strategy,inputUnits,outputCount:records.length,overlapUnits,tokenizerCalls,...(s.sizeUnit==='tokens'?{tokenizerBinding:s.tokenizerBinding}:{}),actualCalls:0,unmappedCount:records.length,diagnostics:[]};
 const outputs={};for(const [port,value] of Object.entries({out:records,manifest,report})){const admitted=cloneJsonValue(value);if(!admitted.ok)return fail('CHUNK_LIMIT','A complete Chunk output exceeds portable Data limits.');outputs[port]={kind:'data',value:admitted.data.value,visibility};}
 if(local.signal?.aborted)return fail('ABORTED','Chunk was stopped.');
 return freeze({ok:true,outputs});
}
