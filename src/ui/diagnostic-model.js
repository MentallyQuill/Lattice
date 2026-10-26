const error = (id, title, message) => ({ id, severity: 'error', title, message });
const warning = (id, title, message) => ({ id, severity: 'warning', title, message });
const cost = ' Running it again makes another model request.';

// Specific causes precede reused code defaults. Source: connections.js,
// compactor.js and graph-validation.js. Labels come from workspace-preparation.js.
export const modelVariants = [
    ['UNSUPPORTED_BINDING', /discards completion evidence|preserves? (?:its )?completion reason/i, error('binding-finish', 'Connection cannot verify completion', 'This connection does not preserve the completion reason Lattice needs. Choose a connection that reports its completion reason.')],
    ['UNSUPPORTED_BINDING', /proxy|directly resolved/i, error('binding-proxy', 'Proxy connection cannot be verified', 'Lattice cannot verify this proxy route. Choose a direct connection in Connection profile.')],
    ['UNSUPPORTED_BINDING', /samplers across providers|switching the live connection/i, error('binding-provider', 'Provider settings do not match', 'This text completion profile uses a different provider from the active SillyTavern connection. Choose a profile for the active provider.')],
    ['TRUNCATED_OUTPUT', /summary/i, warning('summary-truncated', 'Summary stopped early', 'The summary reached Output tokens before finishing. The original context is retained. Increase Output tokens in Details if you choose to run compression again.' + cost)],
    ['COMPLETION_UNVERIFIED', /summary/i, warning('summary-unverified', 'Summary completion is not confirmed', 'The connection did not confirm that the summary finished. The original context is retained. Check that the connection reports a completion reason.')],
    ['EMPTY_OUTPUT', /summary/i, warning('summary-empty', 'Summary is empty', 'The model returned no summary text. The original context is retained. Check the connection and compression settings.' + cost)],
    ['REQUEST_FAILED', /compression/i, error('compression-request', 'Compression could not finish', 'The compression request could not finish. The original context is retained. Check Connection profile and the provider status.' + cost)],
    ['INVALID_SETTINGS', /target\/completion limit|compaction method/i, error('compactor-settings', 'Check Smart Compactor settings', 'Use positive Target tokens and Output tokens, a valid Keep recent count, and a supported Method in Details.')],
    ['INVALID_SETTINGS', /presentation|layout|enabled\/group/i, error('node-layout', 'Check node appearance', 'The saved node appearance or layout is invalid. Check the node’s Details and group membership.')],
    ['INVALID_SETTINGS', /model binding|role binding/i, error('binding-setting', 'Check model settings', 'Check Connection profile, Model mode, and Model identifier in Details.')],
    ['INVALID_SETTINGS', /^Invalid maxTokens\.$/i, error('output-tokens-setting', 'Check Output tokens', 'Enter a positive whole number within the allowed range for Output tokens in Details.')],
];
export const modelCopy = {
    UNSUPPORTED_BINDING: error('binding-unsupported', 'Connection type is not supported', 'Choose a supported chat or text completion connection in Connection profile.'),
    BINDING_MISSING: error('binding-missing', 'Choose a connection', 'Choose Connection profile on this node before running it.'),
    PROFILE_MISSING: error('profile-missing', 'Connection profile is unavailable', 'The selected Connection profile is missing or unavailable. Choose an available profile on the node.'),
    MODEL_MISSING: error('model-missing', 'Choose a model', 'Select a model in the connection profile or set Model identifier in Details.'),
    PRESET_MISSING: error('preset-missing', 'Sampler preset is unavailable', 'The selected connection profile’s sampler preset is missing. Select an available preset in SillyTavern Connection Manager.'),
    INSTRUCT_MISSING: error('instruct-missing', 'Instruct preset is unavailable', 'The selected connection profile’s instruct preset is missing. Choose an available instruct preset in SillyTavern.'),
    ENDPOINT_MISSING: error('endpoint-missing', 'Connection needs provider settings', 'Complete the endpoint and account settings for the selected provider in SillyTavern.'),
    BINDING_CHANGED: error('binding-changed', 'Connection settings changed', 'The connection changed after it was checked. Review Connection profile and the current provider settings before running this step.'),
    SERVICE_UNAVAILABLE: error('service-unavailable', 'SillyTavern service is unavailable', 'A required SillyTavern service is unavailable. Check the installed host version and connection settings.'),
    REQUEST_FAILED: error('request-failed', 'Model request could not finish', 'The model request could not finish. Check Connection profile and the provider status.' + cost),
    TRUNCATED_OUTPUT: warning('model-truncated', 'Model output stopped early', 'The model reached Output tokens before finishing. Increase Output tokens in Details if you choose to run this step again.' + cost),
    COMPLETION_UNVERIFIED: warning('completion-unverified', 'Completion is not confirmed', 'The connection did not confirm that the model finished. The unverified result is not used. Check that the connection reports a completion reason.'),
    EMPTY_OUTPUT: error('output-empty', 'No text returned', 'The model returned no text. Check Connection profile and the request settings.' + cost),
    SCHEMA_MISMATCH: error('model-schema', 'JSON does not match the schema', 'The data is valid JSON, but its fields or value types do not match this node’s schema. Check the connected data and schema in Details. For model output, check its instructions; an enabled corrective retry may already have been attempted.'),
    PIN_MISSING: error('pin-missing', 'Pinned wording was not found', 'A phrase in Pinned wording is missing from the input. Check its exact spelling and capitalization in Details.'),
    PIN_BUDGET_EXCEEDED: error('pin-budget', 'Protected context exceeds the budget', 'Pinned wording and Keep recent preserve more context than Target tokens allows. Increase Target tokens or reduce the protected material in Details.'),
    INPUT_LIMIT: error('compression-input-limit', 'Context does not fit compression', 'No flexible message fits the compression input limit. Reduce the input context or use Method “select”. The original context is retained.'),
    COMPACTION_OVERFLOW: warning('compaction-overflow', 'Summary exceeds the context budget', 'The summary and protected messages exceed Target tokens. The original context is retained. Increase Target tokens or reduce Pinned wording and Keep recent.'),
    TOKEN_COUNT_FAILED: error('token-count-failed', 'Token count is unavailable', 'Lattice could not measure the token count. Check the selected connection’s tokenizer. The original input is retained.'),
};
