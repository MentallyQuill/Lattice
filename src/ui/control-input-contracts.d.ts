import type { ControlDescriptor } from '../workflow/types';
import type { JsonValue, OperationError } from '../workflow/operations/json-data';
export type ControlInputFormat = 'auto' | 'plain' | 'csv' | 'json' | 'rows';
export interface ControlInputSpec {
    id: string;
    version: 1;
    editor: 'text' | 'list' | 'rows' | 'questions' | 'schedules' | 'schema' | 'value' | 'path' | 'hotkey' | 'helper';
    formats: readonly ControlInputFormat[];
    storage: 'text' | 'json-value' | 'json-text';
    limits: { maxItems?: number; maxStringLength?: number; maxBytes?: number };
}
export interface ControlInputError extends OperationError { row?: number; cell?: number }
type Result<T> = { ok: true; data: T } | { ok: false; error: ControlInputError };
export function resolveControlInputSpec(context: {
    operation: string;
    controls: Record<string, unknown>;
    key: string;
    descriptor: ControlDescriptor;
}): ControlInputSpec;
export function parseControlInput(spec: ControlInputSpec, input: {
    format: ControlInputFormat;
    text?: string;
    value?: JsonValue;
    currentValue?: JsonValue;
}): Result<{ value: JsonValue; sourceText?: string; displayItems?: readonly string[]; warnings: readonly string[] }>;
export function formatControlInput(spec: ControlInputSpec, value: JsonValue, format: ControlInputFormat): Result<string>;
