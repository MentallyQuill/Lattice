import type {NativeGraph3,Result} from '../workflow/types';
import type {WorkflowExampleMetadataV1} from '../workflow/example-metadata';
import type {LibrarySource,SavedWorkflow,WorkflowLibrary,WorkflowLibraryCapabilities} from './workflow-library';
export interface WorkflowActivationToken {readonly graph:NativeGraph3;readonly workspaceViews:unknown}
export interface WorkflowSessionPort {
 current():NativeGraph3|null;
 source():LibrarySource|{kind?:string;name?:string;[key:string]:unknown}|null;
 capture():WorkflowActivationToken|null;
 stillCurrent(token:WorkflowActivationToken|null):boolean;
 snapshot():string;
 dirty():boolean;
 workspaceViews():unknown;
 exampleMetadata?():WorkflowExampleMetadataV1|undefined;
 draftNamespace():string|null;
 markSaved(token:WorkflowActivationToken|null,snapshot:string,source:LibrarySource):boolean;
 activate(graph:NativeGraph3,options?:WorkflowActivationOptions):unknown;
}
export interface WorkflowActivationOptions {source?:LibrarySource;workspaceViews?:unknown;exampleMetadata?:WorkflowExampleMetadataV1;clean?:boolean}
export interface WorkflowAutosaveStatus {state:string;result?:Result<unknown>}
export interface WorkflowAutosaveView extends WorkflowAutosaveStatus {deferred:boolean;saving:boolean;storage:'host';capabilities?:WorkflowLibraryCapabilities;label:string}
export interface AutosaveDraft {source:LibrarySource|null;snapshot:string;json?:string}
export interface WorkflowAutosave {
 changed():void;
 flush():Promise<Result<unknown>>;
 refresh():Promise<Result<unknown>>;
 view():WorkflowAutosaveView;
 recovery():AutosaveDraft[];
 dispose():void;
}
export interface WorkflowAutosaveOptions {
 session:WorkflowSessionPort;
 library:Pick<WorkflowLibrary,'save'|'read'|'adopt'> & Partial<Pick<WorkflowLibrary,'capabilities'>>;
 isBusy?:()=>boolean;
 activate?:(graph:NativeGraph3,options:WorkflowActivationOptions)=>unknown;
 onStatus?:(status:WorkflowAutosaveStatus)=>void;
 getContext?:()=>unknown;
 canAdopt?:()=>boolean;
 onAdopt?:(id:string,context:unknown)=>Promise<Result<unknown>>;
 delay?:number;
}
export function createWorkflowAutosave(options:WorkflowAutosaveOptions):WorkflowAutosave;
