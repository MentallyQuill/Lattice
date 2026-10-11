import { setCompact } from './details-helpers.mjs';
import { test, expect } from '@playwright/test';
async function activateNative(page, variant = 'standard') {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const id = await page.evaluate(async variant => {
        const h = window.canvasHarness, version = h.version;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + version);
        const graph = starterGraph('native-guidance'); graph.id = 'rendering-native-' + variant; graph.name = 'Native rendering ' + variant;
        if (variant === 'group') {
            const member = graph.nodes['smart-compactor']; member.inGroup = 'group';
            graph.groups.group = { id: 'group', title: 'Group', collapsed: true, members: [member.id], x: member.x, y: member.y, w: 260 };
            graph.nodes['scene-context'].presentation = { compact: true, alias: 'Source' };
        } else if (variant === 'mixed') {
            const belowShelf = document.querySelector('.pc-node-shelf').getBoundingClientRect().height / .85 + 30;
            Object.assign(graph.nodes['scene-context'], { x: 30, y: belowShelf, presentation: { compact: true, alias: 'Scene' } });
            Object.assign(graph.nodes['smart-compactor'], { x: 155, y: belowShelf, presentation: { alias: 'Keep the scene clear' } });
            Object.assign(graph.nodes['response-plan'], { x: 30, y: belowShelf + 100, presentation: { compact: true, alias: 'Plan' } });
            Object.assign(graph.nodes.guidance, { x: 195, y: belowShelf + 100 });
        }
        await h.activate(graph); return graph.id;
    }, variant);

    expect(await page.evaluate(id => { const h = window.canvasHarness; return h.graph === h.S.activeWorkflow() && h.canvas.graph !== h.graph && h.canvas.graph.id === id && !!h.canvas.graph.nativeCards; }, id)).toBe(true);
    for (const name of ['Toggle inspector']) {
        const toggle = page.getByRole('button', { name, exact: true }); if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click();
    }
    await page.evaluate(() => window.canvasHarness.settle()); return id;
}
test('native wires meet real left input and right output pins at nonidentity zoom', async ({ page }) => {
    await activateNative(page);
    await page.evaluate(() => window.canvasHarness.view({ x: 93, y: 47, zoom: .73 }));
    const geometry = await page.evaluate(() => {
        const { canvas } = window.canvasHarness, wire = canvas.graph.wires['wire-1'];
        const path = canvas.svg.querySelector(`.pc-wire[data-id="${wire.id}"]`);
        const pin = (id, dir, port) => {
            const card = canvas.nodeLayer.querySelector(`.pc-node-native[data-id="${id}"]`);
            const target = card.querySelector(`.pc-port[data-dir="${dir}"][data-port="${port}"]`);
            const box = card.getBoundingClientRect(), dot = target.getBoundingClientRect();
            return { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        };
        const screenPoint = length => { const point = path.getPointAtLength(length), screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()); return { x: screen.x, y: screen.y }; };
        return { input: pin(wire.to, 'in', wire.toPort), output: pin(wire.from, 'out', wire.fromPort), start: screenPoint(0), end: screenPoint(path.getTotalLength()), zoom: canvas.view.zoom };
    });
    expect(geometry.zoom).toBe(.73);
    const { input, output, start, end } = geometry;
    // All tolerances are screen pixels, including SVG points transformed by their actual matrix.
    expect.soft(Math.abs(input.x - input.left - 12 * geometry.zoom), 'native input sits inside the left edge, matching the approved proposal').toBeLessThanOrEqual(1);
    expect.soft(Math.abs(output.right - output.x - 12 * geometry.zoom), 'native output sits inside the right edge, matching the approved proposal').toBeLessThanOrEqual(1);
    expect.soft(input.y, 'input pin is inside the vertical card extent').toBeGreaterThan(input.top + 2);
    expect.soft(output.y, 'output pin is inside the vertical card extent').toBeLessThan(output.bottom - 2);
    expect.soft(Math.hypot(start.x - output.x, start.y - output.y), 'wire starts at the actual output pin center').toBeLessThanOrEqual(1);
    expect.soft(Math.hypot(end.x - input.x, end.y - input.y), 'wire ends at the actual input pin center').toBeLessThanOrEqual(1);
});
async function setup(page) {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    return page.evaluate(() => window.canvasHarness.reset(25, 5));
}
test('mixed native cards stay intrinsic and usable beneath the shelf at narrow widths', async ({ page }, testInfo) => {
    for (const width of [1024, 736, 360, 320]) {
        await page.setViewportSize({ width, height: 1000 }); await activateNative(page, 'mixed');
        const collapse = page.getByRole('button', { name: 'Collapse preview', exact: true });
        if (await collapse.isVisible()) await collapse.click();
        await page.evaluate(() => window.canvasHarness.view({ x: 0, y: 0, zoom: .85 }));
        const geometry = await page.evaluate(() => {
            const h = window.canvasHarness, card = h.canvas.nodeLayer.querySelector('[data-id="scene-context"]'), box = card.getBoundingClientRect();
            return { compact: h.canvas.widthOf(h.graph.nodes['scene-context']), normal: h.canvas.widthOf(h.graph.nodes['smart-compactor']), belowShelf: !!document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[data-id="scene-context"]'), overflow: document.documentElement.scrollWidth > innerWidth };
        });
        await page.screenshot({ path: testInfo.outputPath(`native-cards-${width}.png`) });
        expect(geometry.compact).toBeLessThan(geometry.normal); expect(geometry.normal).toBeLessThan(260);
        expect(geometry).toMatchObject({ belowShelf: true, overflow: false });
    }
});
test('native intrinsic geometry grows group frames and stays cached during camera frames', async ({ page }) => {
    await activateNative(page, 'group');
    await page.getByRole('group', { name: 'Group: Group', exact: true }).getByRole('button', { name: 'Open group', exact: true }).click();
    await page.evaluate(async () => {
        const h = window.canvasHarness; await h.view({ x: 180, y: 20, zoom: .73 });
        const { graphSemanticSignature } = await import('/src/workflow/ports.js?v=' + h.version);
        const card = h.canvas.nodeLayer.querySelector('[data-id="smart-compactor"]'), frame = h.canvas.nodeLayer.querySelector('[data-group="group"]');
        window.intrinsicProbe = { card, frame, frameWidth: frame.getBoundingClientRect().width / h.canvas.view.zoom, path: h.canvas.svg.querySelector('[data-id="wire-1"].pc-wire'), rootBytes: JSON.stringify(h.graph), groups: JSON.stringify(h.graph.groups), history: JSON.stringify(h.H.peek(h.graph)), signature: graphSemanticSignature(h.graph), signatureOf: graphSemanticSignature };
        card.style.minWidth = '350px';
    });
    await expect.poll(() => page.evaluate(() => window.intrinsicProbe.frame.getBoundingClientRect().width / window.canvasHarness.canvas.view.zoom)).toBeGreaterThan(await page.evaluate(() => window.intrinsicProbe.frameWidth));
    const result = await page.evaluate(async () => {
        const h = window.canvasHarness, p = window.intrinsicProbe; await h.settle();
        const cardBox = p.card.getBoundingClientRect(), frameBox = p.frame.getBoundingClientRect(), zoom = h.canvas.view.zoom;
        const cached = h.canvas.widthOf(h.graph.nodes['smart-compactor']), rect = h.canvas.host.getBoundingClientRect(), d = p.path.getAttribute('d');
        const original = Element.prototype.getBoundingClientRect; let reads = 0;
        Element.prototype.getBoundingClientRect = function () { if (this.matches('.pc-node, .pc-port')) reads++; return original.call(this); };
        for (let i = 0; i < 12; i++) h.canvas.host.dispatchEvent(new WheelEvent('wheel', { deltaY: -2, clientX: rect.left + 400, clientY: rect.top + 150, cancelable: true }));
        await h.settle(); Element.prototype.getBoundingClientRect = original;
        const dot = p.card.querySelector('.pc-port-in').getBoundingClientRect(), end = p.path.getPointAtLength(p.path.getTotalLength()), screen = new DOMPoint(end.x, end.y).matrixTransform(p.path.getScreenCTM());
        return { cached, measured: cardBox.width / zoom, reads, sameCard: h.canvas.nodeLayer.contains(p.card), sameFrame: h.canvas.nodeLayer.contains(p.frame), samePath: d === p.path.getAttribute('d'), endpointError: Math.hypot(screen.x - dot.x - dot.width / 2, screen.y - dot.y - dot.height / 2), compactWidth: h.canvas.widthOf(h.graph.nodes['scene-context']), encloses: frameBox.left < cardBox.left && frameBox.top < cardBox.top && frameBox.right > cardBox.right && frameBox.bottom > cardBox.bottom, unchanged: JSON.stringify(h.graph) === p.rootBytes && JSON.stringify(h.graph.groups) === p.groups && JSON.stringify(h.H.peek(h.graph)) === p.history && p.signatureOf(h.graph) === p.signature, savedFrameAbsent: !Object.hasOwn(h.graph.groups.group, 'frame') };
    });
    expect(result.cached).toBeCloseTo(result.measured, 2); expect(result.compactWidth).toBeLessThan(160);
    expect(result).toMatchObject({ reads: 0, sameCard: true, sameFrame: true, samePath: true, encloses: true, unchanged: true, savedFrameAbsent: true });
    expect(result.endpointError).toBeLessThanOrEqual(1);
    await page.evaluate(() => { const h = window.canvasHarness; h.canvas.select({ kind: 'group', id: 'group' }); h.canvas.fitSelection(); });
    const fit = await page.evaluate(() => {
        const h = window.canvasHarness, p = window.intrinsicProbe, frame = p.frame.getBoundingClientRect(), host = h.canvas.host.getBoundingClientRect();
        return { visible: frame.left >= host.left && frame.right <= host.right && frame.top >= host.top && frame.bottom <= host.bottom, unchanged: JSON.stringify(h.graph) === p.rootBytes && JSON.stringify(h.graph.groups) === p.groups && JSON.stringify(h.H.peek(h.graph)) === p.history && p.signatureOf(h.graph) === p.signature };
    });
    expect(fit).toEqual({ visible: true, unchanged: true });
    await page.evaluate(() => window.canvasHarness.canvas.fit());
    expect(await page.evaluate(() => { const h = window.canvasHarness, p = window.intrinsicProbe, frame = p.frame.getBoundingClientRect(), host = h.canvas.host.getBoundingClientRect(); return { visible: frame.left >= host.left && frame.right <= host.right && frame.top >= host.top && frame.bottom <= host.bottom, unchanged: JSON.stringify(h.graph) === p.rootBytes && JSON.stringify(h.graph.groups) === p.groups && JSON.stringify(h.H.peek(h.graph)) === p.history && p.signatureOf(h.graph) === p.signature }; })).toEqual({ visible: true, unchanged: true });
});
test('native pin hover highlights only attached wires and body drops cancel linking', async ({ page }) => {
    await activateNative(page);
    await page.evaluate(() => window.canvasHarness.view({ x: 220, y: 0, zoom: .7 }));
    const card = page.locator('.pc-node-native[data-id="smart-compactor"]'), pin = card.locator('.pc-port-in[data-port="in"]');
    await card.locator('.pc-native-heading').hover(); await expect(page.locator('.pc-wire-feeds')).toHaveCount(0);
    await pin.hover(); await expect(page.locator('.pc-wire-feeds')).toHaveCount(1); await expect(page.locator('.pc-wire-feeds')).toHaveAttribute('data-id', 'wire-1');
    await page.evaluate(() => { const h = window.canvasHarness; delete h.graph.wires['wire-1']; h.S.touchGraph(h.graph); h.UI.refreshIfOpen(); });
    const output = await page.locator('.pc-node-native[data-id="scene-context"] .pc-port-out[data-port="out"]').boundingBox(), body = await card.locator('.pc-native-heading').boundingBox();
    await page.mouse.move(output.x + output.width / 2, output.y + output.height / 2); await page.mouse.down();
    await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2); await page.mouse.up();
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.wires).length)).toBe(2); await expect(page.locator('.pc-wire-ghost')).toHaveCount(0);
    const input = await pin.boundingBox();
    await page.mouse.move(output.x + output.width / 2, output.y + output.height / 2); await page.mouse.down();
    await page.mouse.move(input.x + input.width / 2, input.y + input.height / 2); await page.mouse.up();
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.wires).length)).toBe(3);
});
test('native compact aliases preserve identity, real pins and the execution signature', async ({ page }) => {
    await activateNative(page);
    await page.evaluate(() => window.canvasHarness.view({ x: 120, y: 20, zoom: .65 }));
    await page.locator('.pc-node-native[data-id="smart-compactor"] .pc-native-heading').click();
    const inspector = page.getByRole('button', { name: 'Toggle inspector', exact: true });
    if (await inspector.getAttribute('aria-pressed') !== 'true') await inspector.click();
    const id = await page.evaluate(async () => {
        const h = window.canvasHarness, node = Object.values(h.graph.nodes).find(n => n.operation === 'smart-compactor');
        const { graphSemanticSignature } = await import('/src/workflow/ports.js?v=' + h.version);
        window.compactProbe = { card: h.canvas.nodeLayer.querySelector(`[data-id="${node.id}"]`), signature: graphSemanticSignature(h.graph), signatureOf: graphSemanticSignature, title: node.title };
        window.compactProbe.port = window.compactProbe.card.querySelector('.pc-port-in'); window.compactProbe.draw = h.canvas.graph; return node.id;
    });
    const alias = page.getByLabel('Node name', { exact: true }); await expect(alias).toHaveAttribute('maxlength', '80');
    await alias.fill('<img src=x onerror=alert(1)> Quiet'); await alias.press('Tab');
    await expect(page.locator(`.pc-node-native[data-id="${id}"] .pc-node-title`)).toHaveText('<img src=x onerror=alert(1)> Quiet');
    await setCompact(page, true);
    const card = page.locator(`.pc-node-native[data-id="${id}"]`); await expect(card).toHaveClass(/pc-node-compact/);
    await expect(card.locator('.pc-native-alias')).toHaveText('<img src=x onerror=alert(1)> Quiet'); await expect(card.locator('img')).toHaveCount(0);
    await expect(page.getByText('Canonical type: Smart Compactor', { exact: true })).toBeVisible();
    expect(await page.evaluate(id => { const h = window.canvasHarness, p = window.compactProbe; return { sameCard: h.canvas.nodeLayer.contains(p.card), samePin: p.card.contains(p.port), signature: p.signatureOf(h.graph) === p.signature, title: h.graph.nodes[id].title === p.title }; }, id)).toEqual({ sameCard: true, samePin: true, signature: true, title: true });
    await alias.fill('Smart Compactor'); await alias.press('Tab'); await expect(alias).toHaveValue('Smart Compactor'); await expect(card.locator('.pc-native-alias')).toHaveText('Smart Compactor');
    await card.locator('.pc-native-alias').click(); await page.keyboard.press('F2'); await expect(alias).toBeFocused();
    expect(await page.evaluate(() => window.compactProbe.draw === window.canvasHarness.canvas.graph)).toBe(true);
    await expect(page.locator('.pc-node-native[data-id="scene-context"] .pc-port-in')).toHaveCount(0);
    await expect(page.locator('.pc-node-native[data-id="guidance"] .pc-port-out')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Preview host result', exact: true })).toBeVisible();
});
test('multi-drag keeps card and wire elements and reads no card heights', async ({ page }) => {
    const ids = await setup(page);
    await page.evaluate(ids => {
        const { canvas } = window.canvasHarness; canvas.setMulti(ids.slice(0, 3));
        window.renderProbe = { card: canvas.nodeLayer.querySelector(`[data-id="${ids[0]}"]`), wire: canvas.svg.querySelector('.pc-wire'), reads: 0 };
        const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
        window.renderProbe.descriptor = descriptor;
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { if (this.matches('.pc-node')) window.renderProbe.reads++; return descriptor.get.call(this); } });
    }, ids);
    const r = await page.locator(`.pc-node[data-id="${ids[0]}"]`).boundingBox();
    await page.mouse.move(r.x + 100, r.y + 40); await page.mouse.down(); await page.mouse.move(r.x + 140, r.y + 80, { steps: 5 });
    await page.evaluate(() => window.canvasHarness.settle());
    const result = await page.evaluate(() => {
        const { canvas } = window.canvasHarness; const p = window.renderProbe;
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', p.descriptor);
        return { card: canvas.nodeLayer.contains(p.card), wire: canvas.svg.contains(p.wire), reads: p.reads };
    });
    expect(result).toEqual({ card: true, wire: true, reads: 0 });
    await page.mouse.up();
});
test('ResizeObserver refreshes wire endpoints after a card grows', async ({ page }) => {
    const ids = await setup(page);
    const before = await page.evaluate(id => {
        const { canvas } = window.canvasHarness;
        const wire = Object.values(canvas.graph.wires).find(wire => wire.from === id);
        const path = canvas.svg.querySelector(`.pc-wire[data-id="${wire.id}"]`);
        const node = canvas.nodeLayer.querySelector(`[data-id="${id}"]`);
        window.resizeProbe = { path, d: path.getAttribute('d') };
        node.querySelector('.pc-native-heading').style.minHeight = '220px'; return window.resizeProbe.d;
    }, ids[0]);
    await expect.poll(() => page.evaluate(() => window.resizeProbe.path.getAttribute('d'))).not.toBe(before);
    expect(await page.evaluate(() => window.canvasHarness.canvas.svg.contains(window.resizeProbe.path))).toBe(true);
});
test('graph projections and selection updates preserve mounted cards and ports', async ({ page }) => {
    const ids = await setup(page);
    const result = await page.evaluate(async id => {
        const { canvas, graph } = window.canvasHarness;
        const card = canvas.nodeLayer.querySelector(`[data-id="${id}"]`), port = card.querySelector('.pc-port-out');
        graph.nodes[id].title = 'Edited title'; window.canvasHarness.S.touchGraph(graph); window.canvasHarness.UI.refreshIfOpen(); await window.canvasHarness.settle();
        canvas.select({ kind: 'node', id });
        return { card: canvas.nodeLayer.contains(card), port: card.contains(port), title: card.querySelector('.pc-node-title').textContent };
    }, ids[0]);
    expect(result).toEqual({ card: true, port: true, title: 'Edited title' });
});
