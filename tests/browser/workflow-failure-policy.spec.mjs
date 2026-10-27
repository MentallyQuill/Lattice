import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) test(`global failure policy is accessible and survives workflow changes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness?.canvas);
    await page.evaluate(() => {
        window.canvasHarness.UI.close();
        const host = document.getElementById('extensions_settings2');
        host.hidden = false;
        host.style.width = 'min(360px, 100vw)';
    });
    const choice = page.getByRole('combobox', { name: 'When a node fails', exact: true });
    await expect(choice).toBeVisible();
    await expect(choice).toHaveValue('native-fallback');
    await expect(choice.locator('option')).toHaveText(['Fall back to SillyTavern', 'Stop all generation', 'Continue where possible']);
    await choice.selectOption('continue-available');
    await expect(page.locator('#pc-failure-policy-hint')).toContainText('Keep successful results');
    const state = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + h.version);
        h.S.activateWorkflow(starterGraph('unified-basic'));
        document.dispatchEvent(new CustomEvent('pc-state'));
        return { policy: h.S.settings().workflowFailurePolicy, graph: JSON.stringify(h.S.activeWorkflow()), calls: h.providerCalls() };
    });
    expect(state.policy).toBe('continue-available');
    expect(state.graph).not.toContain('workflowFailurePolicy');
    expect(state.calls).toBe(0);
    await expect(choice).toHaveValue('continue-available');
    const box = await choice.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.locator('#pc-settings').screenshot({ path: `test-results/failure-policy-${width}.png` });
});
