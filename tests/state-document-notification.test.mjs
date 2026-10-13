import test from 'node:test';
import assert from 'node:assert/strict';
import { installMock } from './mock.js';
import * as S from '../src/state.js?v=0.27.1';
import { starterGraph } from '../src/workflow/starters.js?v=0.27.1';
import { prepareGraphCandidate } from '../src/workflow/composition.js?v=0.27.1';
import { captureGraphEditContext } from '../src/workflow/transactions.js?v=0.27.1';

function fixture() {
    const host = installMock(), root = starterGraph('unified-basic'); root.name = 'Notification baseline'; S.activateWorkflow(root, { clean: true });
    return { host, root, command(edit) { const candidate = structuredClone(root); edit(candidate); return { ...prepareGraphCandidate(root, candidate).data, context: captureGraphEditContext(root, () => ({ sessionId: 'document-notification', viewPath: [], readOnly: false })).data }; } };
}

test('accepted authored commit still publishes its final touch when getContext throws during save', () => {
    const f = fixture(), command = f.command(graph => { graph.name = 'Accepted before context failure'; });
    const original = globalThis.SillyTavern.getContext, touches = [];
    const unsubscribe = S.onGraphTouched((graph, options) => { if (graph === f.root) touches.push({ name: graph.name, options }); });
    try {
        assert.throws(() => S.commitGraphEdit(f.root, command, { reconcileViews() { globalThis.SillyTavern.getContext = () => { throw new Error('host context unavailable'); }; } }), /host context unavailable/);
        assert.deepEqual(touches, [{ name: 'Accepted before context failure', options: { history: false, semanticChanged: false } }]);
    } finally { globalThis.SillyTavern.getContext = original; unsubscribe(); }
});

test('rejected and no-op prepared commits never publish a final touch', () => {
    const f = fixture(); let touches = 0;
    const unsubscribe = S.onGraphTouched(graph => { if (graph === f.root) touches++; });
    try {
        const noOp = f.command(() => {}); assert.equal(S.commitGraphEdit(f.root, noOp).data.changed, false);
        const changed = f.command(graph => { graph.name = 'Rejected'; }); changed.context = {};
        assert.equal(S.commitGraphEdit(f.root, changed).ok, false); assert.equal(touches, 0);
    } finally { unsubscribe(); }
});

test('accepted coordinate commits and recovery failures each publish exactly one final touch', () => {
    const f = fixture(), id = Object.keys(f.root.nodes)[0], touches = [];
    const unsubscribe = S.onGraphTouched((graph, options) => { if (graph === f.root) touches.push(options); });
    try {
        const coordinate = S.commitGraphEdit(f.root, f.command(graph => { graph.nodes[id].x += 30; }));
        assert.equal(coordinate.ok, true); assert.deepEqual(touches, [{ history: false, semanticChanged: false }]);
        const settings = S.settings(); let recovery = settings.recoveryDraft;
        Object.defineProperty(settings, 'recoveryDraft', { configurable: true, enumerable: true, get: () => recovery, set() { throw new Error('recovery storage unavailable'); } });
        const changed = S.commitGraphEdit(f.root, f.command(graph => { graph.name = 'Accepted recovery failure'; }));
        assert.equal(changed.ok, true); assert.equal(changed.recovery.error.code, 'RECOVERY_WRITE'); assert.equal(touches.length, 2);
        Object.defineProperty(settings, 'recoveryDraft', { configurable: true, enumerable: true, writable: true, value: recovery });
        assert.equal(S.retryPendingRecovery().ok, true);
    } finally { unsubscribe(); }
});

test('accepted Undo and Redo retain final notifications when their save context throws', () => {
    const f = fixture(); S.commitGraphEdit(f.root, f.command(graph => { graph.name = 'History edit'; }));
    const original = globalThis.SillyTavern.getContext, names = [];
    const unsubscribe = S.onGraphTouched(graph => { if (graph === f.root) names.push(graph.name); });
    try {
        for (const action of ['undo', 'redo']) {
            assert.throws(() => S.stepGraphHistory(f.root, action, { reconcileViews() { globalThis.SillyTavern.getContext = () => { throw new Error('history context unavailable'); }; } }), /history context unavailable/);
            globalThis.SillyTavern.getContext = original;
        }
        assert.deepEqual(names, ['Notification baseline', 'History edit']);
    } finally { globalThis.SillyTavern.getContext = original; unsubscribe(); }
});

test('final observers read raw mutations and same-ID activations without reusing an old snapshot', () => {
    const f = fixture(); const oldCapture = S.documentSession.capture(), next = structuredClone(f.root); next.name = 'Same-ID replacement';
    let observed;
    const mutate = S.onGraphTouched(graph => { if (graph === f.root) { graph.name = 'External observer mutation'; assert.match(S.documentSession.snapshot(), /External observer mutation/); S.activateWorkflow(next, { clean: true }); } });
    const observe = S.onGraphTouched(graph => { if (graph === f.root) observed = { current: S.documentSession.current(), dirty: S.documentSession.dirty(), stale: S.documentSession.stillCurrent(oldCapture) }; });
    try {
        assert.equal(S.commitGraphEdit(f.root, f.command(graph => { graph.name = 'Before observer'; })).ok, true);
        assert.deepEqual(observed, { current: next, dirty: false, stale: false });
    } finally { mutate(); observe(); }
});
