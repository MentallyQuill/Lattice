import type { Result, WorkflowArtifact, NativeNode } from './types';
import type { ActorContextRequest, ScopedActorContext, ActorMemoryContext } from './operations/event-nodes';
export interface ActorScope { userId: string; chatId: string; actorId: string; }
/** Exact private token. A cloned DTO never carries actor authority. */
export interface ActorGrant { readonly __actorGrant?: never; }
export interface NativeActorContextPorts {
    context(): unknown;
    userId(): string;
    isCurrent(): boolean;
    signal?: AbortSignal;
    selectActor?: (context: unknown) => string | null;
    /** Host-only exact accepted publication may project original mes/swipe fields; labels remain native. */
    projectMessage?: (message: unknown, index: number) => unknown;
    authorizePresence(presence: WorkflowArtifact, request: {actorId: string; sceneId: string; sourceId: string; revision: string}): Result<{source: {sourceId: string; revision: string; sceneId: string; watch?: unknown}} >;
    authorizeHolderEvent?: (exactEvent: WorkflowArtifact, request: {actorId: string}) => Result<{source: {sourceId: string; revision: string; sceneId: string; watch?: string}; actorId: string; eventId: string}>;
    readMemories?: (actorId: string, request: {scope: ActorScope; presence: WorkflowArtifact; grant: ActorGrant; signal?: AbortSignal}) => Result<ActorMemoryContext[]> | Promise<Result<ActorMemoryContext[]>>;
}
export interface NativeActorContext {
    authorizeActor(actorId: string, exactPresence: WorkflowArtifact): Result<{grant: ActorGrant; scope: ActorScope}>;
    /** Default native file scope; never authorizes a different actor or portable label. */
    authorizeSelectedActor(): Result<{grant: ActorGrant; scope: ActorScope}>;
    authorizeEventInputs(node: NativeNode, inputs: Record<string, WorkflowArtifact>): Result<{grant?: ActorGrant; scope?: ActorScope}>;
    captureScopedResult(exactRawResult: unknown, exactGrant: ActorGrant): Result<{retained: true}>;
    checkActorGrant(exactGrant: ActorGrant): Result<{scope: ActorScope}>;
    /** Bounded conversation and card projection of this exact captured actor grant, without memory reads. */
    captureSourceContext(exactGrant: ActorGrant, options?: {prefix?: unknown[]}): Result<{artifact: import('./operations/context-data').RuntimeContext; grant: ActorGrant; isCurrent(): boolean}>;
    actorContext(actorId: string, request: ActorContextRequest, exactPresence: WorkflowArtifact): Promise<Result<ScopedActorContext>>;
    retainScopedArtifact(exactFrozenArtifact: WorkflowArtifact, exactGrant: ActorGrant): Result<{retained: true}>;
    authorizeModelInputs(inputs: Record<string, WorkflowArtifact>): Result<{scope: null} | {scope: ActorScope; grant: ActorGrant}>;
    retainScopedOutput(inputs: Record<string, WorkflowArtifact>, exactFrozenArtifact: WorkflowArtifact, producer?: {rawResult: unknown; portId: string}): Result<{retained: true}>;
    retainGuidance(payload: {node: NativeNode; inputs: Record<string, WorkflowArtifact>; artifact: WorkflowArtifact; rawResult: unknown}): Result<{retained: true}>;
    authorizeGuidance(exactGuidance: WorkflowArtifact): Result<{authorized: true; scope: ActorScope}>;
    release(): void;
}
export function createNativeActorContext(ports: NativeActorContextPorts): Result<NativeActorContext>;
