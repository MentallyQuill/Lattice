import type {NativeGraph3,Result} from '../workflow/types';
import type {LibraryEntry,LibrarySource,SavedWorkflow,WorkflowLibrary,WorkflowLibraryCapabilities} from './workflow-library';
import type {AutosaveDraft,WorkflowActivationOptions,WorkflowAutosaveStatus,WorkflowAutosaveView,WorkflowSessionPort} from './workflow-autosave';
export interface WorkflowSelection {kind:'library';id:string}
export type WorkflowCommandResult<T=unknown> = Result<T>|{ok:false;cancelled:true};
export interface WorkflowLibraryController {
 openSaved(id:string):Promise<WorkflowCommandResult>;
 save():Promise<WorkflowCommandResult>;
 saveAs(name?:string):Promise<WorkflowCommandResult>;
 downloadCopy():Promise<WorkflowCommandResult>;
 beforeRun():Promise<WorkflowCommandResult>;
 changed():void;
 refresh():Promise<Result<unknown>>;
 flush():Promise<Result<unknown>>;
 reloadList():Promise<Result<LibraryEntry[]>>;
 restoreSelection():Promise<WorkflowCommandResult>;
 getWorkflowIdentity():string|null;
 view():{items:LibraryEntry[];source:ReturnType<WorkflowSessionPort['source']>;selected:WorkflowSelection|null;status:WorkflowAutosaveStatus;dirty:boolean;busy:boolean;commandBusy:boolean;autosave:WorkflowAutosaveView;capabilities:WorkflowLibraryCapabilities};
 recovery():AutosaveDraft[];
 subscribe(listener:()=>void):()=>void;
 dispose():void;
}
export function createWorkflowLibraryController(options:{
 session:WorkflowSessionPort;library:WorkflowLibrary;getContext?:()=>unknown;isBusy?:()=>boolean;isBusyView?:()=>boolean;canAdopt?:()=>boolean;
 activate?:(graph:NativeGraph3,options:WorkflowActivationOptions)=>unknown;
 persistSelection?:(value:WorkflowSelection,context:unknown)=>Promise<Result<{acknowledged:true}>>;
 getSelection?:()=>WorkflowSelection|null;
 replace?:(load:()=>Promise<Result<SavedWorkflow>>,clean:boolean,options?:{reloadAfterSave?:boolean;isCurrent?:()=>boolean})=>Promise<WorkflowCommandResult>;
 downloadCopy?:(json:string,name:string)=>Promise<WorkflowCommandResult>;
 prompt?:(name:string)=>Promise<'save'|'discard'|'cancel'>;
 changed?:()=>void;delay?:number;
}):WorkflowLibraryController;
