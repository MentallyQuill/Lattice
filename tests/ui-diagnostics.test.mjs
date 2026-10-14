import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRecordedArtifact } from '../src/workflow/recording.js';

const api = await import('../src/ui/diagnostics.js').catch(() => ({}));
test('native history capacity and unverified saves point to the explicit Workflow Data actions',()=>{
 for(const code of ['CLOCK_LEDGER_FULL','FILE_RECEIPT_LIMIT']){const view=api.presentDiagnostic({code,message:'PRIVATE HOST DETAIL'});assert.match(view.message,/Workflow Data.*Preview history checkpoint/);assert.equal(JSON.stringify(view).includes('PRIVATE HOST DETAIL'),false);}
 const held=api.presentDiagnostic({code:'PERSISTENCE_UNKNOWN',message:'PRIVATE CHECKPOINT DETAIL'});assert.match(held.message,/Inspect saved history/);assert.equal(JSON.stringify(held).includes('PRIVATE CHECKPOINT DETAIL'),false);
 const corrupt=api.presentDiagnostic({code:'INVALID_DOCUMENT_HISTORY',message:'secret old action'});assert.match(corrupt.message,/history.*invalid/i);assert.equal(JSON.stringify(corrupt).includes('secret old action'),false);
});

test('unknown exceptions do not disclose private text or invent a remedy', () => {
    assert.equal(typeof api.presentDiagnostic, 'function');
    const view = api.presentDiagnostic({ code: 'INTERNAL_EXCEPTION', message: 'secret source: private diary; api_key=sk-secret' });
    assert.equal(view.severity, 'error');
    assert.equal(view.technical.code, 'INTERNAL_EXCEPTION');
    assert.doesNotMatch(view.technical.message, /diary|secret/);
    assert.match(view.message, /could not/i);
    assert.doesNotMatch(JSON.stringify(view), /diary|sk-secret|retry|send/i);
    assert.equal(api.diagnosticText('private diary'), view.message);
    assert.deepEqual(api.presentDiagnostics([]), []);
});

test('required input uses the visible node and input labels and retains a support code', () => {
    const view = api.presentDiagnostic({ code: 'MISSING_INPUT', message: 'Connect the required input artifact.' }, { nodeTitle: 'Response Plan', inputLabel: 'Context' });
    assert.match(view.message, /Response Plan.*Context/);
    assert.match(view.message, /connect/i);
    assert.equal(view.technical.code, 'MISSING_INPUT');
    assert.doesNotMatch(view.message, /artifact/);
});

test('diagnostic locations prevent independent node failures being collapsed', () => {
    const first = { workflowId: 'flow', instancePath: ['nested'], nodeId: 'one' };
    const second = { workflowId: 'flow', instancePath: ['nested'], nodeId: 'two' };
    const errors = [first, first, second].map(address => ({ code: 'MISSING_INPUT', message: 'Connect the required input artifact.', address }));
    const views = api.presentDiagnostics(errors);
    assert.equal(views.length, 2);
    assert.deepEqual(views[0].address, first);
    assert.deepEqual(views[1].address, second);
    assert.notEqual(views[0].id, views[1].id);
    assert.equal(api.presentDiagnostic(errors[0]).id, views[0].id);
});

test('malformed records and contexts never read accessors or convert objects to text', () => {
    let calls = 0;
    const input = { code: 'MISSING_INPUT', get message() { calls++; throw new Error('private'); }, get address() { calls++; return {}; } };
    const context = { get nodeTitle() { calls++; return 'private'; } };
    assert.doesNotThrow(() => api.presentDiagnostic(input, context));
    assert.equal(calls, 0);
    const list = []; Object.defineProperty(list, '0', { get() { calls++; throw new Error('private'); } });
    assert.doesNotThrow(() => api.presentDiagnostics(list));
    assert.equal(calls, 0);
    assert.equal(api.presentDiagnostic(new Error('private')).technical, null);
});

test('normal preview and cancellation states remain informational', () => {
    for (const code of ['PREVIEW_NOT_RUN', 'PREVIEW_RUNNING', 'PREVIEW_WAITING', 'PREVIEW_SKIPPED', 'OUTPUT_NOT_RETAINED', 'EARLIER_OUTPUT', 'ABORTED', 'CANCELLED', 'WORKFLOW_CANCELLED', 'FILE_CANCELLED', 'RECALL_PREVIEW_NO_ACTIVATION', 'NATIVE_SEND_REQUIRED']) {
        const view = api.presentDiagnostic({ code, message: '' });
        assert.equal(view.severity, 'info', code);
        assert.doesNotMatch(view.message, /could not complete|retry/i);
    }
    const native = api.presentDiagnostic({ code: 'MANUAL_NATIVE_TRIGGER_REQUIRED' });
    assert.match(native.message, /Enable Lattice, then send a message in SillyTavern/);
    assert.equal(native.severity, 'info');
    const enabled = api.presentDiagnostic({ code: 'MANUAL_NATIVE_TRIGGER_REQUIRED' }, { enabled: true });
    assert.equal(enabled.message, 'Send a message in SillyTavern to run this workflow.');
    assert.equal(api.presentDiagnostic('Library inspection is read-only and has no runtime output.').severity, 'info');
});

test('unknown and unverified saving outcomes never become failed-save retry advice', () => {
    for (const code of ['PERSISTENCE_UNKNOWN', 'PERSISTENCE_UNVERIFIED', 'SAVE_UNVERIFIED', 'APPLY_SAVE_UNVERIFIED']) {
        const view = api.presentDiagnostic({ code, message: 'private save payload' });
        assert.equal(view.severity, 'warning', code);
        assert.match(view.message, /confirm|verified/i);
        assert.doesNotMatch(JSON.stringify(view), /failed targets|retry|payload/i);
    }
    const partial = api.presentDiagnostic({ code: 'PERSISTENCE_PARTIAL' });
    assert.equal(partial.severity, 'warning');
    assert.match(partial.message, /accepted reply/);
    assert.doesNotMatch(partial.message, /retry/i);
});

test('unsupported connection causes retain different useful remedies', () => {
    const variants = [
        ['This installed host wrapper discards completion evidence. Use a connection that preserves its completion reason.', /completion reason/i],
        ['Named proxy routes cannot be verified through the public host context. Use a directly resolved connection.', /direct connection/i],
        ['This route inherits a reverse proxy that cannot be isolated through the public host services. Use a direct connection.', /direct connection/i],
        ['The host cannot convert text completion samplers across providers without switching the live connection.', /active.*provider|provider.*active/i],
        ['Only mapped chat/text completion connections are supported.', /chat.*text completion/i],
    ];
    const messages = [];
    for (const [message, remedy] of variants) {
        const view = api.presentDiagnostic({ code: 'UNSUPPORTED_BINDING', message });
        assert.match(view.message, remedy);
        assert.equal(view.technical.code, 'UNSUPPORTED_BINDING');
        messages.push(view.message);
    }
    assert.notEqual(messages[0], messages[1]);
    assert.notEqual(messages[1], messages[3]);
});

test('model truncation and compactor limits name relevant controls and preserve request cost', () => {
    const truncated = api.presentDiagnostic({ code: 'TRUNCATED_OUTPUT', message: 'The summary reached its completion limit.' }, { operation: 'smart-compactor' });
    assert.match(truncated.message, /Output tokens/);
    assert.match(truncated.message, /another model request/i);
    assert.match(truncated.message, /original/i);
    const budget = api.presentDiagnostic({ code: 'PIN_BUDGET_EXCEEDED', message: 'Pinned and recent messages exceed the target; increase the budget or reduce protected material.' });
    assert.match(budget.message, /Target tokens/);
    assert.match(budget.message, /Pinned wording.*Keep recent/);
    const display = api.presentDiagnostic({ code: 'PREVIEW_TRUNCATED' });
    assert.equal(display.severity, 'info');
    assert.doesNotMatch(display.message, /Output tokens|model request/);
});

test('source-specific stale review and setting causes precede general reused codes', () => {
    const review = api.presentDiagnostic({ code: 'STALE_SOURCE', message: 'The chat, reply, swipe, or prompt source changed. Run the workflow again.' });
    const memory = api.presentDiagnostic({ code: 'STALE_SOURCE', message: 'Selected memory evidence changed after it was read.' });
    assert.match(review.message, /review|candidate/i);
    assert.match(review.message, /another model request/i);
    assert.match(memory.message, /memory/i);
    assert.notEqual(review.message, memory.message);
    const settings = api.presentDiagnostic({ code: 'INVALID_SETTINGS', message: 'Invalid maxTokens.' });
    assert.match(settings.message, /Output tokens/);
    const metadata = api.presentDiagnostic({ code: 'INVALID_SETTINGS', message: 'Invalid node presentation or layout.' });
    assert.match(metadata.message, /layout|appearance/i);
});

test('known diagnostic details never echo embedded secrets or private source contents', () => {
    const view = api.presentDiagnostic({ code: 'REQUEST_FAILED', message: 'request failed bearer sk-secret private diary api_key=sensitive' });
    assert.equal(view.technical.code, 'REQUEST_FAILED');
    assert.doesNotMatch(JSON.stringify(view), /sk-secret|diary|sensitive|bearer/i);
});

test('file, revision, privacy, setup, import and graph families offer cause-specific guidance', () => {
    const cases = [
        ['FILE_TOO_LARGE', /400,000 bytes/, 'error'],
        ['FILE_CONTENT_TOO_LARGE', /100,000 characters/, 'error'],
        ['FILE_PERMISSION', /Save As/, 'error'],
        ['FILE_WRITE_FAILED', /draft.*open/, 'error'],
        ['FILE_CONFLICT', /Save As.*overwrit/i, 'error'],
        ['FILE_REVISION_CONFLICT', /changed.*projection|projection.*changed/i, 'error'],
        ['FILE_REFERENCE_UNAUTHORIZED', /Read File/, 'error'],
        ['PRIVATE_MATERIAL', /private|restricted/, 'error'],
        ['PRIVATE_DESTINATION', /visibility|private/, 'error'],
        ['ACTOR_REQUIRED', /character/, 'info'],
        ['CHAT_REQUIRED', /chat/, 'info'],
        ['DOCUMENT_SETUP_UNAVAILABLE', /Workflow Data/, 'info'],
        ['DOCUMENT_NOT_AUTHORIZED', /Workflow.*Configure.*Workflow Data/, 'error'],
        ['RECALL_UNAVAILABLE', /Enable Lattice/, 'info'],
        ['RECALL_QUEUE_CONFLICT', /matching.*settings/i, 'error'],
        ['RECALL_NOT_QUEUED', /Queue recall/, 'info'],
        ['RECALL_ACTOR_MISMATCH', /character|actor/, 'error'],
        ['INVALID_JSON', /JSON/, 'error'],
        ['UNSUPPORTED_PACKAGE', /Lattice.*workflow/, 'error'],
        ['MISSING_DEFINITION', /subgraph.*included/i, 'error'],
        ['READ_ONLY_DEFINITION', /local copy/i, 'info'],
        ['MISSING_PORTAL', /portal/i, 'error'],
        ['CYCLE', /loop/i, 'error'],
        ['ARTIFACT_KIND', /compatible|type/, 'error'],
        ['UPSTREAM_FAILED', /earlier step/, 'error'],
        ['INVALID_SETTINGS', /Details/, 'error'],
    ];
    for (const [code, expected, severity] of cases) {
        const view = api.presentDiagnostic({ code, message: 'private data must not be copied' });
        assert.match(view.message, expected, code);
        assert.equal(view.severity, severity, code);
        assert.equal(view.technical.code, code);
        assert.doesNotMatch(JSON.stringify(view), /data must not be copied/);
    }
});

test('effect callback and malformed persistence evidence remain unverified warnings', () => {
    for (const [code, message] of [
        ['PUBLICATION_UNKNOWN', 'Publication threw without a verified outcome; no effects were persisted.'],
        ['EFFECT_WRITE_UNKNOWN', 'The persistence callback threw without a verified outcome.'],
        ['INVALID_EFFECT_RESULT', 'Persistence returned no verified status.'],
        ['INVALID_FILE_BACKEND_RESULT', 'CAS must explicitly report application, revision and durable acknowledgement.'],
        ['INVALID_MEMORY_BACKEND_RESULT', 'CAS must explicitly report acknowledgement.'],
    ]) {
        const view = api.presentDiagnostic({ code, message });
        assert.equal(view.severity, 'warning', code);
        assert.match(view.message, /confirm|verified/i);
        assert.doesNotMatch(view.message, /failed targets|retry|Run to here|send/i);
    }
});

test('known local validation and catalog copy survives string boundaries but exceptions stay private', () => {
    assert.match(api.diagnosticText('Enter valid JSON before saving.'), /JSON/);
    const known = api.presentDiagnostic('BINDING_MISSING: Choose a connection profile from the dropdown beneath this node.');
    assert.match(known.message, /Connection profile/);
    assert.equal(api.diagnosticText(known.message), known.message);
    assert.equal(api.diagnosticText('SyntaxError: JSON private source text'), api.diagnosticText('private source'));
});

test('same code at one address preserves different causes and input remains unchanged', () => {
    const input = { code: 'UNSUPPORTED_BINDING', message: 'Named proxy routes cannot be verified through the public host context.', address: { workflowId: 'flow', instancePath: ['child'], nodeId: 'step' } };
    const other = { ...input, message: 'This installed host wrapper discards completion evidence.' };
    const original = JSON.stringify(input);
    const views = api.presentDiagnostics([input, other, input]);
    assert.equal(views.length, 2);
    views[0].address.instancePath.push('changed');
    assert.equal(JSON.stringify(input), original);
});

test('graph editing and Recall disabled explanations preserve their specific next action', () => {
    assert.match(api.diagnosticText({ code: 'UNSUPPORTED_VIEW', message: 'The qualified graph view does not exist.' }), /view.*unavailable|existing view/i);
    assert.match(api.diagnosticText({ code: 'STALE_DOCUMENT', message: 'The graph changed after import began. Prepare the edit again.' }), /changed.*prepare/i);
    const boundary = api.presentDiagnostic({ code: 'INVALID_PORT', message: 'Open an editable subgraph to add a port.' });
    assert.match(boundary.message, /editable subgraph/);
    for (const message of ['Lattice disabled', 'This Recall uses automatic triggers.', 'Recall is already queued.', 'Memory recall is available in the root workflow.']) {
        const view = api.presentDiagnostic(message);
        assert.equal(view.severity, 'info', message);
        assert.doesNotMatch(view.message, /could not complete/);
    }
});

test('operation context and compatible input types guide causes without exposing arbitrary details', () => {
    const compaction = api.presentDiagnostic({ code: 'TRUNCATED_OUTPUT', message: 'The request reached its completion limit.' }, { operation: 'smart-compactor' });
    assert.match(compaction.message, /summary/i);
    const type = api.presentDiagnostic({ code: 'ARTIFACT_KIND', message: 'These ports carry incompatible artifacts.' }, { outputType: 'context', inputType: 'draft' });
    assert.match(type.message, /context.*draft/);
    const malicious = api.presentDiagnostic({ code: 'ARTIFACT_KIND' }, { outputType: 'private diary', inputType: 'api_key=secret' });
    assert.doesNotMatch(JSON.stringify(malicious), /diary|api_key|secret/);
});

test('oversized inputs stay bounded and unknown support codes retain only safe generic details', () => {
    const view = api.presentDiagnostic({ code: 'REQUEST_FAILED', message: 'private '.repeat(100000) });
    assert.ok(JSON.stringify(view).length < 2000);
    const oversized = Array.from({ length: 1200 }, (_, index) => ({ code: 'MISSING_INPUT', message: 'Connect the required input artifact.', nodeId: 'n' + index }));
    assert.equal(api.presentDiagnostics(oversized).length, 1000);
    const unknownCode = api.presentDiagnostic({ code: 'NEW_SERVICE_FAILURE', message: 'raw private diary' });
    assert.equal(unknownCode.technical.code, 'NEW_SERVICE_FAILURE');
    assert.doesNotMatch(JSON.stringify(unknownCode), /raw private diary/);
    assert.equal(api.presentDiagnostic({ code: 'api_key=sk-secret', message: 'private' }).technical, null);
    assert.equal(api.presentDiagnostic({ code: 'OUTPUT_REMOVED' }).severity, 'info');
    assert.match(api.diagnosticText({ code: 'OUTPUT_REMOVED' }), /current output/);
    assert.equal(api.presentDiagnostic({ code: 'PREVIEW_READY' }).severity, 'info');
});

test('source-backed file and subgraph variants do not inherit the wrong family remedy', () => {
    const logical = api.presentDiagnostic({ code: 'FILE_NOT_FOUND', message: 'Select an existing logical document or an explicit creation template.' });
    assert.match(logical.message, /Workflow Data.*template|template.*Workflow Data/i);
    assert.doesNotMatch(logical.message, /Save As/);
    const missingOutput = api.presentDiagnostic({ code: 'MISSING_INPUT', message: 'The selected wrapper output has no connected source.' });
    assert.match(missingOutput.message, /subgraph.*Output boundary/i);
    const compression = api.presentDiagnostic({ code: 'REQUEST_FAILED', message: 'request failed' }, { operation: 'smart-compactor' });
    assert.match(compression.message, /original context/);
    const values = [
        { code: 'STALE_SOURCE', message: 'Selected memory evidence changed after it was read.' },
        { code: 'STALE_SOURCE', message: 'The chat, reply, swipe, or prompt source changed. Run the workflow again.' },
        { code: 'MISSING_INPUT', message: 'Connect the required input artifact.' },
    ];
    for (const source of values) {
        const view = api.presentDiagnostic(source);
        assert.equal(api.diagnosticText(view.message), view.message);
    }
});

test('Workflow Data validation names the controls needed to correct the draft', () => {
    const cases = [
        ['Use a positive starting day, a time within the day, and a day length in whole minutes.', /Starting day.*Starting time.*Hours per day/],
        ['Load a valid clock template before changing its starting values.', /Load initial values.*clock template/],
        ['Load the initial template before saving.', /Load initial values.*Save settings/],
        ['Choose an actor for private data.', /Actor ID.*Actor private/],
        ['The initial template could not be loaded.', /initial template.*Workflow Data/],
        ['Check the initial settings.', /initial.*Workflow Data/i],
        ['Check the new data settings.', /Name.*Format.*Visibility/],
    ];
    for (const [source, remedy] of cases) {
        const view = api.presentDiagnostic(source);
        assert.equal(view.severity, 'error', source);
        assert.match(view.message, remedy, source);
        assert.equal(view.technical, null);
        assert.equal(api.diagnosticText(view.message), view.message);
        const untrusted = api.presentDiagnostic(source + ' Private diary: a secret scene.');
        assert.doesNotMatch(JSON.stringify(untrusted), /diary|secret scene/);
    }
});

test('recording omissions distinguish size limits from model truncation', () => {
    for (const reason of ['recording-byte-limit', 'recording-metadata-limit', 'canonical-prefix-limit']) {
        const formatted = formatRecordedArtifact({ format: 'omitted', reason });
        const view = api.presentDiagnostic(formatted.text);
        assert.equal(view.severity, 'info', reason);
        assert.match(view.message, /recording.*size limit/i);
        assert.match(view.message, /does not mean.*model stopped early/i);
        assert.doesNotMatch(view.message, /Output tokens|retry|model request/);
    }
    for (const reason of ['invalid-diagnostic-data', 'invalid diagnostic data', 'unavailable', 'historical wrapper mapping unavailable']) {
        const view = api.presentDiagnostic(formatRecordedArtifact({ format: 'omitted', reason }).text);
        assert.equal(view.severity, 'info', reason);
        assert.match(view.message, /preview|earlier output/i);
        assert.doesNotMatch(view.message, /could not complete|retry|model request|run.*again/i);
    }
    const unknown = api.presentDiagnostic(formatRecordedArtifact({ format: 'omitted', reason: 'private source password=hidden' }).text);
    assert.doesNotMatch(JSON.stringify(unknown), /private source|password|hidden/);
});

test('fixed UI exception fallback messages remain honest about uncertain updates', () => {
    for (const source of ['Workflow data could not be updated.', 'Workflow Data setup could not be applied.', 'The subgraph could not be saved. Check the current settings before trying the edit again.']) {
        const view = api.presentDiagnostic(source);
        assert.equal(view.severity, 'warning', source);
        assert.match(view.message, /confirm|verified/i);
        assert.doesNotMatch(view.message, /retry|failed targets|restored|run.*again/i);
    }
    assert.match(api.diagnosticText('The edit could not be accepted. Check the current settings before trying the edit again.'), /current settings/i);
    assert.match(api.diagnosticText('The node could not be prepared.'), /node configuration/i);
    assert.match(api.diagnosticText('Memory recall could not be updated.'), /Recall controls/i);
    assert.match(api.diagnosticText('The portal change could not be accepted.'), /portal.*current/i);
    assert.match(api.diagnosticText('Could not change connection profile'), /Connection profile/i);
});

test('reserved R Recall conflicts name Run to here while duplicate shortcuts keep their existing remedy',()=>{
 const reserved=api.presentDiagnostic({code:'RECALL_HOTKEY_CONFLICT',message:'R is reserved for Run to here. Choose a different key.'});
 assert.equal(reserved.title,'Shortcut key is reserved');assert.match(reserved.message,/R is reserved for Run to here/);assert.match(reserved.message,/Details/);
 assert.doesNotMatch(reserved.message,/another active/);assert.equal(reserved.technical.code,'RECALL_HOTKEY_CONFLICT');
 const duplicate=api.presentDiagnostic({code:'RECALL_HOTKEY_CONFLICT',message:'This shortcut is already assigned to another active Recall Shortcut. Choose a different key.'});
 assert.match(duplicate.message,/another active Recall Shortcut/);
 const injected=api.presentDiagnostic({code:'RECALL_HOTKEY_CONFLICT',message:'R is reserved for Run to here. Choose a different key. PRIVATE diary sk-secret'});
 assert.match(injected.message,/another active Recall Shortcut/);assert.doesNotMatch(JSON.stringify(injected),/PRIVATE|diary|sk-secret/);
 let reads=0;const accessor=api.presentDiagnostic({code:'RECALL_HOTKEY_CONFLICT',get message(){reads++;return 'R is reserved for Run to here. Choose a different key.';}});
 assert.equal(reads,0);assert.match(accessor.message,/another active Recall Shortcut/);
});


test('INVALID_CONTROL_JSON uses actionable static authoring copy without revealing raw draft or exception text',()=>{
 for(const source of [{code:'INVALID_CONTROL_JSON',message:'private diary sk-secret'},'INVALID_CONTROL_JSON: private diary sk-secret']){
  const view=api.presentDiagnostic(source,{inputLabel:'Sections'});assert.match(view.message,/Enter valid JSON/);assert.equal(view.technical.code,'INVALID_CONTROL_JSON');assert.doesNotMatch(JSON.stringify(view),/diary|sk-secret/);
 }
});
