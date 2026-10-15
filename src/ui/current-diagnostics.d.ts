import type { NodeAddress, WorkflowError, RunPlan, Recording, RunState } from '../workflow/types';
export interface CurrentRunDiagnostics { readonly attemptId:string; readonly documentKey:string; readonly nodes:readonly {readonly key:string; readonly address:NodeAddress; readonly error:WorkflowError; readonly inputPortId?:string}[]; }
/** Metadata-only canvas projection. Session checks exact document, semantic epoch and attempt ownership before publishing. */
export function projectCurrentDiagnostics(source:{attemptId:string;documentKey:string;plan?:RunPlan;recording?:Recording;error?:unknown;runState?:RunState}):CurrentRunDiagnostics|null;
