import {own, plain, dense, bytes} from './record-data.js?v=0.29.1';

const DATABASE = 'sillycanvas-owner-diagnostics';
const USERS = 'users';
const failure = () => new Error('Diagnostic storage is unavailable or failed.');
const cancelled = () => { const error = new Error('Diagnostic write discarded.'); error.name = 'AbortError'; return error; };
function metadata(raw) {
    const revision = own(raw,'revision'), floor = own(raw,'floor'), rows = own(raw,'clears');
    if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(floor) || floor < 0 || floor > revision || !dense(rows,128)) return {revision:0,floor:0,clears:[]};
    const clears = [];
    for (const row of rows) {
        if (!dense(row,2) || row.length !== 2 || typeof own(row,'0') !== 'string' || own(row,'0').length > 8192 || !Number.isSafeInteger(own(row,'1')) || own(row,'1') < 0 || own(row,'1') > revision) return {revision:0,floor:0,clears:[]};
        clears.push([own(row,'0'),own(row,'1')]);
    }
    return {revision,floor,clears};
}

/** A single user envelope is read and replaced inside the same IndexedDB transaction. */
export function createDiagnosticStore({indexedDB = globalThis.indexedDB} = {}) {
    let opening = null, persistent = null, issue = '';
    const failed = () => { persistent = false; issue = failure().message; };
    const ready = () => { persistent = true; issue = ''; };
    const open = () => {
        if (opening) return opening;
        opening = new Promise((resolve,reject) => {
            if (!indexedDB || typeof indexedDB.open !== 'function') { reject(failure()); return; }
            let request, rejected = false;
            try { request = indexedDB.open(DATABASE,1); } catch { reject(failure()); return; }
            request.onupgradeneeded = () => {
                try { if (!request.result.objectStoreNames.contains(USERS)) request.result.createObjectStore(USERS); } catch { try { request.transaction.abort(); } catch {} }
            };
            request.onerror = () => reject(failure());
            request.onblocked = () => { rejected = true; reject(failure()); };
            request.onsuccess = () => {
                const database = request.result;
                if (rejected) { database.close(); return; }
                database.onversionchange = () => { database.close(); opening = null; };
                resolve(database);
            };
        }).catch(() => { opening = null; failed(); throw failure(); });
        return opening;
    };
    const transact = async (userId,transform,revisionOnly = false,signal) => {
        if (typeof userId !== 'string' || !userId || userId.length > 256) throw failure();
        if (signal?.aborted) throw cancelled();
        try {
            const database = await open();
            if (signal?.aborted) throw cancelled();
            const result = await new Promise((resolve,reject) => {
                let transaction, next, settled = false;
                try { transaction = database.transaction(USERS,transform?'readwrite':'readonly'); } catch { reject(failure()); return; }
                const cancel = () => { try { transaction.abort(); } catch {} };
                const settle = (callback,value) => { if (settled) return; settled = true; signal?.removeEventListener('abort',cancel); callback(value); };
                transaction.oncomplete = () => settle(resolve,next);
                transaction.onabort = transaction.onerror = () => settle(reject,signal?.aborted?cancelled():failure());
                signal?.addEventListener('abort',cancel,{once:true});
                if (signal?.aborted) { cancel(); return; }
                try {
                    const objectStore = transaction.objectStore(USERS), request = objectStore.get(userId);
                    request.onerror = () => { try { transaction.abort(); } catch { settle(reject,failure()); } };
                    request.onsuccess = () => {
                        try {
                            const raw = request.result;
                            const entries = plain(raw) && own(raw,'version') === 1 && dense(own(raw,'entries'),10000) ? own(raw,'entries'):[];
                            const meta = metadata(raw);
                            const context = {
                                revision:meta.revision,
                                wasClearedSince(scope,revision) { return revision < meta.floor || (meta.clears.find(row => row[0] === scope)?.[1] ?? 0) > revision; },
                                clear(scope) {
                                    if (typeof scope !== 'string' || scope.length > 8192 || meta.revision >= Number.MAX_SAFE_INTEGER) throw failure();
                                    meta.revision++;
                                    meta.clears = meta.clears.filter(row => row[0] !== scope);
                                    meta.clears.push([scope,meta.revision]);
                                    // A compact floor revokes very old captures when barrier metadata is evicted.
                                    if (meta.clears.length > 128) meta.floor = Math.max(meta.floor,meta.clears.shift()[1]);
                                },
                            };
                            next = transform ? transform(entries,context):revisionOnly?meta.revision:entries;
                            if (!revisionOnly && !dense(next,10000)) throw failure();
                            if (transform) {
                                const envelope = {version:1,entries:next,...meta};
                                let total = bytes(envelope);
                                next = next.slice(); envelope.entries = next;
                                while (total > 5 * 1024 * 1024 && next.length) total -= bytes(next.shift());
                                if (total > 5 * 1024 * 1024) throw failure();
                                objectStore.put(envelope,userId);
                            }
                        } catch { try { transaction.abort(); } catch {} settle(reject,signal?.aborted?cancelled():failure()); }
                    };
                } catch { try { transaction.abort(); } catch {} settle(reject,signal?.aborted?cancelled():failure()); }
            });
            ready(); return result;
        } catch (error) { if (signal?.aborted && error?.name === 'AbortError') throw error; failed(); throw failure(); }
    };
    return {
        read(userId) { return transact(userId); },
        update(userId,transform,{signal} = {}) { return transact(userId,transform,false,signal); },
        revision(userId) { return transact(userId,undefined,true); },
        status() { return {persistent,issue}; },
    };
}
