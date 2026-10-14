import type { NativeNode, OperationDescription, OperationDescriptor, OperationResult, Result, WorkflowPhase } from '../types';
import type { JsonValue } from './json-data';

export type ModelOperationId = 'model-call' | 'revise-draft' | 'draft-text' | 'extract' | 'enrich' | 'render-notes' | 'combine' | 'append';
export type ModelRequest = (options: {
    messages: readonly { role: 'system' | 'user'; content: string }[]; maxTokens: number; binding?: unknown; signal?: AbortSignal;
}) => Promise<Result<{ text: string; finish: string; usage?: JsonValue }>>;
export interface ModelNodeExecution { phase?: WorkflowPhase; request?: ModelRequest; binding?: unknown; signal?: AbortSignal; }
export interface ExtractNodeSettings {
    inputKind?: 'draft' | 'text'; mode?: 'model' | 'literal'; instructions?: string; schema?: string;
    patterns?: { id: string; literal: string; label: string }[];
    /** Existing saved nodes use case-sensitive substring matching. */
    caseSensitive?: boolean; match?: 'substring' | 'word'; maxTokens?: number;
}
export interface ExtractedRecord {
    id: string; label: string; text: string; classification: 'observation' | 'claim' | 'interpretation'; status?: 'proposed';
    evidence: { start: number; end: number; quote: string }[];
    additions?: { text: string; classification: 'generated-proposal'; originNodeId?: string }[];
}
export interface ExtractedRecords { type: 'extracted-records' | 'enriched-records'; records: ExtractedRecord[]; sourceRefs: JsonValue[]; }
export const MODEL_OPERATIONS: Record<ModelOperationId, OperationDescriptor>;
/** Descriptions use native control metadata directly and keep optional sections optional. */
export function describeModelNode(node: NativeNode | Record<string, unknown>, options?: { phase?: WorkflowPhase }): Result<OperationDescription>;
/** Request capability is injected; no provider activation, storage or reply writes occur here. */
export function executeModelNode(node: NativeNode | Record<string, unknown>, inputs: Record<string, unknown>, execution?: ModelNodeExecution): Promise<OperationResult>;
