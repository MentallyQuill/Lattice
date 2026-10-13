import { cloneJsonValue } from './json-data.js?v=0.27.1';

const pointerKey = key => String(key).replaceAll('~', '~0').replaceAll('/', '~1');
const matchesType = (value, type) => type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : type === 'array' ? Array.isArray(value) : type === 'null' ? value === null : type === 'integer' ? Number.isInteger(value) : typeof value === type;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keywords = new Set(['type','enum','const','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','minimum','maximum','title','description','$schema']);

function validateSchema(schema) {
    let nodes = 0;
    const ownEntries = value => {
        if (!isObject(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw new Error();
        return Reflect.ownKeys(value).map(key => {
            const property = Object.getOwnPropertyDescriptor(value,key);
            if (typeof key !== 'string' || !property?.enumerable || !Object.hasOwn(property,'value')) throw new Error();
            return [key,property.value];
        });
    };
    const visit = (node, depth) => {
        if (depth > 16 || ++nodes > 1000) throw new Error();
        const output = Object.create(null);
        for (const [key,raw] of ownEntries(node)) {
            if (!keywords.has(key)) throw new Error();
            let value;
            if (key === 'properties') value = Object.fromEntries(ownEntries(raw).map(([name,child]) => [name,visit(child,depth+1)]));
            else if (key === 'items') value = visit(raw,depth+1);
            else {
                const cloned = cloneJsonValue(raw);
                if (!cloned.ok) throw new Error();
                value = cloned.data.value;
            }
            if (key === 'type' && !['null','boolean','object','array','number','integer','string'].includes(value)) throw new Error();
            if (['title','description','$schema'].includes(key) && typeof value !== 'string') throw new Error();
            if (key === 'enum' && (!Array.isArray(value) || !value.length)) throw new Error();
            if (key === 'required' && (!Array.isArray(value) || value.some(item => typeof item !== 'string') || new Set(value).size !== value.length)) throw new Error();
            if (key === 'additionalProperties' && typeof value !== 'boolean') throw new Error();
            if (['minItems','maxItems','minLength','maxLength'].includes(key) && (!Number.isSafeInteger(value) || value < 0)) throw new Error();
            if (['minimum','maximum'].includes(key) && typeof value !== 'number') throw new Error();
            Object.defineProperty(output,key,{value,enumerable:true});
        }
        return output;
    };
    try { return visit(schema, 0); } catch { return false; }
}

/** Admit a schema through the same bounded subset used by decodeJson. */
export function validateJsonSchema(schema) {
    const checked = validateSchema(schema);
    return checked ? {ok:true,data:{schema:checked}} : {ok:false,error:{code:'UNSUPPORTED_SCHEMA',message:'Schema must use only the supported bounded subset.'}};
}

function jsonEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]));
}

function schemaFindings(value, schema, path = '', findings = []) {
    if (findings.length >= 128) return findings;
    const add = (keyword, message, at = path) => { if (findings.length < 128) findings.push({path:at,keyword,message}); };
    if (schema.type && !matchesType(value, schema.type)) add('type',`Expected ${schema.type}.`);
    if (schema.enum && !schema.enum.some(item => jsonEqual(value, item))) add('enum','Value is not in enum.');
    if (Object.hasOwn(schema,'const') && !jsonEqual(value,schema.const)) add('const','Value does not equal const.');
    if (typeof value === 'number') {
        if (Object.hasOwn(schema,'minimum') && value < schema.minimum) add('minimum','Number is below minimum.');
        if (Object.hasOwn(schema,'maximum') && value > schema.maximum) add('maximum','Number is above maximum.');
    }
    if (typeof value === 'string') {
        const length = Array.from(value).length;
        if (Object.hasOwn(schema,'minLength') && length < schema.minLength) add('minLength','String is shorter than minimum.');
        if (Object.hasOwn(schema,'maxLength') && length > schema.maxLength) add('maxLength','String is longer than maximum.');
    }
    if (Array.isArray(value)) {
        if (Object.hasOwn(schema,'minItems') && value.length < schema.minItems) add('minItems','Array has fewer than minimum items.');
        if (Object.hasOwn(schema,'maxItems') && value.length > schema.maxItems) add('maxItems','Array has more than maximum items.');
        if (schema.items) value.forEach((item,index) => schemaFindings(item,schema.items,`${path}/${index}`,findings));
    }
    if (isObject(value)) {
        for (const key of schema.required ?? []) if (!Object.hasOwn(value,key)) add('required','Required field is missing.',`${path}/${pointerKey(key)}`);
        if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties ?? {},key)) add('additionalProperties','Additional field is not allowed.',`${path}/${pointerKey(key)}`);
        for (const [key, child] of Object.entries(schema.properties ?? {})) {
            if (Object.hasOwn(value, key)) schemaFindings(value[key], child, `${path}/${pointerKey(key)}`, findings);
        }
    }
    return findings;
}

export function decodeJson(input, options = {}) {
    const invalidOptions = () => ({ok:false,error:{code:'INVALID_JSON_OPTIONS',message:'Decode settings must contain only mode and schema data properties.'}});
    let mode = 'parse', schema, hasSchema = false;
    try {
        if (!isObject(options) || ![Object.prototype,null].includes(Object.getPrototypeOf(options))) return invalidOptions();
        for (const key of Reflect.ownKeys(options)) {
            const property = Object.getOwnPropertyDescriptor(options,key);
            if (!['mode','schema'].includes(key) || !property?.enumerable || !Object.hasOwn(property,'value')) return invalidOptions();
            if (key === 'mode') mode = property.value;
            else { schema = property.value; hasSchema = true; }
        }
    } catch { return invalidOptions(); }
    if (mode !== 'parse' && mode !== 'check') return {ok:false,error:{code:'INVALID_JSON_OPTIONS',message:'Mode must be parse or check.'}};
    const validatedSchema = hasSchema ? validateSchema(schema) : undefined;
    if (hasSchema && !validatedSchema) return {ok:false,error:{code:'UNSUPPORTED_SCHEMA',message:'Schema must use only the supported bounded subset.'}};
    let value = input;
    if (mode === 'parse') {
        if (typeof input !== 'string' || input.length > 100000 || new TextEncoder().encode(input).byteLength > 262144) return {ok:false,error:{code:'INVALID_JSON',message:'Parse mode requires bounded raw JSON text.'}};
        try { value = JSON.parse(input); }
        catch { return {ok:false,error:{code:'INVALID_JSON',message:'Input is not valid raw JSON text.'}}; }
    }
    const checked = cloneJsonValue(value);
    if (!checked.ok) return checked;
    if (hasSchema) {
        const findings = schemaFindings(checked.data.value, validatedSchema);
        if (findings.length) return {ok:false,error:{code:'SCHEMA_MISMATCH',message:'JSON does not match the schema.',findings}};
    }
    return {ok:true,data:{value:checked.data.value,report:[]}};
}
