import { compileQuestionRows } from './decision-authoring.js?v=0.27.3';
import { parseControlInput } from './control-input-contracts.js?v=0.27.3';
const fail = () => ({ok:false,error:{code:'NONREPRESENTABLE_CONTROL_ROWS',message:'This shape needs Advanced JSON; authored values are retained.'}});
const phases = ['onset','peak','plateau','decline','aftermath'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (row, allowed) => record(row) && Object.keys(row).every(key => allowed.includes(key));
const path = value => Array.isArray(value) && value.every(part => typeof part === 'string' || Number.isSafeInteger(part) && part >= 0);
// Copy bounded own JSON data without encoding the parent on each row keystroke.
function cloneRowsData(value, maxBytes) {
    let visits = 0, bytes = 0; const ancestors = new Set();
    const add = size => { bytes += size; if (bytes > Math.min(maxBytes,262144)) throw Error('JSON byte budget'); };
    const stringSize = text => { let size = 2; for (const char of text) { const point = char.codePointAt(0); size += char === '\\' || char === '"' || ['\b','\t','\n','\f','\r'].includes(char) ? 2 : point < 32 || point >= 0xd800 && point <= 0xdfff ? 6 : point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4; } return size; };
    function copy(input, depth=0) {
        if (++visits > 10000 || depth > 32) throw Error('JSON structure budget');
        if (input === null || typeof input === 'boolean') { add(input === null ? 4 : input ? 4 : 5); return input; }
        if (typeof input === 'string') { add(stringSize(input)); return input; }
        if (typeof input === 'number' && Number.isFinite(input)) { add(String(input).length); return input; }
        if (!input || typeof input !== 'object' || ancestors.has(input)) throw Error('Own JSON data required');
        const array = Array.isArray(input), prototype = Object.getPrototypeOf(input), names = Reflect.ownKeys(input);
        if (array ? prototype !== Array.prototype || names.length !== input.length + 1 : prototype !== Object.prototype && prototype !== null) throw Error('Plain JSON required');
        ancestors.add(input); const output = array ? [] : {}; add(2); let count=0;
        for (const name of names) {
            if (array && name === 'length') continue;
            const property=Object.getOwnPropertyDescriptor(input,name);
            if (typeof name !== 'string' || !property?.enumerable || !Object.hasOwn(property,'value') || array && (!/^(0|[1-9]\d*)$/.test(name) || Number(name) >= input.length)) throw Error('Own dense JSON required');
            if (count++) add(1); if (!array) add(stringSize(name)+1);
            Object.defineProperty(output,name,{value:copy(property.value,depth+1),enumerable:true,configurable:true,writable:true});
        }
        ancestors.delete(input); return output;
    }
    return copy(value);
}
export function allocateControlRowId(prefix, existingIds) {
    const used = new Set(existingIds); let suffix = 1;
    while (used.has(prefix + '-' + suffix)) suffix++;
    return prefix + '-' + suffix;
}
/** Shape admission is separate from Save validation, so unfinished typed fields remain editable. */
export function readControlRows(spec, value) {
    try {
        value = cloneRowsData(value, spec.limits.maxBytes ?? 262144);
        const base = spec.id.split(':')[0];
        if (base === 'decision.questions') {
            if (!record(value) || Object.keys(value).length > 32 || !Object.values(value).every(row => keys(row,['type','instructions','criteria']) && ['noul','choice','score'].includes(row.type) && Object.hasOwn(row,'instructions'))) return fail();
            return {ok:true,data:{rows:Object.entries(value).map(([id,row])=>({...row,id}))}};
        }
        if (base === 'advance-time.schedules') {
            if (!Array.isArray(value) || value.length > 1000 || !value.every(row=>record(row) && typeof row.scheduleId==='string' && row.scheduleId.trim() && row.scheduleId.length<=256 && ['daily','interval','delay'].includes(row.kind)) || new Set(value.map(row=>row.scheduleId)).size!==value.length) return fail();
            return {ok:true,data:{rows:value}};
        }
        if (base === 'state.updates' || base === 'state.durations') {
            if (!record(value) || Object.keys(value).length > (spec.limits.maxItems ?? (base === 'state.durations' ? 5 : 32))) return fail();
            if (!Object.entries(value).every(([name, number]) => typeof number === 'number' && Number.isFinite(number) && (base !== 'state.durations' || phases.includes(name) && Number.isSafeInteger(number) && number >= 1 && number <= 64))) return fail();
            return {ok:true,data:{rows:Object.entries(value).map(([name,number])=>({name,number}))}};
        }
        if (!Array.isArray(value) || value.length > (spec.limits.maxItems ?? 64)) return fail();
        let admitted = false;
        if (['pattern.rules','extract.patterns'].includes(base)) {
            const field = base === 'pattern.rules' ? 'pattern' : 'literal';
            admitted = value.every(row => keys(row,['id',field,'label']) && typeof row.id === 'string' && typeof row[field] === 'string' && (base !== 'extract.patterns' && !Object.hasOwn(row,'label') || typeof row.label === 'string'));
        } else if (['join.inputs','collect.inputs','context-join.inputs'].includes(base)) {
            const context = base === 'context-join.inputs';
            admitted = value.length >= (context ? 2 : 1) && value.every(row=>keys(row,context?['id','label']:['id','label','required']) && typeof row.id === 'string' && typeof row.label === 'string' && (context || typeof row.required === 'boolean'));
        } else if (['select-fields.fields','format.fields'].includes(base)) admitted = value.every(row=>keys(row,['name','path','required','default']) && typeof row.name === 'string' && path(row.path) && (!Object.hasOwn(row,'required') || typeof row.required === 'boolean'));
        else if (base === 'compose.sections') admitted = value.every(row=>keys(row,['name','text','kind','required','onSkipped']) && typeof row.name === 'string' && typeof row.text === 'string' && (!Object.hasOwn(row,'kind') || ['text','guidance'].includes(row.kind)) && (!Object.hasOwn(row,'required') || typeof row.required === 'boolean') && (!Object.hasOwn(row,'onSkipped') || ['fallback','omit'].includes(row.onSkipped)));
        else if (base === 'text-rules.rules') admitted = value.every(row=>keys(row,['kind','pattern','replacement','flags']) && ['literal','regex'].includes(row.kind) && typeof row.pattern === 'string' && (!Object.hasOwn(row,'replacement') || typeof row.replacement === 'string') && (!Object.hasOwn(row,'flags') || typeof row.flags === 'string' && [...row.flags].every(flag=>(row.kind === 'regex'?'imsu':'iu').includes(flag)) && new Set(row.flags).size === row.flags.length));
        if (!admitted || value.some(row=>Object.hasOwn(row,'id') && (!row.id.trim() || row.id.length>128)) || new Set(value.filter(row=>Object.hasOwn(row,'id')).map(row=>row.id)).size !== value.filter(row=>Object.hasOwn(row,'id')).length) return fail();
        return {ok:true,data:{rows:value}};
    } catch { return fail(); }
}
export function writeControlRows(spec, rows, currentValue) {
    try {
        rows = cloneRowsData(rows, spec.limits.maxBytes ?? 262144);
        if (!Array.isArray(rows)) return fail();
        const base = spec.id.split(':')[0];
        if (base === 'decision.questions') return compileQuestionRows(rows,currentValue);
        const mapped = ['state.updates','state.durations'].includes(base);
        if (mapped && (rows.some(row=>!keys(row,['name','number']) || typeof row.name !== 'string' || typeof row.number !== 'number') || new Set(rows.map(row=>row.name)).size !== rows.length)) return fail();
        const value = mapped ? Object.fromEntries(rows.map(row=>[row.name,row.number])) : rows;
        const parsed = parseControlInput(spec,{format:'rows',value,...(currentValue === undefined ? {} : {currentValue})});
        return parsed.ok ? {ok:true,data:{value:parsed.data.value}} : parsed;
    } catch { return fail(); }
}
