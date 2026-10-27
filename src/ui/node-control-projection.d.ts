import type { DetailControl, NodeDetailsView } from '../../ui/detail-types';
import type { ControlDescriptor,NativeGraph3 } from '../workflow/types';
export function projectNodeControls(operation:string, controls:Record<string,unknown>, context:{phase:'pre'|'post';readOnly?:boolean;graph?:Pick<NativeGraph3,'schema'|'runtime'|'mode'>}):DetailControl[];
export function detailControl(key:string,label:string,descriptor:ControlDescriptor,value:unknown):DetailControl;
export function detailsEditorContractKey(node:NodeDetailsView):string;
export function projectReasoningControls(controls:DetailControl[],target?:{api?:string;source?:string;model?:string}):DetailControl[];
export function controlInputPresentation(control:DetailControl,format?:import('./control-input-contracts').ControlInputFormat):{text:string;format:import('./control-input-contracts').ControlInputFormat};
