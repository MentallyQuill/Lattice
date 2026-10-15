import type { DataArtifact, NativeNode, NodeAddress, OperationDescription, OperationDescriptor, OperationResult, Result, WorkflowPhase, WorkflowTarget } from '../types';
import type { RecallActivation, RecallQueueProposal, RecallClaim, RecallScope, RecallState } from '../recall-state';
export type RecallOperationId='recall'|'hotkey-arm';
export type RecallOperationDescriptor=OperationDescriptor&{operationVersion:1;minimumRuntime:2;rootOnly:true;hostOperation:true};
export interface RecallRecord { id:string; actorId:string; text:string; revision?:string; partnerIds?:string[]; tags?:string[]; eventId?:string; recency?:number; sourceRefs?:{id:string;revision:string}[]; scope?:RecallScope; visibility?:'public'|'actor-private'|{kind:'public'}|{kind:'actor-private';actorId:string}; }
export interface RecallNodeExecution {
 phase?:WorkflowPhase; root?:boolean; address?:NodeAddress; signal?:AbortSignal;
 /** Bounded target/preview execution cannot acquire live queueing or consumption effects. */
 preview?:boolean; dryRun?:boolean; target?:WorkflowTarget;
 recallState?:RecallState;
 /** Authenticate exact upstream Read File/Format/Memory material against its live provenance.
  * Authored record scope/labels alone are not source authority. No file is opened by this node.
  */
 authorizeRecallRecords?:(exactArtifact:DataArtifact,request:{readonly scope:RecallScope;readonly memorySetId:string})=>Result<{scope:RecallScope;memorySetId:string}>|Promise<Result<{scope:RecallScope;memorySetId:string}>>;
 /** Private host seam: retain exact claim until owned success/accepted settlement or cancellation.
  * The callback and claim must never enter graph outputs, recording or exported workflow JSON.
  */
 stageRecallClaim?:(claim:RecallClaim,activation:RecallActivation)=>Result<{staged:true}>|Promise<Result<{staged:true}>>;
 /** Registration is optional; portable node execution emits a proposal, never queues directly.
  * The host owns shortcut conflict/editable-focus policy, actual listener and scoped cleanup.
  */
 registerRecallHotkey?:(proposal:RecallQueueProposal)=>Result<{registered:true}>|Promise<Result<{registered:true}>>;
 countTokens?:(text:string)=>{tokens:number}|Promise<{tokens:number}>;
}
export const RECALL_OPERATIONS:Record<RecallOperationId,RecallOperationDescriptor>;
export function describeRecallNode(node:NativeNode|Record<string,unknown>,options?:{phase?:WorkflowPhase;authoring?:boolean}):Result<OperationDescription>;
/** Recall accepts explicit Data records, presence and configured source/event inputs.
 * Filters are deterministic actor/partner/tag/record identity and recency, with record/character/token
 * bounds. Outputs private Guidance on out, selected records on records and private omission metadata
 * on report. Zero matches/absent/no eligible queue skip; unresolved evidence holds; read failure fails.
 * Recall Shortcut has no input and emits a descriptive proposal Data, with optional trusted registration.
 */
export function executeRecallNode(node:NativeNode|Record<string,unknown>,inputs:Record<string,unknown>,local?:RecallNodeExecution):Promise<OperationResult>;
