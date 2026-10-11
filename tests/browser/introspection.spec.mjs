import { test, expect } from '@playwright/test';
import { chooseControl, controlValue, openDetailGroup } from './details-helpers.mjs';

async function launch(page, phase = 'pre') {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async phase => {
        await window.canvasHarness.activate({ id: 'introspection-browser-' + phase, name: 'Introspection authoring', schema: 3, runtime: 2, mode: 'native-' + phase, roles: {}, nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {}, view: { x: 0, y: 0, zoom: 1 } });
    }, phase);
}
async function choose(page, operation) {
    await page.locator('[data-family="Introspection"]').click();
    await page.locator(`[data-shelf-choice="operation:${operation}"]`).click();
    const id = await page.evaluate(operation => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === operation).id, operation);
    await select(page, id); return id;
}
async function select(page, id) {
    await page.evaluate(async id => { const h = window.canvasHarness, node = h.graph.nodes[id]; await h.view({ x: 280 - node.x, y: 80 - node.y, zoom: 1 }); }, id);
    await page.locator(`.pc-node[data-id="${id}"] .pc-native-heading`).click();
}
async function connect(page, from, fromPort, to, toPort) {
    const origin = await page.locator(`.pc-port[data-node="${from}"][data-dir="out"][data-port="${fromPort}"]`).boundingBox();
    const target = await page.locator(`.pc-port[data-node="${to}"][data-dir="in"][data-port="${toPort}"]`).boundingBox();
    expect(origin).toBeTruthy(); expect(target).toBeTruthy();
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2); await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 4 }); await page.mouse.up();
}

for (const phase of ['pre', 'post']) test(`${phase} production picker and Details create Introspection nodes, update pins and round-trip typed connections`, async ({ page }) => {
    await launch(page, phase);
    await expect(page.locator('[data-family="Introspection"]')).toBeEnabled();
    const familyFit = await page.locator('[data-family="Introspection"]').evaluate(button => ({ buttonRight: button.getBoundingClientRect().right, labelRight: button.querySelector('span').getBoundingClientRect().right }));
    expect(familyFit.labelRight).toBeLessThanOrEqual(familyFit.buttonRight - 4);
    await page.locator('[data-family="Introspection"]').click();
    await expect(page.locator('.pc-family-menu [data-shelf-choice]')).toHaveCount(6);
    for (const operation of ['reflect', 'internalize', 'express', 'context', 'memory', 'state']) await expect(page.locator(`[data-shelf-choice="operation:${operation}"]`)).toBeVisible();
    await page.keyboard.press('Escape');
    const reflection = await choose(page, 'reflect');
    await expect.poll(() => controlValue(page, 'Mode')).toBe('character');
    await chooseControl(page, 'Mode', 'scene');
    await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].mode, reflection)).toBe('scene');
    const context = await choose(page, 'context');
    await expect(page.locator(`.pc-node[data-id="${context}"] .pc-port[data-dir="in"]`)).toHaveCount(2);
    await chooseControl(page, 'Mode', 'focus');
    await expect(page.getByLabel('Inputs', { exact: true })).toHaveCount(0);
    await expect.poll(() => controlValue(page, 'Method')).toBe('select');
    await expect(page.locator(`.pc-node[data-id="${context}"] .pc-port[data-dir="in"][data-port="context"]`)).toHaveAttribute('data-kind', 'context');
    await expect(page.locator(`.pc-node[data-id="${context}"] .pc-port[data-dir="in"]`)).toHaveCount(1);
    await openDetailGroup(page, 'Protections');
    await page.getByLabel('Pins', { exact: true }).fill('known fact\nprotected name'); await page.locator('[data-save-control="pins"]').click();
    await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].pins, context)).toEqual(['known fact', 'protected name']);
    const memory = await choose(page, 'memory');
    await expect.poll(() => controlValue(page, 'View')).toBe('state');
    await chooseControl(page, 'Mode', 'recall');
    await expect(page.getByLabel('View', { exact: true })).toHaveCount(0); await expect(page.getByLabel('Query', { exact: true })).toBeVisible();
    await page.getByLabel('Query', { exact: true }).fill('last promise'); await page.getByLabel('Query', { exact: true }).blur();
    await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].query, memory)).toBe('last promise');
    await expect(page.locator(`.pc-node[data-id="${memory}"] .pc-port[data-dir="out"][data-port="out"]`)).toHaveAttribute('data-kind', 'data');
    await page.evaluate(async ({ reflection, context, memory }) => {
        const h = window.canvasHarness, root = structuredClone(h.graph);
        Object.assign(root.nodes[memory], { x: 200, y: 80 }); Object.assign(root.nodes[context], { x: 200, y: 300 }); Object.assign(root.nodes[reflection], { x: 650, y: 100 });
        await h.activate(root); await h.view({ x: 0, y: 0, zoom: 0.8 });
    }, { reflection, context, memory });
    await connect(page, memory, 'out', reflection, 'context');
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.wires).length)).toBe(0);
    await expect(page.locator('.pc-root.pc-open')).toBeVisible();
    await connect(page, memory, 'out', reflection, 'state');
    await expect.poll(() => page.evaluate(() => Object.keys(window.canvasHarness.graph.wires).length)).toBe(1);
    await connect(page, context, 'out', reflection, 'context');
    await expect.poll(() => page.evaluate(() => Object.keys(window.canvasHarness.graph.wires).length)).toBe(2);
    const roundtrip = await page.evaluate(async () => {
        const h = window.canvasHarness, { exportWorkflow, parseWorkflow } = await import('/src/workflow/packages.js?v=' + h.version);
        const before = structuredClone(h.graph), parsed = parseWorkflow(JSON.stringify(exportWorkflow(before))); if (!parsed.ok) throw Error(parsed.error.message);
        await h.activate(parsed.data); return { before: Object.values(before.wires).map(edge => [edge.fromPort, edge.toPort]).sort(), after: Object.values(h.graph.wires).map(edge => [edge.fromPort, edge.toPort]).sort(), nodes: Object.values(h.graph.nodes).map(node => [node.operation, node.mode]), pins: Object.values(h.graph.nodes).find(node => node.operation === 'context').pins, query: Object.values(h.graph.nodes).find(node => node.operation === 'memory').query, providerCalls: h.providerCalls() };
    });
    expect(roundtrip.before).toEqual([['out', 'context'], ['out', 'state']]); expect(roundtrip.after).toEqual(roundtrip.before);
    expect(roundtrip.nodes).toEqual([['reflect', 'scene'], ['context', 'focus'], ['memory', 'recall']]); expect(roundtrip.providerCalls).toBe(0);
    expect(roundtrip.pins).toEqual(['known fact', 'protected name']); expect(roundtrip.query).toBe('last promise');
});

test('actual State Details saves fractional curve settings and JSON maps; post Memory Commit remains a terminal', async ({ page }) => {
    await launch(page, 'post');
    const state = await choose(page, 'state');
    await chooseControl(page, 'Mode', 'curve');
    await openDetailGroup(page, 'Bounds');
    await expect(page.getByLabel('Decay', { exact: true })).toHaveAttribute('step', '0.01');
    await expect(page.getByLabel('Baseline', { exact: true })).toHaveAttribute('step', 'any');
    await page.getByLabel('Decay', { exact: true }).fill('0.35'); await page.getByLabel('Decay', { exact: true }).blur();
    await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].decay, state)).toBe(0.35);
    await openDetailGroup(page, 'Phases');
    await page.getByRole('button', { name: 'Edit Phase durations as JSON', exact: true }).click();
    await page.getByLabel('Phase durations', { exact: true }).fill('{"onset":2,"peak":3}'); await page.locator('[data-save-control="durations"]').click();
    await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].durations, state)).toEqual({ onset: 2, peak: 3 });
    await chooseControl(page, 'Mode', 'value'); await expect(page.getByLabel('Phase durations', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit Values as JSON', exact: true }).click();
    await page.getByLabel('Values', { exact: true }).fill('{"confidence":0.6}'); await page.locator('[data-save-control="updates"]').click();
    await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].updates, state)).toEqual({ confidence: 0.6 });
    const memory = await choose(page, 'memory');
    await chooseControl(page, 'Mode', 'commit');
    await expect.poll(() => controlValue(page, 'Mode')).toBe('commit'); await expect(page.getByLabel('Commit key', { exact: true })).toHaveValue('lattice-memory-commit');
    await expect(page.locator(`.pc-node[data-id="${memory}"] .pc-port[data-dir="in"][data-port="proposal"]`)).toHaveAttribute('data-kind', 'data');
    await expect(page.locator(`.pc-node[data-id="${memory}"] .pc-port[data-dir="out"]`)).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
