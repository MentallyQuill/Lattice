import type {Result,OperationResult,ScopedOutputRetention,WorkflowArtifact,ContextArtifact,DataArtifact} from './types';
import type {Scope} from './source-manifests';
import type {SourcePage,SourceMapping,SourceTurnGroup} from './source-reader';
declare const privateSourceBrand:unique symbol;
declare const privatePairingBrand:unique symbol;
/** Empty opaque run-local objects; no text, native references or authority in serialization. */
export interface PrivateSourceProof {readonly [privateSourceBrand]:true;}
export interface PrivatePairingProof {readonly [privatePairingBrand]:true;}
export interface PrivateSourceProofView {
 /** Must be true for current-head completeness/deletion consumers. */
 readonly currentHead:boolean;
 /** Opaque exact host cause lineage; never serialize or derive from trigger IDs. */
 readonly triggerCause?:object;
 readonly scope:Scope;
 readonly sourceEpoch:string;
 readonly selectorHash:string;
 readonly sourceSetId:string;
 readonly snapshotId:string;
 readonly mapping:readonly SourceMapping[];
 /** Transitive exact processed memberships, including zero-output transformations.
  * Describes preparation lineage only; never a receipt or completion/coverage proof. */
 readonly processedInputs?:readonly SourceMapping[];
}
export interface PrivatePairingProofView extends PrivateSourceProofView {
 readonly groups:readonly SourceTurnGroup[];
 readonly unpairedMemberIds:readonly string[];
}
export interface SourceProofRegistry {
 /** Only exact page.result from the privately branded current page is admitted. */
 registerReaderResult(result:OperationResult,page:SourcePage):Result<void>;
 /** Unknown operation results pass through without acquiring source authority.
  * Reader outputs require exact named port/kind/payload and the privacy-only
  * envelope normalization produced from this retention call's inputs. */
 retainOutput(payload:ScopedOutputRetention):Result<{retained:true}>;
 /** Exact retained out/records/manifest only. Cursor/report cannot supply mapping. */
 authorizeSource(artifact:WorkflowArtifact):Result<PrivateSourceProof>;
 /** Context and optional manifest must be retained from the same exact page. */
 authorizePairing(context:ContextArtifact,manifest?:DataArtifact):Result<PrivatePairingProof>;
 validateCurrent(artifact:WorkflowArtifact):Result<void>;
 /** Terminal revocation; a cleared registry never accepts more bindings. */
 clear():void;
}
export function createSourceProofRegistry(options:{signal?:AbortSignal;isCurrent:()=>boolean}):SourceProofRegistry;
/** Internal trusted consumers only; every access rechecks run, actor and native snapshot.
 * These describe current lineage, never receipts, coverage or omission authority. */
export function inspectSourceProof(handle:unknown):Result<PrivateSourceProofView>;
export function inspectPairingProof(handle:unknown):Result<PrivatePairingProofView>;
/** Internal trusted adapters only; deliberately absent from PrivateSourceCapability.
 * All parents must belong to one registry and share current scope/epoch/selector/set/snapshot
 * and exact trigger cause. The exact deeply frozen result is bound before runtime retention.
 * Ranges must be subsets of selected parent mappings. derived-only associations omit spans. */
export function bindSourceDerivation(result:OperationResult,options:{
 parents:readonly PrivateSourceProof[];
 processedMemberIds:readonly string[];
 mapping:readonly (SourceMapping & {readonly mapping:'exact'|'derived-only'})[];
}):Result<void>;
