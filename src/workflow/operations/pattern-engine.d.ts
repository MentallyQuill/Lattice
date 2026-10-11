import type { OperationResult, Result } from '../types';
import type { DraftArtifact } from '../draft-revisions';
import type { TextRuleWorker } from './text-rules';
export interface PatternRule { id: string; pattern: string; label?: string; }
export interface PatternSettings {
    mode: 'literal' | 'whole-word' | 'regex'; scope: 'authorized' | 'whole' | 'narration' | 'dialogue'; caseSensitive: boolean;
    rules: PatternRule[]; exemptions: string[]; protectedLiterals: string[];
    matchPolicy: 'any' | 'all'; minOccurrences: number; regexFlags: string; timeoutMs: number;
}
export interface PatternOccurrence { ruleId: string; ruleIndex: number; start: number; end: number; text: string; protected: boolean; editable: boolean; }
export interface PatternMatchReport {
    recordType: 'pattern-matches'; schemaVersion: 1; status: 'complete' | 'unresolved'; matched: boolean | null;
    totalOccurrences: number | null; matchedRuleCount: number | null; rules: (PatternRule & { count: number | null })[]; occurrences: PatternOccurrence[];
    source: { revisionId: string | null; rootRevisionId: string | null; textLength: number; bodyLength: number };
    settings: Pick<PatternSettings, 'mode' | 'scope' | 'caseSensitive' | 'matchPolicy' | 'minOccurrences' | 'regexFlags'>;
    diagnostics: { code: string; message: string }[];
}
export interface PatternReportBinding {
    readonly draft: unknown;
    readonly snapshot: DraftArtifact;
    readonly settings: Readonly<PatternSettings>;
    readonly regions: readonly (readonly [number, number])[];
}
export function scanPatternDraft(draft: unknown, settings: PatternSettings, local?: { signal?: AbortSignal; workerFactory?: () => TextRuleWorker }): Promise<OperationResult>;
/** Lookup uses the emitted live report value before any generic Data clone. */
export function getPatternReportBinding(value: unknown, draft: unknown): Result<PatternReportBinding>;
