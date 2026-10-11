import type {ControlInputSpec, ControlInputError} from './control-input-contracts';
import type {JsonValue} from '../workflow/operations/json-data';
type Result<T> = {ok:true;data:T} | {ok:false;error:ControlInputError};
export function allocateControlRowId(prefix:string, existingIds:readonly string[]):string;
export function readControlRows(spec:ControlInputSpec,value:JsonValue):Result<{rows:JsonValue[]}>;
export function writeControlRows(spec:ControlInputSpec,rows:JsonValue[],currentValue?:JsonValue):Result<{value:JsonValue}>;
