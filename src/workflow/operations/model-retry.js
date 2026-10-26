const aborted = () => ({ ok: false, error: { code: 'ABORTED', message: 'Model operation cancelled.' } });
const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);
const corrections = Object.freeze({
    INVALID_JSON: 'Return a single complete raw JSON document only. Do not include Markdown fences, commentary, or additional documents. Follow the original task, evidence, and supplied schema exactly.',
    SCHEMA_MISMATCH: 'Return a single complete raw JSON document matching the supplied schema exactly. Follow the original task and evidence. Do not include commentary or Markdown fences.',
});

function reportsWithCalls(result, actualCalls) {
    let counted = false;
    const reports = (result.reports ?? []).map(report => {
        if (!Number.isSafeInteger(report.actualCalls) || report.actualCalls < 1) return report;
        const count = counted ? 0 : actualCalls;
        counted = true;
        return { ...report, actualCalls: count };
    });
    if (!counted && actualCalls) reports.push({ code: 'MODEL_ATTEMPTS', actualCalls });
    return reports.length || result.reports ? { ...result, reports } : result;
}

function requestCount(execution) {
    try {
        const count = execution.getRequestCount?.();
        return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
    } catch { return undefined; }
}

async function waitForRetry(delayMs, execution) {
    if (execution.signal?.aborted) return false;
    if (typeof execution.retryDelay === 'function') {
        try { return await execution.retryDelay(delayMs, execution.signal) !== false && !execution.signal?.aborted; }
        catch { return false; }
    }
    if (!delayMs) return !execution.signal?.aborted;
    return new Promise(resolve => {
        let timer;
        const finish = completed => {
            clearTimeout(timer);
            execution.signal?.removeEventListener('abort', cancel);
            resolve(completed);
        };
        const cancel = () => finish(false);
        execution.signal?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => finish(!execution.signal?.aborted), delayMs);
        if (execution.signal?.aborted) cancel();
    });
}

/** Retry only this model operation; each attempt still uses the runtime request capability. */
export async function retryModelNode(maxRetries, execution, run) {
    const maxAttempts = 1 + maxRetries;
    let actualCalls = 0, transientRetries = 0, correction, corrected = false;
    const baseline = requestCount(execution);
    const finish = result => {
        const count = requestCount(execution);
        return reportsWithCalls(result, baseline !== undefined && count !== undefined && count >= baseline ? count - baseline : actualCalls);
    };
    const tracked = typeof execution.request === 'function' ? async request => {
        actualCalls++;
        return execution.request(request);
    } : execution.request;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (execution.signal?.aborted) return finish(aborted());
        let formatFailure;
        const result = await run({ ...execution, request: tracked, modelJsonCorrection: correction }, code => { if (Object.hasOwn(corrections, code)) formatFailure = code; });
        if (result.ok || attempt === maxAttempts) return finish(result);
        const error = result.error;
        let delayMs;
        if (formatFailure && !corrected) {
            correction = corrections[formatFailure];
            corrected = true;
            delayMs = 0;
        } else if (error?.code === 'REQUEST_FAILED' && error.retryable === true && (error.status === undefined || transientStatuses.has(error.status)) && !(error.retryAfterMs > 30000)) {
            delayMs = Math.max(++transientRetries === 1 ? 500 : 1000, error.retryAfterMs ?? 0);
        } else return finish(result);
        execution.onRetry?.({ reasonCode: formatFailure ?? 'REQUEST_FAILED', delayMs, nextAttempt: attempt + 1, maxAttempts });
        if (!await waitForRetry(delayMs, execution)) return finish(aborted());
    }
}
