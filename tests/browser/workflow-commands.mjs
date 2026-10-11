import { expect } from '@playwright/test';

export async function rootCommand(page, command = 'Run workflow') {
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('menuitem', { name: command, exact: true }).click();
}

export async function expectRootBusy(page, busy) {
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    const run = page.getByRole('menuitem', { name: 'Run workflow', exact: true });
    const stop = page.getByRole('menuitem', { name: 'Stop workflow', exact: true });
    if (busy) { await expect(run).toBeDisabled(); await expect(stop).toBeEnabled(); }
    else { await expect(run).toBeEnabled(); await expect(stop).toBeDisabled(); }
    await page.keyboard.press('Escape');
}
