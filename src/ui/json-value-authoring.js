import { cloneJsonValue } from '../workflow/operations/json-data.js?v=0.27.0';
const fail = (code, message) => ({ ok: false, error: { code, message } });

/** Apply one immutable edit to exact own keys or explicit array indices. */
export function updateJsonValueAtPath(value, path, edit) {
    const checked = cloneJsonValue(value);
    if (!checked.ok) return checked;
    const checkedPath = cloneJsonValue(path);
    if (!checkedPath.ok || !Array.isArray(checkedPath.data.value) || checkedPath.data.value.some(key => typeof key !== 'string' && !(Number.isSafeInteger(key) && key >= 0))) return fail('INVALID_JSON_PATH', 'Use exact keys or nonnegative integer indices.');
    const action = Object.getOwnPropertyDescriptor(edit ?? {}, 'action')?.value;
    if (!['set', 'remove'].includes(action)) return fail('INVALID_JSON_EDIT', 'Choose a set or remove edit.');
    let replacement;
    if (action === 'set') {
        const property = Object.getOwnPropertyDescriptor(edit, 'value');
        if (!property || !Object.hasOwn(property, 'value')) return fail('INVALID_JSON_EDIT', 'A set edit needs a JSON value.');
        const next = cloneJsonValue(property.value);
        if (!next.ok) return next;
        replacement = next.data.value;
    }
    const keys = checkedPath.data.value;
    if (!keys.length) return action === 'set' ? { ok: true, data: { value: replacement } } : fail('INVALID_JSON_EDIT', 'The root value cannot be removed.');
    let current = checked.data.value;
    for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        if (!current || typeof current !== 'object' || (Array.isArray(current) ? typeof key !== 'number' || key > current.length : typeof key !== 'string')) return fail('INVALID_JSON_PATH', 'Keys address objects; indices address arrays.');
        if (index !== keys.length - 1) {
            const property = Object.getOwnPropertyDescriptor(current, key);
            if (!property || !Object.hasOwn(property, 'value')) return fail('JSON_PATH_MISSING', 'The parent path does not exist.');
            current = property.value;
        } else if (action === 'remove') {
            if (!Object.hasOwn(current, key)) return fail('JSON_PATH_MISSING', 'The value does not exist.');
            if (Array.isArray(current)) current.splice(key, 1);
            else delete current[key];
        } else {
            Object.defineProperty(current, key, { value: replacement, enumerable: true, configurable: true, writable: true });
        }
    }
    return cloneJsonValue(checked.data.value);
}

/** Validate path segments without splitting punctuation or coercing numeric keys. */
export function validateJsonPath(value, { allowIndices = false, maxItems = 64 } = {}) {
    const checked = cloneJsonValue(value);
    if (!checked.ok) return checked;
    if (!Array.isArray(checked.data.value) || checked.data.value.length > maxItems || checked.data.value.some(key => typeof key !== 'string' && !(allowIndices && Number.isSafeInteger(key) && key >= 0))) return fail('INVALID_JSON_PATH', allowIndices ? 'Use exact keys or nonnegative integer indices.' : 'Use exact string keys.');
    return checked;
}
