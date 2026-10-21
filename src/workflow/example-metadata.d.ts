import type {DefinitionRef,NativeGraph3,Result} from './types';
export interface ExampleNodeAddress {rootKey:string;hops:{kind:'subgraph'|'iteration-helper';nodeId:string;expectedRef:DefinitionRef}[];nodeId:string}
export interface ExampleCheckpointV1 {node:string;port:string;expect:string;target:ExampleNodeAddress}
export interface WorkflowExampleMetadataV1 {schema:1;id:string;title:string;rootKey:string;role:'generation';resourceRequirements:[];checkpoints?:ExampleCheckpointV1[]}
export function inspectExampleCheckpoint(graph:NativeGraph3,checkpoint:ExampleCheckpointV1):Result<{node:Record<string,unknown>;scope:NativeGraph3}>;
export function inspectSingletonMetadata(input:unknown,graph:NativeGraph3,options?:{pruneMissing?:boolean}):Result<WorkflowExampleMetadataV1>;
export function remapExampleMetadata(metadata:WorkflowExampleMetadataV1,maps?:{nodes?:Record<string,string>;definitions?:Record<string,DefinitionRef>}):WorkflowExampleMetadataV1;
