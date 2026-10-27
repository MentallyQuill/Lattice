import {referencedDefinitionKeys} from './workflow/retired-workflows.js?v=0.29.0';
import {partitionFoundationLibrary} from './workflow/foundation-library.js?v=0.29.0';
/** Validated reusable Lattice subgraphs; persistence never edits placed snapshots. */
import { settings, save } from './state.js?v=0.29.0';
import { cloneDefinitionData, computeDefinitionIdentity, definitionRefKey } from './workflow/definitions.js?v=0.29.0';
import { selectSubgraphClosure } from './workflow/packages.js?v=0.29.0';
import { installDefinition, createRevision, removeLibraryEntry } from './workflow/definition-library.js?v=0.29.0';
const subgraphCaches = new WeakMap(),retainedLibraryCaches=new WeakMap();
const libraryFailure = (code, message) => Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const reference = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });
const safeId = id => typeof id === 'string' && id.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(id);

function shelfEntries(library) {
    if (library.entries !== undefined) return library.entries;
    const entries = {};
    for (const definition of Object.values(library.definitions)) if (!Object.hasOwn(entries, definition.id) || entries[definition.id].version < definition.version) entries[definition.id] = reference(definition);
    return entries;
}

/** Explicit shelf refresh. Invalid saved data remains available for recovery;
 * placed workflow snapshots and execution are independent of this result.
 */
export function loadSubgraphLibrary() {
    const s = settings(), property = Object.getOwnPropertyDescriptor(s, 'subgraphLibrary');
    const partition = property && 'value' in property ? partitionFoundationLibrary(property.value) : libraryFailure('DEFINITION_DATA', 'The saved subgraph library must be plain data.');
    const result=partition.ok?Object.freeze({ok:true,data:partition.data,...(partition.unavailable.length?{unavailable:partition.unavailable}:{})}):libraryFailure(partition.error.code,partition.error.message);
    if(partition.ok)retainedLibraryCaches.set(s,partition.raw);else retainedLibraryCaches.delete(s);
    subgraphCaches.set(s, result);
    return result;
}

/** Cheap projection only. Authoring explicitly loads once and refreshes after changes. */
export function getSubgraphLibrary() {
    return subgraphCaches.get(settings()) ?? libraryFailure('LIBRARY_NOT_LOADED', 'Load the subgraph library before displaying it.');
}

/** Visible shelf heads only; retained dependency and previous revision snapshots stay private. */
export function getSubgraphShelfEntries() {
    const loaded = getSubgraphLibrary(); if (!loaded.ok) return loaded;
    return Object.freeze({ ok: true, data: Object.freeze(Object.values(shelfEntries(loaded.data)).map(ref => loaded.data.definitions[definitionRefKey(ref)])) });
}

function changeSubgraphLibrary(prepare) {
    const loaded=loadSubgraphLibrary();if(!loaded.ok)return loaded;
    const s=settings(),raw=retainedLibraryCaches.get(s),result=prepare(loaded.data,raw);if(!result.ok||!result.data.changed)return result;
    const cold=Object.fromEntries(Object.entries(raw.definitions).filter(([key])=>!Object.hasOwn(loaded.data.definitions,key)));
    const removed=new Set(Object.keys(loaded.data.definitions).filter(key=>!Object.hasOwn(result.data.library.definitions,key)));
    if(removed.size&&Object.values(cold).some(definition=>[...referencedDefinitionKeys(definition,raw.definitions)].some(key=>removed.has(key))))return libraryFailure('DEFINITION_IN_USE','A retained unavailable revision still pins this definition. Hide its shelf entry instead of removing the saved revision.');
    for(const item of Object.values(result.data.library.definitions))if(Object.values(cold).some(saved=>saved.id===item.id&&saved.version===item.version&&definitionRefKey(saved)!==definitionRefKey(item)))return libraryFailure('DEFINITION_CONFLICT','An unavailable saved revision already occupies this version. Save a new revision or use a fresh ID.');
    const entries=result.data.library.entries,rawHeads=shelfEntries(raw),coldHeads=Object.fromEntries(Object.entries(rawHeads).filter(([,ref])=>Object.hasOwn(cold,definitionRefKey(ref))));
    const merged={definitions:{...cold,...result.data.library.definitions},...(entries!==undefined?{entries:{...coldHeads,...entries}}:{})};
    const checked=partitionFoundationLibrary(merged);if(!checked.ok)return checked;
    try{s.subgraphLibrary=structuredClone(checked.raw);}catch{return libraryFailure('LIBRARY_READ_ONLY','The saved subgraph library is read-only.');}
    subgraphCaches.set(s,Object.freeze({ok:true,data:checked.data,...(checked.unavailable.length?{unavailable:checked.unavailable}:{})}));retainedLibraryCaches.set(s,checked.raw);
    save();return {...result,data:{...result.data,library:checked.data}};
}

export function installSubgraphDefinition(definition, snapshots = {}) {
    return changeSubgraphLibrary(library => preserveEntries(library, installDefinition(library, definition, snapshots), true));
}
export function reviseSubgraphDefinition(draft, snapshots = {}) {
    return changeSubgraphLibrary((library,raw) => preserveEntries(library, createRevision(library, draft, snapshots,{minimumVersion:Math.max(0,...Object.values(raw.definitions).filter(item=>item.id===draft?.id).map(item=>item.version))}), true));
}
export function removeSubgraphDefinition(ref) {
    return changeSubgraphLibrary(library => preserveEntries(library, removeLibraryEntry(library, ref)));
}

function preserveEntries(previous, result, advance = false) {
    if (!result.ok || previous.entries === undefined) return result;
    const entries = { ...previous.entries }, definitions = result.data.library.definitions;
    for (const [id, ref] of Object.entries(entries)) if (!Object.hasOwn(definitions, definitionRefKey(ref))) delete entries[id];
    if (advance && result.data.ref) entries[result.data.ref.id] = result.data.ref;
    const copied = cloneDefinitionData({ definitions, entries });
    const changed = result.data.changed || JSON.stringify(entries) !== JSON.stringify(previous.entries);
    return copied.ok ? { ok: true, data: { ...result.data, library: copied.data, changed } } : copied;
}

/** An explicit save advances a visible entry; placed instances retain their exact bundled pins. */
export function saveSubgraphDefinition(draft, snapshots = {}, targetId = null) {
    const admitted = cloneDefinitionData({ draft, snapshots, targetId }); if (!admitted.ok) return admitted;
    const input = admitted.data;
    if (!record(input.draft) || !safeId(input.draft.id) || input.targetId !== null && !safeId(input.targetId)) return libraryFailure('DEFINITION_DATA', 'Expected a definition draft and optional shelf entry ID.');
    return changeSubgraphLibrary((library,raw) => {
        const entries = shelfEntries(library);
        if (input.targetId !== null && !Object.hasOwn(entries, input.targetId)) return libraryFailure('MISSING_DEFINITION', 'The selected shelf entry no longer exists.');
        if (input.targetId === null && Object.values(raw.definitions).some(definition => definition.id === input.draft.id)) return libraryFailure('DEFINITION_CONFLICT', 'A new shelf entry requires a fresh definition ID.');
        const id = input.targetId ?? input.draft.id;
        const available = { ...library.definitions, ...input.snapshots };
        const reserved = { ...raw.definitions, ...available };
        const versions = Object.values(reserved).filter(item => item?.id === id).map(item => item.version);
        const candidate = { ...input.draft, id, version: Math.max(0, ...versions) + 1 }; delete candidate.semanticHash;
        const identity = computeDefinitionIdentity(candidate); if (!identity.ok) return identity;
        const closure = selectSubgraphClosure({ ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash }, available); if (!closure.ok) return closure;
        const saved = installDefinition(library, closure.data.definition, closure.data.definitions);
        if (!saved.ok) return saved;
        const copied = cloneDefinitionData({ definitions: saved.data.library.definitions, entries: { ...entries, [saved.data.ref.id]: saved.data.ref } });
        return copied.ok ? { ok: true, data: { ...saved.data, library: copied.data, changed: true } } : copied;
    });
}

/** Hiding a shelf item keeps immutable snapshots available to saved dependent definitions. */
export function removeSubgraphShelfEntry(id) {
    if (!safeId(id)) return libraryFailure('DEFINITION_REF', 'Expected a shelf entry ID.');
    return changeSubgraphLibrary(library => {
        const entries = { ...shelfEntries(library) };
        if (!Object.hasOwn(entries, id)) return libraryFailure('MISSING_DEFINITION', 'The shelf entry no longer exists.');
        delete entries[id];
        const copied = cloneDefinitionData({ definitions: library.definitions, entries });
        return copied.ok ? { ok: true, data: { library: copied.data, changed: true } } : copied;
    });
}
