import type {DocumentHistoryPage} from '../workflow/document-history';
import type {Result} from '../workflow/operations/json-data';
import type {RecordFormat} from '../workflow/operations/format-records';
import type {ArtifactVisibility} from '../workflow/artifact-privacy';
import type {FileBackendPorts,StorageScope,StoredDocument} from '../workflow/file-store';

export interface NodeFileBindingView {
    bindingId:string;
    name:string;
    format:RecordFormat;
    status:'ready'|'permission-required'|'unavailable';
}
export interface NodeFileDefinition {
    targetId:string;
    bindingId:string;
    name:string;
    format:RecordFormat;
    content:string;
    missing:'create'|'error';
    visibility:ArtifactVisibility;
}
export interface NodeFileHandle {
    readonly kind?:'file';
    readonly name:string;
    queryPermission?:(descriptor:{mode:'readwrite'})=>Promise<'granted'|'denied'|'prompt'>;
    isSameEntry?:(other:NodeFileHandle)=>Promise<boolean>;
    getFile:()=>Promise<{size:number;lastModified?:number;text:()=>Promise<string>}>;
    createWritable:()=>Promise<{write:(content:string)=>Promise<void>;close:()=>Promise<void>;abort?:()=>Promise<void>}>;
}
export interface NodeFileStoredBinding {
    bindingId:string;
    name:string;
    format:RecordFormat;
    generation:string;
    handle:NodeFileHandle;
    initializeEmpty?:boolean;
}
/** This origin-local state contains native handles. Never serialize it to graph JSON. */
export interface NodeFilePersistentState {
    bindings:NodeFileStoredBinding[];
    records:Record<string,unknown>;
}
export interface NodeFilePersistence {
    load:()=>Promise<NodeFilePersistentState|undefined>;
    /** Resolve only after atomic durable completion of the entire state replacement. */
    save:(state:NodeFilePersistentState)=>Promise<void>;
}
export interface NodeFilePickerOptions {
    types:{description:string;accept:Record<string,string[]>}[];
    multiple?:false;
    mode?:'readwrite';
    suggestedName?:string;
}
export interface NodeFileAccessOptions {
    showOpenFilePicker?:(options:NodeFilePickerOptions)=>Promise<NodeFileHandle[]>;
    showSaveFilePicker?:(options:NodeFilePickerOptions)=>Promise<NodeFileHandle>;
    indexedDB?:IDBFactory;
    persistence?:NodeFilePersistence;
    onChange?:()=>void;
}
export interface NodeFileBackend extends FileBackendPorts {
    /** Trusted host migration only: associate checked same-scope metadata when effective disk bytes and format match. */
    adoptLegacy:(targetId:string,request:{snapshot:StoredDocument&{scope:StorageScope};pages:Record<string,DocumentHistoryPage>})=>Promise<Result<{adopted:boolean}>>;
}
export interface NodeFileAccess {
    readonly supported:boolean;
    readonly native:boolean;
    readonly ready:Promise<Result<{persistent:true}>>;
    snapshot:()=>Record<string,NodeFileBindingView>;
    subscribe:(listener:()=>void)=>()=>void;
    /** Starts its picker synchronously. bindingId authorizes only same-file format reconfiguration; a different physical file gets a fresh identity. Never writes document contents. */
    choose:(settings:{mode:'open'|'save';bindingId?:string;name:string;format:RecordFormat})=>Promise<Result<{bindingId:string;name:string}>&{cancelled?:true}>;
    /** Captures handle identities and never requests permission during execution. */
    backend:(definitions:NodeFileDefinition[],controls:{scope:StorageScope;isCurrent:()=>boolean;signal?:AbortSignal})=>NodeFileBackend;
}
export function createNodeFileAccess(options?:NodeFileAccessOptions):NodeFileAccess;
export function getNodeFileAccess():NodeFileAccess;
export function setNodeFileAccess(adapter?:NodeFileAccess|null):void;
