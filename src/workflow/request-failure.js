const failure = () => ({ ok: false, error: { code: 'REQUEST_FAILED', message: 'The auxiliary request failed. Inspect the fixed connection.' } });
const abortedFailure = () => ({ ok: false, error: { code: 'ABORTED', message: 'The request was stopped.' } });
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
// The installed host can reduce a response to its exact status text.
const STATUS_TEXT = new Map([
    ['Request Timeout', 408], ['Too Many Requests', 429], ['Internal Server Error', 500],
    ['Bad Gateway', 502], ['Service Unavailable', 503], ['Gateway Timeout', 504],
    ['Bad Request', 400], ['Unauthorized', 401], ['Forbidden', 403], ['Not Found', 404],
    ['Method Not Allowed', 405], ['Unprocessable Entity', 422],
]);
const NETWORK_MESSAGES = new Set(['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']);
const NETWORK_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);
const TERMINAL_CODES = new Set([
    'AUTH_FAILED', 'AUTHENTICATION_FAILED', 'AUTHENTICATION_ERROR', 'AUTHORIZATION_FAILED',
    'UNAUTHORIZED', 'FORBIDDEN', 'INVALID_API_KEY', 'MISSING_API_KEY',
    'CONFIG_ERROR', 'CONFIGURATION_ERROR', 'INVALID_CONFIG', 'INVALID_CONFIGURATION', 'INVALID_REQUEST',
    'BINDING_CHANGED', 'BINDING_MISSING', 'PROFILE_MISSING', 'PRESET_MISSING', 'INSTRUCT_MISSING',
    'MODEL_MISSING', 'ENDPOINT_MISSING', 'UNSUPPORTED_BINDING', 'SERVICE_UNAVAILABLE',
    'PRIVACY_BLOCKED', 'PRIVACY_VIOLATION', 'CALL_LIMIT', 'ITERATION_CALL_LIMIT',
    'REQUEST_SCOPE_FAILED', 'REQUEST_SCOPE_CLOSED', 'REQUEST_CAPABILITY_MISMATCH', 'ACTOR_SCOPE_FAILED',
    'TRUNCATED_OUTPUT', 'COMPLETION_UNVERIFIED', 'PRIVATE_MATERIAL', 'STALE_ACTOR_SCOPE',
    'PROMPT_LIMIT', 'OUTPUT_LIMIT', 'INVALID_SETTINGS', 'INVALID_RESPONSE', 'EMPTY_OUTPUT',
    'TOKEN_COUNT_FAILED', 'REQUEST_UNAVAILABLE', 'UNSUPPORTED_SCHEMA', 'SCHEMA_LIMIT',
    'INVALID_SCHEMA', 'INVALID_JSON', 'SCHEMA_MISMATCH', 'INVALID_JSON_VALUE', 'INVALID_JSON_PATH', 'INVALID_JSON_OPTIONS',
    'ACTOR_ARTIFACT_SCOPE', 'ACTOR_CONTEXT_CHANGED', 'ACTOR_CONTEXT_LIMIT', 'ACTOR_GRANT_REQUIRED',
    'ACTOR_GUIDANCE_SCOPE', 'ACTOR_GUIDANCE_UNVERIFIED', 'ACTOR_MEMORY_SCOPE_MISMATCH',
    'ACTOR_MEMORY_UNAVAILABLE', 'ACTOR_MODEL_SCOPE', 'ACTOR_NOT_LOADED', 'ACTOR_PRESENCE_UNVERIFIED',
    'ACTOR_TRIGGER_UNVERIFIED', 'INVALID_ACTOR_PORTS', 'INVALID_ACTOR_REQUEST',
    'ENRICHMENT_LIMIT', 'EXTRACTION_LIMIT', 'INVALID_ENRICHMENT', 'INVALID_EVIDENCE',
    'INVALID_EXTRACTION', 'INVALID_INPUT', 'INVALID_PHASE', 'INVALID_PORTS', 'INVALID_RECORDS',
    'MISSING_INPUT', 'UNKNOWN_OPERATION', 'UNSUPPORTED_INPUT', 'VISIBILITY_REQUIRED',
    'DRAFT_EVIDENCE_RETENTION_FAILED', 'GUIDANCE_OVERFLOW', 'HOST_OPERATION_REQUIRED',
    'INVALID_OUTPUT', 'INVALID_RUN_CLOCK', 'INVALID_RUN_PLAN', 'INVALID_SNAPSHOT',
    'ITERATION_AUTHORITY', 'PENDING_REQUEST', 'RECALL_PROVENANCE_FAILED', 'REQUEST_IN_FLIGHT',
    'REQUEST_MISSING', 'UNRESOLVED_INPUT', 'WORKFLOW_FAILED', 'WRONG_PHASE',
]);
const DOM_EXCEPTION_NAME = typeof globalThis.DOMException === 'function'
    ? Object.getOwnPropertyDescriptor(globalThis.DOMException.prototype, 'name')?.get : undefined;
const own = (value, key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property) return undefined;
    if (!Object.hasOwn(property, 'value')) throw new Error();
    return property.value;
};

/** Return only safe request metadata; provider text and causes stay private. */
export function normalizeRequestFailure(error, { aborted = false } = {}) {
    if (aborted === true) return abortedFailure();
    const result = failure(), seen = new Set();
    let retryable = false, blocked = false, status, retryAfterMs;
    const inspectStatus = value => {
        if (!Number.isSafeInteger(value) || value < 100 || value > 599) return;
        if (!TRANSIENT_STATUSES.has(value)) { blocked = true; return; }
        retryable = true;
        status ??= value;
    };
    try {
        for (let depth = 0; error !== undefined && error !== null; depth++) {
            if (depth >= 6 || typeof error !== 'object' || seen.has(error)) return result;
            seen.add(error);
            const prototype = Object.getPrototypeOf(error);
            const name = own(error, 'name') ?? (prototype === TypeError.prototype ? 'TypeError'
                : DOM_EXCEPTION_NAME && prototype === globalThis.DOMException.prototype ? DOM_EXCEPTION_NAME.call(error) : undefined);
            const code = own(error, 'code');
            if (name === 'AbortError' || code === 'ABORTED' || code === 'ABORT_ERR') return abortedFailure();
            if (TERMINAL_CODES.has(code)) blocked = true;
            inspectStatus(own(error, 'status'));
            inspectStatus(own(error, 'statusCode'));
            const message = own(error, 'message');
            inspectStatus(STATUS_TEXT.get(message));
            inspectStatus(STATUS_TEXT.get(own(error, 'statusText')));
            if (name === 'TypeError' && NETWORK_MESSAGES.has(message) || NETWORK_CODES.has(code)) retryable = true;
            const delay = own(error, 'retryAfterMs');
            if (Number.isSafeInteger(delay) && delay >= 0) {
                if (delay > 30000) blocked = true;
                else retryAfterMs = Math.max(retryAfterMs ?? 0, delay);
            }
            error = own(error, 'cause');
        }
    } catch { return result; }
    if (retryable && !blocked) Object.assign(result.error, {
        retryable: true,
        ...(status === undefined ? {} : { status }),
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
    return result;
}
