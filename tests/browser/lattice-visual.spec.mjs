import { rootCommand, expectRootBusy } from './workflow-commands.mjs';
import { test, expect } from '@playwright/test';

async function openNativeWorkspace(page, starter = 'structured-guidance') {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    const graphId = await page.evaluate(async starter => {
        const h = window.canvasHarness;
        const version = (await (await fetch('/manifest.json')).json()).version;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + version);
        const graph = starterGraph(starter);
        await h.activate(graph);
        return graph.id;
    }, starter);

    await page.evaluate(() => window.canvasHarness.settle());
}

for (const width of [1024, 736, 360, 320]) test(`approved Lattice native surfaces and panel placement at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openNativeWorkspace(page);
    const graph = page.locator('.pc-canvas-area');
    const preview = page.locator('.pc-preview-pane');
    const inspector = page.locator('.pc-inspector');
    await expect(inspector).toBeVisible();
    const actual = await page.evaluate(() => {
        const read = selector => {
            const element = document.querySelector(selector), css = getComputedStyle(element), box = element.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, height: box.height, background: css.backgroundColor,
                radius: css.borderTopRightRadius, shadow: css.boxShadow, border: css.borderTopColor, borderWidth: css.borderTopWidth };
        };
        return { graph: read('.pc-canvas-area'), preview: read('.pc-preview-pane'), details: read('.pc-inspector'),
            node: read('.pc-node-native'), panel: read('.pc-root'), canvas: read('.pc-canvas-host'), brand: document.querySelector('.pc-brand').textContent.trim(),
            font: document.fonts.check('600 20px "Bricolage Grotesque"'),
            accent: getComputedStyle(document.querySelector('.pc-graph-tab[aria-selected="true"]')).color,
            overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(actual.brand).toBe('LATTICE');
    expect(actual.font).toBe(true);
    expect(actual.overflow).toBe(false);
    expect(actual.graph.radius).toBe('4px');
    expect(actual.graph.shadow).toContain('inset');
    expect(actual.graph.border).toBe(actual.accent);
    expect(actual.preview.background).toBe(actual.panel.background);
    expect(actual.canvas.background).toBe('rgb(15, 15, 15)');
    expect(actual.node.background).toBe('rgba(40, 40, 40, 0.75)');
    expect(actual.node.radius).toBe('6px');
    expect(actual.node.borderWidth).toBe('0px');
    expect(actual.node.shadow).toContain('0px 1px 2px 0px');
    expect(actual.node.shadow).not.toContain('inset');
    expect(actual.graph.height).toBeGreaterThan(140);
    if (width > 760) {
        expect(actual.details.x).toBeGreaterThanOrEqual(actual.graph.x + actual.graph.width);
        expect(actual.details.width).toBeCloseTo(258, 0);
    } else {
        expect(actual.details.y).toBeGreaterThanOrEqual(actual.graph.y + actual.graph.height);
        expect(actual.details.width).toBeGreaterThan(width - 30);
    }
    expect((await preview.boundingBox()).y).toBeLessThan((await graph.boundingBox()).y);
});

for (const width of [320, 360]) test(`Fit keeps the narrow graph reachable below its floating shelf at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openNativeWorkspace(page);
    const before = await page.evaluate(() => JSON.stringify(window.canvasHarness.graph));
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Fit to view', exact: true }).click();
    await page.evaluate(() => window.canvasHarness.settle());
    const shelf = await page.locator('.pc-node-shelf').boundingBox();
    const cards = await page.locator('.pc-node-native').evaluateAll(elements => elements.map(element => {
        const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom };
    }));
    for (const card of cards) expect(card.top).toBeGreaterThanOrEqual(shelf.y + shelf.height + 8);
    await page.locator('.pc-node-native[data-id="select-fields"]').dblclick();
    await expect(page.locator('.pc-inspector')).toBeVisible();
    const access = await page.locator('.pc-inspector').evaluate(panel => { const rect = panel.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, viewport: innerHeight, pixel: 1/devicePixelRatio, scroll: document.querySelector('.pc-body').scrollTop }; });
    expect(access.top).toBeGreaterThanOrEqual(0); expect(access.bottom).toBeLessThanOrEqual(access.viewport+access.pixel); expect(access.scroll).toBeGreaterThanOrEqual(0);
    const scroll = await page.evaluate(() => { document.querySelector('.pc-body').scrollTop = 0; return { left: window.canvasHarness.canvas.host.scrollLeft, top: window.canvasHarness.canvas.host.scrollTop }; });
    expect(scroll).toEqual({ left: 0, top: 0 });
    const preview = await page.locator('.pc-preview-pane').boundingBox();
    const header = await page.locator('.pc-header').boundingBox();
    expect(preview.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(await page.evaluate(() => JSON.stringify(window.canvasHarness.graph))).toBe(before);
    // Framing is only a camera choice: the full-width canvas still permits content beneath the shelf.
    const size = await page.evaluate(() => ({ canvas: window.canvasHarness.canvas.host.clientWidth,
        graph: document.querySelector('.pc-canvas-area').clientWidth }));
    expect(size.canvas).toBe(size.graph);
    await page.screenshot({ path: testInfo.outputPath(`narrow-fit-${width}.png`) });
});

test('approved floating shelf retains an aligned canonical node menu and quiet shortcodes', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openNativeWorkspace(page);
    const family = page.locator('[data-family="Derive"]');
    await family.click();
    const menu = page.locator('.pc-family-menu');
    await expect(menu).toBeVisible();
    await expect(page.locator('[data-subfamily], .pc-leaf-menu')).toHaveCount(0);
    const [button, drawer] = await Promise.all([family.boundingBox(), menu.boundingBox()]);
    expect(button.width).toBe(128); expect(button.height).toBe(42);
    expect(drawer.width).toBe(250);
    expect(drawer.x - button.x - button.width).toBeCloseTo(3, 0);
    const rows = await page.evaluate(() => {
        const read = element => {
            const box = element.getBoundingClientRect(), icon = element.querySelector('svg').getBoundingClientRect();
            const label = element.querySelector('span');
            return { y: box.y, height: box.height, center: box.y + box.height / 2,
                font: getComputedStyle(label).fontSize, iconWidth: icon.width, iconHeight: icon.height };
        };
        return { family: read(document.querySelector('[data-family="Derive"]')),
            families: [...document.querySelectorAll('.pc-family-row')].map(read),
            choices: [...document.querySelectorAll('.pc-family-menu [data-shelf-choice]')].map(read) };
    });
    for (const collection of [rows.families, rows.choices]) {
        expect(collection.length).toBeGreaterThanOrEqual(2);
        for (const row of collection) expect(row).toMatchObject({ height: 42, iconWidth: 24, iconHeight: 24 });
        for (let index = 1; index < collection.length; index++) expect(collection[index].y - collection[index - 1].y).toBeCloseTo(45, 1);
    }
    expect(rows.family.font).toBe('14px');
    for (const row of rows.choices) expect(row.font).toBe('14px');
    expect(Math.abs(rows.choices[0].center - rows.family.center)).toBeLessThanOrEqual(1);
    const codes = await menu.locator('small').allTextContents();
    expect(codes.some(code => code.trim().length > 0)).toBe(true);
});

test('a selected failed native node keeps its red ring and dimmed interior', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openNativeWorkspace(page);
    await page.evaluate(() => {
        const h = window.canvasHarness;
        h.graph.nodes['compose-json'].sections[0].text = '{broken';
        h.S.save(); h.UI.refreshIfOpen();
    });
    await page.evaluate(() => window.canvasHarness.settle());
    const failed = page.locator('.pc-node-native[data-id="json-decode"]');
    const before = await failed.boundingBox();
    await rootCommand(page);
    await expect(failed).toHaveClass(/pc-trace-failed/);
    await expect(page.locator('.pc-node-native.pc-trace-blocked').first()).toBeVisible();
    await failed.locator('.pc-native-heading').click();
    await expect(failed).toHaveClass(/pc-selected/);
    const paint = await failed.evaluate(node => ({
        border: getComputedStyle(node).borderTopColor,
        ring: getComputedStyle(node).boxShadow,
        opacity: Number(getComputedStyle(node.querySelector('.pc-native-heading')).opacity),
        filter: getComputedStyle(node.querySelector('.pc-native-heading')).filter,
    }));
    expect(paint.border).toBe('rgb(229, 118, 118)');
    expect(paint.ring).toContain('rgb(229, 118, 118)');
    expect(paint.opacity).toBeLessThan(1);
    expect(paint.filter).toContain('grayscale');
    const after = await failed.boundingBox();
    expect(after.width).toBe(before.width); expect(after.height).toBe(before.height);
});
