import type { NativeNode, OperationDescription, OperationDescriptor, OperationResult, Result as WorkflowResult, WorkflowPhase } from '../types';
import type { Result } from './json-data';
import type { Occurrence } from './event-data';
import type { EventModelRequest } from './event-nodes';
export interface EffectMechanics { spellOutcome?: 'success' | 'failure' | 'replaced'; duration?: string; consequence?: string; }
export type EffectEntry = EffectMechanics & { id: string; kind: 'fixed' | 'generate'; weight: number; eligible?: boolean; description?: string; };
export interface EffectLibrary {
    libraryId: string; revision: string | number; itemId: string; effects: EffectEntry[];
    mechanicalPolicy?: 'narrative-only' | 'require-mechanics';
}
export interface EffectLibrarySettings {
    format?: 'data' | 'json' | 'text'; libraryId?: string; revision?: string | number; itemId?: string;
    mechanicalPolicy?: 'narrative-only' | 'require-mechanics';
}
export interface ResolvedEffect { id: string; description: string; spellOutcome?: 'success' | 'failure' | 'replaced'; duration?: string; consequence?: string; }
export interface RandomOutcome {
    schemaVersion: 1; recordType: 'random-outcome'; outcomeId: string; event: Occurrence;
    library: EffectLibrary; libraryFingerprint: string; selection: EffectEntry;
    draw: { unit: number; totalWeight: number; index: number };
    status: 'drawn' | 'proposed' | 'resolved'; acceptance: 'pending' | 'accepted'; rerollId?: string;
    effect?: ResolvedEffect; author?: { operation: 'effect-author'; instructionsFingerprint: string }; novelty?: { accepted: true };
}
export interface RandomPorts {
    random?: () => number; signal?: AbortSignal; rerollId?: string; rerollPolicy?: 'explicit';
}
export interface RandomExecution extends Omit<RandomPorts, 'rerollId' | 'rerollPolicy'> {
    phase?: WorkflowPhase;
    root?:boolean;
    selectNativeRandomOutcomes?: import('../native-story-state').NativeStoryState['selectNativeRandomOutcomes'];
    reuseNativeOutcome?: import('../native-story-state').NativeStoryState['reuseNativeOutcome'];
    retainNativeOutcome?: import('../native-story-state').NativeStoryState['retainNativeOutcome'];
    stageNativeOutcomes?: import('../native-story-state').NativeStoryState['stageOutcomes'];
    request?: (request: EventModelRequest) => Promise<WorkflowResult<{ text: string; finish?: string; usage?: import('../types').ReportedUsage }>>;
}
export type RandomOperationId = 'parse-effect-library' | 'random-pick' | 'saved-outcome' | 'effect-author' | 'stage-outcome' | 'commit-outcomes';
export function parseEffectLibrary(raw: unknown, settings?: EffectLibrarySettings): Result<{ library: EffectLibrary; eligible: EffectEntry[]; totalWeight: number }>;
export function validateRandomOutcome(raw:unknown):Promise<Result<{outcome:RandomOutcome}>>;
export function selectRandomOutcomes(events: unknown, library: unknown, saved?: unknown, ports?: RandomPorts): Promise<Result<{ outcomes: RandomOutcome[]; draws: number; actualCalls: 0 }>>;
export const RANDOM_OPERATIONS: Record<RandomOperationId, OperationDescriptor>;
export function describeRandom(node: NativeNode | Record<string,unknown>, options?: { phase?: WorkflowPhase; authoring?: boolean }): WorkflowResult<OperationDescription>;
export function executeRandom(node: NativeNode | Record<string,unknown>, inputs: Record<string,unknown>, local?: RandomExecution): Promise<OperationResult>;
