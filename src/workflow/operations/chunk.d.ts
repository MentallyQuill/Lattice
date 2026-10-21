import type { NativeNode, OperationDescriptor, OperationDescription, Result, OperationResult, NodeAddress, WorkflowPhase } from '../types';
export interface ChunkSettings { inputMode:'text'|'context';strategy:'paragraph'|'sentence'|'fixed'|'assistant-turns';sizeUnit:'utf16'|'tokens';targetSize:number;overlap:number;turnsPerChunk:number;separator:string;sentenceLocale:string;tokenizerBinding:Record<string,string>;maxTokenizerCalls:number;maxChunks:number; }
export interface ChunkTokenizerBinding { tokenizerId:string;version:string;model:string; }
/** Host supplied read-only tokenizer; its selected identity must exactly equal the authored binding. */
export interface ChunkTokenizer { binding:ChunkTokenizerBinding;countTokens(text:string,options:{binding:ChunkTokenizerBinding;signal?:AbortSignal}):Promise<{tokens:number}>|{tokens:number}; }
export interface ChunkExecutionOptions { phase?:WorkflowPhase;address?:NodeAddress;signal?:AbortSignal;chunkTokenizer?:ChunkTokenizer;
/** Installed exclusively by runtime/host; copied JSON cannot supply proofs. */
sourceProofs?:import('../types').PrivateSourceCapability;
/** Captured execution identity only; sourceRefs stay empty and this grants no source authority. */
chunkScope?:import('../source-manifests').Scope; }
export const CHUNK_DEFAULTS: Readonly<ChunkSettings>;
export const CHUNK_OPERATION: OperationDescriptor;
export function validateChunkSettings(value?:unknown):Result<ChunkSettings>;
export function chunkSettingsForNode(node:unknown):Result<ChunkSettings>;
export function describeChunk(node:unknown,options?:{phase?:WorkflowPhase}):Result<OperationDescription>;
export function executeChunk(node:NativeNode,inputs:unknown,local?:ChunkExecutionOptions):Promise<OperationResult>;

/** Literal Text records carry workflow-local authored scope and empty sourceRefs. */
export interface ChunkRecord {
 recordType:'chunk';id:string;revision:string;
 scope:{userId:string;chatId:string;actorId?:string;branchId?:string};
 sourceRefs:import('../source-manifests').SourceRef[];
 visibility:import('../artifact-privacy').ArtifactVisibility;
 text:string;ordinal:number;memberIds:string[];assistantTurnIds?:string[];
 inputSpan:{start:number;end:number;unit:'utf16'}|null;
 mapping:'exact'|'derived-only'|'unmapped';metadata?:Record<string,import('./json-data').JsonValue>;
}
export interface ChunkReport {
 schemaVersion:1;recordType:'chunk-report';status:'complete'|'empty';strategy:ChunkSettings['strategy'];
 inputUnits:number;outputCount:number;overlapUnits:number;tokenizerCalls:number;actualCalls:0;unmappedCount:number;
 tokenizerBinding?:ChunkTokenizerBinding;diagnostics:{code:string;message:string;count?:number}[];
}
