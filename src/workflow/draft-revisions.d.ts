import type { Result } from './types';

export type DraftScope = 'authorized' | 'whole' | 'narration' | 'dialogue';
export interface EditableSpan { index: number; start: number; end: number; text: string; [key: string]: unknown; }
export interface DraftRevisionEntry { readonly id: string; readonly parentId: string; readonly nodeId: string; readonly scope: DraftScope | 'append'; }
/** Plain source identifiers remain subject to the native host's publication checks. */
export interface DraftArtifact {
    readonly kind: 'draft'; readonly text: string; readonly source: Readonly<{ originalText: string; [key: string]: unknown }>;
    readonly spans?: readonly EditableSpan[]; readonly scope?: Exclude<DraftScope, 'authorized'>;
    readonly revisionId?: string; readonly rootRevisionId?: string; readonly lineage?: readonly DraftRevisionEntry[];
    readonly protectedLiterals?: readonly string[]; readonly presentationSections?: readonly { id: string; text: string }[];
    readonly [key: string]: unknown;
}
export interface FinalCandidateArtifact {
    readonly kind: 'candidate'; readonly original: string; readonly text: string; readonly source: DraftArtifact['source'];
    readonly findings: readonly unknown[]; readonly changes: readonly unknown[]; readonly reviewRequired: true;
    readonly revisionId: string; readonly rootRevisionId: string; readonly lineage: readonly DraftRevisionEntry[];
}
export interface DraftRevisionSettings { nodeId: string; scope: DraftScope; protectedLiterals?: string[]; }
export interface DraftDeleteRange { start: number; end: number; }
export interface DraftSection { id: string; text: string; }
export type DraftResult = Result<{ draft: DraftArtifact; report: unknown[] }>;
/** Cloning an arbitrary serialized successor cannot reconstruct live revision authority. */
export function snapshotDraft(input: unknown): Result<{ draft: DraftArtifact; original: string; revised: boolean }>;
export function createDraftRevision(parent: unknown, text: string, settings: DraftRevisionSettings): DraftResult;
export function createDraftDeletionRevision(parent: unknown, ranges: DraftDeleteRange[], settings: DraftRevisionSettings): DraftResult;
/** Same-text annotations may add protection and narrow spans, never remove disclosure restrictions. */
export function retainDraftAuthority(parent: unknown, output: unknown): Result<{ draft: DraftArtifact }>;
export function appendDraftSections(parent: unknown, sections: DraftSection[], settings: { nodeId: string; separator?: string }): DraftResult;
export function toFinalCandidate(input: unknown): Result<{ candidate: FinalCandidateArtifact }>;
export function readDraftBody(input: unknown): Result<{ readonly kind: 'text'; readonly text: string; readonly provenance: { type: 'draft-story-body'; revisionId: string | null; assembledRevisionId: string | null; rootRevisionId: string | null } }>;