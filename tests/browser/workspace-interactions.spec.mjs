import { rootCommand, expectRootBusy } from './workflow-commands.mjs';
import { test, expect } from '@playwright/test';

async function openNestedWorkspace(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const { nestedWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const graph = nestedWorkflow();
        graph.name = 'Workspace interactions';
        graph.nodes['first/path'].title = 'A long subgraph name that wraps on small screens';
        await window.canvasHarness.activate(graph);
    });
    await page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading').dblclick();
    await page.locator('.pc-node-native[data-id="work"] .pc-native-heading').dblclick();
    await expect(page.getByRole('navigation', { name: 'Graph location' })).toBeVisible();
}

test('wrapped nested breadcrumbs reserve space above the node shelf at every workspace width', async ({ page }) => {
    await openNestedWorkspace(page);
    for (const width of [1440, 736, 360, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => window.canvasHarness.settle());
        const geometry = await page.evaluate(() => {
            const location = document.querySelector('.pc-graph-location').getBoundingClientRect();
            const shelf = document.querySelector('.pc-node-shelf').getBoundingClientRect();
            const canvas = document.querySelector('.pc-canvas-host').getBoundingClientRect();
            return { locationBottom: location.bottom, shelfTop: shelf.top, canvasTop: canvas.top,
                canvasHeight: canvas.height, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        expect(geometry.shelfTop, `shelf at ${width}px`).toBeGreaterThanOrEqual(geometry.locationBottom);
        expect(geometry.canvasTop, `canvas at ${width}px`).toBeGreaterThanOrEqual(geometry.locationBottom);
        expect(geometry.canvasHeight).toBeGreaterThanOrEqual(140);
        expect(geometry.overflow).toBe(false);
    }
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    await expect(page.locator('.pc-graph-location')).toHaveCount(0);
});

test('workspace labels resist text highlighting while editors and recorded output remain selectable', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + h.version);
        await h.activate(starterGraph('structured-guidance'));
    });
    await page.locator('.pc-brand').dblclick();
    expect(await page.evaluate(() => window.getSelection().toString())).toBe('');
    await rootCommand(page);
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    await page.locator('.pc-node-native[data-id="select-fields"] .pc-native-heading').click();
    const output = page.locator('.pc-output-preview [role="tabpanel"] pre');
    await expect(output).toContainText('A quiet conversation.');
    await output.dblclick();
    expect(await page.evaluate(() => window.getSelection().toString())).not.toBe('');
    const alias = page.getByLabel('Node name', { exact: true });
    await alias.fill('Selectable alias');
    expect(await alias.evaluate(input => {
        input.select(); return input.value.slice(input.selectionStart, input.selectionEnd);
    })).toBe('Selectable alias');
    for (const selector of ['.pc-graph-tab', '.pc-family-row', '.pc-flat-menu', '.pc-details-heading']) {
        expect(await page.locator(selector).first().evaluate(element => getComputedStyle(element).userSelect)).toBe('none');
    }
});

test('renaming an inactive subgraph tab updates its parent node and supports undo without switching views', async ({ page }) => {
    await openNestedWorkspace(page);
    const tabs = page.locator('.pc-graph-tabs [role="tab"]');
    await tabs.nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename subgraph', exact: true }).click();
    const rename = page.locator('.pc-graph-tabs').getByRole('textbox', { name: 'Subgraph name', exact: true });
    await expect(rename).toBeFocused();
    await expect(rename).toHaveValue('A long subgraph name that wraps on small screens');
    await rename.fill('Renamed outer subgraph');
    await rename.press('Tab');
    await expect(rename).toHaveCount(0);
    await expect(tabs.nth(1)).toContainText('Renamed outer subgraph');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.pc-graph-location')).toContainText('Renamed outer subgraph');
    expect(await page.evaluate(() => window.canvasHarness.S.activeWorkflow().nodes['first/path'].title)).toBe('Renamed outer subgraph');
    await tabs.first().click();
    await expect(page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading')).toHaveText('Renamed outer subgraph');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(tabs.nth(1)).toContainText('A long subgraph name');
    await expect(page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading')).toHaveText('A long subgraph name that wraps on small screens');
});

test('renaming the root graph from its inactive tab updates the workflow name and breadcrumb', async ({ page }) => {
    await openNestedWorkspace(page);
    const tabs = page.locator('.pc-graph-tabs [role="tab"]');
    const existingDialogs = await page.getByRole('dialog').count();
    await tabs.first().click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Close tab', exact: true })).toBeDisabled();
    await page.getByRole('menuitem', { name: 'Rename graph', exact: true }).click();
    const rename = page.locator('.pc-graph-tabs').getByRole('textbox', { name: 'Graph name', exact: true });
    await expect(rename).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(existingDialogs);
    await expect(rename).toHaveValue('Workspace interactions');
    expect(await rename.evaluate(input => input.value.slice(input.selectionStart, input.selectionEnd))).toBe('Workspace interactions');
    await rename.fill('Renamed workflow');
    await rename.press('Enter');
    await expect(rename).toHaveCount(0);
    await expect(tabs.first()).toHaveText('Renamed workflow');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.pc-graph-location')).toContainText('Renamed workflow');
    expect(await page.evaluate(() => window.canvasHarness.S.activeWorkflow().name)).toBe('Renamed workflow');
});

test('subgraph rename undo restores an existing parent node alias', async ({ page }) => {
    await openNestedWorkspace(page);
    const tabs = page.locator('.pc-graph-tabs [role="tab"]');
    await tabs.first().click();
    await page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading').click();
    await page.getByLabel('Node name', { exact: true }).fill('Prior local alias');
    await page.getByLabel('Node name', { exact: true }).press('Tab');
    await tabs.nth(2).click();
    await tabs.nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename subgraph', exact: true }).click();
    const rename = page.locator('.pc-graph-tabs').getByRole('textbox', { name: 'Subgraph name', exact: true });
    await rename.fill('Renamed alias subgraph');
    await rename.press('Enter');
    await expect(tabs.nth(1)).toContainText('Renamed alias subgraph');
    await tabs.first().click();
    await expect(page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading')).toHaveText('Renamed alias subgraph');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading')).toHaveText('Prior local alias');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading')).toHaveText('Renamed alias subgraph');
    await page.getByRole('button', { name: 'Close canvas', exact: true }).click();
    await page.evaluate(() => {
        const h = window.canvasHarness;
        window.renameStoredViews = h.S.activeWorkspaceViews();
        h.H.undo(h.S.activeWorkflow());
        window.lattice.open();
    });
    await expect(page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading')).toHaveText('Prior local alias');
    expect(await page.evaluate(() => window.renameStoredViews.views.find(view => view.identity.kind === 'root').nodePresentation['first/path'].alias)).toBe('Renamed alias subgraph');
});

test('Graph menu inline rename cancels with Escape, ignores blank names, and supports root undo and redo', async ({ page }) => {
    await openNestedWorkspace(page);
    const tabs = page.locator('.pc-graph-tabs [role="tab"]');
    const rename = page.locator('.pc-graph-tabs').getByRole('textbox', { name: 'Graph name', exact: true });
    for (const [draft, key] of [['Canceled workflow', 'Escape'], ['   ', 'Enter']]) {
        await page.getByRole('button', { name: 'Graph', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Rename graph', exact: true }).click();
        await expect(rename).toBeFocused();
        await rename.fill(draft);
        await rename.press(key);
        await expect(rename).toHaveCount(0);
        await expect(tabs.first()).toHaveText('Workspace interactions');
        expect(await page.evaluate(() => window.canvasHarness.S.activeWorkflow().name)).toBe('Workspace interactions');
    }
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Rename graph', exact: true }).click();
    await rename.fill('Menu renamed workflow');
    await rename.press('Enter');
    await expect(tabs.first()).toHaveText('Menu renamed workflow');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await tabs.first().click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(tabs.first()).toHaveText('Workspace interactions');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(tabs.first()).toHaveText('Menu renamed workflow');
});

test('root tab context actions stay above the floating canvas controls', async ({ page }) => {
    await openNestedWorkspace(page);
    await page.locator('.pc-graph-tabs [role="tab"]').first().click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Actions for Workspace interactions', exact: true });
    await expect(menu).toBeVisible();
    const hitTargets = await menu.getByRole('menuitem').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return { label: button.textContent, reachable: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) };
    }));
    for (const item of hitTargets) expect(item.reachable, item.label).toBe(true);
});
