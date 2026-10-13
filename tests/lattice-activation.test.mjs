import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');

test('launcher activation updates snapshot and status without rebuilding the open UI', () => {
    const dom = new JSDOM('<body></body>');
    let graph = { id: 'first', nodes: {} }, token = {}, activated, paints = 0, refreshes = 0;
    const cancellations = [], runtime = { cancel: reason => cancellations.push(reason), dispose() {} };
    const env = {
        document: dom.window.document,
        ctx: () => ({ eventTypes: {} }),
        settings: () => ({ enabled: true }),
        activeWorkflow: () => graph,
        documentSession: { capture: () => token, stillCurrent: value => value === token },
        onWorkflowActivated(callback) { activated = callback; },
        initializeNativeWorkflowController: async () => {},
        getNativeWorkflowController: () => runtime,
        workflowSignature: value => JSON.stringify(value.nodes),
        paintSendbar() { paints++; },
        applyTheme() {}, mountLauncher() {}, addSlashCommand() {}, MODULE: 'lattice',
        UI: { refreshIfOpen() { refreshes++; } }, safe: fn => fn(), globalThis: { addEventListener() {} },
    };
    const start = source.indexOf('function boot()'), end = source.indexOf('\n}', start) + 2;
    Function('env', 'with(env){' + source.slice(start, end) + ';boot();}')(env);
    graph = { id: 'second', nodes: { one: { id: 'one' } } }; token = {};
    activated();
    assert.equal(refreshes, 0);
    assert.equal(paints, 1);
    dom.window.document.dispatchEvent(new dom.window.Event('pc-state'));
    assert.equal(paints, 2);
    assert.deepEqual(cancellations, []);
});
