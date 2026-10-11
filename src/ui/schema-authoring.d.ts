import type { JsonValue, Result } from '../workflow/operations/json-data';
export { validateJsonSchema } from '../workflow/operations/json-decode.js';
export function updateSchemaAtPath(schema: JsonValue, path: readonly string[], patch: Record<string, JsonValue>): Result<{ schema: JsonValue }>;
export function removeSchemaKeyword(schema: JsonValue, path: readonly string[], keyword: string): Result<{ schema: JsonValue }>;

/** Local authored drafts only; parent retains this state across editor remounts. */
export interface SchemaDraftState {
    path: string[];
    raw: boolean;
    rawText: string;
    inactiveText: string;
    invalid: boolean;
    invalidText: string;
    invalidPath: (string | number)[];
    invalidKeyword: string;
    feedback: string;
    numberDrafts: Record<string, string>;
    typedDrafts: Record<string, JsonValue>;
}
