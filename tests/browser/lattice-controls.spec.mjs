import { test, expect } from '@playwright/test';

async function openWorkspace(page) {
    await page.goto('/tests/browser/harness.html?hostCss=1');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const { fixtureGraph } = await import('/tests/helpers/workflow-fixtures.mjs');
        await window.canvasHarness.activate(fixtureGraph('structured-guidance'));
        await window.canvasHarness.settle();
    });
}

test('panel icon buttons follow panel visibility and accent only their outlines', async ({ page }) => {
    await openWorkspace(page);
    const preview = page.getByRole('button', { name: 'Toggle Preview Panel', exact: true });
    const details = page.getByRole('button', { name: 'Toggle Details Panel', exact: true });
    await expect(preview).toHaveAttribute('title', 'Toggle Preview Panel');
    await expect(details).toHaveAttribute('title', 'Toggle Details Panel');
    const buttons = page.locator('.pc-surface-actions button');
    await expect(buttons.nth(0)).toHaveAttribute('title', 'Toggle Preview Panel');
    await expect(buttons.nth(1)).toHaveAttribute('title', 'Toggle Details Panel');
    for (const [button, panel] of [[preview, '.pc-preview-content'], [details, '.pc-inspector']]) {
        await expect(button.locator('svg')).toHaveCount(1);
        await expect(button).toHaveText('');
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await page.mouse.move(0, 0);
        const enabled = await button.evaluate(element => {
            const css = getComputedStyle(element);
            return { color: css.color, background: css.backgroundColor, border: css.borderTopColor };
        });
        const accent = await page.locator('.pc-graph-tab[aria-selected="true"]').evaluate(element => getComputedStyle(element).color);
        expect(enabled.border).toBe(accent);
        await button.click();
        await page.mouse.move(0, 0);
        await expect(button).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator(panel)).toBeHidden();
        const disabled = await button.evaluate(element => {
            const css = getComputedStyle(element);
            return { color: css.color, background: css.backgroundColor, border: css.borderTopColor };
        });
        expect(disabled.color).toBe(enabled.color);
        expect(disabled.background).toBe(enabled.background);
        expect(disabled.border).not.toBe(enabled.border);
        await button.click();
        await expect(page.locator(panel)).toBeVisible();
    }
});

test('flat enable switch stays synchronized with right-click and current theme', async ({ page }) => {
    await openWorkspace(page);
    const control = page.getByRole('switch', { name: 'Enable Lattice', exact: true });
    await expect(control).not.toBeChecked();
    const offThumb = await control.evaluate(element => getComputedStyle(element, '::before').transform);
    await control.focus();
    await control.press('Space');
    await expect(control).toBeChecked();
    await expect.poll(() => control.evaluate(element => getComputedStyle(element, '::before').transform)).toBe('matrix(1, 0, 0, 1, 18, 0)');
    const launcher = page.locator('#pc-sendbar');
    await expect(launcher).toHaveClass(/pc-sendbar-on/);
    const geometry = await control.evaluate(element => {
        const css = getComputedStyle(element), thumb = getComputedStyle(element, '::before');
        return { radius: css.borderTopLeftRadius, shadow: css.boxShadow, filter: css.filter, thumbRadius: thumb.borderTopLeftRadius, thumbShadow: thumb.boxShadow, thumbClip: thumb.clipPath, thumbTransform: thumb.transform };
    });
    expect(geometry.radius).toBe('4px');
    expect(geometry.thumbRadius).toBe('4px');
    expect(geometry.shadow).toBe('none');
    expect(geometry.thumbShadow).toBe('none');
    expect(geometry.filter).toBe('none');
    expect(geometry.thumbClip).toBe('none');
    expect(offThumb).toBe('matrix(1, 0, 0, 1, 0, 0)');
    expect(geometry.thumbTransform).toBe('matrix(1, 0, 0, 1, 18, 0)');
    await page.evaluate(async () => {
        const version = (await (await fetch('/manifest.json')).json()).version;
        const theme = await import(`/src/theme.js?v=${version}`);
        theme.setColor('flow', '#65c8e6');
    });
    await expect(launcher).toHaveCSS('color', 'rgb(101, 200, 230)');
    await expect(control).toHaveCSS('background-color', 'rgb(101, 200, 230)');
    await launcher.evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    await expect(control).not.toBeChecked();
    await expect(launcher).not.toHaveClass(/pc-sendbar-on/);
    await control.press('Space');
    await expect(control).toBeChecked();
    await expect(launcher).toHaveCSS('color', 'rgb(101, 200, 230)');
});
