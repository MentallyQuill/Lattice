import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';
import { projectRecordedPreview } from '../src/ui/recorded-preview.js';

const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLMediaElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const { mount, unmount, flushSync } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
async function fixture(name, props) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-diagnostics-'));
    const host = document.createElement('div'); document.body.append(host); let mounted;
    try { const leaf = await compiled(name, directory); mounted = mount(leaf.component, { target: host, props }); flushSync(); }
    catch (error) { host.remove(); await rm(directory, { recursive: true, force: true }); throw error; }
    return { host, async close() { await unmount(mounted); host.remove(); await rm(directory, { recursive: true, force: true }); } };
}
const address = { workflowId: 'workflow', instancePath: [], nodeId: 'model' };
const diagnostic = { id: 'connection', severity: 'error', title: 'Choose a connection', message: 'Open Connection Profile and choose a profile for this node.', technical: { code: 'MODEL_PROFILE_MISSING', message: 'Missing model profile' }, address };
const preview = extra => ({ sourceKey: 'record', title: 'Output', status: 'current', choices: [{ key: 'out', label: 'Output', kind: 'text', target: { ...address, portId: 'out' } }], selectedKey: 'out', pinned: false, followSelection: true, sections: [], issues: ['MODEL_PROFILE_MISSING: Missing model profile'], busy: false, runHere: { enabled: false, callBound: 1, issue: 'MODEL_PROFILE_MISSING: Missing model profile', reason: 'Choose a connection before running this node.' }, review: null, diagnostics: [diagnostic, diagnostic], ...extra });

test('Preview displays supplied diagnostics once, suppresses legacy duplicates and empty complaints, and explains disabled Run accessibly', async () => {
    const f = await fixture('OutputPreview', { view: preview(), actions: { runHere() { assert.fail('disabled Run must not execute'); } } });
    try {
        assert.equal(f.host.querySelectorAll('[data-diagnostic]').length, 1);
        assert.match(f.host.textContent, /Choose a connection/);
        assert.equal(f.host.querySelector('.pc-preview-empty'), null);
        const run = f.host.querySelector('[data-run-here]'); assert.equal(run.disabled, true);
        assert.match(f.host.querySelector('#' + run.getAttribute('aria-describedby')).textContent, /Choose a connection before running/);
        assert.equal(f.host.querySelectorAll('[role="alert"], [aria-live]').length, 0, 'persistent diagnostics must not duplicate announcements');
    } finally { await f.close(); }
});

test('Preview keeps the Apply save outcome visible alongside the earlier-run notice', async () => {
    const statusDetail = 'Reply applied locally. Saving is unconfirmed.';
    const historyNotice = 'This preview is from an earlier run. The reply outcome is retained for review.';
    const artifact = { kind: 'text', format: 'structured', value: { kind: 'text', text: 'Accepted reply' } };
    const projection = projectRecordedPreview(artifact);
    const view = preview({ diagnostics: [], issues: [], runHere: null, status: 'stale', statusDetail, historyNotice,
        source: projection.source, sections: [{ ...projection.sections[0], id: 'reply', label: 'Reply' }] });
    const before = structuredClone(view), copied = [];
    const f = await fixture('OutputPreview', { view, copyText: text => copied.push(text), storage: { getItem() { return null; }, setItem() {} } });
    try {
        const notes = [...f.host.querySelectorAll('.pc-preview-note')];
        assert.equal(notes.filter(note => note.textContent === statusDetail).length, 1, 'the Apply outcome remains a separate visible note');
        assert.equal(notes.filter(note => note.textContent === historyNotice).length, 1, 'the earlier-run notice does not replace the Apply outcome');
        assert.match(f.host.textContent, /Accepted reply/);
        assert.equal(f.host.querySelectorAll('[role="alert"], [aria-live]').length, 0, 'retained outcome notices do not duplicate announcements');
        f.host.querySelector('[aria-label="Source preview"]').click(); flushSync();
        assert.equal(f.host.querySelector('[data-preview-source]').textContent, projection.source.text);
        assert.deepEqual(JSON.parse(projection.source.text), artifact.value, 'Source is the entire retained diagnostic artifact');
        assert.match(f.host.querySelector('.pc-source-policy').textContent, /private host fields are excluded/);
        f.host.querySelector('[data-preview-copy-source]').click();
        assert.deepEqual(copied, [projection.source.text], 'copy retains the exact projected source');
        assert.deepEqual(view, before, 'presentation and copy preserve earlier-run outcome and retained content');
    } finally { await f.close(); }
});

test('DiagnosticMessage offers a collapsed native disclosure and explicit safe navigation without automatic actions', async () => {
    const calls = [];
    const f = await fixture('DiagnosticMessage', { diagnostic, reveal: value => calls.push(value) });
    try {
        assert.equal(calls.length, 0);
        assert.match(f.host.textContent, /Choose a connection/);
        const details = f.host.querySelector('details'); assert.equal(details.open, false);
        const summary = details.querySelector('summary'); summary.focus(); assert.equal(document.activeElement, summary);
        assert.equal(summary.textContent, 'Technical details'); summary.click(); assert.equal(details.open, true);
        const code = details.querySelector('code'); assert.equal(code.textContent, 'MODEL_PROFILE_MISSING');
        f.host.querySelector('button').click(); assert.deepEqual(calls, [address]);
    } finally { await f.close(); }
    for (const props of [{ diagnostic }, { diagnostic: { ...diagnostic, address: { nodeId: 'model' } }, reveal() { assert.fail(); } }]) {
        const unavailable = await fixture('DiagnosticMessage', props);
        try { assert.equal(unavailable.host.querySelector('button'), null); } finally { await unavailable.close(); }
    }
});

test('disabled Recall actions refer to visible setup and queue explanations without dispatching work', async () => {
    const view = { nodeId: 'recall', memorySetId: '', state: 'not-queued', queued: false, queueAllowed: false, cancelAllowed: false, reason: 'Choose a memory set in Details.', targetLabel: 'Reply', useLabel: 'Next matching generation', consumeLabel: 'Accepted result', activationLabel: 'Manual queue', statusText: 'Not queued', remaining: { reply: false, swipe: false }, pendingCount: 0, remainingText: 'Reply', consumerCount: 1, shortcutNodeIds: [], hotkeys: [] };
    const f = await fixture('RecallDetails', { view, actions: { queue() { assert.fail('disabled Queue must not execute'); }, cancel() { assert.fail('disabled Cancel must not execute'); } } });
    try {
        const [queue, cancel] = f.host.querySelectorAll('.pc-detail-actions button');
        for (const button of [queue, cancel]) {
            assert.equal(button.disabled, true);
            const description = button.getAttribute('aria-describedby'); assert.ok(description);
            assert.ok(f.host.querySelector('#' + description)?.textContent.trim());
            button.click();
        }
    } finally { await f.close(); }
});

test('Preview associates a disabled action with its existing explanation without repeating that explanation', async () => {
    const f = await fixture('OutputPreview', { view: preview({ runHere: { enabled: false, callBound: 1, reason: diagnostic.message } }), actions: { runHere() { assert.fail(); } } });
    try {
        assert.equal(f.host.textContent.split(diagnostic.message).length - 1, 1);
        const button = f.host.querySelector('[data-run-here]');
        assert.ok(f.host.querySelector('#' + button.getAttribute('aria-describedby'))?.querySelector('[data-diagnostic]'));
    } finally { await f.close(); }
});

test('Preview retains failures at distinct node addresses and makes Apply reasons available without enabling uncertain saves', async () => {
    const target = { kind: 'terminal', address };
    const f = await fixture('OutputPreview', { view: preview({ choices: [{ key: 'out', label: 'Review and Publish', kind: 'candidate', target }], diagnostics: [diagnostic, { ...diagnostic, id: 'other-node', address: { ...address, nodeId: 'other' } }], review: { selector: { handleId: 'review', runId: 'run', terminal: target }, mode: 'root', selectedRootTerminal: true, fresh: true, canApply: false, persistOnly: true, reason: 'The save outcome is unknown. Check the stored data before making another write.' } }), actions: { apply() { assert.fail('uncertain saves must not retry'); } } });
    try {
        assert.equal(f.host.querySelectorAll('[data-diagnostic]').length, 2);
        const button = f.host.querySelector('[data-preview-apply]'); assert.equal(button.disabled, true); button.click();
        assert.match(f.host.querySelector('#' + button.getAttribute('aria-describedby')).textContent, /save outcome is unknown/);
        assert.match(f.host.textContent, /keeps the accepted reply/); assert.match(f.host.textContent, /no model request/);
    } finally { await f.close(); }
});

test('recording omissions use a readable diagnostic instead of exposing internal recording reasons as preview text', async () => {
    const f = await fixture('OutputPreview', { view: preview({ diagnostics: [], issues: [], runHere: null, sections: [{ id: 'out', label: 'Output', kind: 'text', format: 'omitted', text: 'Artifact omitted: recording-byte-limit', truncated: false }] }) });
    try {
        assert.ok(f.host.querySelector('[role="tabpanel"] [data-diagnostic]'));
        assert.doesNotMatch(f.host.textContent, /Artifact omitted: recording-byte-limit/);
    } finally { await f.close(); }
});

test('component issue inputs go through shared presentation and never render an unknown exception payload', async () => {
    const f = await fixture('DiagnosticMessage', { issue: 'UNEXPECTED_FAILURE: Authorization: Bearer private-token; private source body' });
    try {
        assert.equal(f.host.querySelector('[data-diagnostic]').dataset.severity, 'error');
        assert.doesNotMatch(f.host.textContent, /private-token|private source body|Authorization|Bearer/);
        assert.equal(f.host.querySelector('details')?.open, false);
        assert.equal(f.host.querySelector('button'), null);
    } finally { await f.close(); }
    const legacy = await fixture('OutputPreview', { view: preview({ diagnostics: undefined, review: null }) });
    try { assert.equal(legacy.host.querySelectorAll('[data-diagnostic]').length, 1); assert.equal(legacy.host.querySelector('.pc-preview-empty'), null); }
    finally { await legacy.close(); }
});

test('busy Preview explains disabled Run and Apply when projection supplied empty reasons', async () => {
    const target = { kind: 'terminal', address };
    const f = await fixture('OutputPreview', { view: preview({ busy: true, choices: [{ key: 'out', label: 'Review and Publish', kind: 'candidate', target }], diagnostics: [], issues: [], runHere: { enabled: true, callBound: 0, reason: '' }, review: { selector: { handleId: 'review', runId: 'run', terminal: target }, mode: 'root', selectedRootTerminal: true, fresh: true, canApply: true, reason: '' } }), actions: { runHere() { assert.fail('busy Run must not execute'); }, apply() { assert.fail('busy Apply must not execute'); } } });
    try {
        for (const selector of ['[data-run-here]', '[data-preview-apply]']) {
            const button = f.host.querySelector(selector); assert.equal(button.disabled, true); button.click();
            const description = button.getAttribute('aria-describedby'); assert.ok(description, 'every blocked action must reference its visible reason');
            assert.match(f.host.querySelector('#' + description).textContent, /Wait for the current run to finish/);
        }
    } finally { await f.close(); }
});

test('Preview names actual confirmed, unverified and unchanged save receipts without changing retry authority', async () => {
    const target = { kind: 'terminal', address };
    const view = preview({ diagnostics: [], issues: [], runHere: null, choices: [{ key: 'out', label: 'Review and Publish', kind: 'candidate', target }], settlement: { status: 'save-unverified', published: true, receipts: [{ intentId: 'one', targetId: 'notes', status: 'confirmed' }, { intentId: 'two', targetId: 'clock', status: 'save-unverified' }, { intentId: 'three', targetId: 'outcomes', status: 'unchanged' }] }, review: { selector: { handleId: 'review', runId: 'run', terminal: target }, mode: 'root', selectedRootTerminal: true, fresh: true, canApply: false, persistOnly: true, reason: 'Check the stored data before making another write.' } });
    const before = structuredClone(view);
    const f = await fixture('OutputPreview', { view, actions: { apply() { assert.fail('unverified saves cannot retry'); } } });
    try {
        const receipts = [...f.host.querySelectorAll('.pc-preview-settlement .pc-preview-note')].map(element => element.textContent.trim());
        assert.deepEqual(receipts, ['notes · Saved', 'clock · Save not verified', 'outcomes · Already current']);
        const apply = f.host.querySelector('[data-preview-apply]'); assert.equal(apply.disabled, true); apply.click();
        assert.deepEqual(view, before, 'display labels must not mutate the underlying settlement');
    } finally { await f.close(); }
});
