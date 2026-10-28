import type {Result} from '../workflow/operations/json-data';
import type {StorageScope} from '../workflow/file-store';
import type {NodeFileAccess,NodeFileDefinition} from './node-file-access';
import type {HostFileStore} from './host-file-store';
export interface HostFileAccess extends NodeFileAccess {
 readonly storage:'host';
 readonly native:false;
 /** Trusted runtime only. Persists scoped binding metadata without creating output bytes or using imported binding authority. */
 ensureManaged:(definition:NodeFileDefinition,controls:{scope:StorageScope;isCurrent:()=>boolean;managed?:true})=>Promise<Result<NodeFileDefinition>>;
}
export function createHostFileAccess(options:{store:HostFileStore;getUserId:()=>string|null|undefined}):HostFileAccess;
