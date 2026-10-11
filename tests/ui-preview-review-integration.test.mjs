import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
import { starterGraph } from '../src/workflow/starters.js?v=0.27.0';
import { cloneWorkflowDocument } from '../src/workflow/document.js?v=0.27.0';
import { prepareCreateFromSelection } from '../src/workflow/composition.js?v=0.27.0';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js?v=0.27.0';
import { createNativeWorkflowController } from '../src/workflow/host.js?v=0.27.0';
import { createWorkflowSession, prepareWorkflowProjection, projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.0';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.0';
import { prepareWorkspaceViews, prepareLibraryViews, projectWorkspacePanels } from '../src/ui/workspace-preparation.js?v=0.27.0';
import {projectRecallView} from '../src/ui/recall-projection.js?v=0.27.0';
import { readNodePresentation } from '../src/ui/node-palette.js?v=0.27.0';
import { compiled as compileComponent } from './helpers/svelte-compile.mjs';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLMediaElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync } = await import(clientURL);
const controllerText = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function controllerFunction(name, env) {
    env.recallProjection ??= {nodes:{}}; env.recallSetupView ??= () => null;
    env.activeEditRoot ??= () => env.current;
    env.readNodePresentation ??= readNodePresentation;
    env.documentTransition ??= false;
    if (name === 'selectionMenuCapabilities') env.rootSystemWritable ??= controllerFunction('rootSystemWritable', env);
    const start = controllerText.indexOf('function ' + name + '(');
    if (start < 0) {
        const declaration = controllerText.indexOf('const ' + name + ' =');
        if (declaration < 0) return null;
        return Function('env', 'with(env){' + controllerText.slice(declaration, controllerText.indexOf('\n', declaration)) + ';return ' + name + ';}')(env);
    }
    const end = controllerText.indexOf('\nfunction ', start + 1);
    return Function('env', 'with(env){' + (controllerText.slice(start - 6, start) === 'async ' ? 'async ' : '') + controllerText.slice(start, end) + ';return ' + name + ';}')(env);
}
function controllerActions(env) {
    const start = controllerText.indexOf('const outputPreviewActions = {'), end = controllerText.indexOf('\nconst runDetailsActions', start);
    return Function('env', 'with(env){' + controllerText.slice(start, end) + ';return outputPreviewActions;}')(env);
}
async function previewFixture(initial, actions) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-preview-review-')), host = document.createElement('div'); document.body.append(host);
    let mounted;
    async function compiled(name, source) {
        return (await compileComponent(name, directory, source)).path;
    }
    async function close() {
        if (mounted) await unmount(mounted); host.remove();
        const rel = relative(resolve(tmpdir()), resolve(directory)); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(directory, { recursive: true, force: true });
    }
    try {
        const leaf = await compiled('OutputPreview', await readFile(new URL('../ui/OutputPreview.svelte', import.meta.url), 'utf8'));
        const harness = await compiled('PreviewHarness', `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf).href)}; let { initial, actions } = $props(); let view = $state.raw(initial); export function update(next) { view = next; }</script><Leaf {view} {actions} />`);
        mounted = mount((await import(pathToFileURL(harness).href)).default, { target: host, props: { initial, actions } }); flushSync();
        return { host, update(next) { mounted.update(next); flushSync(); }, close };
    } catch (error) { await close(); throw error; }
}
function childDefinition() {
    const checked = computeDefinitionIdentity({ id: 'inspection', version: 1, name: 'Inspection', parameters: [], interface: [{ id: 'text', label: 'Text', direction: 'output', kind: 'text', required: false, cardinality: 'one', boundaryNodeId: 'exit' }], body: { schema: 3, runtime: 2, mode: 'native-post', nodes: { compose: { id: 'compose', type: 'workflow', operation: 'compose', outputKind: 'text', sections: [{ name: 'value', text: 'Diagnostic only' }] }, exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'text' } }, wires: { edge: { id: 'edge', route: 'wire', from: 'compose', fromPort: 'out', to: 'exit', toPort: 'in' } } } });
    assert.equal(checked.ok, true, JSON.stringify(checked));
    return { ...checked.data.materializedDefinition, semanticHash: checked.data.semanticHash };
}
function adapter(schema = 3, suppliedRoot = null) {
    const saved = starterGraph('unified-basic');
    const root = suppliedRoot ?? (schema === 3 ? cloneWorkflowDocument(saved).data : saved), definition = childDefinition();
    if (schema === 3 && root.mode === 'native-unified') {
        root.definitions[definitionRefKey(definition)] = definition;
        root.nodes.inspection = { id: 'inspection', type: 'subgraph', definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash }, parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} };
    }
    const message = { mes: 'We delve.\n雪', is_user: false, swipe_id: 0, swipes: ['We delve.\n雪'], swipe_info: [{ extra: {}, gen_started: 1, gen_finished: 2 }], extra: {}, gen_started: 1, gen_finished: 2 };
    const counters = { requests: 0, checks: 0, apply: 0, saves: 0, cancel: 0, reject: 0 };
    const context = { chatId: 'review', characterId: 1, groupId: null, chat: [{ mes: 'Hello', is_user: true }, message], extensionPrompts: {}, setExtensionPrompt(key, value) { this.extensionPrompts[key] = { value }; }, saveChat: async () => { counters.saves++; }, updateMessageBlock: async () => {}, swipe: { refresh: async () => {} } };
    const listeners = new Map(); let nativeBusy = false;
    context.eventTypes = Object.fromEntries(['GENERATION_STARTED', 'GENERATION_ENDED', 'MESSAGE_RECEIVED'].map(name => [name, name]));
    context.eventSource = { on(name, fn) { const bucket = listeners.get(name) ?? []; bucket.push(fn); listeners.set(name, bucket); }, removeListener() {}, async emit(name, ...args) { for (const fn of listeners.get(name) ?? []) await fn(...args); } };
    const host = createNativeWorkflowController({ context: () => context, userId: () => 'review-user', getGraph: () => root, isEnabled: () => true, isBusy: () => nativeBusy, countTokens: async text => ({ tokens: Math.ceil(text.length / 4), method: 'fixture' }), resolveBinding: () => { throw new Error('A scan-only run must not resolve bindings'); }, request: async () => { counters.requests++; throw new Error('A scan-only run must not request a model'); }, syncMesToSwipe: index => { const item = context.chat[index]; item.swipes[item.swipe_id] = item.mes; return true; }, syncSwipeToMes: (index, id) => { const item = context.chat[index]; item.swipe_id = id; item.mes = item.swipes[id]; Object.assign(item, structuredClone(item.swipe_info[id])); return true; } });
    host.subscribe();
    const runtime = { ...host, candidateStatus(candidate) { counters.checks++; return host.candidateStatus(candidate); }, async apply(candidate) { counters.apply++; return host.apply(candidate); }, cancel(reason) { counters.cancel++; host.cancel(reason); }, reject(selector) { counters.reject++; return host.reject(selector); } };
    const prepared = prepareWorkspaceViews(root, { candidateStatus: candidate => runtime.candidateStatus(candidate) }); assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const library = prepareLibraryViews(root.id, { [definitionRefKey(definition)]: definition }); assert.equal(library.ok, true, JSON.stringify(library));
    prepared.data.navigation.push(...library.data.navigation); prepared.data.preparedViews.push(...library.data.preparedViews);
    const graphViews = createGraphViewSession({ root, activationId: 'preview-review-' + schema, ...prepared.data }).data; assert.ok(graphViews);
    const env = { documentSession: { draftNamespace: () => 'preview-document' }, workflowNodePresentations: new WeakMap(), workflowRuntime: { getNativeWorkflowController: () => runtime }, current: root, graphViews, workspacePrepared: prepared.data, rootRunEpoch: 1, workspaceRevision: 1, uiEpoch: 1, editorCaptures: new WeakMap(), workspaceIssue: '', selectedPreview: null, pinnedPreview: null, targetedPreview: null, selectedKind: 'node', selected: root.nodes['review-publish'], workflowProjection: null, workflowProjectionGraph: null, workflowState: { result: null, reviewHandles: [], busy: false, availability: 'current', applyIssue: '' }, canvas: { selection: null, multi: new Set(), setRecallStatus() {}, setPreviewTarget() {} }, recallDetailsView: null, recallSelectionIds: () => [], projectRecallView, canvasTraceRows: null, editorDraw: null, isOpen: () => true, settings: () => ({}), projectPreparedWorkflow, projectWorkspacePanels, workbench: { update(value) { env.panels = value; } } };
    for (const name of ['previewAddress', 'effectivePreview', 'recallSetupView', 'captureEditor', 'editorCurrent', 'samePreviewTerminal', 'currentRootPreviewTerminal', 'currentPreviewHandle', 'applyPreviewReview', 'rejectPreviewReview', 'workflowView', 'selectionMenuCapabilities', 'guideInsertionIsBusy', 'updateWorkflowProjection', 'runPreviewHere']) { const fn = controllerFunction(name, env); if (fn) env[name] = fn; }
    env.workflowSession = createWorkflowSession({ runtime: () => runtime, rootCurrent: () => env.current, runEpoch: () => env.rootRunEpoch, active: () => env.isOpen(), changed(state) { const authorityChanged = state.result !== env.workflowState.result || state.reviewHandles !== env.workflowState.reviewHandles; env.workflowState = state; if (authorityChanged) env.workspacePrepared.workflow = prepareWorkflowProjection(env.current, { ...(prepared.data.planner ? { planner: prepared.data.planner } : {}), result: state.result, candidateStatus: candidate => runtime.candidateStatus(candidate) }); env.updateWorkflowProjection(); } });
    const actions = controllerActions(env);
    return { root, env, actions, graphViews, runtime, counters, context, message, definition, run: async () => {
        context.chat.pop(); nativeBusy = true; await context.eventSource.emit('GENERATION_STARTED', 'normal', {}, false);
        const started = await runtime.beforeGenerate(context.chat, 8192, () => {}, 'normal'); assert.equal(started.ok, true, JSON.stringify(started.error));
        const now = new Date().toISOString(); message.gen_started = now; message.gen_finished = now; message.swipe_info[0].gen_started = now; message.swipe_info[0].gen_finished = now;
        context.chat.push(message); await context.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal'); nativeBusy = false; await context.eventSource.emit('GENERATION_ENDED', 2);
        for (let attempts = 0; attempts < 50 && !runtime.lastAutomaticResult(); attempts++) await new Promise(resolve => setTimeout(resolve, 5));
        const record = runtime.lastAutomaticResult(); assert.ok(record); env.workflowSession.receiveAutomatic(record); return record.result;
    }, refresh: () => env.updateWorkflowProjection(), terminal: { kind: 'terminal', address: { workflowId: root.id, instancePath: [], nodeId: 'review-publish' } } };
}

function nestedAdapter() {
    const source = cloneWorkflowDocument(starterGraph('unified-basic')).data;
    const extracted = prepareCreateFromSelection(source, { nodeIds: Object.keys(source.nodes), definitionId: 'reply-body', instanceId: 'body', name: 'Nested reply' });
    assert.equal(extracted.ok, true, JSON.stringify(extracted.error));
    const fixture = adapter(3, extracted.data.candidate);
    fixture.terminal.address.instancePath = ['body'];
    return fixture;
}

test('a native nested review survives the session and addressed child preview can Apply or Reject', async () => {
    for (const action of ['apply', 'reject']) {
        const f = nestedAdapter(); await f.run();
        assert.equal(f.env.workflowState.reviewHandles.length, 1, 'the native root result retains its nested review handle');
        const handle = f.env.workflowState.reviewHandles[0];
        assert.deepEqual(handle.terminal.address, { workflowId: f.root.id, instancePath: ['body'], nodeId: 'review-publish' });
        assert.equal(f.graphViews.openInstance(['body']).ok, true);
        f.env.selected = f.graphViews.readEditor().prepared.savedGraph.nodes['review-publish'];
        f.env.selectedPreview = structuredClone(f.terminal); f.refresh();
        assert.deepEqual(f.env.panels.outputPreview.review?.selector, handle);
        assert.equal(f.env.workflowProjection.result.applyAvailable, true);
        const leaf = await previewFixture(f.env.panels.outputPreview, f.actions);
        try {
            const apply = leaf.host.querySelector('[data-preview-apply]');
            const reject = [...leaf.host.querySelectorAll('button')].find(button => button.textContent === 'Reject reply');
            assert.equal(apply.disabled, false); assert.equal(reject.disabled, false);
            (action === 'apply' ? apply : reject).click();
            for (let attempts = 0; attempts < 50 && f.env.workflowState.reviewHandles.length; attempts++) await new Promise(resolve => setTimeout(resolve, 5));
            assert.equal(f.env.workflowState.reviewHandles.length, 0);
            assert.equal(f.counters.apply, action === 'apply' ? 1 : 0); assert.equal(f.counters.reject, action === 'reject' ? 1 : 0);
            assert.equal(f.counters.saves, action === 'apply' ? 1 : 0);
            assert.deepEqual(f.message.swipes, action === 'apply' ? ['We delve.\n雪', 'We delve.\n雪'] : ['We delve.\n雪']);
            assert.equal(f.counters.requests, 0);
        } finally { await leaf.close(); f.runtime.dispose(); }
    }
});

test('nested review selectors reject unrelated child, library, forged, replaced and stale ownership', async () => {
    const f = nestedAdapter(); await f.run();
    const handle = f.env.workflowState.reviewHandles[0]; assert.ok(handle);
    f.env.pinnedPreview = structuredClone(f.terminal); f.refresh();
    assert.deepEqual(f.env.panels.outputPreview.review?.selector, handle, 'the root can inspect its owned nested terminal');
    const checks = f.counters.checks;
    assert.equal(f.graphViews.openInstance(['inspection']).ok, true); f.refresh();
    assert.equal(f.env.panels.outputPreview.review, null);
    await f.actions.apply(handle); f.actions.reject(handle); assert.equal(f.counters.checks, checks);
    assert.equal(f.graphViews.openLibrary(f.root.nodes.inspection.definition).ok, true); f.refresh();
    assert.equal(f.env.panels.outputPreview.review, null);
    await f.actions.apply(handle); f.actions.reject(handle); assert.equal(f.counters.checks, checks);
    assert.equal(f.graphViews.openInstance(['body']).ok, true); f.refresh();
    for (const changed of [{ handleId: 'forged' }, { runId: 'forged' }, { terminal: { kind: 'terminal', address: { ...handle.terminal.address, workflowId: 'other' } } }, { terminal: { kind: 'terminal', address: { ...handle.terminal.address, instancePath: ['inspection'] } } }, { terminal: { kind: 'terminal', address: { ...handle.terminal.address, nodeId: 'generate-reply' } } }]) {
        await f.actions.apply({ ...handle, ...changed }); f.actions.reject({ ...handle, ...changed });
    }
    assert.equal(f.counters.checks, checks); assert.equal(f.counters.apply, 0); assert.equal(f.counters.reject, 0);
    const currentResult = f.env.workflowState.result;
    f.env.workflowState.result = { ...currentResult }; await f.actions.apply(handle); f.actions.reject(handle);
    assert.equal(f.counters.checks, checks); f.env.workflowState.result = currentResult;
    f.message.mes += ' external change'; await f.actions.apply(handle);
    assert.equal(f.counters.checks, checks + 1); assert.equal(f.counters.apply, 0); assert.match(f.env.workflowState.applyIssue, /changed|stale|source/i);
    f.env.workflowSession.invalidate('Semantic edit'); f.refresh(); await f.actions.apply(handle); f.actions.reject(handle);
    assert.equal(f.counters.apply, 0); assert.equal(f.counters.reject, 0); f.runtime.dispose();
});

test('Review host result navigates from an unrelated child to the nested candidate address', async () => {
    const f = nestedAdapter(); await f.run();
    assert.equal(f.graphViews.openInstance(['inspection']).ok, true); f.refresh();
    const reveals = [];
    Object.assign(f.env, {
        navigateGraphView(action, ...args) { const opened = f.graphViews[action](...args); assert.equal(opened.ok, true); f.refresh(); },
        showSettings(selection) { f.env.selectedKind = selection.kind; f.env.selected = f.graphViews.readEditor().prepared.savedGraph.nodes[selection.id]; },
        outputPreviewActions: f.actions,
    });
    f.env.workbench.revealPreview = () => reveals.push(true);
    controllerFunction('reviewHostResult', f.env)();
    assert.deepEqual(f.graphViews.readEditor().view.identity.instancePath, ['body']);
    assert.deepEqual(f.env.selectedPreview, f.terminal);
    assert.deepEqual(f.env.panels.outputPreview.review?.selector, f.env.workflowState.reviewHandles[0]);
    assert.equal(reveals.length, 1); assert.equal(f.counters.requests, 0); assert.equal(f.counters.apply, 0);
    f.runtime.dispose();
});

// Real zero-call host results flow through the actual controller, cached projector and compiled leaf.
test('current preview preserves final host source freshness checks after review selection', async () => {
    const f = adapter(); await f.run(); const selector = structuredClone(f.env.panels.outputPreview.review?.selector); assert.ok(selector);
    f.message.mes += ' externally edited'; const before = structuredClone(f.message), checks = f.counters.checks;
    await f.actions.apply(selector);
    assert.equal(f.counters.checks, checks + 1); assert.equal(f.counters.apply, 0); assert.equal(f.counters.saves, 0); assert.deepEqual(f.message, before); assert.match(f.env.workflowState.applyIssue, /source|changed|stale/i);
});

test('current pinned root terminal keeps its actual handle across node selection and never applies from child or library views', async () => {
    const f = adapter(3); await f.run(); assert.equal(f.env.workflowState.result.ok, true, JSON.stringify(f.env.workflowState.result.error));
    const handle = f.env.workflowState.reviewHandles.find(handle => handle.terminal.address.nodeId === 'review-publish'); assert.ok(handle);
    f.env.pinnedPreview = structuredClone(f.terminal); f.env.selectedPreview = null; f.env.selected = f.root.nodes['generate-reply']; f.refresh();
    assert.deepEqual(f.env.workflowProjection.result.selectedReviewHandle, handle, 'review must use the effective pinned terminal rather than the newly selected node output');
    const leaf = await previewFixture(f.env.panels.outputPreview, f.actions);
    try {
        assert.equal(leaf.host.querySelector('[data-preview-apply]').disabled, false); assert.deepEqual(f.env.panels.outputPreview.review.selector, handle);
        const checks = f.counters.checks, cancelled = f.counters.cancel;
        assert.equal(f.graphViews.openInstance(['inspection']).ok, true); f.refresh(); leaf.update(f.env.panels.outputPreview); assert.equal(f.env.panels.outputPreview.review, null); await f.actions.apply(structuredClone(handle)); f.actions.reject(structuredClone(handle)); assert.equal(f.counters.checks, checks); assert.equal(f.counters.cancel, cancelled);
        assert.equal(f.graphViews.openLibrary(f.root.nodes.inspection.definition).ok, true); f.refresh(); assert.equal(f.env.panels.outputPreview.review, null, 'library DTO must not expose a root review selector'); await f.actions.apply(handle); assert.equal(f.counters.checks, checks);
        f.graphViews.focusView(f.graphViews.project().graphViews.tabs[0].key); f.refresh(); leaf.update(f.env.panels.outputPreview); assert.equal(leaf.host.querySelector('[data-preview-apply]').disabled, false); assert.deepEqual(f.env.panels.outputPreview.review.selector, handle);
        const copied = structuredClone(handle); copied.terminal.address.nodeId = 'generate-reply'; await f.actions.apply(copied); assert.equal(f.counters.checks, checks); assert.deepEqual(f.env.workflowState.reviewHandles[0], handle);
        f.env.workflowSession.invalidate('Superseded run'); f.refresh(); await f.actions.apply(handle); assert.equal(f.counters.apply, 0); assert.equal(f.counters.requests, 0);
    } finally { await leaf.close(); }
});
async function workbenchFixture(actions) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-review-workbench-')), host = document.createElement('div'); document.body.append(host);
    const compiled = new Map();
    async function module(sourceURL) {
        if (compiled.has(sourceURL.href)) return compiled.get(sourceURL.href);
        const source = await readFile(sourceURL, 'utf8'), filename = sourceURL.pathname.split('/').at(-1), target = join(directory, filename.replace('.svelte', '.mjs'));
        compiled.set(sourceURL.href, pathToFileURL(target).href);
        let code = filename.endsWith('.svelte') ? compile(source, { filename, generate: 'client', css: 'injected' }).js.code : source;
        for (const match of [...code.matchAll(/\bfrom\s+(['"])(\.{1,2}\/[^'"]+)\1/g)]) {
            const url = new URL(match[2], sourceURL), destination = url.pathname.endsWith('.svelte') ? pathToFileURL((await compileComponent(url.pathname.split('/').at(-1).replace('.svelte',''), directory, undefined, url)).path).href : url.href;
            code = code.replace(match[0], 'from ' + JSON.stringify(destination));
        }
        code = code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
        await writeFile(target, code); return pathToFileURL(target).href;
    }
    let bridge;
    async function close() { if (bridge) await bridge.destroy(); host.remove(); const rel = relative(resolve(tmpdir()), resolve(directory)); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(directory, { recursive: true, force: true }); }
    try { const entry = await import(await module(new URL('../ui/entry.js', import.meta.url))); bridge = entry.mountWorkbench(host, actions); return { bridge, host, close }; }
    catch (error) { await close(); throw error; }
}

test('the actual workspace opens examples without host work', async () => {
    const f = adapter(); await f.run(); const mounted = await workbenchFixture({ command() {}, resizeStart() {} });
    try {
        mounted.bridge.update(f.env.panels); const before = structuredClone(f.root), counters = { ...f.counters };
        [...mounted.host.querySelectorAll('button')].find(button => button.textContent === 'File').click(); await (await import(clientURL)).tick(); flushSync();
        mounted.host.querySelector('[role="menuitem"][aria-label="Open examples…"]').click(); await (await import(clientURL)).tick(); flushSync();
        const dialog = mounted.host.querySelector('[role="dialog"][aria-label="Examples"]'); assert.ok(dialog, 'Examples opens the actual current picker');
        assert.equal(mounted.host.querySelectorAll('.pc-output-preview').length, 1); assert.deepEqual(f.root, before); assert.deepEqual(f.counters, counters); assert.equal(f.counters.requests, 0);
    } finally { await mounted.close(); }
});

test('actual automatic zero-call unified Send provenance remains visible without payload diagnostics', async () => {
    const f = adapter(); await f.run();
    const record = f.runtime.lastAutomaticResult(); assert.equal(record.origin.graph, f.root); assert.equal(record.origin.kind, 'send');
    const view = f.env.panels.outputPreview; assert.match(view.statusDetail, /Automatic Send.*unified workflow/); assert.ok(view.sections.length);
    assert.ok(view.sections.every(section => !['findings', 'changes', 'reports', 'calls'].includes(section.id)));
    const leaf = await previewFixture(view, f.actions);
    try { assert.match(leaf.host.textContent, /Automatic Send.*unified workflow/); assert.equal(leaf.host.querySelector('[data-preview-apply]').disabled, false); assert.equal(f.counters.requests, 0); }
    finally { await leaf.close(); }
});

test('Apply routes the authenticated current unified Review / Publish handle to native publication', async () => {
    const f = adapter(); await f.run();
    const selector = structuredClone(f.env.panels.outputPreview.review.selector);
    await f.actions.apply(selector);
    assert.equal(f.counters.apply, 1); assert.equal(f.counters.saves, 1);
    assert.deepEqual(f.message.swipes, ['We delve.\n雪', 'We delve.\n雪']);
    assert.equal(f.env.workflowState.reviewHandles.length, 0);
});


test('Reject releases the current unified candidate and preserves the native reply', async () => {
    const f = adapter(); await f.run();
    const selector = structuredClone(f.env.panels.outputPreview.review.selector), before = structuredClone(f.message);
    f.actions.reject(selector);
    assert.equal(f.counters.reject, 1); assert.equal(f.runtime.candidateStatus(selector).ok, false);
    assert.deepEqual(f.message, before); assert.equal(f.counters.saves, 0); assert.equal(f.env.workflowState.reviewHandles.length, 0);
});

test('forged selector identities and noncurrent results cannot invoke Apply or Reject', async () => {
    const f = adapter(); await f.run(); const handle = f.env.panels.outputPreview.review.selector;
    const forged = [ { ...handle, handleId: 'forged' }, { ...handle, runId: 'forged' }, { ...handle, terminal: { ...handle.terminal, address: { ...handle.terminal.address, nodeId: 'generate-reply' } } } ];
    for (const selector of forged) { await f.actions.apply(selector); f.actions.reject(selector); }
    f.env.workflowState.result = { ...f.env.workflowState.result };
    await f.actions.apply(handle); f.actions.reject(handle);
    assert.equal(f.counters.apply, 0); assert.equal(f.counters.reject, 0); assert.equal(f.counters.saves, 0);
});
