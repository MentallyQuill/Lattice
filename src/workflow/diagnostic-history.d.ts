import type {NodeAddress, BindingSummary, ReportedUsage} from './types';
export type DiagnosticResult<T> = {readonly ok:true; readonly data:T} | {readonly ok:false; readonly error:{readonly code:string; readonly message:string}};
export interface DiagnosticScope {userId:string; chatId:string|number; characterId?:string|number|null; groupId?:string|number|null;}
export interface DiagnosticOrigin extends DiagnosticScope {workflowId:string; workflowName:string; runId:string; mode:'root'|'target'; native:boolean; startedAt:number;}
export interface DiagnosticError {
    code:string; message:string; truncated?:boolean; address?:NodeAddress; nodeId?:string; inputPortId?:string;
    findings?:{path:string; keyword:string; message:string}[];
    details?:{generationType:'normal';sourceReason:'USER_MESSAGE_REQUIRED'}|{generationType:'swipe';sourceReason:'ASSISTANT_REPLY_REQUIRED'|'ASSISTANT_REPLY_INCOMPLETE'|'ASSISTANT_TEXT_REQUIRED'|'TOOL_REPLY_UNSUPPORTED'|'MEDIA_REPLY_UNSUPPORTED'|'SWIPE_HISTORY_REQUIRED'};
}
export interface DiagnosticAttempt {
    address:NodeAddress; attempt:number; status?:string; startedAt?:number; durationMs?:number;
    finish?:string|null; usage?:ReportedUsage|null; binding?:BindingSummary;
    response?:{text?:string; truncated?:boolean; omitted?:string; visibility:'public'|'actor-private'|'hidden'; actorId?:string};
    error?:DiagnosticError; validationError?:DiagnosticError;
    retry?:{reasonCode:string; delayMs:number; nextAttempt:number};
}
export interface DiagnosticLog {version:1; id:string; origin:DiagnosticOrigin; endedAt:number; status:string; error?:DiagnosticError; failures?:DiagnosticError[]; actualCalls:number; callBound:number; attempts:DiagnosticAttempt[]; truncated?:boolean;}
export interface DiagnosticCapture {
    /** Live text-capture lease: false for metadata captures and after revocation or finish. */
    readonly captureResponses:boolean;
    event(event:unknown):void; model(event:unknown):void; finish(result:unknown):Promise<DiagnosticResult<unknown>>; discard():void;
}
export interface DiagnosticStatus {persistent:boolean|null; issue:string;}
/** Full completion capture is opt-in at the host; direct callers keep the legacy full default. */
export interface DiagnosticCaptureOptions {mode:'full'|'metadata';}
export interface DiagnosticStoreContext {readonly revision:number; wasClearedSince(scopeKey:string,revision:number):boolean; clear(scopeKey:string):void;}
export interface DiagnosticStore {read(userId:string):Promise<unknown[]>; update(userId:string,transform:(entries:unknown[],context?:DiagnosticStoreContext)=>DiagnosticLog[],options?:{signal?:AbortSignal}):Promise<unknown[]>; revision?(userId:string):Promise<number>; status?():DiagnosticStatus;}
export interface DiagnosticHistory {
    begin(origin:DiagnosticOrigin,options?:DiagnosticCaptureOptions):DiagnosticCapture|null;
    list(scope:DiagnosticScope):Promise<DiagnosticResult<{entries:DiagnosticLog[]}>>;
    clear(scope:DiagnosticScope):Promise<DiagnosticResult<unknown>>;
    export(scope:DiagnosticScope):Promise<DiagnosticResult<{text:string; fileName:string}>>;
    discardActive():void;
    subscribe(listener:()=>void):()=>void;
    status():DiagnosticStatus;
}
export function createDiagnosticHistory(options?:{store?:DiagnosticStore; indexedDB?:IDBFactory|null; onChange?:()=>void}):DiagnosticHistory;
export const DIAGNOSTIC_RUN_BYTES:number;
export const DIAGNOSTIC_TEXT_BYTES:number;
export const DIAGNOSTIC_USER_BYTES:number;
export const DIAGNOSTIC_USER_RUNS:number;
