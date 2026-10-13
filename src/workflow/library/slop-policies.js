import { cloneJsonValue } from '../operations/json-data.js?v=0.27.1';

const modes = new Set(['inspect', 'contextual', 'strict']);
const scopes = new Set(['authorized', 'narration', 'dialogue', 'whole']);
const matchTypes = new Set(['phrase', 'template', 'behavior']);
const fail = (code, message) => ({ ok: false, error: { code, message } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const shape = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const unique = values => new Set(values).size === values.length;

function validLibrary(value) {
    if (!shape(value, ['version', 'source', 'categories', 'entries']) || value.version !== 1) return false;
    const sourceKeys = ['title', 'fileName', 'categoryCount', 'occurrenceCount', 'uniqueEntryCount', 'templateCount', 'behaviorCount'];
    if (!shape(value.source, sourceKeys) || !text(value.source.title, 2048) || !text(value.source.fileName, 2048)) return false;
    if (!Array.isArray(value.categories) || !Array.isArray(value.entries)) return false;
    if (!value.categories.every(category => shape(category, ['id', 'label']) && text(category.id, 128) && text(category.label, 2048))) return false;
    const categoryIds = value.categories.map(category => category.id);
    if (!unique(categoryIds)) return false;
    const known = new Set(categoryIds);
    if (!value.entries.every(entry => shape(entry, ['id', 'text', 'matchType', 'categories'])
        && text(entry.id, 128) && text(entry.text, 100000) && matchTypes.has(entry.matchType)
        && Array.isArray(entry.categories) && entry.categories.length > 0 && unique(entry.categories)
        && entry.categories.every(id => known.has(id)))) return false;
    if (!unique(value.entries.map(entry => entry.id)) || !unique(value.entries.map(entry => entry.text))) return false;
    const counts = {
        categoryCount: value.categories.length,
        occurrenceCount: value.entries.reduce((total, entry) => total + entry.categories.length, 0),
        uniqueEntryCount: value.entries.length,
        templateCount: value.entries.filter(entry => entry.matchType === 'template').length,
        behaviorCount: value.entries.filter(entry => entry.matchType === 'behavior').length,
    };
    return Object.keys(counts).every(key => value.source[key] === counts[key]);
}

/** Select detached typed policies; no matching, semantic cleanup, or Apply authority. */
export function selectSlopPolicies(library, settings = {}) {
    const checked = cloneJsonValue(library);
    if (!checked.ok || !validLibrary(checked.data.value)) return fail('INVALID_SLOP_LIBRARY', 'Library must contain bounded, consistent typed policy JSON.');
    const checkedSettings = cloneJsonValue(settings);
    if (!checkedSettings.ok || !record(checkedSettings.data.value)) return fail('INVALID_SLOP_SETTINGS', 'Settings must contain a known mode, scope and unique category IDs.');
    const options = checkedSettings.data.value;
    if (Object.keys(options).some(key => !['mode', 'scope', 'categories'].includes(key))) return fail('INVALID_SLOP_SETTINGS', 'Settings contain an unknown field.');
    const value = checked.data.value;
    const mode = Object.hasOwn(options, 'mode') ? options.mode : 'inspect';
    const scope = Object.hasOwn(options, 'scope') ? options.scope : 'narration';
    const categories = Object.hasOwn(options, 'categories') ? options.categories : value.categories.map(category => category.id);
    const known = new Set(value.categories.map(category => category.id));
    if (!modes.has(mode) || !scopes.has(scope) || !Array.isArray(categories) || !unique(categories) || categories.some(id => !known.has(id))) {
        return fail('INVALID_SLOP_SETTINGS', 'Settings must contain a known mode, scope and unique category IDs.');
    }
    const selected = new Set(categories.length ? categories : known);
    const output = {
        ...value,
        mode,
        scope,
        categories: value.categories.filter(category => selected.has(category.id)),
        entries: value.entries.filter(entry => entry.categories.some(id => selected.has(id))),
    };
    const bounded = cloneJsonValue(output);
    return bounded.ok ? bounded : fail('INVALID_SLOP_LIBRARY', 'Selected policy JSON exceeds Data limits.');
}
