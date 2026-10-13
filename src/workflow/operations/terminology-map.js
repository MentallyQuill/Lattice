import { prepareReferenceDraft, createReferencePatches } from './reference-draft.js?v=0.27.3';

const failure = (code, message) => ({ ok: false, error: { code, message } });
const word = codePoint => codePoint !== undefined && /[\p{L}\p{M}\p{N}\p{Pc}]/u.test(String.fromCodePoint(codePoint));
function wordBefore(text, offset) {
    if (!offset) return false;
    const last = text.charCodeAt(offset - 1), preceding = text.charCodeAt(offset - 2);
    const pair = offset > 1 && last >= 0xdc00 && last <= 0xdfff && preceding >= 0xd800 && preceding <= 0xdbff;
    return word(text.codePointAt(offset - (pair ? 2 : 1)));
}
function ownRecord(value, allowed, required = []) {
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Plain record required.');
    const descriptors = Object.getOwnPropertyDescriptors(value), output = Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
        const property = descriptors[key];
        if (typeof key !== 'string' || !allowed.includes(key) || !property.enumerable || !Object.hasOwn(property, 'value')) throw new Error('Own data fields required.');
        output[key] = property.value;
    }
    if (required.some(key => !Object.hasOwn(output, key))) throw new Error('Required field missing.');
    return output;
}
function ownEntries(value) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error('Plain entries array required.');
    const descriptors = Object.getOwnPropertyDescriptors(value), length = descriptors.length.value;
    if (length > 128 || Reflect.ownKeys(descriptors).length !== length + 1) throw new Error('Bounded dense entries required.');
    const entries = [];
    for (let index = 0; index < length; index++) {
        if (!Object.hasOwn(descriptors, index)) throw new Error('Own entries required.');
        const property = descriptors[index];
        if (!property.enumerable || !Object.hasOwn(property, 'value')) throw new Error('Own entries required.');
        const entry = ownRecord(property.value, ['from', 'to'], ['from', 'to']);
        if (![entry.from, entry.to].every(text => typeof text === 'string' && text.trim() && text.length <= 2048)) throw new Error('Bounded nonblank literals required.');
        entries.push(entry);
    }
    return entries;
}
function matches(rule, text, offset) {
    rule.literal.lastIndex = offset;
    return rule.literal.test(text);
}

export function mapTerminology(draft, glossary, settings = {}) {
    try {
        settings = ownRecord(settings, ['scope', 'protectedLiterals', 'caseSensitive', 'match']);
        if ((settings.caseSensitive !== undefined && typeof settings.caseSensitive !== 'boolean') || (settings.match !== undefined && !['word', 'phrase'].includes(settings.match))) throw new Error('Unsupported matching options.');
    } catch { return failure('INVALID_SETTINGS', 'Use own plain matching and scope settings.'); }
    try { glossary = ownEntries(ownRecord(glossary, ['entries'], ['entries']).entries); }
    catch { return failure('INVALID_GLOSSARY', 'Use at most 128 own-data entries with nonblank literals of at most 2,048 UTF-16 units.'); }
    const scopeSettings = Object.create(null);
    for (const key of ['scope', 'protectedLiterals']) if (Object.hasOwn(settings, key)) scopeSettings[key] = settings[key];
    const prepared = prepareReferenceDraft(draft, scopeSettings);
    if (!prepared.ok) return prepared;
    const { windows, draft: original } = prepared.data;
    // Unicode simple case folding matches the original text directly; no length-changing normalization.
    const rules = glossary.map((entry, glossaryIndex) => ({ ...entry, glossaryIndex, literal: new RegExp(RegExp.escape(entry.from), settings.caseSensitive === false ? 'iyu' : 'yu') })).sort((a, b) => b.from.length - a.from.length);
    for (let index = 0; index < rules.length; index++) for (let other = 0; other < index; other++) {
        if (matches(rules[index], rules[other].from, 0) && rules[index].literal.lastIndex === rules[other].from.length) return failure('DUPLICATE_RULE', 'Effective from literals must be unique.');
    }
    const findings = [], replacements = [];
    let outputLength = original.text.length;
    for (const window of windows) {
        let replacement = '', copied = 0, offset = 0;
        while (offset < window.text.length) {
            const rule = rules.find(entry => {
                if (!matches(entry, window.text, offset)) return false;
                return settings.match === 'phrase' || (!wordBefore(original.text, window.start + offset) && !word(original.text.codePointAt(window.start + entry.literal.lastIndex)));
            });
            if (!rule) { offset += window.text.codePointAt(offset) > 0xffff ? 2 : 1; continue; }
            if (findings.length === 4096) return failure('FINDING_LIMIT', 'At most 4,096 terminology findings are permitted.');
            const end = rule.literal.lastIndex;
            outputLength += rule.to.length - (end - offset);
            replacement += window.text.slice(copied, offset) + rule.to;
            findings.push({ start: window.start + offset, end: window.start + end, glossaryIndex: rule.glossaryIndex, from: rule.from, to: rule.to, spanIndex: window.spanIndex });
            copied = end; offset = end;
        }
        replacements.push(replacement + window.text.slice(copied));
    }
    if (outputLength > 100000) return failure('OUTPUT_LIMIT', 'Candidate exceeds 100,000 UTF-16 units.');
    const result = createReferencePatches(prepared.data, replacements);
    if (!result.ok) return result;
    return { ok: true, data: { artifact: result.data.artifact, report: [...result.data.report, { type: 'terminology', findings, count: findings.length }] } };
}
