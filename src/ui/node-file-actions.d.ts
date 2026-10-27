import type {NodeFileActions} from '../../ui/node-file-types';
export function createNodeFileActions(ports:{capture:(selection:any)=>any;isCurrent:(capture:any,selection:any)=>boolean;access?:()=>any;commit:(capture:any,selection:any,controls:Record<string,unknown>)=>any}):Required<Pick<NodeFileActions,'chooseNodeFile'|'saveNodeFile'>>;
