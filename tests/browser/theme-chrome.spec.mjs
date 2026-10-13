import { test, expect } from '@playwright/test';
import { openEmber, approvedEmber, assertColor, colorChannels } from './ember-fixture.mjs';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

function textContrast(foreground, background) {
    const luminance = color => colorChannels(color).slice(0, 3).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

async function readChrome(page) {
    return page.evaluate(() => {
        const root = document.querySelector('.pc-root');
        const probe = document.createElement('span'); root.append(probe);
        const resolve = value => { probe.style.color = value; return getComputedStyle(probe).color; };
        const roles = Object.fromEntries(['panel-solid', 'text', 'muted', 'control', 'border', 'accent', 'on-accent', 'scrollbar-thumb', 'scrollbar-track'].map(role => [role, resolve(`var(--pc-${role})`)]));
        probe.remove();
        const read = element => {
            const css = getComputedStyle(element);
            return { scheme: css.colorScheme, scrollbar: css.scrollbarColor, width: css.scrollbarWidth,
                thumb: getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
                track: getComputedStyle(element, '::-webkit-scrollbar-track').backgroundColor,
                shadow: css.boxShadow, image: css.backgroundImage, filter: css.filter, textShadow: css.textShadow,
                color: css.color, background: css.backgroundColor, border: css.borderTopColor,
                scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
        };
        return { roles, root: read(root), scrolls: Object.fromEntries(['.pc-preview-content', '.pc-preview-sections', '.pc-inspector', '.pc-inspector textarea', '.pc-workspace-dialog', '.pc-node-shelf'].map(selector => [selector, read(document.querySelector(selector))])),
            shells: ['.pc-preview-pane', '.pc-inspector', '.pc-canvas-area', '.pc-graph-tab', '.pc-workspace-dialog'].map(selector => ({ selector, ...read(document.querySelector(selector)) })),
            controls: [...root.querySelectorAll('button, input:not([type="checkbox"]), textarea, select')].filter(element => !element.matches(':focus')).map(read),
            frameEffects: ['.pc-preview-pane', '.pc-canvas-area'].map(selector => getComputedStyle(document.querySelector(selector), '::after').boxShadow),
            host: read(document.querySelector('#theme-host-sentinel')), hostButton: read(document.querySelector('#theme-host-sentinel button')),
            graph: JSON.stringify(window.canvasHarness.graph), calls: window.canvasHarness.providerCalls() };
    });
}

test('workspace scrollbars and flat chrome follow live dark and light themes without styling the host', async ({ page }, testInfo) => {
    await openEmber(page, { url: '/tests/browser/harness.html?hostCss=1' });
    await page.evaluate(() => {
        const host = document.createElement('style'); host.textContent = `
            * { scrollbar-color: rgb(210, 20, 150) rgb(70, 10, 90); }
            button, input, textarea, select { background-image: linear-gradient(#fff4, #0004); filter: drop-shadow(0 1px 1px #0008); text-shadow: 0 1px #000; box-shadow: inset 1px 1px #fff4; }
        `;
        document.head.insertBefore(host, document.querySelector('link[rel="stylesheet"]'));
        const sentinel = document.createElement('div'); sentinel.id = 'theme-host-sentinel'; sentinel.innerHTML = '<button>Host control</button>';
        sentinel.style.cssText = 'position:fixed;left:-10000px;width:30px;height:20px;overflow:auto'; document.body.append(sentinel);
        for (const selector of ['.pc-preview-content', '.pc-inspector']) {
            const filler = document.createElement('div'); filler.style.height = '1800px'; document.querySelector(selector).append(filler);
        }
        const textarea = document.querySelector('.pc-inspector textarea'); textarea.value = Array.from({ length: 60 }, (_, index) => 'Scrollable text ' + index).join('\n');
    });
    await page.getByRole('menuitem', { name: 'Help', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Workspace guide', exact: true }).click();
    await page.mouse.move(0, 0);
    const initial = await readChrome(page);
    for (const selector of ['.pc-preview-content', '.pc-inspector', '.pc-inspector textarea']) expect(initial.scrolls[selector].scrollHeight, selector + ' overflows').toBeGreaterThan(initial.scrolls[selector].clientHeight);
    const themes = [
        { scheme: 'dark', tokens: null },
        { scheme: 'dark', tokens: { ...approvedEmber.settings.tokens, SmartThemeBlurTintColor: 'rgb(18, 20, 25)', SmartThemeBodyColor: 'rgb(201, 216, 238)', SmartThemeEmColor: 'rgb(119, 128, 150)', SmartThemeQuoteColor: 'rgb(238, 153, 66)', SmartThemeBotMesBlurTintColor: 'rgb(39, 43, 50)', SmartThemeUserMesBlurTintColor: 'rgb(33, 38, 46)' } },
        { scheme: 'light', tokens: { ...approvedEmber.settings.tokens, SmartThemeBlurTintColor: 'rgb(242, 240, 234)', SmartThemeBodyColor: 'rgb(32, 35, 40)', SmartThemeEmColor: 'rgb(91, 98, 111)', SmartThemeQuoteColor: 'rgb(186, 87, 20)', SmartThemeBorderColor: 'rgb(168, 166, 159)', SmartThemeBotMesBlurTintColor: 'rgb(224, 222, 216)', SmartThemeUserMesBlurTintColor: 'rgb(250, 249, 245)' } },
    ];
    for (const { scheme, tokens } of themes) {
        if (tokens) await page.evaluate(tokens => {
            document.getElementById('ember-host-theme').textContent = ':root{' + Object.entries(tokens).map(([key, value]) => '--' + key + ':' + value + ';').join('') + '}';
        }, tokens);
        const beforeTheme = await readChrome(page);
        if (tokens) await page.evaluate(async () => {
            const theme = await import('/src/theme.js?v=' + window.canvasHarness.version); theme.applyTheme(); await window.canvasHarness.settle();
        });
        const chrome = await readChrome(page);
        expect(chrome.root.scheme).toBe(scheme);
        for (const [selector, paint] of Object.entries(chrome.scrolls)) {
            expect(paint.scheme, selector).toBe(scheme);
            expect(paint.scrollbar, selector).toBe(chrome.roles['scrollbar-thumb'] + ' ' + chrome.roles['scrollbar-track']);
            expect(paint.width, selector).toBe('thin');
            assertColor(paint.thumb, chrome.roles['scrollbar-thumb'], selector + ' thumb');
            assertColor(paint.track, chrome.roles['scrollbar-track'], selector + ' track');
        }
        for (const { selector, shadow } of chrome.shells) expect(shadow, selector + ' flat shell').toBe('none');
        expect(chrome.frameEffects).toEqual(['none', 'none']);
        for (const paint of chrome.controls) {
            expect(paint.image).toBe('none'); expect(paint.filter).toBe('none'); expect(paint.textShadow).toBe('none'); expect(paint.shadow).not.toContain('inset');
        }
        expect(chrome.host).toEqual(beforeTheme.host); expect(chrome.hostButton).toEqual(beforeTheme.hostButton);
        expect(chrome.graph).toBe(initial.graph); expect(chrome.calls).toBe(0);
        if (tokens) expect(chrome.scrolls['.pc-preview-content'].scrollbar).not.toBe(initial.scrolls['.pc-preview-content'].scrollbar);
        await page.screenshot({ path: testInfo.outputPath('flat-chrome-' + scheme + (tokens ? '-alternate' : '') + '.png'), animations: 'disabled' });
    }
});

test('context menu chrome uses the current theme while action icons retain their semantic colors', async ({ page }) => {
    const ids = await openEmber(page);
    await page.evaluate(async () => {
        const theme = await import('/src/theme.js?v=' + window.canvasHarness.version);
        theme.setPreset('slate');
    });
    await page.locator('.pc-node-native[data-id="' + ids.firstCompose + '"] .pc-native-heading').click({ button: 'right' });
    const menu = page.locator('.pc-context-menu'); await expect(menu).toBeVisible();
    const paint = await menu.evaluate(element => {
        const css = getComputedStyle(element), probe = document.createElement('span'); element.append(probe);
        const resolve = role => { probe.style.color = `var(--pc-${role})`; return getComputedStyle(probe).color; };
        const result = { background: css.backgroundColor, color: css.color, border: css.borderTopColor,
            roles: Object.fromEntries(['panel-solid', 'text', 'border', 'control'].map(role => [role, resolve(role)])),
            icons: [...element.querySelectorAll('[data-tone] > .pc-context-icon')].map(icon => getComputedStyle(icon).color) };
        probe.remove(); return result;
    });
    expect(paint.background).toBe(paint.roles['panel-solid']); expect(paint.color).toBe(paint.roles.text); expect(paint.border).toBe(paint.roles.border);
    expect(paint.icons.some(color => color !== paint.color)).toBe(true);
    const item = menu.locator('button:enabled').first(); await item.hover(); await expect(item).toHaveCSS('background-color', paint.roles.control);
});

test('real overflowing preview keeps flat chrome, orange toggles and themed native controls', async ({ page }, testInfo) => {
    const ids = await openEmber(page, { url: '/tests/browser/harness.html?hostCss=1' });
    await page.evaluate(async id => {
        const h = window.canvasHarness;
        h.graph.nodes[id].sections[0].text = Array.from({ length: 40 }, (_, index) => `Scene note ${index + 1}: Mara waits beside the harbor. Use \`scene_context\` to keep the response grounded.`).join('\n\n');
        h.S.save(); h.UI.refreshIfOpen(); await h.settle(); h.canvas.select({ kind: 'node', id });
    }, ids.firstCompose);
    await page.locator('.pc-output-preview [data-run-here]').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    const preview = page.locator('.pc-preview-sections');
    await expect.poll(() => preview.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(100);
    const code = preview.locator('code').first(); await expect(code).toBeVisible();
    const codePaint = await code.evaluate(element => {
        const css = getComputedStyle(element), probe = document.createElement('span'); element.append(probe);
        const resolve = role => { probe.style.color = `var(--pc-${role})`; return getComputedStyle(probe).color; };
        const result = { color: css.color, background: css.backgroundColor, border: css.borderTopColor, font: css.fontFamily,
            roles: Object.fromEntries(['text', 'field', 'border'].map(role => [role, resolve(role)])) }; probe.remove(); return result;
    });
    expect(codePaint.color).toBe(codePaint.roles.text); expect(codePaint.background).toBe(codePaint.roles.field); expect(codePaint.border).toBe(codePaint.roles.border); expect(codePaint.font).toMatch(/mono/i);
    await page.mouse.move(0, 0);
    await expect(page.locator('.pc-inspector')).toBeVisible();
    await expect(page.locator('.pc-pane-toggle[aria-pressed="true"]')).toHaveCount(2);
    expect(await preview.evaluate(element => getComputedStyle(element).colorScheme)).toBe('dark');
    expect(await page.getByRole('separator', { name: 'Resize preview', exact: true }).evaluate(element => getComputedStyle(element, '::after').width)).toBe('38px');
    const checkbox = page.locator('.pc-inspector input[type="checkbox"]').first(); await expect(checkbox).toBeVisible();
    const native = await checkbox.evaluate(element => ({ appearance: getComputedStyle(element).appearance, before: getComputedStyle(element, '::before').content, accent: getComputedStyle(element).accentColor }));
    expect(native.appearance).toBe('auto'); expect(native.before).toBe('none'); expect(native.accent).toBe('rgb(225, 138, 36)');
    await page.screenshot({ path: testInfo.outputPath('gaea-flat-workspace.png'), animations: 'disabled' });
    await page.screenshot({ path: '.tmp/gaea-flat-workspace.png', animations: 'disabled' });
    const canvas = await page.locator('.pc-canvas-host').boundingBox();
    await page.mouse.click(canvas.x + canvas.width - 30, canvas.y + canvas.height - 30, { button: 'right' });
    const search = page.getByRole('dialog', { name: 'Add node', exact: true }); await expect(search).toBeVisible();
    const text = search.locator('input[type="search"]'); await expect(text).toBeFocused(); expect(await text.evaluate(element => getComputedStyle(element).boxShadow)).not.toContain('inset');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

for (const palette of [
    { name: 'dark text', tokens: { SmartThemeBlurTintColor: 'rgb(242, 240, 234)', SmartThemeChatTintColor: 'rgb(242, 240, 234)', SmartThemeBodyColor: 'rgb(32, 35, 40)', SmartThemeEmColor: 'rgb(91, 98, 111)', SmartThemeQuoteColor: 'rgb(186, 87, 20)', SmartThemeBorderColor: 'rgb(168, 166, 159)', SmartThemeBotMesBlurTintColor: 'rgb(224, 222, 216)', SmartThemeUserMesBlurTintColor: 'rgb(250, 249, 245)' } },
    { name: 'gray text', tokens: { SmartThemeBlurTintColor: '#ffffff', SmartThemeChatTintColor: '#ffffff', SmartThemeBodyColor: '#666666', SmartThemeEmColor: '#666666', SmartThemeQuoteColor: '#ba5714', SmartThemeBorderColor: '#a8a69f', SmartThemeBotMesBlurTintColor: '#eeeeee', SmartThemeUserMesBlurTintColor: '#eeeeee' } },
]) test(`real failed Run details remain readable on light theme ${palette.name} surfaces`, async ({ page }, testInfo) => {
    const tokens = { ...approvedEmber.settings.tokens, ...palette.tokens };
    const ids = await openEmber(page, { tokens });
    await page.evaluate(() => window.canvasHarness.canvas.select({ kind: 'node', id: 'guidance' }));
    await page.locator('.pc-output-preview [data-run-here]').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    await page.locator('.pc-run-meter').click(); await page.mouse.move(0, 0);
    const completed = await page.locator('.pc-run-details').evaluate(element => [...element.querySelectorAll('.pc-run-status[data-status="completed"]')].map(status => ({ color: getComputedStyle(status).color, surface: getComputedStyle(status.closest('li') ?? element.closest('.pc-workspace-dialog')).backgroundColor })));
    expect(completed.length).toBeGreaterThan(1);
    for (const status of completed) expect(textContrast(status.color, status.surface), 'completed status').toBeGreaterThanOrEqual(4.5);
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.evaluate(async id => {
        const h = window.canvasHarness; h.graph.nodes[id].sections[0].text = '{broken';
        h.S.save(); h.UI.refreshIfOpen(); await h.settle(); h.canvas.select({ kind: 'node', id: 'guidance' });
    }, ids.firstCompose);
    await page.locator('.pc-output-preview [data-run-here]').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Failed');
    await page.locator('.pc-run-meter').click();
    await expect(page.getByRole('region', { name: 'Run details', exact: true })).toBeVisible();
    await page.mouse.move(0, 0);
    const paint = await page.locator('.pc-run-details').evaluate(element => {
        const css = getComputedStyle(element), probe = document.createElement('span'); element.append(probe);
        const resolve = role => { probe.style.color = `var(--pc-${role})`; return getComputedStyle(probe).color; };
        const roles = Object.fromEntries(['text', 'muted', 'field', 'control', 'panel-solid', 'error'].map(role => [role, resolve(role)])); probe.remove();
        const read = element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor });
        return { roles, scheme: css.colorScheme,
            rows: [...element.querySelectorAll('li[data-run-row]')].map(row => ({ status: row.dataset.status, ...read(row), title: read(row.querySelector('button')), quiet: read(row.querySelector('small')), statusText: read(row.querySelector('.pc-run-status')) })),
            diagnostics: [...element.querySelectorAll('.pc-diagnostic[data-severity="error"]')].map(issue => ({ ...read(issue), surface: issue.closest('li') ? getComputedStyle(issue.closest('li')).backgroundColor : roles['panel-solid'] })),
            overall: read(element.querySelector('header .pc-run-status')), calls: window.canvasHarness.providerCalls() };
    });
    expect(paint.scheme).toBe('light'); expect(paint.calls).toBe(0);
    const failed = paint.rows.find(row => row.status === 'failed'); expect(failed).toBeDefined();
    expect(failed.background).toBe(paint.roles.field);
    expect(paint.rows.some(row => row.status === 'completed')).toBe(true);
    expect(paint.rows.some(row => row.status === 'blocked')).toBe(true);
    for (const row of paint.rows) {
        expect(row.title.color).toBe(paint.roles.text); expect(row.quiet.color).toBe(paint.roles.muted);
        expect(textContrast(row.title.color, row.background), row.status + ' title').toBeGreaterThanOrEqual(4.5);
        expect(textContrast(row.quiet.color, row.background), row.status + ' metadata').toBeGreaterThanOrEqual(4.5);
        expect(textContrast(row.statusText.color, row.background), row.status + ' status').toBeGreaterThanOrEqual(4.5);
    }
    expect(textContrast(paint.overall.color, paint.roles['panel-solid']), 'overall failure status').toBeGreaterThanOrEqual(4.5);
    expect(paint.diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of paint.diagnostics) expect(textContrast(diagnostic.color, diagnostic.surface), 'failure diagnostic').toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: testInfo.outputPath('light-run-failure.png'), animations: 'disabled' });
});
