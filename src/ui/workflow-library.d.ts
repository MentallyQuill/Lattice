import type {NativeGraph3,Result} from '../workflow/types';
import type {WorkflowExampleMetadataV1} from '../workflow/example-metadata';
export interface LibrarySource {kind:'library';id:string;name:string;revision:string}
export interface LibraryEntry {id:string;name:string}
export interface WorkflowDocumentData {graph:NativeGraph3;workspaceViews:unknown;exampleMetadata?:WorkflowExampleMetadataV1}
export interface SavedWorkflow extends WorkflowDocumentData,LibraryEntry {revision:string;json:string;source:LibrarySource;acknowledged?:true;concurrency?:'verified-write'}
export interface WorkflowLibraryCapabilities {persistent:true;actualFiles:true;verifiedAcknowledgement:true;concurrency:'verified-write';crossDeviceCAS:false}
export interface LibraryStoreRead {content:string;revision:string|null;exists:boolean;name?:string;path?:string}
export interface WorkflowLibraryStore {
 read(name:string):Promise<Result<LibraryStoreRead>>;
 write(request:{name:string;expectedRevision:string|null;content:string;intentId:string}):Promise<Result<LibraryStoreRead & {acknowledged?:boolean}>>;
}
export interface LibraryDraft {id:string;json:string;expectedRevision:string|null;intentId:string}
export interface WorkflowLibrary {
 list():Promise<Result<LibraryEntry[]>>;
 read(id:string):Promise<Result<SavedWorkflow>>;
 save(request:{id:string;expectedRevision:string|null;json:string}):Promise<Result<SavedWorkflow & {acknowledged:true}>>;
 saveAs(request:{json:string;name?:string}):Promise<Result<SavedWorkflow & {acknowledged:true}>>;
 adopt(request:{json:string;name?:string}):Promise<Result<SavedWorkflow & {acknowledged:true}>>;
 recovery():LibraryDraft[];
 subscribe(listener:(event:{type:'saved';id:string;name:string;revision:string})=>void):()=>void;
 readonly capabilities:WorkflowLibraryCapabilities;
}
export function createWorkflowLibrary(options:{store:WorkflowLibraryStore;serialize?:(graph:NativeGraph3,views?:unknown,options?:{exampleMetadata?:WorkflowExampleMetadataV1})=>Result<{json:string}>;parse?:(json:string)=>Result<WorkflowDocumentData>;createId?:()=>string;getScope?:()=>unknown}):WorkflowLibrary;
