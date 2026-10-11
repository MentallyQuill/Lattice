import type { ControlInputSpec, ControlInputError } from './control-input-contracts';
import type { JsonValue } from '../workflow/operations/json-data';
type Result<T> = {ok:true;data:T} | {ok:false;error:ControlInputError};
export interface ControlTableImportOptions {
    delimiter: ',' | '\t';
    /** Canonical field name -> exact header text; omitted optional mappings preserve absence. */
    columns: Record<string,string>;
    action: 'add' | 'replace';
    currentValue: JsonValue;
}
/** Serializable parent-owned handoff. Keep keyed by control contract and within 262,144 UTF-8 bytes. */
export interface ControlImportState { open:boolean; draft:ControlImportDraft; }
export interface ControlImportDraft { text:string; delimiter:','|'\t'; action:'add'|'replace'; columns:Record<string,string> }
export function controlTableImportFields(spec:ControlInputSpec):string[];
export function parseControlTableImport(spec:ControlInputSpec,text:string,options:ControlTableImportOptions):Result<{value:JsonValue;rows:JsonValue[];warnings:readonly string[]}>;
