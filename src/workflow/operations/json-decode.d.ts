import type { JsonValue, Result, SchemaFinding } from './json-data.js';
export interface JsonSchema {
    type?: 'null' | 'boolean' | 'object' | 'array' | 'number' | 'integer' | 'string';
    enum?: JsonValue[];
    const?: JsonValue;
    properties?: { [key: string]: JsonSchema };
    required?: string[];
    additionalProperties?: boolean;
    items?: JsonSchema;
    minItems?: number;
    maxItems?: number;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    title?: string;
    description?: string;
    $schema?: string;
}
export interface DecodeJsonOptions { mode?: 'parse' | 'check'; schema?: JsonSchema }
/** Parse raw JSON text or check a JSON value, with optional bounded subset validation. */
export function decodeJson(input: unknown, options?: DecodeJsonOptions): Result<{ value: JsonValue; report: SchemaFinding[] }>;

/** Admit exactly the bounded schema subset used by decodeJson. */
export function validateJsonSchema(schema: unknown): Result<{ schema: JsonValue }>;
