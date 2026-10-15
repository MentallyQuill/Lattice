import { test, expect } from '@playwright/test';

async function setup(page, camera = { x: 0, y: 0, zoom: 1 }) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async camera => {
        const h = window.canvasHarness;
        const { canvasWorkflow } = await import('/tests/browser/native-fixture.mjs');
        const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const graph = canvasWorkflow(operationDefaults, 1);
        graph.id = 'shelf-placement'; graph.nodes = {}; graph.wires = {};
        await h.activate(graph); await h.view(camera);
    }, camera);
}

async function clickChoice(page, family, id, count = 1) {
    await page.locator(`.pc-family-row[data-family="${family}"]`).click();
    await page.locator(`[data-shelf-choice="${id}"]`).click();
    await expect(page.locator('.pc-node')).toHaveCount(count);
    await page.evaluate(() => window.canvasHarness.settle());
}

async function placement(page, selector = '.pc-node') {
    return page.locator(selector).evaluate(node => {
        const card = node.getBoundingClientRect(), h = window.canvasHarness;
        const area = h.canvas.host.getBoundingClientRect();
        const row = [...h.canvas.host.querySelectorAll('.pc-node-profile')].find(row => row.dataset.id === node.dataset.id);
        const decorations = [...node.querySelectorAll('.pc-native-alias,.pc-node-target,.pc-modifier-badge'),...(row?.querySelectorAll('.pc-node-decoration-stack,.profile-bar') ?? [])];
        const boxes = [card,...decorations.map(element => element.getBoundingClientRect()).filter(box => box.width && box.height)];
        const visual = {left:Math.min(...boxes.map(box=>box.left)),top:Math.min(...boxes.map(box=>box.top)),right:Math.max(...boxes.map(box=>box.right)),bottom:Math.max(...boxes.map(box=>box.bottom))};
        return { dx: card.left + card.width / 2 - (area.left + area.width / 2), dy: card.top + card.height / 2 - (area.top + area.height / 2), width: card.width, height: card.height, visual, visible:visual.left >= area.left && visual.top >= area.top && visual.right <= area.right && visual.bottom <= area.bottom, camera: { ...h.canvas.view } };
    });
}

test('a shelf click places a small card near the center with decoration space and an unchanged camera', async ({ page }) => {
    await setup(page);
    const before = await page.evaluate(() => ({ ...window.canvasHarness.canvas.view }));
    await clickChoice(page, 'Input', 'operation:scene-context');
    const result = await placement(page);
    expect(Math.abs(result.dx)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.dy)).toBeLessThanOrEqual(result.height / 2);
    expect(result.visible).toBe(true);
    expect(result.camera).toEqual(before);
});

test('a larger shelf card clears an occupied center after pan and zoom with one-step undo and redo', async ({ page }) => {
    await setup(page, { x: 371, y: -215, zoom: 0.65 });
    await clickChoice(page, 'Input', 'operation:scene-context');
    const before = await page.evaluate(() => ({ nodes: structuredClone(window.canvasHarness.graph.nodes), camera: { ...window.canvasHarness.canvas.view } }));
    const small = await placement(page);
    await clickChoice(page, 'Introspection', 'operation:reflect', 2);
    const after = await page.evaluate(() => ({ nodes: structuredClone(window.canvasHarness.graph.nodes), camera: { ...window.canvasHarness.canvas.view } }));
    const id = Object.keys(after.nodes).find(id => !Object.hasOwn(before.nodes, id));
    const result = await placement(page, `.pc-node[data-id="${id}"]`);
    expect(result.height).toBeGreaterThan(small.height);
    const gap = 24 * result.camera.zoom - 1;
    expect(result.visual.right + gap <= small.visual.left || small.visual.right + gap <= result.visual.left || result.visual.bottom + gap <= small.visual.top || small.visual.bottom + gap <= result.visual.top).toBe(true);
    expect(result.visible).toBe(true);
    expect(after.camera).toEqual(before.camera);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.pc-node')).toHaveCount(1);
    expect(await page.evaluate(() => window.canvasHarness.graph.nodes)).toEqual(before.nodes);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('.pc-node')).toHaveCount(2);
    expect(await page.evaluate(() => window.canvasHarness.graph.nodes)).toEqual(after.nodes);
    const restored = await placement(page, `.pc-node[data-id="${id}"]`);
    expect(restored.dx).toBeCloseTo(result.dx, 2);
    expect(restored.dy).toBeCloseTo(result.dy, 2);
    expect(restored.visual).toEqual(result.visual);
    expect(restored.camera).toEqual(before.camera);
});

test('a shelf click during pending zoom places a visible card against the settled camera', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await setup(page);
    await page.locator('.pc-family-row[data-family="Input"]').click();
    await expect(page.locator('[data-shelf-choice="operation:scene-context"]')).toBeVisible();
    await page.evaluate(() => {
        const canvas = window.canvasHarness.canvas, rect = canvas.host.getBoundingClientRect();
        canvas.zoomBy(2, rect.left + 70, rect.top + 70);
        // Trigger keyboard-style activation in the same frame as queued zoom.
        document.querySelector('[data-shelf-choice="operation:scene-context"]').click();
    });
    await expect(page.locator('.pc-node')).toHaveCount(1);
    const result = await placement(page);
    expect(Math.abs(result.dx)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.dy)).toBeLessThanOrEqual(result.height / 2);
    expect(result.visible).toBe(true);
    expect(result.camera).toEqual({ x: -70, y: -70, zoom: 2 });
});
