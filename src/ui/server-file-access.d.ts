import type {Result} from '../workflow/operations/json-data';
import type {RecordFormat} from '../workflow/operations/format-records';
import type {StorageScope} from '../workflow/file-store';
import type {NodeFileBackend,NodeFileDefinition} from './node-file-access';
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
    readonly supported:boolean;
    readonly availability:{code:string;message:string}|null;
    readonly location:{basePath:string;platform:string;canUseAbsolutePaths:boolean}|null;
    readonly ready:Promise<Result<{persistent:true}>>;
    refresh:()=>Promise<Result<{persistent:true}>>;
    snapshot:()=>Record<string,ServerFileBindingView>;
    subscribe:(listener:()=>void)=>()=>void;
    choose:(settings:{mode:'open'|'save';name:string;format:RecordFormat;path?:string;bindingId?:string})=>Promise<Result<ServerFileBindingView>>;
    backend:(definitions:NodeFileDefinition[],controls:{scope:StorageScope;isCurrent:()=>boolean;signal?:AbortSignal})=>NodeFileBackend;
}
export function createServerFileAccess(options:{fetch?:typeof fetch;getContext:()=>{getRequestHeaders?:()=>Record<string,string>};getUserId:()=>string|undefined|null}):ServerFileAccess;
/** Clone plain transport JSON without invoking accessors; bounded to 2 MiB, depth 32 and 10,000 values. */
export function cloneServerFileData(value:unknown):unknown|undefined;
