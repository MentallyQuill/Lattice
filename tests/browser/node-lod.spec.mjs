import { test, expect } from '@playwright/test';

async function openCanvas(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => window.canvasHarness.reset(3));
    await page.mouse.move(1400, 990);
}

test('overview hides small details with hysteresis while preserving card and wire geometry', async ({ page }) => {
    await openCanvas(page);
    const result = await page.evaluate(async () => {
        const { canvas, view } = window.canvasHarness;
        const node = canvas.nodeLayer.querySelector('.pc-node-native');
        const wire = canvas.svg.querySelector('.pc-wire'), path = wire.getAttribute('d');
        const label = node.querySelector('.pc-native-pin-label');
        const geometry = () => {
            const r = node.getBoundingClientRect(), zoom = canvas.view.zoom;
            return [r.width / zoom, r.height / zoom, ...[...node.querySelectorAll('.pc-port')].flatMap(port => {
                const p = port.getBoundingClientRect(); return [(p.x - r.x) / zoom, (p.y - r.y) / zoom];
            })];
        };
        const before = geometry(), visibility = [], shapes = [];
        for (const zoom of [.5, .49, .55, .59, .6, .55, .25]) {
            await view({ zoom }); visibility.push(getComputedStyle(label).visibility); shapes.push(geometry());
        }
        return { before, shapes, visibility, sameNode: canvas.nodeLayer.contains(node), sameWire: canvas.svg.contains(wire), path, afterPath: wire.getAttribute('d') };
    });
    expect(result.visibility).toEqual(['visible', 'hidden', 'hidden', 'hidden', 'visible', 'visible', 'hidden']);
    for (const shape of result.shapes) shape.forEach((value, i) => expect(value).toBeCloseTo(result.before[i], 3));
    expect(result.sameNode).toBe(true); expect(result.sameWire).toBe(true); expect(result.afterPath).toBe(result.path);
});

test('hover and node selection reveal details without changing the overview camera', async ({ page }) => {
    await openCanvas(page);
    await page.evaluate(() => window.canvasHarness.view({ zoom: .25 }));
    const node = page.locator('.pc-node-native[data-id="n0"]'), label = node.locator('.pc-native-pin-label').first();
    await expect(label).toHaveCSS('visibility', 'hidden');
    await node.hover(); await expect(label).toHaveCSS('visibility', 'visible');
    await page.mouse.move(1400, 990); await expect(label).toHaveCSS('visibility', 'hidden');
    await page.evaluate(() => window.canvasHarness.canvas.select({ kind: 'node', id: 'n0' }));
    await expect(label).toHaveCSS('visibility', 'visible');
    await expect(page.locator('.pc-node-native[data-id="n1"] .pc-native-pin-label').first()).toHaveCSS('visibility', 'hidden');
    await page.evaluate(() => window.canvasHarness.canvas.setMulti(['n1', 'n2']));
    await expect(page.locator('.pc-node-native[data-id="n1"] .pc-native-pin-label').first()).toHaveCSS('visibility', 'visible');
    expect(await page.evaluate(() => window.canvasHarness.canvas.view.zoom)).toBe(.25);
});

test('keyboard users can focus an overview card to reveal its details', async ({ page }) => {
    await openCanvas(page);
    await page.evaluate(() => window.canvasHarness.view({ zoom: .25 }));
    const node = page.locator('.pc-node-native[data-id="n0"]'), label = node.locator('.pc-native-pin-label').first();
    await expect(label).toHaveCSS('visibility', 'hidden');
    // Start immediately before the card in document tab order, then use a real Tab.
    await page.evaluate(() => {
        const anchor = document.createElement('button'); anchor.textContent = 'Before nodes';
        window.canvasHarness.canvas.nodeLayer.prepend(anchor); anchor.focus();
    });
    await page.keyboard.press('Tab'); await expect(node).toBeFocused();
    await expect(label).toHaveCSS('visibility', 'visible');
    await page.getByRole('button', { name: 'File', exact: true }).focus();
    await expect(label).toHaveCSS('visibility', 'hidden');
});

test('a newly admitted graph does not inherit the previous graph overview hysteresis', async ({ page }) => {
    await openCanvas(page);
    const visibility = await page.evaluate(async () => {
        const { canvas, view, settle } = window.canvasHarness;
        await view({ zoom: .25 });
        const graph = structuredClone(canvas.graph); graph.id = 'another-graph'; graph.view.zoom = .55;
        canvas.setGraph(graph); await settle();
        return getComputedStyle(canvas.nodeLayer.querySelector('.pc-native-pin-label')).visibility;
    });
    expect(visibility).toBe('visible');
});

test('overview retains running and failed execution rings while simplifying idle card shadows', async ({ page }) => {
    await openCanvas(page);
    const states = await page.evaluate(async () => {
        const { canvas, view, settle } = window.canvasHarness;
        canvas.setTrace([{ id: 'n0', status: 'running' }, { id: 'n1', status: 'failed' }]); await settle();
        const nodes = ['n0', 'n1', 'n2'].map(id => canvas.nodeLayer.querySelector(`[data-id="${id}"]`));
        const before = nodes.map(node => getComputedStyle(node).boxShadow);
        await view({ zoom: .25 });
        return { before, after: nodes.map(node => getComputedStyle(node).boxShadow) };
    });
    expect(states.after[0]).toBe(states.before[0]); expect(states.after[1]).toBe(states.before[1]);
    expect(states.after[0]).not.toBe('none'); expect(states.after[1]).not.toBe('none'); expect(states.after[2]).toBe('none');
});

test('animated wheel zoom changes detail with the displayed scale without remeasuring or rebuilding', async ({ page }) => {
    await openCanvas(page);
    const result = await page.evaluate(async () => {
        const { canvas, view } = window.canvasHarness; await view({ zoom: .62 });
        const node = canvas.nodeLayer.querySelector('.pc-node-native'), wire = canvas.svg.querySelector('.pc-wire');
        const path = wire.getAttribute('d'), label = node.querySelector('.pc-native-pin-label');
        let measures = 0, transitions = 0;
        const measure = canvas.geometry.measure.bind(canvas.geometry);
        canvas.geometry.measure = (...args) => { measures++; return measure(...args); };
        const observer = new MutationObserver(records => transitions += records.length);
        observer.observe(canvas.host, { attributes: true, attributeFilter: ['data-pc-detail'] });
        const samples = [];
        const rect = canvas.host.getBoundingClientRect();
        const wheel = async deltaY => {
            canvas.host.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: rect.left + 200, clientY: rect.top + 200, cancelable: true }));
            do {
                await new Promise(resolve => requestAnimationFrame(resolve));
                samples.push({ zoom: canvas.view.zoom, visibility: getComputedStyle(label).visibility });
            } while (canvas.host.classList.contains('pc-interacting'));
        };
        try { await wheel(200); await wheel(-200); }
        finally { observer.disconnect(); canvas.geometry.measure = measure; }
        return { samples, transitions, measures, sameNode: canvas.nodeLayer.contains(node), sameWire: canvas.svg.contains(wire), samePath: path === wire.getAttribute('d') };
    });
    expect(result.samples[0].visibility).toBe('visible');
    expect(result.samples.some(sample => sample.visibility === 'hidden')).toBe(true);
    expect(result.samples.at(-1).visibility).toBe('visible');
    for (const sample of result.samples) {
        if (sample.zoom < .5) expect(sample.visibility).toBe('hidden');
        if (sample.zoom >= .6) expect(sample.visibility).toBe('visible');
    }
    expect(result).toMatchObject({ transitions: 2, measures: 0, sameNode: true, sameWire: true, samePath: true });
});

test('refreshing the same workflow retains its overview level inside the hysteresis band', async ({ page }) => {
    await openCanvas(page);
    const visibility = await page.evaluate(async () => {
        const { canvas, view, settle } = window.canvasHarness;
        await view({ zoom: .25 }); await view({ zoom: .55 });
        canvas.setGraph(structuredClone(canvas.graph)); await settle();
        return getComputedStyle(canvas.nodeLayer.querySelector('.pc-native-pin-label')).visibility;
    });
    expect(visibility).toBe('hidden');
});

test('overview keeps compact identity, groups, comments and keyboard access to result controls', async ({ page }) => {
    await openCanvas(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + h.version);
        const graph = starterGraph('native-guidance'); graph.id = 'lod-mixed';
        graph.nodes['scene-context'].presentation = { compact: true, alias: 'Scene source' };
        const member = graph.nodes['smart-compactor']; member.inGroup = 'group';
        graph.groups.group = { id: 'group', title: 'Group', collapsed: true, members: [member.id], x: member.x, y: member.y, w: 260 };
        graph.nodes.note = { id: 'note', type: 'note', commentFrame: true, title: 'Comment', content: 'Graph explanation', x: 50, y: 400, w: 400, h: 200 };
        graph.nodes.ordinary = { id: 'ordinary', type: 'note', title: 'Note', content: 'Long note details', x: 500, y: 400 };
        await h.activate(graph); await h.view({ zoom: .25 });
    });
    const compact = page.locator('.pc-node-native[data-id="scene-context"]');
    await expect(compact.locator('.pc-native-icon')).toHaveCSS('visibility', 'visible');
    await expect(compact.locator('.pc-native-alias')).toHaveCSS('visibility', 'visible');
    await expect(page.getByRole('button', { name: 'Open group', exact: true })).toHaveCSS('visibility', 'visible');
    await expect(page.locator('.pc-comment-notes')).toHaveCSS('visibility', 'visible');
    await expect(page.locator('.pc-node-native[data-id="ordinary"] .pc-node-body')).toHaveCSS('visibility', 'hidden');
    const terminal = page.locator('.pc-node-native[data-id="guidance"]'), button = terminal.locator('.pc-host-result');
    await expect(button).toHaveCSS('visibility', 'hidden');
    await terminal.focus(); await expect(button).toHaveCSS('visibility', 'visible');
    await page.keyboard.press('Tab'); await expect(button).toBeFocused();
    await expect(button).toHaveCSS('visibility', 'visible');
    await expect(page.locator('.pc-wire-label').first()).toHaveCSS('visibility', 'visible');
});

test('switching library definitions resets detail even when both drawings have no graph id', async ({ page }) => {
    await openCanvas(page);
    const keys = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { nestedWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const root = nestedWorkflow(); root.name = 'LOD library fixture';
        h.S.settings().subgraphLibrary = { definitions: structuredClone(root.definitions) };
        await h.activate(root); return Object.keys(root.definitions);
    });
    const openLibrary = async key => {
        await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
        await page.locator('[data-shelf-choice=' + JSON.stringify('definition:' + key) + ']').click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Open saved definition', exact: true }).click();
        await page.mouse.move(1400, 990);
    };
    await openLibrary(keys[0]); await page.evaluate(() => window.canvasHarness.view({ zoom: .55 }));
    await openLibrary(keys[1]); await page.evaluate(() => window.canvasHarness.view({ zoom: .25 }));
    await openLibrary(keys[0]);
    expect(await page.evaluate(() => window.canvasHarness.canvas.view.zoom)).toBe(.55);
    await expect(page.locator('.pc-native-pin-label').first()).toHaveCSS('visibility', 'visible');
});

test('focusing an offscreen card keeps camera coordinates aligned with its rendered position', async ({ page }) => {
    await openCanvas(page);
    await page.evaluate(() => window.canvasHarness.reset(100, 10));
    const result = await page.evaluate(async () => {
        const { canvas, settle } = window.canvasHarness;
        canvas.nodeLayer.querySelector('[data-id="n99"]').focus(); await settle();
        const card = canvas.nodeLayer.querySelector('[data-id="n99"]'), r = card.getBoundingClientRect();
        const actual = canvas.toGraph(r.left, r.top), node = canvas.graph.nodes.n99;
        return { actual, expected: { x: node.x, y: node.y }, scrollX: canvas.host.scrollLeft, scrollY: canvas.host.scrollTop };
    });
    expect(result.actual.x).toBeCloseTo(result.expected.x, 3); expect(result.actual.y).toBeCloseTo(result.expected.y, 3);
    expect(result.scrollX).toBe(0); expect(result.scrollY).toBe(0);
});
