import type { NativeGraph3, Result } from './types';

export interface WorkflowExample {
    id: string;
    number: number;
    title: string;
    goal: string;
    graph: NativeGraph3;
}
export interface InstalledWorkflowExample {
    graph: NativeGraph3;
    companions: NativeGraph3[];
}
export interface WorkflowExampleResult extends Omit<WorkflowExample, 'graph'> {
    result: Result<NativeGraph3>;
}
export function listWorkflowExamples(): WorkflowExample[];
export function listWorkflowExampleResults(): WorkflowExampleResult[];
export function installWorkflowExample(id: string): Result<InstalledWorkflowExample>;
