import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';

const dom = new JSDOM('<body></body>', { pretendToBeVisual: true, url: 'https://lattice.test' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLMediaElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
const { mount, unmount, flushSync } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);

async function fixture(initial, actions = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-diagnostic-history-'));
    const host = document.createElement('div'); document.body.append(host); let mounted;
    const cleanup = async () => {
        if (mounted) await unmount(mounted); host.remove();
        const target = resolve(directory), rel = relative(resolve(tmpdir()), target);
        assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
        await rm(target, { recursive: true, force: true });
    };
    try {
        const leaf = await compiled('RunDetails', directory);
        const harness = await compiled('DiagnosticHistoryHarness', directory, `<script>import RunDetails from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions } = $props(); let history = $state.raw(initial); export function update(next) { history = next; }</script><RunDetails view={null} {history} historyActions={actions} />`);
        mounted = mount(harness.component, { target: host, props: { initial, actions } }); flushSync();
    } catch (error) { await cleanup(); throw error; }
    return { host, update(next) { mounted.update(next); flushSync(); }, close: cleanup };
}
const history = extra => ({ scopeKey: 'user/chat', enabled: false, loading: false, issue: '', entries: [], selectedId: null, ...extra });
const address = { workflowId: 'workflow', instancePath: ['scene'], nodeId: 'extract' };
const saved = extra => ({ version: 1, id: 'run-1', origin: { userId: 'user', chatId: 'chat', workflowId: 'workflow', workflowName: '<b>Scene extraction</b>', runId: 'run-1', mode: 'root', native: true, startedAt: 1000 }, endedAt: 2000, status: 'completed', actualCalls: 2, callBound: 3, attempts: [{ address, attempt: 1, status: 'completed', validationError: { code: 'SCHEMA_MISMATCH', message: 'Required field is missing', findings: [{ path: '/scene/title', keyword: 'required', message: 'Required property is missing' }] }, retry: { reasonCode: 'SCHEMA_MISMATCH', delayMs: 250, nextAttempt: 2 }, response: { text: '<img src=x onerror=alert(1)>', visibility: 'actor-private', actorId: 'narrator' }, finish: 'stop', usage: { inputTokens: 21, outputTokens: 9 }, durationMs: 23 }, { address, attempt: 2, status: 'completed', response: { text: '{"scene":{"title":"Success"}}', visibility: 'public' } }], ...extra });

test('Run details offers parent-controlled diagnostic opt-in before a run with local privacy and retention notices', async () => {
    const enabled = [], f = await fixture(history(), { setEnabled: value => enabled.push(value) });
    try {
        const toggle = f.host.querySelector('input[aria-label="Save diagnostic logs"]');
        assert.ok(toggle, 'diagnostic switch must be available before any current run');
        assert.equal(toggle.checked, false); assert.deepEqual(enabled, []);
        assert.match(f.host.textContent, /in this browser/); assert.match(f.host.textContent, /private story text/);
        assert.match(f.host.textContent, /50 runs/); assert.match(f.host.textContent, /5 MiB/);
        toggle.checked = true; toggle.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync();
        assert.deepEqual(enabled, [true]);
        f.update(history({ enabled: true })); assert.equal(toggle.checked, true);
    } finally { await f.close(); }
});

test('saved history lists escaped workflow identity, result, attempts, node and retained error before parent-controlled selection', async () => {
    const selected = [], entry = saved(), f = await fixture(history({ entries: [entry] }), { select: id => selected.push(id) });
    try {
        assert.match(f.host.textContent, /Saved logs/);
        const row = f.host.querySelector('[data-diagnostic-log="run-1"]'); assert.ok(row);
        assert.match(row.textContent, /<b>Scene extraction<\/b>/); assert.equal(row.querySelector('b'), null);
        assert.match(row.textContent, /Completed/); assert.match(row.textContent, /2 attempts/);
        assert.match(row.textContent, /extract/); assert.match(row.textContent, /SCHEMA_MISMATCH/);
        assert.ok(row.querySelector('time[datetime="1970-01-01T00:00:01.000Z"]'));
        assert.equal(f.host.querySelector('[data-diagnostic-selection]'), null);
        row.querySelector('button').click(); flushSync(); assert.deepEqual(selected, ['run-1']);
        assert.equal(f.host.querySelector('[data-diagnostic-selection]'), null, 'selection changes only when the parent supplies selectedId');
    } finally { await f.close(); }
});

test('selected saved runs preserve failed validation and retry details beside escaped private response and successful recovery', async () => {
    const f = await fixture(history({ entries: [saved({ truncated: true })], selectedId: 'run-1' }));
    try {
        const selected = f.host.querySelector('[data-diagnostic-selection="run-1"]'); assert.ok(selected);
        assert.match(selected.textContent, /2 of 3 requests/); assert.match(selected.textContent, /Attempt 1/); assert.match(selected.textContent, /Attempt 2/);
        assert.match(selected.textContent, /Transport: Completed/); assert.match(selected.textContent, /Validation: SCHEMA_MISMATCH/);
        assert.match(selected.textContent, /\/scene\/title/); assert.match(selected.textContent, /required/); assert.match(selected.textContent, /Required field is missing/);
        assert.match(selected.textContent, /Retry: SCHEMA_MISMATCH/); assert.match(selected.textContent, /250 ms/); assert.match(selected.textContent, /attempt 2/);
        assert.match(selected.textContent, /Finish: stop/); assert.match(selected.textContent, /inputTokens: 21/); assert.match(selected.textContent, /outputTokens: 9/);
        assert.match(selected.textContent, /Private model output/); assert.match(selected.textContent, /Actor: narrator/);
        assert.equal(selected.querySelector('[data-diagnostic-response]').textContent, '<img src=x onerror=alert(1)>');
        assert.equal(selected.querySelector('img, script, iframe'), null);
        assert.match(selected.textContent, /Success/); assert.match(selected.textContent, /log was truncated/);
        assert.equal(selected.querySelector('button, a'), null, 'archived logs grant no navigation, run or Apply authority');
    } finally { await f.close(); }
});

test('export and clear use the displayed scope and show loading and storage issues without enabling stale actions', async () => {
    const calls = [], f = await fixture(history({ entries: [saved()], issue: 'Browser storage is unavailable.' }), { export: scopeKey => calls.push(['export', scopeKey]), clear: scopeKey => calls.push(['clear', scopeKey]) });
    try {
        const exportButton = f.host.querySelector('[data-diagnostic-export]'), clearButton = f.host.querySelector('[data-diagnostic-clear]');
        assert.ok(exportButton); assert.ok(clearButton);
        assert.match(f.host.textContent, /Browser storage is unavailable/);
        exportButton.click(); clearButton.click(); assert.deepEqual(calls, [['export', 'user/chat'], ['clear', 'user/chat']]);
        f.update(history({ scopeKey: 'other/chat', loading: true, entries: [saved()] }));
        assert.match(f.host.textContent, /Loading saved logs/); assert.equal(exportButton.disabled, true); assert.equal(clearButton.disabled, true);
        exportButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); clearButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        assert.equal(calls.length, 2, 'raw clicks cannot bypass the pending scope read');
        f.update(history({ scopeKey: 'other/chat', entries: [saved()] }));
        exportButton.click(); clearButton.click(); assert.deepEqual(calls.slice(2), [['export', 'other/chat'], ['clear', 'other/chat']]);
        f.update(history({ scopeKey: '', entries: [saved()] }));
        assert.equal(exportButton.disabled, true); assert.equal(clearButton.disabled, true);
    } finally { await f.close(); }
});

test('preflight failures retain their failing node even when no model request was made', async () => {
    const entry = saved({ attempts: [], actualCalls: 0, status: 'invalid', error: { code: 'MISSING_INPUT', message: 'A required input is missing', address: { ...address, nodeId: 'missing-context' } } });
    const f = await fixture(history({ entries: [entry] }));
    try {
        const row = f.host.querySelector('[data-diagnostic-log="run-1"]');
        assert.match(row.textContent, /Invalid/); assert.match(row.textContent, /0 attempts/);
        assert.match(row.textContent, /scene \/ missing-context/); assert.match(row.textContent, /MISSING_INPUT/);
    } finally { await f.close(); }
});

test('Workbench forwards saved history and actions into Run details', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-diagnostic-workbench-'));
    const host = document.createElement('div'); document.body.append(host); let mounted;
    try {
        const calls = [], leaf = await compiled('Workbench', directory);
        mounted = mount(leaf.component, { target: host, props: { actions: { setEnabled() {}, command() {}, mode() {}, zoom() {}, fitSelection() {}, diagnosticHistory: { setEnabled: enabled => calls.push(enabled) } } } });
        mounted.update({ diagnosticHistory: history({ enabled: true, entries: [saved()] }), runMeter: { status: 'empty', completedCount: 0, executableCount: 0, actualCalls: 0, callBound: 0, elapsedMs: null, rows: [] } }); flushSync();
        host.querySelector('.pc-run-meter').click(); flushSync();
        const toggle = host.querySelector('input[aria-label="Save diagnostic logs"]');
        assert.equal(toggle.checked, true, 'Workbench must pass its history DTO to the Run details panel');
        assert.equal(toggle.disabled, false); assert.match(host.querySelector('[role="dialog"][aria-label="Run details"]').textContent, /Scene extraction/);
        toggle.checked = false; toggle.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync();
        assert.deepEqual(calls, [false]);
    } finally {
        if (mounted) await unmount(mounted); host.remove();
        const target = resolve(directory), rel = relative(resolve(tmpdir()), target); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
        await rm(target, { recursive: true, force: true });
    }
});

test('saved logs remain inspectable while collection is off and explain when a new opt-in takes effect', async () => {
    const f = await fixture(history({ entries: [saved()], selectedId: 'run-1' }));
    try {
        assert.equal(f.host.querySelector('input[aria-label="Save diagnostic logs"]').checked, false);
        assert.ok(f.host.querySelector('[data-diagnostic-selection="run-1"]'));
        assert.match(f.host.textContent, /Turning this on applies to the next run/);
        assert.match(f.host.textContent, /Turning it off stops response capture immediately/);
        assert.match(f.host.textContent, /Saved logs stay available until cleared or removed/);
    } finally { await f.close(); }
});

test('history shows omission and truncation markers, suppresses hidden text, and drops obsolete scope selections', async () => {
    const entry = saved({ attempts: [{ address, attempt: 1, response: { text: 'HIDDEN-SENTINEL', visibility: 'hidden', omitted: 'Hidden response is not retained.' } }, { address, attempt: 2, response: { text: 'Retained prefix', visibility: 'public', truncated: true } }] });
    const f = await fixture(history({ entries: [entry], selectedId: 'run-1' }));
    try {
        assert.doesNotMatch(f.host.textContent, /HIDDEN-SENTINEL/);
        assert.match(f.host.textContent, /Response omitted: Hidden response is not retained/);
        assert.match(f.host.textContent, /Retained prefix/); assert.match(f.host.textContent, /Response text was truncated/);
        f.update(history({ scopeKey: 'user/other-chat', selectedId: 'run-1' }));
        assert.equal(f.host.querySelector('[data-diagnostic-selection]'), null);
        assert.doesNotMatch(f.host.textContent, /Retained prefix|Hidden response is not retained/);
        f.update(history({ scopeKey: 'user/other-chat', entries: [entry], selectedId: null }));
        assert.equal(f.host.querySelector('[data-diagnostic-selection]'), null, 'a recycled history entry cannot restore the earlier selection');
    } finally { await f.close(); }
});

test('response opt-in explains always-retained local failure metadata and opt-in-only successful runs', async () => {
    const f = await fixture(history());
    try {
        assert.match(f.host.querySelector('.pc-diagnostic-toggle').textContent, /Save model responses/);
        assert.match(f.host.textContent, /Failure metadata is always retained locally.*switch is off/s);
        assert.match(f.host.textContent, /Model output text.*requires.*opt.in/s);
        assert.match(f.host.textContent, /Successful and cancelled runs are saved only.*on/s);
        assert.match(f.host.textContent, /Turning it off stops response capture immediately/);
        assert.match(f.host.textContent, /Saved logs stay available until cleared or removed/);
    } finally { await f.close(); }
});

test('saved schema findings are escaped, bounded and validated before display', async () => {
    let reads = 0;
    const error = { code: 'SCHEMA_MISMATCH', message: 'JSON does not match the schema.', findings: [
        { path: '/<svg onload=alert(1)>', keyword: 'maxLength', message: 'Expected at most 120 characters; got 155.' },
        { path: '/summary', keyword: 'required', message: 'PRIVATE EXCEPTION <script>boom</script>' },
        { path: '/' + 'x'.repeat(300), keyword: 'required', message: 'PRIVATE OVERSIZE' },
        { path: '/hidden', keyword: 'secretKeyword', message: 'PRIVATE UNKNOWN' },
    ] };
    const entry = saved({ error, attempts: [] }), f = await fixture(history({ entries: [entry], selectedId: 'run-1' }));
    try {
        const findings = f.host.querySelector('.pc-diagnostic-findings');
        assert.equal(findings.querySelectorAll('li').length, 2);
        assert.match(findings.textContent, /\/<svg onload=alert\(1\)>/);
        assert.match(findings.textContent, /Expected at most 120 characters; got 155/);
        assert.match(findings.textContent, /Required field is missing/);
        assert.doesNotMatch(findings.textContent, /PRIVATE|boom/);
        assert.equal(findings.querySelector('svg,script'), null);
        const accessed = { code: 'SCHEMA_MISMATCH', message: 'JSON does not match the schema.', get findings() { reads++; throw Error('private'); } };
        f.update(history({ entries: [saved({ error: accessed, attempts: [] })], selectedId: 'run-1' }));
        assert.equal(reads, 0); assert.equal(f.host.querySelector('.pc-diagnostic-findings'), null);
    } finally { await f.close(); }
});
