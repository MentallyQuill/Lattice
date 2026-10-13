const exampleCount=30, lastExampleTitle='A relationship that changes slowly over weeks';
import { test, expect } from '@playwright/test';

async function load(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
}
async function openExamples(page, menu = 'File') {
    await page.getByRole('menuitem', { name: menu, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click({ timeout: 2500 });
    const dialog = page.getByRole('dialog', { name: 'Examples', exact: true });
    await expect(dialog).toHaveAttribute('aria-busy', 'false');
    return dialog;
}

async function finishExampleChoice(page) {
    const guard=page.getByRole('dialog',{name:'Save workflow changes?',exact:true});
    const picker=page.getByRole('dialog',{name:'Examples',exact:true});
    await expect.poll(async()=>await guard.isVisible()||!await picker.isVisible()).toBe(true);
    if(await guard.isVisible())await guard.getByRole('button',{name:"Don't Save",exact:true}).click();
}

test('File examples follows native Open and Recent commands and opens the compact complete example picker', async ({ page }, testInfo) => {
    await load(page);
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'File', exact: true }).click();
    const items = await page.getByRole('menu', { name: 'File', exact: true }).getByRole('menuitem').allTextContents();
    expect(items[items.findIndex(item => item.includes('Open Recent')) + 1]).toContain('Open examples…');
    await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Examples', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.pc-example-tile')).toHaveCount(exampleCount);
    await expect(dialog.locator('.pc-example-tile').first()).toHaveAccessibleName('Follow a reply from Send to Review');
    await expect(dialog.locator('.pc-example-tile').last()).toHaveAccessibleName(lastExampleTitle);
    const box = await dialog.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(750);
    expect(box.width).toBeLessThanOrEqual(770);
    expect(box.height).toBeGreaterThanOrEqual(670);
    expect(box.height).toBeLessThanOrEqual(690);
    const previews = dialog.locator('.pc-example-preview');
    await expect(previews).toHaveCount(exampleCount);
    expect(await previews.first().evaluate(element => element.getBoundingClientRect().height)).toBe(72);
    await expect(previews.first().locator('.pc-example-card').first()).toBeAttached();
    await expect(dialog.locator('.pc-example-pin-label')).toHaveCount(0);
    await expect(dialog.locator('g[data-id]:not(.pc-node-compact) > svg > .pc-example-icon')).toHaveCount(0);
    const mountedCards = await dialog.locator('.pc-example-card').count();
    const totalCards = await page.evaluate(async () => {
        const h = window.canvasHarness, { projectWorkflowExamples } = await import('/src/ui/example-catalog.js?v=' + h.version);
        return projectWorkflowExamples().reduce((count, tile) => count + (tile.thumbnail?.nodes.length ?? 0), 0);
    });
    expect(mountedCards).toBeGreaterThan(0);
    expect(mountedCards).toBeLessThan(totalCards);
    expect(await dialog.locator('.pc-examples-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3);
    await dialog.screenshot({ path: testInfo.outputPath('examples-picker-desktop.png') });
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('the File menu retains picker scroll, trap Tab, close on Escape and restore trigger focus', async ({ page }) => {
    await load(page);
    let dialog = await openExamples(page);
    const close = dialog.getByRole('button', { name: 'Close panel', exact: true });
    await expect(close).toBeFocused();
    await close.press('Shift+Tab');
    await expect(dialog.locator('.pc-example-details-button').last()).toBeFocused();
    await dialog.locator('.pc-example-details-button').last().press('Tab');
    await expect(close).toBeFocused();
    const scrollTop = await dialog.locator('.pc-examples-grid').evaluate(async element => {
        element.scrollTop = element.scrollHeight;
        await new Promise(resolve => requestAnimationFrame(resolve));
        return element.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);
    await close.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('menuitem', { name: 'File', exact: true })).toBeFocused();
    dialog = await openExamples(page);
    expect(await dialog.locator('.pc-examples-grid').evaluate(element => element.scrollTop)).toBe(scrollTop);
    await dialog.getByRole('button', { name: 'Close panel', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'File', exact: true })).toBeFocused();
});

test('a deferred example choice cannot outlive closing the editor before it is reopened', async ({ page }) => {
    await load(page);
    const dialog = await openExamples(page);
    const originalId = await page.evaluate(() => window.canvasHarness.S.activeWorkflow().id);
    await dialog.locator('.pc-example-tile').first().evaluate(tile => {
        tile.click();
        window.canvasHarness.UI.close();
    });
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.canvasHarness.S.activeWorkflow().id)).toBe(originalId);
    expect(await page.evaluate(() => window.canvasHarness.UI.isOpen())).toBe(false);
    await page.evaluate(() => window.canvasHarness.UI.open());
    expect(await page.evaluate(() => window.canvasHarness.UI.isOpen())).toBe(true);
    await expect(dialog).toBeHidden();
});

test('a deferred example choice cannot replace a newly activated document', async ({ page }) => {
    await load(page);
    const dialog = await openExamples(page);
    const replacementId = await dialog.locator('.pc-example-tile').first().evaluate(tile => {
        const h = window.canvasHarness, replacement = structuredClone(h.S.activeWorkflow());
        replacement.id = 'example-authority-replacement';
        replacement.name = 'Externally activated while choosing an example';
        tile.click();
        h.S.activateWorkflow(replacement, { clean: true });
        return replacement.id;
    });
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.canvasHarness.S.activeWorkflow().id)).toBe(replacementId);
    expect(await page.evaluate(() => window.canvasHarness.S.activeWorkflow().name)).toBe('Externally activated while choosing an example');
    await expect(dialog).toBeHidden();
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
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe('30. ' + lastExampleTitle);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('each example tile activates an independently editable native primary workflow without host effects', async ({ page }) => {
    test.setTimeout(180000);
    await load(page);
    const before = await page.evaluate(() => {
        const settings = window.canvasHarness.S.settings();
        return {enabled:settings.enabled,collection:Object.hasOwn(settings,'graphs')};
    });
    const examples = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { listWorkflowExamples } = await import('/src/workflow/examples.js?v=' + h.version);
        return listWorkflowExamples().map(example => ({ title: example.title, graphName: example.graph.name, count: Object.values(example.graph.nodes).filter(node => node.type !== 'note' || !node.commentFrame).length }));
    });
    for (const example of examples) {
        const dialog = await openExamples(page);
        await dialog.getByRole('button', { name: example.title, exact: true }).click();
    await finishExampleChoice(page);
        await expect(dialog).toBeHidden();
        await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe(example.graphName);
        await expect(page.locator('.pc-canvas-host .pc-node-native')).toHaveCount(example.count);
        const active = await page.evaluate(() => {
            const h = window.canvasHarness;
            return { savedId: h.S.activeWorkflow().id, currentId: h.graph.id, mode: h.graph.mode };
        });
        expect(active.savedId).toBe(active.currentId);
        expect(active.mode).toBe('native-unified');
        await expect(page.getByRole('combobox', { name: 'Workflow', exact: true })).toHaveCount(0);
        await page.evaluate(async()=>{const h=window.canvasHarness,id=document.querySelector('.pc-canvas-host .pc-node-native').dataset.id,node=h.graph.nodes[id];await h.view({x:280-node.x,y:80-node.y,zoom:1});});
        await page.locator('.pc-canvas-host .pc-node-native .pc-native-heading').first().click({timeout:5000});
        await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toBeEnabled();
    }
    const after = await page.evaluate(() => {
        const h = window.canvasHarness, settings = h.S.settings();
        return {enabled:settings.enabled,collection:Object.hasOwn(settings,'graphs'),providerCalls:h.providerCalls()};
    });
    expect(after.enabled).toBe(before.enabled);
    expect(before.collection).toBe(false);expect(after.collection).toBe(false);
    expect(after.providerCalls).toBe(0);
});

test('reopening a tile guards the edited document and subgraphs remain inspectable', async ({ page }, testInfo) => {
    await load(page);
    let dialog = await openExamples(page);
    await dialog.getByRole('button', { name: 'Follow a reply from Send to Review', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    const firstId = await page.evaluate(() => window.canvasHarness.graph.id);
    await page.locator('.pc-canvas-host .pc-node-native .pc-native-heading').first().click();
    await page.getByRole('textbox', { name: 'Node name', exact: true }).fill('My edited brief');
    await page.getByRole('textbox', { name: 'Node name', exact: true }).press('Tab');
    await expect(page.locator('.pc-canvas-host .pc-node-title').first()).toHaveText('My edited brief');
    const edited = await page.evaluate(() => structuredClone(window.canvasHarness.graph));
    dialog = await openExamples(page);
    await dialog.getByRole('button', { name: 'Follow a reply from Send to Review', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.canvasHarness.graph.id)).not.toBe(firstId);
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe('1. Follow a reply from Send to Review');
    expect(await page.evaluate(()=>window.canvasHarness.graph.nodes)).not.toEqual(edited.nodes);
    await expect(page.locator('.pc-canvas-host .pc-node-title').first()).not.toHaveText('My edited brief');
    dialog = await openExamples(page);
    await dialog.getByRole('button', { name: 'Build one reusable item-card processor', exact: true }).click();
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
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Fit graph', exact: true }).click();
    await page.getByRole('dialog', { name: 'Lattice', exact: true }).screenshot({ path: testInfo.outputPath('example-30-opened-subgraph.png') });
    dialog = await openExamples(page);
    await dialog.getByRole('button', { name: 'Follow a reply from Send to Review', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    await expect(page.locator('.pc-graph-tabs [role="tab"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe('1. Follow a reply from Send to Review');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('prior unified IDs remain independently installable while malformed packages and retired IDs preserve saved workflows', async ({page}) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const {UNIFIED_WORKFLOW_EXAMPLE_DATA} = await import('/src/workflow/unified-example-data.js?v=' + h.version);
        const {installWorkflowExample, listWorkflowExamples} = await import('/src/workflow/examples.js?v=' + h.version);
        const entry = UNIFIED_WORKFLOW_EXAMPLE_DATA[0];
        const before = structuredClone(h.S.settings()), nodes = entry.packages[0].graph.nodes;
        entry.packages[0].graph.nodes = {};
        const failed = installWorkflowExample(entry.id, h.S.settings());
        const retired = ['scene-brief-basics', 'continuity-and-voice'].map(id => installWorkflowExample(id, h.S.settings()));
        const unchanged = JSON.stringify(h.S.settings()) === JSON.stringify(before);
        entry.packages[0].graph.nodes = nodes;
        const repaired = installWorkflowExample(entry.id, h.S.settings());
        return {failed: failed.ok, unchanged, retiredRejected:retired.every(result => !result.ok && result.error.code === 'UNKNOWN_EXAMPLE'), repaired: repaired.ok, mode:repaired.data?.graph.mode, independent:repaired.data?.graph.id !== entry.packages[0].graph.id, visible:listWorkflowExamples().some(example => example.id === entry.id), bindingsUnchanged:JSON.stringify(h.S.settings().nativeBindings) === JSON.stringify(before.nativeBindings), companions:repaired.data?.companions.length, calls:h.providerCalls()};
    });
    expect(result).toEqual({failed:false, unchanged:true, retiredRejected:true, repaired:true, mode:'native-unified', independent:true, visible:false, bindingsUnchanged:true, companions:0, calls:0});
});

test('one malformed primary stays as a disabled diagnostic tile while other examples still open', async ({ page }) => {
    await load(page);
    const beforeId = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { REMASTERED_WORKFLOW_EXAMPLE_DATA: WORKFLOW_EXAMPLE_DATA } = await import('/src/workflow/remastered-example-data.js?v=' + h.version);
        const primary = WORKFLOW_EXAMPLE_DATA[0].packages[0].graph;
        Object.values(primary.nodes).find(node => node.type === 'workflow').operation = 'missing-example-operation';
        return h.S.activeWorkflow().id;
    });
    const dialog = await openExamples(page);
    await expect(dialog.locator('.pc-example-tile')).toHaveCount(exampleCount);
    const invalid = dialog.getByRole('button', { name: 'Follow a reply from Send to Review', exact: true });
    await expect(invalid).toBeDisabled();
    await expect(invalid).toContainText('Unavailable');
    await expect(invalid).toHaveAccessibleDescription(/node type or version is not supported/i);
    await expect(dialog.locator('.pc-example-tile:not(:disabled)')).toHaveCount(exampleCount-1);
    expect(await page.evaluate(() => window.canvasHarness.S.activeWorkflow().id)).toBe(beforeId);
    await dialog.getByRole('button', { name: 'Give this scene one clear direction', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe('2. Give this scene one clear direction');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('catalog-wide loading failure preserves the workspace and Retry restores the examples', async ({ page }) => {
    await load(page);
    const beforeId = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { REMASTERED_WORKFLOW_EXAMPLE_DATA: WORKFLOW_EXAMPLE_DATA } = await import('/src/workflow/remastered-example-data.js?v=' + h.version);
        window.exampleCatalogTitleDescriptor = Object.getOwnPropertyDescriptor(WORKFLOW_EXAMPLE_DATA[0], 'title');
        Object.defineProperty(WORKFLOW_EXAMPLE_DATA[0], 'title', { configurable: true, get() { throw new Error('The example catalog is temporarily unavailable.'); } });
        return h.S.activeWorkflow().id;
    });
    const dialog = await openExamples(page);
    const diagnostic = dialog.locator('.pc-examples-issue .pc-diagnostic[data-severity="error"]');
    await expect(diagnostic.locator(':scope > p')).toContainText('Lattice could not complete this action.');
    await expect(diagnostic).not.toContainText('The example catalog is temporarily unavailable.');
    await expect(diagnostic.locator('details')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Lattice', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.canvasHarness.S.activeWorkflow().id)).toBe(beforeId);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { REMASTERED_WORKFLOW_EXAMPLE_DATA: WORKFLOW_EXAMPLE_DATA } = await import('/src/workflow/remastered-example-data.js?v=' + h.version);
        Object.defineProperty(WORKFLOW_EXAMPLE_DATA[0], 'title', window.exampleCatalogTitleDescriptor);
        delete window.exampleCatalogTitleDescriptor;
    });
    await dialog.getByRole('button', { name: 'Reload examples', exact: true }).click();
    await expect(dialog.locator('.pc-examples-issue .pc-diagnostic')).toHaveCount(0);
    await expect(dialog.locator('.pc-example-tile:not(:disabled)')).toHaveCount(exampleCount);
    await dialog.getByRole('button', { name: 'Follow a reply from Send to Review', exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
