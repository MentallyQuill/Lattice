import {UNIFIED_WORKFLOW_EXAMPLE_DATA} from '../../src/workflow/unified-example-data.js';
const exampleCount=30+UNIFIED_WORKFLOW_EXAMPLE_DATA.length, lastExampleTitle=UNIFIED_WORKFLOW_EXAMPLE_DATA.at(-1).title;
import { test, expect } from '@playwright/test';

async function load(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
}
async function finishExampleChoice(page) {
    const guard = page.getByRole('dialog', { name: 'Save workflow changes?', exact: true }), examples = page.getByRole('dialog', { name: 'Examples', exact: true });
    await expect.poll(async () => await guard.isVisible() || !await examples.isVisible()).toBe(true);
    if (await guard.isVisible()) await guard.getByRole('button', { name: "Don't Save", exact: true }).click();
}
async function openExamples(page, menu = 'File') {
    await page.getByRole('button', { name: menu, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click();
    return page.getByRole('dialog', { name: 'Examples', exact: true });
}

test('File examples follows Open workflow and Recent and opens the compact complete example picker', async ({ page }, testInfo) => {
    await load(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    const items = await page.getByRole('menu', { name: 'File', exact: true }).getByRole('menuitem').allTextContents();
    expect(items.findIndex(item => item.includes('Open examples…'))).toBeGreaterThan(items.findIndex(item => item.includes('Open workflow…')));
    await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Examples', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.pc-example-tile')).toHaveCount(exampleCount);
    await expect(dialog.locator('.pc-example-tile').first()).toHaveAccessibleName('Make a scene brief');
    await expect(dialog.locator('.pc-example-tile').last()).toHaveAccessibleName(lastExampleTitle);
    const box = await dialog.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(550);
    expect(box.width).toBeLessThanOrEqual(570);
    expect(box.height).toBeGreaterThanOrEqual(420);
    expect(box.height).toBeLessThanOrEqual(440);
    const previews = dialog.locator('.pc-example-preview');
    await expect(previews).toHaveCount(exampleCount);
    expect(await previews.first().evaluate(element => element.getBoundingClientRect().height)).toBe(72);
    expect(await dialog.locator('.pc-examples-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3);
    await dialog.screenshot({ path: testInfo.outputPath('examples-picker-desktop.png') });
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('File reopening retains picker scroll, trap Tab, close on Escape and restore trigger focus', async ({ page }) => {
    await load(page);
    let dialog = await openExamples(page);
    const close = dialog.getByRole('button', { name: 'Close panel', exact: true });
    await expect(close).toBeFocused();
    await close.press('Shift+Tab');
    await expect(dialog.locator('.pc-example-tile').last()).toBeFocused();
    await dialog.locator('.pc-example-tile').last().press('Tab');
    await expect(close).toBeFocused();
    const scrollTop = await dialog.locator('.pc-examples-grid').evaluate(async element => {
        element.scrollTop = element.scrollHeight;
        await new Promise(resolve => requestAnimationFrame(resolve));
        return element.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);
    await close.press('Escape');
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'File', exact: true })).toBeFocused();
    dialog = await openExamples(page, 'File');
    expect(await dialog.locator('.pc-examples-grid').evaluate(element => element.scrollTop)).toBe(scrollTop);
    await dialog.getByRole('button', { name: 'Close panel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'File', exact: true })).toBeFocused();
});

test('narrow picker has two columns and its last long-name tile opens by keyboard', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 500, height: 720 });
    await load(page);
    const dialog = await openExamples(page);
    const box = await dialog.boundingBox();
    expect(box.width).toBeLessThanOrEqual(476);
    expect(await dialog.locator('.pc-examples-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
    const last = dialog.getByRole('button', { name: lastExampleTitle, exact: true });
    await last.focus();
    await expect(last).toBeInViewport();
    await dialog.screenshot({ path: testInfo.outputPath('examples-picker-narrow.png') });
    await last.press('Enter');
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe(lastExampleTitle);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('each example tile activates an independently editable native primary workflow without host effects', async ({ page }) => {
    test.setTimeout(180000);
    await load(page);
    const before = await page.evaluate(() => {
        const settings = window.canvasHarness.S.settings();
        return { enabled: settings.enabled };
    });
    const examples = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { listWorkflowExamples } = await import('/src/workflow/examples.js?v=' + h.version);
        return listWorkflowExamples().map(example => ({ title: example.title, count: Object.values(example.graph.nodes).filter(node => node.type !== 'note' || !node.commentFrame).length }));
    });
    for (const example of examples) {
        const dialog = await openExamples(page);
        await dialog.getByRole('button', { name: example.title, exact: true }).click();
        await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
        await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe(example.title);
        await expect(page.locator('.pc-canvas-host .pc-node-native')).toHaveCount(example.count);
        const active = await page.evaluate(() => {
            const h = window.canvasHarness;
            return { currentId: h.S.activeWorkflow().id, mode: h.graph.mode };
        });
        expect(active.currentId).toBeTruthy();
        expect(active.mode).toMatch(/^native-(pre|post|unified)$/);
        await expect(page.getByRole('combobox', { name: 'Workflow', exact: true })).toHaveCount(0);
        await page.evaluate(async()=>{const h=window.canvasHarness,id=document.querySelector('.pc-canvas-host .pc-node-native').dataset.id,node=h.graph.nodes[id];await h.view({x:280-node.x,y:80-node.y,zoom:1});});
        await page.locator('.pc-canvas-host .pc-node-native .pc-native-heading').first().click({timeout:5000});
        await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toBeEnabled();
    }
    const after = await page.evaluate(() => {
        const h = window.canvasHarness, settings = h.S.settings();
        return { enabled: settings.enabled, collection: Object.hasOwn(settings, 'graphs'), providerCalls: h.providerCalls(), recovery: h.S.recoveredWorkflows().length };
    });
    expect(after.enabled).toBe(before.enabled);
    expect(after.collection).toBe(false);
    expect(after.recovery).toBeGreaterThan(0);
    expect(after.providerCalls).toBe(0);
});

test('reopening a tile guards the edited document and advanced subgraphs open for inspection', async ({ page }, testInfo) => {
    await load(page);
    let dialog = await openExamples(page);
    await dialog.getByRole('button', { name: 'Make a scene brief', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    const firstId = await page.evaluate(() => window.canvasHarness.graph.id);
    await page.locator('.pc-canvas-host .pc-node-native .pc-native-heading').first().click();
    await page.getByRole('textbox', { name: 'Node name', exact: true }).fill('My edited brief');
    await page.getByRole('textbox', { name: 'Node name', exact: true }).press('Tab');
    await expect(page.locator('.pc-canvas-host .pc-node-title').first()).toHaveText('My edited brief');
    const edited = await page.evaluate(() => structuredClone(window.canvasHarness.graph));
    dialog = await openExamples(page);
    await dialog.getByRole('button', { name: 'Make a scene brief', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.canvasHarness.graph.id)).not.toBe(firstId);
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe('Make a scene brief');
    expect(await page.evaluate(() => window.canvasHarness.graph.nodes)).not.toEqual(edited.nodes);
    await expect(page.locator('.pc-canvas-host .pc-node-title').first()).not.toHaveText('My edited brief');
    dialog = await openExamples(page);
    await dialog.getByRole('button', { name: 'Combine memory with a voice pass', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    await page.locator('.pc-canvas-host .pc-node-subgraph .pc-native-heading').first().dblclick();
    await expect(page.locator('.pc-graph-tabs [role="tab"]')).toHaveCount(2);
    await page.evaluate(async () => { await window.canvasHarness.view({ x: 280, y: 60, zoom: 0.7 }); });
    await expect(page.locator('.pc-canvas-host .pc-node-subgraph-input').first()).toBeVisible();
    await page.locator('.pc-canvas-host .pc-node-subgraph-input .pc-native-heading').first().click();
    await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toBeDisabled();
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    await page.locator('.pc-canvas-host .pc-node-subgraph .pc-native-heading').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Make editable copy', exact: true }).click();
    await page.evaluate(async () => { await window.canvasHarness.view({ x: 280, y: 60, zoom: 0.7 }); });
    await page.locator('.pc-canvas-host .pc-node-subgraph-input .pc-native-heading').first().click();
    await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Fit to view', exact: true }).click();
    await page.getByRole('dialog', { name: 'Lattice', exact: true }).screenshot({ path: testInfo.outputPath('example-30-opened-subgraph.png') });
    dialog = await openExamples(page);
    await dialog.getByRole('button', { name: 'Make a scene brief', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    await expect(page.locator('.pc-graph-tabs [role="tab"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe('Make a scene brief');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('a malformed companion keeps the picker and previous root, then allows retry after repair', async ({ page }) => {
    await load(page);
    const dialog = await openExamples(page);
    const before = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { WORKFLOW_EXAMPLE_DATA } = await import('/src/workflow/example-data.js?v=' + h.version);
        const example = WORKFLOW_EXAMPLE_DATA.find(example => example.number === 20);
        window.examplesCorruptCompanion = example.packages[1].graph.nodes;
        example.packages[1].graph.nodes = {};
        return structuredClone(h.S.activeWorkflow());
    });
    const tile = dialog.getByRole('button', { name: 'Record injuries and fatigue', exact: true });
    await tile.click();
    await expect(dialog).toBeVisible();
    await expect(tile).toBeEnabled();
    expect(await page.evaluate(() => {
        const settings = window.canvasHarness.S.settings();
        return structuredClone(window.canvasHarness.S.activeWorkflow());
    })).toEqual(before);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { WORKFLOW_EXAMPLE_DATA } = await import('/src/workflow/example-data.js?v=' + h.version);
        WORKFLOW_EXAMPLE_DATA.find(example => example.number === 20).packages[1].graph.nodes = window.examplesCorruptCompanion;
    });
    await tile.click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe('Record injuries and fatigue');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('one malformed primary stays as a disabled diagnostic tile while other examples still open', async ({ page }) => {
    await load(page);
    const beforeId = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { WORKFLOW_EXAMPLE_DATA } = await import('/src/workflow/example-data.js?v=' + h.version);
        const primary = WORKFLOW_EXAMPLE_DATA[0].packages[0].graph;
        Object.values(primary.nodes).find(node => node.type === 'workflow').operation = 'missing-example-operation';
        return h.S.activeWorkflow().id;
    });
    const dialog = await openExamples(page);
    await expect(dialog.locator('.pc-example-tile')).toHaveCount(exampleCount);
    const invalid = dialog.getByRole('button', { name: 'Make a scene brief', exact: true });
    await expect(invalid).toBeDisabled();
    await expect(invalid).toContainText('Unavailable');
    await expect(invalid).toHaveAccessibleDescription(/unknown workflow operation/i);
    await expect(dialog.locator('.pc-example-tile:not(:disabled)')).toHaveCount(exampleCount-1);
    expect(await page.evaluate(() => window.canvasHarness.S.activeWorkflow().id)).toBe(beforeId);
    await dialog.getByRole('button', { name: 'Replace a repeated phrase', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe('Replace a repeated phrase');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('catalog-wide loading failure preserves the workspace and Retry restores the examples', async ({ page }) => {
    await load(page);
    const beforeId = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { WORKFLOW_EXAMPLE_DATA } = await import('/src/workflow/example-data.js?v=' + h.version);
        window.exampleCatalogTitleDescriptor = Object.getOwnPropertyDescriptor(WORKFLOW_EXAMPLE_DATA[0], 'title');
        Object.defineProperty(WORKFLOW_EXAMPLE_DATA[0], 'title', { configurable: true, get() { throw new Error('The example catalog is temporarily unavailable.'); } });
        return h.S.activeWorkflow().id;
    });
    const dialog = await openExamples(page);
    await expect(dialog.getByRole('alert')).toHaveText('The example catalog is temporarily unavailable.Retry');
    await expect(page.getByRole('dialog', { name: 'Lattice', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.canvasHarness.S.activeWorkflow().id)).toBe(beforeId);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { WORKFLOW_EXAMPLE_DATA } = await import('/src/workflow/example-data.js?v=' + h.version);
        Object.defineProperty(WORKFLOW_EXAMPLE_DATA[0], 'title', window.exampleCatalogTitleDescriptor);
        delete window.exampleCatalogTitleDescriptor;
    });
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.locator('.pc-example-tile:not(:disabled)')).toHaveCount(exampleCount);
    await dialog.getByRole('button', { name: 'Make a scene brief', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
