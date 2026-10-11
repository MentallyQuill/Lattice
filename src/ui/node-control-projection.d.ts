import type { DetailControl } from '../../ui/detail-types';
import type { ControlDescriptor } from '../workflow/types';
export function projectNodeControls(operation:string, controls:Record<string,unknown>, context:{phase:'pre'|'post';readOnly?:boolean}):DetailControl[];
export function detailControl(key:string,label:string,descriptor:ControlDescriptor,value:unknown):DetailControl;
export function controlInputPresentation(control:DetailControl,format?:import('./control-input-contracts').ControlInputFormat):{text:string;format:import('./control-input-contracts').ControlInputFormat};
