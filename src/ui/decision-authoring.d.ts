import type { JsonValue, JsonPath, Result } from '../workflow/operations/json-data';
/** Complete row snapshots: id, type (yes/no or runtime type), instructions and optional criteria. */
export function compileQuestionRows(rows: JsonValue[], currentValue?: JsonValue): Result<{ value: JsonValue }>;
/** Parent-owned local UI state; retain under the control's contract/revision key on remount. */
export interface DecisionDraftState {
    rows: JsonValue[]; raw: boolean; rawText: string; feedback: string;
    invalidText: string; invalid: boolean; drafts: Record<string,string>;
    draftPaths: Record<string,JsonPath>;
}
