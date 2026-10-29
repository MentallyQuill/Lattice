import { graphArtifactsFor } from './graph-artifacts.js?v=0.30.2';
import { inspectExpandedGraph } from './graph-validation.js?v=0.30.2';

/** Detach a current document and supply its absent optional authoring containers.
 * A supplied private artifact must match this admitted authored content exactly.
 * @param {unknown} graph
 * @param {{checkedArtifacts?: object}} [options]
 * @returns {import('./types').Result<import('./types').NativeGraph3>}
 */
export function cloneWorkflowDocument(graph, { checkedArtifacts } = {}) {
    const validation = checkedArtifacts === undefined ? inspectExpandedGraph(graph) : graphArtifactsFor(graph, checkedArtifacts);
    if (!validation.ok) return validation;
    const copy = structuredClone(graph);
    if (!Object.hasOwn(copy, 'runTargets')) {
        const targets = checkedArtifacts === undefined ? validation.data.runTargets : validation.data.checked.data.runTargets;
        copy.runTargets = targets.map(target => ({ instancePath: [...target.instancePath], nodeId: target.nodeId }));
    }
    for (const key of ['groups', 'roles', 'portals', 'definitions']) copy[key] ??= {};
    return { ok: true, data: copy };
}
