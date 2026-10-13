import { cloneJsonValue, stringifyJsonValue } from './json-data.js?v=0.27.2';
import { decodeJson } from './json-decode.js?v=0.27.2';
import { selectFields } from './select-fields.js?v=0.27.2';

const fail = (code, message) => ({ok:false,error:{code,message}});
const invalid = () => fail('INVALID_FORMAT_SETTINGS','Format settings must contain supported plain data.');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const escapeCsv = value => /[",\r\n]/.test(value) ? '"' + value.replaceAll('"','""') + '"' : value;

/** Pure record mapping, schema checking and explicit serialization. */
export function formatRecords(value, settings) {
    const options = cloneJsonValue(settings);
    if (!options.ok || !object(options.data.value)) return invalid();
    const config = Object.assign(Object.create(null),options.data.value);
    if (!['json','jsonl','csv','text','markdown'].includes(config.format)) return invalid();
    if(Object.hasOwn(config,'jsonShape')&&(config.format!=='json'||!['records','single'].includes(config.jsonShape)))return invalid();
    const allowed=['format','fields','schema',...(config.format==='json'?['jsonShape']:[]),...(config.format === 'csv'?['columns']:['text','markdown'].includes(config.format)?['separator','trailingSeparator']:[])];
    if (Object.keys(config).some(key => !allowed.includes(key))) return invalid();
    const checked = cloneJsonValue(value);
    if (!checked.ok) return checked;
    const source = Array.isArray(checked.data.value) ? checked.data.value : [checked.data.value];
    if (source.some(record => !object(record))) return fail('INVALID_RECORDS','Records must be structured objects.');
    if (!source.length && Object.hasOwn(config,'fields')) {
        const mapping = selectFields(null,{fields:config.fields});
        if (!mapping.ok && mapping.error.code === 'INVALID_FIELDS') return mapping;
    }
    let records = [];
    for (const record of source) {
        const selected = Object.hasOwn(config,'fields') ? selectFields(record,{fields:config.fields}) : {ok:true,data:{value:record}};
        if (!selected.ok) return selected;
        records.push(selected.data.value);
    }
    if (config.format === 'csv') {
        if (!Array.isArray(config.columns) || !config.columns.length || config.columns.length > 128 || config.columns.some(column => typeof column !== 'string' || !column.length) || new Set(config.columns).size !== config.columns.length) return invalid();
        if (records.some(record => Object.keys(record).length !== config.columns.length || config.columns.some(column => !Object.hasOwn(record,column) || record[column] !== null && typeof record[column] === 'object'))) return fail('CSV_RECORD_MISMATCH','CSV records must match the columns and contain scalar cells.');
        records=records.map(record => Object.fromEntries(config.columns.map(column => [column,record[column] === null?'':String(record[column])])));
    }
    const encoded = stringifyJsonValue(records);
    if (!encoded.ok) return encoded;
    if (Object.hasOwn(config,'schema')) {
        const valid = decodeJson(records,{mode:'check',schema:{type:'array',items:config.schema}});
        if (!valid.ok) return valid;
    }
    const result = (text,serialization) => {
        if (new TextEncoder().encode(text).byteLength > 262144) return fail('FORMAT_LIMIT','Serialized output exceeds 262,144 UTF-8 bytes.');
        if (!cloneJsonValue(text).ok) return fail('FORMAT_LIMIT','Serialized output exceeds bounded plain text data limits.');
        const jsonTexts=serialization.format === 'json'?[text]:serialization.format === 'jsonl' && text.length?text.slice(0,-1).split('\n'):[];
        if (jsonTexts.some(raw => !decodeJson(raw).ok)) return fail('FORMAT_LIMIT','Serialized JSON exceeds the supported raw JSON reader limits.');
        return {ok:true,data:{records,text,serialization,report:[]}};
    };
    if (config.format === 'json') {
        if(config.jsonShape==='single') {
            if(records.length!==1)return fail('FORMAT_CARDINALITY','Single-object JSON requires exactly one validated record.');
            const single=stringifyJsonValue(records[0]);if(!single.ok)return single;
            return result(single.data.text,{format:'json',jsonShape:'single'});
        }
        return result(encoded.data.text,{format:'json'});
    }
    if (config.format === 'jsonl') return result(records.map(record => stringifyJsonValue(record).data.text+'\n').join(''),{format:'jsonl'});
    if (config.format === 'csv') {
        const lines = [config.columns.map(escapeCsv).join(',')];
        for (const record of records) lines.push(config.columns.map(column => escapeCsv(record[column])).join(','));
        return result(lines.join('\r\n')+'\r\n',{format:'csv',columns:[...config.columns]});
    }
    if (typeof config.separator !== 'string' || typeof config.trailingSeparator !== 'boolean') return invalid();
    if (records.some(record => Object.keys(record).length !== 1 || !Object.hasOwn(record,'text') || typeof record.text !== 'string')) return fail('TEXT_RECORD_MISMATCH','Text records must contain only a text string.');
    return result(records.map(record => record.text).join(config.separator)+(records.length && config.trailingSeparator?config.separator:''),{format:config.format,separator:config.separator,trailingSeparator:config.trailingSeparator});
}
