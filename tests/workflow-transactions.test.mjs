import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixtureGraph as starterGraph } from './helpers/workflow-fixtures.mjs';
import { prepareWorkflowInsertion } from '../src/workflow/insertion.js';
import { prepareDisconnection } from '../src/workflow/ports.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import * as H from '../src/history.js?v=0.27.2';

let nextRoot = 0;
test('document changes during async file reading cannot be accepted by preparing afterward', () => {
    const root = starterGraph('native-guidance'); root.id = `capture-before-read-${++nextRoot}`;
    const context = captureGraphEditContext(root, () => ({ sessionId: 'read', viewPath: [], readOnly: false })).data;
    root.nodes['response-plan'].presentation = { alias: 'Intervening alias' };
    const prepared = prepareWorkflowInsertion(root, starterGraph('native-guidance')).data;
    const before = structuredClone(root), history = H.peek(root);
    assert.equal(commitPreparedGraph(root, { ...prepared, context }).error?.code, 'STALE_DOCUMENT');
    assert.deepEqual(root, before); assert.deepEqual(H.peek(root), history);
});

function fixture() {
    const root = starterGraph('native-guidance');
    root.id = `transaction-${++nextRoot}`;
    const current = { sessionId: 'session', viewPath: [], readOnly: false };
    const captured = captureGraphEditContext(root, () => current);
    assert.equal(captured.ok, true);
    const prepared = prepareWorkflowInsertion(root, starterGraph('native-guidance'));
    assert.equal(prepared.ok, true);
    return { root, current, prepared: { ...prepared.data, context: captured.data } };
}

test('accepted insertion preserves view and selection and creates exactly one reversible history step', () => {
    const { root, prepared } = fixture();
    H.track(root);
    const original = structuredClone(root);
    root.view = { x: 800, y: 900, zoom: 2 };
    root.selection = ['scene-context'];
    const view = root.view, selection = root.selection;
    const result = commitPreparedGraph(root, prepared);
    assert.equal(result.ok, true);
    assert.equal(result.data.changed, true);
    assert.equal(result.data.semanticChanged, true);
    assert.equal(Object.keys(root.nodes).length, 14);
    assert.equal(root.view, view);
    assert.equal(root.selection, selection);
    assert.ok(H.undo(root));
    assert.deepEqual(root.nodes, original.nodes);
    assert.deepEqual(root.roles, original.roles);
    assert.equal(root.schema, 3);
    assert.equal(root.view, view);
    assert.equal(H.undo(root), null);
    assert.ok(H.redo(root));
    assert.equal(Object.keys(root.nodes).length, 14);
    assert.equal(root.schema, 3);
    assert.equal(H.redo(root), null);
    prepared.candidate.nodes[prepared.added.nodes[0]].title = 'Changed after commit';
    assert.notEqual(root.nodes[prepared.added.nodes[0]].title, 'Changed after commit');
});

test('camera persistence timestamps do not stale a reviewed edit or rewind current bookkeeping', () => {
    const { root, prepared } = fixture();
    root.view = { x: 500, y: 250, zoom: 0.75 };
    root.selection = ['response-plan'];
    root.updatedAt = 123456;
    const result = commitPreparedGraph(root, prepared);
    assert.equal(result.ok, true);
    assert.deepEqual(root.view, { x: 500, y: 250, zoom: 0.75 });
    assert.deepEqual(root.selection, ['response-plan']);
    assert.equal(root.updatedAt, 123456);
    H.undo(root);
    assert.equal(root.updatedAt, 123456);
    H.redo(root);
    assert.equal(root.updatedAt, 123456);
});

test('history planning errors cannot leave a partially installed graph or flushed prior edit', () => {
    const { root, current } = fixture();
    H.track(root);
    root.nodes['response-plan'].instructions = 'pending body';
    H.noteChange(root);
    const prepared = prepareWorkflowInsertion(root, starterGraph('native-guidance')).data;
    prepared.context = captureGraphEditContext(root, () => current).data;
    prepared.candidate.nodes['response-plan'].x = Object.create(null);
    const before = structuredClone(root), history = H.peek(root);
    assert.equal(commitPreparedGraph(root, prepared).ok, false);
    assert.deepEqual(root, before);
    assert.deepEqual(H.peek(root), history);
    H.flush(root);
});

test('a batch publishes history once after its entire document is installed', () => {
    const { root, current } = fixture();
    H.track(root);
    root.nodes['response-plan'].title = 'pending';
    H.noteChange(root);
    const context = captureGraphEditContext(root, () => current).data;
    const prepared = { ...prepareWorkflowInsertion(root, starterGraph('native-guidance')).data, context };
    const observed = [];
    const unsubscribe = H.onHistoryChange(graph => { if (graph === root) observed.push(Object.keys(graph.nodes).length); });
    const result = commitPreparedGraph(root, prepared);
    unsubscribe();
    assert.equal(result.ok, true);
    assert.deepEqual(observed, [14]);
});

test('context callbacks fail closed, tokens are private and successful commits cannot be replayed', () => {
    const { root, prepared } = fixture();
    let reads = 0;
    for (const invalid of [{}, { sessionId: '', viewPath: [], readOnly: false }, { sessionId: 's', viewPath: 'root', readOnly: false }, { sessionId: 's', viewPath: [], readOnly: 'false' }]) {
        assert.equal(captureGraphEditContext(root, () => invalid).error?.code, 'INVALID_CONTEXT');
    }
    assert.equal(captureGraphEditContext(root, () => ({ sessionId: 's', viewPath: [], readOnly: true })).error?.code, 'READ_ONLY_VIEW');
    assert.equal(captureGraphEditContext(root, () => ({ sessionId: 's', viewPath: ['child'], readOnly: false })).error?.code, 'UNSUPPORTED_VIEW');
    const token = captureGraphEditContext(root, () => { if (reads++) throw new Error('closed controller'); return { sessionId: 's', viewPath: [], readOnly: false }; }).data;
    const before = structuredClone(root), history = H.peek(root);
    assert.equal(commitPreparedGraph(root, { ...prepared, context: token }).error?.code, 'CONTEXT_UNAVAILABLE');
    assert.deepEqual(root, before);
    assert.deepEqual(H.peek(root), history);
    let getterReads = 0;
    const unsafe = { sessionId: 's', viewPath: [], get readOnly() { getterReads++; return false; } };
    assert.equal(captureGraphEditContext(root, () => unsafe).error?.code, 'INVALID_CONTEXT');
    assert.equal(getterReads, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.context)), {});
    assert.equal(commitPreparedGraph(root, { ...prepared, context: structuredClone(prepared.context) }).error?.code, 'STALE_ROOT');
    assert.equal(commitPreparedGraph(root, prepared).ok, true);
    H.undo(root);
    assert.equal(commitPreparedGraph(root, prepared).error?.code, 'STALE_ROOT');
});

test('invalid candidates and partially immutable roots fail atomically before flushing pending history', () => {
    for (const mutate of [
        ({ prepared }) => { prepared.candidate.id = 'another-root'; },
        ({ prepared }) => { prepared.candidate.authority = { apply: true }; },
        ({ prepared }) => { prepared.candidate.wires['wire-1'].to = 'missing'; },
        ({ root }) => { Object.defineProperty(root, 'roles', { writable: false }); },
    ]) {
        const item = fixture();
        H.track(item.root);
        item.root.nodes['response-plan'].title = 'pending alias';
        H.noteChange(item.root);
        const candidate = prepareWorkflowInsertion(item.root, starterGraph('native-guidance')).data;
        item.prepared = { ...candidate, context: captureGraphEditContext(item.root, () => item.current).data };
        mutate(item);
        const before = structuredClone(item.root), history = H.peek(item.root);
        assert.equal(commitPreparedGraph(item.root, item.prepared).ok, false);
        assert.deepEqual(item.root, before);
        assert.deepEqual(H.peek(item.root), history);
        H.flush(item.root);
    }
});

test('no-op leaves pending history untouched; insertion flushes earlier typing as a separate step', () => {
    const { root, current } = fixture();
    H.track(root);
    root.nodes['response-plan'].instructions = 'typed before import';
    H.noteChange(root);
    const context = captureGraphEditContext(root, () => current).data;
    const noop = prepareDisconnection(root, []).data;
    const history = H.peek(root);
    assert.deepEqual(commitPreparedGraph(root, { ...noop, context }).data, { changed: false, semanticChanged: false, rootId: root.id });
    assert.deepEqual(H.peek(root), history);
    const insertion = prepareWorkflowInsertion(root, starterGraph('native-guidance')).data;
    assert.equal(commitPreparedGraph(root, { ...insertion, context }).ok, true);
    assert.ok(H.undo(root));
    assert.equal(Object.keys(root.nodes).length, 7);
    assert.equal(root.nodes['response-plan'].instructions, 'typed before import');
    assert.ok(H.undo(root));
    assert.notEqual(root.nodes['response-plan'].instructions, 'typed before import');
    assert.equal(H.undo(root), null);
});

test('stale semantic/document/root/session/view and read-only contexts reject without touching history', () => {
    const cases = [
        [({ root }) => { root.nodes['response-plan'].instructions = 'new body'; }, 'STALE_DOCUMENT'],
        [({ root }) => { root.nodes['response-plan'].title = 'new alias'; }, 'STALE_DOCUMENT'],
        [({ root }) => { root.nodes['response-plan'].x += 30; }, 'STALE_DOCUMENT'],
        [({ prepared }) => { prepared.baseSignature = 'old'; }, 'STALE_DOCUMENT'],
        [({ current }) => { current.sessionId = 'reopened'; }, 'STALE_CONTEXT'],
        [({ current }) => { current.viewPath = ['child']; }, 'STALE_CONTEXT'],
        [({ current }) => { current.readOnly = true; }, 'READ_ONLY_VIEW'],
        [({ root }) => { root.id += '-replaced'; }, 'STALE_ROOT'],
    ];
    for (const [change, code] of cases) {
        const item = fixture();
        H.track(item.root);
        change(item);
        const before = structuredClone(item.root), history = H.peek(item.root);
        assert.equal(commitPreparedGraph(item.root, item.prepared).error?.code, code);
        assert.deepEqual(item.root, before);
        assert.deepEqual(H.peek(item.root), history);
    }
    const item = fixture(), replacement = structuredClone(item.root);
    assert.equal(commitPreparedGraph(replacement, item.prepared).error?.code, 'STALE_ROOT');
    assert.equal(commitPreparedGraph(item.root, { ...item.prepared, context: {} }).error?.code, 'STALE_ROOT');
});
