import { prepareReferenceDraft, createReferencePatches } from './reference-draft.js?v=0.27.2';
const failure = (code, message) => ({ ok: false, error: { code, message } });
function defaultWorkerFactory() {
    // Preserve Vite's statically recognized Worker expression in bundled development/production.
    if (import.meta.env?.DEV || import.meta.env?.PROD) {
        return new Worker(new URL('./text-rules-worker.js', import.meta.url), { type: 'module' });
    }
    // Installed source modules carry a release query; inherit it without a hardcoded version.
    const url = new URL('./text-rules-worker.js', import.meta.url);
    url.search = new URL(import.meta.url).search;
    return new Worker(url, { type: 'module' });
}
function execute(segments, settings, execution) {
    if (execution.signal?.aborted) return Promise.resolve(failure('ABORTED', 'Text rules were stopped.'));
    return new Promise(resolve => {
        let worker;
        try {
            worker = (execution.workerFactory ?? defaultWorkerFactory)();
            if (!worker || !['addEventListener', 'removeEventListener', 'postMessage', 'terminate'].every(key => typeof worker[key] === 'function')) {
                worker?.terminate?.();
                throw new Error('Invalid Worker.');
            }
        }
        catch { resolve(failure('WORKER_UNAVAILABLE', 'A dedicated text rules Worker is unavailable.')); return; }
        let settled = false, timer;
        const finish = result => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            execution.signal?.removeEventListener('abort', abort);
            try { worker.removeEventListener('message', message); } catch {}
            try { worker.removeEventListener('error', error); } catch {}
            try { worker.terminate()?.catch?.(() => {}); } catch {}
            resolve(result);
        };
        const abort = () => finish(failure('ABORTED', 'Text rules were stopped.'));
        const message = event => finish(event.data);
        const error = () => finish(failure('WORKER_UNAVAILABLE', 'The text rules Worker failed.'));
        try {
            execution.signal?.addEventListener('abort', abort, { once: true });
            worker.addEventListener('message', message);
            worker.addEventListener('error', error);
            if (execution.signal?.aborted) { abort(); return; }
            timer = setTimeout(() => finish(failure('RULE_TIMEOUT', 'Text rules exceeded their Worker deadline.')), execution.timeoutMs);
            worker.postMessage({ segments, settings });
        } catch { error(); }
    });
}
/** Transform Text in an owned module Worker. */
export async function applyTextRules(text, settings = {}, execution = {}) {
    if (typeof text !== 'string' || text.length > 100000) return failure('INPUT_LIMIT', 'Text must be a string of at most 100,000 UTF-16 units.');
    const normalized = normalizeSettings(settings);
    if (!normalized) return failure('INVALID_RULES', 'Use supported modes and at most 64 bounded literal or regex rules with supported unique flags.');
    const options = normalizeExecution(execution);
    if (!options) return failure('INVALID_RULES', 'Execution requires a 100..2,000 ms deadline and an optional AbortSignal and Worker factory.');
    const result = await execute([text], normalized, options);
    return result.ok ? { ok: true, data: { text: result.data.segments[0], report: result.data.report } } : result;
}

function ownRecord(value, allowed) {
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value), output = Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key];
        if (typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return null;
        output[key] = descriptor.value;
    }
    return output;
}
function normalizeSettings(settings) {
    try {
        const input = ownRecord(settings, ['mode', 'rules', 'separator']);
        if (!input || !['replace', 'extract'].includes((input.mode === undefined ? 'replace' : input.mode))) return null;
        const separator = input.separator === undefined ? '\n' : input.separator;
        if (typeof separator !== 'string' || separator.length > 100000) return null;
        const rules = input.rules === undefined ? [] : input.rules;
        if (!Array.isArray(rules) || Object.getPrototypeOf(rules) !== Array.prototype || rules.length > 64) return null;
        const descriptors = Object.getOwnPropertyDescriptors(rules);
        if (Reflect.ownKeys(descriptors).length !== rules.length + 1) return null;
        const normalized = [];
        for (let index = 0; index < rules.length; index++) {
            const descriptor = descriptors[index];
            if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return null;
            const rule = ownRecord(descriptor.value, ['kind', 'pattern', 'replacement', 'flags']);
            if (!rule || !['literal', 'regex'].includes(rule.kind) || typeof rule.pattern !== 'string' || !rule.pattern.length || rule.pattern.length > 2048) return null;
            const flags = rule.flags === undefined ? '' : rule.flags, replacement = rule.replacement === undefined ? '' : rule.replacement;
            if (typeof flags !== 'string' || [...flags].some(flag => !(rule.kind === 'regex' ? 'imsu' : 'iu').includes(flag)) || new Set(flags).size !== flags.length) return null;
            if (typeof replacement !== 'string' || replacement.length > 100000) return null;
            normalized.push({ kind: rule.kind, pattern: rule.pattern, replacement, flags });
        }
        return { mode: (input.mode === undefined ? 'replace' : input.mode), separator, rules: normalized };
    } catch { return null; }
}

function normalizeExecution(execution) {
    try {
        const input = ownRecord(execution, ['timeoutMs', 'signal', 'workerFactory']);
        if (!input) return null;
        const timeoutMs = input.timeoutMs === undefined ? 1000 : input.timeoutMs;
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 2000) return null;
        if (input.workerFactory !== undefined && typeof input.workerFactory !== 'function') return null;
        if (input.signal !== undefined && !(input.signal instanceof AbortSignal)) return null;
        return { timeoutMs, signal: input.signal, workerFactory: input.workerFactory };
    } catch { return null; }
}

/** Propose reviewed patches against the immutable original Draft spans. */
export async function createDraftRulePatches(draft, settings = {}, execution = {}) {
    let draftSettings;
    try { draftSettings = ownRecord(settings, ['mode', 'rules', 'separator', 'scope', 'protectedLiterals']); }
    catch { return failure('INVALID_RULES', 'Use supported bounded text rules and execution options.'); }
    if (!draftSettings) return failure('INVALID_RULES', 'Use supported bounded text rules and execution options.');
    const normalized = normalizeSettings(Object.assign(Object.create(null), { mode: draftSettings.mode, rules: draftSettings.rules, separator: draftSettings.separator })), options = normalizeExecution(execution);
    if (!normalized || !options || normalized.mode !== 'replace') return failure('INVALID_RULES', 'Use supported bounded text rules and execution options.');
    let frozen;
    try {
        frozen = snapshotDraft(draft);
    }
    catch { return failure('INVALID_DRAFT', 'Draft must contain cloneable original source and span data.'); }
    if (frozen.text.length > 100000) return failure('INPUT_LIMIT', 'Draft exceeds 100,000 UTF-16 units.');
    if (frozen.spans?.length > 256) return failure('SPAN_LIMIT', 'Draft accepts at most 256 original editable spans.');
    const prepared = prepareReferenceDraft(frozen, Object.assign(Object.create(null), { scope: draftSettings.scope, protectedLiterals: draftSettings.protectedLiterals }));
    if (!prepared.ok) return prepared;
    const result = await execute(prepared.data.windows.map(window => window.text), normalized, options);
    if (!result.ok) return result;
    const reconstructed = createReferencePatches(prepared.data, result.data.segments);
    if (!reconstructed.ok) return reconstructed;
    return { ok: true, data: { artifact: reconstructed.data.artifact, report: result.data.report } };
}

// Draft provenance can include a bounded host context; retain its complete data snapshot.
function snapshotDraft(draft) {
    let values = 0, characters = 0;
    const active = new Set();
    function clone(value, depth) {
        if (++values > 20000 || depth > 40) throw new Error('Draft metadata limit.');
        if (typeof value === 'string') {
            characters += value.length;
            if (characters > 500000) throw new Error('Draft metadata limit.');
            return value;
        }
        if (value === undefined || value === null || typeof value === 'boolean') return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (!value || typeof value !== 'object' || active.has(value)) throw new Error('Invalid Draft metadata.');
        const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
        if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) throw new Error('Invalid Draft metadata.');
        const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
        if (array && keys.length !== descriptors.length.value + 1) throw new Error('Sparse Draft metadata.');
        // Records expose only snapshotted own data; absent Draft/provenance fields stay absent.
        const output = array ? [] : Object.create(null);
        active.add(value);
        for (const key of keys) {
            if (array && key === 'length') continue;
            const descriptor = descriptors[key];
            if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Unsafe Draft metadata.');
            if (array && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)) throw new Error('Invalid Draft array.');
            characters += key.length;
            if (characters > 500000) throw new Error('Draft metadata limit.');
            Object.defineProperty(output, key, { value: clone(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
        }
        active.delete(value);
        return output;
    }
    const result = clone(draft, 0);
    if (!result || !['kind', 'text', 'source'].every(key => Object.hasOwn(result, key)) || result.kind !== 'draft' || typeof result.text !== 'string' || !result.source || !Object.hasOwn(result.source, 'originalText') || typeof result.source.originalText !== 'string') throw new Error('Invalid Draft.');
    const pins = result.protectedLiterals === undefined ? [] : result.protectedLiterals;
    if (!Array.isArray(pins) || pins.length > 128 || pins.some(pin => typeof pin !== 'string' || !pin.trim() || pin.length > 2048)) throw new Error('Invalid protected literals.');
    return result;
}
