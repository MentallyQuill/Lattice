import type {Result} from '../workflow/operations/json-data';
import type {RecordFormat} from '../workflow/operations/format-records';
import type {StorageScope} from '../workflow/file-store';
import type {NodeFileBackend,NodeFileDefinition,NodeFileCapabilities} from './node-file-access';
export interface ServerFileBindingView {
    bindingId:string;
    name:string;
    format:RecordFormat;
    path:string;
    generation:string;
    status:'ready'|'permission-required'|'unavailable';
    storage:'server';
}
export interface ServerFileAccess {
    readonly storage:'server';
    readonly native:false;
    readonly capabilities:NodeFileCapabilities;
    readonly supported:boolean;
    readonly availability:{code:string;message:string}|null;
    readonly serviceVersion:{apiVersion:1;chooserVersion:0|1}|null;
    roots:()=>Promise<Result<{chooserVersion:1;roots:{name:string;path:string}[]}>>;
    browse:(settings:{path:string})=>Promise<Result<ServerFileDirectory>>;
    readonly location:{basePath:string;platform:string;canUseAbsolutePaths:boolean}|null;
    readonly ready:Promise<Result<{persistent:true}>>;
    refresh:()=>Promise<Result<{persistent:true}>>;
    snapshot:()=>Record<string,ServerFileBindingView>;
    subscribe:(listener:()=>void)=>()=>void;
    choose:(settings:{mode:'open'|'save';name:string;format:RecordFormat;path?:string;bindingId?:string})=>Promise<Result<ServerFileBindingView>>;
    backend:(definitions:NodeFileDefinition[],controls:{scope:StorageScope;isCurrent:()=>boolean;signal?:AbortSignal;branchBinding?:import('../workflow/chat-prefix-binding').ChatSourceBinding;getBranchBinding?:()=>import('../workflow/chat-prefix-binding').ChatSourceBinding|null|undefined})=>NodeFileBackend;
}
export interface ServerFileDirectory {
 chooserVersion:1;path:string;parent:string|null;truncated:boolean;
 entries:{name:string;path:string;kind:'directory'|'file'}[];
}
export function createServerFileAccess(options:{fetch?:typeof fetch;getContext:()=>{getRequestHeaders?:()=>Record<string,string>};getUserId:()=>string|undefined|null}):ServerFileAccess;
/** Clone plain transport JSON without invoking accessors; bounded to 2 MiB, depth 32 and 10,000 values. */
export function cloneServerFileData(value:unknown):unknown|undefined;
