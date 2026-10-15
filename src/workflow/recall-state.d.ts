import type { Result, WorkflowError, WorkflowPhase } from './types';
export interface RecallScope { readonly userId:string; readonly chatId:string; readonly workflowId:string; readonly actorId:string; }
export type RecallTarget='reply'|'swipe'|'both';
export type RecallUsePolicy='next-match'|'one-per-type'|'until-disarmed';
export interface RecallHotkey { readonly code:string; readonly ctrl:boolean; readonly alt:boolean; readonly shift:boolean; readonly meta:boolean; }
export interface RecallQueueProposal { readonly schemaVersion:1; readonly type:'recall-arm-proposal'; readonly actorId:string; readonly memorySetId:string; readonly target:RecallTarget; readonly uses:RecallUsePolicy; readonly consumeOn:'success'|'accepted'; readonly hotkey:RecallHotkey; }
export interface RecallGeneration { readonly generationId:string; readonly kind:'reply'|'swipe'; readonly stage:WorkflowPhase; readonly newlyGenerated:boolean; }
/** One synchronous host-owned snapshot, coherent at callback return; null means no owned generation. */
export interface RecallAuthority { readonly scope:RecallScope; readonly generation:RecallGeneration|null; }
export interface RecallAutomaticTrigger { readonly kind:'keyword'|'event'|'character'; readonly sourceId:string; readonly revision:string; readonly eventIds:readonly string[]; }
export interface RecallActivation { readonly schemaVersion:1; readonly type:'recall-activation'; readonly activationId:string; readonly scope:RecallScope; readonly memorySetId:string; readonly generationId:string; readonly generationType:'reply'|'swipe'; readonly stage:WorkflowPhase; readonly origin:'manual'|'keyword'|'event'|'character'; readonly sourceId?:string; readonly revision?:string; readonly eventIds?:readonly string[]; readonly requestId?:string; }
declare const liveRecallClaim:unique symbol;
/** Exact live object only: cloning or importing a claim never grants settlement authority. */
export interface RecallClaim { readonly [liveRecallClaim]:true; readonly claimId:string; }
export interface RecallRequestState extends RecallQueueProposal { readonly requestId:string; readonly scope:RecallScope; readonly queued:boolean; readonly remaining:{readonly reply:boolean;readonly swipe:boolean}; readonly pendingGenerationIds:readonly string[]; readonly pendingGenerationCount:number; readonly pendingState:null|'generation'|'acceptance'; }
export type RecallActivationResult={readonly status:'activated';readonly activation:RecallActivation;readonly claim:RecallClaim}|{readonly status:'skipped'|'unresolved';readonly reason:WorkflowError};
export interface RecallState {
 current():Result<RecallScope>;
 queue(proposal:RecallQueueProposal):Result<RecallRequestState>;
 changeQueues(request:{action:'queue';proposals:readonly RecallQueueProposal[]}|{action:'cancel';memorySetIds:readonly string[]}):Result<{changedMemorySetIds:readonly string[]}>;
 activate(request:{actorId:string;memorySetId:string;target:RecallTarget;automatic?:RecallAutomaticTrigger}):Result<RecallActivationResult>;
 checkClaim(claim:RecallClaim,options?:{stage?:WorkflowPhase}):Result<RecallActivation>;
 /** Failed/cancelled work releases the reservation. Success consumes only a success policy;
  * accepted consumes an accepted policy. Later outcomes never refund an already consumed use.
  * The host must call succeeded only at its selected successful owned-generation/workflow boundary.
  */
 settle(claim:RecallClaim,outcome:{status:'succeeded'|'accepted'|'failed'|'cancelled'}):Result<{status:string;consumed:boolean}>;
 /** Exact trusted cleanup only: revoke without current scope authority; never consume/refund. */
 releaseClaim(claim:RecallClaim):Result<{status:string;consumed:boolean}>;
 cancel(memorySetId:string):Result<RecallRequestState>;
 inspect():Result<{scope:RecallScope;requests:readonly RecallRequestState[];activationCount:number}>;
 release():void;
}
/** Trusted factory port. Return both facets from the same live owner, after any callback side effects.
 * Do not combine independently sampled or separately callback-driven scope/generation evidence.
 * Graph data cannot provide this function or restore the session. Each authority-bearing action invokes it once, then
 * performs callback-free ownership/reservation/signal checks; no fallback split callbacks are accepted.
 */
export interface RecallStatePorts { getAuthority:()=>RecallAuthority; signal?:AbortSignal; }
export function validateRecallScope(raw:unknown):Result<RecallScope>;
export function validateRecallQueueProposal(raw:unknown):Result<RecallQueueProposal>;
/** Ephemeral bounded session: restart begins without queued recall, 64 live requests and 1024 generation identities.
 * Factories are captured user/chat/workflow/actor scopes; actor changes require another session.
 */
export function createRecallState(ports:RecallStatePorts):Result<RecallState>;

/** Bounded physical-key controls independent of actor/memory selection. */
export function validateRecallHotkey(raw: unknown): Result<RecallQueueProposal['hotkey']>;
