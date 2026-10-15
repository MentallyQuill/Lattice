import type { DataArtifact, DefinitionRef, NativeNode, NativeWorkflowMode, NodeAddress, OperationDescription, OperationDescriptor, OperationResult, PortState, ReportedUsage, Result, WorkflowPhase } from '../types';
import type { JsonValue } from './json-data';
import type { ArtifactVisibility } from '../artifact-privacy';

export type ControlOperationId = 'condition' | 'branch' | 'confidence-gate' | 'join' | 'collect' | 'for-each';
export interface ForEachControls { helper:DefinitionRef; limit:number; requestBoundPerIteration:number; mode:'map'|'projected-state'; roleOverrides?:Record<string,import('../types').Binding>; }
export interface JoinSlot { id: string; label: string; required: boolean; }
export interface IterationRequestMetadata { binding?: unknown; childAddress?: NodeAddress; modelRole?: string; signal?: AbortSignal; }
export interface TextIterationRequestOptions extends IterationRequestMetadata { capability?: 'text-completion'; messages: { role: string; content: string }[]; maxTokens: number; }
export type IterationRequestOptions = TextIterationRequestOptions;
export interface IterationRequest {
    (options: TextIterationRequestOptions): Promise<Result<{ text: string; finish?: string; usage?: ReportedUsage }>>;
}
/** item/state are detached bounded JSON; the adapter resolves the exact pinned helper. */
export interface IterationInvocation {
    readonly helper: DefinitionRef; readonly item: JsonValue; readonly index: number;
    readonly projectedState?: JsonValue; readonly phase: WorkflowPhase; readonly rootMode: NativeWorkflowMode;
    readonly address?: NodeAddress; readonly visibility?: ArtifactVisibility;
}
export type IterationResult = { ok: true; artifact: DataArtifact & { visibility?: ArtifactVisibility }; projectedState?: JsonValue; projectedStateVisibility?: ArtifactVisibility } | { ok: false; error: import('../types').WorkflowError };
/** Request must use this per-iteration capability; it also enters the shared root recorder/bound. */
export type IterateHelper = (invocation: IterationInvocation, ports: { request: IterationRequest; signal?: AbortSignal }) => Promise<IterationResult> | IterationResult;
export interface ControlExecution {
    phase?: WorkflowPhase; rootMode?: NativeWorkflowMode; address?: NodeAddress; signal?: AbortSignal;
    inputStates?: Readonly<Record<string, PortState>>; /** Trusted root verifies exact successful compiled results; user JSON cannot recover failed requests. */ isRecoveredIterationResult?: (result: IterationResult) => boolean; iterateHelper?: IterateHelper; request?: IterationRequest;
}
export const CONTROL_OPERATIONS: Record<ControlOperationId, OperationDescriptor>;
export function describeControl(node: NativeNode | Record<string, unknown>, options?: { phase?: WorkflowPhase; authoring?: boolean }): Result<OperationDescription>;
export function executeControl(node: NativeNode | Record<string, unknown>, inputs: Record<string, unknown>, local?: ControlExecution): Promise<OperationResult>;

/** Same sparse profile/model map as subgraph overrides; local profile selectors are portable-redacted. */
export function validIterationRoleOverrides(value: unknown): value is Record<string, import('../types').Binding>;
