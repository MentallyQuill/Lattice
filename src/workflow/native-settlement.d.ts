import type { Result, NodeAddress } from './types';
import type { DraftArtifact } from './draft-revisions';
import type { StorageScope, FileStore } from './file-store';
import type { ChatDocumentCatalog, DocumentVisibility } from './document-catalog';
import type { NativePersistenceVerifier } from './native-persistence';
import type { StagedEffect, StagedEffects } from './staged-effects';
export interface NativeSettlement {
    stage(effect:StagedEffect):ReturnType<StagedEffects['stage']>;
    /** Serialized attempts may correct failed prepublication Drafts; persistence recovery keeps the exact published Draft. */
    accept(draft:DraftArtifact):ReturnType<StagedEffects['settle']>;
    reject():ReturnType<StagedEffects['reject']>;
    release():void;
    inspect():Result<{published:boolean;rejected:boolean;effects:{intentId:string;targetId:string;receipt:unknown}[]}>;
}
export function createAcceptedNativeSettlement(config:{scope:StorageScope;originalDraft:DraftArtifact;signal?:AbortSignal;isCurrent:()=>boolean;validateFinal:(evidence:{body:string;originalBody:string;effects:{intentId:string;targetId:string;proposed:unknown}[]})=>Result<void>|Promise<Result<void>>;publish:(draft:DraftArtifact)=>Result<{appliedLocally:true;[key:string]:unknown}>|Promise<Result<{appliedLocally:true;[key:string]:unknown}>>;release?:()=>void}):NativeSettlement;
export function validateNativeFileEvidence(raw:unknown,body:string,originalBody?:string,options?:{draftEvidence?:import('./native-draft-evidence').NativeDraftEvidenceRegistry;finalDraft?:DraftArtifact}):Result<void>;
export interface NativeFileSession {
    store:FileStore;
    visibility(targetId:string):Result<DocumentVisibility>;
    lookupHistory(targetId:string,query:import('./document-history').DocumentHistoryQuery):Promise<Result<import('./document-history').DocumentHistoryMatches>>;
    intentId(node:{id:string},evidence:unknown[],address?:NodeAddress):Promise<Result<string>>;
    stage(prepared:{handle:Parameters<FileStore['preflight']>[0];plan:{targetId:string}},evidence:unknown[]):ReturnType<NativeSettlement['stage']>;
    release():void;
}
export type NativeFileBarrier={intentId:string;revision:number}|{checkpointPending:true}|{checkpoint:true;revision:number;epoch:number;pageIds:string[];checkpointSignature:string};
export interface NativeDocumentHistory {
    preview(targetId:string):Promise<Result<{handle:import('./file-store').DocumentCheckpointHandle;view:import('./document-history').CheckpointView&{name:string}}>>;
    apply(handle:import('./file-store').DocumentCheckpointHandle):Promise<Result<{applied:true;acknowledged:boolean;revision:number;epoch:number;message:string}>>;
    inspect(targetId:string):Promise<Result<import('./document-history').ArchiveView>>;
}
export function createNativeDocumentHistory(config:{catalog:ChatDocumentCatalog;context:()=>{chat:unknown[];chatId?:string;getCurrentChatId?:()=>string;chatMetadata:Record<string,unknown>};userId:()=>string;actorId:()=>string|null;isBusy:()=>boolean;barriers:Map<string,NativeFileBarrier>;persistenceVerifier:NativePersistenceVerifier;onApplied?:()=>void}):NativeDocumentHistory;
export function createNativeFileSession(config:{catalog:ChatDocumentCatalog;scope:StorageScope;context:()=>{chat:unknown[];chatId?:string;getCurrentChatId?:()=>string;chatMetadata:Record<string,unknown>};userId:()=>string;persistenceVerifier:NativePersistenceVerifier;signal?:AbortSignal;isCurrent:()=>boolean;barriers?:Map<string,NativeFileBarrier>;workflowId:string;originalDraft?:DraftArtifact;getOriginalDraft?:()=>DraftArtifact;validateEvidence:(evidence:unknown[])=>Result<void>|Promise<Result<void>>;stage:NativeSettlement['stage']}):Result<NativeFileSession>;
