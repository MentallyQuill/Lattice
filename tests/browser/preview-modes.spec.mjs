import { test, expect } from '@playwright/test';

const markdown = '  **Exact original**\n\n雪  \n\n<details><summary>More</summary>Retained detail</details>\n\n![inert](https://preview-resource.invalid/pixel)';
async function openText(page) {
    await page.addInitScript(() => {
        window.previewCopies = []; window.previewCopyReject = false;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(text) { if (window.previewCopyReject) throw Error('Denied'); window.previewCopies.push(text); } } });
    });
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async text => {
        const h = window.canvasHarness; await h.reset(1);
        const graph = structuredClone(h.graph); graph.nodes.n0.sections = [{ name: 'Text', text }]; await h.activate(graph);
        window.previewHostEffects = { captures: 0, commits: 0 };
        const capture = h.context.getCharacterCardFields; h.context.getCharacterCardFields = (...args) => { window.previewHostEffects.captures++; return capture(...args); };
        h.context.saveChat = async () => { window.previewHostEffects.commits++; };
        h.canvas.select({ kind: 'node', id: 'n0' }); await h.settle();
    }, markdown);
    const leaf = page.locator('.pc-output-preview'); await leaf.locator('[data-run-here]').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed'); return leaf;
}
async function snapshot(page) {
    return page.evaluate(async () => {
        const h = window.canvasHarness, result = (await import('/src/run.js?v=' + h.version)).getNativeWorkflowController().lastResult();
        return { graph: JSON.stringify(h.graph), chat: JSON.stringify(h.context.chat), prompts: JSON.stringify(h.context.extensionPrompts), providerCalls: h.providerCalls(), effects: { ...window.previewHostEffects }, calls: result.actualCalls, runId: result.runId };
    });
}
for (const width of [1024, 320]) test(`Readable and Source preserve exact copies, controls and retained state at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); const resources = [];
    page.on('request', request => { if (request.url().includes('preview-resource.invalid')) resources.push(request.url()); });
    const leaf = await openText(page);
    await expect(leaf.getByRole('button', { name: 'Readable preview', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(leaf.locator('.pc-readable-prose strong')).toHaveText('Exact original');
    await expect(leaf.locator('.pc-readable-prose details')).toHaveCount(1);
    await expect(leaf.locator('.pc-readable-prose img')).toHaveCount(0);
    expect(resources).toEqual([]);
    const before = await snapshot(page);
    const geometry = await page.evaluate(() => localStorage.getItem('lattice.workspace.preview'));
    await leaf.getByRole('button', { name: 'Copy text', exact: true }).click();
    await expect(leaf.getByRole('status')).toContainText('Copied');
    expect(await page.evaluate(() => window.previewCopies)).toEqual([markdown]);
    const sourceMode = leaf.getByRole('button', { name: 'Source preview', exact: true }); await sourceMode.focus(); await page.keyboard.press('Enter');
    await expect(sourceMode).toHaveAttribute('aria-pressed', 'true');
    await expect(leaf.getByRole('tab')).toHaveCount(0);
    await expect(leaf).toContainText('Recorded diagnostic payload; private host fields are excluded.');
    const source = await leaf.locator('[data-preview-source]').textContent(); expect(JSON.parse(source).text).toBe(markdown);
    await leaf.getByRole('button', { name: 'Copy source', exact: true }).click();
    expect(await page.evaluate(() => window.previewCopies)).toEqual([markdown, source]);
    await page.evaluate(() => { window.previewCopyReject = true; });
    await leaf.getByRole('button', { name: 'Copy source', exact: true }).click(); await expect(leaf.getByRole('status')).toContainText('Could not copy');
    const copyVisible = await leaf.getByRole('button', { name: 'Copy source', exact: true }).evaluate(button => {
        const rect = button.getBoundingClientRect(); let top = rect.top, bottom = rect.bottom;
        for (let parent = button.parentElement; parent; parent = parent.parentElement) {
            if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowY)) { const clip = parent.getBoundingClientRect(); top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
        }
        return { height: rect.height, visibleHeight: Math.max(0, bottom - top) };
    });
    expect(copyVisible.visibleHeight, 'Source copy remains fully visible after clipboard feedback').toBeGreaterThanOrEqual(copyVisible.height);
    await page.keyboard.press('Delete'); await page.keyboard.press('Backspace');
    expect(await snapshot(page)).toEqual(before);
    expect(await page.evaluate(() => localStorage.getItem('lattice.workspace.preview'))).toBe(geometry);
    expect(await page.evaluate(() => localStorage.getItem('lattice.workspace.preview.mode'))).toBe('source');
    const controls = await leaf.locator('button').evaluateAll(buttons => buttons.filter(button => getComputedStyle(button).display !== 'none').map(button => { const r = button.getBoundingClientRect(); return { text: button.textContent, x: r.x, right: r.right, width: r.width }; }));
    for (const control of controls) { expect(control.width, control.text).toBeGreaterThan(0); expect(control.x, control.text).toBeGreaterThanOrEqual(0); expect(control.right, control.text).toBeLessThanOrEqual(width); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.locator('.pc-preview-pane').screenshot({ path: testInfo.outputPath(`modes-${width}.png`) });
    await page.reload(); await page.waitForFunction(() => !!window.canvasHarness);
    await expect(page.getByRole('button', { name: 'Source preview', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('retained context renders three ordered messages and copies exact empty and Markdown bodies', async ({ page }) => {
    await page.addInitScript(() => { window.previewCopies = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(text) { window.previewCopies.push(text); } } }); });
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const messages = ['**First**\n雪', '', 'Third\n\nline'];
    await page.evaluate(async messages => {
        const h = window.canvasHarness, { fixtureGraph } = await import('/tests/helpers/workflow-fixtures.mjs');
        h.context.chat = messages.map((mes, index) => ({ mes, is_user: index !== 2, name: 'Speaker ' + index }));
        await h.activate(fixtureGraph('native-guidance')); h.canvas.select({ kind: 'node', id: 'scene-context' }); await h.settle();
    }, messages);
    const leaf = page.locator('.pc-output-preview'); await leaf.locator('[data-run-here]').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    const retained = leaf.locator('[data-preview-message]'); await expect(retained).toHaveCount(3);
    expect(await retained.locator('header strong').allTextContents()).toEqual(['user', 'user', 'assistant']);
    for (let index = 0; index < 3; index++) await retained.nth(index).getByRole('button', { name: 'Copy message', exact: true }).click();
    expect(await page.evaluate(() => window.previewCopies)).toEqual(messages);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
