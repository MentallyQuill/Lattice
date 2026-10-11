import type { ControlInputError } from './control-input-contracts';
type Result<T> = { ok: true; data: T } | { ok: false; error: ControlInputError };
/** Quoted CSV/TSV cells, preserving rows and quoted content within the generic JSON budget. */
export function parseDelimitedInput(text: string, delimiter: ',' | '\t'): Result<{ rows: string[][] }>;
