import type { NativeNode, OperationDescription, OperationDescriptor, OperationResult, Result, WorkflowPhase } from '../types';
import type { StoryClock } from '../story-time';

export type TimeOperationId = 'story-clock' | 'advance-time' | 'time-trigger' | 'commit-clock';
export type TimeOperationDescriptor = OperationDescriptor & { operationVersion: 1; minimumRuntime: 2 };
export type TimeVisibility = { kind: 'public' } | { kind: 'hidden' } | { kind: 'actor-private'; actorId: string };
export interface TimeNodeExecution {
    phase?: WorkflowPhase;
    /** Required true for Story Clock. Pure projections may execute in pinned helpers. */
    root?: boolean;
    retainTimeProjection?: (projection:import('../native-story-state').NativeTimeProjection)=>Result<void>|Promise<Result<void>>;
    stageStoryClock?: (report:unknown,occurrences?:unknown)=>Result<Record<string,unknown>>|Promise<Result<Record<string,unknown>>>;
    signal?: AbortSignal;
    /** Trusted captured user/chat-scoped accepted clock, schemaVersion 1 and positive revision.
     * The host supplies scoped presets, initialization and currentness policy. No wall clock is used.
     */
    readStoryClock?: (clockId: string, options: { signal?: AbortSignal }) => Result<StoryClock> | Promise<Result<StoryClock>>;
}
export const TIME_OPERATIONS: Record<TimeOperationId, TimeOperationDescriptor>;
/** Native controls, schema 3/runtime 2, and actual named ports. Both phases reserve zero requests. */
export function describeTimeNode(node: NativeNode | Record<string, unknown>, options?: { phase?: WorkflowPhase; authoring?: boolean }): Result<OperationDescription>;
/** Story Clock: out = detached accepted clock from the trusted root capability.
 * Advance Time inputs: clock + proposal, optional schedules + consumed ledger arrays.
 * Outputs: clock (effective projection), occurrences (ordered attributed records), remainder
 * (duration proposal with evidence), report (previous/requested/effective timing and policy).
 * Time Trigger inputs: previous + destination full clocks, optional consumed ledger.
 * Outputs: occurrences + report; daily, fixed-anchor interval and one-time delay controls.
 * Input/clock/schedule visibility is strengthened across every derived artifact and due record.
 * Clock Commit: Post/root/host terminal, projection plus optional checked occurrences; descriptive receipt only.
 * Acceptance owns persistence and revision increments.
 * Pure projections make no model calls, writes, revision increments or automatic ledger settlement.
 */
export function executeTimeNode(node: NativeNode | Record<string, unknown>, inputs: Record<string, unknown>, execution?: TimeNodeExecution): Promise<OperationResult>;
