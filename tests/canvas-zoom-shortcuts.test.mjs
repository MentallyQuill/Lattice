import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, dom } from './canvas-fixture.mjs';

function key(target, value, options = {}) {
    const event = new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
}

test('focused canvas brackets zoom around its center without changing graph content', async () => {
    const f = fixture();
    const previousMatchMedia = window.matchMedia;
    window.matchMedia = () => ({ matches: true });
    const root = document.createElement('div'); root.className = 'pc-root pc-open'; root.setAttribute('role', 'dialog');
    document.body.append(root); root.append(f.host);
    try {
        Object.assign(f.canvas.view, { x: 100, y: 50, zoom: 1 });
        f.canvas.applyTransform(); f.host.focus();
        const content = () => JSON.stringify({ nodes: f.graph.nodes, wires: f.graph.wires, groups: f.graph.groups });
        const before = content();
        assert.equal(key(f.host, ']').defaultPrevented, true);
        f.canvas.frames.flush();
        assert.equal(f.canvas.view.zoom, 1.15);
        assert.ok(Math.abs(f.canvas.view.x - 40) < 1e-9);
        assert.ok(Math.abs(f.canvas.view.y + 2.5) < 1e-9);
        assert.equal(key(f.host, '[').defaultPrevented, true);
        f.canvas.frames.flush();
        assert.ok(Math.abs(f.canvas.view.zoom - 1) < 1e-9);
        assert.ok(Math.abs(f.canvas.view.x - 100) < 1e-9);
        assert.ok(Math.abs(f.canvas.view.y - 50) < 1e-9);
        assert.equal(content(), before);
    } finally { window.matchMedia = previousMatchMedia; await f.canvas.destroy(); root.remove(); }
});

test('bracket zoom belongs to the focused camera and leaves editors, controls and gestures alone', async () => {
    const f = fixture(), other = fixture();
    const previousMatchMedia = window.matchMedia;
    window.matchMedia = () => ({ matches: true });
    const root = document.createElement('div'); root.className = 'pc-root pc-open';
    document.body.append(root); root.append(f.host);
    try {
        const before = { ...f.canvas.view };
        for (const element of [document.createElement('input'), document.createElement('textarea'), document.createElement('select'),
            Object.assign(document.createElement('button'), { textContent: 'Details' }), document.createElement('div')]) {
            if (element.tagName === 'DIV') { element.setAttribute('contenteditable', 'plaintext-only'); element.tabIndex = 0; }
            f.host.append(element); element.focus();
            for (const bracket of ['[', ']']) assert.equal(key(element, bracket).defaultPrevented, false);
            assert.deepEqual(f.canvas.view, before); element.remove();
        }
        f.host.focus();
        for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { repeat: true }]) {
            assert.equal(key(f.host, ']', options).defaultPrevented, false);
            assert.deepEqual(f.canvas.view, before);
        }
        for (const legacy of ['+', '=', '-']) assert.equal(key(f.host, legacy).defaultPrevented, false);
        f.host.addEventListener('keydown', event => event.preventDefault(), { once: true });
        key(f.host, ']'); assert.deepEqual(f.canvas.view, before);
        for (const gesture of ['drag', 'pan', 'marquee']) {
            f.canvas[gesture] = {};
            assert.equal(key(f.host, ']').defaultPrevented, false);
            assert.deepEqual(f.canvas.view, before); f.canvas[gesture] = null;
        }
        other.host.focus();
        key(other.host, ']'); other.canvas.frames.flush();
        assert.equal(other.canvas.view.zoom, 1.15); assert.deepEqual(f.canvas.view, before);
        f.host.focus(); root.classList.remove('pc-open');
        assert.equal(key(f.host, ']').defaultPrevented, false); assert.deepEqual(f.canvas.view, before);
    } finally {
        window.matchMedia = previousMatchMedia;
        await f.canvas.destroy(); await other.canvas.destroy(); root.remove(); other.host.remove();
    }
});
