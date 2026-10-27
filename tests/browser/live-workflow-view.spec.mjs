import { test, expect } from '@playwright/test';

async function setupNativeSend(page) {
    await page.route('**/script.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const isGenerating = () => !!globalThis.liveNativeBusy; export const syncMesToSwipe = () => true; export const syncSwipeToMes = () => true;' }));
    await page.route('**/scripts/user.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const getCurrentUserHandle = () => "live-workflow-user";' }));
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness?.canvas);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + h.version);
        const runtime = await import('/src/run.js?v=' + h.version);
        await h.activate(starterGraph('unified-basic'));
        h.UI.close();
        h.S.settings().enabled = true;
        document.dispatchEvent(new CustomEvent('pc-state'));
        Object.assign(h.context, { chatId: 'live-workflow-chat', characterId: 0, groupId: null, characters: [{ data: { name: 'Mara' } }], chat: [], saveChat: async () => {}, updateMessageBlock: async () => {}, swipe: { refresh: async () => {} } });
        window.liveWorkflow = { controller: runtime.getNativeWorkflowController(), aborts: 0 };
    });
}

async function startNativeSend(page) {
    return page.evaluate(async () => {
        const h = window.canvasHarness, c = h.context;
        c.chat.push({ mes: 'Open the door.', is_user: true, extra: {} });
        window.liveNativeBusy = true;
        await c.eventSource.emit('GENERATION_STARTED', 'normal', {}, false);
        return window.latticeGenerationInterceptor(c.chat, 8192, () => { window.liveWorkflow.aborts++; }, 'normal');
    });
}

async function setupManualRun(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness?.canvas);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { canvasWorkflow } = await import('/tests/browser/native-fixture.mjs');
        const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const runtime = await import('/src/run.js?v=' + h.version);
        const graph = canvasWorkflow(operationDefaults, 12);
        graph.nodes.n6.budgetTokens = 32;
        await h.activate(graph);
        await h.view({ x: 50, y: 20, zoom: 0.6 });
        h.context.getTokenCountAsync = () => new Promise(resolve => { window.releaseManualTokens = () => resolve(1); });
        window.liveWorkflow = { controller: runtime.getNativeWorkflowController() };
        h.canvas.select({ kind: 'node', id: 'n11' });
    });
    await page.locator('.pc-output-preview [data-run-here]').click();
    await expect(node(page, 'n6')).toHaveClass(/pc-trace-running/);
    const runId = await activeRunId(page);
    expect(runId).toBeTruthy();
    return runId;
}

const node = (page, id) => page.locator(`.pc-node-native[data-id="${id}"]`);
const activeRunId = page => page.evaluate(() => window.liveWorkflow.controller.activity()?.runId ?? null);

test('a native Send remains live through opening, closing and reopening Lattice, while Stop still cancels', async ({ page }) => {
    await setupNativeSend(page);
    const ready = await startNativeSend(page);
    expect(ready.ok).toBe(true);
    expect(ready.awaitingNative).toBe(true);
    expect(ready.runId).toBeTruthy();
    await expect(page.locator('.pc-root.pc-open')).toHaveCount(0);
    expect(await activeRunId(page)).toBe(ready.runId);

    await page.evaluate(async () => { const h = window.canvasHarness; h.UI.open(); await h.settle(); });
    expect(await activeRunId(page)).toBe(ready.runId);
    await expect(node(page, 'on-send')).toHaveClass(/pc-trace-completed/);
    await expect(node(page, 'generate-reply')).toHaveClass(/pc-trace-running/);
    await expect(node(page, 'review-publish')).toHaveClass(/pc-trace-queued/);
    await expect(page.locator('.pc-run-pixel[data-status="running"]')).toHaveCount(1);
    expect(await page.locator('.pc-run-pixel[data-status="running"]').evaluate(pixel => getComputedStyle(pixel).animationName)).toContain('pc-meter-pulse');
    await expect(page.locator('.pc-root-stop')).toBeVisible();
    await page.screenshot({ path: '.tmp/live-workflow-open.png' });

    // Calling open on the visible workspace must remain an observation as well.
    await page.evaluate(async () => { const h = window.canvasHarness; h.UI.open(); await h.settle(); });
    expect(await activeRunId(page)).toBe(ready.runId);
    await expect(node(page, 'generate-reply')).toHaveClass(/pc-trace-running/);

    await page.evaluate(async () => { const h = window.canvasHarness; h.UI.close(); await h.settle(); });
    await expect(page.locator('.pc-root.pc-open')).toHaveCount(0);
    expect(await activeRunId(page)).toBe(ready.runId);
    expect(await page.evaluate(() => window.liveWorkflow.aborts)).toBe(0);
    await page.evaluate(async () => { const h = window.canvasHarness; h.UI.open(); await h.settle(); });
    expect(await activeRunId(page)).toBe(ready.runId);
    await expect(node(page, 'on-send')).toHaveClass(/pc-trace-completed/);
    await expect(node(page, 'generate-reply')).toHaveClass(/pc-trace-running/);

    await page.evaluate(async () => {
        const c = window.canvasHarness.context, now = new Date().toISOString(), reply = 'The door opens.', index = c.chat.length;
        c.chat.push({ mes: reply, is_user: false, extra: {}, gen_started: now, gen_finished: now, swipe_id: 0, swipes: [reply], swipe_info: [{ gen_started: now, gen_finished: now, extra: {} }] });
        window.liveNativeBusy = false;
        await c.eventSource.emit('MESSAGE_RECEIVED', index, 'normal');
        await c.eventSource.emit('GENERATION_ENDED', c.chat.length);
    });
    await expect.poll(() => page.evaluate(() => window.liveWorkflow.controller.lastAutomaticResult()?.result.runId)).toBe(ready.runId);
    expect(await page.evaluate(() => window.liveWorkflow.controller.lastAutomaticResult().result.ok)).toBe(true);
    expect(await activeRunId(page)).toBeNull();
    await expect(node(page, 'generate-reply')).toHaveClass(/pc-trace-completed/);
    await expect(node(page, 'review-publish')).toHaveClass(/pc-trace-completed/);
    await expect(page.locator('.pc-root-stop')).toHaveCount(0);
    expect(await page.evaluate(() => window.liveWorkflow.aborts)).toBe(0);

    const stopped = await startNativeSend(page);
    expect(stopped.ok).toBe(true);
    expect(stopped.runId).not.toBe(ready.runId);
    await expect(node(page, 'generate-reply')).toHaveClass(/pc-trace-running/);
    await page.locator('.pc-root-stop').click();
    await expect.poll(() => activeRunId(page)).toBeNull();
    await expect.poll(() => page.evaluate(() => window.liveWorkflow.controller.lastAutomaticResult()?.result.runId)).toBe(stopped.runId);
    expect(await page.evaluate(() => window.liveWorkflow.controller.lastAutomaticResult().result.error.code)).toBe('ABORTED');
    expect(await page.evaluate(() => window.liveWorkflow.aborts)).toBe(1);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('replacing the workflow document still cancels an active native Send', async ({ page }) => {
    await setupNativeSend(page);
    const ready = await startNativeSend(page);
    expect(ready.ok).toBe(true);
    await page.evaluate(async () => { const h = window.canvasHarness; h.UI.open(); await h.settle(); });
    expect(await activeRunId(page)).toBe(ready.runId);
    await expect(node(page, 'generate-reply')).toHaveClass(/pc-trace-running/);

    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'New workflow', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.id)).not.toBe('unified-basic');
    await expect.poll(() => activeRunId(page)).toBeNull();
    expect(await page.evaluate(() => window.liveWorkflow.aborts)).toBe(1);
    await expect(page.locator('.pc-node-native')).toHaveCount(0);
    await expect(page.locator('.pc-run-pixel[data-status="running"]')).toHaveCount(0);
    await expect(page.locator('.pc-root-stop')).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

for (const finishWhileClosed of [false, true]) {
    test(`Run to here retains its completed output when reopened ${finishWhileClosed ? 'after completion' : 'during execution'}`, async ({ page }) => {
        const runId = await setupManualRun(page);
        await page.evaluate(async () => { const h = window.canvasHarness; h.UI.close(); await h.settle(); });
        expect(await activeRunId(page)).toBe(runId);
        if (!finishWhileClosed) {
            await page.evaluate(async () => { const h = window.canvasHarness; h.UI.open(); await h.settle(); });
            expect(await activeRunId(page)).toBe(runId);
        }

        await page.evaluate(() => window.releaseManualTokens());
        await expect.poll(() => page.evaluate(() => window.liveWorkflow.controller.lastResult()?.runId)).toBe(runId);
        expect(await page.evaluate(() => window.liveWorkflow.controller.lastResult().ok)).toBe(true);
        if (finishWhileClosed) await page.evaluate(async () => { const h = window.canvasHarness; h.UI.open(); await h.settle(); });
        await page.evaluate(() => window.canvasHarness.canvas.select({ kind: 'node', id: 'n11' }));
        await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
        await page.locator('.pc-output-preview').getByRole('button', { name: 'Source preview', exact: true }).click();
        await expect(page.locator('.pc-output-preview [data-preview-source]')).toContainText('Synthetic rendering fixture.');
        await expect(page.locator('.pc-output-preview .pc-preview-status')).toHaveAttribute('data-status', 'current');
        expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    });
}
