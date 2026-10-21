import type {Result,OperationResult,ContextArtifact,DataArtifact} from './types';
import type {NativeSourceSnapshot} from './native-source-registry';
import type {Scope,SourceRef,Visibility,RecordV1,SourceManifestV1,ReaderCursorV1} from './source-manifests';
/** Internal host constructor port. isCurrent must recheck the actual native actor grant.
 * scope is the physical user/chat/branch scope of the registry, without actorId.
 * The host memoizes this handle for a reader/run; DTOs cannot install these ports. */
export interface SourceActorGrant {
 readonly actorId:string;
 readonly scope:Scope;
 isCurrent():boolean;
}
export interface SourceFrontierQuery {
 readonly scope:Scope;
 readonly sourceEpoch:string;
 readonly selectorHash:string;
 readonly sourceSetId:string;
}
/** A host/coordinator-owned current acknowledged processing frontier.
 * The constructor callback closes over the exact configured resource/workflow binding;
 * sourceSetId alone does not identify a durable checkpoint.
 * after:null means an acknowledged beginning. A missing handle is never a beginning. */
export interface ConfirmedSourceFrontier extends SourceFrontierQuery {
 readonly after:{readonly sourceId:string;readonly revision:string}|null;
 isCurrent():boolean;
}
export interface SourceReaderPorts {
 /** Restriction-only host choice: false omits the cursor port from the original branded result. */
 exposeCursor?:boolean;
 /** Constructor-only exact event/cadence cause (frozen empty opaque token); descriptive trigger JSON is insufficient. */
 getTriggerCause?:()=>{readonly cause:object;isCurrent():boolean}|null;
 getCharacterProjection?:()=>import('./native-source-projections').NativeCharacterProjection|null;
 getActorGrant?:(physicalScope:Scope)=>SourceActorGrant|null|undefined;
 getConfirmedFrontier?:(query:SourceFrontierQuery)=>ConfirmedSourceFrontier|null|undefined;
 signal?:AbortSignal;
 isCurrent?:()=>boolean;
}
export interface SourcePageRequest {
 selection:'recent'|'range'|'since-cursor'|'before-window';
 cursor?:ReaderCursorV1;
 range?:{firstSourceId:string;lastSourceId:string};
 /** Default 12. Entire verified groups may expand the requested recent boundary. */
 recentMessages?:number;
 /** Default 10 for before-window. Unpaired messages stay protected independently. */
 keepRecentAssistantTurns?:number;
 upperBoundary?:{keepRecentAssistantTurns:number};
 /** Obtain an acknowledged frontier from the constructor port; never from this request. */
 confirmed?:boolean;
 /** Explicitly accept append-only rebase after checking the complete old native prefix. */
 allowAppendRebase?:boolean;
 maxMessages:number;
 maxTextUnits:number;
}
export interface SourceReaderReport {
 schemaVersion:1;
 recordType:'source-reader-report';
 status:'complete'|'empty';
 pageMessages:number;
 selectedMessages:number;
 sourceSetMessages:number;
 completeness:'complete'|'page';
 rebased:boolean;
 actualCalls:0;
 networkReads:0;
 deletionEvidence:false;
}
export interface SourceReaderOutputs {
 readonly out:ContextArtifact;
 readonly records:DataArtifact & {readonly value:RecordV1[]};
 readonly manifest:DataArtifact & {readonly value:SourceManifestV1};
 readonly cursor?:DataArtifact & {readonly value:ReaderCursorV1};
 readonly report:DataArtifact & {readonly value:SourceReaderReport};
}
declare const sourcePageBrand:unique symbol;
/** Private WeakMap-branded result. Never export through workflow facade/recordings.
 * The host returns this exact result and registers it before runtime retention. */
export interface SourcePage {
 readonly [sourcePageBrand]:true;
 readonly outputs:SourceReaderOutputs;
 readonly result:OperationResult & {ok:true;outputs:SourceReaderOutputs};
}
export interface SourceMapping {
 /** Native snapshot order only, never identity; omitted for character projections. */
 readonly sourceOrder?:{readonly messageOrdinal:number;readonly orderRevision:string};
 readonly memberId:string;
 readonly revision?:string;
 readonly sourceRefs:readonly SourceRef[];
 readonly visibility:Visibility;
 /** Derived records retain every contributing native order; never select an arbitrary anchor. */
 readonly sourceOrders?:readonly {readonly sourceId:string;readonly revision:string;readonly messageOrdinal:number;readonly orderRevision:string;readonly eventOrdinal?:number}[];
 readonly mapping?:'exact'|'derived-only';
}
export interface SourceTurnGroup {
 readonly assistantTurnId:string;
 readonly memberIds:readonly string[];
}
/** Exact page bounded mapping and groups; all messages outside groups remain unpaired. */
export interface SourcePageView {
 readonly currentHead:boolean;
 readonly triggerCause?:object;
 readonly scope:Scope;
 readonly sourceEpoch:string;
 readonly selectorHash:string;
 readonly sourceSetId:string;
 readonly snapshotId:string;
 readonly mapping:readonly SourceMapping[];
 readonly groups:readonly SourceTurnGroup[];
 readonly unpairedMemberIds:readonly string[];
 readonly outputs:SourceReaderOutputs;
 readonly result:OperationResult & {ok:true;outputs:SourceReaderOutputs};
}
export interface SourceReader {
 selectSourcePage(snapshot:NativeSourceSnapshot,request:SourcePageRequest):Result<SourcePage>;
 release():void;
}
export function createSourceReader(ports?:SourceReaderPorts):SourceReader;
/** Public-only selection; registry capture remains mandatory and grants no acknowledgement. */
export function selectSourcePage(snapshot:NativeSourceSnapshot,request:SourcePageRequest):Result<SourcePage>;
/** Internal trusted reader/provenance seam. Every inspection rechecks freshness. */
export function inspectSourcePage(page:unknown):Result<SourcePageView>;
