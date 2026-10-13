import { test, expect } from '@playwright/test';

// Observe the actual modules delivered to the browser; production exports stay unchanged.
async function observeOpening(page) {
    await page.addInitScript(() => {
        window.openWork = { examples: 0, projections: 0, renders: 0, scenes: 0 };
    });
    await page.route('**/src/ui/example-catalog.js?*', async route => {
        const response = await route.fetch();
        const body = (await response.text()).replace(
            /export function projectWorkflowExamples\(([^)]*)\) \{/,
            '$&\n    window.openWork.examples++;\n    if (window.openWork.failExamples) throw new Error("Private catalog failure");',
        );
        await route.fulfill({ response, body });
    });
    await page.route('**/src/ui/controller.js?*', async route => {
        const response = await route.fetch();
        const body = (await response.text()).replace(
            'function updateWorkflowProjection() {',
            'function updateWorkflowProjection() {\n    window.openWork.projections++;',
        ) + `
window.openEditorProbe = { captureEditor, editorCurrent, commitCaptured, refreshExampleCatalog, readGraphEditContext };
const openingRender = Canvas.prototype.render, openingSetGraph = Canvas.prototype.setGraph;
Canvas.prototype.render = function (...args) { window.openWork.renders++; return openingRender.apply(this, args); };
Canvas.prototype.setGraph = function (...args) { window.openWork.scenes++; return openingSetGraph.apply(this, args); };
`;
        await route.fulfill({ response, body });
    });
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
}

test('ordinary cold and warm opening defer example preparation until the Examples popup', async ({ page }) => {
    await observeOpening(page);
    expect(await page.evaluate(() => window.openWork.examples)).toBe(0);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        h.UI.close(); h.UI.open(); await h.settle();
    });
    expect(await page.evaluate(() => window.openWork.examples)).toBe(0);
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Examples', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.pc-example-tile')).toHaveCount(30);
    expect(await page.evaluate(() => window.openWork.examples)).toBe(1);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('reopening admits closed authored edits and same-ID replacements with fresh write authority', async ({ page }) => {
    await observeOpening(page);
    const result = await page.evaluate(async () => {
        const h = window.canvasHarness, probe = window.openEditorProbe;
        await h.reset(2, 2);
        const closedCapture = probe.captureEditor().data;
        const firstContext = probe.readGraphEditContext().sessionId;
        h.UI.close();
        const inactive = !probe.editorCurrent(closedCapture);
        // Public authored roots can change without a revision notification.
        h.graph.nodes.n0.title = 'Edited while closed';
        h.graph.nodes.n0.sections[0].text = 'Current closed contents';
        h.UI.open(); await h.settle();
        const changed = {
            title: h.canvas.graph.nodes.n0.title,
            text: h.canvas.graph.nodes.n0.sections[0].text,
            rejected: probe.commitCaptured(closedCapture, { ok: true, data: {} }).error?.code,
            fresh: probe.editorCurrent(probe.captureEditor().data),
            contextChanged: firstContext !== probe.readGraphEditContext().sessionId,
        };
        const replacedCapture = probe.captureEditor().data;
        const changedContext = probe.readGraphEditContext().sessionId;
        h.UI.close();
        const replacement = structuredClone(h.graph);
        replacement.name = 'Same-ID replacement'; replacement.nodes.n0.title = 'Replacement title';
        h.S.activateWorkflow(replacement, { clean: true });
        h.UI.open(); await h.settle();
        return {
            inactive, changed,
            replacement: { title: h.canvas.graph.nodes.n0.title, name: h.graph.name,
                rejected: probe.commitCaptured(replacedCapture, { ok: true, data: {} }).error?.code,
                fresh: probe.editorCurrent(probe.captureEditor().data),
                contextChanged: changedContext !== probe.readGraphEditContext().sessionId },
            calls: h.providerCalls(),
        };
    });
    expect(result).toEqual({ inactive: true,
        changed: { title: 'Edited while closed', text: 'Current closed contents', rejected: 'STALE_CONTEXT', fresh: true, contextChanged: true },
        replacement: { title: 'Replacement title', name: 'Same-ID replacement', rejected: 'STALE_CONTEXT', fresh: true, contextChanged: true },
        calls: 0,
    });
    await page.locator('.pc-canvas-host .pc-node-native[data-id="n0"] .pc-native-heading').click();
    await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toHaveValue('Replacement title');
    await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toBeEnabled();
});

test('deferred example errors remain sanitized and the popup retry restores all tiles', async ({ page }) => {
    await observeOpening(page);
    await page.evaluate(() => { window.openWork.failExamples = true; });
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Examples', exact: true });
    await expect(dialog).toContainText('Lattice could not complete this action');
    await expect(dialog).not.toContainText('Private catalog failure');
    await expect(dialog.locator('.pc-example-tile')).toHaveCount(0);
    await page.evaluate(() => { window.openWork.failExamples = false; });
    await dialog.getByRole('button', { name: 'Reload examples', exact: true }).click();
    await expect(dialog.locator('.pc-example-tile')).toHaveCount(30);
    expect(await page.evaluate(() => window.openWork.examples)).toBe(2);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('opening publishes one current workflow projection and one scene while restoring selection and camera', async ({ page }) => {
    await observeOpening(page);
    expect(await page.evaluate(() => window.openWork.projections)).toBe(1);
    const work = await page.evaluate(async () => {
        const h = window.canvasHarness;
        await h.reset(3, 3);
        h.canvas.select({ kind: 'node', id: 'n1' });
        await h.view({ x: 180, y: 70, zoom: 0.8 });
        const samples = [];
        for (const closeFirst of [true, false]) {
            if (closeFirst) h.UI.close();
            Object.assign(window.openWork, { projections: 0, renders: 0, scenes: 0 });
            h.UI.open();
            samples.push({ ...window.openWork, selection: h.canvas.selection, camera: { ...h.canvas.view } });
            await h.settle();
        }
        return samples;
    });
    for (const sample of work) {
        expect(sample.projections).toBe(1);
        expect(sample.renders).toBe(0);
        expect(sample.scenes).toBe(1);
        expect(sample.selection).toEqual({ kind: 'node', id: 'n1' });
        expect(sample.camera).toEqual({ x: 180, y: 70, zoom: 0.8 });
    }
    await expect(page.locator('.pc-canvas-host .pc-node-native')).toHaveCount(3);
    await expect(page.getByRole('textbox', { name: 'Node name', exact: true })).toHaveValue('Text 2');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
