import type { NodeReadiness, ReadinessIssue } from '../../ui/readiness-types';
export function prepareNodeReadiness(options: {address: ReadinessIssue['address']; setupIssues?: Omit<ReadinessIssue,'category'|'address'>[]; ports?: {id:string;direction:string;required?:boolean;label?:string}[]; wires?: object; deferred?: string[]}): NodeReadiness;
export function readinessFromIssues(issues?: ReadinessIssue[], deferred?: string[]): NodeReadiness;
export function summarizeReadiness(rows?: (NodeReadiness | undefined)[]): NodeReadiness & {setup:number;input:number};
