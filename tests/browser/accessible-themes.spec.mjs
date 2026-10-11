import { rootCommand, expectRootBusy } from './workflow-commands.mjs';
import { test, expect } from '@playwright/test';
import { openEmber, measureEmber, assertEmber, colorChannels } from './ember-fixture.mjs';

test('the actual theme picker offers the eight approved themes and shows readable accessible pin cues', async ({ page }, testInfo) => {
    await openEmber(page);
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Theme and colours', exact: true }).click();
    const picker = page.locator('.pc-theme-pop');
    await expect(picker).toBeVisible();
    expect(await picker.locator('.pc-th-name').allTextContents()).toEqual(['Ember', 'Lattice', 'Ash', 'Graphite', 'Slate', 'Obsidian', 'Harbor', 'Signal']);
    for (const name of ['Harbor', 'Signal']) {
        await picker.locator('.pc-th-preset').filter({ has: page.locator('.pc-th-name', { hasText: name }) }).click();
        await expect(picker.locator('.pc-th-kind-legend li')).toHaveCount(8);
        const cues = await picker.locator('.pc-th-pin-cue').evaluateAll(elements => elements.map(e => ({ kind: e.dataset.kind, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height, shape: getComputedStyle(e).clipPath })));
        expect(cues.every(cue => cue.width >= 10 && cue.height >= 10)).toBe(true);
        expect(cues.find(cue => cue.kind === 'guidance').shape).toContain('polygon');
        await picker.screenshot({ path: testInfo.outputPath(name.toLowerCase() + '-theme-picker.png') });
    }
    await picker.locator('.pc-th-preset').filter({ has: page.locator('.pc-th-name', { hasText: 'Ember' }) }).click();
    await expect(picker.locator('.pc-th-kind-legend')).toHaveCount(0);
});

test('example thumbnails follow accessible palettes and shapes, then restore Ember without editing authored comment colors', async ({ page }, testInfo) => {
    await openEmber(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click();
    const examples = page.getByRole('dialog', { name: 'Examples', exact: true });
    await expect(examples).toBeVisible();
    const authoredColors = await examples.locator('.pc-example-comment rect').evaluateAll(elements => elements.map(e => e.style.stroke));
    expect(authoredColors.length).toBeGreaterThan(0);
    for (const preset of ['harbor', 'signal']) {
        await page.evaluate(async preset => {
            const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
            T.setPreset(preset); await h.settle();
        }, preset);
        const paint = await examples.evaluate(e => {
            const cue = kind => getComputedStyle(e.querySelector('.pc-example-pin-cue[data-kind="' + kind + '"]'));
            const data = cue('data'), text = cue('text');
            return { dot: getComputedStyle(e.querySelector('.pc-example-pin-dot')).display, cue: data.display, data: data.fill, text: text.fill, ring: text.stroke, ringWidth: text.strokeWidth, comments: [...e.querySelectorAll('.pc-example-comment rect')].map(rect => getComputedStyle(rect).stroke) };
        });
        expect(paint.dot).toBe('none');
        expect(paint.cue).not.toBe('none');
        expect(paint.text).toBe('none');
        expect(paint.ringWidth).toBe('2px');
        expect(paint.data).toBe(preset === 'harbor' ? 'rgb(86, 180, 233)' : 'rgb(242, 242, 242)');
        expect(paint.ring).toBe(preset === 'harbor' ? 'rgb(230, 159, 0)' : 'rgb(242, 242, 242)');
        if (preset === 'signal') expect(new Set(paint.comments)).toEqual(new Set(['rgb(208, 208, 208)']));
        await examples.screenshot({ path: testInfo.outputPath(preset + '-examples.png') });
    }
    await page.evaluate(async () => {
        const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
        T.setPreset('ember'); await h.settle();
    });
    expect(await examples.locator('.pc-example-pin-dot').first().evaluate(e => getComputedStyle(e).display)).not.toBe('none');
    expect(await examples.locator('.pc-example-pin-cue').first().evaluate(e => getComputedStyle(e).display)).toBe('none');
    expect(await examples.locator('.pc-example-comment rect').evaluateAll(elements => elements.map(e => e.style.stroke))).toEqual(authoredColors);
    expect(await examples.locator('.pc-example-comment rect').evaluateAll(elements => elements.map(e => getComputedStyle(e).stroke))).not.toEqual(authoredColors.map(() => 'rgb(208, 208, 208)'));
});

test('Signal node search keeps family labels and keyboard selection neutral', async ({ page }) => {
    await openEmber(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
        T.setPreset('signal'); await h.settle();
    });
    const box = await page.locator('.pc-canvas-host').boundingBox();
    await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60, { button: 'right' });
    const search = page.getByRole('dialog', { name: 'Add node', exact: true });
    await expect(search).toBeVisible();
    await search.getByRole('combobox', { name: 'Search nodes and subgraphs', exact: true }).press('ArrowDown');
    const paint = await search.evaluate(e => ({ families: [...e.querySelectorAll('.pc-family')].map(label => getComputedStyle(label).color), selected: getComputedStyle(e.querySelector('[aria-selected="true"]')).backgroundColor }));
    expect(new Set(paint.families)).toEqual(new Set(['rgb(208, 208, 208)']));
    const selected = colorChannels(paint.selected);
    expect(selected[0]).toBeCloseTo(selected[1], 3);
    expect(selected[1]).toBeCloseTo(selected[2], 3);
});

test('Signal gives real compatible and invalid connection targets different visible border patterns', async ({ page }, testInfo) => {
    const ids = await openEmber(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
        T.setPreset('signal');
        Object.values(h.graph.nodes).forEach((node, index) => Object.assign(node, { x: index % 3 * 230, y: Math.floor(index / 3) * 170 }));
        h.graph.wires = {}; h.S.save(); h.UI.refreshIfOpen(); await h.view({ x: 180, y: 60, zoom: 1 });
    });
    const source = page.locator('.pc-port[data-node="' + ids.guidanceCompose + '"][data-dir="out"]');
    const compatible = page.locator('.pc-port[data-kind="guidance"][data-dir="in"]');
    const invalid = page.locator('.pc-port[data-node="' + ids.jsonDecode + '"][data-dir="in"]');
    const center = async locator => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const from = await center(source), validAt = await center(compatible), invalidAt = await center(invalid);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(validAt.x, validAt.y, { steps: 4 });
    await expect(compatible).toHaveClass(/pc-pin-compatible/);
    const validStyle = await compatible.evaluate(e => {
        const c = getComputedStyle(e, '::before');
        return { content: c.content, border: c.borderStyle, width: c.width, clip: c.clipPath };
    });
    expect(validStyle.content).toBe('""');
    expect(validStyle.border).toBe('double');
    expect(parseFloat(validStyle.width)).toBeGreaterThanOrEqual(18);
    expect(validStyle.clip).toBe('none');
    await page.screenshot({ path: testInfo.outputPath('signal-compatible-connection.png') });
    await page.mouse.move(invalidAt.x, invalidAt.y, { steps: 4 });
    await expect(invalid).toHaveClass(/pc-pin-invalid/);
    expect(await invalid.evaluate(e => getComputedStyle(e, '::before').borderStyle)).toBe('dashed');
    await page.screenshot({ path: testInfo.outputPath('signal-invalid-connection.png') });
    await page.keyboard.press('Escape'); await page.mouse.up();
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.wires))).toEqual([]);
});

test('accessible themes distinguish connection types with shapes and patterns, then restore ordinary Ember cues', async ({ page }) => {
    await openEmber(page);
    const before = await measureEmber(page);
    const readCues = () => page.evaluate(() => {
        const pin = kind => {
            const e = document.querySelector('.pc-port[data-kind="' + kind + '"]');
            const c = getComputedStyle(e, '::after');
            return { radius: c.borderRadius, shape: c.clipPath, border: c.borderStyle, size: c.width, hit: e.getBoundingClientRect().width };
        };
        const wire = kind => getComputedStyle(document.querySelector('.pc-wire-native[data-kind="' + kind + '"]')).strokeDasharray;
        return { preset: document.documentElement.dataset.pcPreset, accessible: document.documentElement.dataset.pcAccessible, data: pin('data'), text: pin('text'), guidance: pin('guidance'), dataWire: wire('data'), textWire: wire('text'), guidanceWire: wire('guidance') };
    });
    for (const preset of ['harbor', 'signal']) {
        await page.evaluate(async preset => {
            const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
            T.setPreset(preset); await h.settle();
        }, preset);
        const cues = await readCues();
        expect(cues.data.radius).toBe('0px');
        expect(cues.text.radius).toBe('50%');
        expect(cues.text.border).toBe('solid');
        expect(cues.guidance.shape).toContain('polygon');
        expect(cues.dataWire).not.toBe('none');
        expect(cues.guidanceWire).not.toBe(cues.dataWire);
        expect(cues.textWire).toBe('none');
        expect(cues.data.hit).toBe(24);
        expect(cues.preset).toBe(preset);
        expect(cues.accessible).toBe('1');
        expect((await measureEmber(page)).graphBytes).toBe(before.graphBytes);
    }
    await page.evaluate(async () => {
        const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
        T.setPreset('ember'); await h.settle();
    });
    const restored = await readCues();
    expect(restored.data.radius).toBe('50%');
    expect(restored.dataWire).toBe('none');
    assertEmber(await measureEmber(page));
});

test('Signal keeps pin actions neutral and distinguishes a failed selected card without hue', async ({ page }) => {
    const ids = await openEmber(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
        T.setPreset('signal'); await h.view({ x: 220, y: 80, zoom: 1 });
    });
    await page.locator('.pc-node-native[data-id="' + ids.firstCompose + '"] .pc-port').first().click({ button: 'right' });
    await expect(page.getByRole('dialog', { name: 'Pin actions', exact: true })).toBeVisible();
    const menu = await page.locator('.pc-pin-menu').evaluate(e => {
        const c = getComputedStyle(e);
        const channels = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        return { background: channels(c.backgroundColor), text: channels(c.color) };
    });
    expect(new Set(menu.background).size).toBe(1);
    expect(new Set(menu.text).size).toBe(1);
    await page.getByRole('button', { name: 'Close pin actions', exact: true }).click();
    await page.evaluate(id => {
        const h = window.canvasHarness;
        h.graph.nodes[id].sections[0].text = '{broken'; h.S.save(); h.UI.refreshIfOpen();
    }, ids.firstCompose);
    await rootCommand(page);
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Failed');
    const failed = page.locator('.pc-node-native[data-id="' + ids.jsonDecode + '"]');
    await failed.locator('.pc-native-heading').click();
    await expect(failed).toHaveClass(/pc-selected/);
    await expect(failed).toHaveClass(/pc-trace-failed/);
    expect(await failed.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('dashed');
    await page.locator('.pc-run-meter').click();
    await expect(page.getByRole('region', { name: 'Run details', exact: true })).toBeVisible();
    await expect(page.locator('.pc-run-details li[data-status="failed"] .pc-run-status')).toContainText(/failed/i);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
