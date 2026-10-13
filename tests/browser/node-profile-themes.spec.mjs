import { test, expect } from '@playwright/test';
import { openEmber, assertColor, colorChannels } from './ember-fixture.mjs';

const profile = page => page.locator('.pc-node-profile[data-id="plan"]');

async function fixture(page) {
    await openEmber(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness, c = h.context;
        c.mainApi = 'openai';
        c.chatCompletionSettings.chat_completion_source = 'nanogpt';
        c.chatCompletionSettings.current_model = 'active-model';
        c.getChatCompletionModel = settings => settings.current_model;
        c.CONNECT_API_MAP = { nanogpt: { selected: 'openai', source: 'nanogpt', label: 'NanoGPT' } };
        c.extensionSettings.connectionManager = { profiles: [
            { id: 'saved', name: 'Reasoning connection with a long profile name', api: 'nanogpt', model: 'reasoning-model', preset: null },
            ...Array.from({ length: 12 }, (_, index) => ({ id: 'extra-' + index, name: 'Fast connection ' + index, api: 'nanogpt', model: 'compact-model-' + index, preset: null })),
        ] };
        c.ConnectionManagerRequestService.getProfile = id => c.extensionSettings.connectionManager.profiles.find(row => row.id === id);
        await h.activate({ id: 'profile-theme-root', name: 'Themed profiles', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, definitions: {}, groups: {}, portals: {}, wires: {}, nodes: {
            plan: { id: 'plan', type: 'workflow', operation: 'response-plan', profileId: 'saved', x: 230, y: 90 },
        } });
        await h.view({ x: 160, y: 100, zoom: 1 }); h.canvas.select(null);
    });
}

async function themePicker(page, name = 'Ash') {
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Theme and colours…', exact: true }).click();
    const picker = page.locator('.pc-theme-pop');
    await picker.locator('.pc-th-preset').filter({ has: page.locator('.pc-th-name', { hasText: new RegExp('^' + name + '$') }) }).click();
    return picker;
}

async function paint(page) {
    return profile(page).evaluate(root => {
        const read = selector => {
            const element = root.querySelector(selector), css = getComputedStyle(element);
            return { color: css.color, background: css.backgroundColor, border: css.borderTopColor, borderWidth: css.borderTopWidth, radius: css.borderRadius, font: css.fontFamily, outline: css.outlineColor, outlineStyle: css.outlineStyle, outlineWidth: css.outlineWidth, outlineOffset: css.outlineOffset, shadow: css.boxShadow, filter: css.filter, textShadow: css.textShadow, margin: css.margin, overflow: css.overflow, scheme: css.colorScheme };
        };
        const resolve = value => {
            const probe = document.createElement('span'); probe.style.color = value; root.append(probe);
            const result = getComputedStyle(probe).color; probe.remove(); return result;
        };
        return {
            bar: read('.profile-bar'), menu: read('.profile-menu'), search: read('.profile-search'), input: read('.profile-search input'), model: read('.node-model-meta'), metadata: read('.profile-meta'), selected: read('.profile-option[aria-selected="true"]'), active: read('.profile-option.is-active'),
            placeholder: getComputedStyle(root.querySelector('.profile-search input'), '::placeholder').color,
            searchIcon: getComputedStyle(root.querySelector('.profile-search svg')).color,
            scrollbarThumb: getComputedStyle(root.querySelector('.profile-options'), '::-webkit-scrollbar-thumb').backgroundColor,
            scrollbarTrack: getComputedStyle(root.querySelector('.profile-options'), '::-webkit-scrollbar-track').backgroundColor,
            roles: Object.fromEntries(['text', 'muted', 'border', 'control', 'field', 'accent', 'error', 'scrollbar-thumb', 'scrollbar-track'].map(key => [key, resolve('var(--pc-' + key + ')')])),
            panel: resolve('rgb(from var(--pc-panel-solid) r g b / 1)'),
            selectedBackground: resolve('color-mix(in srgb, var(--pc-accent) 14%, rgb(from var(--pc-panel-solid) r g b / 1))'),
            font: getComputedStyle(root.closest('.pc-root')).fontFamily,
        };
    });
}

function assertPaint(result) {
    assertColor(result.bar.background, result.roles.control, 'profile bar uses themed control');
    assertColor(result.bar.border, result.roles.border, 'profile bar uses themed border');
    assertColor(result.bar.color, result.roles.text, 'profile bar text');
    assertColor(result.menu.background, result.panel, 'opaque themed popup');
    assertColor(result.menu.border, result.roles.border, 'profile popup border');
    assertColor(result.search.background, result.roles.field, 'profile search surface');
    assertColor(result.input.color, result.roles.text, 'profile search text');
    assertColor(result.placeholder, result.roles.muted, 'profile search placeholder');
    assertColor(result.searchIcon, result.roles.muted, 'profile search icon');
    assertColor(result.scrollbarThumb, result.roles['scrollbar-thumb'], 'profile scrollbar uses shared thumb');
    assertColor(result.scrollbarTrack, result.roles['scrollbar-track'], 'profile scrollbar uses shared track');
    assertColor(result.model.color, result.roles.muted, 'model text');
    assertColor(result.metadata.color, result.roles.muted, 'profile metadata');
    assertColor(result.selected.color, result.roles.text, 'selected profile text');
    assertColor(result.selected.background, result.selectedBackground, 'selected profile accent');
    assertColor(result.active.outline, result.roles.accent, 'keyboard profile accent');
    expect(result.active.outlineStyle).toBe('solid');
    expect(result.active.outlineWidth).toBe('2px');
    expect(result.active.outlineOffset).toBe('-2px');
    expect(result.menu.overflow).toBe('hidden');
    for (const control of [result.bar, result.menu, result.selected]) expect(control.radius).toBe('4px');
    for (const control of [result.bar, result.input, result.selected]) {
        expect(control.font).toBe(result.font);
        expect(control.filter).toBe('none');
        expect(control.textShadow).toBe('none');
        expect(control.margin).toBe('0px');
    }
    expect(result.input.background).toBe('rgba(0, 0, 0, 0)');
    expect(result.input.shadow).toBe('none');
    expect(result.input.borderWidth).toBe('0px');
    expect(result.selected.shadow).toBe('none');
}

for (const name of ['Ember', 'Lattice', 'Ash', 'Graphite', 'Slate', 'Obsidian', 'Harbor', 'Signal']) {
    test('node profile controls follow the actual ' + name + ' theme picker', async ({ page }, testInfo) => {
        await fixture(page);
        const picker = await themePicker(page, name);
        await picker.locator('.pc-theme-pop-close').click();
        await profile(page).locator('.profile-bar').click();
        await profile(page).getByRole('combobox').press('ArrowUp');
        await page.mouse.move(0, 0);
        const result = await paint(page); assertPaint(result);
        if (name === 'Signal') {
            for (const value of [result.bar.background, result.selected.background, result.active.outline]) {
                const channels = colorChannels(value).slice(0, 3);
                expect(channels[0]).toBeCloseTo(channels[1], 3); expect(channels[1]).toBeCloseTo(channels[2], 3);
            }
        }
        expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
        await page.screenshot({ path: testInfo.outputPath(name.toLowerCase() + '-profile-dropdown.png'), animations: 'disabled' });
    });
}

test('profile controls follow custom light colors and font without changing host styles', async ({ page }) => {
    await fixture(page);
    await page.addStyleTag({ content: 'button,input{box-shadow:0 0 8px red;filter:drop-shadow(0 0 2px red);text-shadow:1px 1px red;margin:6px} body>button{color:#123456;background:#abcdef;border:2px solid #654321;border-radius:11px}' });
    await page.evaluate(() => { const sentinel = document.createElement('button'); sentinel.id = 'profile-host-sentinel'; sentinel.textContent = 'Host sentinel'; document.body.append(sentinel); });
    const hostBefore = await page.locator('#profile-host-sentinel').evaluate(element => { const css = getComputedStyle(element); return [css.color, css.backgroundColor, css.borderColor, css.borderRadius, css.boxShadow, css.filter]; });
    const picker = await themePicker(page);
    await picker.locator('.pc-th-custom summary').click();
    for (const [label, color] of [['Panel background', '#f7f1e7'], ['Block background', '#e7dece'], ['Canvas background', '#e1d8c8'], ['Borders', '#78664e'], ['Text', '#241c14'], ['Quiet text', '#685542'], ['Selection accent', '#7d3508']]) {
        await picker.locator('.pc-th-row').filter({ has: page.locator('.pc-th-label', { hasText: new RegExp('^' + label + '$') }) }).locator('input').fill(color);
    }
    await picker.locator('.pc-th-look summary').click();
    await picker.locator('.pc-th-look-row').filter({ has: page.locator('.pc-th-label', { hasText: /^Font$/ }) }).locator('select').selectOption('mono');
    await picker.locator('.pc-theme-pop-close').click();
    await profile(page).locator('.profile-bar').click();
    await profile(page).getByRole('combobox').press('ArrowUp');
    await page.mouse.move(0, 0);
    const result = await paint(page); assertPaint(result);
    expect(result.menu.scheme).toBe('light');
    expect(result.font).toContain('Cascadia Mono');
    await page.evaluate(() => { window.canvasHarness.canvas.hooks.editProfile = () => ({ ok: false, error: { code: 'UNAVAILABLE', message: 'Connection profile is unavailable. Private reply body: hidden-profile-content.' } }); });
    await profile(page).getByRole('option').first().click();
    const error = profile(page).locator('.profile-error .pc-diagnostic[data-severity="error"]');
    await expect(error.locator(':scope > p')).toContainText('Lattice could not complete this action.');
    await expect(error).not.toContainText('Connection profile is unavailable');
    await expect(error).not.toContainText('hidden-profile-content');
    const technical = error.locator('details');
    await expect(technical).toHaveCount(1);
    await expect(technical).not.toHaveAttribute('open', '');
    await expect(technical.locator('code')).toBeHidden();
    await technical.getByText('Technical details', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(technical).toHaveAttribute('open', '');
    await expect(technical.locator('code')).toHaveText('UNAVAILABLE');
    await expect(technical.locator('p')).toHaveText('No safe technical description is available for this error.');
    await expect(error).not.toContainText('Connection profile is unavailable');
    await expect(error).not.toContainText('hidden-profile-content');
    assertColor(await error.evaluate(element => getComputedStyle(element).color), result.roles.error, 'profile edit error');
    const hostAfter = await page.locator('#profile-host-sentinel').evaluate(element => { const css = getComputedStyle(element); return [css.color, css.backgroundColor, css.borderColor, css.borderRadius, css.boxShadow, css.filter]; });
    expect(hostAfter).toEqual(hostBefore);
});

test('profile popup hides canvas content under translucent SillyTavern panels and exposes themed keyboard focus', async ({ page }) => {
    await fixture(page);
    await page.evaluate(() => {
        const style = document.getElementById('ember-host-theme'); style.textContent += ':root{--SmartThemeBlurTintColor:rgba(40,50,60,.45)}';
    });
    const bar = profile(page).locator('.profile-bar');
    await bar.focus(); await bar.press('ArrowDown');
    await profile(page).getByRole('combobox').press('Escape');
    const focused = await bar.evaluate(element => { const css = getComputedStyle(element); return { visible: element.matches(':focus-visible'), color: css.outlineColor, width: css.outlineWidth, offset: css.outlineOffset }; });
    expect(focused.visible).toBe(true); expect(focused.width).toBe('2px'); expect(focused.offset).toBe('2px');
    await bar.press('ArrowDown'); await profile(page).getByRole('combobox').press('ArrowUp');
    await page.mouse.move(0, 0);
    const result = await paint(page); assertPaint(result); assertColor(focused.color, result.roles.accent, 'bar keyboard focus');
    expect(colorChannels(result.menu.background)[3]).toBe(1);
    assertColor(result.menu.background, '#28323c', 'opaque live host panel RGB');
});
