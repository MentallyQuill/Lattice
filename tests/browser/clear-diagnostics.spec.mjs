import { test, expect } from '@playwright/test';

async function openNativePreview(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + h.version);
        await h.activate(starterGraph('unified-basic'));
        h.canvas.select({ kind: 'node', id: 'generate-reply' });
        await h.settle();
    });
    return page.locator('.pc-output-preview');
}

for (const width of [1440, 320]) test(`native preview explains how to start without a model request at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const preview = await openNativePreview(page);
    const diagnostic = preview.locator('[data-diagnostic]');
    await expect(diagnostic).toHaveCount(1);
    await expect(diagnostic).toHaveAttribute('data-severity', 'info');
    await expect(diagnostic.locator('p').first()).toContainText('Enable Lattice');
    await expect(diagnostic.locator('p').first()).toContainText('send a message in SillyTavern');
    await expect(preview.locator('.pc-preview-empty')).toHaveCount(0);
    const run = preview.locator('[data-run-here]');
    await expect(run).toBeDisabled();
    await expect(run).toHaveAccessibleDescription(/send a message in SillyTavern/i);
    await expect(preview.locator('footer')).not.toContainText('send a message');

    const technical = diagnostic.locator('details');
    await expect(technical).not.toHaveAttribute('open', '');
    await technical.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(technical).toHaveAttribute('open', '');
    await expect(technical.locator('code')).toHaveText('MANUAL_NATIVE_TRIGGER_REQUIRED');
    await page.keyboard.press('Enter');
    await expect(technical).not.toHaveAttribute('open', '');
    await diagnostic.getByRole('button', { name: 'Show node', exact: true }).click();
    await expect(page.locator('.pc-node-native[data-id="generate-reply"]')).toHaveClass(/selected/);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await preview.locator('.pc-preview-sections').evaluate(element => { element.scrollTop = 0; });
    await preview.screenshot({ path: testInfo.outputPath(`clear-preview-${width}.png`) });

    await page.getByRole('switch', { name: 'Enable Lattice', exact: true }).check();
    await expect(diagnostic.locator('p').first()).toHaveText('Send a message in SillyTavern to run this workflow.');
    await expect(run).toBeDisabled();
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('source-free output still runs and replaces its neutral empty state with output', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        await h.reset(1);
        h.canvas.select({ kind: 'node', id: 'n0' });
        await h.settle();
    });
    const preview = page.locator('.pc-output-preview');
    await expect(preview.locator('.pc-preview-empty')).toContainText('has not run yet');
    await expect(preview.locator('[data-diagnostic][data-severity="error"]')).toHaveCount(0);
    await expect(preview.locator('[data-run-here]')).toBeEnabled();
    await preview.locator('[data-run-here]').click();
    await expect(preview.getByRole('tabpanel')).toContainText('Synthetic rendering fixture.');
    await expect(preview.locator('.pc-preview-empty')).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
