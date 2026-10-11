import type { JsonValue, JsonPath, Result } from '../workflow/operations/json-data';
export function updateJsonValueAtPath(value: JsonValue, path: JsonPath, edit: { action: 'set'; value: JsonValue } | { action: 'remove' }): Result<{ value: JsonValue }>;
export function validateJsonPath(value: unknown, options?: { allowIndices?: boolean; maxItems?: number }): Result<{ value: JsonPath }>;
