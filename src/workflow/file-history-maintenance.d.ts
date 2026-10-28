import type {StoredDocument,StoredFileReceipt,StorageScope} from './file-store';
import type {Result} from './operations/json-data';
import type {ArtifactVisibility} from './artifact-privacy';
import type {DocumentHistoryHeader,DocumentHistoryPage} from './document-history';
import type {ChatSourceBinding} from './chat-prefix-binding';
export function prepareAcceptedFileMaintenance(snapshot:StoredDocument,options:{scope:StorageScope;visibility:ArtifactVisibility;historyHandling?:'replace'|'append';previousContent?:string}):Promise<Result<{content:string;receipts:StoredFileReceipt[];history:DocumentHistoryHeader;pages:Record<string,DocumentHistoryPage>}>>;
/** Trusted host only, never grants a destination binding. Source must match the exact verified branch prefix. */
export function prepareTrustedBranchSnapshot(request:{snapshot:StoredDocument&{scope:StorageScope};pages:Record<string,DocumentHistoryPage>;branchScope:StorageScope;branchBinding:ChatSourceBinding;visibility:ArtifactVisibility}):Promise<Result<{snapshot:StoredDocument&{scope:StorageScope};pages:Record<string,DocumentHistoryPage>;visibility:ArtifactVisibility}>>;
