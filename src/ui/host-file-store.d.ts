import type {Result} from '../workflow/operations/json-data';
import type {NodeFileCapabilities} from './node-file-access';
export interface HostFileRead {name:string;path:string;content:string;revision:string|null;exists:boolean;}
export interface HostFileRecovery {attemptPath:string;previousPath?:string;}
export interface HostFileWrite extends HostFileRead {revision:string;exists:true;acknowledged:true;concurrency:'verified-write';recovery:HostFileRecovery;deduplicated?:true;}
export interface HostFileStore {
 readonly capabilities:NodeFileCapabilities;
 /** Missing files return exists:false and revision:null. Reads never use the browser cache. */
 read:(name:string)=>Promise<Result<HostFileRead>>;
 /** Names are safe ASCII logical names, not paths. expectedRevision:null requires a missing file. No atomic cross-device CAS is promised. */
 write:(request:{name:string;expectedRevision:string|null;content:string;intentId:string})=>Promise<Result<HostFileWrite>&{recovery?:HostFileRecovery}>;
}
export function createHostFileStore(options:{fetch?:typeof fetch;getRequestHeaders?:()=>Record<string,string>;getUserId:()=>string|null|undefined;/** UTF-8 limit, defaults to8MiB; maximum8MiB. */maxBytes?:number}):HostFileStore;
