/** Pure authoring contract; no runtime source-proof or execution imports. */
import {cloneJsonValue} from './json-data.js?v=0.30.3';
import {own,plain,freeze} from '../record-data.js?v=0.30.3';
const fail=(code,message)=>({ok:false,error:{code,message}});
const invalid=()=>fail('INVALID_CHUNK_SETTINGS','Use supported Chunk controls and explicit bounded sizes.');
const usesTokenSize=settings=>settings.strategy!=='assistant-turns'&&settings.sizeUnit==='tokens';
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
  if(s.overlap>=s.targetSize||usesTokenSize(s)&&s.targetSize>8192||s.strategy==='assistant-turns'&&(s.inputMode!=='context'||s.overlap!==0))return invalid();
  if(s.strategy!=='assistant-turns'&&(s.sizeUnit==='tokens'||Object.keys(s.tokenizerBinding).length>0)&&(!plain(s.tokenizerBinding)||Object.keys(s.tokenizerBinding).length!==3||!['tokenizerId','version','model'].every(key=>typeof s.tokenizerBinding[key]==='string'&&!!s.tokenizerBinding[key].trim()&&s.tokenizerBinding[key].length<=256)))return invalid();
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
