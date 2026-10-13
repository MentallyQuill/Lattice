import { test, expect } from '@playwright/test';

async function setup(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => { await window.canvasHarness.reset(); await window.canvasHarness.view({ x: 150, y: 40, zoom: 1 }); });
}
async function center(locator) { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }

for (const key of ['Delete', 'Backspace']) test(`${key} deletes selected nodes immediately without a dialog and Undo restores one step`, async ({ page }) => {
    await setup(page);
    const prompts = []; page.on('dialog', async dialog => { prompts.push(dialog.message()); await dialog.dismiss(); });
    const before = await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes));
    await page.locator('.pc-node[data-id="n0"] .pc-native-heading').click();
    await page.keyboard.press(key);
    await expect(page.locator('.pc-node[data-id="n0"]')).toHaveCount(0);
    expect(prompts).toEqual([]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes))).toEqual(before);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('node search starts with its input and closes on a toolbar or canvas pointer down', async ({ page }) => {
    await setup(page);
    const host = page.locator('.pc-canvas-host'), b = await host.boundingBox();
    const popup = page.getByRole('dialog', { name: 'Add node', exact: true });
    for (const outside of ['toolbar', 'canvas']) {
        await page.mouse.click(b.x + b.width - 60, b.y + b.height - 60, { button: 'right' });
        await expect(popup).toBeVisible();
        await expect(popup.getByRole('combobox', { name: 'Search nodes and subgraphs', exact: true })).toBeFocused();
        expect(await popup.evaluate(element => element.firstElementChild.querySelector('input')?.type)).toBe('search');
        await expect(popup.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
        expect(await popup.innerText()).not.toMatch(/Add Node|Search nodes and Subgraphs/);
        if (outside === 'toolbar') await page.getByRole('button', { name: 'Toggle Details Panel', exact: true }).click();
        else await page.mouse.click(b.x + b.width - 20, b.y + b.height - 20);
        await expect(popup).toHaveCount(0);
        expect(await page.evaluate(() => window.canvasHarness.canvas.hasContentGesture())).toBe(false);
    }
});

test('Details width commits with pointer and keyboard, persists after reopen, and leaves graph/history unchanged', async ({ page }) => {
    await setup(page);
    const before = await page.evaluate(() => JSON.stringify(window.canvasHarness.graph));
    const divider = page.getByRole('separator', { name: 'Resize Details', exact: true }), details = page.locator('.pc-inspector');
    const initial = (await details.boundingBox()).width, at = await center(divider);
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x - 70, at.y); await page.mouse.up();
    await expect.poll(async () => (await details.boundingBox()).width).toBeCloseTo(initial + 70, 0);
    await divider.focus(); await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await details.boundingBox()).width).toBeCloseTo(initial + 82, 0);
    await page.getByRole('button', { name: 'Toggle Details Panel', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle Details Panel', exact: true }).click();
    await expect.poll(async () => (await details.boundingBox()).width).toBeCloseTo(initial + 82, 0);
    expect(await page.evaluate(() => JSON.stringify(window.canvasHarness.graph))).toBe(before);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 736, height: 1000 });
    await expect(divider).toBeHidden();
});

test('Details dragging retains settled canvas geometry while its pane follows the pointer', async ({ page }) => {
    await setup(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness; await h.reset(60, 10); h.canvas.select({ kind: 'node', id: 'n0' });
        await h.view({ x: 150, y: 40, zoom: 1 });
        // Drain the preceding selection/camera save before counting this gesture.
        await new Promise(resolve => setTimeout(resolve, 220));
        const c = h.canvas, card = c.nodeLayer.querySelector('.pc-node[data-id="n0"]'), path = c.svg.querySelector('.pc-wire-native');
        const probe = window.detailsResizeProbe = { geometry: 0, invalidations: 0, commits: 0, card, port: card.querySelector('.pc-port'), path,
            route: path.getAttribute('d'), camera: { ...c.view }, selection: { ...c.selection }, graph: JSON.stringify(h.graph), history: JSON.stringify(h.H.peek(h.graph)) };
        const measure = c.geometry.measure.bind(c.geometry), invalidate = c.invalidateGeometry.bind(c);
        c.geometry.measure = (...args) => { probe.geometry++; return measure(...args); };
        c.invalidateGeometry = (...args) => { probe.invalidations++; return invalidate(...args); };
        probe.unsubscribe = h.S.documentSession.subscribe(event => { if (event.type === 'views') probe.commits++; });
    });
    const divider = page.getByRole('separator', { name: 'Resize Details', exact: true }), details = page.locator('.pc-inspector');
    const initial = (await details.boundingBox()).width, at = await center(divider);
    await page.mouse.move(at.x, at.y); await page.mouse.down();
    for (let step = 1; step <= 6; step++) {
        await page.mouse.move(at.x - step * 12, at.y);
        await page.evaluate(() => window.canvasHarness.settle());
    }
    expect((await details.boundingBox()).width).toBeCloseTo(initial + 72, 0);
    expect(await page.evaluate(() => {
        const { geometry, invalidations, commits } = window.detailsResizeProbe; return { geometry, invalidations, commits };
    })).toEqual({ geometry: 0, invalidations: 0, commits: 0 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.detailsResizeProbe.commits)).toBe(1);
    expect(await page.evaluate(() => window.canvasHarness.S.activeWorkspaceViews().views.find(view => view.identity.kind === 'root').inspector.width)).toBeCloseTo(initial + 72, 0);
    expect(await page.evaluate(() => {
        const h = window.canvasHarness, c = h.canvas, p = window.detailsResizeProbe; p.unsubscribe();
        return { card: c.nodeLayer.querySelector('.pc-node[data-id="n0"]') === p.card, port: p.card.contains(p.port), path: c.svg.contains(p.path),
            route: p.path.getAttribute('d') === p.route, camera: JSON.stringify(c.view) === JSON.stringify(p.camera), selection: JSON.stringify(c.selection) === JSON.stringify(p.selection),
            graph: JSON.stringify(h.graph) === p.graph, history: JSON.stringify(h.H.peek(h.graph)) === p.history, geometry: p.geometry, invalidations: p.invalidations };
    })).toEqual({ card: true, port: true, path: true, route: true, camera: true, selection: true, graph: true, history: true, geometry: 0, invalidations: 0 });
});

for (const interruption of ['Escape', 'pointercancel', 'blur']) test(`Details ${interruption} rolls back a draft width and permits a fresh drag`, async ({ page }) => {
    await setup(page);
    const divider = page.getByRole('separator', { name: 'Resize Details', exact: true }), details = page.locator('.pc-inspector');
    await divider.evaluate(element => element.addEventListener('pointerdown', event => { window.detailsPointer = event.pointerId; }));
    const initial = (await details.boundingBox()).width, at = await center(divider);
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x - 60, at.y);
    await expect.poll(async () => (await details.boundingBox()).width).toBeGreaterThan(initial + 40);
    if (interruption === 'Escape') await page.keyboard.press('Escape');
    else await page.evaluate(interruption => {
        if (interruption === 'blur') window.dispatchEvent(new Event('blur'));
        else document.querySelector('.pc-details-divider').dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.detailsPointer, bubbles: true }));
    }, interruption);
    await page.mouse.up();
    await expect.poll(async () => (await details.boundingBox()).width).toBe(initial);
    expect(await divider.evaluate(element => element.hasPointerCapture(window.detailsPointer))).toBe(false);
    const next = await center(divider);
    await page.mouse.move(next.x, next.y); await page.mouse.down(); await page.mouse.move(next.x - 30, next.y); await page.mouse.up();
    await expect.poll(async () => (await details.boundingBox()).width).toBeCloseTo(initial + 30, 0);
});

test('a tall Preview leaves shelf rows full width with a themed vertical scrollbar and centered icons', async ({ page }) => {
    await setup(page);
    const divider = await center(page.getByRole('separator', { name: 'Resize preview', exact: true }));
    await page.mouse.move(divider.x, divider.y); await page.mouse.down(); await page.mouse.move(divider.x, divider.y + 500); await page.mouse.up();
    const dimensions = await page.locator('.pc-node-shelf').evaluate(element => {
        const style = getComputedStyle(element), row = element.querySelector('.pc-family-row'), r = row.getBoundingClientRect();
        const icon = row.querySelector('svg').getBoundingClientRect(), text = row.querySelector('span').getBoundingClientRect();
        const next = row.nextElementSibling.getBoundingClientRect();
        const probe = document.createElement('span'); element.append(probe);
        const resolve = role => { probe.style.color = `var(--pc-scrollbar-${role})`; return getComputedStyle(probe).color; };
        const scrollbarTokens = resolve('thumb') + ' ' + resolve('track'); probe.remove();
        return { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
            overflowX: style.overflowX, scrollbarWidth: style.scrollbarWidth, scrollbarColor: style.scrollbarColor, scrollbarTokens,
            rowWidth: r.width, rowHeight: r.height, rowPitch: next.y - r.y, fontSize: getComputedStyle(row).fontSize, iconWidth: icon.width, iconHeight: icon.height,
            iconCenter: icon.y + icon.height / 2 - r.y, textCenter: text.y + text.height / 2 - r.y };
    });
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
    expect(dimensions).toMatchObject({ overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: dimensions.scrollbarTokens, fontSize: '11.2px' });
    for (const [key, expected] of Object.entries({ rowWidth: 102.4, rowHeight: 33.6, rowPitch: 36, iconWidth: 19.2, iconHeight: 19.2 })) expect(dimensions[key]).toBeCloseTo(expected, 1);
    expect(dimensions.iconCenter).toBeCloseTo(16.8, 1); expect(dimensions.textCenter).toBeCloseTo(16.8, 1);
});

test('hover and compatible connection targets highlight and a near-origin drag uses a single smooth cubic', async ({ page }) => {
    await setup(page);
    const source = page.locator('.pc-port[data-node="n0"][data-dir="out"][data-port="out"]');
    const target = page.locator('.pc-port[data-node="n2"][data-dir="in"][data-port="section.Text"]');
    await target.hover(); await expect(target).toHaveClass(/pc-pin-highlight/);
    const origin = await center(source), end = await center(target);
    await page.mouse.move(origin.x, origin.y); await page.mouse.down(); await page.mouse.move(origin.x + 2, origin.y + 3);
    const ghost = page.locator('.pc-wire-ghost'); await expect(ghost).toBeVisible();
    const d = await ghost.getAttribute('d'); expect((d.match(/C/g) ?? []).length).toBe(1); expect(d).not.toMatch(/L/);
    await page.mouse.move(end.x, end.y, { steps: 4 });
    await expect(target).toHaveClass(/pc-pin-compatible/);
    await page.mouse.up(); await expect(ghost).toHaveCount(0);
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.wires).some(wire => wire.from === 'n0' && wire.to === 'n2'))).toBe(true);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('the chat launcher uses the loaded Lattice logo in the left host controls', async ({ page }) => {
    await setup(page);
    const launcher = page.locator('#leftSendForm > #pc-sendbar');
    await expect(launcher).toHaveAttribute('aria-label', 'Open Lattice');
    const icon = launcher.locator('.pc-chat-launcher-icon');
    expect(await icon.evaluate(async element => { const image = new Image(); image.src = getComputedStyle(element).maskImage.slice(5, -2); await image.decode(); return image.naturalWidth > 0; })).toBe(true);
    for (const [color, expected] of [['#dcdcd2', 'rgb(220, 220, 210)'], ['#c9d8ee', 'rgb(201, 216, 238)']]) {
        await page.evaluate(color => document.documentElement.style.setProperty('--SmartThemeBodyColor', color), color);
        await expect(icon).toHaveCSS('background-color', expected);
    }
    await expect(launcher).toHaveCSS('opacity', '0.7');
    await expect(page.locator('#rightSendForm #pc-sendbar')).toHaveCount(0);
});
