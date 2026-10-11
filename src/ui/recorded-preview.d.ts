import type { RecordedArtifact, RecordedPreviewSection } from '../workflow/types';

export type PreviewMode = 'readable' | 'source';
export interface PreviewSource {
    readonly format: 'structured-text' | 'json-prefix-text' | 'omitted';
    readonly text: string;
    readonly truncated: boolean;
    readonly policy: 'safe-recording';
}
export interface PreviewMessage {
    readonly id: string;
    readonly role: string;
    readonly speaker?: string;
    readonly timestamp?: string;
    readonly text: string;
    readonly truncated: boolean;
}
export interface PreviewDiagnostic { readonly code: string; readonly message: string; }
/** Diagnostic presentation only; report recognition grants no runtime authority. */
export interface PreviewPatternReport {
    readonly recordType: 'pattern-matches';
    readonly schemaVersion: 1;
    readonly status: 'complete' | 'unresolved';
    readonly matched: boolean | null;
    readonly totalOccurrences: number | null;
    readonly matchedRuleCount: number | null;
    readonly rules: readonly Readonly<{ id: string; pattern: string; label?: string; count: number | null }>[];
    readonly occurrences: readonly Readonly<{ ruleId: string; ruleIndex: number; start: number; end: number; text: string; protected: boolean; editable: boolean }>[];
    readonly diagnostics: readonly PreviewDiagnostic[];
}
export interface PreviewFilterReport {
    readonly recordType: 'text-filter';
    readonly schemaVersion: 1;
    readonly status: 'complete' | 'blocked' | 'empty';
    readonly action: 'remove' | 'keep';
    readonly unit: 'line' | 'paragraph';
    readonly units: readonly Readonly<{ start: number; end: number; text: string; blocked: boolean }>[];
    readonly originalBodyLength: number;
    readonly resultBodyLength: number;
    readonly retainedUnitCount: number;
    readonly diagnostics: readonly PreviewDiagnostic[];
}
export type ReadableContent =
    | { readonly kind: 'text'; readonly text: string; readonly truncated: boolean }
    | { readonly kind: 'messages'; readonly messages: readonly PreviewMessage[]; readonly omittedMessages: number; readonly snapshotOmittedMessages?: number; readonly truncated: boolean }
    | { readonly kind: 'json'; readonly text: string; readonly truncated: boolean }
    | { readonly kind: 'pattern-matches'; readonly report: PreviewPatternReport }
    | { readonly kind: 'text-filter'; readonly report: PreviewFilterReport }
    | { readonly kind: 'unavailable'; readonly reason: string };

export interface RecordedPreviewProjection {
    readonly source: PreviewSource;
    readonly sections: RecordedPreviewSection[];
}
/** Uses bounded own-data reads and only a complete structured retained capture. */
export function projectRecordedPreview(artifact: RecordedArtifact | undefined): RecordedPreviewProjection;
/** Keeps tab order while giving a local subsection first claim on the shared UTF-8 budget. */
export function boundReadablePreviewSections<T extends RecordedPreviewSection>(sections: readonly T[], prioritySection?: number): T[];
