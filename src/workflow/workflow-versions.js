/** Exact supported document/envelope pairs. Higher requirements never rewrite old documents. */
export const graphVersionSupported = (schema, runtime) => schema === 3 && runtime === 2 || schema === 4 && runtime === 3;
export const graphSatisfies = (graph, requirement = {}) => graphVersionSupported(graph?.schema, graph?.runtime) && graph.schema >= (requirement.minimumSchema ?? 3) && graph.runtime >= (requirement.minimumRuntime ?? 2);
export const workflowPackageVersion = graph => ({ schema: graph.runtime === 3 ? 3 : 2, minRuntime: graph.runtime });
export const subgraphPackageVersion = body => ({ schema: body.runtime === 3 ? 2 : 1, minRuntime: body.runtime });
export const packageVersionSupported = (schema,minRuntime,subgraph=false) => minRuntime === 2 && schema === (subgraph ? 1 : 2) || minRuntime === 3 && schema === (subgraph ? 2 : 3);
export const packageVersionMatches = (envelope, body, subgraph = false) => graphVersionSupported(body?.schema, body?.runtime) && envelope.schema === (subgraph ? subgraphPackageVersion(body) : workflowPackageVersion(body)).schema && envelope.minRuntime === body.runtime;
/** Generic Data defers validation; known shapes cannot silently cross incompatible contracts. */
export const semanticShapeAssignable = (source, destination) => !source || !destination || source === destination || destination === 'record-list/v1' && ['records/chunk/v1', 'workflow-events/v1'].includes(source);
