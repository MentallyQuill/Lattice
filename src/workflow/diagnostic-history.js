import {own, plain, dense, freeze, bytes, encode, successResult, errorResult, boundedText, safeError, safeBinding, safeUsage, nodeAddress, addressKey} from './record-data.js?v=0.30.0';
import {createDiagnosticStore} from './diagnostic-store.js?v=0.30.0';

export const DIAGNOSTIC_RUN_BYTES = 256 * 1024;
export const DIAGNOSTIC_TEXT_BYTES = 32 * 1024;
export const DIAGNOSTIC_USER_BYTES = 5 * 1024 * 1024;
export const DIAGNOSTIC_USER_RUNS = 50;

const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 256 || Number.isSafeInteger(value);
function scopeOf(raw) {
    if (!plain(raw) || typeof own(raw,'userId') !== 'string' || !identity(own(raw,'userId')) || !identity(own(raw,'chatId'))) return null;
    const scope = {userId:own(raw,'userId'),chatId:own(raw,'chatId')};
    for (const key of ['characterId','groupId']) {
        const value = own(raw,key);
        if (value !== null && value !== undefined && !identity(value)) return null;
        scope[key] = value ?? null;
    }
    return scope;
}
const scopeKey = scope => JSON.stringify([scope.userId,scope.chatId,scope.characterId,scope.groupId]);
function originOf(raw) {
    const scope = scopeOf(raw);
    if (!scope || !['workflowId','workflowName','runId'].every(key => typeof own(raw,key) === 'string' && identity(own(raw,key))) || !['root','target'].includes(own(raw,'mode')) || typeof own(raw,'native') !== 'boolean' || !Number.isFinite(own(raw,'startedAt')) || own(raw,'startedAt') < 0) return null;
    return freeze({...scope,workflowId:own(raw,'workflowId'),workflowName:own(raw,'workflowName'),runId:own(raw,'runId'),mode:own(raw,'mode'),native:own(raw,'native'),startedAt:own(raw,'startedAt')});
}
function diagnosticError(raw) {
    const result = safeError(raw); if (!result) return undefined;
    if (result.address && !safeAddress(result.address)) { delete result.address; delete result.nodeId; }
    if (!result.address && typeof own(raw,'nodeId') === 'string') { result.nodeId = boundedText(own(raw,'nodeId'),256); if (result.nodeId !== own(raw,'nodeId')) result.truncated = true; }
    if (result.inputPortId) { const port = boundedText(result.inputPortId,256); if (port !== result.inputPortId) result.truncated = true; result.inputPortId = port; }
    const findings = own(raw,'findings') ?? own(own(raw,'details'),'findings');
    if (Array.isArray(findings)) {
        result.findings = [];
        for (let i = 0; i < Math.min(32,own(findings,'length')); i++) {
            const finding = own(findings,String(i));
            if (!plain(finding)) continue;
            const row = {};
            for (const key of ['path','keyword','message']) {
                const value = own(finding,key); if (typeof value !== 'string') continue;
                row[key] = boundedText(value,key === 'keyword' ? 128:512);
                if (row[key] !== value) result.truncated = true;
            }
            if (Object.keys(row).length === 3) result.findings.push(row);
        }
        if (own(findings,'length') > 32) result.truncated = true;
    }
    return result;
}
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function safeAddress(raw) {
    const address = nodeAddress(raw);
    return address && [address.workflowId,address.nodeId,...address.instancePath].every(identity) ? address:null;
}
/** Prefer terminal/attempt metadata over text, findings, and older overflow rows. */
function boundRun(log, limit = DIAGNOSTIC_RUN_BYTES) {
    let total = bytes(log);
    const over = () => total > limit;
    if (!over()) return log;
    if (!log.truncated) { log.truncated = true; total += 17; }
    for (const row of log.attempts) {
        if (!over()) break;
        if (row.response?.text !== undefined) { const before = bytes(row.response); delete row.response.text; row.response.truncated = true; row.response.omitted = 'Response text omitted: run byte limit.'; total += bytes(row.response) - before; }
    }
    for (const row of log.attempts) for (const key of ['error','validationError']) {
        if (!over()) break;
        if (row[key]?.findings?.length) { const before = bytes(row[key]); row[key].findings = []; row[key].truncated = true; total += bytes(row[key]) - before; }
    }
    for (const error of [log.error,...(log.failures ?? [])]) {
        if (!over()) break;
        if (error?.findings?.length) { const before = bytes(error); error.findings = []; error.truncated = true; total += bytes(error) - before; }
    }
    for (const row of log.attempts) { if (!over()) break; if (row.binding) { total -= bytes(row.binding) + 11; delete row.binding; } }
    while (over() && log.attempts.length) total -= bytes(log.attempts.shift());
    return log;
}
function retain(entries) {
    const retained = entries.slice(-DIAGNOSTIC_USER_RUNS);
    let total = 2 + retained.reduce((sum,entry) => sum + bytes(entry) + 1,0);
    while (total > DIAGNOSTIC_USER_BYTES && retained.length) total -= bytes(retained.shift()) + 1;
    return retained;
}
function known(raw, keys) {
    if (!plain(raw)) return false;
    try { return Reflect.ownKeys(raw).every(key => { const descriptor = Object.getOwnPropertyDescriptor(raw,key); return typeof key === 'string' && keys.includes(key) && descriptor?.enumerable && Object.hasOwn(descriptor,'value'); }); } catch { return false; }
}
const textWithin = (value,limit) => typeof value === 'string' && value.length <= limit && bytes(value) <= limit;
const optional = (raw,key,valid) => own(raw,key) === undefined || valid(own(raw,key));
const bool = value => typeof value === 'boolean';
function storedAddress(raw) {
    return known(raw,['workflowId','nodeId','instancePath']) && !!safeAddress(raw);
}
function storedError(raw) {
    if (!known(raw,['code','message','truncated','address','nodeId','inputPortId','findings','details']) || !textWithin(own(raw,'code'),128) || !textWithin(own(raw,'message'),2048)) return false;
    if (!optional(raw,'truncated',bool) || !optional(raw,'address',storedAddress) || !optional(raw,'nodeId',value => textWithin(value,256)) || !optional(raw,'inputPortId',value => textWithin(value,256))) return false;
    const details = own(raw,'details');
    if (details !== undefined) {
        if (own(raw,'code') !== 'UNSUPPORTED_NATIVE_SOURCE' || !known(details,['generationType','sourceReason'])) return false;
        const admitted = safeError(raw)?.details;
        if (!admitted || own(details,'generationType') !== admitted.generationType || own(details,'sourceReason') !== admitted.sourceReason) return false;
    }
    const findings = own(raw,'findings');
    return findings === undefined || dense(findings,32) && findings.every(finding => known(finding,['path','keyword','message']) && ['path','message'].every(key => textWithin(own(finding,key),512)) && textWithin(own(finding,'keyword'),128));
}
function storedResponse(raw) {
    if (!known(raw,['visibility','actorId','text','truncated','omitted']) || !['public','actor-private','hidden'].includes(own(raw,'visibility')) || !optional(raw,'truncated',bool) || !optional(raw,'omitted',value => textWithin(value,256)) || !optional(raw,'text',value => textWithin(value,DIAGNOSTIC_TEXT_BYTES))) return false;
    const kind = own(raw,'visibility');
    if (kind === 'actor-private' && (typeof own(raw,'actorId') !== 'string' || !identity(own(raw,'actorId')))) return false;
    if (kind !== 'actor-private' && own(raw,'actorId') !== undefined) return false;
    if (kind === 'hidden' && (own(raw,'text') !== undefined || typeof own(raw,'omitted') !== 'string')) return false;
    return own(raw,'text') !== undefined || typeof own(raw,'omitted') === 'string';
}
function storedBinding(raw) {
    if (!known(raw,['role','profileId','model','fingerprint','connectionId','capability','provider','truncated'])) return false;
    for (const key of Object.keys(raw)) {
        const value = own(raw,key);
        if (key === 'truncated' ? !bool(value):key === 'capability' ? !['text-completion','typed-decision'].includes(value):key === 'provider' ? !['jev','laya','compatible'].includes(value):value === null ? !['profileId','model'].includes(key):!textWithin(value,256)) return false;
    }
    return true;
}
function storedUsage(raw) {
    if (raw === null) return true;
    const safe = safeUsage(raw);
    return plain(raw) && safe !== undefined && Reflect.ownKeys(raw).length === Object.keys(safe).length;
}
function storedAttempt(raw) {
    if (!known(raw,['address','attempt','status','startedAt','durationMs','finish','usage','binding','response','error','validationError','retry']) || !storedAddress(own(raw,'address')) || !Number.isSafeInteger(own(raw,'attempt')) || own(raw,'attempt') < 1) return false;
    if (!optional(raw,'status',value => ['running','completed','failed','cancelled'].includes(value)) || !optional(raw,'startedAt',nonnegative) || !optional(raw,'durationMs',nonnegative) || !optional(raw,'finish',value => value === null || textWithin(value,128)) || !optional(raw,'usage',storedUsage) || !optional(raw,'binding',storedBinding) || !optional(raw,'response',storedResponse) || !optional(raw,'error',storedError) || !optional(raw,'validationError',storedError)) return false;
    const retry = own(raw,'retry');
    return retry === undefined || known(retry,['reasonCode','delayMs','nextAttempt']) && ['INVALID_JSON','SCHEMA_MISMATCH','REQUEST_FAILED'].includes(own(retry,'reasonCode')) && nonnegative(own(retry,'delayMs')) && own(retry,'delayMs') <= 30000 && Number.isSafeInteger(own(retry,'nextAttempt')) && own(retry,'nextAttempt') === own(raw,'attempt') + 1;
}
function storedLog(raw,userId) {
    try {
        if (!known(raw,['version','id','origin','endedAt','status','error','failures','actualCalls','callBound','attempts','truncated']) || own(raw,'version') !== 1 || typeof own(raw,'id') !== 'string' || !identity(own(raw,'id')) || !known(own(raw,'origin'),['userId','chatId','characterId','groupId','workflowId','workflowName','runId','mode','native','startedAt'])) return null;
        const origin = originOf(own(raw,'origin')), attempts = own(raw,'attempts');
        if (!origin || origin.userId !== userId || own(raw,'id') !== origin.runId || !nonnegative(own(raw,'endedAt')) || !['completed','partial','failed','cancelled','invalid','unresolved','stale'].includes(own(raw,'status')) || !['actualCalls','callBound'].every(key => Number.isSafeInteger(own(raw,key)) && own(raw,key) >= 0) || !dense(attempts,2048) || !attempts.every(storedAttempt) || !optional(raw,'error',storedError) || !optional(raw,'failures',value => dense(value,32) && value.every(error => storedError(error) && storedAddress(own(error,'address')))) || !optional(raw,'truncated',bool) || bytes(raw) > DIAGNOSTIC_RUN_BYTES) return null;
        const keys = attempts.map(row => `${addressKey(row.address)}:${row.attempt}`); if (new Set(keys).size !== keys.length) return null;
        return freeze(JSON.parse(encode(raw)));
    } catch { return null; }
}
function storedLogs(raw,userId) {
    if (!dense(raw,10000)) return [];
    return raw.map(entry => storedLog(entry,userId)).filter(Boolean);
}

/** Isolated owner diagnostic history. Entries grant no execution or story authority. */
export function createDiagnosticHistory({store,indexedDB,onChange} = {}) {
    store ??= createDiagnosticStore({indexedDB});
    const captures = new Set(), listeners = new Set();
    let queue = Promise.resolve();
    let persistent = null, issue = '', writeFailed = false;
    const enqueue = task => { const pending = queue.then(task,task); queue = pending.catch(() => {}); return pending; };
    const notify = () => { for (const listener of [...listeners,onChange]) if (typeof listener === 'function') try { listener(); } catch {} };
    const invalid = () => errorResult('INVALID_DIAGNOSTIC_SCOPE','Select an authenticated user and exact chat.');
    const storageFailed = (write = false) => { if (write) writeFailed = true; const changed = persistent !== false; persistent = false; issue = 'Diagnostic storage is unavailable or failed. Saved logs may be incomplete.'; if (changed) notify(); return errorResult('DIAGNOSTIC_STORAGE_FAILED',issue); };
    const storageReady = (write = false) => { if (write) writeFailed = false; if (writeFailed) return; const changed = persistent !== true || issue !== ''; persistent = true; issue = ''; if (changed) notify(); };
    const history = {
        begin(raw, options) {
            const origin = originOf(raw); if (!origin) return null;
            const mode = options === undefined ? 'full':plain(options) ? own(options,'mode'):undefined;
            if (!['full','metadata'].includes(mode)) return null;
            const metadataOnly = mode === 'metadata';
            // Reserve 512 KiB for the single serialized write's bounded eviction rollback.
            const activeForUser = [...captures].filter(capture => capture.origin.userId === origin.userId);
            if (activeForUser.length >= (DIAGNOSTIC_USER_BYTES - 2 * DIAGNOSTIC_RUN_BYTES) / DIAGNOSTIC_RUN_BYTES) {
                const oldest = activeForUser[0]; oldest.omitted = 'Active diagnostic buffer limit reached.'; oldest.release();
            }
            const capture = {valid:true,origin,closed:false,pending:null,release:null,controller:new AbortController()}; captures.add(capture);
            let revision;
            try { revision = typeof store.revision === 'function' ? Promise.resolve(store.revision(origin.userId)).catch(() => null):Promise.resolve(undefined); } catch { revision = Promise.resolve(null); }
            const attempts = new Map(), bindings = new Map(), calls = new WeakSet();
            let pendingEntry = null;
            capture.release = () => { capture.valid = false; capture.controller.abort(); attempts.clear(); bindings.clear(); pendingEntry = null; captures.delete(capture); };
            let callBound = 0, actualCalls = 0, truncated = false, terminal = null;
            const bound = () => {
                // Reserve room for terminal error/result metadata, and account for pending bindings.
                while (bytes([...bindings.values()]) > 16384) { bindings.delete(bindings.keys().next().value); truncated = true; }
                const current = boundRun({attempts:[...attempts.values()]},DIAGNOSTIC_RUN_BYTES - 65536 - bytes([...bindings.values()]));
                if (current.truncated) {
                    truncated = true;
                    const retained = new Set(current.attempts);
                    for (const [key,row] of attempts) if (!retained.has(row)) attempts.delete(key);
                }
            };
            const attemptFor = (event, number = own(event,'attempt')) => {
                const address = safeAddress(own(event,'address'));
                if (!address || !Number.isSafeInteger(number) || number < 1) return null;
                const key = `${addressKey(address)}:${number}`;
                if (!attempts.has(key)) attempts.set(key,{address,attempt:number,...(bindings.has(addressKey(address))?{binding:bindings.get(addressKey(address))}:{})});
                return {key,value:attempts.get(key)};
            };
            return {
                get captureResponses() { return !metadataOnly && capture.valid && !capture.closed; },
                event(event) {
                    try {
                    if (!capture.valid || capture.closed || !plain(event)) return;
                    const type = own(event,'type');
                    if (type === 'run-settled') {
                        const status = own(event,'status');
                        if (['completed','partial','failed','cancelled','invalid','unresolved','stale'].includes(status)) terminal = {status,error:diagnosticError(own(event,'error')),address:safeAddress(own(event,'failedAddress'))};
                        return;
                    }
                    if (type === 'plan') { const count = own(own(event,'plan'),'callBound'); if (Number.isSafeInteger(count) && count >= 0) callBound = count; return; }
                    if (type === 'node-binding' || type === 'node-phase') {
                        const address = safeAddress(own(event,'address')), binding = safeBinding(own(event,'binding'));
                        if (address && binding) bindings.set(addressKey(address),binding);
                        return;
                    }
                    const found = attemptFor(event,type === 'node-retry' ? own(event,'nextAttempt') - 1:own(event,'attempt'));
                    if (!found) return;
                    const row = found.value;
                    if (type === 'request-start') {
                        if (!calls.has(row)) { calls.add(row); actualCalls++; } row.status = 'running';
                        if (nonnegative(own(event,'at'))) row.startedAt = own(event,'at');
                    } else if (type === 'request-settled') {
                        if (['completed','failed','cancelled'].includes(own(event,'status'))) row.status = own(event,'status');
                        if (own(event,'dispatched') === false) {
                            if (calls.delete(row)) actualCalls--;
                            row.response = {visibility:'hidden',omitted:'Request was not dispatched.'};
                        }
                        if (nonnegative(own(event,'durationMs'))) row.durationMs = own(event,'durationMs');
                        const error = diagnosticError(own(event,'error')); if (error) row.error = error;
                        const finish = own(event,'finish'); if (finish === null || typeof finish === 'string') row.finish = finish === null ? null:boundedText(finish,128);
                        const usage = safeUsage(own(event,'usage')); if (usage !== undefined) row.usage = usage;
                    } else if (type === 'node-retry') {
                        const reasonCode = own(event,'reasonCode'), delayMs = own(event,'delayMs');
                        if (['INVALID_JSON','SCHEMA_MISMATCH','REQUEST_FAILED'].includes(reasonCode) && nonnegative(delayMs) && delayMs <= 30000) row.retry = {reasonCode,delayMs,nextAttempt:own(event,'nextAttempt')};
                    }
                    } finally { bound(); }
                },
                model(event) {
                    try {
                    if (!capture.valid || capture.closed || !plain(event) || !['response','validation'].includes(own(event,'type'))) return;
                    const found = attemptFor(event); if (!found) return;
                    const row = found.value;
                    if (own(event,'type') === 'validation') { const error = diagnosticError(own(event,'error')); if (error) row.validationError = error; return; }
                    if (metadataOnly) {
                        // Decide before even inspecting text descriptors or response visibility.
                        row.response = {visibility:'hidden',omitted:'Response text omitted: full response logging is off.'};
                    } else {
                        const visibility = own(event,'visibility'), kind = own(visibility,'kind'), actorId = own(visibility,'actorId');
                        const allowed = kind === 'public' || kind === 'actor-private' && typeof actorId === 'string' && identity(actorId);
                        row.response = {visibility:allowed?kind:'hidden',...(kind === 'actor-private' && typeof actorId === 'string' && identity(actorId)?{actorId}:{}),...(!allowed?{omitted:kind === 'hidden'?'Hidden response text omitted.':kind === 'actor-private'?'Response text omitted: missing actor scope.':'Response text omitted: unknown visibility.'}:typeof own(event,'text') === 'string'?{text:boundedText(own(event,'text'),32768)}:{omitted:'No response text supplied.'})};
                        if (row.response.text !== undefined && row.response.text !== own(event,'text')) row.response.truncated = true;
                    }
                    const error = diagnosticError(own(event,'error')); if (error) row.error = error;
                    const finish = own(event,'finish'); if (finish === null || typeof finish === 'string') row.finish = finish === null ? null:boundedText(finish,128);
                    const usage = safeUsage(own(event,'usage')); if (usage !== undefined) row.usage = usage;
                    } finally { bound(); }
                },
                finish(result) {
                    if (capture.pending) return capture.pending;
                    if (!capture.valid) return Promise.resolve(successResult({discarded:true,...(capture.omitted?{omitted:capture.omitted}:{})}));
                    capture.closed = true;
                    for (const key of ['actualCalls','callBound']) {
                        const value = own(result,key);
                        if (Number.isSafeInteger(value) && value >= 0) {
                            if (key === 'actualCalls') actualCalls = value; else callBound = value;
                        }
                    }
                    const error = diagnosticError(own(result,'error')) ?? terminal?.error;
                    if (error && !error.address && terminal?.address) { error.address = terminal.address; error.nodeId = terminal.address.nodeId; }
                    const status = terminal?.status ?? (own(result,'ok') === true ? own(result,'recovered') === true ? 'partial':'completed':error?.code === 'ABORTED' ? 'cancelled':'failed');
                    if (metadataOnly && (own(result,'superseded') === true || !['partial','failed','invalid','unresolved'].includes(status))) {
                        capture.release();
                        return capture.pending = Promise.resolve(successResult({discarded:true}));
                    }
                    const rawFailures = own(result,'failures'), failures = [];
                    if (Array.isArray(rawFailures)) for (let index = 0; index < Math.min(32,own(rawFailures,'length')); index++) {
                        const failure = diagnosticError(own(rawFailures,String(index)));
                        if (failure?.address) failures.push(failure);
                    }
                    if (Array.isArray(rawFailures) && own(rawFailures,'length') > 32) truncated = true;
                    pendingEntry = freeze(boundRun({version:1,id:origin.runId,origin,endedAt:Date.now(),status,...(error?{error}:{}),...(failures.length?{failures}:{}),actualCalls,callBound,attempts:[...attempts.values()],...(truncated?{truncated:true}:{})}));
                    attempts.clear(); bindings.clear();
                    capture.pending = enqueue(async () => {
                        const discarded = () => successResult({discarded:true,...(capture.omitted?{omitted:capture.omitted}:{})});
                        if (!capture.valid) return discarded();
                        const startedRevision = await revision;
                        if (!capture.valid) return discarded();
                        if (startedRevision === null) throw new Error('Diagnostic storage failed.');
                        // Retain only scalar write identity for adapters that cannot abort a copied commit.
                        let marker = null, priorMatches = 0, evicted = [];
                        const matches = entry => marker && entry.id === marker.id && entry.endedAt === marker.endedAt && entry.status === marker.status && entry.actualCalls === marker.actualCalls && entry.callBound === marker.callBound && scopeKey(entry.origin) === scopeKey(origin) && entry.origin.workflowId === origin.workflowId && entry.origin.runId === origin.runId && entry.origin.startedAt === origin.startedAt;
                        try {
                            await store.update(origin.userId, (entries,context) => {
                                const previous = retain(storedLogs(entries,origin.userId));
                                if (!capture.valid || !pendingEntry || context?.wasClearedSince(scopeKey(origin),startedRevision)) return previous;
                                const next = retain([...previous,pendingEntry]);
                                evicted = previous.slice(0,previous.length + 1 - next.length);
                                if (bytes(evicted) > 2 * DIAGNOSTIC_RUN_BYTES) {
                                    capture.omitted = 'Diagnostic retention rollback buffer limit reached.'; evicted = []; return previous;
                                }
                                marker = {id:pendingEntry.id,endedAt:pendingEntry.endedAt,status:pendingEntry.status,actualCalls:pendingEntry.actualCalls,callBound:pendingEntry.callBound};
                                priorMatches = previous.filter(matches).length;
                                return next;
                            },{signal:capture.controller.signal});
                        } catch (error) {
                            if (!capture.valid && error?.name === 'AbortError') return discarded();
                            throw error;
                        }
                        if (!capture.valid && marker) {
                            await store.update(origin.userId, (entries,context) => {
                                const current = storedLogs(entries,origin.userId), matching = [];
                                for (let index = 0; index < current.length; index++) if (matches(current[index])) matching.push(index);
                                if (matching.length > priorMatches) current.splice(matching.at(-1),1);
                                const restore = evicted.filter(entry => !context?.wasClearedSince(scopeKey(entry.origin),startedRevision) && !current.some(existing => existing.id === entry.id && existing.endedAt === entry.endedAt && scopeKey(existing.origin) === scopeKey(entry.origin)));
                                // Later completed entries keep retention priority over restored older entries.
                                return retain([...restore,...current]);
                            });
                        }
                        if (!capture.valid || !marker) return discarded();
                        storageReady(true); notify(); return successResult({});
                    }).catch(() => storageFailed(true)).finally(capture.release);
                    return capture.pending;
                },
                discard() { capture.release(); },
            };
        },
        async list(raw) {
            const scope = scopeOf(raw); if (!scope) return invalid();
            await queue;
            try {
                const entries = await store.read(scope.userId); storageReady();
                return successResult({entries:retain(storedLogs(entries,scope.userId)).filter(entry => scopeKey(entry.origin) === scopeKey(scope)).sort((a,b) => b.endedAt-a.endedAt)});
            } catch { return storageFailed(); }
        },
        clear(raw) {
            const scope = scopeOf(raw); if (!scope) return Promise.resolve(invalid());
            for (const capture of captures) if (scopeKey(capture.origin) === scopeKey(scope)) capture.release();
            return enqueue(async () => {
                await store.update(scope.userId, (entries,context) => { context?.clear(scopeKey(scope)); return storedLogs(entries,scope.userId).filter(entry => scopeKey(entry.origin) !== scopeKey(scope)); });
                storageReady(true); notify(); return successResult({});
            }).catch(() => storageFailed(true));
        },
        async export(raw) {
            const scope = scopeOf(raw); if (!scope) return invalid();
            const result = await history.list(scope); if (!result.ok) return result;
            return successResult({text:encode({version:1,scope,entries:result.data.entries}),fileName:`lattice-diagnostics-${new Date().toISOString().slice(0,10)}.json`});
        },
        discardActive() { for (const capture of captures) capture.release(); },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        status() { return {persistent,issue}; },
    };
    return history;
}
