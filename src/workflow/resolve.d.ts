import type { RootWorkflow, WorkflowTarget, Result, ResolvedPlan, NodeAddress, ResolvedPrimitive, RunHierarchyEntry, TerminalTarget } from './types';
export interface WorkflowPolicy { callBound:number; requiredBindingAddresses:NodeAddress[]; requiresNativeGeneration:boolean; }
export interface PreparedWorkflowPlanner {
    readonly inventory: { workflowId:string; phase:string; primitives:ResolvedPrimitive[]; pins:unknown[]; hierarchy:RunHierarchyEntry[]; terminals:TerminalTarget[] };
    policy(target?:WorkflowTarget):Result<WorkflowPolicy>;
    summarize(target?:WorkflowTarget):Result<WorkflowPolicy>;
}
export function prepareWorkflowAttempt(root: RootWorkflow | unknown, options?: {target?:WorkflowTarget}):Result<{selection:ResolvedPlan;preflight:Result<ResolvedPlan>}>;
export function resolveWorkflow(root: RootWorkflow | unknown, options?: {target?:WorkflowTarget}):Result<ResolvedPlan>;
export function prepareWorkflowPlanner(root:RootWorkflow | unknown, artifacts?:object):Result<PreparedWorkflowPlanner>;
export function preparedWorkflowExpansion(root:RootWorkflow, planner:PreparedWorkflowPlanner):Result<any>;
export function preparedWorkflowSource(root:RootWorkflow, planner:PreparedWorkflowPlanner):RootWorkflow | null;
