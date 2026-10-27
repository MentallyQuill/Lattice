/** Global run behavior; deliberately separate from serialized workflow documents. */
export function isWorkflowFailurePolicy(value) {
    return value === 'native-fallback' || value === 'stop' || value === 'continue-available';
}

export function normalizeWorkflowFailurePolicy(value) {
    return isWorkflowFailurePolicy(value) ? value : 'native-fallback';
}

export const WORKFLOW_FAILURE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'native-fallback', label: 'Fall back to SillyTavern', description: 'End the workflow and allow normal SillyTavern generation.' }),
    Object.freeze({ value: 'stop', label: 'Stop all generation', description: 'Stop the workflow and all generation for this Send.' }),
    Object.freeze({ value: 'continue-available', label: 'Continue where possible', description: 'Keep successful results and continue branches whose required inputs are available.' }),
]);
