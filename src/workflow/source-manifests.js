/** Pure descriptive DTO admission. Success never establishes host authority. */
import {cloneJsonValue} from './operations/json-data.js?v=0.29.1';
import {freeze,plain} from './record-data.js?v=0.29.1';
const invalid = () => freeze({ok:false,error:{code:'INVALID_SOURCE_DTO',message:'Expected bounded source metadata with the required fields.'}});
const id = value => typeof value === 'string' && value.length > 0;
const object = value => plain(value) && !Array.isArray(value);
const closed = (value, required, optional=[]) => object(value) && required.every(key=>Object.hasOwn(value,key)) && Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const scopeValid = value => closed(value,['userId','chatId'],['actorId','branchId']) && ['userId','chatId'].every(key=>id(value[key])) && ['actorId','branchId'].every(key=>!Object.hasOwn(value,key)||id(value[key]));
// The boundary makes one owned bounded clone; validators only traverse that safe clone.
function parse(value, validate) {
 try { const checked=cloneJsonValue(value); return checked.ok && validate(checked.data.value) ? freeze({ok:true,data:checked.data.value}) : invalid(); }
 catch { return invalid(); }
}
export const parseScope = value => parse(value,scopeValid);
const visibilityValid = value => object(value) && (value.kind === 'actor-private' ? closed(value,['kind','actorId']) && id(value.actorId) : closed(value,['kind']) && ['public','hidden'].includes(value.kind));
const spanValid = value => closed(value,['start','end','unit']) && value.unit === 'utf16' && Number.isSafeInteger(value.start) && value.start >= 0 && Number.isSafeInteger(value.end) && value.end >= value.start;
const refValid = value => closed(value,['sourceId','revision','kind','scope'],['span']) && id(value.sourceId) && id(value.revision) && ['chat-message','document','lore-entry','character'].includes(value.kind) && scopeValid(value.scope) && (!Object.hasOwn(value,'span') || spanValid(value.span));
export const parseVisibility = value => parse(value,visibilityValid);
export const parseSourceRef = value => parse(value,refValid);
const list = (value, validator, max=1024) => Array.isArray(value) && value.length <= max && value.every(validator);
const recordValid = value => object(value) && ['id','revision','scope','sourceRefs','visibility'].every(key=>Object.hasOwn(value,key)) && id(value.id) && id(value.revision) && scopeValid(value.scope) && list(value.sourceRefs,refValid) && visibilityValid(value.visibility) && (!Object.hasOwn(value,'text') || typeof value.text === 'string');
const scopeTuple = scope => [scope.userId,scope.chatId,scope.actorId??null,scope.branchId??null];
export const parseRecordV1 = value => parse(value,recordValid);
export function parseRecordList(value, options={}) {
 const checked=cloneJsonValue(options);
 if(!checked.ok || !closed(checked.data.value,[],['maxRecords','requireUniqueIdentities'])) return invalid();
 const settings=checked.data.value, max=Object.hasOwn(settings,'maxRecords')?settings.maxRecords:1024;
 if(!Number.isSafeInteger(max)||max<0||max>1024||Object.hasOwn(settings,'requireUniqueIdentities')&&typeof settings.requireUniqueIdentities!=='boolean') return invalid();
 return parse(value,records=> {
  if(!list(records,recordValid,max)) return false;
  if(!settings.requireUniqueIdentities) return true;
  const keys=records.map(record=>JSON.stringify([scopeTuple(record.scope),record.id]));
  return new Set(keys).size===keys.length;
 });
}
const pairValid = value => closed(value,['id','revision']) && id(value.id) && id(value.revision);
const entryValid = value => closed(value,['id','revision','sourceRefs']) && id(value.id) && id(value.revision) && list(value.sourceRefs,refValid);
const uniqueEntries = (entries,validate) => list(entries,validate) && new Set(entries.map(entry=>entry.id)).size === entries.length;
const envelope = (value,type,fields) => closed(value,['type','schemaVersion','scope',...fields]) && value.type===type && value.schemaVersion===1 && scopeValid(value.scope);
const sourceIdentity = value => id(value.sourceSetId) && id(value.snapshotId);
export const parseSourceManifest = value => parse(value, item => envelope(item,'source-manifest',['sourceSetId','snapshotId','completeness','entries','continuation']) && sourceIdentity(item) && ['complete','page'].includes(item.completeness) && uniqueEntries(item.entries,entryValid));
export const parseReaderCursor = value => parse(value, item => envelope(item,'reader-cursor',['sourceSetId','snapshotId','position']) && sourceIdentity(item));
const derivationEntryValid = value => closed(value,['id','revision','sourceRefs','parents']) && id(value.id) && id(value.revision) && list(value.sourceRefs,refValid) && list(value.parents,pairValid);
const receiptValid = value => closed(value,['receiptId','targetId','nextRevision','intentDigest']) && ['receiptId','targetId','nextRevision','intentDigest'].every(key=>id(value[key]));
export const parseDerivationManifest = value => parse(value,item=>envelope(item,'derivation-manifest',['definitionHash','settingsHash','entries']) && id(item.definitionHash) && id(item.settingsHash) && uniqueEntries(item.entries,derivationEntryValid));
export const parseCoverageManifest = value => parse(value,item=>envelope(item,'coverage-manifest',['sourceSetId','snapshotId','covered','derivations','receipts','replacementDigest']) && sourceIdentity(item) && list(item.covered,refValid) && uniqueEntries(item.derivations,pairValid) && list(item.receipts,receiptValid) && (item.replacementDigest===null || typeof item.replacementDigest==='string'));
// Canonical JSON tuples, deliberately unhashed: exact identities have no digest collision.
// Inputs are already bounded owned clones. Object keys sort; array order is semantic.
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
export function canonicalSourceKey(value) {
 const checked=parseSourceRef(value);
 return checked.ok ? freeze({ok:true,data:canonical(['source/v1',checked.data.kind,scopeTuple(checked.data.scope),checked.data.sourceId,checked.data.revision])}) : checked;
}
export function canonicalSourceSetKey(scope,selector) {
 const checked=parse([scope,selector],value=>scopeValid(value[0]));
 return checked.ok ? freeze({ok:true,data:canonical(['source-set/v1',scopeTuple(checked.data[0]),checked.data[1]])}) : checked;
}
export function sameScope(left,right) {
 const checked=parse([left,right],value=>value.every(scopeValid));
 return checked.ok ? freeze({ok:true,data:canonical(scopeTuple(checked.data[0]))===canonical(scopeTuple(checked.data[1]))}) : checked;
}
