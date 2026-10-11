import type { NativeNode, OperationDescription, OperationDescriptor, OperationResult, Result } from '../types';
export interface FilterTextSettings {
    action: 'remove' | 'keep'; unit: 'line' | 'paragraph';
    scope: 'authorized' | 'whole' | 'narration' | 'dialogue'; protectedLiterals: string[];
}
export interface FilterTextReport {
    recordType: 'text-filter'; schemaVersion: 1; status: 'complete' | 'blocked' | 'empty';
    action: 'remove' | 'keep'; unit: 'line' | 'paragraph';
    units: { start: number; end: number; text: string; blocked: boolean }[];
    originalBodyLength: number; resultBodyLength: number; retainedUnitCount: number;
    diagnostics: { code: string; message: string }[];
}
export const FILTER_TEXT_DEFAULTS: Readonly<FilterTextSettings>;
export const FILTER_TEXT_OPERATION: OperationDescriptor;
export function validateFilterTextSettings(input?: unknown): Result<Readonly<FilterTextSettings>>;
export function filterTextSettingsForNode(node: NativeNode): Result<Readonly<FilterTextSettings>>;
export function describeFilterText(node: NativeNode): Result<OperationDescription>;
export function selectFilterUnits(body: string, unit: 'line' | 'paragraph'): { start: number; end: number }[];
export function filterPatternDraft(draft: unknown, matches: unknown, settings: FilterTextSettings, local: { nodeId: string }): OperationResult;
