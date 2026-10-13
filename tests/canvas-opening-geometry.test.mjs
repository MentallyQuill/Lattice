import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, dom } from './canvas-fixture.mjs';

test('dirty cards align all pins in bounded layout write/read passes', async () => {
    const { canvas, host } = fixture();
    const element = dom.window.Element.prototype;
    const style = dom.window.CSSStyleDeclaration.prototype;
    const original = { rect: element.getBoundingClientRect, prepend: element.prepend, append: element.append, remove: element.remove, property: style.setProperty, context: dom.window.HTMLCanvasElement.prototype.getContext };
    let pendingWrite = false, passes = 0;
    const read = () => { if (pendingWrite) passes++; pendingWrite = false; };
    dom.window.HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }) });
    element.getBoundingClientRect = function () {
        read();
        const probe = this.tagName === 'SPAN' && this.getAttribute('aria-hidden') === 'true';
        return { left: 0, top: probe ? 20 : 0, width: probe ? 0 : 160, height: probe ? 0 : 40 };
    };
    for (const key of ['prepend', 'append', 'remove']) element[key] = function (...args) {
        pendingWrite = true; return original[key].apply(this, args);
    };
    style.setProperty = function (key, ...args) { if (key === '--pc-pin-y') pendingWrite = true; return original.property.call(this, key, ...args); };
    try {
        canvas.invalidateGeometry(['a', 'b']);
        assert.ok(passes <= 3, `expected at most three layout write/read passes for all cards; got ${passes}`);
        assert.equal(host.querySelectorAll('[aria-hidden="true"][style*="vertical-align"]').length, 0, 'baseline probes are removed');
        for (const pin of host.querySelectorAll('.pc-port')) assert.equal(pin.style.getPropertyValue('--pc-pin-y'), '-3px');
    } finally {
        Object.assign(element, { getBoundingClientRect: original.rect, prepend: original.prepend, append: original.append, remove: original.remove });
        style.setProperty = original.property; dom.window.HTMLCanvasElement.prototype.getContext = original.context;
        await canvas.destroy(); host.remove();
    }
});

async function rootFixture({ intermediate = false } = {}) {
    const { graph, canvas: initial, host: initialHost } = fixture();
    await initial.destroy(); initialHost.remove();
    const root = document.createElement('div'); root.className = 'pc-root pc-open';
    const host = document.createElement('div'), ancestor = intermediate ? document.createElement('div') : root;
    if (intermediate) root.append(ancestor);
    ancestor.append(host); document.body.append(root);
    const { Canvas } = await import('./canvas-fixture.mjs');
    const canvas = new Canvas(host); canvas.setGraph(graph, { viewKey: 'activation1', geometryKey: 'document:root' });
    canvas.geometry.measure('a', 160, 48, [{ id: 'out', direction: 'out', x: 160, y: 24 }]);
    return { canvas, host, root, graph, ancestor };
}

test('closing the actual overlay defers all card geometry reads', async () => {
    const { canvas, host, root } = await rootFixture();
    const original = dom.window.Element.prototype.getBoundingClientRect;
    let reads = 0;
    dom.window.Element.prototype.getBoundingClientRect = function () { if (host.contains(this)) reads++; return original.call(this); };
    try {
        root.classList.remove('pc-open');
        await Promise.resolve(); await Promise.resolve();
        assert.equal(reads, 0, 'closure MutationObserver must never measure hidden cards');
        assert.equal(canvas.geometry.get('a'), 48); assert.equal(canvas.geometry.endpoint('a', 'out', 'out').y, 24);
        canvas.invalidateGeometry(['a'], 'fonts');
        assert.equal(reads, 0, 'explicit hidden layout invalidations are deferred too');
        assert.ok(canvas.dirtyGeometry.has('a'));
    } finally { dom.window.Element.prototype.getBoundingClientRect = original; await canvas.destroy(); root.remove(); }
});

test('fresh activation preserves qualified geometry and clears interaction state', async () => {
    const { canvas, root, graph, host } = await rootFixture();
    const measure = canvas.geometry.measure.bind(canvas.geometry); let measurements = 0;
    canvas.geometry.measure = (...args) => { measurements++; return measure(...args); };
    const card = host.querySelector('.pc-node[data-id="a"]');
    canvas.setTrace([{ id: 'a', status: 'running' }]);
    try {
        canvas.setGraph(structuredClone(graph), { viewKey: 'activation2', geometryKey: 'document:root' });
        assert.equal(measurements, 0, 'unchanged qualified cards should not be measured for fresh edit authority');
        assert.equal(canvas.geometry.get('a'), 48); assert.equal(canvas.geometry.endpoint('a', 'out', 'out').y, 24);
        assert.equal(host.querySelector('.pc-node[data-id="a"]'), card);
        assert.equal(canvas.detailScopeKey, 'activation2'); assert.equal(canvas.trace, null);
        assert.ok(!card.classList.contains('pc-trace-running'));
        const changed = structuredClone(graph); changed.nativeCards.a.ports[0].label = 'Changed label';
        canvas.setGraph(changed, { viewKey: 'activation3', geometryKey: 'document:root' });
        assert.equal(measurements, 1, 'only current changed content remeasures');
        canvas.setGraph(structuredClone(changed), { viewKey: 'activation4', geometryKey: 'replacement:root' });
        assert.equal(measurements, 3, 'same-ID distinct document geometry scopes remeasure all cards');
    } finally { await canvas.destroy(); root.remove(); }
});

test('visibility-only reopen and unchanged theme attributes retain settled geometry', async () => {
    const { canvas, root, graph } = await rootFixture();
    const measure = canvas.geometry.measure.bind(canvas.geometry); let measurements = 0;
    canvas.geometry.measure = (...args) => { measurements++; return measure(...args); };
    try {
        root.classList.remove('pc-open'); await Promise.resolve(); await Promise.resolve();
        root.classList.add('pc-open');
        canvas.setGraph(structuredClone(graph), { viewKey: 'activation2', geometryKey: 'document:root' });
        await Promise.resolve(); await Promise.resolve();
        assert.equal(measurements, 0, 'visibility changes do not invalidate an unchanged retained layout');
        const doc = document.documentElement;
        doc.setAttribute('style', doc.getAttribute('style') ?? '');
        await Promise.resolve(); await Promise.resolve();
        assert.equal(measurements, 0, 'setting unchanged theme values does not remeasure cards');
        root.classList.remove('pc-open'); await Promise.resolve();
        doc.style.setProperty('--pc-font', 'Changed family'); await Promise.resolve();
        assert.equal(measurements, 0, 'changed hidden environment defers measurement');
        root.classList.add('pc-open'); await Promise.resolve(); await Promise.resolve();
        assert.equal(measurements, 2, 'showing measures cards changed by the hidden environment');
    } finally { await canvas.destroy(); root.remove(); document.documentElement.style.removeProperty('--pc-font'); }
});


test('revealing an intermediate ancestor drains deferred geometry without size changes', async () => {
    const { canvas, host, root, ancestor } = await rootFixture({ intermediate: true });
    const measure = canvas.geometry.measure.bind(canvas.geometry), original = dom.window.Element.prototype.getBoundingClientRect;
    let measurements = 0, reads = 0;
    canvas.geometry.measure = (...args) => { measurements++; return measure(...args); };
    dom.window.Element.prototype.getBoundingClientRect = function () { if (host.contains(this)) reads++; return original.call(this); };
    try {
        ancestor.style.visibility = 'hidden'; await Promise.resolve(); await Promise.resolve();
        canvas.invalidateGeometry(['a'], 'fonts');
        assert.equal(measurements, 0); assert.equal(reads, 0, 'hidden invalidation must not read geometry');
        assert.ok(canvas.dirtyGeometry.has('a'));
        ancestor.style.visibility = 'visible'; await Promise.resolve(); await Promise.resolve();
        assert.equal(measurements, 1, 'ancestor reveal measures the pending card without a resize');
        assert.ok(reads > 0); assert.ok(!canvas.dirtyGeometry.has('a'));
        ancestor.style.visibility = 'hidden'; await Promise.resolve();
        ancestor.style.visibility = 'visible'; await Promise.resolve(); await Promise.resolve();
        assert.equal(measurements, 1, 'unchanged hide/reveal does not remeasure settled geometry');
    } finally { dom.window.Element.prototype.getBoundingClientRect = original; await canvas.destroy(); root.remove(); }
});
