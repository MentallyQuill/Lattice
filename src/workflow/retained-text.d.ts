import type { ModifierTrace } from './modifiers';

/** Retained diagnostic text only; not an admitted runtime artifact or fresh output. */
export interface RetainedText {
    readonly text: string;
    readonly rawText: string;
    readonly trace: readonly ModifierTrace[];
    readonly hasModifiers: boolean;
}
/** Own-data recognition with canonical modifier recomputation and exact final-text equality. */
export function recognizeRecordedText(artifact: unknown): RetainedText | null;
