import type {WorkflowLibrary,WorkflowLibraryStore} from './workflow-library';
export interface WorkflowExampleOrigin {schemaVersion:1;exampleId:string;actorBindings?:Record<string,string>;/** Trusted identity last used to normalize the authored example nodes. */fileWorkflowId?:string}
export interface WorkflowExampleOrigins {get(graph:object):WorkflowExampleOrigin|null;remember(graph:object,origin:WorkflowExampleOrigin):{ok:boolean;error?:{code:string;message:string}};read(id:string,graph:object):Promise<any>;write(id:string,origin:WorkflowExampleOrigin):Promise<any>}
export function createWorkflowExampleOrigins(ports:{store:WorkflowLibraryStore;getUserId:()=>string|null|undefined}):WorkflowExampleOrigins;
export function withWorkflowExampleOrigins(library:WorkflowLibrary,origins:WorkflowExampleOrigins,session:{current():object;capture():object}):WorkflowLibrary;
