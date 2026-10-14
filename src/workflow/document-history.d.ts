import type { Result, JsonValue } from './operations/json-data';
import type { StorageScope, StoredDocument, StoredFileReceipt } from './file-store';
import type { ArtifactVisibility } from './artifact-privacy';
import type { RandomOutcome } from './operations/random-outcomes';
export interface DocumentHistoryHeader { schemaVersion:1; epoch:number; head:string|null; }
export type DocumentHistoryKind='receipts'|'clock-turns'|'clock-events'|'outcomes'|'progression';
export interface DocumentHistoryPage { schemaVersion:1;pageId:string;targetId:string;scope:StorageScope;visibility:ArtifactVisibility;epoch:number;checkpointId:string;previous:string|null;kind:DocumentHistoryKind;payload:JsonValue[]; }
export interface ProgressionHistoryQuery { identityKeys:string[];eventIds:string[]; }
export interface RetiredProgressionIdentities { knownIdentityKeys:string[];eventIdentities:{eventId:string;eventIdentity:string}[]; }
export interface DocumentHistoryQuery { intentId?:string;turnId?:string;progression?:ProgressionHistoryQuery;outcomes?:{eventIds:string[];libraryId:string;rerollId:string|null}; }
export interface DocumentHistoryMatches { epoch:number;visibility:ArtifactVisibility;privateActorIds:string[];receipt?:StoredFileReceipt;clockTurn?:{turnId:string;projectionKey:string;previousClock:JsonValue};progression?:RetiredProgressionIdentities;outcomes?:RandomOutcome[]; }
export interface DocumentHistoryRequest { targetId:string;scope:StorageScope;history?:DocumentHistoryHeader;pages:Record<string,DocumentHistoryPage>; }
export interface CheckpointCounts { receipts:number;clockTurns:number;clockEvents:number;outcomes:number;progression:number; }
export interface CheckpointView { targetId:string;expectedRevision:number;epoch:number;kind:'document'|'clock'|'outcomes'|'progression';visibility:ArtifactVisibility;counts:CheckpointCounts;retained:{clockEvents:number};canApply:boolean; }
export interface ArchiveView { epoch:number;visibility:ArtifactVisibility;pages:{pageId:string;checkpointId:string;epoch:number;kind:DocumentHistoryKind;count:number}[]; }
export function documentHistoryHeader(raw:unknown):Result<DocumentHistoryHeader>;
/** Internal native inspection; full payload pages never enter portable workflow artifacts. */
export function inspectDocumentHistory(request:DocumentHistoryRequest):Result<{header:DocumentHistoryHeader;pages:DocumentHistoryPage[];visibility:ArtifactVisibility;privateActorIds:string[]}>;
/** Full native admission includes canonical validation of each saved outcome. */
export function validateDocumentHistory(request:DocumentHistoryRequest):Promise<ReturnType<typeof inspectDocumentHistory>>;
export function lookupDocumentHistory(request:DocumentHistoryRequest,query:DocumentHistoryQuery):Result<DocumentHistoryMatches>;
export function prepareDocumentCheckpoint(snapshot:StoredDocument,options:{scope:StorageScope;visibility:ArtifactVisibility;checkpointId:string}):Promise<Result<{content:string;history:DocumentHistoryHeader;pages:Record<string,DocumentHistoryPage>;kind:CheckpointView['kind'];counts:CheckpointCounts;retained:{clockEvents:number};checkpointId:string;visibility:ArtifactVisibility;privateActorIds:string[]}>>;
