import { test, expect } from '@playwright/test';

async function failureMenu(page) {
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'Workflow', exact: true }).click();
    await page.getByRole('menuitem', { name: 'When a node fails', exact: true }).click();
    return page.getByRole('menu', { name: 'When a node fails options', exact: true });
}

for (const width of [1440, 390]) test(`Workflow failure policy is reachable and global at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness?.canvas);
    await expect(page.locator('#pc-settings #pc-failure-policy')).toHaveCount(0);
    const before = await page.evaluate(() => JSON.stringify(window.canvasHarness.graph));
    let choices = await failureMenu(page);
    expect(await choices.getByRole('menuitemradio').evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')))).toEqual([
        'Fall back to SillyTavern',
        'Stop all generation',
        'Continue where possible',
    ]);
    await expect(choices.getByRole('menuitemradio', { name: 'Fall back to SillyTavern', exact: true })).toHaveAttribute('aria-checked', 'true');
    await choices.getByRole('menuitemradio', { name: 'Continue where possible', exact: true }).click();
    expect(await page.evaluate(() => window.canvasHarness.S.settings().workflowFailurePolicy)).toBe('continue-available');
    expect(await page.evaluate(() => JSON.stringify(window.canvasHarness.graph))).toBe(before);
    choices = await failureMenu(page);
    await expect(choices.getByRole('menuitemradio', { name: 'Continue where possible', exact: true })).toHaveAttribute('aria-checked', 'true');
    const box = await choices.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await choices.screenshot({ path: `test-results/failure-policy-workflow-${width}.png` });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    const state = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + h.version);
        await h.activate(starterGraph('unified-basic'));
        return { policy: h.S.settings().workflowFailurePolicy, graph: JSON.stringify(h.S.activeWorkflow()), calls: h.providerCalls() };
    });
    expect(state.policy).toBe('continue-available');
    expect(state.graph).not.toContain('workflowFailurePolicy');
    expect(state.calls).toBe(0);
    choices = await failureMenu(page);
    await expect(choices.getByRole('menuitemradio', { name: 'Continue where possible', exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('Workflow failure choices work with keyboard navigation and refresh after external preference changes', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness?.canvas);
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'Workflow', exact: true }).click();
    await page.getByRole('menuitem', { name: 'When a node fails', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitemradio', { name: 'Fall back to SillyTavern', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.canvasHarness.S.settings().workflowFailurePolicy)).toBe('stop');
    const choices = await failureMenu(page);
    await expect(choices.getByRole('menuitemradio', { name: 'Stop all generation', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => window.canvasHarness.S.setWorkflowFailurePolicy('continue-available'));
    await expect(choices.getByRole('menuitemradio', { name: 'Continue where possible', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(choices.getByRole('menuitemradio', { name: 'Stop all generation', exact: true })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('menuitem', { name: 'When a node fails', exact: true })).toHaveAttribute('aria-expanded', 'true');
});
