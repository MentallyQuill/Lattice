import type { NativeNode, OperationDescription, OperationDescriptor, OperationResult, ReportedUsage, Result, WorkflowPhase, WorkflowArtifact } from '../types';
import type { JsonValue } from './json-data';
export type EventOperationId = 'actor-context' | 'draft-event-source' | 'event-normalize' | 'item-mention-trigger' | 'item-use-trigger' | 'confirm-events' | 'scene-presence' | 'current-holder' | 'character-direction' | 'prompted-memory';
export interface ActorMemoryContext { memoryId: string; actorId: string; visibility: 'actor-private'; text: string; }
export interface ScopedActorContext {
    scope: { actorId: string; sceneId: string }; visibility: 'actor-private';
    context: JsonValue; memories?: ActorMemoryContext[];
}
export interface ActorContextRequest {
    sceneId: string; sourceId: string; revision: string; signal?: AbortSignal;
    /** Optional exact Character Direction Data artifact; the host verifies its retained actor authority before capture. */
    data?: WorkflowArtifact;
}
export interface EventModelRequest { messages: readonly { role: string; content: string }[]; maxTokens: number; signal?: AbortSignal; }
export interface EventExecution {
    phase?: WorkflowPhase; signal?: AbortSignal; root?: boolean;
    /** Trusted host closure must filter privacy and enforce the live scene/actor scope. */
    actorContext?: (actorId: string, request: ActorContextRequest, exactPresence: WorkflowArtifact) => Promise<Result<ScopedActorContext>> | Result<ScopedActorContext>;
    request?: (request: EventModelRequest) => Promise<Result<{ text: string; finish?: string; usage?: ReportedUsage }>>;
}
export const EVENT_OPERATIONS: Record<EventOperationId, OperationDescriptor>;
export function describeEvent(node: NativeNode | Record<string,unknown>, options?: { phase?: WorkflowPhase; authoring?: boolean }): Result<OperationDescription>;
export function executeEvent(node: NativeNode | Record<string,unknown>, inputs: Record<string,unknown>, local?: EventExecution): Promise<OperationResult>;