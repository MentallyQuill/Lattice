import type {NativeSourceControllerActions,Result} from '../workflow/types';
export interface NativeSourceSetupView {key:string;status:'setup-required'|'unverified'|'pending'|'acknowledged'|'unavailable';activeSources:number;busy:boolean;notice:string;issue:string}
export function createNativeSourceSetup(env:{controller:()=>NativeSourceControllerActions|undefined;documentToken:()=>object|null;changed?:()=>void}):{snapshot():NativeSourceSetupView;execute(key:string,action:'setup'|'verify'|'reconcile'):Promise<Result<unknown>>;cancel():void};
