import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';
import { OPERATIONS, operationDefaults, describeOperation } from '../src/workflow/catalog.js';
import { projectNodeControls } from '../src/ui/node-control-projection.js';
import { readControlRows, writeControlRows } from '../src/ui/control-input-adapters.js';
import { parseControlInput } from '../src/ui/control-input-contracts.js';
import { deferredNodeDescription, nodeNeedsConfiguration, createConfiguredNodeSession, configuredCreationStage, iterationHelperChoices } from '../src/ui/configured-node-creation.js';
import { prepareNativeSearchCatalog, resolveNativeSearchChoice } from '../src/ui/native-search-catalog.js';
import { prepareNativeConnectionEdit } from '../src/workflow/connection-edits.js';
import { prepareNativeNodeEdit } from '../src/workflow/definition-library.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import { prepareNodeProfileOptions, readNodeProfileMetadata } from '../src/ui/node-profile-preparation.js';
import { activeModelMetadata } from '../src/workflow/model-profiles.js';
import { workflowDataPresetFor } from '../src/workflow/workflow-data-defaults.js';
import { safe } from '../src/state.js';
import * as H from '../src/history.js?v=0.27.2';

const operations = ['decision', 'advance-time', 'time-trigger'];
const scope = { schema: 3, runtime: 2, mode: 'native-unified', workflowId: 'n6-integration', viewPath: [], inDefinition: false };
const emptyGraph = () => ({ id: 'n6-integration', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, nodes: {}, wires: {}, definitions: {}, portals: {} });
const question = { type: 'noul', instructions: 'Before, exact words.', criteria: { true: { evidence: [null, false, 0, ''] }, false: [] } };
const schedule = { scheduleId: 'curse-1', kind: 'interval', anchorMinute: 0, intervalMinutes: 480, revision: 7, clockId: 'chosen-clock', calendarId: 'chosen-calendar', scope: { visibility: 'private', actorId: 'Rowan', values: [null, false, 0, ''] } };
function settings(operation) {
    const controls = Object.fromEntries(Object.entries(operationDefaults(operation)).filter(([key]) => OPERATIONS[operation].controls.includes(key)));
    if (operation === 'decision') controls.questions = { 'question-1': structuredClone(question) };
    if (operation === 'advance-time') controls.schedules = [structuredClone(schedule)];
    if (operation === 'time-trigger') Object.assign(controls, { scheduleId: 'trigger-1', metadata: { scope: { visibility: 'private', actorId: 'Rowan' }, own: { numeric: 0, 'a.b': false, 'red, blue': null } } });
    return controls;
}
const controllerSource = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function actualFunction(name, environment) {
    const start = controllerSource.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Missing actual controller function ' + name);
    const lineEnd = controllerSource.indexOf('\n', start);
    const firstLine = controllerSource.slice(start, lineEnd).trimEnd();
    const end = firstLine.endsWith('}') ? lineEnd : controllerSource.indexOf('\n}', start) + 2;
    assert.ok(end > start);
    return Function('environment', 'with(environment){' + controllerSource.slice(start, end) + ';return ' + name + ';}')(environment);
}
function controller(root = emptyGraph()) {
    H.track(root);
    const readContext = () => ({ sessionId: 'n6-authoring', viewPath: [], readOnly: false });
    const capture = captureGraphEditContext(root, readContext);
    assert.equal(capture.ok, true, JSON.stringify(capture));
    const token = Object.freeze({});
    let current = true, commits = 0, preparations = 0;
    const context = { chatId: 'n6-story', chatMetadata: {}, chat: [] };
    const editorCaptures = new WeakMap([[token, { root, path: [], context: capture.data }]]);
    const environment = {
        current: root, selected: null,
        graphViews: { readEditor: () => ({ view: { identity: { kind: 'root' } }, prepared: { savedGraph: root } }) },
        editorDraw: { nativeCards: {} }, editorCaptures,
        editorCurrent: value => current && value === token,
        workflowRuntime: { getStoryDocumentCatalog: () => undefined },
        nodeDocumentCaptures: new Map(), nodeCreationScopes: new WeakMap(), pendingConfiguredNode: null,
        ctx: () => context, safe, prepareNodeProfileOptions, readNodeProfileMetadata, activeModelMetadata, workflowDataPresetFor,
        createConfiguredNodeSession, configuredCreationStage, nodeNeedsConfiguration, iterationHelperChoices,
        workbench: { update(value) { if ('configureNode' in value) environment.view = value.configureNode; } },
        canvas: { toGraph: (x, y) => ({ x, y }) }, toast() {}, graphDocumentHooks: {},
        prepareNativeCreation(value, command) { preparations++; return prepareNativeConnectionEdit(root, command); },
        prepareShelfNodeCreation(value, command, at) { preparations++; return prepareNativeConnectionEdit(root, { ...command, graphPoint: at ?? { x: 0, y: 0 } }); },
        commitGraphEdit(graph, prepared) {
            const result = commitPreparedGraph(graph, prepared);
            if (result.ok && result.data.changed) commits++;
            return result;
        },
    };
    environment.profiles = actualFunction('profiles', environment);
    environment.commitCaptured = actualFunction('commitCaptured', environment);
    const sessionStart = controllerSource.indexOf('const configuredNodeSession =');
    const sessionEnd = controllerSource.indexOf('\n});', sessionStart) + 4;
    assert.ok(sessionStart >= 0 && sessionEnd > sessionStart);
    environment.configuredNodeSession = Function('environment', 'with(environment){' + controllerSource.slice(sessionStart, sessionEnd) + ';return configuredNodeSession;}')(environment);
    for (const name of ['requestNodeCreation', 'cancelConfiguredNode', 'commitNodeCreation']) environment[name] = actualFunction(name, environment);
    environment.detailCapture = selection => current && root.nodes[selection.address.nodeId] ? { ok: true, data: token } : { ok: false, error: { code: 'STALE_CONTEXT', message: 'The detail capture expired.' } };
    environment.scopeCommand = () => ({ viewPath: [] });
    environment.prepareNode = actualFunction('prepareNode', { prepareNativeNodeEdit });
    const editStart = controllerSource.indexOf('    editControl(selection,key,value)');
    const editEnd = controllerSource.indexOf('\n', editStart);
    assert.ok(editStart >= 0 && editEnd > editStart);
    const editControl = Function('environment', 'with(environment){return ({' + controllerSource.slice(editStart, editEnd).trim().replace(/,$/, '') + '}).editControl;}')(environment);
    return {
        root, environment, token, editControl, commits: () => commits, preparations: () => preparations,
        expire() { current = false; },
        refresh() { const next = captureGraphEditContext(root, readContext); assert.equal(next.ok, true, JSON.stringify(next)); editorCaptures.set(token, { root, path: [], context: next.data }); },
    };
}
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLMediaElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const { mount, unmount, flushSync, tick } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
async function panel(name, view, actions) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-n6-integration-'));
    const target = document.createElement('div'); document.body.append(target);
    let mounted;
    async function close() {
        if (mounted) await unmount(mounted);
        target.remove();
        const local = relative(resolve(tmpdir()), resolve(directory));
        assert.ok(local && !local.startsWith('..') && !isAbsolute(local));
        await rm(directory, { recursive: true, force: true });
    }
    try {
        const leaf = await compiled(name, directory);
        const harness = await compiled('N6ParentHarness', directory, `<script>import Parent from ${JSON.stringify(pathToFileURL(leaf.path).href)};let {initial,actions}=$props();let view=$state.raw(initial);export function update(next){view=next;}</script><Parent {view} {actions}/>`);
        mounted = mount(harness.component, { target, props: { initial: view, actions } });
        flushSync(); await tick(); flushSync();
        return { host: target, mounted, close };
    } catch (error) { await close(); throw error; }
}
function input(host, label, value, event = 'input') {
    const element = host.querySelector('[aria-label="' + label + '"]');
    assert.ok(element, 'Missing ' + label);
    if (['checkbox', 'radio'].includes(element.type)) element.checked = value; else element.value = value;
    element.dispatchEvent(new dom.window.Event(event, { bubbles: true })); flushSync();
    return element;
}
async function click(host, label) {
    const element = [...host.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label || button.textContent.trim() === label);
    assert.ok(element, 'Missing ' + label); element.click(); flushSync(); await tick(); flushSync();
}
function detail(root, id = 'node', revision = 'r1') {
    const node = root.nodes[id], phase = node.phase ?? 'pre';
    return { selectionKey: id, revision, address: { workflowId: root.id, instancePath: [], nodeId: id }, title: node.operation, canonicalTitle: node.operation, iconPath: '', family: 'Derive', phase, operation: node.operation, alias: '', compact: false, enabled: true, readOnly: false, canPresent: true, controls: projectNodeControls(node.operation, node, { phase }), model: null, ports: [] };
}
function editing(operation) {
    const root = emptyGraph(); root.nodes.node = { id: 'node', type: 'workflow', operation, ...settings(operation), phase: 'post' };
    return controller(root);
}
const keyFor = operation => operation === 'decision' ? 'questions' : operation === 'advance-time' ? 'schedules' : 'metadata';
function labelFor(operation) { return projectNodeControls(operation, settings(operation), { phase: 'post' }).find(control => control.key === keyFor(operation)).label; }
async function createPanel(f, operation, controls = settings(operation)) {
    const pending = f.environment.requestNodeCreation(f.token, { kind: 'create', operation, controls, graphPoint: { x: 20, y: 30 } });
    assert.ok(f.environment.view, operation + ' must use actual configured creation');
    let applied;
    const form = await panel('ConfigureNode', f.environment.view, {
        apply: (key, text, phase) => applied=f.environment.configuredNodeSession.apply(key, text, phase),
        cancel: key => f.environment.cancelConfiguredNode(key),
    });
    return { form, pending, get applied(){return applied;} };
}
async function inspectorRemount(form, view) {
    form.mounted.update(null); flushSync(); await tick();
    form.mounted.update({ ...view, revision: 'r2' }); flushSync(); await tick(); flushSync();
}
function oneUndo(f, before) {
    assert.ok(H.undo(f.root), 'One authoring Undo step must exist');
    assert.deepEqual(f.root, before);
    assert.equal(H.undo(f.root), null, 'The interaction must not create a second Undo step');
}

test('question and schedule discoveries route valid defaults through real configured creation', () => {
    const catalog = prepareNativeSearchCatalog(scope); assert.equal(catalog.ok, true, JSON.stringify(catalog));
    for (const operation of operations) {
        assert.equal(nodeNeedsConfiguration(operation), true, operation);
        const choice = catalog.data.choices.find(choice => choice.id === 'operation:' + operation);
        assert.ok(choice, operation); assert.equal(choice.requiresConfiguration, true, operation);
        assert.equal(resolveNativeSearchChoice(catalog.data, choice.id).requiresConfiguration, true);
    }
});

test('actual configured question, schedule and metadata forms commit once and Undo the entire creation', async () => {
    for (const operation of operations) {
        const f = controller(), before = structuredClone(f.root), { form, pending } = await createPanel(f, operation);
        try {
            assert.equal(f.preparations(), 0); assert.deepEqual(f.root, before);
            if (operation === 'decision') input(form.host, 'Question 1 instructions', 'After, exact words.');
            if (operation === 'advance-time') { input(form.host, 'Schedule 1 interval quantity', '8'); input(form.host, 'Schedule 1 interval unit', 'hours', 'change'); }
            if (operation === 'time-trigger') { const label = labelFor(operation); await click(form.host, 'Edit ' + label + ' key scope'); await click(form.host, 'Edit ' + label + ' key actorId'); input(form.host, label + ' string', 'Mira'); }
            await click(form.host, 'Create node'); assert.equal(f.preparations(), 1, operation + ': ' + form.host.textContent);
            const prepared = await pending; assert.equal(prepared.ok, true, JSON.stringify(prepared)); assert.deepEqual(f.root, before);
            const id = prepared.data.addedNodeIds[0], candidate = prepared.data.candidate.nodes[id];
            assert.equal(describeOperation(scope, candidate).ok, true); assert.equal(candidate.x, 20); assert.equal(candidate.y, 30);
            if (operation === 'decision') assert.deepEqual(candidate.questions, { 'question-1': { ...question, instructions: 'After, exact words.' } });
            if (operation === 'advance-time') assert.deepEqual(candidate.schedules, [schedule]);
            if (operation === 'time-trigger') { assert.deepEqual(candidate.metadata.scope, { visibility: 'private', actorId: 'Mira' }); assert.deepEqual(candidate.metadata.own, { numeric: 0, 'a.b': false, 'red, blue': null }); assert.equal(candidate.scheduleId, 'trigger-1'); }
            assert.equal(f.environment.commitNodeCreation(f.token, prepared).ok, true); assert.equal(f.commits(), 1); oneUndo(f, before);
        } finally { f.environment.cancelConfiguredNode(); await form.close(); }
    }
});

test('actual detail Save uses native preparation and preserves stable IDs, optional absence and private typed values in one Undo', async () => {
    for (const operation of operations) {
        const f = editing(operation), before = structuredClone(f.root), view = detail(f.root), form = await panel('NodeDetails', view, { editControl: f.editControl });
        try {
            if (operation === 'decision') input(form.host, 'Question 1 instructions', 'Saved exact words.');
            if (operation === 'advance-time') { input(form.host, 'Schedule 1 interval quantity', '9'); input(form.host, 'Schedule 1 interval unit', 'hours', 'change'); }
            if (operation === 'time-trigger') { const label = labelFor(operation); await click(form.host, 'Edit ' + label + ' key scope'); await click(form.host, 'Edit ' + label + ' key actorId'); input(form.host, label + ' string', 'Mira'); }
            await click(form.host, 'Save ' + labelFor(operation)); assert.equal(f.commits(), 1, form.host.textContent);
            const node = f.root.nodes.node;
            if (operation === 'decision') assert.deepEqual(node.questions, { 'question-1': { ...question, instructions: 'Saved exact words.' } });
            if (operation === 'advance-time') { assert.deepEqual(node.schedules, [{ ...schedule, intervalMinutes: 540 }]); assert.equal(Object.hasOwn(node.schedules[0], 'order'), false); }
            if (operation === 'time-trigger') { assert.deepEqual(node.metadata.scope, { visibility: 'private', actorId: 'Mira' }); assert.deepEqual(node.metadata.own, before.nodes.node.metadata.own); }
            oneUndo(f, before); assert.ok(H.redo(f.root)); assert.equal(f.commits(), 1);
        } finally { await form.close(); }
    }
});

test('unfinished question cards block actual Create and Save after parent switches, then repair the same stable question', async () => {
    for (const creation of [true, false]) {
        const f = creation ? controller() : editing('decision'), before = structuredClone(f.root), view = creation ? null : detail(f.root);
        const opened = creation ? await createPanel(f, 'decision') : { form: await panel('NodeDetails', view, { editControl: f.editControl }) }, form = opened.form;
        try {
            input(form.host, 'Question 1 instructions', ''); await click(form.host, creation ? 'Create node' : 'Save Questions'); assert.equal(f.commits(), 0); assert.deepEqual(f.root, before);
            if (creation) { await click(form.host, 'Configuration format'); await click(form.host, 'Create node'); assert.equal(f.preparations(), 0); await click(form.host, 'Configuration format'); }
            else await inspectorRemount(form, view);
            assert.equal(form.host.querySelector('[aria-label="Question 1 instructions"]').value, '');
            input(form.host, 'Question 1 instructions', 'Repaired, exact.'); await click(form.host, creation ? 'Create node' : 'Save Questions');
            if (creation) { assert.equal(opened.applied?.ok,true,JSON.stringify(opened.applied)); const prepared = await opened.pending; assert.equal(prepared.ok, true, JSON.stringify(prepared)); assert.equal(f.environment.commitNodeCreation(f.token, prepared).ok, true); }
            assert.equal(f.commits(), 1); const node = Object.values(f.root.nodes)[0]; assert.deepEqual(node.questions['question-1'], { ...question, instructions: 'Repaired, exact.' }); oneUndo(f, before);
        } finally { f.environment.cancelConfiguredNode(); await form.close(); }
    }
});

test('unfinished schedule minute drafts block actual parent submissions across remounts and preserve private metadata on repair', async () => {
    for (const creation of [true, false]) {
        const authored = { ...schedule, kind: 'delay', dueMinute: 10 }, f = creation ? controller() : editing('advance-time');
        if (!creation) { f.root.nodes.node.schedules = [authored]; H.reset(f.root); f.refresh(); }
        const before = structuredClone(f.root), view = creation ? null : detail(f.root), opened = creation ? await createPanel(f, 'advance-time', { ...settings('advance-time'), schedules: [authored] }) : { form: await panel('NodeDetails', view, { editControl: f.editControl }) }, form = opened.form;
        try {
            input(form.host, 'Schedule 1 due minute', '1e'); await click(form.host, creation ? 'Create node' : 'Save ' + labelFor('advance-time')); assert.equal(f.commits(), 0); assert.deepEqual(f.root, before);
            if (creation) { await click(form.host, 'Configuration format'); await click(form.host, 'Create node'); assert.equal(f.preparations(), 0); await click(form.host, 'Configuration format'); }
            else await inspectorRemount(form, view);
            assert.equal(form.host.querySelector('[aria-label="Schedule 1 due minute"]').value, '1e'); input(form.host, 'Schedule 1 due minute', '20'); await click(form.host, creation ? 'Create node' : 'Save ' + labelFor('advance-time'));
            if (creation) { assert.equal(opened.applied?.ok,true,JSON.stringify(opened.applied)); const prepared = await opened.pending; assert.equal(prepared.ok, true, JSON.stringify(prepared)); assert.equal(f.environment.commitNodeCreation(f.token, prepared).ok, true); }
            assert.equal(f.commits(), 1); assert.deepEqual(Object.values(f.root.nodes)[0].schedules, [{ ...authored, dueMinute: 20 }]); oneUndo(f, before);
        } finally { f.environment.cancelConfiguredNode(); await form.close(); }
    }
});

test('reserved Time Trigger metadata stays rejected by actual Create and Save after a parent switch', async () => {
    for (const creation of [true, false]) {
        const f = creation ? controller() : editing('time-trigger'), before = structuredClone(f.root), view = creation ? null : detail(f.root), opened = creation ? await createPanel(f, 'time-trigger') : { form: await panel('NodeDetails', view, { editControl: f.editControl }) }, form = opened.form, label = labelFor('time-trigger');
        try {
            await click(form.host, 'Edit ' + label + ' as JSON'); input(form.host, label + ' JSON', JSON.stringify({ scope: { visibility: 'private', actorId: 'Rowan' }, scheduleId: 'contradiction' }));
            await click(form.host, creation ? 'Create node' : 'Save ' + label); assert.equal(f.commits(), 0); assert.deepEqual(f.root, before);
            if (creation) { await click(form.host, 'Configuration format'); await click(form.host, 'Create node'); assert.equal(f.preparations(), 0); await click(form.host, 'Configuration format'); }
            else await inspectorRemount(form, view);
            const restored = form.host.querySelector('[aria-label="' + label + ' JSON"]'); assert.ok(restored); assert.equal(JSON.parse(restored.value).scheduleId, 'contradiction');
            input(form.host, label + ' JSON', JSON.stringify({ scope: { visibility: 'private', actorId: 'Mira' }, optional: null })); await click(form.host, creation ? 'Create node' : 'Save ' + label);
            if (creation) { assert.equal(opened.applied?.ok,true,JSON.stringify(opened.applied)); const prepared = await opened.pending; assert.equal(prepared.ok, true, JSON.stringify(prepared)); assert.equal(f.environment.commitNodeCreation(f.token, prepared).ok, true); }
            assert.equal(f.commits(), 1); const node = Object.values(f.root.nodes)[0]; assert.equal(node.scheduleId, 'trigger-1'); assert.deepEqual(node.metadata, { scope: { visibility: 'private', actorId: 'Mira' }, optional: null }); oneUndo(f, before);
        } finally { f.environment.cancelConfiguredNode(); await form.close(); }
    }
});

test('days cannot use an inferred calendar merely because the schedule names one', async () => {
    for (const creation of [true, false]) {
        const f = creation ? controller() : editing('advance-time'), before = structuredClone(f.root), opened = creation ? await createPanel(f, 'advance-time') : { form: await panel('NodeDetails', detail(f.root), { editControl: f.editControl }) }, form = opened.form;
        try {
            input(form.host, 'Schedule 1 interval quantity', '1'); input(form.host, 'Schedule 1 interval unit', 'days', 'change'); await click(form.host, creation ? 'Create node' : 'Save ' + labelFor('advance-time')); assert.equal(f.commits(), 0); assert.deepEqual(f.root, before); assert.match(form.host.textContent, /day length|calendar/i);
            input(form.host, 'Schedule 1 interval quantity', '9'); input(form.host, 'Schedule 1 interval unit', 'hours', 'change'); await click(form.host, creation ? 'Create node' : 'Save ' + labelFor('advance-time'));
            if (creation) { assert.equal(opened.applied?.ok,true,JSON.stringify(opened.applied)); const prepared = await opened.pending; assert.equal(prepared.ok, true, JSON.stringify(prepared)); assert.equal(f.environment.commitNodeCreation(f.token, prepared).ok, true); }
            assert.equal(f.commits(), 1); assert.equal(Object.values(f.root.nodes)[0].schedules[0].intervalMinutes, 540); oneUndo(f, before);
        } finally { f.environment.cancelConfiguredNode(); await form.close(); }
    }
});

test('optional question criteria removal survives real Save and preserves absence through the inspector remount', async () => {
    const f = editing('decision'), before = structuredClone(f.root), form = await panel('NodeDetails', detail(f.root), { editControl: f.editControl });
    try {
        input(form.host, 'Question 1 descriptions enabled', false, 'change'); await click(form.host, 'Save Questions'); assert.equal(f.commits(), 1); assert.equal(Object.hasOwn(f.root.nodes.node.questions['question-1'], 'criteria'), false);
        f.refresh(); await inspectorRemount(form, detail(f.root)); assert.equal(form.host.querySelector('[aria-label="Question 1 descriptions enabled"]').checked, false); oneUndo(f, before);
    } finally { await form.close(); }
});

test('actual configured N6 Cancel and stale or phase-rejected Apply leave graph and history unchanged', async () => {
    for (const operation of operations) {
        const f = controller(), before = structuredClone(f.root), pending = f.environment.requestNodeCreation(f.token, { kind: 'create', operation, controls: settings(operation) }); assert.ok(f.environment.view);
        const key = f.environment.view.key; f.expire(); assert.equal(f.environment.configuredNodeSession.apply(key, f.environment.view.controls, 'pre').error.code, 'STALE_CONTEXT'); f.environment.cancelConfiguredNode(key); assert.equal((await pending).error.code, 'NODE_CONFIGURATION_CANCELLED'); assert.equal(f.preparations(), 0); assert.equal(f.commits(), 0); assert.deepEqual(f.root, before); assert.equal(H.undo(f.root), null);
        const locked = controller(); locked.environment.graphViews = { readEditor: () => ({ view: { identity: { kind: 'instance' } }, prepared: { savedGraph: { ...locked.root, mode: 'native-post' } } }) };
        const held = locked.environment.requestNodeCreation(locked.token, { kind: 'create', operation, controls: settings(operation) }); assert.ok(locked.environment.view); assert.equal(locked.environment.view.phase, 'post'); assert.equal(locked.environment.view.phaseLocked, true);
        assert.equal(locked.environment.configuredNodeSession.apply(locked.environment.view.key, locked.environment.view.controls, 'pre').error.code, 'INVALID_PHASE'); assert.equal(locked.preparations(), 0); locked.environment.cancelConfiguredNode(); assert.equal((await held).error.code, 'NODE_CONFIGURATION_CANCELLED'); assert.equal(locked.commits(), 0); assert.equal(H.undo(locked.root), null);
    }
});

test('shared N6 input contracts reject invalid canonical questions schedules and reserved metadata before preparation', () => {
    for (const [operation, value] of [['decision', {}], ['advance-time', [{ ...schedule, intervalMinutes: 0 }]], ['time-trigger', { dueMinute: 0 }]]) {
        const spec = projectNodeControls(operation, settings(operation), { phase: 'post' }).find(control => control.key === keyFor(operation)).inputSpec;
        assert.equal(parseControlInput(spec, { format: 'rows', value }).ok, false, operation);
    }
});

test('actual Time Trigger configured Apply commits retained private metadata through the transaction and one Undo', async () => {
    const f = controller(), before = structuredClone(f.root), { form, pending } = await createPanel(f, 'time-trigger');
    try {
        await click(form.host, 'Create node'); assert.equal(f.preparations(), 1, form.host.textContent);
        const prepared = await pending; assert.equal(prepared.ok, true, JSON.stringify(prepared)); assert.deepEqual(f.root, before);
        assert.equal(f.environment.commitNodeCreation(f.token, prepared).ok, true); assert.equal(f.commits(), 1);
        const node = f.root.nodes[prepared.data.addedNodeIds[0]];
        assert.equal(node.scheduleId, 'trigger-1'); assert.deepEqual(node.metadata, settings('time-trigger').metadata); oneUndo(f, before);
    } finally { f.environment.cancelConfiguredNode(); await form.close(); }
});

test('nested question criteria drafts remain repairable at their exact path through real inspector remounts', async () => {
    const f = editing('decision'), before = structuredClone(f.root), view = detail(f.root), form = await panel('NodeDetails', view, { editControl: f.editControl });
    try {
        await click(form.host, 'Edit Question 1 answer descriptions key true'); await click(form.host, 'Edit Question 1 answer descriptions key evidence'); await click(form.host, 'Edit Question 1 answer descriptions index 2');
        input(form.host, 'Question 1 answer descriptions number', '1e'); await click(form.host, 'Save Questions'); assert.equal(f.commits(), 0); await inspectorRemount(form, view);
        assert.equal(form.host.querySelector('[aria-label="Question 1 criteria unfinished JSON"]').value, '1e'); input(form.host, 'Question 1 criteria unfinished JSON', '2'); await click(form.host, 'Save Questions');
        assert.equal(f.commits(), 1); assert.deepEqual(f.root.nodes.node.questions['question-1'], { ...question, criteria: { true: { evidence: [null, false, 2, ''] }, false: [] } }); oneUndo(f, before);
    } finally { await form.close(); }
});


async function changeFriendly(form, operation, text) {
    if(operation==='decision')input(form.host,'Question 1 instructions',text);
    else if(operation==='advance-time')input(form.host,'Schedule 1 interval quantity',text);
    else {const label=labelFor(operation);await click(form.host,'Edit '+label+' key own');await click(form.host,'Edit '+label+' key numeric');input(form.host,label+' number',text);}
}
function changedValue(operation, value) {
    if(operation==='decision')return {'question-1':{...question,instructions:value}};
    if(operation==='advance-time')return [{...schedule,intervalMinutes:value}];
    return {...settings(operation).metadata,own:{...settings(operation).metadata.own,numeric:value}};
}
test('pristine N6 controls follow authoritative revisions and real Undo without stale Save',async()=>{
    for(const operation of operations){
        const f=editing(operation),before=structuredClone(f.root),key=keyFor(operation),submitted=[],form=await panel('NodeDetails',detail(f.root),{editControl(selection,key,value){submitted.push(value);return f.editControl(selection,key,value);}});
        try{
            const next=changedValue(operation,operation==='decision'?'External words.':720);
            assert.equal(f.editControl(detail(f.root),key,next).ok,true);f.refresh();form.mounted.update(detail(f.root,'node','r2'));flushSync();await tick();flushSync();
            if(operation==='decision')assert.equal(form.host.querySelector('[aria-label="Question 1 instructions"]').value,'External words.');
            if(operation==='advance-time')assert.equal(form.host.querySelector('[aria-label="Schedule 1 interval quantity"]').value,'720');
            await click(form.host,'Save '+labelFor(operation));assert.deepEqual(submitted.at(-1),next);assert.equal(f.commits(),1);
            assert.ok(H.undo(f.root));assert.deepEqual(f.root,before);f.refresh();form.mounted.update(detail(f.root,'node','r3'));flushSync();await tick();flushSync();
            await click(form.host,'Save '+labelFor(operation));assert.deepEqual(submitted.at(-1),before.nodes.node[key]);assert.equal(H.undo(f.root),null);
        }finally{await form.close();}
    }
});
test('pending N6 Saves disable real editors and synthetic changes until acknowledgement',async()=>{
    for(const operation of operations){
        const f=editing(operation),key=keyFor(operation);let release,submitted,calls=0;
        const form=await panel('NodeDetails',detail(f.root),{editControl(selection,key,value){calls++;submitted=value;return new Promise(resolve=>release=()=>resolve(f.editControl(selection,key,value)));}});
        try{
            await changeFriendly(form,operation,operation==='decision'?'Submitted words.':'720');await click(form.host,'Save '+labelFor(operation));assert.equal(calls,1);
            const labels=operation==='decision'?['Question 1 instructions','Question 1 type']:operation==='advance-time'?['Schedule 1 interval quantity','Schedule 1 interval unit']:[labelFor(operation)+' number'];
            for(const label of labels)assert.equal(form.host.querySelector('[aria-label="'+label+'"]').matches(':disabled'),true,label);
            input(form.host,labels[0],operation==='decision'?'': '1e');release();flushSync();await tick();flushSync();assert.equal(f.commits(),1);f.refresh();await inspectorRemount(form,detail(f.root));
            assert.deepEqual(f.root.nodes.node[key],submitted);await click(form.host,'Save '+labelFor(operation));assert.equal(calls,2);release();flushSync();await tick();
        }finally{if(release)release();await form.close();}
    }
});
test('old N6 Save acknowledgement retains newer invalid-only drafts after revision expiry and remount',async()=>{
    for(const operation of operations){
        const f=editing(operation),key=keyFor(operation);let release,submitted,calls=0;
        const form=await panel('NodeDetails',detail(f.root),{editControl(selection,key,value){calls++;submitted=value;const accepted=f.editControl(selection,key,value);return new Promise(resolve=>release=()=>resolve(accepted));}});
        try{
            await changeFriendly(form,operation,operation==='decision'?'Submitted words.':'720');await click(form.host,'Save '+labelFor(operation));assert.equal(calls,1);f.refresh();form.mounted.update(detail(f.root,'node','r2'));flushSync();await tick();flushSync();
            if(operation==='decision'){await click(form.host,'Edit Question 1 answer descriptions key true');await click(form.host,'Edit Question 1 answer descriptions key evidence');await click(form.host,'Edit Question 1 answer descriptions index 2');input(form.host,'Question 1 answer descriptions number','1e');}
            else if(operation==='advance-time')input(form.host,'Schedule 1 interval quantity','1e');
            else {if(!form.host.querySelector('[aria-label="'+labelFor(operation)+' number"]')){await click(form.host,'Edit '+labelFor(operation)+' key own');await click(form.host,'Edit '+labelFor(operation)+' key numeric');}input(form.host,labelFor(operation)+' number','1e');}
            release();flushSync();await tick();flushSync();await inspectorRemount(form,detail(f.root));
            const label=operation==='decision'?'Question 1 criteria unfinished JSON':operation==='advance-time'?'Schedule 1 interval quantity':labelFor(operation)+' JSON';
            const rejected=form.host.querySelector('[aria-label="'+label+'"]');assert.ok(rejected,label);assert.match(rejected.value,/1e/);await click(form.host,'Save '+labelFor(operation));assert.equal(calls,1);assert.deepEqual(f.root.nodes.node[key],submitted);
            input(form.host,label,operation==='time-trigger'?JSON.stringify(changedValue(operation,2)):'2');await click(form.host,'Save '+labelFor(operation));assert.equal(calls,2);release();flushSync();await tick();
        }finally{if(release)release();await form.close();}
    }
});


test('actual configured Apply admits N6 intrinsic controls before preparing and normalizes schedule revisions',async()=>{
    for(const [operation,key,value] of [['decision','questions',{}],['advance-time','schedules',[{...schedule,intervalMinutes:0}]],['time-trigger','metadata',{dueMinute:0}]]){
        const f=controller(),pending=f.environment.requestNodeCreation(f.token,{kind:'create',operation,controls:settings(operation)}),view=f.environment.view;
        assert.ok(view);const result=f.environment.configuredNodeSession.apply(view.key,JSON.stringify({...settings(operation),[key]:value}),view.phase);assert.equal(result.ok,false,operation);assert.equal(f.preparations(),0);f.environment.cancelConfiguredNode();await pending;assert.equal(H.undo(f.root),null);
    }
    const f=controller(),{revision,...withoutRevision}=schedule,pending=f.environment.requestNodeCreation(f.token,{kind:'create',operation:'advance-time',graphPoint:{x:0,y:0},controls:{...settings('advance-time'),schedules:[withoutRevision]}}),view=f.environment.view;
    const applied=f.environment.configuredNodeSession.apply(view.key,view.controls,view.phase);assert.equal(applied.ok,true,JSON.stringify(applied));const prepared=await pending;assert.equal(prepared.ok,true);assert.deepEqual(prepared.data.candidate.nodes[prepared.data.addedNodeIds[0]].schedules,[{...withoutRevision,revision:1}]);assert.equal(f.commits(),0);
});
test('N6 adapters round-trip complete question criteria, explicit absence and schedule scope while discovery preserves declared pins',()=>{
    for(const operation of ['decision','advance-time']){const value=settings(operation)[keyFor(operation)],spec=projectNodeControls(operation,settings(operation),{phase:'post'}).find(control=>control.key===keyFor(operation)).inputSpec,rows=readControlRows(spec,value);assert.equal(rows.ok,true);assert.deepEqual(writeControlRows(spec,rows.data.rows,value).data.value,value);}
    const spec=projectNodeControls('decision',settings('decision'),{phase:'post'}).find(control=>control.key==='questions').inputSpec;assert.deepEqual(writeControlRows(spec,[{id:'question-1',type:'yes/no',instructions:'Absent criteria'}],settings('decision').questions).data.value,{'question-1':{type:'noul',instructions:'Absent criteria'}});
    for(const [operation,controls] of [['decision',{inputKind:'text'}],['advance-time',{}]])assert.deepEqual(deferredNodeDescription(operation,controls).ports,describeOperation(scope,{type:'workflow',operation,...operationDefaults(operation),...controls,phase:'post'}).data.ports);
});


test('optional answer descriptions retain inactive invalid criteria across accepted absence and remount',async()=>{
    const f=editing('decision'),form=await panel('NodeDetails',detail(f.root),{editControl:f.editControl});
    try{
        await click(form.host,'Edit Question 1 answer descriptions key true');await click(form.host,'Edit Question 1 answer descriptions key evidence');await click(form.host,'Edit Question 1 answer descriptions index 2');input(form.host,'Question 1 answer descriptions number','1e');
        input(form.host,'Question 1 descriptions enabled',false,'change');await click(form.host,'Save Questions');assert.equal(f.commits(),1);assert.equal(Object.hasOwn(f.root.nodes.node.questions['question-1'],'criteria'),false);f.refresh();await inspectorRemount(form,detail(f.root));
        input(form.host,'Question 1 descriptions enabled',true,'change');assert.equal(form.host.querySelector('[aria-label="Question 1 criteria unfinished JSON"]').value,'1e');await click(form.host,'Save Questions');assert.equal(f.commits(),1);input(form.host,'Question 1 criteria unfinished JSON','2');await click(form.host,'Save Questions');assert.equal(f.commits(),2);assert.deepEqual(f.root.nodes.node.questions['question-1'].criteria,{true:{evidence:[null,false,2,'']},false:[]});
    }finally{await form.close();}
});


test('existing duplicate schedule identities open repairable raw JSON without a keyed-row crash',async()=>{
    const f=editing('advance-time');f.root.nodes.node.schedules=[schedule,{...schedule,dueMinute:10}];H.reset(f.root);f.refresh();const form=await panel('NodeDetails',detail(f.root),{editControl:f.editControl});
    try{assert.ok(form.host.querySelector('[aria-label="Schedules JSON"]'));await click(form.host,'Save '+labelFor('advance-time'));assert.equal(f.commits(),0);input(form.host,'Schedules JSON',JSON.stringify([schedule]));await click(form.host,'Save '+labelFor('advance-time'));assert.equal(f.commits(),1);assert.deepEqual(f.root.nodes.node.schedules,[schedule]);}
    finally{await form.close();}
});
