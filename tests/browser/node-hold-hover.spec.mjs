import { test, expect } from '@playwright/test';

const family = page => page.locator('.pc-family-row[data-family="Input"]');
const fileMenu = page => page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'File', exact: true });
const heading = page => page.locator('.pc-node[data-id="n0"] .pc-native-heading');

async function setup(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        await h.reset(3);
        Object.assign(h.graph.nodes.n0, { x: 100, y: 70 });
        Object.assign(h.graph.nodes.n1, { x: 100, y: 300 });
        Object.assign(h.graph.nodes.n2, { x: 650, y: 440 });
        // Keep the hovered wire independent of the selected/dragged node.
        delete h.graph.wires.w1;
        h.S.touchGraph(h.graph); h.UI.refreshIfOpen(); await h.settle();
        await h.view({ x: 110, y: 30, zoom: .85 });
    });
    await page.mouse.move(1400, 990);
}

async function center(locator) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function moveTo(page, locator) {
    const point = await center(locator);
    await page.mouse.move(point.x, point.y);
}

async function pressNode(page) {
    await heading(page).evaluate(element => element.addEventListener('pointerdown', event => { window.heldNodePointer = event.pointerId; }, { once: true }));
    await moveTo(page, heading(page));
    await page.mouse.down();
}

async function wirePoint(page) {
    return page.locator('.pc-wire-native[data-id="w2"]').evaluate(path => {
        const point = path.getPointAtLength(path.getTotalLength() / 2);
        const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM());
        return { x: screen.x, y: screen.y };
    });
}

async function interrupt(page, reason) {
    if (reason === 'Escape') await page.keyboard.press('Escape');
    else await page.evaluate(reason => {
        if (reason === 'blur') window.dispatchEvent(new Event('blur'));
        else document.querySelector('.pc-canvas-host').dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.heldNodePointer, bubbles: true }));
    }, reason);
}

test('a held canvas node suppresses unrelated wire, pin, shelf and toolbar hover until release', async ({ page }) => {
    await setup(page);
    const idleFamily = await family(page).evaluate(element => getComputedStyle(element).backgroundColor);
    const idleFile = await fileMenu(page).evaluate(element => getComputedStyle(element).backgroundColor);
    const label = page.locator('.pc-wire-label[data-id="w2"]');
    const point = await wirePoint(page);
    await page.mouse.move(point.x, point.y);
    await expect(label).toBeVisible();
    await pressNode(page);
    await expect(label).toBeHidden();
    await expect(page.locator('.pc-node[data-id="n0"]')).toHaveClass(/pc-(selected|multi)/);
    await page.mouse.move(point.x, point.y);
    await expect(label).toBeHidden();
    const pin = page.locator('.pc-port[data-node="n2"][data-dir="in"][data-port="section.Text"]');
    await moveTo(page, pin);
    await expect.poll(() => pin.evaluate(element => getComputedStyle(element, '::before').content)).toBe('none');
    await moveTo(page, fileMenu(page));
    await expect(fileMenu(page)).toHaveCSS('background-color', idleFile);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await moveTo(page, family(page));
    await expect(family(page)).toHaveCSS('background-color', idleFamily);
    await expect(page.locator('.pc-family-menu')).toHaveCount(0);
    await page.mouse.up();
    // Releasing at the same position should restore hover without another move.
    await expect(page.locator('.pc-family-menu')).toHaveAttribute('aria-label', 'Input nodes');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('pressing a shelf choice clears its hover before movement and preserves drag placement', async ({ page }) => {
    await setup(page);
    await page.locator('.pc-family-row[data-family="Shaping"]').click();
    const choice = page.locator('[data-shelf-choice="operation:reroute"]');
    await page.mouse.move(1400, 990);
    const idle = await choice.evaluate(element => getComputedStyle(element).backgroundColor);
    await moveTo(page, choice);
    await expect.poll(() => choice.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(idle);
    await page.mouse.down();
    expect(await choice.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(idle);
    await expect(page.locator('.pc-shelf-drag-preview')).toHaveText('Reroute');
    const initial = await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes));
    const point = await wirePoint(page);
    await page.mouse.move(point.x, point.y);
    await expect(page.locator('.pc-wire-label[data-id="w2"]')).toBeHidden();
    await moveTo(page, family(page));
    await expect(page.locator('.pc-family-menu[aria-label="Input nodes"]')).toHaveCount(0);
    const host = await page.locator('.pc-canvas-host').boundingBox();
    const drop = { x: host.x + host.width - 90, y: host.y + 80 };
    await page.mouse.move(drop.x, drop.y);
    await expect(page.locator('.pc-shelf-drag-preview')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.pc-shelf-drag-preview')).toHaveCount(0);
    const placed = await page.evaluate(initial => Object.values(window.canvasHarness.graph.nodes).filter(node => !initial.includes(node.id)), initial);
    expect(placed).toHaveLength(1);
    expect(placed[0].operation).toBe('reroute');
    await moveTo(page, fileMenu(page));
    const hovered = await fileMenu(page).evaluate(element => getComputedStyle(element).backgroundColor);
    await page.mouse.move(1400, 990);
    await expect.poll(() => fileMenu(page).evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(hovered);
});

for (const reason of ['Escape', 'pointercancel', 'blur']) test(`${reason} restores shelf and toolbar hover and allows a fresh node hold`, async ({ page }) => {
    await setup(page);
    const initial = await page.evaluate(() => ({ x: window.canvasHarness.graph.nodes.n0.x, y: window.canvasHarness.graph.nodes.n0.y }));
    const idleFile = await fileMenu(page).evaluate(element => getComputedStyle(element).backgroundColor);
    await pressNode(page);
    // Exercise cancellation before any mouse movement as well as recovery.
    await interrupt(page, reason);
    await page.mouse.up();
    expect(await page.evaluate(() => ({ x: window.canvasHarness.graph.nodes.n0.x, y: window.canvasHarness.graph.nodes.n0.y }))).toEqual(initial);
    await moveTo(page, fileMenu(page));
    await expect.poll(() => fileMenu(page).evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(idleFile);
    await moveTo(page, family(page));
    await expect(page.locator('.pc-family-menu')).toHaveAttribute('aria-label', 'Input nodes');
    await pressNode(page);
    await moveTo(page, fileMenu(page));
    await expect(fileMenu(page)).toHaveCSS('background-color', idleFile);
    await interrupt(page, reason);
    // The pointer remains over File throughout cancellation.
    await expect.poll(() => fileMenu(page).evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(idleFile);
    await page.mouse.up();
    await moveTo(page, family(page));
    await expect(page.locator('.pc-family-menu')).toHaveAttribute('aria-label', 'Input nodes');
});
