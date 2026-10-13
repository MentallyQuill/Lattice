import { safeWorkflowData, validateNamedGraphStructure } from './graph-validation.js?v=0.27.2';
import { resolveWorkflow } from './resolve.js?v=0.27.2';
export { safeWorkflowData } from './graph-validation.js?v=0.27.2';
const fail = (code, message) => ({ ok: false, error: { code, message } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function plainDescriptors(value, limit = 20000) {
    if (!record(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors);
    return keys.length <= limit && keys.every(key => !['__proto__', 'prototype', 'constructor'].includes(key) && 'value' in descriptors[key]) ? descriptors : null;
}

/** Classify current document metadata without resolving its authoring scope. */
export function isWorkflowGraph(graph) {
    try {
        const fields = plainDescriptors(graph);
        return !!fields && fields.schema?.value === 3 && fields.runtime?.value === 2
            && ['native-pre', 'native-post', 'native-unified'].includes(fields.mode?.value)
            && !!plainDescriptors(fields.nodes?.value, 1000) && !!plainDescriptors(fields.wires?.value, 2000)
            && ['groups', 'roles', 'portals', 'definitions'].every(key => fields[key]?.value == null || !!plainDescriptors(fields[key].value));
    } catch { return false; }
}
/** Authoring checks allow unfinished terminal and input connections.
 * @returns {import('./types').Result<import('./types').StructureDiagnostics>}
 */
export function validateGraphStructure(graph) {
    if (!safeWorkflowData(graph) || !record(graph)) return fail('MALFORMED_WORKFLOW', 'Expected a bounded plain workflow graph.');
    if (graph.schema !== 3 || graph.runtime !== 2) return fail('UNSUPPORTED_VERSION', 'Expected schema 3 and runtime 2.');
    return validateNamedGraphStructure(graph);
}
/** Validate the current named workflow before host or model work. */
export function validateWorkflow(graph, { phase } = {}) {
    const validation = validateGraphStructure(graph);
    if (!validation.ok) return validation;
    if (graph.mode !== 'native-unified') return fail('WRONG_PHASE', 'Executable root workflows require native-unified. Stage-specific bodies are reusable definitions only.');
    if (phase && graph.mode !== 'native-' + phase) return fail('WRONG_PHASE', 'The workflow operation does not support this phase.');
    return resolveWorkflow(graph);
}
