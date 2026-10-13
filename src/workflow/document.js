import { graphArtifactsFor } from './graph-artifacts.js?v=0.27.1';
import { validateGraphStructure } from './contracts.js?v=0.27.1';

/** Detach a current document and supply its absent optional authoring containers.
 * A supplied private artifact must match this admitted authored content exactly.
 * @param {unknown} graph
 * @param {{checkedArtifacts?: object}} [options]
 * @returns {import('./types').Result<import('./types').NativeGraph3>}
 */
export function cloneWorkflowDocument(graph, { checkedArtifacts } = {}) {
    const validation = checkedArtifacts === undefined ? validateGraphStructure(graph) : graphArtifactsFor(graph, checkedArtifacts);
    if (!validation.ok) return validation;
    const copy = structuredClone(graph);
    for (const key of ['groups', 'roles', 'portals', 'definitions']) copy[key] ??= {};
    return { ok: true, data: copy };
}
