import type { RunEvent, RunNodeState, RequestSummary, WorkflowRunOptions } from '../../src/workflow/types';

const address = { workflowId: 'retry-types', instancePath: [], nodeId: 'model' };
const clock = { runId: 'run', seq: 1, at: 1, elapsedMs: 1 };
const retry: RunEvent = { ...clock, type: 'node-retry', address, reasonCode: 'REQUEST_FAILED', delayMs: 500, nextAttempt: 2, maxAttempts: 3 };
const held: RunEvent = { ...clock, type: 'request-settled', address, attempt: 1, status: 'cancelled', durationMs: 0, dispatched: false };
const subphase: RunNodeState['subphase'] = 'retrying';
const request: RequestSummary = { attempt: 1, status: 'cancelled', maxTokens: 20, inputTokens: 4, startedAt: 1, durationMs: 0, dispatched: false };
const options: WorkflowRunOptions = { retryDelay: async (delayMs, signal) => delayMs <= 30000 && !signal?.aborted, onEvent: event => {
    if (event.type === 'node-retry') {
        const reason: 'INVALID_JSON' | 'SCHEMA_MISMATCH' | 'REQUEST_FAILED' = event.reasonCode;
        return [reason, event.delayMs, event.nextAttempt, event.maxAttempts];
    }
    if (event.type === 'request-settled') return event.dispatched;
} };

// @ts-expect-error Retry diagnostics accept only the bounded public reason codes.
const privateReason: RunEvent = { ...clock, type: 'node-retry', address, reasonCode: 'PRIVATE_PROVIDER_ERROR', delayMs: 500, nextAttempt: 2, maxAttempts: 3 };
void [retry, held, subphase, request, options, privateReason];
