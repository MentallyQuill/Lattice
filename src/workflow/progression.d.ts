import type { JsonValue, Result } from './operations/json-data';
import type { RetiredProgressionIdentities } from './document-history';

export interface ProgressionValue {
    key: string;
    value: number;
    subjectId?: string;
    objectId?: string;
    visibility?: 'actor-private' | 'public';
    [field: string]: unknown;
}
export interface ProgressionEvidence {
    origin: string;
    [field: string]: JsonValue;
}
export interface ProgressionEvent {
    eventId: string;
    eventType: string;
    identity: Record<string, string | number>;
    status: 'confirmed';
    evidence: ProgressionEvidence;
    subjectId?: string;
    objectId?: string;
    sceneId?: string;
    absoluteMinute?: number;
    [field: string]: unknown;
}
interface RuleBase {
    ruleId: string;
    eventType: string;
    targetKey: string;
    identityFields: string[];
    min: number;
    max: number;
    subjectId?: string;
    objectId?: string;
    budgetGroup?: string;
    positiveSceneCap?: number;
    positiveDayCap?: number;
    zeroDeltaPolicy?: 'consume' | 'retain';
    cooldownMinutes?: number;
    diminishingFactors?: number[];
    cooldownOnZero?: boolean;
    repeatOnZero?: boolean;
}
export type ProgressionRule = RuleBase & (
    {mode: 'add' | 'set'; amount: number} | {mode: 'clamp'; amount?: never}
);
export interface ProgressionRules {
    ruleSetId: string;
    revision: number;
    dayLengthMinutes?: number;
    rules: ProgressionRule[];
}
export interface AppliedProgressionReceipt {
    eventId: string;
    eventIdentity: string;
    eventType: string;
    ruleSetId: string;
    ruleRevision: number;
    ruleId: string;
    targetKey: string;
    identityKey: string;
    status: 'applied' | 'retained';
    before: number;
    raw: number;
    allowed: number;
    after: number;
    evidence: ProgressionEvidence;
    reasons: string[];
    storyDay?: number;
    consumed: boolean;
}
export interface DuplicateProgressionReceipt {
    eventId: string;
    ruleId: string;
    identityKey: string;
    status: 'duplicate';
    before: number;
    raw: number;
    allowed: 0;
    after: number;
}
export interface UnmatchedProgressionReceipt {
    eventId: string;
    status: 'unmatched';
}
export type ProgressionReceipt = AppliedProgressionReceipt | DuplicateProgressionReceipt | UnmatchedProgressionReceipt;
export interface ProgressionState {
    historyCheckpoint?:{targetId:string;epoch:number};
    values: ProgressionValue[];
    ledger: AppliedProgressionReceipt[];
    budgets?: {scene: Record<string,number>; day: Record<string,number>};
    cooldowns?: Record<string,number>;
    repetitions?: Record<string,number>;
    decayTimes?: Record<string,number>;
    [field: string]: unknown;
}
export interface ProgressionProjection {
    state: ProgressionState;
    ledger: AppliedProgressionReceipt[];
    receipts: ProgressionReceipt[];
    actualCalls: 0;
}
export interface ThresholdCrossing {
    threshold: number;
    index: number;
    level: number;
    direction: 'up' | 'down';
}
export interface ThresholdProjection {
    crossings: ThresholdCrossing[];
    beforeBand: number;
    afterBand: number;
    actualCalls: 0;
}
export interface TimeDecayRule {
    decayId: string;
    revision: number;
    targetKey: string;
    baseline: number;
    unitsPerMinute: number;
    min: number;
    max: number;
    initialMinute: number;
    subjectId?: string;
    objectId?: string;
}
export interface TimeDecayReceipt {
    decayId: string;
    ruleRevision: number;
    targetKey: string;
    previousMinute: number;
    destination: number;
    elapsedMinutes: number;
    before: number;
    raw: number;
    allowed: number;
    after: number;
    baseline: number;
}
export interface TimeDecayProjection {
    state: ProgressionState;
    receipts: TimeDecayReceipt[];
    actualCalls: 0;
}
/** Validate confirmed events and authored rules, then return a detached staged projection. */
export interface ProgressionHistory extends RetiredProgressionIdentities { targetId:string;epoch:number;visibility?:import('./artifact-privacy').ArtifactVisibility; }
export function queryProgressionHistory(state:unknown,events:unknown,rules:unknown):Result<import('./document-history').ProgressionHistoryQuery>;
export function applyProgressionEvents(state: unknown, events: unknown, rules: unknown, history?:ProgressionHistory): Result<ProgressionProjection>;
/** Enumerate inclusive-endpoint crossings; this reports bands, not irreversible awards. */
export function resolveThresholds(before: unknown, after: unknown, thresholds: unknown): Result<ThresholdProjection>;
/** Advance explicit time-based recovery separately from the legacy message-step Curve. */
export function projectTimeDecay(state: unknown, destination: unknown, rules: unknown, history?:ProgressionHistory): Result<TimeDecayProjection>;
