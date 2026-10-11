import { rootCommand, expectRootBusy } from './workflow-commands.mjs';
import { test, expect } from '@playwright/test';

async function openRecordedFields(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    const graphId = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const version = (await (await fetch('/manifest.json')).json()).version;
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + version);
        const graph = starterGraph('structured-guidance');
        await h.activate(graph);
        return graph.id;
    });

    await page.evaluate(() => window.canvasHarness.settle());
    await rootCommand(page);
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Fit to view', exact: true }).click();
    await page.locator('.pc-node-native[data-id="select-fields"] .pc-native-heading').click();
    await expect(page.locator('.pc-output-preview [role="tabpanel"] pre')).toContainText('A quiet conversation.');
    return graphId;
}

for (const width of [1024, 320]) test(`recorded preview keeps a useful artifact body and reachable chrome at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const graphId = await openRecordedFields(page);
    const leaf = page.locator('.pc-output-preview'), pane = page.locator('.pc-preview-pane');
    const selector = leaf.getByRole('combobox', { name: 'Preview output', exact: true });
    const run = leaf.locator('[data-run-here]');
    await expect(leaf.locator('h3')).toHaveText('Select Fields · Output');
    await expect(selector).toBeVisible();
    await expect(run).toBeVisible(); await expect(run).toContainText('maximum 0 requests');
    await expect(leaf.locator('footer')).toContainText('Current');
    await expect(leaf.locator('footer')).toContainText('Following selection');
    const metrics = await leaf.evaluate(element => {
        const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const pane = element.closest('.pc-preview-pane'), body = element.querySelector('.pc-preview-sections');
        const pre = element.querySelector('[role="tabpanel"] pre'), range = document.createRange();
        range.setStart(pre.firstChild, 0); range.setEnd(pre.firstChild, Math.min(40, pre.firstChild.textContent.length));
        return { pane: rect(pane), leaf: rect(element), header: rect(element.querySelector('header')), footer: rect(element.querySelector('footer')), body: rect(body), text: rect(range),
            overflow: document.documentElement.scrollWidth > innerWidth, bodyScroll: getComputedStyle(body).overflowY,
            textFont: getComputedStyle(pre).fontFamily, leafFont: getComputedStyle(element).fontFamily,
            artifactBorder: getComputedStyle(element.querySelector('article')).borderTopWidth,
            artifactBackground: getComputedStyle(element.querySelector('article')).backgroundColor,
            headerButtonBorder: getComputedStyle(element.querySelector('header button')).borderTopWidth };
    });
    expect(metrics.pane.height).toBeCloseTo(240, 0);
    expect(metrics.leaf.height).toBeLessThanOrEqual(metrics.pane.height);
    expect(metrics.header.y).toBeGreaterThanOrEqual(metrics.pane.y);
    expect(metrics.footer.bottom).toBeLessThanOrEqual(metrics.pane.bottom);
    expect(metrics.body.height).toBeGreaterThanOrEqual(width === 1024 ? 110 : 55);
    expect(metrics.text.y).toBeGreaterThanOrEqual(metrics.body.y);
    expect(metrics.text.y).toBeLessThan(metrics.body.bottom);
    expect(metrics.bodyScroll).toBe('auto');
    expect(metrics.textFont).toBe(metrics.leafFont);
    expect(metrics.artifactBorder).toBe('0px');
    expect(metrics.artifactBackground).toBe('rgba(0, 0, 0, 0)');
    expect(metrics.headerButtonBorder).toBe('0px');
    expect(metrics.overflow).toBe(false);

    const before = await page.evaluate(async graphId => {
        const h = window.canvasHarness, version = (await (await fetch('/manifest.json')).json()).version;
        const result = (await import('/src/run.js?v=' + version)).getNativeWorkflowController().lastResult();
        return { graph: JSON.stringify(h.S.activeWorkflow()), camera: { ...h.canvas.view }, calls: result.actualCalls, runId: result.runId };
    }, graphId);
    expect(before.calls).toBe(0);
    const nativeClipboard = await page.evaluate(async graphId => {
        const h = window.canvasHarness, graph = h.S.activeWorkflow(), { makeClip } = await import('/src/workflow/clipboard.js?v=' + h.version);
        const clip = makeClip(graph, { nodeIds: ['compose-json'] });
        if (!clip.ok) throw Error(clip.error.message);
        return JSON.stringify(clip.data);
    }, graphId);
    const tabs = leaf.locator('[role="tab"]');
    await tabs.first().focus();
    await page.keyboard.press('End'); await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Delete'); await page.keyboard.press('Backspace');
    const artifactPanel = leaf.getByRole('tabpanel');
    await page.keyboard.press('Tab');
    await expect(artifactPanel).toBeFocused();
    for (const key of ['Delete', 'Backspace', 'Control+a', 'Control+c', 'Control+z', 'Control+y', 'ArrowDown', 'Space']) await page.keyboard.press(key);
    const panelPasteCanceled = await artifactPanel.evaluate((element, text) => {
        const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', text);
        const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        return event.defaultPrevented;
    }, nativeClipboard);
    expect(panelPasteCanceled).toBe(false);
    await page.keyboard.press('Tab');
    await expect(run).toBeFocused();
    const after = await page.evaluate(async graphId => {
        const h = window.canvasHarness, version = (await (await fetch('/manifest.json')).json()).version;
        const result = (await import('/src/run.js?v=' + version)).getNativeWorkflowController().lastResult();
        return { graph: JSON.stringify(h.S.activeWorkflow()), camera: { ...h.canvas.view }, calls: result.actualCalls, runId: result.runId };
    }, graphId);
    expect(after).toEqual(before);
    await expect(leaf.locator('[role="tabpanel"] pre')).toContainText('Let the user choose their next action.');
    await pane.screenshot({ path: testInfo.outputPath(`preview-${width}.png`) });

    await page.locator('.pc-canvas-host').focus();
    const canvasPasteCanceled = await page.evaluate(text => {
        const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', text);
        const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        return event.defaultPrevented;
    }, nativeClipboard);
    expect(canvasPasteCanceled).toBe(true);
    const pasted = await page.evaluate(graphId => Object.values(window.canvasHarness.S.activeWorkflow().nodes), graphId);
    expect(pasted).toHaveLength(Object.keys(JSON.parse(before.graph).nodes).length + 1);
    const copiedText = JSON.parse(before.graph).nodes['compose-json'].sections[0].text;
    expect(pasted.filter(node => node.operation === 'compose' && node.sections?.some(section => section.name === 'Scene' && section.text === copiedText))).toHaveLength(2);
});
