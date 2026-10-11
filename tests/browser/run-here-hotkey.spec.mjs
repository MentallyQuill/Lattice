import { test, expect } from '@playwright/test';

const heading = (page, id) => page.locator(`.pc-node[data-id="${id}"] .pc-native-heading`);

async function setup(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        await h.reset(); await h.view({ x: 180, y: 10, zoom: 1 });
        h.H.flush(h.graph); h.H.track(h.graph);
    });
}

async function documentState(page) {
    return page.evaluate(() => {
        const h = window.canvasHarness, graph = structuredClone(h.graph);
        delete graph.updatedAt;
        return { graph, history: h.H.peek(h.graph) };
    });
}

async function runResult(page) {
    return page.evaluate(async () => {
        const h = window.canvasHarness;
        const { getNativeWorkflowController } = await import('/src/run.js?v=' + h.version);
        const result = getNativeWorkflowController().lastResult();
        if (!result) return null;
        const { expandRecordAddress } = await import('/src/workflow/record-data.js?v=' + h.version);
        const recording = result.recording;
        const target = encoded => ({ ...expandRecordAddress(recording, encoded.address), portId: recording.identities.strings[encoded.port] });
        return { ok: result.ok, mode: result.mode, target: target(recording.plan.target),
            included: recording.units.filter(unit => unit.included).map(unit => expandRecordAddress(recording, unit.address)),
            providerCalls: h.providerCalls() };
    });
}

test('R runs the selected node even when another node is pinned in Preview', async ({ page }) => {
    await setup(page);
    await heading(page, 'n0').click({ button: 'right' });
    await page.locator('.pc-context-menu').getByRole('menuitemcheckbox', { name: 'Pin preview', exact: true }).click();
    await heading(page, 'n1').click();
    await expect(page.locator('.pc-output-preview h3')).toHaveText('Compose · Output');
    await expect(page.locator('.pc-output-preview footer')).toContainText('Pinned preview');
    const before = await documentState(page);
    await page.locator('.pc-canvas-host').focus();
    await page.keyboard.press('r');
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    expect(await runResult(page)).toEqual({ ok: true, mode: 'target',
        target: { workflowId: 'browser-fixture', instancePath: [], nodeId: 'n1', portId: 'out' },
        included: [
            { workflowId: 'browser-fixture', instancePath: [], nodeId: 'n0' },
            { workflowId: 'browser-fixture', instancePath: [], nodeId: 'n1' },
        ], providerCalls: 0 });
    expect(await documentState(page)).toEqual(before);
    expect(await page.evaluate(() => window.canvasHarness.canvas.selection)).toEqual({ kind: 'node', id: 'n1' });
});

test('R in an open context menu runs the selected node and dismisses the menu', async ({ page }) => {
    await setup(page);
    const before = await documentState(page);
    await heading(page, 'n1').click({ button: 'right' });
    const contextMenu = page.locator('.pc-context-menu[role="menu"]').first();
    await expect(contextMenu.getByRole('menuitem', { name: 'Details', exact: true })).toBeFocused();
    await page.keyboard.press('r');
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    await expect(page.locator('.pc-context-menu')).toHaveCount(0);
    expect(await runResult(page)).toEqual({ ok: true, mode: 'target',
        target: { workflowId: 'browser-fixture', instancePath: [], nodeId: 'n1', portId: 'out' },
        included: [
            { workflowId: 'browser-fixture', instancePath: [], nodeId: 'n0' },
            { workflowId: 'browser-fixture', instancePath: [], nodeId: 'n1' },
        ], providerCalls: 0 });
    expect(await documentState(page)).toEqual(before);
});

test('the former Ctrl Enter shortcut no longer runs the selected node', async ({ page }) => {
    await setup(page);
    await heading(page, 'n1').click();
    const before = await documentState(page);
    await page.locator('.pc-canvas-host').focus();
    await page.keyboard.press('Control+Enter');
    await page.evaluate(() => window.canvasHarness.settle());
    expect(await runResult(page)).toBeNull();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Not run');
    expect(await documentState(page)).toEqual(before);
});

test('R does nothing without exactly one runnable selected node', async ({ page }) => {
    await setup(page);
    const before = await documentState(page);
    for (const pick of [
        { selection: null, multi: [] },
        { selection: { kind: 'wire', id: 'w1' }, multi: [] },
        { selection: null, multi: ['n0', 'n1'] },
    ]) {
        await page.evaluate(pick => {
            const canvas = window.canvasHarness.canvas;
            canvas.select(pick.selection); canvas.setMulti(pick.multi);
        }, pick);
        await page.locator('.pc-canvas-host').focus();
        await page.keyboard.press('r');
        await page.evaluate(() => window.canvasHarness.settle());
        expect(await runResult(page), JSON.stringify(pick)).toBeNull();
    }
    expect(await documentState(page)).toEqual(before);
});

test('R leaves text editors alone and ignores repeat and command modifiers', async ({ page }) => {
    await setup(page);
    await heading(page, 'n1').click();
    const before = await documentState(page);
    for (const tag of ['input', 'textarea', 'div']) {
        await page.evaluate(tag => {
            const editor = document.createElement(tag);
            editor.id = 'run-here-test-editor';
            if (tag === 'div') editor.contentEditable = 'true';
            document.querySelector('.pc-root').append(editor);
        }, tag);
        await page.locator('#run-here-test-editor').press('r');
        await page.evaluate(() => window.canvasHarness.settle());
        expect(await runResult(page), tag).toBeNull();
        await page.evaluate(() => document.getElementById('run-here-test-editor').remove());
    }
    await page.locator('.pc-canvas-host').focus();
    const events = await page.evaluate(() => [
        { repeat: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true },
    ].map(options => {
        const event = new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', bubbles: true, cancelable: true, ...options });
        window.canvasHarness.canvas.host.dispatchEvent(event);
        return { prevented: event.defaultPrevented };
    }));
    expect(events).toEqual([{ prevented: false }, { prevented: false }, { prevented: false }, { prevented: false }, { prevented: false }]);
    await page.evaluate(() => window.canvasHarness.settle());
    expect(await runResult(page)).toBeNull();
    expect(await documentState(page)).toEqual(before);
});

test('R and Run to here preserve an in-flight run', async ({ page }) => {
    await setup(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { twoOutputWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        await h.activate(twoOutputWorkflow()); await h.view({ x: 180, y: 0, zoom: .8 });
        window.runHereTokenCalls = 0;
        h.context.getTokenCountAsync = () => {
            window.runHereTokenCalls++;
            return new Promise(resolve => { window.releaseRunHereTokens = () => resolve(1); });
        };
    });
    await heading(page, 'one').click();
    const before = await documentState(page);
    await page.locator('.pc-canvas-host').focus();
    await page.keyboard.press('r');
    await expect.poll(() => page.evaluate(() => window.runHereTokenCalls)).toBe(1);
    const activity = () => page.evaluate(async () => {
        const h = window.canvasHarness;
        const { getNativeWorkflowController } = await import('/src/run.js?v=' + h.version);
        const active = getNativeWorkflowController().activity();
        return active && { busy: active.busy, runId: active.runId };
    });
    const first = await activity();
    expect(first.busy).toBe(true);
    await heading(page, 'wrapper').click();
    await page.locator('.pc-canvas-host').focus();
    await page.keyboard.press('r');
    await page.evaluate(() => window.canvasHarness.settle());
    expect(await activity()).toEqual(first);
    expect(await page.evaluate(() => window.runHereTokenCalls)).toBe(1);
    await heading(page, 'wrapper').click({ button: 'right' });
    await expect(page.locator('.pc-context-menu').getByRole('menuitem', { name: 'Run to here', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.releaseRunHereTokens());
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    const completed = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { getNativeWorkflowController } = await import('/src/run.js?v=' + h.version);
        const { expandRecordAddress } = await import('/src/workflow/record-data.js?v=' + h.version);
        const result = getNativeWorkflowController().lastResult();
        return { ok: result.ok, target: expandRecordAddress(result.recording, result.recording.plan.target.address), providerCalls: h.providerCalls() };
    });
    expect(completed).toEqual({ ok: true, target: { workflowId: 'two-output-root', instancePath: [], nodeId: 'one' }, providerCalls: 0 });
    expect(await documentState(page)).toEqual(before);
});
