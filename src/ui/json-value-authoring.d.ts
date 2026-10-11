import type { JsonValue, JsonPath, Result } from '../workflow/operations/json-data';
export function updateJsonValueAtPath(value: JsonValue, path: JsonPath, edit: { action: 'set'; value: JsonValue } | { action: 'remove' }): Result<{ value: JsonValue }>;
export function validateJsonPath(value: unknown, options?: { allowIndices?: boolean; maxItems?: number }): Result<{ value: JsonPath }>;
/** Preserve invalid node source in the parent raw draft; canonical data is unchanged. */
export function formatJsonValueDraftAtPath(value: JsonValue, path: JsonPath, source: string): Result<{ text: string }>;
