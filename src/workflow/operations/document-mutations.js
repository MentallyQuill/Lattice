import { cloneJsonValue, stringifyJsonValue } from './json-data.js?v=0.27.3';
import { decodeJson } from './json-decode.js?v=0.27.3';
import { formatRecords } from './format-records.js?v=0.27.3';

const equal = (a,b) => {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys=Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b,key) && equal(a[key],b[key]));
};

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code,message) => ({ok:false,error:{code,message}});
const configObject = value => {
    const checked=cloneJsonValue(value);
    return checked.ok && object(checked.data.value) ? Object.assign(Object.create(null),checked.data.value) : null;
};

function checkRecords(value,settings={}) {
    const checked=cloneJsonValue(value);
    if (!checked.ok) return checked;
    const records=checked.data.value;
    if (!Array.isArray(records) || records.some(record => !object(record))) return fail('INVALID_RECORDS','Records must be an array of structured objects.');
    if (Object.hasOwn(settings,'schema')) return decodeJson(records,{mode:'check',schema:{type:'array',items:settings.schema}});
    return {ok:true,data:{value:records}};
}

function prepared(snapshot,settings,projectedDocument,receipt) {
    if (new TextEncoder().encode(projectedDocument.content).byteLength > 262144) return fail('DOCUMENT_LIMIT','Projected content exceeds 262,144 UTF-8 bytes.');
    const nextSnapshot={targetId:snapshot.targetId,revision:snapshot.revision,format:projectedDocument.format,content:projectedDocument.content};
    if (!cloneJsonValue(nextSnapshot).ok) return fail('DOCUMENT_LIMIT','Projected content exceeds supported snapshot limits.');
    const readable=projectedDocument.format === 'json'?decodeJson(projectedDocument.content):projectedDocument.format === 'jsonl'?readJsonLines(projectedDocument.content,settings):{ok:true};
    if (!readable.ok) return fail('DOCUMENT_LIMIT','Projected content exceeds supported document reader limits.');
    if (projectedDocument.format === 'csv') {
        const canonical=readCsv(projectedDocument.content,settings,settings.operation === 'add');
        if (!canonical.ok) return canonical;
        projectedDocument={...projectedDocument,value:canonical.data.value};
    }
    return {ok:true,data:{targetId:snapshot.targetId,expectedRevision:snapshot.revision,operation:settings.operation,projectedDocument,receipt}};
}

function readJsonLines(content,settings) {
    const records=[];
    if (content.length) {
        const lines=content.split('\n');
        if (lines.at(-1) === '') lines.pop();
        for (const line of lines) {
            const parsed=decodeJson(line.endsWith('\r')?line.slice(0,-1):line);
            if (!parsed.ok) return parsed;
            records.push(parsed.data.value);
        }
    }
    return checkRecords(records,settings);
}

function readCsv(content,settings,allowEmpty=false) {
    const columns=formatRecords([],{format:'csv',columns:settings.columns,...(Object.hasOwn(settings,'schema')?{schema:settings.schema}:{})});
    if (!columns.ok) return columns;
    if (!content.length) return allowEmpty?{ok:true,data:{value:[]}}:fail('INVALID_CSV','CSV replacement requires a header.');
    const rows=[];
    let row=[],cell='',state='start';
    const endCell=() => {row.push(cell);cell='';state='start';};
    const endRow=() => {endCell();rows.push(row);row=[];};
    for(let i=0;i<content.length;i++) {
        const ch=content[i];
        if(state === 'quoted') {
            if(ch === '"') {
                if(content[i+1] === '"') {cell+='"';i++;}
                else state='closed';
            } else cell+=ch;
            continue;
        }
        if(ch === ',') {endCell();continue;}
        if(ch === '\n' || ch === '\r') {
            if(ch === '\r' && content[++i] !== '\n') return fail('INVALID_CSV','CSV requires LF or CRLF row separators.');
            endRow();continue;
        }
        if(state === 'closed') return fail('INVALID_CSV','Unexpected text after a quoted CSV cell.');
        if(ch === '"') {
            if(state !== 'start') return fail('INVALID_CSV','CSV quotes must begin a cell.');
            state='quoted';
        } else {cell+=ch;state='unquoted';}
    }
    if(state === 'quoted') return fail('INVALID_CSV','CSV has an unterminated quoted cell.');
    if(row.length || cell.length || state !== 'start') endRow();
    if(!rows.length || !equal(rows[0],settings.columns)) return fail('CSV_HEADER_MISMATCH','CSV header must exactly match the declared columns.');
    if(rows.some(row => row.length !== settings.columns.length)) return fail('INVALID_CSV','Every CSV row must match the header width.');
    const records=rows.slice(1).map(row => Object.fromEntries(settings.columns.map((column,index) => [column,row[index]])));
    const checked=formatRecords(records,{format:'csv',columns:settings.columns,...(Object.hasOwn(settings,'schema')?{schema:settings.schema}:{})});
    return checked.ok?{ok:true,data:{value:checked.data.records}}:checked;
}

export function prepareDocumentMutation(snapshot, settings) {
    snapshot=configObject(snapshot);
    if (!snapshot || Object.keys(snapshot).length !== 4 || Object.keys(snapshot).some(key => !['targetId','revision','format','content'].includes(key)) || typeof snapshot.targetId !== 'string' || !snapshot.targetId.trim().length || !(typeof snapshot.revision === 'string' && snapshot.revision.trim().length || Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0) || !['json','jsonl','csv','text','markdown'].includes(snapshot.format) || typeof snapshot.content !== 'string') return fail('INVALID_DOCUMENT_SNAPSHOT','A bounded target, revision, format and content snapshot is required.');
    settings=configObject(settings);
    if (!settings || Object.keys(settings).some(key => !['operation','records','collectionPath','key','missingPath','fields','fieldPolicy','schema','text','separator','emptyPolicy','trailingSeparator','content','columns'].includes(key)) || !['append-text','add','add-unique','upsert','update-fields','replace'].includes(settings.operation) || !['append-text','replace'].includes(settings.operation) && !['error','create'].includes(settings.missingPath)) return fail('INVALID_MUTATION_SETTINGS','An explicit supported mutation policy is required.');
    if (settings.operation === 'append-text') {
        if (!['text','markdown'].includes(snapshot.format)) return fail('UNSUPPORTED_MUTATION','Append Text requires a text or Markdown snapshot.');
        if (typeof settings.text !== 'string' || typeof settings.separator !== 'string' || !['omit','include'].includes(settings.emptyPolicy) || typeof settings.trailingSeparator !== 'boolean') return fail('INVALID_MUTATION_SETTINGS','Append Text requires explicit text and separator policies.');
        const changed=settings.text.length > 0;
        const content=changed?snapshot.content+(snapshot.content.length || settings.emptyPolicy === 'include'?settings.separator:'')+settings.text+(settings.trailingSeparator?settings.separator:''):snapshot.content;
        return prepared(snapshot,settings,{format:snapshot.format,content},{changed,added:changed?1:0,updated:0,unchanged:changed?0:1});
    }
    if (settings.operation === 'replace') {
        if (typeof settings.content !== 'string') return fail('INVALID_MUTATION_SETTINGS','Replacement requires complete content text.');
        const replacement=['text','markdown'].includes(snapshot.format)?{ok:true,data:{}}:snapshot.format === 'jsonl'?readJsonLines(settings.content,settings):snapshot.format === 'csv'?readCsv(settings.content,settings):decodeJson(settings.content,Object.hasOwn(settings,'schema')?{schema:settings.schema}:{});
        if (!replacement.ok) return replacement;
        const changed=settings.content !== snapshot.content;
        return prepared(snapshot,settings,{format:snapshot.format,content:settings.content,...(Object.hasOwn(replacement.data,'value')?{value:replacement.data.value}:{})},{changed,added:0,updated:changed?1:0,unchanged:changed?0:1});
    }
    if (snapshot.format === 'csv') {
        if (settings.operation !== 'add') return fail('UNSUPPORTED_MUTATION','CSV supports Add and Replace.');
        if (settings.collectionPath !== '') return fail('INVALID_COLLECTION_PATH','CSV requires the root collection.');
        const existing=readCsv(snapshot.content,settings,true);
        if (!existing.ok) return existing;
        if (!Array.isArray(settings.records)) return fail('INVALID_RECORDS','Mutation records must be an array.');
        const next=formatRecords(settings.records,{format:'csv',columns:settings.columns});
        if (!next.ok) return next;
        const combined=cloneJsonValue([...existing.data.value,...next.data.records]);
        if (!combined.ok) return combined;
        const header=formatRecords([],{format:'csv',columns:settings.columns}).data.text;
        const changed=next.data.records.length > 0;
        const content=changed?snapshot.content.length?snapshot.content+(snapshot.content.endsWith('\n')?'':'\r\n')+next.data.text.slice(header.length):next.data.text:snapshot.content;
        return prepared(snapshot,settings,{format:'csv',content,value:combined.data.value},{changed,added:next.data.records.length,updated:0,unchanged:0});
    }
    if (snapshot.format === 'jsonl') {
        if (settings.operation !== 'add') return fail('UNSUPPORTED_MUTATION','JSON Lines supports literal Add and Replace.');
        if (settings.collectionPath !== '') return fail('INVALID_COLLECTION_PATH','JSON Lines requires the root collection.');
        const existing=readJsonLines(snapshot.content,settings);
        if (!existing.ok) return existing;
        if (!Array.isArray(settings.records)) return fail('INVALID_RECORDS','Mutation records must be an array.');
        const next=formatRecords(settings.records,{format:'jsonl',...(Object.hasOwn(settings,'schema')?{schema:settings.schema}:{})});
        if (!next.ok) return next;
        const combined=cloneJsonValue([...existing.data.value,...next.data.records]);
        if (!combined.ok) return combined;
        const changed=next.data.records.length > 0;
        const content=changed?snapshot.content+(snapshot.content.length && !snapshot.content.endsWith('\n')?'\n':'')+next.data.text:snapshot.content;
        return prepared(snapshot,settings,{format:'jsonl',content,value:combined.data.value},{changed,added:next.data.records.length,updated:0,unchanged:0});
    }
    if (snapshot.format !== 'json') return fail('UNSUPPORTED_MUTATION','Record mutations require a supported collection format.');
    const parsed=decodeJson(snapshot.content);
    if (!parsed.ok) return parsed;
    if (!Array.isArray(settings.records)) return fail('INVALID_RECORDS','Mutation records must be an array of structured records.');
    const records=cloneJsonValue(settings.records);
    if (!records.ok) return records;
    const inputRecords=checkRecords(records.data.value);
    if (!inputRecords.ok) return inputRecords;
    const document=parsed.data.value;
    const path=settings.collectionPath;
    if (typeof path !== 'string' || path !== '' && !path.startsWith('/') || /~(?:[^01]|$)/.test(path)) return fail('INVALID_COLLECTION_PATH','Collection path must be a JSON Pointer.');
    const parts=path === ''?[]:path.slice(1).split('/').map(part => part.replaceAll('~1','/').replaceAll('~0','~'));
    if (parts.length > 32) return fail('INVALID_COLLECTION_PATH','Collection path exceeds the depth limit.');
    let collection=document,created=false;
    for(let i=0;i<parts.length;i++) {
        const key=parts[i];
        if (!collection || typeof collection !== 'object' || Array.isArray(collection) && !/^(0|[1-9]\d*)$/.test(key)) return fail('MISSING_COLLECTION','The selected collection does not exist.');
        if (!Object.hasOwn(collection,key)) {
            if (settings.missingPath !== 'create' || i !== parts.length-1 || Array.isArray(collection) && Number(key) !== collection.length) return fail('MISSING_COLLECTION','The selected collection does not exist.');
            Object.defineProperty(collection,key,{value:[],enumerable:true,writable:true,configurable:true}); created=true;
        }
        collection=collection[key];
    }
    if (!Array.isArray(collection)) return fail('INVALID_COLLECTION','The selected collection must be an array.');
    if (['add-unique','upsert','update-fields'].includes(settings.operation)) {
        if (typeof settings.key !== 'string' || !settings.key.length) return fail('INVALID_MUTATION_SETTINGS','An explicit stable identity key is required.');
        const validKey=record => object(record) && Object.hasOwn(record,settings.key) && (typeof record[settings.key] === 'string' && record[settings.key].trim().length > 0 || typeof record[settings.key] === 'number' && Number.isFinite(record[settings.key]));
        if (collection.some(record => !validKey(record)) || records.data.value.some(record => !validKey(record))) return fail('INVALID_RECORD_KEY','Every record must have a nonblank string or finite number identity.');
        const incoming=new Map();
        for (const record of records.data.value) {
            const key=record[settings.key];
            if (incoming.has(key) && !equal(incoming.get(key),record)) return fail('IDENTITY_CONFLICT','The same input identity has conflicting content.');
            incoming.set(key,record);
        }
        const keys=new Set();
        for (const record of collection) {
            if (keys.has(record[settings.key])) return fail('AMBIGUOUS_IDENTITY','The existing collection contains duplicate identities.');
            keys.add(record[settings.key]);
        }
    }
    if (settings.operation === 'upsert' && !['merge','replace'].includes(settings.fieldPolicy)) return fail('INVALID_MUTATION_SETTINGS','Upsert requires merge or replace fieldPolicy.');
    if (settings.operation === 'update-fields' && (!Array.isArray(settings.fields) || !settings.fields.length || settings.fields.length > 128 || settings.fields.some(field => typeof field !== 'string' || !field.length || field === settings.key) || new Set(settings.fields).size !== settings.fields.length)) return fail('INVALID_MUTATION_SETTINGS','Update Fields requires explicit unique field names excluding the identity key.');
    let added=0,updated=0,unchanged=0;
    for(const record of records.data.value) {
        if (settings.operation === 'add-unique') {
            const existing=collection.find(existing => existing[settings.key] === record[settings.key]);
            if (existing) {
                if (!equal(existing,record)) return {ok:false,error:{code:'IDENTITY_CONFLICT',message:'The same identity has conflicting content.'}};
                unchanged++; continue;
            }
        }
        if (settings.operation === 'update-fields') {
            const index=collection.findIndex(existing => existing[settings.key] === record[settings.key]);
            if (index === -1) return fail('RECORD_NOT_FOUND','Update Fields requires an existing identity.');
            if (settings.fields.some(field => !Object.hasOwn(record,field))) return fail('MISSING_UPDATE_FIELD','Every selected field must be supplied.');
            const next={...collection[index]};
            for (const field of settings.fields) Object.defineProperty(next,field,{value:record[field],enumerable:true,writable:true,configurable:true});
            if (equal(collection[index],next)) unchanged++;
            else { collection[index]=next; updated++; }
            continue;
        }
        if (settings.operation === 'upsert') {
            const index=collection.findIndex(existing => existing[settings.key] === record[settings.key]);
            if (index !== -1) {
                const next=settings.fieldPolicy === 'merge'?{...collection[index],...record}:record;
                if (equal(collection[index],next)) unchanged++;
                else { collection[index]=next; updated++; }
                continue;
            }
        }
        collection.push(record); added++;
    }
    const valid=checkRecords(collection,settings);
    if (!valid.ok) return valid;
    const changed=created || added+updated>0;
    let content=snapshot.content;
    if (changed) {
        const serialized=stringifyJsonValue(document);
        if (!serialized.ok) return serialized;
        content=serialized.data.text;
    }
    return prepared(snapshot,settings,{format:snapshot.format,content,value:document},{changed,added,updated,unchanged});
}
