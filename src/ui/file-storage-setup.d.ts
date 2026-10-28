import type {ServerFileAccess} from './server-file-access';
import type {HostFileStore} from './host-file-store';
export type FileStorageChoice='inside'|'anywhere';
export interface FileStorageSetupView {
 open:boolean;choice:FileStorageChoice|null;effectiveMode:FileStorageChoice;
 status:'checking'|'ready'|'missing'|'incompatible'|'denied'|'unreachable';
 step:'choice'|'download'|'install'|'restart'|'verify'|'complete';
 hostId:string;userId:string;local:boolean;error:string;preferenceError:string;
}
export interface FileStorageSetup {
 ready:Promise<void>;view():FileStorageSetupView;subscribe(listener:()=>void):()=>void;
 open():Promise<void>;choose(choice:FileStorageChoice):Promise<void>;check():Promise<void>;cancel():Promise<void>;
 next():Promise<void>;back():Promise<void>;download():Promise<void>;dispose():void;
}
export function createFileStorageSetup(options:{access:ServerFileAccess;preferences:Pick<HostFileStore,'read'|'write'>;getHost:()=>{hostId:string;userId:string;local?:boolean}|null;downloadSetup?:()=>Promise<void>}):FileStorageSetup;
