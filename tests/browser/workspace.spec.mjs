import { rootCommand, expectRootBusy } from './workflow-commands.mjs';
import { test, expect } from '@playwright/test';

async function previewMenu(page, command) {
    await page.getByRole('button', { name: 'Preview', exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    const item = page.getByRole('menu', { name: 'Preview', exact: true }).getByRole('menuitem', { name: command, exact: true });
    await expect(item).toBeVisible(); await item.focus(); await page.keyboard.press('Enter');
}

async function interruptDivider(page, interruption) {
    if (interruption === 'Escape') await page.keyboard.press('Escape');
    else if (interruption === 'unmount') await previewMenu(page, 'Collapse preview');
    else await page.evaluate(interruption => {
        const handle = document.querySelector('.pc-pane-divider');
        if (interruption === 'pointercancel') handle.dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.dividerPointer, bubbles: true }));
        else if (interruption === 'lost capture') handle.releasePointerCapture(window.dividerPointer);
        else if (interruption === 'blur') window.dispatchEvent(new Event('blur'));
    }, interruption);
    await page.mouse.up();
    if (interruption === 'unmount') await previewMenu(page, 'Show preview');
}

for (const selected of [true, false]) for (const interruption of ['pointercancel', 'lost capture', 'blur', 'unmount']) test(`divider ${interruption} rolls back with ${selected ? 'a selection' : 'no selection'} and permits another drag`, async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const ids = await page.evaluate(() => window.canvasHarness.reset());
    await page.evaluate(async ({ id, selected }) => {
        const h = window.canvasHarness; h.canvas.select(selected ? { kind: 'node', id } : null);
        await h.view({ x: 180, y: 70, zoom: .8 });
        window.dividerHandle = document.querySelector('.pc-pane-divider');
        window.dividerHandle.addEventListener('pointerdown', event => { window.dividerPointer = event.pointerId; });
    }, { id: ids[0], selected });
    const pane = page.locator('.pc-preview-pane'), divider = page.getByRole('separator', { name: 'Resize preview' });
    const original = (await pane.boundingBox()).height, handle = await divider.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 4); await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2, handle.y + 70);
    await interruptDivider(page, interruption);
    await expect(page.locator('.pc-root')).toHaveClass(/pc-open/);
    expect((await pane.boundingBox()).height).toBe(original);
    expect(await page.evaluate(() => window.dividerHandle.hasPointerCapture(window.dividerPointer))).toBe(false);
    expect(await page.evaluate(() => window.canvasHarness.canvas.selection?.id || null)).toBe(selected ? ids[0] : null);
    expect(await page.evaluate(() => ({ ...window.canvasHarness.canvas.view }))).toEqual({ x: 180, y: 70, zoom: .8 });
    const next = await divider.boundingBox();
    await page.mouse.move(next.x + next.width / 2, next.y + 4); await page.mouse.down(); await page.mouse.move(next.x + next.width / 2, next.y + 40); await page.mouse.up();
    expect((await pane.boundingBox()).height).toBeGreaterThan(original + 20);
});

for (const selected of [true, false]) test(`divider Escape rolls back with ${selected ? 'a selection' : 'no selection'} and releases capture`, async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const ids = await page.evaluate(() => window.canvasHarness.reset());
    await page.evaluate(async ({ id, selected }) => {
        const h = window.canvasHarness; h.canvas.select(selected ? { kind: 'node', id } : null);
        await h.view({ x: 180, y: 70, zoom: .8 });
        window.dividerPointer = null;
        document.querySelector('.pc-pane-divider').addEventListener('pointerdown', event => { window.dividerPointer = event.pointerId; });
    }, { id: ids[0], selected });
    const pane = page.locator('.pc-preview-pane'), divider = page.getByRole('separator', { name: 'Resize preview' });
    const original = (await pane.boundingBox()).height, handle = await divider.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 4); await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2, handle.y + 70);
    await page.keyboard.press('Escape');
    await expect(page.locator('.pc-root')).toHaveClass(/pc-open/);
    expect((await pane.boundingBox()).height).toBe(original);
    expect(await page.evaluate(() => document.querySelector('.pc-pane-divider').hasPointerCapture(window.dividerPointer))).toBe(false);
    expect(await page.evaluate(() => window.canvasHarness.canvas.selection?.id || null)).toBe(selected ? ids[0] : null);
    expect(await page.evaluate(() => ({ ...window.canvasHarness.canvas.view }))).toEqual({ x: 180, y: 70, zoom: .8 });
    await page.mouse.up();
    const next = await divider.boundingBox();
    await page.mouse.move(next.x + next.width / 2, next.y + 4); await page.mouse.down(); await page.mouse.move(next.x + next.width / 2, next.y + 40); await page.mouse.up();
    expect((await pane.boundingBox()).height).toBeGreaterThan(original + 20);
});

for (const action of ['Copy', 'Cut', 'Delete selection']) test(`Edit menu supports group ${action}`, async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const ids = await page.evaluate(() => window.canvasHarness.reset());
    const groupId = await page.evaluate(async ids => {
        const h = window.canvasHarness; h.S.settings().ui.confirmDelete = false;
        const group = h.S.groupNodes(h.graph, ids.slice(0, 2), 'Menu group');
        h.UI.refreshIfOpen(); await h.settle(); h.canvas.select({ kind: 'group', id: group.id });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { window.groupClipboard = text; return Promise.resolve(); } } });
        return group.id;
    }, ids);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const command = page.getByRole('menuitem', { name: new RegExp('^' + action + '(?:$| )') });
    await expect(command).toBeEnabled(); await command.click();
    if (action === 'Copy') {
        expect(await page.evaluate(() => !!window.groupClipboard)).toBe(true);
        expect(await page.evaluate(id => !!window.canvasHarness.graph.groups[id], groupId)).toBe(true);
    } else {
        await expect.poll(() => page.evaluate(id => !!window.canvasHarness.graph.groups[id], groupId)).toBe(false);
        expect(await page.evaluate(ids => ids.slice(0, 2).some(id => !!window.canvasHarness.graph.nodes[id]), ids)).toBe(false);
    }
});

test('Edit menu allows named wire deletion and current node edits', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => window.canvasHarness.reset());
    const wire = await page.evaluate(() => { const h = window.canvasHarness, id = Object.keys(h.graph.wires)[0]; h.canvas.select({ kind: 'wire', id }); return id; });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /^Copy/ })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: /^Cut/ })).toBeDisabled();
    const deletion = page.getByRole('menuitem', { name: /^Delete selection/ }); await expect(deletion).toBeEnabled(); await deletion.click();
    expect(await page.evaluate(id => !!window.canvasHarness.graph.wires[id], wire)).toBe(false);
    await page.evaluate(() => { const h = window.canvasHarness; h.canvas.select({ kind: 'node', id: Object.keys(h.graph.nodes)[0] }); });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    for (const name of [/^Copy/, /^Cut/, /^Delete selection/]) await expect(page.getByRole('menuitem', { name })).toBeEnabled();
});

test('Inspect selection reveals Details and the root tab has quote-orange keyboard focus', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const ids = await page.evaluate(() => window.canvasHarness.reset());
    await page.evaluate(id => window.canvasHarness.canvas.select({ kind: 'node', id }), ids[0]);
    await page.getByRole('button', { name: 'Node', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Inspect selection', exact: true }).click();
    await expect(page.locator('.pc-inspector')).toBeVisible();
    await page.getByRole('button', { name: 'Toggle inspector', exact: true }).click();
    await page.getByRole('button', { name: 'Node', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Inspect selection', exact: true }).click();
    await expect(page.locator('.pc-inspector')).toBeVisible();
    await page.getByRole('separator', { name: 'Resize preview' }).focus(); await page.keyboard.press('Tab');
    const tab = page.locator('.pc-graph-tab[aria-selected="true"]');
    await expect(tab).toBeFocused(); await expect(tab).toHaveCSS('outline-color', 'rgb(225, 138, 36)');
});

for (const panel of ['Examples', 'Help']) test(`${panel} dialog suppresses background graph shortcuts with button focus`, async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const ids = await page.evaluate(() => window.canvasHarness.reset());
    const before = await page.evaluate(id => {
        const h = window.canvasHarness; h.canvas.select({ kind: 'node', id });
        return { nodes: Object.keys(h.graph.nodes), selection: h.canvas.selection, multi: [...h.canvas.multi], history: h.H.peek(h.graph) };
    }, ids[0]);
    await page.getByRole('button', { name: panel === 'Examples' ? 'File' : 'Help', exact: true }).click();
    await page.getByRole('menuitem', { name: panel === 'Examples' ? 'Open examples…' : 'Workspace guide', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close panel', exact: true })).toBeFocused();
    for (const key of ['Control+a', 'Control+z', 'Delete', 'Control+x', 'Control+g', 'Control+d']) await page.keyboard.press(key);
    expect(await page.evaluate(() => { const h = window.canvasHarness; return { nodes: Object.keys(h.graph.nodes), selection: h.canvas.selection, multi: [...h.canvas.multi], history: h.H.peek(h.graph) }; })).toEqual(before);
    await expect(page.getByRole('button', { name: 'Close panel', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(page.locator('.pc-root')).toHaveClass(/pc-open/);
});

test('flat workspace menus support keyboard navigation, Escape and outside dismissal', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const labels = await page.locator('.pc-flat-menu').allTextContents();
    expect(labels).toEqual(['File', 'Edit', 'Graph', 'Node', 'Preview', 'Tools', 'Help']);
    const file = page.getByRole('button', { name: 'File', exact: true });
    await file.focus(); await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'New workflow', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menu', { name: 'Edit', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Lattice', exact: true })).toBeVisible();
    await file.click(); await page.locator('.pc-brand').click();
    await expect(page.getByRole('menu', { name: 'File', exact: true })).toHaveCount(0);
    await file.click(); await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Examples', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(file).toBeFocused();
    await expect(page.locator('.pc-root')).toHaveClass(/pc-open/);
});

test('shelf stays outside the camera and canonical nodes align with their opening family', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => window.canvasHarness.reset());
    const shelf = page.locator('.pc-node-shelf'), first = await shelf.boundingBox();
    await page.evaluate(() => window.canvasHarness.view({ x: -200, y: 150, zoom: 1.5 }));
    expect(await shelf.boundingBox()).toEqual(first);
    await expect(page.locator('[data-family="Transpose"]')).toBeEnabled();
    const input = page.locator('[data-family="Input"]'); await input.focus(); await page.keyboard.press('ArrowRight');
    const row = await input.boundingBox(), family = await page.locator('.pc-family-menu').boundingBox(), firstChoice = page.locator('.pc-family-menu [data-shelf-choice]').first(), opening = await firstChoice.boundingBox();
    expect(Math.abs(opening.y + opening.height / 2 - row.y - row.height / 2)).toBeLessThanOrEqual(1); expect(family.x).toBeGreaterThanOrEqual(row.x + row.width);
    await expect(firstChoice).toBeFocused();
    await expect(page.locator('[data-subfamily], .pc-leaf-menu')).toHaveCount(0);
    await page.keyboard.press('ArrowLeft'); await expect(input).toBeFocused(); await expect(page.locator('.pc-family-menu')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    const count = await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes).length);
    await page.getByRole('menu', { name: 'Input nodes', exact: true }).getByRole('menuitem', { name: /^Scene Context(?:\s|$)/ }).click();
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes).length)).toBe(count + 1);
});

for (const width of [1024, 736, 360, 320]) test(`workspace fits ${width}px and loads its local brand font`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests = []; page.on('request', request => requests.push(request.url()));
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const brand = await page.evaluate(async () => {
        await document.fonts.ready;
        const word = document.querySelector('.pc-brand span'), logo = document.querySelector('.pc-brand img'), css = getComputedStyle(word);
        return { loaded: document.fonts.check('600 20px "Bricolage Grotesque"'), family: css.fontFamily, size: css.fontSize, weight: css.fontWeight, color: css.color, logo: logo.complete && logo.naturalWidth > 0, overflow: document.querySelector('.pc-root').scrollWidth > innerWidth };
    });
    expect(brand).toMatchObject({ loaded: true, size: '20px', weight: '600', color: 'rgb(255, 255, 255)', logo: true, overflow: false });
    expect(brand.family).toContain('Bricolage Grotesque');
    expect(requests.some(url => url.includes('/assets/bricolage-grotesque.ttf'))).toBe(true);
    expect(requests.every(url => new URL(url).hostname === '127.0.0.1')).toBe(true);
    await expect(page.locator('.pc-brand span')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Help', exact: true })).toBeInViewport();
    await page.locator('[data-family="Input"]').focus(); await page.keyboard.press('ArrowRight');
    const menu = await page.locator('.pc-family-menu').boundingBox(), graph = await page.locator('.pc-canvas-area').boundingBox();
    expect(menu.x).toBeGreaterThanOrEqual(graph.x); expect(menu.x + menu.width).toBeLessThanOrEqual(graph.x + graph.width + 1);
});

test('root Run and Stop remain active while the preview divider resizes', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => {
        const c = window.canvasHarness.context;
        c.extensionSettings.connectionManager = { profiles: [{ id: 'analysis', name: 'Analysis connection', api: 'openai', model: 'synthetic-shell-model', preset: null }] };
        c.CONNECT_API_MAP = { openai: { selected: 'openai', source: 'openai' } };
        window.shellRequests = 0;
        c.ConnectionManagerRequestService = { getProfile: id => c.extensionSettings.connectionManager.profiles.find(profile => profile.id === id), sendRequest: () => { window.shellRequests++; return new Promise(resolve => { window.finishShellRequest = resolve; }); } };
        c.ChatCompletionService = { presetToGeneratePayload: async (_preset, _route, payload) => payload };
    });
    await page.evaluate(async () => {
        const h = window.canvasHarness, { installStarter } = await import('/src/workflow/starters.js?v=' + h.version);
        await h.activate(installStarter('native-guidance'));
    });
    for (const operation of ['smart-compactor', 'response-plan']) {
        const id = await page.evaluate(operation => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === operation).id, operation);
        await page.locator(`.pc-node-native[data-id="${id}"] .pc-native-heading`).click();
        await page.getByRole('region', { name: 'Node details', exact: true }).getByLabel('Connection profile', { exact: true }).selectOption('analysis');
    }
    await rootCommand(page);
    await expectRootBusy(page, true);
    await expect.poll(() => page.evaluate(() => window.shellRequests)).toBe(1);
    await page.getByRole('separator', { name: 'Resize preview' }).focus(); await page.keyboard.press('ArrowDown');
    await expectRootBusy(page, true);
    expect(await page.evaluate(() => window.shellRequests)).toBe(1);
    for (const selected of [true, false]) for (const interruption of ['Escape', 'pointercancel', 'lost capture', 'blur', 'unmount']) {
        const selection = await page.evaluate(selected => {
            const h = window.canvasHarness, id = Object.keys(h.graph.nodes)[0];
            h.canvas.select(selected ? { kind: 'node', id } : null);
            window.dividerHandle = document.querySelector('.pc-pane-divider');
            window.dividerHandle.addEventListener('pointerdown', event => { window.dividerPointer = event.pointerId; });
            return h.canvas.selection;
        }, selected);
        const pane = page.locator('.pc-preview-pane'), divider = page.getByRole('separator', { name: 'Resize preview' });
        const original = (await pane.boundingBox()).height, handle = await divider.boundingBox();
        const camera = await page.evaluate(() => ({ ...window.canvasHarness.canvas.view }));
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 4); await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2, handle.y + 45);
        await interruptDivider(page, interruption);
        expect((await pane.boundingBox()).height).toBe(original);
        await expect(page.locator('.pc-root')).toHaveClass(/pc-open/);
        await expectRootBusy(page, true);
        expect(await page.evaluate(() => window.shellRequests)).toBe(1);
        expect(await page.evaluate(() => window.canvasHarness.canvas.selection)).toEqual(selection);
        expect(await page.evaluate(() => ({ ...window.canvasHarness.canvas.view }))).toEqual(camera);
        expect(await page.evaluate(() => window.dividerHandle.hasPointerCapture(window.dividerPointer))).toBe(false);
    }
    expect(await page.evaluate(() => window.canvasHarness.S.settings().enabled)).toBe(false);
    await rootCommand(page, 'Stop workflow');
    await expectRootBusy(page, false);
    await page.evaluate(() => window.finishShellRequest({ choices: [{ message: { content: 'Late synthetic guidance.' }, finish_reason: 'stop' }] }));
    await page.evaluate(() => window.canvasHarness.settle());
    await expect(page.getByText('Late synthetic guidance.', { exact: true })).toHaveCount(0);
});

test('preview divider redistributes panes without changing the graph camera, selection or cards', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const ids = await page.evaluate(() => window.canvasHarness.reset());
    await page.evaluate(async id => {
        const { canvas, view } = window.canvasHarness;
        canvas.select({ kind: 'node', id }); await view({ x: 170, y: 100, zoom: .8 });
    }, ids[0]);
    await page.locator('.pc-output-preview [data-run-here]').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    await expect(page.locator('.pc-output-preview [role="tabpanel"] pre')).toContainText('Synthetic rendering fixture.');
    await page.evaluate(id => {
        const { canvas } = window.canvasHarness;
        window.workspaceProbe = { card: document.querySelector(`.pc-node[data-id="${id}"]`), camera: { ...canvas.view }, selection: canvas.selection.id, preview: document.querySelector('.pc-output-preview'), previewText: document.querySelector('.pc-output-preview').textContent };
    }, ids[0]);
    const graph = page.locator('.pc-canvas-host'), preview = page.locator('.pc-preview-pane');
    const divider = page.getByRole('separator', { name: 'Resize preview' });
    await expect(divider).toBeVisible();
    const before = { graph: await graph.boundingBox(), preview: await preview.boundingBox() };
    const handle = await divider.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2, handle.y + 90); await page.mouse.up();
    expect((await preview.boundingBox()).height).toBeGreaterThan(before.preview.height + 60);
    expect((await graph.boundingBox()).height).toBeLessThan(before.graph.height - 60);
    await divider.focus(); await page.keyboard.press('ArrowUp');
    await previewMenu(page, 'Collapse preview');
    await previewMenu(page, 'Show preview');
    const preserved = await page.evaluate(id => {
        const { canvas } = window.canvasHarness, probe = window.workspaceProbe;
        return { card: probe.card === document.querySelector(`.pc-node[data-id="${id}"]`), camera: { ...canvas.view }, selection: canvas.selection.id, preview: probe.preview === document.querySelector('.pc-output-preview') && probe.previewText === document.querySelector('.pc-output-preview').textContent };
    }, ids[0]);
    expect(preserved.card).toBe(true);
    expect(preserved.preview).toBe(true);
    expect(preserved.camera).toEqual(await page.evaluate(() => window.workspaceProbe.camera));
    expect(preserved.selection).toBe(ids[0]);
});
