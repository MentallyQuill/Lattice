import type { Binding, DefinitionRef, NativeGraph3, NativeWorkflowMode, NodeAddress, OperationResult, PortState, ResolvedPrimitive, Result, WorkflowArtifact, WorkflowPhase } from './types';
import type { IterationInvocation, IterationRequest, IterationResult, IterateHelper } from './operations/control-nodes';

/** Module-private brand; the empty public token carries neither source nor host capabilities. */
declare const compiledIteration: unique symbol;
export interface CompiledIterationToken { readonly [compiledIteration]: true; }
export interface IterationCompileOptions {
    helper: DefinitionRef; mode: 'map' | 'projected-state'; phase: WorkflowPhase;
    address: NodeAddress; requestBoundPerIteration: number;
}
export interface IterationDescription {
    readonly helper: DefinitionRef; readonly phase: WorkflowPhase; readonly mode: 'map' | 'projected-state';
    readonly requestBound: number; readonly unitCount: number;
}
export type IterationUnit = Readonly<Pick<ResolvedPrimitive, 'address' | 'node' | 'phase' | 'enabled' | 'requestBound' | 'inputPorts' | 'outputPorts' | 'terminal'>>;
export interface IterationUnitExecution {
    readonly phase: WorkflowPhase; readonly rootMode: NativeWorkflowMode; readonly root: false; readonly address: NodeAddress;
    readonly inputStates: Readonly<Record<string, PortState>>; readonly roles: Readonly<Record<string, Binding>>;
    readonly signal?: AbortSignal; readonly request?: IterationRequest; readonly iterateHelper?: IterateHelper;
}
/** Root owns adapters, binding capture, bounded transport and shared request recording. */
export type IterationUnitExecutor = (unit: IterationUnit, inputs: Readonly<Record<string, WorkflowArtifact>>, local: IterationUnitExecution) => OperationResult | Promise<OperationResult>;
export interface IterationExecutorPorts { executeUnit: IterationUnitExecutor; request?: IterationRequest; signal?: AbortSignal; }
/** Synchronous whole-graph validation includes unused branches and recursive pinned helpers. */
export function compileIterationHelper(root: NativeGraph3 | unknown, options: IterationCompileOptions): Result<{ token: CompiledIterationToken; description: IterationDescription; workflowDataNodes: ReadonlyArray<Readonly<{ operation: string; clockId?: string; targetId?: string; ledgerId?: string;node:import('./types').NativeNode;address:NodeAddress }>> }>;
/** Detached bounded invocation; planning seeds never become user effects or recording units. */
export function executeCompiledIteration(token: CompiledIterationToken, invocation: IterationInvocation, ports: IterationExecutorPorts): Promise<IterationResult>;
