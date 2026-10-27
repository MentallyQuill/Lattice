export type WorkflowFailurePolicy = 'native-fallback' | 'stop' | 'continue-available';
export function isWorkflowFailurePolicy(value: unknown): value is WorkflowFailurePolicy;
export function normalizeWorkflowFailurePolicy(value: unknown): WorkflowFailurePolicy;
export const WORKFLOW_FAILURE_OPTIONS: readonly {
    readonly value: WorkflowFailurePolicy;
    readonly label: string;
    readonly description: string;
}[];
