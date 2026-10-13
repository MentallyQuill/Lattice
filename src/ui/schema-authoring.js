import { validateJsonSchema } from '../workflow/operations/json-decode.js?v=0.27.2';
export { validateJsonSchema };
import { cloneJsonValue } from '../workflow/operations/json-data.js?v=0.27.2';
const fail = () => ({ ok: false, error: { code: 'INVALID_SCHEMA_PATH', message: 'Choose an existing schema node using exact property keys or items.' } });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// Admission has already checked every descriptor, value and schema budget.
function editable(value) {
    if (value === null || typeof value !== 'object') return value;
    const output = Array.isArray(value) ? [] : {};
    for (const key of Object.keys(value)) Object.defineProperty(output, key, { value: editable(value[key]), enumerable: true, writable: true, configurable: true });
    return output;
}
function nodeAt(schema, path) {
    if (!Array.isArray(path) || path.some(key => typeof key !== 'string')) return null;
    let node = schema;
    for (let index = 0; index < path.length; index++) {
        const keyword = path[index];
        if (keyword === 'properties') {
            const name = path[++index];
            if (name === undefined || !object(node.properties) || !Object.hasOwn(node.properties,name)) return null;
            node = node.properties[name];
        } else if (keyword === 'items' && Object.hasOwn(node,'items')) node = node.items;
        else return null;
    }
    return node;
}
function editSchema(schema, path, apply) {
    const checked = validateJsonSchema(schema);
    if (!checked.ok) return checked;
    const checkedPath = cloneJsonValue(path);
    if(!checkedPath.ok || !Array.isArray(checkedPath.data.value) || checkedPath.data.value.some(key=>typeof key!=='string')) return fail();
    const next = editable(checked.data.schema), node = nodeAt(next,checkedPath.data.value);
    if (!node) return fail();
    try { if (!apply(node)) return fail(); } catch { return fail(); }
    return validateJsonSchema(next);
}
/** Merge supported keywords at a schema node; literal property keys never split. */
export function updateSchemaAtPath(schema, path, patch) {
    return editSchema(schema,path,node => {
        if (!object(patch) || ![Object.prototype,null].includes(Object.getPrototypeOf(patch))) return false;
        for (const key of Reflect.ownKeys(patch)) {
            const property = Object.getOwnPropertyDescriptor(patch,key);
            if (typeof key !== 'string' || !property?.enumerable || !Object.hasOwn(property,'value')) return false;
            Object.defineProperty(node,key,{value:property.value,enumerable:true,writable:true,configurable:true});
        }
        return true;
    });
}
/** Remove a keyword explicitly so absence stays distinct from null and false. */
export function removeSchemaKeyword(schema, path, keyword) {
    return editSchema(schema,path,node => typeof keyword === 'string' && Object.hasOwn(node,keyword) && delete node[keyword]);
}
