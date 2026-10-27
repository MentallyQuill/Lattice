export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'enabled' | 'adaptive' | 'custom';
export interface ReasoningControls {
    reasoningEffort?: string;
    reasoningCustom?: string;
}
export interface ReasoningTarget {
    api?: string | null;
    source?: string | null;
    model?: string | null;
    endpoint?: string | null;
    metadata?: {
        reasoning?: { supported_efforts?: string[] | null; mandatory?: boolean };
        effort?: { supported_levels?: string[] };
    };
}
export interface ReasoningOptions {
    options: { value: string; label: string }[];
    help: string;
}
export type ReasoningRequestResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: { code: string; message: string } };
export const REASONING_EFFORTS: readonly ReasoningEffort[];
export function reasoningOptions(target?: ReasoningTarget): ReasoningOptions;
export function reasoningRequestOverrides(target?: ReasoningTarget, controls?: ReasoningControls): ReasoningRequestResult;
