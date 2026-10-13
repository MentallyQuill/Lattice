import { parseDelimitedInput } from './delimited-input.js?v=0.27.2';
import { allocateControlRowId, readControlRows, writeControlRows } from './control-input-adapters.js?v=0.27.2';
import { cloneJsonValue } from '../workflow/operations/json-data.js?v=0.27.2';
import { decodeJson } from '../workflow/operations/json-decode.js?v=0.27.2';
import { validateJsonPath } from './json-value-authoring.js?v=0.27.2';
const fail = (message, row, cell, code = 'INVALID_CONTROL_TABLE') => ({ok:false,error:{code,message,...(row === undefined ? {} : {row,cell})}});
const families = {
    'pattern.rules': {fields:['pattern','label','id'],required:['pattern'],prefix:'pattern',identity:'pattern'},
    'extract.patterns': {fields:['literal','label','id'],required:['literal'],prefix:'pattern',identity:'literal'},
    'text-rules.rules': {fields:['kind','pattern','replacement','flags'],required:['kind','pattern']},
    'join.inputs': {fields:['id','label','required'],required:['label'],prefix:'slot'},
    'collect.inputs': {fields:['id','label','required'],required:['label'],prefix:'slot'},
    'context-join.inputs': {fields:['id','label'],required:['label'],prefix:'slot'},
    'select-fields.fields': {fields:['name','path','required','default'],required:['name','path']},
    'format.fields': {fields:['name','path','required','default'],required:['name','path']},
};
/** Canonical field -> exact header name; an omitted optional mapping remains absent. */
export function controlTableImportFields(spec) {
    const family = families[spec.id.split(':')[0]];
    return family ? [...family.fields] : [];
}
/** Parse and validate a review candidate. Never modifies currentValue or performs a save. */
export function parseControlTableImport(spec, text, options) {
    try {
        const checked = cloneJsonValue(options); if (!checked.ok) return checked;
        const captured = checked.data.value;
        if (!captured || typeof captured !== 'object' || Array.isArray(captured)) return fail('Choose explicit table options.');
        const {delimiter,columns,action,currentValue} = captured;
        const base = spec.id.split(':')[0], family = families[base];
        if (!family || spec.editor !== 'rows') return fail('This control retains its native form or Advanced JSON; table import is unavailable.');
        if (!['add','replace'].includes(action) || ![',','\t'].includes(delimiter) || !columns || typeof columns !== 'object' || Array.isArray(columns)) return fail('Choose CSV or TSV, Add rows or Replace rows, and header mappings.');
        if (Object.keys(captured).some(key => !['delimiter','columns','action','currentValue'].includes(key))) return fail('Use only declared table options.');
        if (Object.entries(columns).some(([key,header]) => !family.fields.includes(key) || typeof header !== 'string' || !header)) return fail('Map only supported fields to exact header names.',1,1);
        if (family.required.some(key => !Object.hasOwn(columns,key))) return fail('Map the required columns: ' + family.required.join(', ') + '.',1,1);
        const source = parseDelimitedInput(text,delimiter); if (!source.ok) return source;
        const [headers,...sourceRows] = source.data.rows;
        if (!headers || headers.every(header => !header)) return fail('Include a header row before the data.',1,1);
        const names = new Set();
        for (let index=0; index<headers.length; index++) {
            if (names.has(headers[index])) return fail('Header names must be unique so mappings are unambiguous.',1,index+1);
            names.add(headers[index]);
        }
        const indices = {};
        for (const [key,header] of Object.entries(columns)) {
            const index=headers.indexOf(header); if (index < 0) return fail('Header "' + header + '" is missing. Select an existing header.',1,1);
            indices[key]=index;
        }
        const admitted = action === 'replace' && Array.isArray(currentValue) && currentValue.length === 0 ? {ok:true,data:{rows:[]}} : readControlRows(spec,currentValue); if (!admitted.ok) return admitted;
        const previous = admitted.data.rows, used = new Set(action === 'add' ? previous.map(row=>row.id).filter(id=>id !== undefined) : []);
        const reserved = new Set(previous.map(row=>row.id).filter(id=>id !== undefined));
        const explicitIds = new Set(Object.hasOwn(indices,'id') ? sourceRows.map(cells=>cells[indices.id]).filter(id=>id) : []);
        for (const id of explicitIds) reserved.add(id);
        const fieldNames = new Set(action === 'add' ? previous.map(row=>row.name).filter(name=>name !== undefined) : []);
        const rows=[], locations=[]; let ignored=0;
        for (let index=0; index<sourceRows.length; index++) {
            const cells=sourceRows[index], rowNumber=index+2;
            if (cells.every(cell=>cell === '')) { ignored++; continue; }
            if (cells.length !== headers.length) return fail('Use exactly ' + headers.length + ' cells to match the header row.',rowNumber,Math.min(cells.length,headers.length)+1);
            const row={};
            for (const [key,column] of Object.entries(indices)) {
                const cell=cells[column], location=column+1;
                if (['required','default'].includes(key) && cell === '') continue;
                if (['required','default','path'].includes(key)) {
                    const value = decodeJson(cell); if (!value.ok) return fail(key === 'required' ? 'Use JSON true or false for required.' : 'Use explicit JSON syntax for ' + key + '.',rowNumber,location,value.error.code);
                    if (key === 'required' && typeof value.data.value !== 'boolean') return fail('Use JSON true or false for required.',rowNumber,location);
                    if (key === 'path') {
                        const path=validateJsonPath(value.data.value,{allowIndices:true,maxItems:32});
                        if (!path.ok) return fail('Use a JSON path array of exact string keys or nonnegative integer indices.',rowNumber,location,path.error.code);
                    }
                    row[key]=value.data.value;
                } else row[key]=cell;
            }
            const cellError = (key,message) => fail(message,rowNumber,(indices[key] ?? 0)+1);
            for (const key of family.required.filter(key=>!['path','label'].includes(key))) if (typeof row[key] !== 'string' || !(key === family.identity ? row[key].trim() : row[key]).length) return cellError(key,'Enter a nonempty ' + key + ' cell.');
            if (family.identity) {
                if (row[family.identity].length > (spec.limits.maxStringLength ?? 2048)) return cellError(family.identity,'Keep this expression within the control text limit.');
                const match=action === 'replace' ? previous.find(existing => !used.has(existing.id) && (row.id ? existing.id === row.id : existing[family.identity] === row[family.identity] && !explicitIds.has(existing.id))) : undefined;
                if (!row.id && match) row.id=match.id;
                if (!Object.hasOwn(row,'label') && match && Object.hasOwn(match,'label')) row.label=match.label;
                if (base === 'extract.patterns' && !Object.hasOwn(row,'label')) row.label='';
                const labelLimit=base === 'pattern.rules' ? 128 : 2048;
                if (Object.hasOwn(row,'label') && row.label.length > labelLimit) return cellError('label','Keep labels within ' + labelLimit + ' characters.');
                if (base === 'pattern.rules' && spec.id.split(':')[1] === 'regex') { try { new RegExp(row.pattern,'u'); } catch { return cellError('pattern','Enter a valid Unicode regular expression.'); } }
            }
            if (['join.inputs','collect.inputs','context-join.inputs'].includes(base)) {
                if (row.label.length > 80) return cellError('label','Keep slot labels within 80 characters.');
                if (row.id === 'out') return cellError('id','The ID out is reserved for the output port. Choose another ID.');
            }
            if (['format.fields','select-fields.fields'].includes(base)) {
                if (fieldNames.has(row.name)) return cellError('name','Duplicate field name. Choose a unique name.');
                fieldNames.add(row.name);
            }
            if (family.prefix) {
                if (Object.hasOwn(row,'id') && row.id && (!row.id.trim() || row.id.length > 128)) return cellError('id','Use a nonblank ID of at most 128 characters.');
                if (!row.id) row.id=allocateControlRowId(family.prefix,[...reserved,...used]);
                if (used.has(row.id)) return cellError('id','Duplicate ID "' + row.id + '". Choose a unique ID.');
                used.add(row.id); reserved.add(row.id);
            }
            if (['join.inputs','collect.inputs'].includes(base) && !Object.hasOwn(row,'required')) row.required=true;
            if (base === 'text-rules.rules') {
                if (!['literal','regex'].includes(row.kind)) return cellError('kind','Choose literal or regex explicitly.');
                if (row.pattern.length > 2048) return cellError('pattern','Keep patterns within 2,048 characters.');
                const flags=row.flags ?? '';
                if ([...flags].some(flag=>!(row.kind === 'regex' ? 'imsu' : 'iu').includes(flag)) || new Set(flags).size !== flags.length) return cellError('flags','Use unique supported flags: ' + (row.kind === 'regex' ? 'imsu' : 'iu') + '.');
                if (row.kind === 'regex') { try { new RegExp(row.pattern,flags); } catch { return cellError('pattern','Enter a valid regular expression.'); } }
                if ((row.replacement ?? '').length > 100000) return cellError('replacement','Keep replacement text within 100,000 characters.');
            }
            rows.push(row); locations.push(rowNumber);
        }
        const candidate=action === 'add' ? [...previous,...rows] : rows;
        const written=writeControlRows(spec,candidate,currentValue);
        if (!written.ok) {
            const offset=action === 'add' ? previous.length : 0;
            const index=typeof written.error.path?.[0] === 'number' ? written.error.path[0]-offset : rows.length-1;
            return {...written,error:{...written.error,...(locations[index] === undefined ? {} : {row:locations[index],cell:1})}};
        }
        return {ok:true,data:{value:written.data.value,rows,warnings:ignored ? ['Ignored ' + ignored + ' blank rows.'] : []}};
    } catch { return fail('Use bounded plain table options and a declared control contract.'); }
}
