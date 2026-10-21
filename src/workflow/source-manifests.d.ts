import type {Result} from './types';
import type {JsonValue} from './operations/json-data';

/** Descriptive metadata only. Parser success establishes no host grant or provenance. */
export type Scope = {userId:string; chatId:string; actorId?:string; branchId?:string};
export type Visibility = {kind:'public'} | {kind:'actor-private'; actorId:string} | {kind:'hidden'};
export type SourceRef = {
    sourceId:string; revision:string;
    kind:'chat-message' | 'document' | 'lore-entry' | 'character';
    scope:Scope;
    span?:{start:number; end:number; unit:'utf16'};
};
/** Intentionally extensible; additional bounded JSON fields are preserved. */
export type RecordV1 = {
    id:string; revision:string; scope:Scope; sourceRefs:SourceRef[];
    visibility:Visibility; text?:string;
    [field:string]:JsonValue | undefined;
};
export type IdentityRevision = {id:string; revision:string};
export type SourceManifestEntry = IdentityRevision & {sourceRefs:SourceRef[]};
export type SourceManifestV1 = {
    type:'source-manifest'; schemaVersion:1; scope:Scope;
    sourceSetId:string; snapshotId:string; completeness:'complete' | 'page';
    entries:SourceManifestEntry[]; continuation:JsonValue;
};
export type ReaderCursorV1 = {
    type:'reader-cursor'; schemaVersion:1; scope:Scope;
    sourceSetId:string; snapshotId:string; position:JsonValue;
};
export type DerivationManifestV1 = {
    type:'derivation-manifest'; schemaVersion:1; scope:Scope;
    definitionHash:string; settingsHash:string;
    entries:(SourceManifestEntry & {parents:IdentityRevision[]})[];
};
/** A descriptive reference, never an acknowledgement or trusted persistence receipt. */
export type CoverageReceiptReference = {receiptId:string; targetId:string; nextRevision:string; intentDigest:string};
export type CoverageManifestV1 = {
    type:'coverage-manifest'; schemaVersion:1; scope:Scope;
    sourceSetId:string; snapshotId:string; covered:SourceRef[];
    derivations:IdentityRevision[]; receipts:CoverageReceiptReference[];
    replacementDigest:string | null;
};
export type RecordListOptions = {
    /** Integer 0..1024; aggregate JSON admission limits also apply. Default 1024. */
    maxRecords?:number;
    /** Full scope plus stable id; rejects matching identities even across revisions. */
    requireUniqueIdentities?:boolean;
};
/** Each parser returns an owned deeply frozen DTO within existing JSON admission limits. */
export function parseScope(value:unknown):Result<Scope>;
export function parseVisibility(value:unknown):Result<Visibility>;
export function parseSourceRef(value:unknown):Result<SourceRef>;
export function parseRecordV1(value:unknown):Result<RecordV1>;
export function parseRecordList(value:unknown,options?:RecordListOptions):Result<RecordV1[]>;
export function parseSourceManifest(value:unknown):Result<SourceManifestV1>;
export function parseReaderCursor(value:unknown):Result<ReaderCursorV1>;
export function parseDerivationManifest(value:unknown):Result<DerivationManifestV1>;
export function parseCoverageManifest(value:unknown):Result<CoverageManifestV1>;
/** Validates input; exact canonical JSON tuple of kind/scope/sourceId/revision, excluding span. */
export function canonicalSourceKey(ref:unknown):Result<string>;
/** Validates combined bounded scope/selector JSON. Canonical JSON tuple, sorted object keys,
 * array order retained. Never acquires a source or grants access. */
export function canonicalSourceSetKey(scope:unknown,selector:unknown):Result<string>;
/** Validates both scopes, including optional actor/branch identity. */
export function sameScope(left:unknown,right:unknown):Result<boolean>;
