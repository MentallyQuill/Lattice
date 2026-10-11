import type { NativeNode, OperationDescription, OperationDescriptor, Result } from '../types';
import type { PatternSettings } from './pattern-engine';
export const PATTERN_DEFAULTS: Readonly<PatternSettings>;
export const PATTERN_OPERATION: OperationDescriptor;
export function validatePatternSettings(input?: unknown): Result<Readonly<PatternSettings>>;
export function patternSettingsForNode(node: NativeNode): Result<Readonly<PatternSettings>>;
export function describePattern(node: NativeNode): Result<OperationDescription>;
