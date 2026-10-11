import { test, expect } from '@playwright/test';

const heading = (page, id) => page.locator(`.pc-node[data-id="${id}"] .pc-native-heading`);
const targetBadge = (page, id) => page.locator(`.pc-node[data-id="${id}"] .pc-node-target`);

async function setup(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        await h.reset();
        const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const graph = structuredClone(h.graph), { x, y } = graph.nodes.n1;
        graph.nodes.n1 = { ...operationDefaults('text-rules'), id: 'n1', type: 'workflow', operation: 'text-rules', operationVersion: 1, enabled: true, x, y };
        graph.wires.w1.toPort = 'in';
        await h.activate(graph); await h.view({ x: 180, y: 10, zoom: 1 });
        h.H.flush(h.graph); h.H.track(h.graph);
    });
}

test('T targets one node, holds its preview, moves the target, and toggles it off', async ({ page }, testInfo) => {
    await setup(page);
    await heading(page, 'n0').click();
    await page.keyboard.press('t');
    await expect(targetBadge(page, 'n0')).toBeVisible();
    await expect(page.locator('.pc-output-preview footer')).toContainText('Targeted node');
    await page.locator('.pc-root').screenshot({ path: testInfo.outputPath('targeted-preview.png') });
    await heading(page, 'n1').click();
    await expect(page.locator('.pc-output-preview h3')).toHaveText('Compose · Output');
    await expect(targetBadge(page, 'n0')).toBeVisible();
    await page.keyboard.press('t');
    await expect(targetBadge(page, 'n1')).toBeVisible();
    await expect(targetBadge(page, 'n0')).toHaveCount(0);
    await expect(page.locator('.pc-output-preview h3')).toHaveText('Text Rules · Output');
    await page.keyboard.press('t');
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
    await expect(page.locator('.pc-output-preview footer')).toContainText('Following selection');
    await heading(page, 'n0').click();
    await expect(page.locator('.pc-output-preview h3')).toHaveText('Compose · Output');
});

test('T with no selection clears the target and otherwise does nothing', async ({ page }) => {
    await setup(page);
    const before = await page.evaluate(() => {
        const h = window.canvasHarness;
        return { graph: JSON.stringify(h.graph), history: h.H.peek(h.graph), providerCalls: h.providerCalls() };
    });
    await page.locator('.pc-canvas-host').focus();
    await page.keyboard.press('t');
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
    await heading(page, 'n0').click();
    await page.keyboard.press('t');
    await expect(targetBadge(page, 'n0')).toBeVisible();
    await page.evaluate(() => window.canvasHarness.canvas.select(null));
    await page.locator('.pc-canvas-host').focus();
    await page.keyboard.press('t');
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
    await expect(page.locator('.pc-output-preview footer')).toContainText('Following selection');
    await page.keyboard.press('t');
    expect(await page.evaluate(() => {
        const h = window.canvasHarness;
        return { graph: JSON.stringify(h.graph), history: h.H.peek(h.graph), providerCalls: h.providerCalls() };
    })).toEqual(before);
});

test('Target Node in the context menu and its T shortcut share the same toggle', async ({ page }) => {
    await setup(page);
    await heading(page, 'n0').click({ button: 'right' });
    const target = page.locator('.pc-context-menu').getByRole('menuitemcheckbox', { name: 'Target Node', exact: true });
    await expect(target.locator('.pc-context-shortcut')).toHaveText('T');
    await target.click();
    await expect(targetBadge(page, 'n0')).toBeVisible();
    await heading(page, 'n1').click({ button: 'right' });
    await page.keyboard.press('t');
    await expect(page.locator('.pc-context-menu')).toHaveCount(0);
    await expect(targetBadge(page, 'n0')).toHaveCount(0);
    await expect(targetBadge(page, 'n1')).toBeVisible();
    await heading(page, 'n1').click({ button: 'right' });
    await expect(target).toBeChecked();
    await page.keyboard.press('t');
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
});

test('targeting and the existing Pin and Follow selection controls can replace each other', async ({ page }) => {
    await setup(page);
    await heading(page, 'n0').click(); await page.keyboard.press('t');
    await heading(page, 'n1').click();
    await page.locator('.pc-output-preview').getByRole('button', { name: 'Pin preview', exact: true }).click();
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
    await expect(page.locator('.pc-output-preview footer')).toContainText('Pinned preview');
    await expect(page.locator('.pc-output-preview h3')).toHaveText('Compose · Output');
    await page.locator('.pc-canvas-host').focus(); await page.keyboard.press('t');
    await expect(targetBadge(page, 'n1')).toBeVisible();
    await expect(page.locator('.pc-output-preview h3')).toHaveText('Text Rules · Output');
    await expect(page.locator('.pc-output-preview').getByRole('button', { name: 'Pin preview', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'View', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Follow selection', exact: true }).click();
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
    await expect(page.locator('.pc-output-preview footer')).toContainText('Following selection');
    await heading(page, 'n0').click();
    await expect(page.locator('.pc-output-preview h3')).toHaveText('Compose · Output');
});

test('T leaves text editors alone and ignores repeats, composition, and modified keys', async ({ page }) => {
    await setup(page);
    await heading(page, 'n0').click();
    for (const tag of ['input', 'textarea', 'select', 'div']) {
        await page.evaluate(tag => {
            const editor = document.createElement(tag); editor.id = 'target-node-editor';
            if (tag === 'div') editor.contentEditable = 'true';
            document.querySelector('.pc-root').append(editor);
        }, tag);
        await page.locator('#target-node-editor').press('t');
        await expect(page.locator('.pc-node-target')).toHaveCount(0);
        await page.evaluate(() => document.getElementById('target-node-editor').remove());
    }
    await page.locator('.pc-canvas-host').focus();
    const prevented = await page.evaluate(() => [
        { repeat: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { isComposing: true },
    ].map(options => {
        const event = new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true, cancelable: true, ...options });
        window.canvasHarness.canvas.host.dispatchEvent(event); return event.defaultPrevented;
    }));
    expect(prevented).toEqual([false, false, false, false, false, false]);
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
    await page.keyboard.press('t');
    await expect(targetBadge(page, 'n0')).toBeVisible();
});

test('deleting a targeted node and opening another workflow clear targeting', async ({ page }) => {
    await setup(page);
    await heading(page, 'n0').click(); await page.keyboard.press('t');
    await page.evaluate(() => { window.canvasHarness.S.settings().ui.confirmDelete = false; });
    await page.keyboard.press('Delete');
    await expect(page.locator('.pc-node[data-id="n0"]')).toHaveCount(0);
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
    await expect(page.locator('.pc-output-preview footer')).toContainText('Following selection');
    await heading(page, 'n1').click(); await page.keyboard.press('t');
    await expect(targetBadge(page, 'n1')).toBeVisible();
    await page.evaluate(async () => { await window.canvasHarness.reset(); });
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
    await expect(page.locator('.pc-output-preview footer')).toContainText('Following selection');
});

test('R still runs the selected node while Preview follows a different target', async ({ page }) => {
    await setup(page);
    await heading(page, 'n0').click(); await page.keyboard.press('t');
    await heading(page, 'n1').click(); await page.keyboard.press('r');
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    await expect(targetBadge(page, 'n0')).toBeVisible();
    await expect(page.locator('.pc-output-preview h3')).toHaveText('Compose · Output');
    const run = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { getNativeWorkflowController } = await import('/src/run.js?v=' + h.version);
        const { expandRecordAddress } = await import('/src/workflow/record-data.js?v=' + h.version);
        const result = getNativeWorkflowController().lastResult(), recording = result.recording;
        return { ok: result.ok, target: expandRecordAddress(recording, recording.plan.target.address), providerCalls: h.providerCalls() };
    });
    expect(run).toEqual({ ok: true, target: { workflowId: 'browser-fixture', instancePath: [], nodeId: 'n1' }, providerCalls: 0 });
});

test('targets belong to a specific subgraph instance when node IDs are shared', async ({ page }) => {
    await setup(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { siblingWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const graph = siblingWorkflow(); graph.name = 'Target instances';
        Object.assign(graph.nodes['first/path'], { x: 100, y: 100 });
        Object.assign(graph.nodes.second, { x: 500, y: 100 });
        await h.activate(graph); await h.view({ x: 180, y: 10, zoom: 1 });
    });
    await heading(page, 'first/path').dblclick();
    await heading(page, 'work').click(); await page.keyboard.press('t');
    await expect(targetBadge(page, 'work')).toBeVisible();
    await expect(page.locator('.pc-output-preview h3')).toContainText('first/path');
    const firstTab = await page.locator('.pc-graph-tab[aria-selected="true"]').getAttribute('id');
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    await heading(page, 'second').dblclick();
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
    await heading(page, 'work').click();
    await expect(page.locator('.pc-output-preview h3')).toContainText('first/path');
    await page.keyboard.press('t');
    await expect(targetBadge(page, 'work')).toBeVisible();
    await expect(page.locator('.pc-output-preview h3')).toContainText('second');
    await page.locator('#' + firstTab).click();
    await expect(page.locator('.pc-node-target')).toHaveCount(0);
    await expect(page.locator('.pc-output-preview h3')).toContainText('second');
});
