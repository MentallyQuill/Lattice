import type { Result } from './types';

export interface ExplicitTimeEvidence { kind: 'explicit'; origin?: string; }
export interface AuthoredTimeEvidence { kind: 'authored-rule'; origin: string; }
export interface ExtractedTimeEvidence { kind: 'validated-extraction'; origin: string; }
export interface EstimatedTimeEvidence {
    kind: 'estimate';
    origin: string;
    acceptancePolicy: 'accept';
    /** Flat distinct origins, 1..64, including origin. Omission means [origin]. */
    lineage?: readonly string[];
}
export type AcceptedTimeEvidence = ExplicitTimeEvidence | AuthoredTimeEvidence | ExtractedTimeEvidence | EstimatedTimeEvidence;
/** Only these evidence keys are admitted. Valid unaccepted/vague evidence is unresolved. */
export type TimeEvidence = AcceptedTimeEvidence
    | { kind: 'estimate'; origin?: string; acceptancePolicy?: 'accept' | 'unresolved'; lineage?: readonly string[]; }
    | { kind: 'vague'; origin?: string; };

/** Minute zero begins Day 1. Other origins/units require an explicit calendar adapter. */
export interface StoryClock {
    clockId: string;
    calendarId: string;
    /** Positive safe integer; custom authored day lengths are supported. */
    dayLengthMinutes: number;
    /** Nonnegative safe integer. */
    absoluteMinute: number;
    schemaVersion?: 1;
    /** Positive safe integer, preserved without performing settlement. */
    revision?: number;
    unit?: 'minute';
    originMinute?: 0;
    originDay?: 1;
    timeEvidence?: AcceptedTimeEvidence;
    settledTimeEventIds?: readonly string[];
    /** Unrelated bounded own plain-data metadata is preserved. */
    [key: string]: unknown;
}

/** A bare duration/destination is an explicit numeric instruction from the caller. */
export type TimeAdvanceProposal =
    | { kind: 'duration'; minutes: number; evidence?: TimeEvidence; }
    | { kind: 'destination'; absoluteMinute: number; evidence?: TimeEvidence; };

export interface StoryScheduleBase {
    scheduleId: string;
    /** Positive safe integer; omitted revision normalizes to 1. */
    revision?: number;
    /** Safe integer; simultaneous events sort by order (default 0), then scheduleId. */
    order?: number;
    /** Optional scope declarations must match the supplied clock. */
    clockId?: string;
    calendarId?: string;
    /** Attributed scope, operation, payload and other bounded metadata are retained. */
    [key: string]: unknown;
}
export interface DailyStorySchedule extends StoryScheduleBase {
    kind: 'daily';
    /** Safe integer in [0, dayLengthMinutes). */
    minuteOfDay: number;
}
export interface IntervalStorySchedule extends StoryScheduleBase {
    kind: 'interval';
    anchorMinute: number;
    /** Positive safe integer. Due(n) = anchorMinute + n * intervalMinutes, n >= 1. */
    intervalMinutes: number;
}
export interface DelayStorySchedule extends StoryScheduleBase {
    kind: 'delay';
    /** A single nonnegative safe-integer instant, never a recurring interval. */
    dueMinute: number;
}
export type StorySchedule = DailyStorySchedule | IntervalStorySchedule | DelayStorySchedule;

export interface ScheduledOccurrence {
    /** `time:` + JSON encoding of [clockId, scheduleId, revision, dueMinute]. */
    occurrenceId: string;
    clockId: string;
    calendarId: string;
    scheduleId: string;
    scheduleRevision: number;
    kind: StorySchedule['kind'];
    dueMinute: number;
    /** One-based safe-integer calendar day. */
    day: number;
    minuteOfDay: number;
    schedule: StorySchedule & { revision: number; };
}

export interface OccurrenceOptions {
    /** Default 1000; integer 1..10000. Overflow holds the entire projection. */
    limit?: number;
    /** Unioned with the clock's settledTimeEventIds; duplicates are harmless. */
    consumedIds?: readonly string[];
}
export type TimeAdvancePolicy = 'catch-up' | 'interrupt';
export interface TimeAdvanceOptions extends OccurrenceOptions { policy: TimeAdvancePolicy; }

export interface AdvancedStoryClock {
    previousClock: StoryClock;
    clock: StoryClock & { timeEvidence: AcceptedTimeEvidence; };
    requestedAbsoluteMinute: number;
    elapsedMinutes: number;
    /** This proposal evidence; clock.timeEvidence unions prior/new estimate lineage for durations. */
    evidence: AcceptedTimeEvidence;
    actualCalls: 0;
}
export interface ScheduledOccurrences { occurrences: ScheduledOccurrence[]; }
export interface ResolvedTimeAdvance extends AdvancedStoryClock, ScheduledOccurrences {
    policy: TimeAdvancePolicy;
    requestedElapsedMinutes: number;
    /** Effective elapsed time; clock.absoluteMinute is the effective destination. */
    elapsedMinutes: number;
    remainingMinutes: number;
    /** True only when an event shortens the requested advance. */
    interrupted: boolean;
}

/** All boundaries admit only bounded own plain data and return detached projections. */
export function advanceStoryClock(clock: unknown, proposal: unknown): Result<AdvancedStoryClock>;
/** Crossings use previous < due <= destination; consumed events do not count toward the limit. */
export function enumerateScheduledOccurrences(clock: unknown, destination: unknown, schedules: unknown, options?: OccurrenceOptions): Result<ScheduledOccurrences>;
/** Explicit policy required. Interruption includes every simultaneous next event. */
export function resolveTimeAdvance(clock: unknown, proposal: unknown, schedules: unknown, options: TimeAdvanceOptions): Result<ResolvedTimeAdvance>;


/** Validate and detach an explicitly supplied bounded story clock without advancing it. */
export function validateStoryClock(raw:unknown):Result<StoryClock>;

/** Normalize intrinsic timing/revision; optional explicit clock adds exact scope and daily day bounds. */
export function validateStorySchedules(raw: unknown, clock?: unknown): Result<StorySchedule[]>;
