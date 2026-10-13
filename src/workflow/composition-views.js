import { inspectExpandedGraph } from './graph-validation.js?v=0.27.2';
import { preparedWorkflowExpansion, preparedWorkflowSource } from './resolve.js?v=0.27.2';
import { freeze } from './record-data.js?v=0.27.2';
import { definitionChain, ownsDefinitionPath, samePath } from './composition-edit.js?v=0.27.2';
const preparedViews = new WeakMap();

/** Prepare only after content changes. Navigation/camera/selection read this cached DTO.
 * Structural validation has no terminal/completeness requirement and makes no host calls.
 * savedGraph is the editing source; effectiveNodes are display/planning values, never drafts.
 * @returns {import('./types').Result<import('./types').CompositionViews>}
 */
export function prepareCompositionViews(root, planner) {
    const checked = planner === undefined ? inspectExpandedGraph(root) : preparedWorkflowExpansion(root, planner); if (!checked.ok) return checked;
    if (planner !== undefined && preparedViews.has(planner)) return preparedViews.get(planner);
    const source = planner === undefined ? root : preparedWorkflowSource(root, planner);
    const views = checked.data.scopes.map(({ instancePath, graph }) => {
        const definition = instancePath.length ? definitionChain(source, instancePath).at(-1).definition : null;
        const saved = definition?.body ?? source;
        const savedGraph = Object.fromEntries(['schema', 'runtime', 'mode', 'nodes', 'wires', 'groups', 'roles', 'portals'].filter(key => saved[key] !== undefined).map(key => [key, structuredClone(saved[key])]));
        return {
            instancePath: [...instancePath], editable: !instancePath.length || ownsDefinitionPath(source, instancePath),
            ...(definition ? { definitionRef: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash } } : {}),
            savedGraph, effectiveNodes: structuredClone(graph.nodes),
            interface: structuredClone(definition?.interface ?? []),
            ports: structuredClone(checked.data.pins.filter(pin => samePath(pin.address.instancePath, instancePath))),
        };
    });
    const result = { ok: true, data: { workflowId: checked.data.workflowId, views } };
    if (planner !== undefined) { freeze(result); preparedViews.set(planner, result); }
    return result;
}
