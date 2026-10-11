import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const library = JSON.parse(readFileSync(new URL('../data/ai-slop-policy.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('./fixtures/ai-slop-source.md', import.meta.url), 'utf8');
const sections = [];
for (const line of source.split(/\r?\n/u)) {
    if (line.startsWith('### ')) sections.push({ label: line.slice(4), entries: [] });
    else if (line.startsWith('* ')) sections.at(-1).entries.push(line.slice(2));
}
assert.equal(sections.length, 14);
assert.equal(sections.flatMap(section => section.entries).length, 273);
assert.deepEqual(library.categories.map(category => category.label), sections.map(section => section.label));
for (const [index, section] of sections.entries()) {
    const id = library.categories[index].id;
    assert.deepEqual(library.entries.filter(entry => entry.categories.includes(id)).map(entry => entry.text).sort(), [...section.entries].sort());
}
assert.equal(library.entries.length, new Set(sections.flatMap(section => section.entries)).size);
assert.equal(library.entries.length, 271);
for (const entry of library.entries) {
    const expectedType = /\b[XYZ]\b/u.test(entry.text) ? 'template' : sections[10].entries.slice(0, 2).includes(entry.text) ? 'behavior' : 'phrase';
    assert.equal(entry.matchType, expectedType, entry.text);
}
assert.equal(library.entries.filter(entry => entry.matchType === 'template').length, 17);
assert.equal(library.entries.filter(entry => entry.matchType === 'behavior').length, 2);
for (const text of ['adequate', 'acceptable']) assert.equal(library.entries.find(entry => entry.text === text).categories.length, 2);
const { selectSlopPolicies } = await import('../src/workflow/library/slop-policies.js');
const snapshot = JSON.stringify(library);
const defaultSelection = selectSlopPolicies(library);
assert.equal(defaultSelection.ok, true);
assert.deepEqual(defaultSelection.data.value, { ...library, mode: 'inspect', scope: 'narration' });
assert.equal(defaultSelection.data.value.entries.length, 271); // The full registered policy library is retained.
defaultSelection.data.value.entries[0].text = 'edited';
defaultSelection.data.value.categories[0].label = 'edited';
defaultSelection.data.value.source.title = 'edited';
assert.equal(JSON.stringify(library), snapshot);
const chosen = library.categories.at(-1).id;
for (const mode of ['inspect', 'contextual', 'strict']) {
    for (const scope of ['narration', 'dialogue', 'whole']) {
        const result = selectSlopPolicies(library, { mode, scope, categories: [chosen] });
        assert.equal(result.ok, true);
        assert.equal(result.data.value.mode, mode);
        assert.equal(result.data.value.scope, scope);
        assert.deepEqual(result.data.value.categories, [library.categories.at(-1)]);
        assert.deepEqual(result.data.value.entries, library.entries.filter(entry => entry.categories.includes(chosen)));
        assert.equal(result.data.value.entries.find(entry => entry.text === 'adequate').categories.length, 2);
    }
}
assert.deepEqual(selectSlopPolicies(library, { categories: [] }).data.value.entries, library.entries);
const sourceOrder = selectSlopPolicies(library, { categories: [chosen, library.categories[0].id] }).data.value.categories;
assert.deepEqual(sourceOrder, [library.categories[0], library.categories.at(-1)]);
assert.equal(JSON.stringify(library), snapshot);
for (const settings of [null, [], { mode: 'rewrite' }, { scope: 'everything' }, { categories: ['missing'] }, { categories: [chosen, chosen] }, { categories: chosen }, { mode: null }, { scope: null }, { categories: null }, { unexpected: true }, { categories: [1] }]) {
    const result = selectSlopPolicies(library, settings);
    assert.equal(result.error?.code, 'INVALID_SLOP_SETTINGS');
    assert.equal(Object.hasOwn(result, 'data'), false);
}
for (const mutate of [
    value => { value.version = 2; },
    value => { delete value.source; },
    value => { value.source.occurrenceCount++; },
    value => { value.categories[1].id = value.categories[0].id; },
    value => { value.entries[1].id = value.entries[0].id; },
    value => { value.entries[1].text = value.entries[0].text; },
    value => { value.entries[0].matchType = 'regex'; },
    value => { value.entries[0].categories = ['missing']; },
    value => { value.entries[0].categories = []; },
    value => { value.entries[0].categories.push(value.entries[0].categories[0]); },
    value => { value.entries[0].regex = '.*'; },
    value => { value.entries[0].text = 'x'.repeat(300000); },
    value => { value.entries = Array(10001).fill(value.entries[0]); },
]) {
    const invalid = structuredClone(library);
    mutate(invalid);
    assert.equal(selectSlopPolicies(invalid).error?.code, 'INVALID_SLOP_LIBRARY');
}
for (const invalid of [null, [], {}, new Date(), { ...library, entries: undefined }]) assert.equal(selectSlopPolicies(invalid).ok, false);
let getterReads = 0;
const accessorLibrary = Object.defineProperty({ ...library }, 'entries', { enumerable: true, get() { getterReads++; throw new Error('must not read'); } });
const accessorSettings = Object.defineProperty({}, 'mode', { enumerable: true, get() { getterReads++; throw new Error('must not read'); } });
assert.equal(selectSlopPolicies(accessorLibrary).error?.code, 'INVALID_SLOP_LIBRARY');
assert.equal(selectSlopPolicies(library, accessorSettings).error?.code, 'INVALID_SLOP_SETTINGS');
assert.equal(getterReads, 0);
const cycle = { ...library }; cycle.source = cycle;
assert.equal(selectSlopPolicies(cycle).ok, false);
const frozen = structuredClone(library);
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
assert.equal(selectSlopPolicies(freeze(frozen), freeze({ mode: 'strict', scope: 'whole', categories: [chosen] })).ok, true);
for (const key of ['mode', 'scope', 'categories', 'entries', 'source', 'id', 'text', 'matchType']) {
    let reads = 0, result, invalidResult;
    Object.defineProperty(Object.prototype, key, { configurable: true, get() { reads++; throw new Error('inherited getter'); } });
    try {
        result = selectSlopPolicies(library);
        const malformed = structuredClone(library);
        delete malformed.entries[0].matchType;
        invalidResult = selectSlopPolicies(malformed);
    } finally { delete Object.prototype[key]; }
    assert.equal(reads, 0, key);
    assert.equal(result.ok, true, key);
    assert.equal(invalidResult.error?.code, 'INVALID_SLOP_LIBRARY');
}
for (const entry of selectSlopPolicies(library, { mode: 'strict', scope: 'whole' }).data.value.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['categories', 'id', 'matchType', 'text']);
    assert.equal(Object.hasOwn(entry, 'regex'), false);
}
const boundary = {
    version: 1,
    source: { title: 'source', fileName: 'source.md', categoryCount: 1, occurrenceCount: 3, uniqueEntryCount: 3, templateCount: 0, behaviorCount: 0 },
    categories: [{ id: 'one', label: 'One' }],
    entries: [
        { id: 'one', text: 'a'.repeat(100000), matchType: 'phrase', categories: ['one'] },
        { id: 'two', text: 'b'.repeat(100000), matchType: 'phrase', categories: ['one'] },
        { id: 'three', text: 'c', matchType: 'phrase', categories: ['one'] },
    ],
};
boundary.entries[2].text = 'c'.repeat(262140 - Buffer.byteLength(JSON.stringify(boundary)) + 1);
assert.equal(Buffer.byteLength(JSON.stringify(boundary)), 262140);
assert.equal(selectSlopPolicies(boundary).ok, false, 'Selection output must also fit Data JSON bounds');
let calls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { calls++; throw new Error('policy selection must make no calls'); };
try {
    assert.equal(selectSlopPolicies(library, { mode: 'contextual', scope: 'dialogue' }).ok, true);
    const hooked = { ...library, toJSON() { calls++; throw new Error('must not call toJSON'); } };
    assert.equal(selectSlopPolicies(hooked).error?.code, 'INVALID_SLOP_LIBRARY');
} finally { globalThis.fetch = originalFetch; }
assert.equal(calls, 0);


const { SLOP_POLICY_DATA } = await import('../src/workflow/library/slop-policy-data.js');
assert.deepEqual(SLOP_POLICY_DATA, library, 'Browser policy data must equal canonical JSON');

console.log('workflow slop policy tests passed');
