import type {Result} from './types';
import type {JsonValue} from './operations/json-data';
import type {Scope} from './source-manifests';
import type {NativePersistenceVerifier} from './native-persistence';
import type {NativeSourceIdentity} from './native-source-identity';
export interface NativeSourceMessage {mes:string;[key:string]:unknown;}
export interface NativeSourceContext {
 chatId?:string;
 getCurrentChatId?:()=>string;
 chat:NativeSourceMessage[];
 chatMetadata:Record<string,unknown>;
 groupId?:unknown;
}
/** Trusted host-only adapter. Callbacks must prove immutability and uniqueness;
 * arbitrary native extra.id/gen_id fields do not satisfy this contract. */
export interface NativeSourceIdentityAdapter {
 kind:string;
 getImmutableId?:(message:NativeSourceMessage)=>string|null|undefined;
 getBirthAnchor?:(message:NativeSourceMessage)=>string|null|undefined;
}
export interface NativeSourceInvalidation {
 readonly scope:Scope;
 readonly reason:'SOURCE_CHANGED'|'SOURCE_IDENTITY_AMBIGUOUS';
 /** At most 128 changes per callback, without source prose. */
 readonly changes:readonly {sourceId:string;priorRevision:string;nextRevision:string|null;tombstone:boolean}[];
}
export interface NativeSourceRegistryPorts {
 getContext:()=>NativeSourceContext;
 getUserId:()=>string|undefined;
 /** Absent means no same-chat branch support; no branch ID is invented. */
 getBranchId?:()=>string|undefined;
 persistenceVerifier:NativePersistenceVerifier;
 randomId?:()=>string;
 identityAdapter?:NativeSourceIdentityAdapter;
 onInvalidated?:(invalidation:NativeSourceInvalidation)=>void;
}
export interface NativeSourceRegistryStatus {
 readonly scope:Scope;
 readonly revision:string|null;
 readonly status:'setup-required'|'unverified'|'pending'|'acknowledged';
 readonly retainedSources:number;
 readonly activeSources:number;
}
/** Observed native save/readback confirmation, never server CAS or coverage authority. */
export interface NativeSourceRegistryCommit extends NativeSourceRegistryStatus {
 readonly revision:string;
 readonly sourceEpoch:string;
 readonly orderRevision:string;
 readonly acknowledged:true;
 readonly persistence:'confirmed';
 readonly rebuildRequired?:true;
 readonly priorPersistence?:'confirmed'|'unknown'|'unverified';
}
declare const nativeSnapshotBrand:unique symbol;
/** Private WeakMap-branded host value. Never export through workflow DTOs or artifacts. */
export interface NativeSourceSnapshot {
 readonly [nativeSnapshotBrand]:true;
 readonly scope:Scope;
 readonly revision:string;
 readonly sourceEpoch:string;
 readonly orderRevision:string;
 readonly sourceSetId:string;
 readonly snapshotId:string;
}
export interface NativeSourceSnapshotEntry extends Omit<NativeSourceIdentity,'fingerprint'> {readonly sourceId:string;readonly ordinal:number;}
/** Internal reader-only immutable view; each inspection rechecks native freshness. */
export interface NativeSourceSnapshotView {
 /** Fresh complete native head versus an explicitly owned fixed prefix. */
 readonly currentHead:boolean;
 readonly scope:Scope;
 readonly revision:string;
 readonly sourceEpoch:string;
 readonly orderRevision:string;
 readonly sourceSetId:string;
 readonly snapshotId:string;
 readonly selector:JsonValue;
 readonly selectorHash:string;
 readonly entries:readonly NativeSourceSnapshotEntry[];
}
export interface NativeSourceRegistry {
 inspect():Result<NativeSourceRegistryStatus>;
 /** Trusted owned Send only: verified prefix plus new user, optionally preceded by its settled reply. */
 synchronizeNativeAppend(chat:readonly NativeSourceMessage[],controls?:{signal?:AbortSignal}):Promise<Result<NativeSourceRegistryCommit>>;
 synchronize(command:{expectedRevision:string|null;cause:'enroll'|'host-change'|'explicit-reconcile'},controls?:{signal?:AbortSignal}):Promise<Result<NativeSourceRegistryCommit>>;
 /** chat must be the exact native array or a dense prefix of exact native objects. */
 capture(options:{chat:readonly NativeSourceMessage[];scope:Scope;selector:JsonValue;signal?:AbortSignal;isCurrent:()=>boolean;allowPrefixAppend?:()=>boolean}):Result<NativeSourceSnapshot>;
 /** Explicit read-only recovery; never saves or allocates IDs. */
 verifyPending(controls?:{signal?:AbortSignal}):Promise<Result<NativeSourceRegistryCommit>>;
 /** Explicit user-invoked logical namespace recovery; retains tombstones and never retargets prior receipts. */
 resetSourceEpoch(command:{expectedRevision:string;reason:'identity-ambiguity'|'unrecoverable-pending-save';confirmRebuild:true},controls?:{signal?:AbortSignal}):Promise<Result<NativeSourceRegistryCommit>>;
 release():void;
}
export function createNativeSourceRegistry(ports:NativeSourceRegistryPorts):NativeSourceRegistry;
/** Import only in trusted internal readers. Copied snapshots cannot reconstruct the brand. */
export function inspectNativeSourceSnapshot(snapshot:unknown):Result<NativeSourceSnapshotView>;
