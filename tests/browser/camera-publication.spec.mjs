import { test, expect } from '@playwright/test';

test('pan and zoom preserve the mounted Graph menu while saving the numeric camera', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => window.canvasHarness.reset());
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'Graph', exact: true }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Select tool', exact: true })).toHaveAttribute('aria-checked', 'true');
    const result = await page.evaluate(async () => {
        const h = window.canvasHarness, menu = document.querySelector('[role="menu"][aria-label="Graph"]');
        let mutations = 0;
        const observer = new MutationObserver(records => { mutations += records.length; });
        observer.observe(menu, { subtree: true, childList: true, attributes: true, characterData: true });
        for (const camera of [{ x: 35, y: -20, zoom: 1 }, { x: 80, y: -45, zoom: 1.1 }, { x: 125, y: -70, zoom: 1.25 }]) await h.view(camera);
        observer.disconnect();
        await new Promise(resolve => setTimeout(resolve, 250));
        const saved = h.S.activeWorkspaceViews();
        return { mutations, sameMenu: menu === document.querySelector('[role="menu"][aria-label="Graph"]'), camera: saved.views.find(view => view.identity.kind === 'root').camera };
    });
    expect(result).toEqual({ mutations: 0, sameMenu: true, camera: { x: 125, y: -70, zoom: 1.25 } });
    await page.getByRole('menuitemradio', { name: 'Pan tool', exact: true }).click();
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'Graph', exact: true }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Pan tool', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('menuitemradio', { name: 'Select tool', exact: true })).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('menuitemradio', { name: 'Select tool', exact: true }).click();
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'Graph', exact: true }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Select tool', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('menuitemradio', { name: 'Pan tool', exact: true })).toHaveAttribute('aria-checked', 'false');
});
