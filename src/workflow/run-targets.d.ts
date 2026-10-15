import type { RootWorkflow, WorkflowRunTarget, Result } from './types';
export function workflowRunTargets(root: RootWorkflow | unknown): Result<WorkflowRunTarget[]>;
export function setWorkflowRunTargets(root: RootWorkflow | unknown, targets: WorkflowRunTarget[]): Result<RootWorkflow>;
