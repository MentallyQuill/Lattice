import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';
import { runWorkflowForHost } from '../src/workflow/runtime.js?v=0.27.3';
import { projectRecordedPreview } from '../src/ui/recorded-preview.js?v=0.27.3';
import { getPatternReportBinding } from '../src/workflow/operations/pattern-engine.js?v=0.27.3';
import { routingGraph, hostHarness, fourteen, retained, unit, target } from './helpers/pattern-routing-fixtures.mjs';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const name of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
const { mount, unmount, flushSync } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);

async function fixture(initial, actions, extras) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-pattern-neutrality-')), host = document.createElement('div'); document.body.append(host);
    let mounted;
    async function close() {
        if (mounted) await unmount(mounted); host.remove();
        const absolute = resolve(directory), rel = relative(resolve(tmpdir()), absolute); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
        await rm(absolute, { recursive: true, force: true });
    }
    try {
        const leaf = await compiled('OutputPreview', directory);
        const harness = await compiled('PatternPreviewHarness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions, extras } = $props(); let view = $state.raw(initial); export function update(next) { view = next; }</script><Leaf {view} {actions} {...extras} />`);
        mounted = mount(harness.component, { target: host, props: { initial, actions, extras } }); flushSync();
        return { host, update(next) { mounted.update(next); flushSync(); }, close };
    } catch (error) { await close(); throw error; }
}
function outputEntry(result, nodeId, portId) {
    const pin = unit(result, nodeId).ports.find(pin => pin.direction === 'output' && result.recording.identities.strings[pin.port] === portId);
    assert.notEqual(pin.artifact, null); return result.recording.artifacts[pin.artifact];
}
function preview(entry, displayedTarget, extra = {}) {
    const projected = projectRecordedPreview(entry), key = JSON.stringify(displayedTarget);
    return { sourceKey: 'record-pattern-neutrality', title: 'Pattern routing output', status: 'current', source: projected.source,
        choices: [{ key, label: 'Retained output', kind: entry.kind, target: displayedTarget }], selectedKey: key, pinned: false, followSelection: true,
        sections: projected.sections.map((section, i) => ({ ...section, id: 'artifact-' + i })), issues: [], busy: false, runHere: { enabled: true, callBound: 0 }, review: null, ...extra };
}
async function captured() {
    const message = '  **User wording**\n\n雪  \n', context = { kind: 'context', messages: [{ id: 'm1', role: 'user', text: message, source: 'chat' }] };
    const graph = routingGraph(), h = hostHarness(fourteen, { context, source: { originalText: fourteen, token: 'private-host-authority' } });
    const result = await runWorkflowForHost(graph, { ...h.ports, runId: 'pattern-neutrality-retained' }, h.hooks);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(h.effects.captures, 1); assert.equal(h.effects.filters, 1); assert.equal(h.effects.commits, 1);
    const recording = result.recording, original = JSON.stringify(recording), references = [...recording.artifacts];
    const liveDraft = retained(h.outputs, 'generate', 'draft'), liveReport = retained(h.outputs, 'pattern', 'matches');
    assert.equal(getPatternReportBinding(liveReport.value, liveDraft).ok, true);
    for (const key of Object.keys(h.effects)) h.effects[key] = 0;
    const dispatched = [], calls = { pin: [], follow: 0, run: 0, apply: 0, reject: 0 }, copies = [], saved = new Map([['lattice.workspace.preview', 'unchanged-geometry']]);
    const actions = {
        pin: (...args) => calls.pin.push(args), follow: () => calls.follow++,
        runHere: () => { calls.run++; dispatched.push(runWorkflowForHost(graph, h.ports, h.hooks)); },
        apply: () => { calls.apply++; h.effects.commits++; }, reject: () => calls.reject++,
    };
    const extras = { storage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }, copyText: text => copies.push(text) };
    const previousWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker'), previousWindowWorker = Object.getOwnPropertyDescriptor(window, 'Worker');
    class ForbiddenWorker { constructor() { h.effects.workers++; throw Error('Preview allocated a scan Worker'); } }
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: ForbiddenWorker }); Object.defineProperty(window, 'Worker', { configurable: true, value: ForbiddenWorker });
    const neutral = () => {
        assert.deepEqual(h.effects, { workers: 0, captures: 0, requests: 0, commits: 0, bindings: 0, tokens: 0, filters: 0, prepares: 0 });
        assert.equal(calls.run, 0); assert.equal(calls.apply, 0); assert.equal(calls.reject, 0);
        assert.equal(result.recording, recording); assert.equal(JSON.stringify(recording), original);
        references.forEach((entry, i) => assert.equal(recording.artifacts[i], entry));
        assert.equal(getPatternReportBinding(liveReport.value, liveDraft).ok, true);
    };
    return { h, result, message, calls, copies, saved, actions, extras, neutral, async close() {
        await Promise.all(dispatched);
        if (previousWorker) Object.defineProperty(globalThis, 'Worker', previousWorker); else delete globalThis.Worker;
        if (previousWindowWorker) Object.defineProperty(window, 'Worker', previousWindowWorker); else delete window.Worker;
    } };
}
const byLabel = (host, label) => host.querySelector(`[aria-label="${label}"]`);
const byText = (host, text) => [...host.querySelectorAll('button')].find(button => button.textContent === text);
async function click(element, c) { assert.ok(element); element.click(); await Promise.resolve(); flushSync(); c.neutral(); }

test('mounted Pattern and Filter mode/source-copy/tab/pin actions leave the retained run and every execution capability untouched', async () => {
    const c = await captured(), patternEntry = outputEntry(c.result, 'pattern', 'matches'), filterEntry = outputEntry(c.result, 'filter', 'report');
    const projected = projectRecordedPreview(patternEntry), originalSource = projected.source;
    const view = preview(patternEntry, target('pattern', 'matches')), originalSections = view.sections;
    const f = await fixture(view, c.actions, c.extras);
    try {
        c.neutral(); assert.equal(byLabel(f.host, 'Readable preview').getAttribute('aria-pressed'), 'true'); assert.equal(f.host.querySelector('[data-run-here]').disabled, false);
        assert.match(f.host.textContent, /pattern-matches|14 occurrences/);
        await click(byLabel(f.host, 'Source preview'), c);
        assert.equal(f.host.querySelector('[data-preview-source]').textContent, originalSource.text);
        await click(f.host.querySelector('[data-preview-copy-source]'), c);
        assert.deepEqual(c.copies, [originalSource.text]); assert.equal(JSON.parse(c.copies[0]).value.totalOccurrences, 14);
        assert.equal(c.copies[0].includes('private-host-authority'), false);
        await click(byLabel(f.host, 'Readable preview'), c);
        await click(f.host.querySelector('[role="tab"]'), c);
        await click(byLabel(f.host, 'Pin preview'), c);
        assert.deepEqual(c.calls.pin, [[view.sourceKey, target('pattern', 'matches')]]); assert.notEqual(c.calls.pin[0][1], view.choices[0].target);
        f.update({ ...view, pinned: true, followSelection: false }); c.neutral();
        await click(byLabel(f.host, 'Pin preview'), c); assert.equal(c.calls.follow, 1);
        assert.equal(view.source, originalSource); assert.equal(view.sections, originalSections); assert.equal(projectRecordedPreview(patternEntry), projected);
        f.update(preview(filterEntry, target('filter', 'report'))); c.neutral();
        await click(byLabel(f.host, 'Source preview'), c); await click(f.host.querySelector('[data-preview-copy-source]'), c);
        assert.equal(JSON.parse(c.copies[1]).value.recordType, 'text-filter'); assert.equal(JSON.parse(c.copies[1]).value.status, 'complete');
        assert.equal(c.saved.get('lattice.workspace.preview'), 'unchanged-geometry'); assert.equal(c.saved.get('lattice.workspace.preview.mode'), 'source');
    } finally { await f.close(); await c.close(); }
});

test('mounted Draft and captured-context expansion copy exact retained wording with zero runtime and publication effects', async () => {
    const c = await captured(), entry = outputEntry(c.result, 'generate', 'draft'), view = preview(entry, target('generate', 'draft'));
    const f = await fixture(view, c.actions, c.extras);
    try {
        c.neutral(); await click(byText(f.host, 'Copy text'), c); assert.deepEqual(c.copies, [fourteen]);
        const contextTab = [...f.host.querySelectorAll('[role="tab"]')].find(tab => /Captured context/.test(tab.textContent)); await click(contextTab, c);
        const details = f.host.querySelector('[data-preview-context]'); assert.ok(details); assert.equal(details.open, false);
        await click(details.querySelector('summary'), c); assert.equal(details.open, true);
        await click(byText(f.host, 'Copy message'), c); assert.deepEqual(c.copies, [fourteen, c.message]);
        await click(byLabel(f.host, 'Source preview'), c); await click(f.host.querySelector('[data-preview-copy-source]'), c);
        assert.equal(c.copies[2], view.source.text); assert.equal(c.copies[2].includes('private-host-authority'), false); assert.equal(JSON.parse(c.copies[2]).text, fourteen);
        await click(byLabel(f.host, 'Readable preview'), c);
        const reopened = f.host.querySelector('[data-preview-context]'); assert.ok(reopened); await click(reopened.querySelector('summary'), c); assert.equal(reopened.open, true);
        assert.equal(projectRecordedPreview(entry).source, view.source); assert.equal(c.result.recording.runId, 'pattern-neutrality-retained');
    } finally { await f.close(); await c.close(); }
});

test('mode/copy inspection of stale final review keeps freshness gates effective without refreshing or publishing', async () => {
    const c = await captured(), terminal = { kind: 'terminal', address: { workflowId: 'pattern-routing', instancePath: [], nodeId: 'review' } };
    const entry = c.result.recording.artifacts[c.result.recording.terminals[0].artifact];
    const selector = { handleId: 'retained-review', runId: c.result.runId, terminal }, review = { mode: 'root', selectedRootTerminal: true, selector, fresh: false, canApply: true, reason: 'The captured reply is stale.' };
    const view = preview(entry, terminal, { status: 'stale', review }), snapshot = JSON.stringify(view);
    const f = await fixture(view, c.actions, { ...c.extras, copyText: () => { throw Error('Clipboard denied'); } });
    try {
        c.neutral(); const apply = f.host.querySelector('[data-preview-apply]'); assert.equal(apply.disabled, true);
        await click(byLabel(f.host, 'Source preview'), c); await click(f.host.querySelector('[data-preview-copy-source]'), c);
        assert.match(f.host.querySelector('[role="status"]').textContent, /Could not copy/);
        await click(byLabel(f.host, 'Readable preview'), c); await click(byLabel(f.host, 'Pin preview'), c);
        assert.equal(f.host.querySelector('[data-preview-apply]').disabled, true); assert.equal(JSON.stringify(view), snapshot); assert.equal(view.review.selector, selector);
        assert.equal(c.copies.length, 0); assert.equal(c.h.settlements.length, 1, 'display never reopens settlement');
    } finally { await f.close(); await c.close(); }
});
