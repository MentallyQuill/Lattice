import type { NativeNode, OperationDescription, OperationDescriptor, OperationResult, WorkflowPhase, Result as WorkflowResult } from '../types';
import type { JsonValue, Result } from './json-data';
export type CollectionMode = 'lookup' | 'filter' | 'count' | 'sum' | 'threshold' | 'merge' | 'rule-lookup' | 'project' | 'flatten';
export interface CollectionSettings {
    mode?: CollectionMode; collectionPath?: string[]; fieldPath?: string[]; value?: JsonValue;
    operator?: 'equals' | 'not-equals' | 'at-least' | 'at-most' | 'contains' | 'exists';
    missingPolicy?: 'hold' | 'exclude' | 'include'; thresholds?: string;
    mergePolicy?: 'keep-all' | 'add-unique'; identityPath?: string[];
}
export function reduceCollection(value: unknown, settings?: CollectionSettings, extras?: { other?: JsonValue; match?: JsonValue }): Result<{ value: JsonValue; actualCalls: 0 }>;
export const COLLECTION_OPERATIONS: Record<'collection', OperationDescriptor>;
export function describeCollection(node: NativeNode | Record<string,unknown>, options?: { phase?: WorkflowPhase }): WorkflowResult<OperationDescription>;
export function executeCollection(node: NativeNode | Record<string,unknown>, inputs: Record<string,unknown>, local?: { phase?: WorkflowPhase }): OperationResult;
