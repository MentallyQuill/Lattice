import type { OperationDescriptor } from './types';
export function graphVersionSupported(schema: unknown, runtime: unknown): boolean;
export function graphSatisfies(graph: {schema?:unknown;runtime?:unknown}, requirement?: Pick<OperationDescriptor,'minimumSchema'|'minimumRuntime'>): boolean;
export function workflowPackageVersion(graph: {runtime: number}): {schema:number;minRuntime:number};
export function subgraphPackageVersion(body: {runtime:number}): {schema:number;minRuntime:number};
export function packageVersionMatches(envelope: {schema?:unknown;minRuntime?:unknown}, body: {schema?:unknown;runtime?:unknown}, subgraph?:boolean): boolean;
export function semanticShapeAssignable(source?:string,destination?:string): boolean;

export function packageVersionSupported(schema:unknown,minRuntime:unknown,subgraph?:boolean):boolean;
