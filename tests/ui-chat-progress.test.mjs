import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const api = await import('../src/ui/chat-progress.js').catch(() => ({}));
const address = (nodeId, instancePath = []) => ({ workflowId: 'workflow/one', instancePath, nodeId });
const unit = (nodeId, { included = true, instancePath = [], dependencies = [], requestBound = 1 } = {}) => ({ address: address(nodeId, instancePath), operation: 'work', included, dependencies: dependencies.map(id => address(id, instancePath)), requestBound, inputPorts: ['in'], outputPorts: ['out'] });
const plan = (units = [unit('a'), unit('b'), unit('excluded', { included: false })], hierarchy = []) => ({ workflowId: 'workflow/one', phase: 'post', mode: 'root', units, hierarchy, terminals: [], callBound: units.filter(item => item.included).reduce((sum, item) => sum + item.requestBound, 0) });

function fixture(t) {
    assert.equal(typeof api.createChatProgress, 'function');
    const dom = new JSDOM('<button id="launcher">Lattice</button><button id="replacement">Lattice</button>');
    const activityListeners = new Set(), eventListeners = new Set();
    const subscribe = listeners => listener => { listeners.add(listener); return () => listeners.delete(listener); };
    const presenter = api.createChatProgress({ document: dom.window.document, subscribeActivity: subscribe(activityListeners), subscribeEvents: subscribe(eventListeners) });
    const button = dom.window.document.getElementById('launcher');
    presenter.mount(button);
    t.after(() => { presenter.dispose(); dom.window.close(); });
    let seq = 0, runId = 'run-1';
    return {
        presenter, document: dom.window.document, button,
        meter: () => button.querySelector('.pc-chat-progress'),
        activity(value = { busy: true, runId }) { if (value?.runId) { if (runId !== value.runId) seq = 0; runId = value.runId; } for (const listener of activityListeners) listener(value); },
        event(type, fields = {}) { const value = { runId, seq: ++seq, at: 100 + seq, elapsedMs: seq, type, ...fields }; for (const listener of eventListeners) listener(value); },
    };
}

function clock(t) {
    const original = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };
    let now = 1000, nextId = 0;
    const timers = new Map();
    globalThis.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id, { callback, due: now + delay }); return id; };
    globalThis.clearTimeout = id => timers.delete(id);
    Date.now = () => now;
    t.after(() => { globalThis.setTimeout = original.setTimeout; globalThis.clearTimeout = original.clearTimeout; Date.now = original.now; });
    return { tick(milliseconds) {
        const target = now + milliseconds;
        while (true) {
            const next = [...timers].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
            if (!next) break;
            now = next[1].due; timers.delete(next[0]); next[1].callback();
        }
        now = target;
    } };
}

// Failing to retain the plan or node events would leave the launcher at unknown progress.
test('renders waiting then active stage progress using real runtime events', t => {
    const f = fixture(t);
    assert.equal(f.meter().hidden, true);
    f.activity();
    assert.equal(f.meter().hidden, false);
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '—');
    assert.equal(f.meter().querySelectorAll('.pc-chat-progress-pixel[data-status="waiting"]').length, 1);
    f.event('plan', { plan: plan() });
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '0%');
    f.event('node-phase', { address: address('a'), phase: 'executing' });
    assert.equal(f.meter().querySelectorAll('.pc-chat-progress-pixel[data-status="running"]').length, 1);
    f.event('node-settled', { address: address('a'), status: 'completed' });
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '50%');
    assert.equal(f.meter().getAttribute('role'), 'status');
    assert.match(f.meter().getAttribute('aria-label'), /1 of 2 stages.*0 skipped/i);
    assert.match(f.meter().title, /stage/i);
});

// Counting wrappers twice, ignoring skips, or showing 100 before settlement overstates progress.
test('counts skipped nested primitives once and reserves 100 percent for success', t => {
    const f = fixture(t);
    f.activity();
    f.event('plan', { plan: plan([unit('a'), unit('b', { instancePath: ['nested'] }), unit('c', { instancePath: ['nested'] }), unit('excluded', { included: false })], [{ address: address('nested'), kind: 'instance', included: true }]) });
    f.event('node-phase', { address: address('a'), phase: 'executing' });
    f.event('node-settled', { address: address('a'), status: 'completed' });
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '33%');
    f.event('node-settled', { address: address('b', ['nested']), status: 'skipped' });
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '66%');
    assert.equal(f.meter().querySelectorAll('.pc-chat-progress-pixel').length, 3);
    f.event('node-phase', { address: address('c', ['nested']), phase: 'executing' });
    f.event('node-settled', { address: address('c', ['nested']), status: 'completed' });
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '99%');
    f.event('run-settled', { status: 'completed' });
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '100%');
    assert.equal(f.meter().dataset.status, 'completed');
    assert.match(f.meter().getAttribute('aria-label'), /completed.*3 of 3 stages.*1 skipped/i);
});

// Leaving any terminal outcome visible past the fade would retain a meter while idle.
test('fades every terminal outcome immediately and hides it at exactly three seconds', t => {
    const f = fixture(t), time = clock(t);
    for (const status of ['completed', 'failed', 'cancelled', 'unresolved', 'invalid', 'stale']) {
        f.activity({ busy: true, runId: 'run-' + status });
        f.event('plan', { plan: plan() });
        f.event('run-settled', { status });
        assert.equal(f.meter().dataset.status, status);
        assert.equal(f.meter().classList.contains('pc-chat-progress-fading'), true);
        assert.equal(f.meter().hidden, false);
        time.tick(1500);
        assert.equal(f.meter().hidden, false);
        time.tick(1499);
        assert.equal(f.meter().hidden, false);
        time.tick(1);
        assert.equal(f.meter().hidden, true);
    }
});

// Cancellation clears activity before its final event; that later event must not extend the fade.
test('activity clearing starts the deadline before cancellation settlement and late events cannot revive it', t => {
    const f = fixture(t), time = clock(t);
    f.activity();
    f.event('plan', { plan: plan() });
    f.event('node-phase', { address: address('a'), phase: 'executing' });
    f.event('run-cancelling');
    f.activity(null);
    assert.equal(f.meter().classList.contains('pc-chat-progress-fading'), true);
    time.tick(1200);
    f.event('run-settled', { status: 'cancelled' });
    assert.equal(f.meter().dataset.status, 'cancelled');
    time.tick(1799);
    assert.equal(f.meter().hidden, false);
    time.tick(1);
    assert.equal(f.meter().hidden, true);
    f.event('node-settled', { address: address('a'), status: 'completed' });
    f.presenter.mount(null);
    f.presenter.mount(f.button);
    assert.equal(f.meter().hidden, true);
});

// Recreating subscriptions or fade timing on mount loses detached progress and lengthens the fade.
test('retains detached progress and the original fade position when the launcher remounts', t => {
    const f = fixture(t), time = clock(t), root = f.meter();
    f.activity();
    f.presenter.mount(null);
    f.event('plan', { plan: plan() });
    f.event('node-phase', { address: address('a'), phase: 'executing' });
    f.event('node-settled', { address: address('a'), status: 'completed' });
    const replacement = f.document.getElementById('replacement');
    f.presenter.mount(replacement);
    assert.equal(replacement.querySelector('.pc-chat-progress'), root);
    assert.equal(root.querySelector('.pc-chat-progress-percent').textContent, '50%');
    f.presenter.mount(null);
    f.event('run-settled', { status: 'failed' });
    time.tick(1500);
    f.presenter.mount(replacement);
    assert.equal(root.style.getPropertyValue('--pc-chat-progress-fade-elapsed'), '-1500ms');
    assert.equal(root.hidden, false);
    time.tick(1499);
    assert.equal(root.hidden, false);
    time.tick(1);
    assert.equal(root.hidden, true);
    f.activity({ busy: true, runId: 'run-2' });
    assert.equal(root.hidden, false);
    assert.equal(root.classList.contains('pc-chat-progress-fading'), false);
    assert.equal(root.style.getPropertyValue('--pc-chat-progress-fade-elapsed'), '');
});

// Truncating overflow would hide a running stage; displaying every row would overflow the launcher.
test('caps root display pixels at 36 and aggregates active overflow without changing primitive progress', t => {
    const f = fixture(t);
    f.activity();
    f.event('plan', { plan: plan(Array.from({ length: 40 }, (_, i) => unit('stage-' + i))) });
    f.event('node-phase', { address: address('stage-0'), phase: 'executing' });
    f.event('node-settled', { address: address('stage-0'), status: 'completed' });
    f.event('node-settled', { address: address('stage-36'), status: 'skipped' });
    f.event('node-phase', { address: address('stage-39'), phase: 'executing' });
    const pixels = f.meter().querySelectorAll('.pc-chat-progress-pixel');
    assert.equal(pixels.length, 36);
    assert.equal(pixels[35].dataset.status, 'running');
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '5%');
    assert.match(f.meter().getAttribute('aria-label'), /2 of 40 stages.*1 skipped/i);
});

// Old events/timers must not hide a new run, and repeated notifications must not revive an expired run.
test('a new run cancels the old fade and ignores stale events and repeat activity', t => {
    const f = fixture(t), time = clock(t);
    f.activity();
    f.event('plan', { plan: plan() });
    f.event('run-settled', { status: 'failed' });
    time.tick(1500);
    f.activity({ busy: true, runId: 'run-2' });
    assert.equal(f.meter().hidden, false);
    assert.equal(f.meter().classList.contains('pc-chat-progress-fading'), false);
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '—');
    f.event('plan', { plan: plan() });
    f.event('run-settled', { runId: 'run-1', seq: 999, status: 'completed' });
    assert.equal(f.meter().dataset.status, 'waiting');
    time.tick(1500);
    assert.equal(f.meter().hidden, false);
    f.event('node-phase', { address: address('a'), phase: 'executing' });
    f.event('node-settled', { address: address('a'), status: 'completed' });
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '50%');
    f.event('run-settled', { status: 'failed' });
    time.tick(3000);
    f.activity();
    assert.equal(f.meter().hidden, true);
});

// Request retries spend no extra primitive percentage units; only node settlement advances it.
test('request retries retain the primitive percentage until the stage settles', t => {
    const f = fixture(t);
    f.activity();
    f.event('plan', { plan: plan([unit('a'), unit('b', { requestBound: 3 })]) });
    f.event('node-phase', { address: address('a'), phase: 'executing' });
    f.event('node-settled', { address: address('a'), status: 'completed' });
    f.event('node-phase', { address: address('b'), phase: 'executing' });
    f.event('request-start', { address: address('b'), attempt: 1, maxTokens: 20 });
    f.event('request-settled', { address: address('b'), attempt: 1, status: 'failed', durationMs: 1 });
    f.event('node-retry', { address: address('b'), reasonCode: 'REQUEST_FAILED', delayMs: 500, nextAttempt: 2, maxAttempts: 3 });
    f.event('request-start', { address: address('b'), attempt: 2, maxTokens: 20 });
    f.event('request-settled', { address: address('b'), attempt: 2, status: 'completed', durationMs: 1 });
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '50%');
    assert.equal(f.meter().querySelectorAll('.pc-chat-progress-pixel[data-status="running"]').length, 1);
    f.event('node-settled', { address: address('b'), status: 'completed' });
    assert.equal(f.meter().querySelector('.pc-chat-progress-percent').textContent, '99%');
});
