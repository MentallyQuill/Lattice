import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture, mouse, dom } from './canvas-fixture.mjs';
import { createNativeWireBridge } from '../src/ui/native-wire-bridge.js?v=0.27.1';
import { prepareNativeSearchCatalog } from '../src/ui/native-search-catalog.js?v=0.27.1';

const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function controllerKeydown(env) {
    const start = source.indexOf("document.addEventListener('keydown', event => {");
    const end = source.indexOf('\n    });', start) + '\n    });'.length;
    assert.ok(start >= 0 && end > start, 'Use the actual controller keydown registration');
    let listener;
    const registrar = { addEventListener(type, handler) { assert.equal(type, 'keydown'); listener = handler; } };
    Function('env', 'with(env){' + source.slice(start, end) + '}')({ ...env, document: registrar });
    assert.equal(typeof listener, 'function');
    return listener;
}
function workspaceFixture() {
    let bridge, workflowId;
    const f = fixture({ nativeBridge: () => bridge, nativeScope: () => ({ workflowId, instancePath: [], readOnly: false }), canEdit: () => true });
    workflowId = f.graph.id;
    f.graph.mode = 'native-unified';
    f.canvas.setGraph(f.graph);
    const catalog = prepareNativeSearchCatalog({ schema: 3, runtime: 2, mode: f.graph.mode, workflowId, viewPath: [], inDefinition: false });
    assert.equal(catalog.ok, true, 'Use a supported unified root catalog');
    bridge = createNativeWireBridge({
        catalog: catalog.data,
        adapter: { capture: () => ({ ok: true, data: {} }), isCurrent: () => true,
            prepare() { assert.fail('Escape must never prepare an authored edit'); }, commit() { assert.fail('Escape must never commit an authored edit'); } },
        onUpdate: (view, requests) => f.canvas.updateNativeWire(view, requests),
    });
    const root = document.createElement('div'); root.className = 'pc-root pc-open'; document.body.append(root); root.append(f.host);
    let closes = 0;
    const listener = controllerKeydown({ pendingDocumentPrompt: null, isOpen: () => root.classList.contains('pc-open'), typing: () => false, canvas: f.canvas,
        close() { closes++; root.classList.remove('pc-open'); } });
    // Canvas installs its real document listener first, as production build does.
    document.addEventListener('keydown', listener);
    return { ...f, root, bridge, closes: () => closes, async destroy() { document.removeEventListener('keydown', listener); await f.canvas.destroy(); root.remove(); } };
}
function escape(f) {
    const event = new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' });
    f.host.dispatchEvent(event); return event;
}

for (const gesture of ['pan', 'native connection']) test(`controller preserves the workspace when Canvas consumes Escape for an active ${gesture}`, async () => {
    const f = workspaceFixture(), original = structuredClone(f.graph);
    try {
        if (gesture === 'pan') {
            mouse(f.host, 'mousedown', 200, 150, { button: 1 });
            mouse(window, 'mousemove', 250, 190, { buttons: 4 });
            assert.ok(f.canvas.pan, 'The actual Canvas pan is active');
        } else {
            const pin = f.host.querySelector('.pc-port[data-node="a"][data-dir="out"]'); assert.ok(pin);
            const event = new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 210, clientY: 74, button: 0 });
            Object.defineProperties(event, { pointerId: { value: 7 }, pointerType: { value: 'mouse' } });
            pin.dispatchEvent(event);
            assert.equal(f.bridge.project().gesture.kind, 'drag', 'The actual native bridge owns the pointer gesture');
        }
        assert.equal(document.activeElement, f.host);
        assert.equal(escape(f).defaultPrevented, true);
        assert.equal(f.canvas.pan, null); assert.equal(f.bridge.project().gesture.kind, 'idle');
        assert.equal(f.closes(), 0, 'One consumed Escape cancels the gesture without also closing the workspace');
        assert.equal(f.root.classList.contains('pc-open'), true);
        assert.deepEqual(f.graph, original, 'Cancellation preserves the authored graph and restores camera state');
    } finally { await f.destroy(); }
});

test('idle Escape still closes a workspace without a gesture or selection', async () => {
    const f = workspaceFixture();
    try {
        f.host.focus(); assert.equal(f.canvas.hasContentGesture(), false); assert.equal(f.canvas.selection, null); assert.equal(f.canvas.multi.size, 0);
        assert.equal(escape(f).defaultPrevented, true);
        assert.equal(f.closes(), 1); assert.equal(f.root.classList.contains('pc-open'), false);
    } finally { await f.destroy(); }
});
