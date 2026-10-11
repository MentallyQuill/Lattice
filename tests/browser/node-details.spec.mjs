import { test, expect } from '@playwright/test';

const details = page => page.getByRole('region', { name: 'Node details', exact: true });
const selectCompose = async page => {
    await page.evaluate(async () => {
        const h = window.canvasHarness, node = h.canvas.graph.nodes.n0;
        await h.view({ x: 200 - node.x * .9, y: 90 - node.y * .9, zoom: .9 });
    });
    await page.locator('.pc-node-native[data-id="n0"] .pc-native-heading').click();
    await expect(details(page)).toBeVisible();
};

async function sectionsJson(page) {
    const toggle = details(page).getByRole('button', { name: 'Edit Sections as JSON', exact: true });
    const editor = details(page).getByLabel('Sections', { exact: true });
    await expect(toggle.or(editor)).toBeVisible();
    if (await toggle.isVisible()) await toggle.click();
    await expect(editor).toBeVisible();
    return editor;
}

async function setup(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const [{ canvasWorkflow }, { operationDefaults }] = await Promise.all([
            import('/tests/browser/native-fixture.mjs'), import('/src/workflow/catalog.js?v=' + h.version),
        ]);
        window.detailsFixtureDocuments = {};
        for (const id of ['details-other-root', 'details-draft-root']) {
            const graph = canvasWorkflow(operationDefaults, 1, 1); graph.id = id; graph.name = id;
            graph.nodes.annotation = { id: 'annotation', type: 'note', commentFrame: true, moveContents: false,
                title: 'Inspector comment', content: '', color: '#637d89', x: 360, y: 80, w: 240, h: 180 };
            window.detailsFixtureDocuments[id] = graph; await h.activate(graph);
        }
        await h.view({ x: 90, y: 80, zoom: .9 });
    });
    await selectCompose(page);
}

test('invalid JSON is retained after switching roots and returning to the qualified node', async ({ page }) => {
    await setup(page);
    const before = await page.evaluate(() => structuredClone(window.canvasHarness.graph.nodes.n0.sections));
    const editor = await sectionsJson(page);
    await editor.fill('{"unfinished":');
    await details(page).getByRole('button', { name: 'Save Sections', exact: true }).click();
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    await page.evaluate(() => window.canvasHarness.activate(window.detailsFixtureDocuments['details-other-root']));
    await selectCompose(page);
    await sectionsJson(page);
    await expect(editor).toHaveValue(JSON.stringify(before, null, 2));
    await page.evaluate(() => window.canvasHarness.activate(window.detailsFixtureDocuments['details-draft-root']));
    await selectCompose(page);
    await expect(editor).toHaveValue('{"unfinished":');
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    await details(page).getByRole('button', { name: 'Save Sections', exact: true }).click();
    await expect(details(page).getByRole('alert')).toContainText('Enter valid JSON');
    expect(await page.evaluate(() => window.canvasHarness.graph.nodes.n0.sections)).toEqual(before);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('comment inspection preserves an invalid node draft for the mounted workspace lifetime', async ({ page }) => {
    await setup(page);
    const editor = await sectionsJson(page);
    await editor.fill('{"unfinished":');
    await details(page).getByRole('button', { name: 'Save Sections', exact: true }).click();
    await page.locator('.pc-comment-frame[data-id="annotation"] .pc-comment-select').click();
    await expect(page.locator('.pc-comment-details')).toBeVisible();
    await expect(details(page)).toBeHidden();
    await selectCompose(page);
    await expect(editor).toHaveValue('{"unfinished":');
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    await expect(details(page).getByRole('alert')).toContainText('Enter valid JSON');
    const mountedInspector = await details(page).elementHandle();
    await page.getByRole('button', { name: 'Close canvas', exact: true }).click();
    await expect(details(page)).toBeHidden();
    expect(await mountedInspector.evaluate(element => element.isConnected)).toBe(true);
    await page.evaluate(() => window.lattice.open());
    await selectCompose(page);
    expect(await details(page).evaluate((element, original) => element === original, mountedInspector)).toBe(true);
    await expect(editor).toHaveValue('{"unfinished":');
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
});
