import { applyStateProposal, createActorState, fail, freeze, makeRecord, ownData, parseRecord, validateEvidence } from './contracts.js?v=0.27.3';

const good = data => ({ ok: true, data });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const version = value => Number.isSafeInteger(value) && value >= 0;
const exact = (value, allowed, required = allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key));
const sourceKey = ref => JSON.stringify([ref.id, ref.revision]);
const sourceList = record => record.payload.events.map(({ id, revision }) => ({ id, revision }));
const artifact = value => freeze({ kind: 'data', value });

// Sort only bounded, already owned JSON data; no host hooks are invoked.
function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function fields(value, allowed, required = []) {
    try {
        if (!plain(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail('INVALID_MEMORY_CONFIG', 'Options must be a plain object.');
        const descriptors = Object.getOwnPropertyDescriptors(value);
        if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) || required.some(key => !Object.hasOwn(descriptors, key))) return fail('INVALID_MEMORY_CONFIG', 'Options require known own data fields.');
        return good(Object.fromEntries(Object.entries(descriptors).map(([key, property]) => [key, property.value])));
    } catch { return fail('INVALID_MEMORY_CONFIG', 'Options could not be inspected.'); }
}

function scopeMatches(record, config) {
    return record.scope.chatId === config.scope.chatId && record.scope.actorId === config.scope.actorId && record.store.id === config.storeId;
}

function scopedRecord(data, type, config) {
    const parsed = parseRecord(data, type);
    if (!parsed.ok) return parsed;
    return scopeMatches(parsed.data, config) ? parsed : fail('SCOPE_MISMATCH', 'Record belongs to another chat, actor or store.');
}

function receiptList(receipts, stateVersion) {
    if (!Array.isArray(receipts) || receipts.length > 64) return fail('INVALID_MEMORY_RECEIPTS', 'Receipts must be a bounded array.');
    const keys = new Set();
    for (const receipt of receipts) {
        if (!exact(receipt, ['key', 'fingerprint', 'version']) || !id(receipt.key) || typeof receipt.fingerprint !== 'string' || !receipt.fingerprint.length || receipt.fingerprint.length > 262144 || !version(receipt.version) || receipt.version < 1 || receipt.version > stateVersion || keys.has(receipt.key)) return fail('INVALID_MEMORY_RECEIPTS', 'Receipt identity, fingerprint or committed version is invalid.');
        keys.add(receipt.key);
    }
    return good(freeze(receipts));
}

function snapshot(data, config) {
    const owned = ownData(data);
    if (!owned.ok) return owned;
    if (!exact(owned.data, ['state', 'receipts'])) return fail('INVALID_MEMORY_SNAPSHOT', 'A snapshot requires state and receipts.');
    const state = scopedRecord(owned.data.state, 'actor-state', config);
    if (!state.ok) return state;
    const receipts = receiptList(owned.data.receipts, state.data.store.version);
    return receipts.ok ? good(freeze({ state: artifact(state.data), receipts: receipts.data })) : receipts;
}

function portResult(raw) {
    const inspected = fields(raw, ['ok', 'data', 'error'], ['ok']);
    if (!inspected.ok) return fail('INVALID_MEMORY_BACKEND_RESULT', 'Backend must return a plain Result.');
    const value = inspected.data;
    if (value.ok === false) {
        const error = ownData(value.error);
        if (!error.ok || !exact(error.data, ['code', 'message']) || !id(error.data.code) || typeof error.data.message !== 'string' || error.data.message.length > 4096 || Object.hasOwn(value, 'data')) return fail('INVALID_MEMORY_BACKEND_RESULT', 'Backend failure is malformed.');
        return fail(error.data.code, error.data.message);
    }
    if (value.ok !== true || Object.hasOwn(value, 'error')) return fail('INVALID_MEMORY_BACKEND_RESULT', 'Backend success is malformed.');
    if (value.data === undefined) return good(undefined);
    const data = ownData(value.data);
    return data.ok ? good(data.data) : data;
}

async function invoke(port, ...args) {
    try { return portResult(await port(...args)); }
    catch { return fail('MEMORY_BACKEND_FAILED', 'The memory backend operation failed.'); }
}

function configuration(options) {
    const input = fields(options, ['scope', 'storeId', 'load', 'compareAndSwap', 'readEvents', 'validateSources'], ['scope', 'storeId', 'load', 'compareAndSwap', 'readEvents', 'validateSources']);
    if (!input.ok) return input;
    const config = input.data;
    const initial = createActorState(config.scope, { id: config.storeId, version: 0 });
    if (!initial.ok || ['load', 'compareAndSwap', 'readEvents', 'validateSources'].some(key => typeof config[key] !== 'function')) return fail('INVALID_MEMORY_CONFIG', 'Memory requires a valid scope, store and explicit backend ports.');
    return good({ ...config, scope: initial.data.value.scope });
}

function controls(options) {
    const checked = fields(options, ['signal', 'preview', 'dryRun', 'root']);
    if (!checked.ok) return checked;
    const value = checked.data;
    if (['preview', 'dryRun', 'root'].some(key => Object.hasOwn(value, key) && typeof value[key] !== 'boolean')) return fail('INVALID_MEMORY_CONTROLS', 'Commit lifecycle flags must be booleans.');
    try {
        if (value.signal !== undefined) Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get.call(value.signal);
    } catch { return fail('INVALID_MEMORY_CONTROLS', 'Cancellation requires an AbortSignal.'); }
    return good(value);
}

const cancelled = options => options.signal !== undefined && Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get.call(options.signal);
const cancellation = options => cancelled(options) ? fail('CANCELLED', 'Memory commit was cancelled before persistence.') : null;

function casControls(options) {
    const inspected = fields(options, ['signal', 'sourceRefs']); if (!inspected.ok) return inspected;
    const flags = controls({ signal: inspected.data.signal }); if (!flags.ok) return flags;
    if (inspected.data.sourceRefs === undefined) return flags;
    const refs = ownData(inspected.data.sourceRefs); if (!refs.ok) return refs;
    const checked = validateEvidence(refs.data, refs.data); if (!checked.ok) return checked;
    return good({ ...flags.data, sourceRefs: freeze(refs.data) });
}

function invalidationReports(state, events) {
    const current = new Set(sourceList(events).map(sourceKey));
    const missing = state.sourceRefs.filter(ref => !current.has(sourceKey(ref)));
    return missing.length ? [freeze({ code: 'INVALIDATED_SOURCES', message: 'Stored historical evidence has changed or no longer exists; explicit reconciliation is required.', sourceRefs: missing })] : [];
}

function episodeArtifact(state, episodes) {
    const refs = [...new Map(episodes.flatMap(item => item.sourceRefs).map(ref => [sourceKey(ref), ref])).values()];
    return makeRecord('episodes', state, { episodes }, refs);
}

/** The only write operation is a serialized, explicit root commit. */
export function createMemoryService(options) {
    const configured = configuration(options);
    let queue = Promise.resolve();
    const uncertain = new Map();
    const config = configured.ok ? configured.data : null;
    const load = async () => {
        const result = await invoke(config.load);
        return result.ok ? snapshot(result.data, config) : result;
    };
    const readEvents = async () => {
        const result = await invoke(config.readEvents);
        return result.ok ? scopedRecord(result.data, 'events', config) : result;
    };

    async function read(settings = {}) {
        if (!configured.ok) return configured;
        const checked = ownData(settings);
        if (!checked.ok) return checked;
        if (!exact(checked.data, ['view'], []) || !['state', 'events', 'episodes'].includes(checked.data.view ?? 'state')) return fail('INVALID_MEMORY_READ', 'Memory view must be state, events or episodes.');
        const current = await load();
        if (!current.ok) return current;
        // load is parsed and detached before the next host await.
        const material = await readEvents();
        if (!material.ok) return material;
        const view = checked.data.view ?? 'state';
        const reports = invalidationReports(current.data.state.value, material.data);
        if (view === 'events') {
            // Event revisions identify evidence independently of the actor-state CAS version.
            // Bind the read envelope to this loaded state without changing event provenance.
            const events = makeRecord('events', { ...material.data, store: { ...material.data.store, version: current.data.state.value.store.version } }, material.data.payload, material.data.sourceRefs);
            return events.ok ? { ok: true, artifact: events.data, reports: [] } : events;
        }
        if (view === 'state') return { ok: true, artifact: current.data.state, reports };
        const result = episodeArtifact(current.data.state.value, current.data.state.value.payload.episodes);
        return result.ok ? { ok: true, artifact: result.data, reports } : result;
    }

    async function recall(settings = {}) {
        if (!configured.ok) return configured;
        const checked = ownData(settings);
        if (!checked.ok) return checked;
        if (!exact(checked.data, ['query', 'limit'], ['query']) || typeof checked.data.query !== 'string' || checked.data.query.length > 4096 || !Number.isInteger(checked.data.limit ?? 8) || (checked.data.limit ?? 8) < 1 || (checked.data.limit ?? 8) > 64) return fail('INVALID_MEMORY_RECALL', 'Recall requires bounded query text and a limit from 1 to 64.');
        const current = await read({ view: 'state' });
        if (!current.ok) return current;
        const terms = [...new Set(checked.data.query.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? [])];
        const episodes = current.artifact.value.payload.episodes.map((entry, index) => {
            const words = new Set(entry.text.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? []);
            return { entry, index, score: terms.filter(term => words.has(term)).length };
        }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, checked.data.limit ?? 8).map(entry => entry.entry);
        const result = episodeArtifact(current.artifact.value, episodes);
        return result.ok ? { ok: true, artifact: result.data, reports: current.reports } : result;
    }

    function replay(current, key, fingerprint) {
        for (const [pendingKey, pendingFingerprint] of uncertain) {
            if (current.receipts.some(receipt => receipt.key === pendingKey && receipt.fingerprint === pendingFingerprint)) uncertain.delete(pendingKey);
        }
        const receipt = current.receipts.find(receipt => receipt.key === key);
        if (receipt) {
            if (receipt.fingerprint !== fingerprint) return fail('IDEMPOTENCY_CONFLICT', 'The idempotency key was used for different content.');
            uncertain.delete(key);
            return good({ applied: false, acknowledged: true, state: current.state, version: current.state.value.store.version });
        }
        if (uncertain.has(key)) return uncertain.get(key) === fingerprint ? fail('PERSISTENCE_UNKNOWN', 'The prior save outcome is unknown; confirm persistence before another write.') : fail('IDEMPOTENCY_CONFLICT', 'The idempotency key has an unresolved save for different content.');
        if (uncertain.size) return fail('PERSISTENCE_UNKNOWN', 'A prior save outcome remains unknown; confirm its receipt before another write.');
        return null;
    }

    async function settle(intent, flags, preflightOnly=false) {
        const before = cancellation(flags); if (before) return before;
        const key = intent.payload.idempotencyKey, fingerprint = canonical(intent);
        const first = await load(); if (!first.ok) return first;
        const replayed = replay(first.data, key, fingerprint); if (replayed) return replayed;
        if (first.data.state.value.store.version !== intent.store.version) return fail('STALE_VERSION', 'Commit prior version no longer matches the store.');
        const material = await readEvents(); if (!material.ok) return material;
        const evidence = validateEvidence(intent.sourceRefs, sourceList(material.data)); if (!evidence.ok) return evidence;
        const valid = await invoke(config.validateSources, intent.sourceRefs); if (!valid.ok) return valid;
        if (valid.data !== undefined) return fail('INVALID_MEMORY_BACKEND_RESULT', 'Source validation must return Result<void>.');
        const stopped = cancellation(flags); if (stopped) return stopped;
        // Re-read the store and current settled events after awaited validation.
        const latest = await load(); if (!latest.ok) return latest;
        const lastReplay = replay(latest.data, key, fingerprint); if (lastReplay) return lastReplay;
        if (latest.data.state.value.store.version !== intent.store.version) return fail('STALE_VERSION', 'The store changed during evidence validation.');
        if (canonical(latest.data.state.value) !== canonical(first.data.state.value)) return fail('STALE_VERSION', 'State content changed without advancing its version.');
        const revalidated = await invoke(config.validateSources, intent.sourceRefs); if (!revalidated.ok) return revalidated;
        if (revalidated.data !== undefined) return fail('INVALID_MEMORY_BACKEND_RESULT', 'Source validation must return Result<void>.');
        const currentEvents = await readEvents(); if (!currentEvents.ok) return currentEvents;
        const currentEvidence = validateEvidence(intent.sourceRefs, sourceList(currentEvents.data)); if (!currentEvidence.ok) return currentEvidence;
        for (const track of Object.values(intent.payload.proposal.payload.tracks)) {
            if (track.eventIds.some(id => !currentEvents.data.payload.events.some(event => event.id === id) || !intent.payload.proposal.sourceRefs.some(ref => ref.id === id))) return fail('INVALID_INTROSPECTION_EVIDENCE', 'Proposal tracks require current settled event provenance.');
        }
        const reduced = applyStateProposal(latest.data.state, artifact(intent.payload.proposal)); if (!reduced.ok) return reduced;
        if (intent.store.version === Number.MAX_SAFE_INTEGER) return fail('VERSION_LIMIT', 'The next store version exceeds the safe integer limit.');
        if (latest.data.receipts.length >= 64) return fail('RECEIPT_LIMIT', 'Receipt capacity requires explicit host reconciliation.');
        const next = makeRecord('actor-state', { ...reduced.data.value, store: { id: config.storeId, version: intent.store.version + 1 } }, reduced.data.value.payload);
        if (!next.ok) return next;
        const lastStop = cancellation(flags); if (lastStop) return lastStop;
        const receipt = freeze({ key, fingerprint, version: next.data.value.store.version });
        if(preflightOnly)return good({applied:false,acknowledged:false,version:intent.store.version,preflight:true});
        // CAS is called once. The adapter owns the final atomic version/scope check.
        const saved = await invoke(config.compareAndSwap, { expectedVersion: intent.store.version, state: next.data, receipt }, { signal: flags.signal, sourceRefs: intent.sourceRefs });
        if (!saved.ok) {
            if (saved.error.code === 'MEMORY_BACKEND_FAILED') {
                uncertain.set(key, fingerprint);
                return good({ applied: true, acknowledged: false, state: next.data, version: receipt.version });
            }
            if (saved.error.code === 'INVALID_MEMORY_BACKEND_RESULT' || saved.error.code === 'INVALID_JSON_VALUE' || saved.error.code === 'INVALID_INTROSPECTION_RECORD') uncertain.set(key, fingerprint);
            return saved;
        }
        if (!exact(saved.data, ['acknowledged']) || typeof saved.data.acknowledged !== 'boolean') {
            uncertain.set(key, fingerprint);
            return fail('INVALID_MEMORY_BACKEND_RESULT', 'CAS must explicitly report acknowledgement.');
        }
        if (!saved.data.acknowledged) uncertain.set(key, fingerprint);
        return good({ applied: true, acknowledged: saved.data.acknowledged, state: next.data, version: receipt.version });
    }

    function commit(data, options = {}) {
        if (!configured.ok) return Promise.resolve(configured);
        const flags = controls(options); if (!flags.ok) return Promise.resolve(flags);
        const checked = scopedRecord(data, 'commit-intent', config); if (!checked.ok) return Promise.resolve(checked);
        if (checked.data.payload.proposal.payload.changes.some(change => change.op === 'upsert' && change.item.classification === 'observation' && change.item.sourceRefs.length === 0)) return Promise.resolve(fail('INVALID_INTROSPECTION_EVIDENCE', 'Committed factual observations require explicit settled-event provenance.'));
        if (flags.data.root !== true) return Promise.resolve(fail('ROOT_REQUIRED', 'Only explicit root settlement may commit memory.'));
        if (flags.data.preview === true || flags.data.dryRun === true) return Promise.resolve(fail('COMMIT_DISABLED', 'Preview and dry-run execution cannot commit memory.'));
        const pending = queue.then(() => settle(checked.data, flags.data)).catch(() => fail('MEMORY_BACKEND_FAILED', 'Memory settlement could not complete.'));
        queue = pending.then(() => undefined, () => undefined);
        return pending;
    }

    async function preflight(data, options={}) {
        if(!configured.ok)return configured;
        const flags=controls(options);if(!flags.ok)return flags;
        const checked=scopedRecord(data,'commit-intent',config);if(!checked.ok)return checked;
        if(checked.data.payload.proposal.payload.changes.some(change=>change.op==='upsert'&&change.item.classification==='observation'&&change.item.sourceRefs.length===0))return fail('INVALID_INTROSPECTION_EVIDENCE','Committed factual observations require explicit settled-event provenance.');
        const result=await settle(checked.data,flags.data,true);
        return result.ok?good({status:result.data.preflight?'ready':'unchanged',version:result.data.version}):result;
    }
    return Object.freeze({ read, recall, commit, preflight });
}

function casInput(input, config, current) {
    const owned = ownData(input); if (!owned.ok) return owned;
    if (!exact(owned.data, ['expectedVersion', 'state', 'receipt']) || !version(owned.data.expectedVersion)) return fail('INVALID_MEMORY_CAS', 'CAS requires a prior version, state and receipt.');
    const state = scopedRecord(owned.data.state, 'actor-state', config); if (!state.ok) return state;
    if (current.state.value.store.version !== owned.data.expectedVersion) return fail('STALE_VERSION', 'The compare-and-swap prior version has changed.');
    if (state.data.store.version !== owned.data.expectedVersion + 1 || owned.data.receipt?.version !== state.data.store.version) return fail('INVALID_MEMORY_CAS', 'CAS state and receipt must advance exactly one version.');
    const checked = snapshot({ state: artifact(state.data), receipts: [...current.receipts, owned.data.receipt] }, config);
    return checked;
}

/** Detached local storage for deterministic execution; a callback supplies current events. */
export function createInMemoryBackend(initialState, events) {
    const parsed = parseRecord(initialState, 'actor-state');
    const config = parsed.ok ? { scope: parsed.data.scope, storeId: parsed.data.store.id } : { scope: { chatId: '', actorId: '' }, storeId: '' };
    let current = parsed.ok ? snapshot({ state: artifact(parsed.data), receipts: [] }, config) : parsed;
    const fixedEvents = typeof events === 'function' ? null : ownData(events);
    const readEvents = async () => {
        if (!parsed.ok) return parsed;
        let result;
        try {
            if (typeof events === 'function') result = ownData(await events());
            else result = fixedEvents;
        } catch { return fail('MEMORY_BACKEND_FAILED', 'Current events could not be read.'); }
        if (!result.ok) return result;
        const checked = scopedRecord(result.data, 'events', config);
        return checked.ok ? good(artifact(checked.data)) : checked;
    };
    return {
        ...config,
        load: async () => current.ok ? snapshot(current.data, config) : current,
        readEvents,
        validateSources: async refs => {
            const material = await readEvents();
            return material.ok ? validateEvidence(refs, sourceList(material.data.value)) : material;
        },
        compareAndSwap: async (input, options = {}) => {
            if (!current.ok) return current;
            const owned = ownData(input); if (!owned.ok) return owned;
            const flags = casControls(options); if (!flags.ok) return flags;
            if (flags.data.sourceRefs !== undefined) {
                const material = await readEvents(); if (!material.ok) return material;
                const evidence = validateEvidence(flags.data.sourceRefs, sourceList(material.data.value)); if (!evidence.ok) return evidence;
            }
            const checked = casInput(owned.data, config, current.data);
            if (!checked.ok) return checked;
            const stopped = cancellation(flags.data); if (stopped) return stopped;
            current = checked;
            return good({ acknowledged: true });
        },
    };
}

/** Explicit host adapter. Construction never reads context or writes metadata. */
export function createChatMetadataBackend(options) {
    const input = fields(options, ['scope', 'storeId', 'getContext', 'saveMetadata', 'readEvents', 'validateSources', 'initialState'], ['scope', 'storeId', 'getContext', 'saveMetadata', 'readEvents', 'validateSources']);
    const checked = input.ok ? createActorState(input.data.scope, { id: input.data.storeId, version: 0 }) : input;
    const config = checked.ok ? { scope: checked.data.value.scope, storeId: checked.data.value.store.id } : { scope: { chatId: '', actorId: '' }, storeId: '' };
    const ports = input.ok ? input.data : {};
    const valid = input.ok && checked.ok && ['getContext', 'saveMetadata', 'readEvents', 'validateSources'].every(key => typeof ports[key] === 'function') && !['__proto__', 'prototype', 'constructor'].includes(config.storeId) && !['__proto__', 'prototype', 'constructor'].includes(config.scope.actorId);
    const initial = valid && ports.initialState !== undefined ? scopedRecord(ports.initialState, 'actor-state', config) : checked.ok ? good(checked.data.value) : checked;
    let queue = Promise.resolve();
    const uncertain = new Map();

    async function context() {
        if (!valid || !initial.ok) return fail('INVALID_MEMORY_CONFIG', 'Metadata storage requires explicit scoped host ports.');
        let raw;
        try { raw = await ports.getContext(); }
        catch { return fail('MEMORY_BACKEND_FAILED', 'Chat context could not be read.'); }
        const owned = ownData(raw); if (!owned.ok) return owned;
        if (!exact(owned.data, ['chatId', 'chatMetadata']) || !id(owned.data.chatId) || !plain(owned.data.chatMetadata)) return fail('INVALID_MEMORY_CONTEXT', 'Chat context requires chat identity and plain metadata.');
        return owned.data.chatId === config.scope.chatId ? owned : fail('SCOPE_MISMATCH', 'The active chat changed before memory persistence.');
    }

    function stored(host) {
        const namespace = host.chatMetadata.latticeIntrospection;
        if (namespace === undefined) return snapshot({ state: artifact(initial.data), receipts: [] }, config);
        if (!plain(namespace)) return fail('INVALID_MEMORY_METADATA', 'Introspection metadata namespace is malformed.');
        const store = namespace[config.storeId];
        if (store === undefined) return snapshot({ state: artifact(initial.data), receipts: [] }, config);
        if (!plain(store)) return fail('INVALID_MEMORY_METADATA', 'Introspection store metadata is malformed.');
        const actor = store[config.scope.actorId];
        return actor === undefined ? snapshot({ state: artifact(initial.data), receipts: [] }, config) : snapshot(actor, config);
    }

    async function compareAndSwap(input, flags) {
        const host = await context(); if (!host.ok) return host;
        const current = stored(host.data); if (!current.ok) return current;
        const candidate = casInput(input, config, current.data); if (!candidate.ok) return candidate;
        // A second context read catches chat/version changes while host reads awaited.
        const latestHost = await context(); if (!latestHost.ok) return latestHost;
        const latest = stored(latestHost.data); if (!latest.ok) return latest;
        const finalCandidate = casInput(input, config, latest.data); if (!finalCandidate.ok) return finalCandidate;
        if (canonical(latest.data) !== canonical(current.data)) return fail('STALE_VERSION', 'Metadata changed during compare-and-swap.');
        for (const [key, fingerprint] of uncertain) {
            if (latest.data.receipts.some(receipt => receipt.key === key && receipt.fingerprint === fingerprint)) uncertain.delete(key);
        }
        if (uncertain.has(input.receipt.key) && uncertain.get(input.receipt.key) !== input.receipt.fingerprint) return fail('IDEMPOTENCY_CONFLICT', 'The idempotency key has an unresolved save for different content.');
        if (uncertain.size) return fail('PERSISTENCE_UNKNOWN', 'The previous metadata save remains unconfirmed; no further save is authorized.');
        const stopped = cancellation(flags); if (stopped) return stopped;
        let nextHost = latestHost.data;
        if (flags.sourceRefs !== undefined) {
            const verified = await invoke(ports.validateSources, flags.sourceRefs); if (!verified.ok) return verified;
            if (verified.data !== undefined) return fail('INVALID_MEMORY_BACKEND_RESULT', 'Source validation must return Result<void>.');
            // Capture active context and event evidence together after source-validation awaits.
            const [finalHost, material] = await Promise.all([context(), invoke(ports.readEvents)]);
            if (!finalHost.ok) return finalHost;
            if (!material.ok) return material;
            const events = scopedRecord(material.data, 'events', config); if (!events.ok) return events;
            const evidence = validateEvidence(flags.sourceRefs, sourceList(events.data)); if (!evidence.ok) return evidence;
            const current = stored(finalHost.data); if (!current.ok) return current;
            const checked = casInput(input, config, current.data); if (!checked.ok) return checked;
            if (canonical(current.data) !== canonical(latest.data)) return fail('STALE_VERSION', 'Metadata changed during source revalidation.');
            nextHost = finalHost.data;
        }
        const finalStop = cancellation(flags); if (finalStop) return finalStop;
        nextHost.chatMetadata.latticeIntrospection ??= {};
        nextHost.chatMetadata.latticeIntrospection[config.storeId] ??= {};
        nextHost.chatMetadata.latticeIntrospection[config.storeId][config.scope.actorId] = finalCandidate.data;
        const safe = ownData(nextHost); if (!safe.ok) return safe;
        try {
            const acknowledged = await ports.saveMetadata(safe.data) === true;
            if (!acknowledged) uncertain.set(input.receipt.key, input.receipt.fingerprint);
            return good({ acknowledged });
        } catch {
            uncertain.set(input.receipt.key, input.receipt.fingerprint);
            return good({ acknowledged: false });
        }
    }

    return {
        ...config,
        load: async () => { const host = await context(); return host.ok ? stored(host.data) : host; },
        readEvents: async () => {
            const host = await context(); if (!host.ok) return host;
            const material = await invoke(ports.readEvents); if (!material.ok) return material;
            const current = await context(); if (!current.ok) return current;
            const checked = scopedRecord(material.data, 'events', config);
            return checked.ok ? good(artifact(checked.data)) : checked;
        },
        validateSources: async refs => {
            const host = await context(); if (!host.ok) return host;
            const checked = await invoke(ports.validateSources, refs); if (!checked.ok) return checked;
            const current = await context();
            return current.ok ? checked : current;
        },
        compareAndSwap: (input, options = {}) => {
            const owned = ownData(input);
            if (!owned.ok) return Promise.resolve(owned);
            const flags = casControls(options); if (!flags.ok) return Promise.resolve(flags);
            const pending = queue.then(() => compareAndSwap(owned.data, flags.data));
            queue = pending.then(() => undefined, () => undefined);
            return pending;
        },
    };
}
