import { test, expect } from '@playwright/test';

// Artifact-pin tests cover DPR 1; this reopening path also exercises DPR 2.
test.use({ deviceScaleFactor: 2 });
async function openFixture(page, count = 6) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async count => { const h = window.canvasHarness; await h.reset(count); await document.fonts.ready; await h.settle(); }, count);
}

async function pinErrors(page) {
    return page.evaluate(() => {
        const h = window.canvasHarness, zoom = h.canvas.view.zoom, context = document.createElement('canvas').getContext('2d');
        let endpoint = 0, ink = 0, wrapped = 0;
        for (const pin of document.querySelectorAll('.pc-node-native .pc-port')) {
            const box = pin.getBoundingClientRect(), label = pin.closest('.pc-native-row').querySelector('.pc-native-pin-label');
            const anchor = h.canvas.endpoint(pin.dataset.node, pin.dataset.dir, pin.dataset.port);
            const screen = new DOMPoint(anchor.x, anchor.y).matrixTransform(document.querySelector('.pc-wires').getScreenCTM());
            endpoint = Math.max(endpoint, Math.hypot(screen.x - box.x - box.width / 2, screen.y - box.y - box.height / 2));
            if (label.getBoundingClientRect().height / zoom > 24) { wrapped++; continue; }
            if (getComputedStyle(label).display === 'none') continue;
            context.font = getComputedStyle(label).font;
            const metrics = context.measureText(label.textContent), probe = document.createElement('span');
            probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
            label.prepend(probe); const baseline = probe.getBoundingClientRect().top; probe.remove();
            const center = baseline + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) * zoom / 2;
            ink = Math.max(ink, Math.abs(box.y + box.height / 2 - center));
        }
        return { endpoint, ink, wrapped, providerCalls: h.providerCalls() };
    });
}

// Catches restoring per-pin write/read alternation even when total rectangle reads are unchanged.
test('dirty-card baseline layout passes stay bounded as pin count increases', async ({ page }) => {
    await openFixture(page);
    const counts = [];
    for (const count of [6, 24]) {
        await page.evaluate(count => window.canvasHarness.reset(count), count);
        counts.push(await page.evaluate(() => {
            const h = window.canvasHarness, element = Element.prototype, style = CSSStyleDeclaration.prototype;
            const original = { rect: element.getBoundingClientRect, prepend: element.prepend, append: element.append, remove: element.remove, property: style.setProperty };
            let dirty = false, passes = 0, reads = 0;
            const probe = item => item instanceof Element && item.matches('span[aria-hidden="true"]') && item.style.verticalAlign === 'baseline';
            element.getBoundingClientRect = function () { reads++; if (dirty) passes++; dirty = false; return original.rect.call(this); };
            for (const name of ['prepend', 'append']) element[name] = function (...items) { if (items.some(probe)) dirty = true; return original[name].apply(this, items); };
            element.remove = function () { if (probe(this)) dirty = true; return original.remove.call(this); };
            style.setProperty = function (key, ...args) { if (key === '--pc-pin-y') dirty = true; return original.property.call(this, key, ...args); };
            try { h.canvas.invalidateGeometry(); return { passes, reads }; }
            finally { Object.assign(element, { getBoundingClientRect: original.rect, prepend: original.prepend, append: original.append, remove: original.remove }); style.setProperty = original.property; }
        }));
    }
    expect(counts[1].reads).toBeGreaterThan(counts[0].reads);
    for (const count of counts) expect(count.passes).toBeLessThanOrEqual(3);
    const errors = await pinErrors(page); expect(errors.endpoint).toBeLessThan(.1); expect(errors.ink).toBeLessThan(.1); expect(errors.providerCalls).toBe(0);
});

// Catches hidden zero-box work and tying geometry validity to fresh editor activation authority.
test('unchanged reopen keeps geometry while changed closed content and fonts requalify pins', async ({ page }) => {
    await openFixture(page);
    const unchanged = await page.evaluate(async () => {
        const h = window.canvasHarness, c = h.canvas, key = c.detailScopeKey;
        const original = Element.prototype.getBoundingClientRect, measure = c.geometry.measure.bind(c.geometry);
        let hiddenReads = 0, measurements = 0;
        Element.prototype.getBoundingClientRect = function () { if (c.host.contains(this) && !document.querySelector('.pc-root').classList.contains('pc-open')) hiddenReads++; return original.call(this); };
        c.geometry.measure = (...args) => { measurements++; return measure(...args); };
        try {
            h.UI.close(); await h.settle(); h.UI.open(); await h.settle();
            return { hiddenReads, measurements, freshActivation: c.detailScopeKey !== key };
        } finally { Element.prototype.getBoundingClientRect = original; c.geometry.measure = measure; }
    });
    expect(unchanged).toEqual({ hiddenReads: 0, measurements: 0, freshActivation: true });
    const changed = await page.evaluate(async () => {
        const h = window.canvasHarness, c = h.canvas, measure = c.geometry.measure.bind(c.geometry); let measurements = 0;
        c.geometry.measure = (...args) => { measurements++; return measure(...args); };
        try {
            h.UI.close(); await h.settle(); h.graph.nodes.n0.sections[0].name = 'LongSceneInputLabelThatWrapsOntoSeveralLines';
            h.UI.open(); await h.settle();
            return { measurements, current: c.graph.nativeCards.n0.ports.some(pin => pin.label === 'LongSceneInputLabelThatWrapsOntoSeveralLines') };
        } finally { c.geometry.measure = measure; }
    });
    expect(changed.current).toBe(true); expect(changed.measurements).toBe(1);
    let errors = await pinErrors(page); expect(errors.wrapped).toBeGreaterThan(0); expect(errors.endpoint).toBeLessThan(.1);
    const fonts = await page.evaluate(async () => {
        const h = window.canvasHarness, c = h.canvas, measure = c.geometry.measure.bind(c.geometry); let measurements = 0;
        c.geometry.measure = (...args) => { measurements++; return measure(...args); };
        try {
            h.UI.close(); await h.settle(); const T = await import('/src/theme.js?v=' + h.version); T.setStyle('font', 'mono');
            await document.fonts.ready; document.fonts.dispatchEvent(new Event('loadingdone')); await h.settle();
            const hidden = measurements; h.UI.open(); await h.settle(); return { hidden, visible: measurements };
        } finally { c.geometry.measure = measure; }
    });
    expect(fonts.hidden).toBe(0); expect(fonts.visible).toBeGreaterThan(0);
    for (const zoom of [.73, 1.35]) {
        await page.evaluate(async zoom => { const h = window.canvasHarness; await h.view({ x: 0, y: 0, zoom }); h.canvas.invalidateGeometry(); await h.settle(); }, zoom);
        errors = await pinErrors(page); expect(errors.endpoint).toBeLessThan(.1); expect(errors.ink).toBeLessThan(.1); expect(errors.providerCalls).toBe(0);
    }
});

test('intermediate container reveal drains hidden geometry without a resize', async ({ page }) => {
    await openFixture(page);
    const result = await page.evaluate(async () => {
        const h = window.canvasHarness, c = h.canvas, ancestor = c.host.parentElement;
        const measure = c.geometry.measure.bind(c.geometry), original = Element.prototype.getBoundingClientRect;
        let measurements = 0, hiddenReads = 0;
        c.geometry.measure = (...args) => { measurements++; return measure(...args); };
        Element.prototype.getBoundingClientRect = function () {
            if (c.host.contains(this) && getComputedStyle(ancestor).visibility === 'hidden') hiddenReads++;
            return original.call(this);
        };
        try {
            ancestor.style.visibility = 'hidden'; await h.settle();
            c.host.querySelector('.pc-node[data-id="n0"] .pc-native-pin-label').style.fontFamily = 'Georgia';
            c.invalidateGeometry(['n0'], 'fonts'); await h.settle();
            const hidden = { measurements, hiddenReads, dirty: c.dirtyGeometry.has('n0') };
            ancestor.style.visibility = 'visible'; await h.settle();
            const shown = { measurements, dirty: c.dirtyGeometry.has('n0') };
            ancestor.style.visibility = 'hidden'; await h.settle(); ancestor.style.visibility = 'visible'; await h.settle();
            return { hidden, shown, finalMeasurements: measurements };
        } finally { c.geometry.measure = measure; Element.prototype.getBoundingClientRect = original; ancestor.style.removeProperty('visibility'); }
    });
    expect(result).toEqual({ hidden: { measurements: 0, hiddenReads: 0, dirty: true }, shown: { measurements: 1, dirty: false }, finalMeasurements: 1 });
    const errors = await pinErrors(page); expect(errors.endpoint).toBeLessThan(.1); expect(errors.ink).toBeLessThan(.1); expect(errors.providerCalls).toBe(0);
});
