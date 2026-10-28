import type { Result,OperationResult,DataArtifact,NodeAddress } from './types';
import type { StorageScope } from './file-store';
import type { NativeFileSession } from './native-settlement';
import type { NativeDraftEvidenceRegistry } from './native-draft-evidence';
import type { DraftArtifact } from './draft-revisions';
import type { StoryClock,ScheduledOccurrence } from './story-time';
import type { EventSource,Occurrence } from './operations/event-data';
import type { RandomOutcome,EffectLibrary } from './operations/random-outcomes';
import type { ArtifactVisibility } from './artifact-privacy';
export interface NativeOutcomeCache { /** Explicit cancellation revokes all pending draws. */ clear():void; }
export interface NativeTimeProjection { operation:'advance-time'|'time-trigger';inputs:Record<string,DataArtifact>;settings:Record<string,unknown>;outputs:Record<string,DataArtifact>; }
export interface NativeStoryState {
 playerSource():Result<EventSource>;
 readClock(clockId:string):Promise<Result<StoryClock>>;
 /** Private host registration uses the exact emitted Story Clock value. */
 registerClock(value:unknown,clockId:string):Result<void>;
 retainTimeProjection(projection:NativeTimeProjection):Result<void>;
 stageClock(report:unknown,occurrences?:unknown,address?:NodeAddress,options?:{fileHandling?:import('./node-file-targets').FileHandling}):Promise<Result<Record<string,unknown>>>;
 selectNativeRandomOutcomes(input:{events:unknown;library:EffectLibrary;saved?:unknown;rerollId?:string;ledgerId?:string;visibility?:ArtifactVisibility;address?:NodeAddress}):Promise<Result<{outcomes:RandomOutcome[];draws:number;actualCalls:0;visibility:ArtifactVisibility}>>;
 reuseNativeOutcome(outcome:RandomOutcome):Result<RandomOutcome|null>;
 retainNativeOutcome(input:{parent:RandomOutcome;result:RandomOutcome}):Promise<Result<void>>;
 stageOutcomes(targetId:string,outcomes:unknown,address?:NodeAddress,options?:{fileHandling?:import('./node-file-targets').FileHandling}):Promise<Result<Record<string,unknown>>>;
 validateEvidence(evidence:unknown,body:string,originalBody?:string,options?:{draftEvidence?:NativeDraftEvidenceRegistry;finalDraft?:DraftArtifact}):Result<void>;
 release():void;
}
/** Bounded private pending cache: 64 outcomes, each checked against portable JSON limits.
 * Defaults to crypto.getRandomValues; wall time never establishes story time or draw identity.
 */
export function createNativeOutcomeCache(config?:{random?:()=>number}):NativeOutcomeCache;
export function createNativeStoryState(config:{files:NativeFileSession;scope:StorageScope;isCurrent:()=>boolean;turnId:string;sourceForEvent:(event:Occurrence)=>Result<{isCurrent:()=>boolean}>;playerSource?:EventSource;cache:NativeOutcomeCache}):NativeStoryState;
