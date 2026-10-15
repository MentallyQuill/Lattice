import { test, expect } from '@playwright/test';

test('warm family browsing reuses row DOM nodes without connecting inactive families', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => { await window.canvasHarness.reset(250, 16); });
    await page.mouse.move(5, 5);
    const families = await page.locator('.pc-family-row:not(:disabled)').evaluateAll(buttons => buttons.map(button => button.dataset.family));
    const state = await page.evaluateHandle(() => ({ rows: new Map(), focused: document.activeElement,
        graph: JSON.stringify(window.canvasHarness.graph), providerCalls: window.canvasHarness.providerCalls() }));
    const visit = async (family, remember = false) => {
        await page.locator(`.pc-family-row[data-family="${family}"]`).hover();
        await expect(page.locator('.pc-family-menu')).toHaveAttribute('aria-label', family + ' nodes');
        const result = await page.evaluate(({ state, family, remember }) => {
            const menus = [...document.querySelectorAll('.pc-shelf-menu')], menu = document.querySelector('.pc-family-menu');
            const rows = [...menu.querySelectorAll('[data-shelf-choice]')], previous = state.rows.get(family);
            const sameRows = !!previous && previous.length === rows.length && rows.every((row, index) => row === previous[index]);
            if (remember) state.rows.set(family, rows);
            const connected = [...document.querySelectorAll('[data-shelf-choice]')];
            return { sameRows, count: rows.length, onlyActive: menus.length === 1 && connected.length === rows.length && connected.every((row, index) => row === rows[index]),
                inactiveDetached: [...state.rows].every(([name, saved]) => name === family || saved.every(row => !row.isConnected)),
                focusPreserved: document.activeElement === state.focused,
                graphPreserved: JSON.stringify(window.canvasHarness.graph) === state.graph,
                providerCalls: window.canvasHarness.providerCalls() - state.providerCalls };
        }, { state, family, remember });
        expect(result.count).toBeGreaterThan(0);
        expect(result.onlyActive).toBe(true);
        expect(result.inactiveDetached).toBe(true);
        expect(result.focusPreserved).toBe(true);
        expect(result.graphPreserved).toBe(true);
        expect(result.providerCalls).toBe(0);
        if (!remember) expect(result.sameRows, family + ' rows should survive a warm revisit').toBe(true);
    };
    for (const family of families) await visit(family, true);
    for (const family of families.toReversed()) await visit(family);
    await page.locator('.pc-family-menu').press('Escape');
    await expect(page.locator('.pc-shelf-menu')).toHaveCount(0);
    expect(await page.evaluate(state => [...state.rows.values()].flat().every(row => !row.isConnected), state)).toBe(true);
    await page.evaluate(state => { state.focused = document.activeElement; }, state);
    await page.mouse.move(5, 5);
    await visit(families[0]);
    await state.dispose();
});

test('warm family switches position drawers without measuring drawer rows again', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => { await window.canvasHarness.reset(); });
    await page.mouse.move(5, 5);
    const families = await page.locator('.pc-family-row:not(:disabled)').evaluateAll(buttons => buttons.map(button => button.dataset.family));
    const visit = async family => {
        await page.locator(`.pc-family-row[data-family="${family}"]`).hover();
        await expect(page.locator('.pc-family-menu')).toHaveAttribute('aria-label', family + ' nodes');
    };
    for (const family of families) await visit(family);
    const measurements = await page.evaluateHandle(() => {
        const original = Element.prototype.getBoundingClientRect, reads = [];
        Element.prototype.getBoundingClientRect = function (...args) {
            if (this.matches('.pc-family-menu, .pc-family-menu button')) reads.push(this.matches('.pc-family-menu') ? this.getAttribute('aria-label') : this.dataset.shelfChoice);
            return original.apply(this, args);
        };
        return { original, reads };
    });
    let reads;
    try {
        for (const family of families.toReversed().slice(1)) await visit(family);
        for (const family of families.slice(1)) await visit(family);
    } finally {
        reads = await page.evaluate(state => {
            Element.prototype.getBoundingClientRect = state.original;
            return state.reads;
        }, measurements);
        await measurements.dispose();
    }
    expect(reads, 'warm switches should reuse the measured drawer and first-row geometry').toEqual([]);
    const inside = await page.locator('.pc-family-menu').evaluate(menu => {
        const rect = menu.getBoundingClientRect(), area = menu.closest('.pc-canvas-area').getBoundingClientRect();
        return rect.left >= area.left && rect.right <= area.right && rect.top >= area.top && rect.bottom <= area.bottom;
    });
    expect(inside).toBe(true);
});

test('switching warm long families starts at the first row after keyboard scrolling', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => { await window.canvasHarness.reset(); });
    await page.addStyleTag({ content: '.pc-root .pc-family-menu { max-height: 120px !important; }' });
    await page.mouse.move(5, 5);
    const visit = async family => {
        await page.locator(`.pc-family-row[data-family="${family}"]`).hover();
        await expect(page.locator('.pc-family-menu')).toHaveAttribute('aria-label', family + ' nodes');
        expect(await page.locator('.pc-family-menu').evaluate(menu => menu.scrollHeight > menu.clientHeight)).toBe(true);
    };
    await visit('Input'); await visit('Shaping'); await visit('Input');
    await page.locator('.pc-family-menu').press('End');
    expect(await page.locator('.pc-family-menu').evaluate(menu => menu.scrollTop)).toBeGreaterThan(0);
    await visit('Shaping');
    const result = await page.locator('.pc-family-menu').evaluate(menu => {
        const rect = menu.getBoundingClientRect(), first = menu.querySelector('[data-shelf-choice]').getBoundingClientRect();
        const family = document.querySelector('.pc-family-row[data-family="Shaping"]').getBoundingClientRect();
        return { scrollTop: menu.scrollTop, firstVisible: first.top >= rect.top && first.bottom <= rect.bottom,
            alignment: first.top + first.height / 2 - family.top - family.height / 2 };
    });
    expect(result.scrollTop).toBe(0);
    expect(result.firstVisible).toBe(true);
    expect(Math.abs(result.alignment)).toBeLessThanOrEqual(1);
});

test('warm drawer geometry refreshes after theme, font, pane and viewport changes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => { await window.canvasHarness.reset(); });
    await page.mouse.move(5, 5);
    const visit = async family => {
        await page.locator(`.pc-family-row[data-family="${family}"]`).hover();
        await expect(page.locator('.pc-family-menu')).toHaveAttribute('aria-label', family + ' nodes');
    };
    const geometry = () => page.locator('.pc-family-menu').evaluate(menu => {
        const rect = menu.getBoundingClientRect(), pane = menu.closest('.pc-canvas-area'), area = pane.getBoundingClientRect();
        const first = menu.querySelector('[data-shelf-choice]').getBoundingClientRect();
        const family = [...document.querySelectorAll('.pc-family-row')].find(button => button.getAttribute('aria-expanded') === 'true').getBoundingClientRect();
        const firstOffset = first.top - rect.top, paneTop = area.top + pane.clientTop;
        const alignedTop = family.top + (family.height - first.height) / 2 - firstOffset;
        const expectedTop = paneTop + Math.max(4, Math.min(alignedTop - paneTop, pane.clientHeight - rect.height - 4));
        return { inside: rect.left >= area.left && rect.right <= area.right && rect.top >= area.top && rect.bottom <= area.bottom,
            alignment: first.top + first.height / 2 - family.top - family.height / 2, firstOffset, areaHeight: area.height, top: rect.top, expectedTop };
    });
    const aligned = async () => {
        const result = await geometry();
        expect(result.inside).toBe(true);
        expect(Math.abs(result.alignment)).toBeLessThanOrEqual(1);
        return result;
    };
    await visit('Subgraphs');
    const initial = await aligned();
    await visit('Input');
    await page.addStyleTag({ content: '.pc-root .pc-shelf-group { padding-top: 29.6px !important; padding-bottom: 18.4px !important; }' });
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('pc-theme')));
    await visit('Subgraphs');
    const themed = await aligned();
    expect(themed.firstOffset).toBeGreaterThan(initial.firstOffset + 30);
    await visit('Input');
    await page.addStyleTag({ content: '.pc-root .pc-shelf-group { font-size: 20px !important; }' });
    await page.evaluate(() => document.fonts.dispatchEvent(new Event('loadingdone')));
    await visit('Subgraphs');
    const font = await aligned();
    expect(font.firstOffset).toBeGreaterThan(themed.firstOffset + 10);
    await page.getByRole('separator', { name: 'Resize preview', exact: true }).press('End');
    await page.evaluate(() => window.canvasHarness.settle());
    await visit('Input'); await visit('Subgraphs');
    const resized = await geometry();
    expect(resized.inside).toBe(true);
    expect(Math.abs(resized.top - resized.expectedTop)).toBeLessThanOrEqual(1);
    expect(resized.areaHeight).toBeLessThan(font.areaHeight);
    await page.setViewportSize({ width: 900, height: 760 });
    const families = await page.locator('.pc-family-row:not(:disabled)').evaluateAll(buttons => buttons.map(button => button.dataset.family));
    for (const family of families) {
        await visit(family);
        expect((await geometry()).inside).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.getByRole('separator', { name: 'Resize preview', exact: true }).press('Home');
    await visit('Input'); await visit('Subgraphs');
    await aligned();
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('rapid family browsing positions each drawer with at most one layout pass', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => { await window.canvasHarness.reset(250, 16); });
    await page.mouse.move(5, 5);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const layouts = async () => (await cdp.send('Performance.getMetrics')).metrics.find(metric => metric.name === 'LayoutCount').value;
    const before = await layouts();
    const result = await page.evaluate(async () => {
        const buttons = [...document.querySelectorAll('.pc-family-row:not(:disabled)')];
        const focused = document.activeElement, graph = JSON.stringify(window.canvasHarness.graph), families = [];
        for (const button of [...buttons, ...buttons.toReversed()]) {
            button.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
            await new Promise(resolve => requestAnimationFrame(resolve));
            const menu = document.querySelector('.pc-family-menu'), rect = menu.getBoundingClientRect();
            const area = menu.closest('.pc-canvas-area').getBoundingClientRect();
            families.push({ expected: button.dataset.family + ' nodes', actual: menu.getAttribute('aria-label'),
                inside: rect.left >= area.left && rect.right <= area.right && rect.top >= area.top && rect.bottom <= area.bottom });
        }
        await new Promise(resolve => requestAnimationFrame(resolve));
        return { families, focusPreserved: focused === document.activeElement, graphPreserved: graph === JSON.stringify(window.canvasHarness.graph) };
    });
    const count = await layouts() - before;
    for (const family of result.families) { expect(family.actual).toBe(family.expected); expect(family.inside).toBe(true); }
    expect(result.focusPreserved).toBe(true);
    expect(result.graphPreserved).toBe(true);
    // Ignore wall-clock timing: the extra layout itself is the regression, even on a fast machine.
    expect(count).toBeLessThanOrEqual(result.families.length);
});
