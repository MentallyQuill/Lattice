import {chunkSettingsForNode,describeChunk} from './chunk-contract.js?v=0.29.0';
export {CHUNK_DEFAULTS,CHUNK_OPERATION,validateChunkSettings,chunkSettingsForNode,describeChunk} from './chunk-contract.js?v=0.29.0';
import { parseScope } from '../source-manifests.js?v=0.29.0';
import { cloneJsonValue } from './json-data.js?v=0.29.0';
import { inspectContextData, parseRuntimeContext, canonicalContextData } from './context-data.js?v=0.29.0';
import { selectFilterUnits } from './filter-text.js?v=0.29.0';
import { artifactVisibility } from '../artifact-privacy.js?v=0.29.0';
import { own, plain, freeze, nodeAddress } from '../record-data.js?v=0.29.0';
import {projectSourceSpan,sameSourceIdentity} from './source-spans.js?v=0.29.0';
const fail = (code,message) => ({ok:false,error:{code,message}});
const usesTokenSize = settings => settings.strategy !== 'assistant-turns' && settings.sizeUnit === 'tokens';
/** Exact source-backed Context and authored Text share the same segmentation engine. */
export async function executeChunk(node,inputs,local={}) {
 const identity=describeChunk(node,{phase:local.phase??own(node,'phase')??'pre'});if(!identity.ok)return identity;
 const checked=chunkSettingsForNode(node);if(!checked.ok)return checked;const s=checked.data;
 if(local.signal?.aborted)return fail('ABORTED','Chunk was stopped.');
 if(!inspectContextData(inputs).ok)return fail('INVALID_CHUNK_INPUT','Chunk requires complete bounded plain input data.');
 if(s.inputMode==='context')return executeContextChunk(node,inputs,local,s);
 inputs=freeze(structuredClone(inputs));
 const input=own(inputs,'in');
 if(!plain(input)||own(input,'kind')!=='text'||typeof own(input,'text')!=='string')return fail('INVALID_CHUNK_INPUT','Chunk requires exact Text.');
 const text=input.text;
 if(inputs.sourceManifest!==undefined||own(input,'source')!==undefined||own(input,'sourceRefs')!==undefined)return fail('CHUNK_SOURCE_REQUIRED','Source-backed Chunk requires a current private reader proof.');
 if(text.length>100000)return fail('CHUNK_LIMIT','Chunk input exceeds 100,000 UTF-16 units.');
 const metadata=own(input,'metadata');if(metadata!==undefined&&!plain(metadata))return fail('INVALID_CHUNK_INPUT','Chunk metadata must be a plain JSON object.');
 const address=nodeAddress(local.address);if(!address)return fail('INVALID_CHUNK_INPUT','Chunk requires a captured workflow node address.');
 const tokenSizing=usesTokenSize(s),tokenizer=tokenSizing?own(local,'chunkTokenizer'):undefined, counter=tokenizer&&own(tokenizer,'countTokens'), tokenizerBinding=tokenizer&&own(tokenizer,'binding');
 if(tokenSizing&&(typeof counter!=='function'||!cloneJsonValue(tokenizerBinding).ok||canonicalContextData(tokenizerBinding)!==canonicalContextData(s.tokenizerBinding)))return fail('TOKEN_COUNT_FAILED','Chunk requires an explicit matching tokenizer capability.');
 const capturedScope=own(local,'chunkScope')===undefined?undefined:parseScope(own(local,'chunkScope'));
 if(capturedScope&&!capturedScope.ok)return fail('CHUNK_SOURCE_MISMATCH','Chunk requires a valid captured execution scope.');
 const {sha256Text}=await import('../definition-data.js?v=0.29.0');
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
  stopped();if(!tokenSizing)return to-from;
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
   if(!tokenSizing)end=boundaries.findLast(boundary=>boundary>start&&boundary-start<=s.targetSize)??start;
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
   if(s.overlap&&!tokenSizing)start=boundaries.find(boundary=>boundary>=chunkStart&&boundary>=end-s.overlap&&boundary<end)??end;
   else if(s.overlap)for(const boundary of boundaries)if(boundary>=chunkStart&&boundary<end&&await measure(boundary,end)<=s.overlap){start=boundary;break;}
  }
 }catch(error){return fail(error.code??'INVALID_CHUNK_INPUT',error.message??'Chunk could not segment the admitted input.');}
 const manifest={type:'derivation-manifest',schemaVersion:1,scope,definitionHash,settingsHash,entries:records.map(r=>({id:r.id,revision:r.revision,sourceRefs:[],parents:[{id:sourceIdentity,revision:sourceIdentity}]}))};
 const report={schemaVersion:1,recordType:'chunk-report',status:records.length?'complete':'empty',strategy:s.strategy,inputUnits,outputCount:records.length,overlapUnits,tokenizerCalls,...(tokenSizing?{tokenizerBinding:s.tokenizerBinding}:{}),actualCalls:0,unmappedCount:records.length,diagnostics:[]};
 const outputs={};for(const [port,value] of Object.entries({out:records,manifest,report})){const admitted=cloneJsonValue(value);if(!admitted.ok)return fail('CHUNK_LIMIT','A complete Chunk output exceeds portable Data limits.');outputs[port]={kind:'data',value:admitted.data.value,visibility};}
 if(local.signal?.aborted)return fail('ABORTED','Chunk was stopped.');
 return freeze({ok:true,outputs});
}

async function executeContextChunk(node,inputs,local,s){
 const parsed=parseRuntimeContext(inputs.in);if(!parsed.ok)return fail('INVALID_CHUNK_INPUT','Chunk requires valid bounded Context.');
 const context=parsed.data,address=nodeAddress(local.address);if(!address)return fail('INVALID_CHUNK_INPUT','Chunk requires a captured workflow node address.');
 const metadata=own(context,'metadata');if(metadata!==undefined&&!plain(metadata))return fail('INVALID_CHUNK_INPUT','Chunk metadata must be a plain JSON object.');
 const proof=local.sourceProofs?.authorizeSource(inputs.in);
 const manifestProof=inputs.sourceManifest!==undefined?local.sourceProofs?.authorizeSource(inputs.sourceManifest):null;
 const pairing=s.strategy==='assistant-turns'||inputs.sourceManifest!==undefined?local.sourceProofs?.authorizePairing(inputs.in,inputs.sourceManifest):null;
 inputs=freeze(structuredClone(inputs));
 const {inspectSourceProof,inspectPairingProof,bindSourceDerivation}=await import('../source-provenance.js?v=0.29.0');
 const source=proof?.ok?inspectSourceProof(proof.data):null;
 if(proof&&!proof.ok&&proof.error?.code!=='SOURCE_PROOF_REQUIRED')return fail(s.strategy==='assistant-turns'?'CHUNK_TURN_SOURCE_REQUIRED':'CHUNK_SOURCE_REQUIRED','The retained source is no longer current.');
 if(proof?.ok&&!source?.ok)return fail('CHUNK_SOURCE_REQUIRED','The source is no longer current.');
 if(inputs.sourceManifest!==undefined){
  const view=manifestProof?.ok?inspectSourceProof(manifestProof.data):null;
  if(!source?.ok||!view?.ok||!sameSourceIdentity(source.data,view.data))return fail(s.strategy==='assistant-turns'?'CHUNK_TURN_SOURCE_REQUIRED':'CHUNK_SOURCE_REQUIRED','Chunk requires the exact matching current source manifest.');
 }
 const pairingView=pairing?.ok?inspectPairingProof(pairing.data):null;
 if(inputs.sourceManifest!==undefined&&!pairingView?.ok)return fail(s.strategy==='assistant-turns'?'CHUNK_TURN_SOURCE_REQUIRED':'CHUNK_SOURCE_REQUIRED','The optional manifest must belong to the exact reader page.');
 const turns=s.strategy==='assistant-turns'?pairingView:null;
 if(s.strategy==='assistant-turns'&&context.messages.length&&(!source?.ok||!turns?.ok||!sameSourceIdentity(source.data,turns.data)))return fail('CHUNK_TURN_SOURCE_REQUIRED','Chunk requires verified turn groups.');
 const check=()=>{if(local.signal?.aborted)return fail('ABORTED','Chunk was stopped.');if(proof?.ok&&!inspectSourceProof(proof.data).ok)return fail('CHUNK_SOURCE_REQUIRED','The source is no longer current.');if(pairing?.ok&&!inspectPairingProof(pairing.data).ok)return fail('CHUNK_TURN_SOURCE_REQUIRED','The verified pairing is no longer current.');return null;};
 const {sha256Text}=await import('../definition-data.js?v=0.29.0');let stale=check();if(stale)return stale;
 const scope=source?.ok?source.data.scope:{userId:'workflow:'+address.workflowId,chatId:'authored:'+JSON.stringify([address.instancePath,address.nodeId])};
 if(local.chunkScope!==undefined&&canonicalContextData(local.chunkScope)!==canonicalContextData(scope))return fail('CHUNK_SOURCE_MISMATCH','Chunk scope must match the exact reader.');
 const visibility=artifactVisibility(inputs),settingsHash=sha256Text(canonicalContextData({...s,segmentationVersion:'lattice-chunk-1/intl-segmenter'})),definitionHash=sha256Text('chunk/1/lattice-chunk-1');
 const records=[],entries=[],diagnostics=[];let inputUnits=0,overlapUnits=0,tokenizerCalls=0;
 if(turns?.ok){
  const messages=new Map(context.messages.map(m=>[m.id,m])),groups=new Map(turns.data.groups.map(g=>[g.memberIds[0],g]));
  const windows=[];let pending=[],turnIds=[],index=0,unpaired=0;
  const flush=()=>{if(pending.length){windows.push({members:pending,turnIds});pending=[];turnIds=[];}};
  while(index<context.messages.length){
   const message=context.messages[index],group=groups.get(message.id);
   if(group){
    if(group.memberIds.some((id,i)=>context.messages[index+i]?.id!==id))return fail('CHUNK_SOURCE_MISMATCH','Turn membership must match exact chronological Context.');
    pending.push(...group.memberIds.map(id=>messages.get(id)));turnIds.push(group.assistantTurnId);index+=group.memberIds.length;if(turnIds.length===s.turnsPerChunk)flush();
   }else{flush();if(!turns.data.unpairedMemberIds.includes(message.id))return fail('CHUNK_SOURCE_MISMATCH','Every Context member requires verified classification.');windows.push({members:[message],turnIds:[]});unpaired++;index++;}
  }
  flush();if(unpaired)diagnostics.push({code:'CHUNK_UNPAIRED_PRESERVED',message:'Unpaired or protected members are preserved as separate chunks.',count:unpaired});
  for(const window of windows){
   if(records.length>=s.maxChunks)return fail('CHUNK_LIMIT','Chunk output exceeds maxChunks; no records were published.');
   const sourceRefs=[],parents=[];for(const m of window.members){const mapping=source.data.mapping.find(p=>p.memberId===m.id),refs=projectSourceSpan(mapping,0,m.text.length);if(!refs)return fail('CHUNK_SOURCE_MISMATCH','Every turn member requires exact source mapping.');sourceRefs.push(...refs);parents.push(...refs.map(r=>({id:r.sourceId,revision:r.revision})));inputUnits+=m.text.length;}
   const memberIds=window.members.map(m=>m.id),text=window.members.map(m=>m.text).join(s.separator),id=sha256Text(canonicalContextData([scope,parents,1,settingsHash,memberIds,sourceRefs]));
   const record={recordType:'chunk',id,revision:sha256Text(canonicalContextData([id,text,'exact',sourceRefs,visibility,metadata??null])),scope,sourceRefs,visibility,text,ordinal:records.length,memberIds,assistantTurnIds:window.turnIds,inputSpan:null,mapping:'exact',...(metadata!==undefined?{metadata}:{})};
   records.push(record);entries.push({id,revision:record.revision,sourceRefs,parents});
  }
 }else for(const message of context.messages){
  stale=check();if(stale)return stale;
  const mapping=source?.ok?source.data.mapping.find(m=>m.memberId===message.id):undefined;
  if(source?.ok&&!mapping)return fail('CHUNK_SOURCE_MISMATCH','Source mapping does not match the admitted Context.');
  if(message.text.length===0)continue;
  const originalTokenizer=local.chunkTokenizer;
  const chunkTokenizer=originalTokenizer?{binding:own(originalTokenizer,'binding'),countTokens:async(text,options)=>{const before=check();if(before)throw before.error;if(canonicalContextData(own(originalTokenizer,'binding'))!==canonicalContextData(s.tokenizerBinding))throw Error('TOKEN_COUNT_FAILED');const measured=await originalTokenizer.countTokens(text,options);const after=check();if(after)throw after.error;if(canonicalContextData(own(originalTokenizer,'binding'))!==canonicalContextData(s.tokenizerBinding))throw Error('TOKEN_COUNT_FAILED');return measured;}}:undefined;
  if(usesTokenSize(s)&&tokenizerCalls>=s.maxTokenizerCalls&&message.text.length)return fail('CHUNK_LIMIT','Chunk exhausted its explicit tokenizer count bound.');
  const result=await executeChunk({...node,...s,inputMode:'text',maxTokenizerCalls:Math.max(1,s.maxTokenizerCalls-tokenizerCalls)}, {in:{kind:'text',text:message.text,visibility}}, {...local,chunkScope:scope,...(chunkTokenizer?{chunkTokenizer}:{})});
  stale=check();if(stale)return stale;if(!result.ok)return result;
  inputUnits+=result.outputs.report.value.inputUnits;overlapUnits+=result.outputs.report.value.overlapUnits;tokenizerCalls+=result.outputs.report.value.tokenizerCalls;
  if(tokenizerCalls>s.maxTokenizerCalls)return fail('CHUNK_LIMIT','Chunk exhausted its explicit tokenizer count bound.');
  for(const piece of result.outputs.out.value){
   if(records.length>=s.maxChunks)return fail('CHUNK_LIMIT','Chunk output exceeds maxChunks; no records were published.');
   const exactRefs=projectSourceSpan(mapping,piece.inputSpan.start,piece.inputSpan.end);
   const sourceRefs=exactRefs??(mapping?.sourceRefs.map(({span,...ref})=>ref)??[]),mappingKind=exactRefs?'exact':sourceRefs.length?'derived-only':'unmapped';
   const parents=[{id:message.id,revision:mapping?.revision??sha256Text(message.text)}];
   const id=sha256Text(canonicalContextData([scope,parents,1,settingsHash,message.id,piece.inputSpan]));
   const record={...piece,id,revision:sha256Text(canonicalContextData([id,piece.text,mappingKind,sourceRefs,visibility,metadata??null])),scope,sourceRefs,visibility,ordinal:records.length,memberIds:[message.id],inputSpan:null,mapping:mappingKind,...(metadata!==undefined?{metadata}:{})};
   records.push(record);entries.push({id,revision:record.revision,sourceRefs,parents});
  }
 }
 const manifest={type:'derivation-manifest',schemaVersion:1,scope,definitionHash,settingsHash,entries};
 const report={schemaVersion:1,recordType:'chunk-report',status:records.length?'complete':'empty',strategy:s.strategy,inputUnits,outputCount:records.length,overlapUnits,tokenizerCalls,...(usesTokenSize(s)?{tokenizerBinding:s.tokenizerBinding}:{}),actualCalls:0,unmappedCount:records.filter(r=>r.mapping==='unmapped').length,diagnostics};
 const outputs={};for(const [port,value] of Object.entries({out:records,manifest,report})){const admitted=cloneJsonValue(value);if(!admitted.ok)return fail('CHUNK_LIMIT','A complete Chunk output exceeds portable Data limits.');outputs[port]={kind:'data',value:admitted.data.value,visibility};}
 stale=check();if(stale)return stale;const result=freeze({ok:true,outputs});
 if(proof?.ok){const bound=bindSourceDerivation(result,{parents:[proof.data],processedMemberIds:context.messages.map(m=>m.id),mapping:records.map(r=>({memberId:r.id,sourceRefs:r.sourceRefs,visibility:r.visibility,mapping:r.mapping}))});if(!bound.ok)return bound;}
 return result;
}
