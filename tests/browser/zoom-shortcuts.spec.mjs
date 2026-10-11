import { test, expect } from '@playwright/test';

test('canvas bracket zoom matches View commands and leaves typing and menus alone', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => window.canvasHarness.reset());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const canvas = page.getByLabel('Node canvas', { exact: true });
    await canvas.focus();
    const zoom = () => page.evaluate(() => window.canvasHarness.canvas.view.zoom);
    const before = await zoom();
    await page.keyboard.press(']');
    expect(await zoom()).toBeCloseTo(before * 1.15);
    await page.keyboard.press('[');
    expect(await zoom()).toBeCloseTo(before);
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'View', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Zoom in', exact: true }).locator('kbd')).toHaveText(']');
    await expect(page.getByRole('menuitem', { name: 'Zoom out', exact: true }).locator('kbd')).toHaveText('[');
    await page.keyboard.press(']'); expect(await zoom()).toBeCloseTo(before);
    await page.getByRole('menuitem', { name: 'Zoom in', exact: true }).click();
    expect(await zoom()).toBeCloseTo(before * 1.15);
    await page.evaluate(() => window.canvasHarness.canvas.select({ kind: 'node', id: 'n0' }));
    const alias = page.getByLabel('Node name', { exact: true });
    await alias.fill('Name'); await alias.press('['); await alias.press(']');
    await expect(alias).toHaveValue('Name[]');
    expect(await zoom()).toBeCloseTo(before * 1.15);
});
