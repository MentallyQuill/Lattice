import {sha256Text} from './definition-data.js?v=0.30.0';
import {cloneJsonValue} from './operations/json-data.js?v=0.30.0';
const validRef=value=>value&&typeof value.name==='string'&&/^(archive|content|metadata)-[a-f0-9]{64}\.json$/.test(value.name)&&value.revision==='sha256:'+value.name.slice(value.name.indexOf('-')+1,-5);
/** Partition immutable replay pages and recovery bytes before bounded JSON admission. */
export function createFileMetadataBlobs({read,write}){
 async function put(kind,value,names){
  const content=JSON.stringify(value),revision=sha256Text(content),name=kind+'-'+revision.slice(7)+'.json';
  await write(name,content);if(kind!=='archive')names.add(name);return {name,revision};
 }
 async function get(reference){
  if(!validRef(reference))throw Error('Invalid immutable metadata reference');
  const content=await read(reference.name);if(sha256Text(content)!==reference.revision)throw Error('Immutable metadata hash differs');
  const parsed=JSON.parse(content);if(typeof parsed==='string'&&new TextEncoder().encode(parsed).byteLength<=262144)return parsed;const checked=cloneJsonValue(parsed);if(!checked.ok)throw Error('Invalid bounded immutable metadata');return checked.data.value;
 }
 async function packRecord(record,names){
  const next={...record};
  if(next.versions){const versions=[];for(const {content,...version}of next.versions)versions.push({...version,contentRef:await put('content',content,names)});next.versionsRef=await put('metadata',versions,names);delete next.versions;}
  if(next.historyPages){const refs=[];for(const [id,page]of Object.entries(next.historyPages))refs.push([id,await put('archive',page,names)]);next.historyPageIndexes=[];for(let start=0;start<refs.length;start+=128)next.historyPageIndexes.push(await put('metadata',refs.slice(start,start+128),names));delete next.historyPages;}
  if(next.pending?.acceptedMetadata){const accepted=await packRecord(next.pending.acceptedMetadata,names);next.pending={...next.pending,acceptedMetadataRef:await put('metadata',accepted,names)};delete next.pending.acceptedMetadata;}
  return next;
 }
 async function unpackRecord(record){
  const next={...record};
  if(next.versionsRef){const versions=await get(next.versionsRef);if(!Array.isArray(versions)||versions.length>20)throw Error('Invalid recovery index');next.versions=[];for(const {contentRef,...version}of versions){const content=await get(contentRef);if(typeof content!=='string'||sha256Text(content)!==version.revision)throw Error('Invalid recovery bytes');next.versions.push({...version,content});}delete next.versionsRef;}
  if(next.historyPageIndexes){next.historyPages={};for(const index of next.historyPageIndexes)for(const [id,ref]of await get(index))Object.defineProperty(next.historyPages,id,{value:await get(ref),enumerable:true,configurable:true,writable:true});delete next.historyPageIndexes;}
  if(next.historyPageRefs){next.historyPages={};for(const [id,ref]of Object.entries(next.historyPageRefs))next.historyPages[id]=await get(ref);delete next.historyPageRefs;}
  if(next.pending?.acceptedMetadataRef){next.pending={...next.pending,acceptedMetadata:await unpackRecord(await get(next.pending.acceptedMetadataRef))};delete next.pending.acceptedMetadataRef;}
  return next;
 }
 return {async pack(records){const names=new Set(),packed={};for(const [key,record]of Object.entries(records))packed[key]=await packRecord(record,names);return {records:packed,names:[...names]};},async unpack(records){const unpacked={};for(const [key,record]of Object.entries(records))unpacked[key]=await unpackRecord(record);return unpacked;}};
}
