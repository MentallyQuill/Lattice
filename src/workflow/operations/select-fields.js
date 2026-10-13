import { cloneJsonValue, readJsonPath } from './json-data.js?v=0.27.3';

const invalid = () => ({ok:false,error:{code:'INVALID_FIELDS',message:'Fields must be at most 128 unique named path mappings.'}});
const ownObject = value => {
    if (!value || typeof value !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw new Error();
    const output = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
        const property = Object.getOwnPropertyDescriptor(value,key);
        if (typeof key !== 'string' || !property?.enumerable || !Object.hasOwn(property,'value')) throw new Error();
        Object.defineProperty(output,key,{value:property.value,enumerable:true});
    }
    return output;
};

export function selectFields(value, settings) {
    let fields;
    try {
        const options = ownObject(settings);
        if (Object.keys(options).length !== 1 || !Object.hasOwn(options,'fields') || !Array.isArray(options.fields)) return invalid();
        const raw = options.fields;
        if (raw.length > 128 || Reflect.ownKeys(raw).length !== raw.length + 1) return invalid();
        const names = new Set();
        fields = [];
        for (let i = 0; i < raw.length; i++) {
            const property = Object.getOwnPropertyDescriptor(raw,String(i));
            if (!property?.enumerable || !Object.hasOwn(property,'value')) return invalid();
            const field = ownObject(property.value);
            if (Object.keys(field).some(key => !['name','path','required','default'].includes(key)) || typeof field.name !== 'string' || !field.name.length || names.has(field.name) || !Object.hasOwn(field,'path') || (Object.hasOwn(field,'required') && typeof field.required !== 'boolean')) return invalid();
            if (!readJsonPath(null,field.path).ok) return invalid();
            if (Object.hasOwn(field,'default') && !cloneJsonValue(field.default).ok) return invalid();
            names.add(field.name);
            fields.push(field);
        }
    } catch { return invalid(); }
    const checked = cloneJsonValue(value);
    if (!checked.ok) return checked;
    const output = {};
    for (const field of fields) {
        const result = readJsonPath(checked.data.value,field.path);
        if (!result.ok) return result;
        let selected = result.data.value;
        if (!result.data.found) {
            if (field.required !== false) return {ok:false,error:{code:'MISSING_FIELD',message:'Required field is missing.',name:field.name,path:cloneJsonValue(field.path).data.value}};
            if (!Object.hasOwn(field,'default')) continue;
            const fallback = cloneJsonValue(field.default);
            if (!fallback.ok) return fallback;
            selected = fallback.data.value;
        }
        Object.defineProperty(output,field.name,{value:selected,enumerable:true,writable:true,configurable:true});
    }
    const bounded = cloneJsonValue(output);
    if (!bounded.ok) return bounded;
    return {ok:true,data:{value:bounded.data.value,report:[]}};
}
