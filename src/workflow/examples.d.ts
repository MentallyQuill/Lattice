import type {WorkflowExampleMetadataV1,ExampleNodeAddress} from './example-metadata';
import type { NativeGraph3, Result } from './types';

export interface WorkflowExampleLesson {
    difficulty: 'Foundations' | 'Composition' | 'Advanced' | 'Capstone';
    focus: string;
    collection?: 'Memory';
    execution?: 'unified';
    minRuntime?: 3;
    requiredCapabilities?:string[];
    requestBudget?:{T:number;E:number;IR:number;IW:number;N:number;other:string[]};
    learn: string[];
    requirements: string[];
    steps: string[];
    checkpoints: { node: string; port: string; expect: string; target?:ExampleNodeAddress }[];
    experiments: { change: string; expect: string; target?:ExampleNodeAddress }[];
    cases: { when: string; expect: string; target?:ExampleNodeAddress }[];
    callBudget: string;
}
export interface WorkflowExample {
    id: string;
    number: number;
    title: string;
    goal: string;
    lesson?: WorkflowExampleLesson;
    graph: NativeGraph3;
}
export interface InstalledWorkflowExample {
    graph: NativeGraph3;
    companions: NativeGraph3[];
    exampleMetadata?:WorkflowExampleMetadataV1;
}
export interface WorkflowExampleResult extends Omit<WorkflowExample, 'graph'> {
    result: Result<NativeGraph3>;
}
export function listWorkflowExamples(): WorkflowExample[];
export function listWorkflowExampleResults(): WorkflowExampleResult[];
export function workflowExampleCatalogRevision(): string | null;
export function installWorkflowExample(id: string): Result<InstalledWorkflowExample>;
