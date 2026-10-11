import { test, expect } from '@playwright/test';

async function nestedReplyFixture(page) {
    await page.route('**/scripts/user.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const getCurrentUserHandle = () => 'nested-review-browser';" }));
    await page.route('**/script.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        const context = () => globalThis.SillyTavern.getContext();
        export const isGenerating = () => false;
        export function syncMesToSwipe(index) { const m = context().chat[index]; m.swipe_info[m.swipe_id] = { extra: structuredClone(m.extra || {}) }; return true; }
        export function syncSwipeToMes(index, swipeId) { const m = context().chat[index]; m.swipe_id = swipeId; m.mes = m.swipes[swipeId]; Object.assign(m, structuredClone(m.swipe_info[swipeId])); return true; }
    ` }));
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + h.version);
        const { cloneWorkflowDocument } = await import('/src/workflow/document.js?v=' + h.version);
        const { prepareCreateFromSelection } = await import('/src/workflow/composition.js?v=' + h.version);
        const root = cloneWorkflowDocument(starterGraph('unified-basic')).data;
        const extracted = prepareCreateFromSelection(root, { nodeIds: Object.keys(root.nodes), instanceId: 'body', definitionId: 'nested-reply-body', name: 'Nested reply' });
        if (!extracted.ok) throw Error(JSON.stringify(extracted.error));
        extracted.data.candidate.name = 'Nested native review';
        h.context.chatId = 'nested-review'; h.context.chat = [{ mes: 'Continue.', is_user: true, extra: {} }];
        h.context.setExtensionPrompt = (key, value) => { h.context.extensionPrompts[key] = { value }; };
        h.context.updateMessageBlock = () => {}; h.context.swipe = { refresh() {} };
        window.nestedReviewSaves = 0; h.context.saveChat = async () => { window.nestedReviewSaves++; };
        await (await import('/src/run.js?v=' + h.version)).initializeNativeWorkflowController();
        await h.activate(extracted.data.candidate);
        h.S.settings().enabled = true; h.S.save(); h.UI.refreshIfOpen();
        const c = h.context;
        await c.eventSource.emit(c.eventTypes.GENERATION_STARTED, 'normal', {}, false);
        const ready = await window.latticeGenerationInterceptor(c.chat, 8192, () => {}, 'normal');
        if (!ready.ok || !ready.awaitingNative) throw Error(JSON.stringify(ready));
        const now = new Date().toISOString(), index = c.chat.length;
        c.chat.push({ mes: 'Native nested reply.', is_user: false, swipe_id: 0, swipes: ['Native nested reply.'], swipe_info: [{ extra: { preserved: true }, gen_started: now, gen_finished: now }], extra: { preserved: true }, gen_started: now, gen_finished: now });
        await c.eventSource.emit(c.eventTypes.MESSAGE_RECEIVED, index, 'normal');
        await c.eventSource.emit(c.eventTypes.GENERATION_ENDED, c.chat.length);
    });
    await page.waitForFunction(async () => {
        const h = window.canvasHarness;
        return (await import('/src/run.js?v=' + h.version)).getNativeWorkflowController().lastAutomaticResult()?.result.ok;
    });
}

for (const action of ['Apply reviewed reply', 'Reject reply']) {
    test(`native nested review opens its addressed child and ${action} uses the owned candidate`, async ({ page }) => {
        await nestedReplyFixture(page);
        await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'Workflow', exact: true }).click();
        const review = page.getByRole('menuitem', { name: 'Review host result', exact: true });
        await expect(review).toBeEnabled(); await review.click();
        await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Nested reply');
        const preview = page.locator('.pc-output-preview');
        await expect(preview.getByRole('button', { name: 'Apply reviewed reply', exact: true })).toBeEnabled();
        await expect(preview.getByRole('button', { name: 'Reject reply', exact: true })).toBeEnabled();
        expect(await page.evaluate(async () => {
            const h = window.canvasHarness, runtime = (await import('/src/run.js?v=' + h.version)).getNativeWorkflowController();
            const handle = runtime.lastAutomaticResult().result.reviewHandles[0];
            window.nestedReviewHandle = structuredClone(handle);
            return { path: handle.terminal.address.instancePath, nodeId: handle.terminal.address.nodeId, fresh: runtime.candidateStatus(handle).ok, calls: h.providerCalls() };
        })).toEqual({ path: ['body'], nodeId: 'review-publish', fresh: true, calls: 0 });
        await preview.getByRole('button', { name: action, exact: true }).click();
        await expect.poll(() => page.evaluate(async () => {
            const h = window.canvasHarness, runtime = (await import('/src/run.js?v=' + h.version)).getNativeWorkflowController();
            return runtime.candidateStatus(window.nestedReviewHandle).ok;
        })).toBe(false);
        const applied = action === 'Apply reviewed reply';
        expect(await page.evaluate(() => ({ swipes: window.canvasHarness.context.chat.at(-1).swipes, text: window.canvasHarness.context.chat.at(-1).mes, saves: window.nestedReviewSaves, calls: window.canvasHarness.providerCalls() }))).toEqual({ swipes: applied ? ['Native nested reply.', 'Native nested reply.'] : ['Native nested reply.'], text: 'Native nested reply.', saves: applied ? 1 : 0, calls: 0 });
    });
}
