import { REMASTERED_WORKFLOW_EXAMPLE_DATA } from './remastered-example-data.js?v=0.27.2';
import { UNIFIED_WORKFLOW_EXAMPLE_DATA } from './unified-example-data.js?v=0.27.2';
import { parseWorkflow } from './packages.js?v=0.27.2';
import { cloneWorkflowDocument } from './document.js?v=0.27.2';
import { validateWorkflow } from './contracts.js?v=0.27.2';

const ALL_WORKFLOW_EXAMPLES = [...REMASTERED_WORKFLOW_EXAMPLE_DATA, ...UNIFIED_WORKFLOW_EXAMPLE_DATA];
const lessonMetadata = lesson => lesson ? structuredClone(lesson) : undefined;
let sequence = 0;
const fail = (code, message) => ({ ok: false, error: { code, message } });
const admissionCache = new WeakMap();
const deepFreeze = value => {
    if (value && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
        for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) if ('value' in descriptor) deepFreeze(descriptor.value);
        Object.freeze(value);
    }
    return value;
};
const MAX_REVISION_VALUES = 200_000;
const MAX_REVISION_LENGTH = 2_000_000;
function sourceRevision(source) {
    let values = 0, sourceCharacters = 0;
    const active = new WeakSet();
    const visit = value => {
        if (++values > MAX_REVISION_VALUES) return false;
        if (value === null || typeof value === 'boolean') return true;
        if (typeof value === 'number') return Number.isFinite(value);
        if (typeof value === 'string') {
            sourceCharacters += value.length;
            return sourceCharacters <= MAX_REVISION_LENGTH;
        }
        if (typeof value !== 'object' || active.has(value)) return false;
        const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
        if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
        const inheritedToJSON = Object.getOwnPropertyDescriptor(prototype ?? {}, 'toJSON');
        if (inheritedToJSON) return false;
        const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
        if (keys.some(key => typeof key === 'symbol')) return false;
        active.add(value);
        if (array) {
            const length = descriptors.length;
            if (!length || !('value' in length) || !Number.isSafeInteger(length.value) || length.value < 0) { active.delete(value); return false; }
            const itemKeys = keys.filter(key => key !== 'length');
            if (itemKeys.length !== length.value || itemKeys.some((key, index) => key !== String(index))) { active.delete(value); return false; }
        }
        for (const key of keys) {
            if (array && key === 'length') continue;
            const descriptor = descriptors[key];
            sourceCharacters += key.length;
            if (!descriptor.enumerable || !('value' in descriptor) || sourceCharacters > MAX_REVISION_LENGTH || !visit(descriptor.value)) {
                active.delete(value);
                return false;
            }
        }
        active.delete(value);
        return true;
    };
    try {
        if (!visit(source)) return null;
        const serialized = JSON.stringify(source);
        return typeof serialized === 'string' && serialized.length <= MAX_REVISION_LENGTH ? serialized : null;
    } catch { return null; }
}
const detachedResult = admitted => admitted.ok
    ? { ok: true, data: structuredClone(admitted.data) }
    : { ok: false, error: structuredClone(admitted.error) };
function admitExamplePackages(entry) {
    const revision = sourceRevision(entry), cached = admissionCache.get(entry);
    if (revision !== null && cached?.revision === revision) return cached.result;
    if (revision === null) admissionCache.delete(entry);
    let result;
    try {
        if (!Array.isArray(entry.packages) || !entry.packages.length) result = fail('MALFORMED_EXAMPLE', 'That workflow example has no primary package.');
        const graphs = [];
        if (!result) for (const envelope of entry.packages) {
            const parsed = parseWorkflow(JSON.stringify(envelope));
            if (!parsed.ok) { result = parsed; break; }
            const validation = validateWorkflow(parsed.data);
            if (!validation.ok) { result = validation; break; }
            graphs.push(deepFreeze(parsed.data));
        }
        result ??= { ok: true, data: deepFreeze(graphs) };
    } catch { result = fail('MALFORMED_EXAMPLE', 'That workflow example contains malformed local package data.'); }
    result = deepFreeze(result);
    if (revision !== null) admissionCache.set(entry, { revision, result });
    return result;
}
function independentCopy(source) {
    const cloned = cloneWorkflowDocument(source);
    if (!cloned.ok) return cloned;
    const graph = cloned.data;
    const suffix = `${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}-${++sequence}`;
    const id = `example-copy-${suffix}`;
    const nodes = Object.fromEntries(Object.keys(graph.nodes).map(id => [id, `${id}-${suffix}`]));
    const groups = Object.fromEntries(Object.keys(graph.groups).map(id => [id, `${id}-${suffix}`]));
    const portals = Object.fromEntries(Object.keys(graph.portals).map(id => [id, `${id}-${suffix}`]));
    graph.nodes = Object.fromEntries(Object.values(graph.nodes).map(node => {
        node.id = nodes[node.id];
        if (node.inGroup) node.inGroup = groups[node.inGroup];
        return [node.id, node];
    }));
    graph.wires = Object.fromEntries(Object.values(graph.wires).map(wire => {
        wire.id = `${wire.id}-${suffix}`; wire.to = nodes[wire.to];
        if (wire.route === 'wire') wire.from = nodes[wire.from];
        else wire.portalId = portals[wire.portalId];
        return [wire.id, wire];
    }));
    graph.groups = Object.fromEntries(Object.values(graph.groups).map(group => {
        group.id = groups[group.id];
        if (group.members) group.members = group.members.map(id => nodes[id]);
        return [group.id, group];
    }));
    graph.portals = Object.fromEntries(Object.values(graph.portals).map(portal => {
        portal.id = portals[portal.id]; portal.source.nodeId = nodes[portal.source.nodeId];
        return [portal.id, portal];
    }));
    graph.id = id;
    graph.createdAt = graph.updatedAt = Date.now();
    return cloneWorkflowDocument(graph);
}

/** Read independent primary graph data from the local portable example catalog. */
export function listWorkflowExamples() {
    return REMASTERED_WORKFLOW_EXAMPLE_DATA.map(entry => {
        const { id, number, title, goal, lesson } = entry, admitted = admitExamplePackages(entry);
        if (!admitted.ok) throw new Error(`${title}: ${admitted.error.message}`);
        return { id, number, title, goal, lesson: lessonMetadata(lesson), graph: structuredClone(admitted.data[0]) };
    });
}

/** Preserve catalog metadata when one bundle fails admission. Every successful
 * Result owns a detached primary graph; every companion has also passed admission.
 * @returns {import('./examples').WorkflowExampleResult[]}
 */
export function listWorkflowExampleResults() {
    return REMASTERED_WORKFLOW_EXAMPLE_DATA.map(entry => {
        const { id, number, title, goal } = entry, admitted = admitExamplePackages(entry);
        const result = detachedResult(admitted);
        return { id, number, title, goal, lesson: lessonMetadata(entry.lesson), result: result.ok ? { ok: true, data: result.data[0] } : result };
    });
}

/** Exact bounded revision for plain value-only JSON sources; unsafe shapes are uncacheable. */
export function workflowExampleCatalogRevision() {
    return sourceRevision(REMASTERED_WORKFLOW_EXAMPLE_DATA);
}

/** Prepare detached local roots. Saving, activation and running belong to the caller.
 * @param {string} id
 * @returns {import('./types').Result<{graph: import('./types').NativeGraph3, companions: import('./types').NativeGraph3[]}>}
 */
export function installWorkflowExample(id) {
    const entry = ALL_WORKFLOW_EXAMPLES.find(entry => entry.id === id);
    if (!entry) return fail('UNKNOWN_EXAMPLE', 'That workflow example is unavailable.');
    const admitted = admitExamplePackages(entry);
    if (!admitted.ok) return detachedResult(admitted);
    const prepared = [];
    for (const graph of admitted.data) {
        const result = independentCopy(graph);
        if (!result.ok) return result;
        const validation = validateWorkflow(result.data);
        if (!validation.ok) return validation;
        prepared.push(result.data);
    }
    return { ok: true, data: { graph: prepared[0], companions: prepared.slice(1) } };
}
