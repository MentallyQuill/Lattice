import { test, expect } from '@playwright/test';

async function setup(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness?.canvas);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { canvasWorkflow } = await import('/tests/browser/native-fixture.mjs');
        const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const graph = canvasWorkflow(operationDefaults, 12);
        graph.nodes.n6.budgetTokens = 32;
        await h.activate(graph);
        h.UI.close();
        const left = document.getElementById('leftSendForm');
        left.hidden = false;
        left.style.cssText = 'position:fixed;bottom:16px;left:12px;display:flex;align-items:center;gap:8px';
        document.getElementById('options_button').textContent = '☰';
        const input = document.createElement('textarea');
        input.setAttribute('aria-label', 'Chat message');
        input.placeholder = 'Type a message…';
        input.style.cssText = 'position:fixed;bottom:16px;left:100px;width:calc(100vw - 136px);height:32px;resize:none';
        document.body.append(input);
        const runtime = await import('/src/run.js?v=' + h.version);
        window.startProgressRun = () => {
            h.context.getTokenCountAsync = () => new Promise(resolve => { window.releaseProgressTokens = () => resolve(1); });
            window.progressRun = runtime.getNativeWorkflowController().runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'n11', portId: 'out' });
        };
    });
}

test('launcher shows real stage progress and fades over three seconds after success', async ({ page }) => {
    await setup(page);
    const meter = page.locator('#pc-sendbar .pc-chat-progress');
    await expect(meter).toBeHidden();
    const before = await page.locator('#pc-sendbar').boundingBox();
    await page.evaluate(() => window.startProgressRun());
    await expect(meter).toBeVisible();
    await expect(meter.locator('.pc-chat-progress-percent')).toHaveText('50%');
    await expect(meter.locator('[data-status="running"]')).toHaveCount(1);
    expect(await page.locator('#pc-sendbar').boundingBox()).toEqual(before);
    await page.screenshot({ path: '.tmp/chat-progress-active-wide.png', clip: { x: 0, y: 880, width: 600, height: 120 } });
    await page.setViewportSize({ width: 320, height: 640 });
    const bounds = await meter.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    await page.screenshot({ path: '.tmp/chat-progress-active-narrow.png', clip: { x: 0, y: 520, width: 320, height: 120 } });

    expect(await page.evaluate(async () => { window.releaseProgressTokens(); return (await window.progressRun).ok; })).toBe(true);
    await expect(meter.locator('.pc-chat-progress-percent')).toHaveText('100%');
    await expect(meter).toHaveAttribute('data-status', 'completed');
    await expect.poll(() => meter.evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThan(0.65);
    expect(await meter.evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0.1);
    await expect(meter).toBeHidden({ timeout: 3500 });
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('a new run immediately restores visibility and survives the old fade deadline', async ({ page }) => {
    await setup(page);
    const meter = page.locator('#pc-sendbar .pc-chat-progress');
    await page.evaluate(() => window.startProgressRun());
    await expect(meter.locator('.pc-chat-progress-percent')).toHaveText('50%');
    await page.evaluate(async () => { window.releaseProgressTokens(); await window.progressRun; });
    await expect(meter).toHaveClass(/pc-chat-progress-fading/);
    await page.evaluate(() => window.startProgressRun());
    await expect(meter.locator('.pc-chat-progress-percent')).toHaveText('50%');
    await expect(meter).not.toHaveClass(/pc-chat-progress-fading/);
    expect(await meter.evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
    await page.waitForTimeout(3100);
    await expect(meter).toBeVisible();
    await page.evaluate(async () => { window.releaseProgressTokens(); await window.progressRun; });
});

test('automatic Send reports native generation progress while the editor is closed', async ({ page }) => {
    await page.route('**/script.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const isGenerating = () => !!globalThis.progressNativeBusy; export const syncMesToSwipe = () => true; export const syncSwipeToMes = () => true;' }));
    await page.route('**/scripts/user.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const getCurrentUserHandle = () => "progress-user";' }));
    await setup(page);
    const ready = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + h.version);
        await h.activate(starterGraph('unified-basic'));
        h.UI.close();
        h.S.settings().enabled = true;
        Object.assign(h.context, { chatId: 'progress-chat', characterId: 0, groupId: null, characters: [{ data: { name: 'Mara' } }], chat: [{ mes: 'Open the door.', is_user: true, extra: {} }], saveChat: async () => {}, updateMessageBlock: async () => {}, swipe: { refresh: async () => {} } });
        window.progressNativeBusy = true;
        await h.context.eventSource.emit('GENERATION_STARTED', 'normal', {}, false);
        return window.latticeGenerationInterceptor(h.context.chat.map(message => ({ ...message })), 8192, () => {}, 'normal');
    });
    expect(ready.ok).toBe(true);
    const meter = page.locator('#pc-sendbar .pc-chat-progress');
    await expect(page.locator('.pc-root.pc-open')).toHaveCount(0);
    await expect(meter).toBeVisible();
    await expect(meter.locator('.pc-chat-progress-percent')).toHaveText('33%');
    await expect(meter.locator('[data-status="running"]')).toHaveCount(1);
    await page.evaluate(async () => {
        const c = window.canvasHarness.context, now = new Date().toISOString(), reply = 'The door opens.';
        c.chat.push({ mes: reply, is_user: false, extra: {}, gen_started: now, gen_finished: now, swipe_id: 0, swipes: [reply], swipe_info: [{ gen_started: now, gen_finished: now, extra: {} }] });
        window.progressNativeBusy = false;
        await c.eventSource.emit('MESSAGE_RECEIVED', c.chat.length - 1, 'normal');
        await c.eventSource.emit('GENERATION_ENDED', c.chat.length);
    });
    await expect(meter.locator('.pc-chat-progress-percent')).toHaveText('100%');
    await expect(meter).toHaveAttribute('data-status', 'completed');
    await expect(meter).toHaveClass(/pc-chat-progress-fading/);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
