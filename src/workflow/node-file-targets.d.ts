import type { Result } from './types';
import type { DocumentVisibility } from './document-catalog';
import type { ControlDescriptor } from './types';
export interface NodeFileTarget {bindingId?:string;name?:string;format?:'json'|'jsonl'|'csv'|'text'|'markdown';missing?:'create'|'error';content?:string;visibility?:DocumentVisibility;}
export interface NodeFileDefinition extends Required<NodeFileTarget> {targetId:string;}
export const NODE_FILE_TARGET_CONTROL:ControlDescriptor;
export const nodeFileFormats:readonly string[];
export function validNodeFileName(value:unknown):boolean;
export function validateNodeFileTarget(raw?:unknown):Result<NodeFileTarget>;
export function nodeFileTargetId(node:Record<string,unknown>):string|null;
export function captureNodeFileTargets(nodes:Record<string,unknown>[]|Record<string,Record<string,unknown>>,options?:{legacyDocuments?:{targetId:string}[]}):Result<{definitions:NodeFileDefinition[];targetIds:string[]}>;
