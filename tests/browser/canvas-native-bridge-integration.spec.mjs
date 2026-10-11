import { test, expect } from '@playwright/test';

async function setup(page, readOnly = false) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async ({ readOnly }) => {
        const version = window.canvasHarness.version;
        const [{ createNativeWireBridge }, { prepareNativeSearchCatalog }, { prepareNativeConnectionEdit }, tx] = await Promise.all([
            import('/src/ui/native-wire-bridge.js?v=' + version),
            import('/src/ui/native-search-catalog.js?v=' + version), import('/src/workflow/connection-edits.js?v=' + version), import('/src/workflow/transactions.js?v=' + version),
        ]);
        const root = { id: 'native-canvas-browser', schema: 3, runtime: 2, mode: 'native-pre', nodes: {
            source: { id: 'source', type: 'workflow', operation: 'scene-context', x: 30, y: 30 },
            first: { id: 'first', type: 'workflow', operation: 'smart-compactor', x: 350, y: 30 },
        }, wires: {}, groups: {}, portals: {}, definitions: {}, view: { x: 93, y: 47, zoom: .73 } };
        const draw = structuredClone(root), overlays = [], captures = new WeakMap();
        draw.nativeCards = Object.fromEntries(Object.values(draw.nodes).map(node => [node.id, {
            canonicalTitle: node.id, family: 'Shaping', iconPath: 'M1 1h2', body: 'cached', hostResult: false,
            ports: (node.id === 'source' ? ['out'] : ['in', 'out']).map(dir => ({ id: dir + ':' + dir, port: dir, dir, side: dir === 'in' ? 'left' : 'right', row: 1,
                kind: 'context', label: dir, className: 'pc-port pc-port-' + dir, title: dir + ': context' })),
        }]));
        const canvas = window.canvasHarness.canvas, host = canvas.host;
        host.style.cssText = 'position:fixed;left:30px;top:230px;width:1000px;height:500px;z-index:100000;background:#2b2b29';
        let bridge;
        canvas.hooks = { nativeBridge: () => bridge, nativeCard: node => draw.nativeCards[node.id],
            nativeScope: () => ({ workflowId: root.id, instancePath: [], readOnly }), canEdit: () => !readOnly,
            nativeAttachments: () => ({ originalBindings: [], jumps: [] }), onPresentationChange: ids => overlays.push(ids) };
        const context = { sessionId: 'native-canvas-browser', viewPath: [], readOnly };
        bridge = createNativeWireBridge({ catalog: prepareNativeSearchCatalog({ schema: 3, runtime: 2, mode: root.mode, workflowId: root.id, viewPath: [], inDefinition: false }).data,
            adapter: { capture() { const token = tx.captureGraphEditContext(root, () => context); if (!token.ok) return token; const capture = {}; captures.set(capture, token.data); return { ok: true, data: capture }; },
                isCurrent: capture => !readOnly && captures.has(capture), prepare: (capture, command) => prepareNativeConnectionEdit(root, { ...command, viewPath: [] }),
                commit: (capture, prepared) => tx.commitPreparedGraph(root, { ...prepared, context: captures.get(capture) }) },
            onUpdate: (view, requests) => canvas.updateNativeWire(view, requests) });
        canvas.setGraph(draw);
        window.nativeCanvasProbe = { canvas, host, bridge, root, draw, overlays };
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, { readOnly });
}
const pin = (page, node, direction) => page.locator(`.pc-canvas .pc-port[data-node="${node}"][data-dir="${direction}"]`);
async function center(locator) { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; }

test('real native pointer capture connects both directions at nonidentity zoom without mutating detached draw', async ({ page }) => {
    for (const reverse of [false, true]) {
        await setup(page);
        const origin = await center(pin(page, reverse ? 'first' : 'source', reverse ? 'in' : 'out'));
        const target = await center(pin(page, reverse ? 'source' : 'first', reverse ? 'out' : 'in'));
        await page.mouse.move(origin.x, origin.y); await page.mouse.down();
        await expect.poll(() => page.evaluate(() => window.nativeCanvasProbe.bridge.project().gesture.kind)).toBe('drag');
        expect(await page.evaluate(() => { const p = window.nativeCanvasProbe; return [...p.canvas.nativeCaptures].filter(id => p.host.hasPointerCapture(id)).length; })).toBe(1);
        await page.mouse.move(target.x, target.y, { steps: 4 }); await page.mouse.up();
        await expect.poll(() => page.evaluate(() => Object.keys(window.nativeCanvasProbe.root.wires).length)).toBe(1);
        const result = await page.evaluate(() => { const p = window.nativeCanvasProbe; return { wire: Object.values(p.root.wires)[0], drawWireCount: Object.keys(p.draw.wires).length, pending: p.canvas.hasContentGesture(), zoom: p.canvas.view.zoom }; });
        expect(result).toMatchObject({ wire: { route: 'wire', from: 'source', fromPort: 'out', to: 'first', toPort: 'in' }, drawWireCount: 0, pending: false, zoom: .73 });
        expect(await page.evaluate(() => window.nativeCanvasProbe.canvas.nativeCaptures.size)).toBe(0);
    }
});

test('native empty drop survives browser capture release then Escape cancels the search', async ({ page }) => {
    await setup(page);
    const origin = await center(pin(page, 'source', 'out'));
    await page.mouse.move(origin.x, origin.y); await page.mouse.down();
    await page.mouse.move(800, 550, { steps: 4 }); await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.nativeCanvasProbe.bridge.project().search?.mode)).toBe('nodes');
    expect(await page.evaluate(() => window.nativeCanvasProbe.canvas.hasContentGesture())).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.nativeCanvasProbe.canvas.hasContentGesture())).toBe(false);
    expect(await page.evaluate(() => Object.keys(window.nativeCanvasProbe.root.wires).length)).toBe(0);
});

test('readonly native cards allow local position overlays and MMB camera focus without document touches', async ({ page }) => {
    await setup(page, true);
    const card = page.locator('.pc-canvas .pc-node[data-id="source"] .pc-node-title');
    const at = await center(card);
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + 30, at.y + 20, { steps: 3 }); await page.mouse.up();
    expect(await page.evaluate(() => { const p = window.nativeCanvasProbe; return { overlays: p.overlays, rootX: p.root.nodes.source.x, drawX: p.draw.nodes.source.x, updated: p.draw.updatedAt }; })).toMatchObject({ overlays: [['source']], rootX: 30, drawX: 71, updated: undefined });
    await page.mouse.move(900, 650); await page.mouse.down({ button: 'middle' });
    expect(await page.evaluate(() => document.activeElement === window.nativeCanvasProbe.host)).toBe(true);
    await page.mouse.move(925, 675); await page.keyboard.press('Escape'); await page.mouse.up({ button: 'middle' });
    expect(await page.evaluate(() => window.nativeCanvasProbe.canvas.view)).toEqual({ x: 93, y: 47, zoom: .73 });
});

async function activateNestedWorkspace(page, arrange = false) {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const id = await page.evaluate(async arrange => {
        const h = window.canvasHarness, { nestedWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const root = nestedWorkflow(); root.name = 'Actual Canvas wrapper navigation';
        if (arrange) {
            for (const [node, x, y] of [['source', 30, 30], ['first/path', 420, 30], ['second', 420, 270], ['one', 810, 30], ['two', 810, 270]]) Object.assign(root.nodes[node], { x, y });
            root.view = { x: 25, y: 25, zoom: .8 };
        }
        await h.activate(root); return root.id;
    }, arrange);

    await page.evaluate(() => window.canvasHarness.settle());
    return id;
}

async function observePointerTargets(page) {
    await page.evaluate(() => {
        window.canvasPointerEvents = [];
        const host = window.canvasHarness.canvas.host;
        for (const type of ['pointerdown', 'gotpointercapture', 'pointerup', 'lostpointercapture', 'click', 'dblclick']) {
            document.addEventListener(type, event => window.canvasPointerEvents.push({ type, nodeId: event.target.closest?.('.pc-node')?.dataset.id ?? null,
                wireId: event.target.closest?.('.pc-wire-hit')?.dataset.id ?? null,
                targetIsHost: event.target === host, captured: typeof event.pointerId === 'number' && host.hasPointerCapture(event.pointerId) }), true);
        }
    });
}
async function wirePoint(page, id) {
    return page.locator(`.pc-canvas .pc-wire-hit[data-id="${id}"]`).evaluate(path => {
        const point = path.getPointAtLength(path.getTotalLength() * .55), matrix = path.getScreenCTM();
        return { x: point.x * matrix.a + point.y * matrix.c + matrix.e, y: point.x * matrix.b + point.y * matrix.d + matrix.f };
    });
}

for (const [part, target] of [['heading', '.pc-native-heading'], ['body', '.pc-native-pin-label']]) {
    test(`actual activated wrapper ${part} double click reaches the child tab through real event targets`, async ({ page }) => {
        const id = await activateNestedWorkspace(page);
        const before = await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), id);
        await observePointerTargets(page);
        await page.locator(`.pc-node-native[data-id="first/path"] ${target}`).first().dblclick();
        const events = await page.evaluate(() => window.canvasPointerEvents);
        expect(events.find(event => event.type === 'dblclick'), JSON.stringify(events)).toMatchObject({ nodeId: 'first/path', targetIsHost: false });
        expect(events.filter(event => event.type === 'gotpointercapture')).toEqual([]);
        await expect(page.locator('[role="tab"][aria-selected="true"]')).toContainText('Outer');
        await expect(page.locator('.pc-graph-location')).toContainText('Outer');
        expect(await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), id)).toBe(before);
    });
}

test('actual activated wire click selects the visible cable and Delete removes that saved wire only', async ({ page }) => {
    const id = await activateNestedWorkspace(page, true), point = await wirePoint(page, 'a');
    await observePointerTargets(page);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator('.pc-canvas .pc-wire[data-id="a"]')).toHaveClass(/pc-selected/);
    const events = await page.evaluate(() => window.canvasPointerEvents);
    expect(events.find(event => event.type === 'click'), JSON.stringify(events)).toMatchObject({ wireId: 'a', targetIsHost: false });
    await page.keyboard.press('Delete');
    await expect.poll(() => page.evaluate(id => Object.keys(window.canvasHarness.S.activeWorkflow().wires).sort(), id)).toEqual(['b', 'c', 'd']);
    await expect(page.locator('.pc-canvas .pc-wire-hit[data-id="a"]')).toHaveCount(0);
    expect(await page.evaluate(id => Object.values(window.canvasHarness.S.activeWorkflow().nodes).filter(node => node.operation === 'reroute').length, id)).toBe(0);
});

test('actual activated direct wire double click inserts a typed Reroute through the production controller', async ({ page }) => {
    const id = await activateNestedWorkspace(page, true), point = await wirePoint(page, 'a');
    await observePointerTargets(page);
    await page.mouse.dblclick(point.x, point.y);
    const events = await page.evaluate(() => window.canvasPointerEvents);
    expect(events.find(event => event.type === 'dblclick'), JSON.stringify(events)).toMatchObject({ wireId: 'a', targetIsHost: false });
    await expect.poll(() => page.evaluate(id => Object.values(window.canvasHarness.S.activeWorkflow().nodes).filter(node => node.operation === 'reroute').length, id)).toBe(1);
    const result = await page.evaluate(id => {
        const root = window.canvasHarness.S.activeWorkflow(), node = Object.values(root.nodes).find(node => node.operation === 'reroute');
        return { node, first: root.wires.a, second: Object.values(root.wires).find(wire => wire.from === node.id), count: Object.keys(root.wires).length };
    }, id);
    expect(result).toMatchObject({ node: { artifactKind: 'context', phase: 'pre', compact: true }, first: { from: 'source', fromPort: 'out', to: result.node.id, toPort: 'in' },
        second: { from: result.node.id, fromPort: 'out', to: 'first/path', toPort: 'scene' }, count: 5 });
    await expect(page.locator(`.pc-node-native[data-id="${result.node.id}"]`)).toHaveCount(1);
    expect(await page.evaluate(() => window.canvasHarness.canvas.hasContentGesture())).toBe(false);
});

test('actual activated wire Alt click breaks only its saved connection', async ({ page }) => {
    const id = await activateNestedWorkspace(page, true), point = await wirePoint(page, 'a');
    await page.keyboard.down('Alt'); await page.mouse.click(point.x, point.y); await page.keyboard.up('Alt');
    await expect.poll(() => page.evaluate(id => Object.keys(window.canvasHarness.S.activeWorkflow().wires).sort(), id)).toEqual(['b', 'c', 'd']);
    await expect(page.locator('.pc-canvas .pc-wire-hit[data-id="a"]')).toHaveCount(0);
    expect(await page.evaluate(id => Object.values(window.canvasHarness.S.activeWorkflow().nodes).filter(node => node.operation === 'reroute').length, id)).toBe(0);
    expect(await page.evaluate(() => window.canvasHarness.canvas.hasContentGesture())).toBe(false);
});

test('real native whole body drag keeps its threshold and finishes outside the host without generic capture', async ({ page }) => {
    await setup(page, true);
    const card = page.locator('.pc-canvas .pc-node[data-id="source"] .pc-native-pin-label').first(), at = await center(card);
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + 5, at.y + 2); await page.mouse.up();
    expect(await page.evaluate(() => { const p = window.nativeCanvasProbe; return { overlays: p.overlays, drawX: p.draw.nodes.source.x, drawY: p.draw.nodes.source.y, pending: p.canvas.hasContentGesture() }; })).toEqual({ overlays: [], drawX: 30, drawY: 30, pending: false });
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(1150, 800, { steps: 5 }); await page.mouse.up();
    expect(await page.evaluate(() => { const p = window.nativeCanvasProbe; return { overlays: p.overlays, rootX: p.root.nodes.source.x, changed: p.draw.nodes.source.x !== 30, pending: p.canvas.hasContentGesture() }; })).toEqual({ overlays: [['source']], rootX: 30, changed: true, pending: false });
});

test('real unexpected native pin capture loss cancels the bridge and a fresh pin drag can connect', async ({ page }) => {
    await setup(page);
    const origin = await center(pin(page, 'source', 'out')), target = await center(pin(page, 'first', 'in'));
    await observePointerTargets(page);
    await page.mouse.move(origin.x, origin.y); await page.mouse.down();
    await expect.poll(() => page.evaluate(() => window.nativeCanvasProbe.bridge.project().gesture.kind)).toBe('drag');
    await page.mouse.move(origin.x + 1, origin.y + 1);
    expect(await page.evaluate(() => window.canvasPointerEvents.some(event => event.type === 'gotpointercapture' && event.captured))).toBe(true);
    await page.evaluate(() => { const p = window.nativeCanvasProbe; p.host.releasePointerCapture([...p.canvas.nativeCaptures][0]); });
    await page.mouse.move(origin.x + 2, origin.y + 2);
    expect(await page.evaluate(() => window.canvasPointerEvents.some(event => event.type === 'lostpointercapture' && !event.captured))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.nativeCanvasProbe.canvas.hasContentGesture())).toBe(false);
    await page.mouse.up();
    expect(await page.evaluate(() => Object.keys(window.nativeCanvasProbe.root.wires).length)).toBe(0);
    await page.mouse.move(origin.x, origin.y); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 4 }); await page.mouse.up();
    await expect.poll(() => page.evaluate(() => Object.keys(window.nativeCanvasProbe.root.wires).length)).toBe(1);
    expect(await page.evaluate(() => window.nativeCanvasProbe.canvas.hasContentGesture())).toBe(false);
});
