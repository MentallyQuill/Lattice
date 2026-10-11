import type { JsonValue, JsonPath, Result } from '../workflow/operations/json-data';
export function compileScheduleRows(rows: JsonValue[]): Result<{ value: JsonValue }>;
export function durationToMinutes(quantity: number, unit: 'minutes' | 'hours' | 'days', dayLengthMinutes?: number): Result<{ minutes: number }>;
export function validateScheduleMetadata(value: JsonValue): Result<{ value: JsonValue }>;
/** Parent-owned local UI state; never store this as canonical schedule data. */
export interface ScheduleDraftState {
    rows: JsonValue[]; raw: boolean; rawText: string; feedback: string;
    invalidText: string; invalid: boolean; drafts: Record<string,string>;
    draftPaths: Record<string,JsonPath>;
    units: Record<string,'minutes'|'hours'|'days'>;
    quantities: Record<string,string>; page: number;
}
