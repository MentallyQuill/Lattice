import type { NativeNode, Result, WorkflowArtifact, WorkflowPhase } from './types';
import type { ManagedFileFormat } from './managed-file-policy';
import type { ModelRequest } from './operations/model-nodes';
export type FileInitializationMode='generate'|'template'|'require-file';
export interface FileInitializationSettings {
 initialization?:FileInitializationMode;
 /** Bounded to 10,000 characters. */
 initializationInstructions?:string;
 /** Integer from 1 to 65,536; omitted selects 2,048. */
 initializationMaxTokens?:number;
}
export function fileInitializationMode(node:Record<string,unknown>):FileInitializationMode;
/** Returns the same reference when configured authority or invalid settings prevent adoption. */
export function prepareUnboundReader<T extends NativeNode|Record<string,unknown>>(node:T,context?:{
 legacyDocuments?:{targetId:string;format?:ManagedFileFormat;visibility?:import('./document-catalog').DocumentVisibility}[];canonicalDocuments?:Record<string,unknown>;
 nodes?:Record<string,Record<string,unknown>>;wires?:Record<string,Record<string,unknown>>;
}):T;
/** Validates the seed and complete generated document through the normal one-request model contract. */
export function generateFileContents(node:NativeNode|Record<string,unknown>,options:{
 context?:WorkflowArtifact;initialContent:string;request?:ModelRequest;signal?:AbortSignal;phase?:WorkflowPhase;
}):Promise<Result<{content:string;reports?:object[]}>>;
