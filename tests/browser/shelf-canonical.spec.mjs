import { test, expect } from '@playwright/test';
import { chooseControl, controlValue } from './details-helpers.mjs';

async function launch(page, phase) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async phase => {
        await window.canvasHarness.activate({ id: 'canonical-shelf-' + phase, name: 'Canonical shelf', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {}, view: { x: 0, y: 0, zoom: 1 } });
    }, phase);
}

async function choose(page, family, operation, phase) {
    const before = await page.evaluate(() => structuredClone(window.canvasHarness.graph.nodes));
    await page.locator(`[data-family="${family}"]`).click();
    await page.locator(`[data-shelf-choice="operation:${operation}"]`).click();
    if (operation === 'json-decode') {
        const dialog = page.getByRole('dialog', { name: 'Configure node', exact: true });
        await expect(dialog).toBeVisible();
        expect(await page.evaluate(() => window.canvasHarness.graph.nodes)).toEqual(before);
        await dialog.getByLabel('Node stage', { exact: true }).selectOption(phase);
        await dialog.getByRole('button', { name: 'Create node', exact: true }).click();
        await expect(dialog).toBeHidden();
    }
    await expect.poll(() => page.evaluate(operation => Object.values(window.canvasHarness.graph.nodes).filter(node => node.operation === operation).length, operation)).toBe(1);
    const id = await page.evaluate(operation => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === operation).id, operation);
    await page.evaluate(async id => {
        const h = window.canvasHarness, node = h.graph.nodes[id];
        await h.view({ x: 280 - node.x, y: 80 - node.y, zoom: 1 });
    }, id);
    await page.locator(`.pc-node[data-id="${id}"]`).click();
    if (['memory', 'json-decode'].includes(operation)) {
        await page.getByLabel('Workflow stage', { exact: true }).selectOption(phase);
        await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].phase, id)).toBe(phase);
    }
    return id;
}

test('flat family shelf exposes one canonical node and Details changes its mode and artifact kind in either phase', async ({ page }) => {
    for (const phase of ['pre', 'post']) {
        await launch(page, phase);
        await page.locator('[data-family="Introspection"]').click();
        const choices = page.locator('.pc-family-menu [data-shelf-choice]');
        await expect(choices).toHaveCount(6);
        expect(await choices.evaluateAll(rows => rows.map(row => row.dataset.shelfChoice))).toEqual([
            'operation:reflect', 'operation:internalize', 'operation:express', 'operation:context', 'operation:memory', 'operation:state',
        ]);
        await expect(page.locator('[data-subfamily]')).toHaveCount(0);
        await expect(page.locator('.pc-leaf-menu')).toHaveCount(0);
        await page.keyboard.press('Escape');

        await choose(page, 'Introspection', 'memory', phase);
        await expect(page.getByRole('radiogroup', { name: 'Mode', exact: true }).getByRole('radio', { name: 'commit', exact: true })).toHaveCount(phase === 'post' ? 1 : 0);

        await page.locator('[data-family="Derive"]').click();
        await expect(page.locator('[data-shelf-choice^="operation:json-decode"]')).toHaveCount(1);
        await page.keyboard.press('Escape');
        const json = await choose(page, 'Derive', 'json-decode', phase);
        await expect.poll(() => controlValue(page, 'Mode')).toBe('parse');
        await chooseControl(page, 'Mode', 'check');
        await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].mode, json)).toBe('check');
        await expect(page.locator(`.pc-node[data-id="${json}"] .pc-port[data-dir="in"][data-port="in"]`)).toHaveAttribute('data-kind', 'data');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect.poll(() => controlValue(page, 'Mode')).toBe('parse');
        await expect(page.locator(`.pc-node[data-id="${json}"] .pc-port[data-dir="in"][data-port="in"]`)).toHaveAttribute('data-kind', 'text');
        await page.getByRole('button', { name: 'Redo', exact: true }).click();
        await expect.poll(() => controlValue(page, 'Mode')).toBe('check');

        await page.locator('[data-family="Shaping"]').click();
        await expect(page.locator('[data-shelf-choice^="operation:reroute"]')).toHaveCount(1);
        await page.keyboard.press('Escape');
        const reroute = await choose(page, 'Shaping', 'reroute', phase);
        await chooseControl(page, 'Artifact kind', 'data');
        await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].artifactKind, reroute)).toBe('data');
        await expect(page.locator(`.pc-node[data-id="${reroute}"] .pc-port[data-dir="in"]`)).toHaveAttribute('data-kind', 'data');
        await expect(page.locator(`.pc-node[data-id="${reroute}"] .pc-port[data-dir="out"]`)).toHaveAttribute('data-kind', 'data');
        expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    }
});
