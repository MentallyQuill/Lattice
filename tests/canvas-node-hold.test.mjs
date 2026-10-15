import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, mouse, dom } from './canvas-fixture.mjs';

test('holding a node suppresses connection hover before movement and restores it after release', async () => {
    const f = fixture();
    const heading = f.host.querySelector('.pc-node[data-id="a"] .pc-native-heading');
    const hit = f.host.querySelector('.pc-wire-hit[data-id="edge"]');
    const wire = f.host.querySelector('.pc-wire-native[data-id="edge"]');
    const hover = () => hit.dispatchEvent(new dom.window.MouseEvent('pointerover', { bubbles: true }));
    try {
        mouse(heading, 'mousedown', 100, 60);
        assert.equal(f.canvas.drag.moved, false);
        hover();
        assert.equal(wire.classList.contains('pc-wire-feeds'), false, 'holding without movement must suppress wire hover');
        mouse(window, 'mouseup', 100, 60);
        hover();
        assert.equal(wire.classList.contains('pc-wire-feeds'), true, 'hover works again after release');
    } finally { await f.canvas.destroy(); f.host.remove(); }
});

test('node holds leave unrelated host hover handlers alone', async () => {
    const f = fixture();
    const control = document.createElement('button'); document.body.append(control);
    let enters = 0; control.addEventListener('mouseenter', () => enters++);
    try {
        mouse(f.host.querySelector('.pc-node[data-id="a"] .pc-native-heading'), 'mousedown', 100, 60);
        control.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
        assert.equal(enters, 1, 'only Lattice hover handlers are suppressed');
    } finally { await f.canvas.destroy(); f.host.remove(); control.remove(); }
});

test('holding multiple nodes suppresses pin hover and cancellation restores it', async () => {
    const f = fixture();
    const pin = f.host.querySelector('.pc-port[data-node="b"][data-dir="in"]');
    try {
        f.canvas.setMulti(['a', 'b']);
        mouse(f.host.querySelector('.pc-node[data-id="a"] .pc-native-heading'), 'mousedown', 100, 60);
        assert.equal(f.canvas.drag.several.length, 2);
        pin.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
        assert.equal(pin.classList.contains('pc-pin-highlight'), false, 'multi-node holds suppress pin hover');
        f.canvas.cancelGesture('escape');
        pin.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
        assert.equal(pin.classList.contains('pc-pin-highlight'), true, 'cancellation restores pin hover');
    } finally { await f.canvas.destroy(); f.host.remove(); }
});
