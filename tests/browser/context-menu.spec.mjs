import { test, expect } from '@playwright/test';

const heading = (page, id) => page.locator(`.pc-node[data-id="${id}"] .pc-native-heading`);
const menu = page => page.locator('.pc-context-menu[role="menu"]').first();
const action = (page, name) => menu(page).getByRole('menuitem', { name, exact: true });

async function setup(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        await h.reset();
        h.S.settings().ui.confirmDelete = false;
        await h.view({ x: 180, y: 10, zoom: 1 });
        h.H.flush(h.graph); h.H.track(h.graph);
    });
}

async function snapshot(page) {
    return page.evaluate(() => {
        const graph = structuredClone(window.canvasHarness.graph);
        delete graph.updatedAt;
        return graph;
    });
}

async function selected(page) {
    return page.evaluate(() => {
        const canvas = window.canvasHarness.canvas;
        return [...new Set([...canvas.multi, ...(canvas.selection?.kind === 'node' ? [canvas.selection.id] : [])])].sort();
    });
}

async function lastRun(page) {
    return page.evaluate(async () => {
        const h = window.canvasHarness;
        const { getNativeWorkflowController } = await import('/src/run.js?v=' + h.version);
        const { expandRecordAddress } = await import('/src/workflow/record-data.js?v=' + h.version);
        const result = getNativeWorkflowController().lastResult(), recording = result.recording;
        const target = encoded => encoded && ({ ...expandRecordAddress(recording, encoded.address), portId: recording.identities.strings[encoded.port] });
        return { ok: result.ok, mode: result.mode, calls: result.actualCalls,
            target: target(recording.plan.target), resolvedTarget: target(recording.plan.resolvedTarget),
            included: recording.units.filter(unit => unit.included).map(unit => expandRecordAddress(recording, unit.address)),
            providerCalls: h.providerCalls() };
    });
}

test('right-clicking another node targets its Delete command and Undo restores it', async ({ page }) => {
    await setup(page);
    const before = await snapshot(page);
    await heading(page, 'n0').click();
    await heading(page, 'n1').click({ button: 'right' });
    await action(page, 'Delete').click();
    const deleted = await snapshot(page);
    expect(Object.keys(deleted.nodes).sort()).toEqual(['n0', 'n2']);
    expect(deleted.nodes.n0).toEqual(before.nodes.n0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await snapshot(page)).toEqual(before);
});

test('right-click inside a multiselection keeps Copy, Cut and Delete scoped to that selection', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await setup(page);
    const before = await snapshot(page);
    await heading(page, 'n0').click();
    await heading(page, 'n1').click({ modifiers: ['Shift'] });
    await heading(page, 'n0').click({ button: 'right' });
    expect(await selected(page)).toEqual(['n0', 'n1']);
    await action(page, 'Copy').click();
    await expect.poll(() => page.evaluate(async () => {
        try { return Object.keys(JSON.parse(await navigator.clipboard.readText()).graph.nodes).sort(); }
        catch { return []; }
    })).toEqual(['n0', 'n1']);
    expect(await snapshot(page)).toEqual(before);
    await heading(page, 'n1').click({ button: 'right' });
    await action(page, 'Cut').click();
    await expect.poll(async () => Object.keys((await snapshot(page)).nodes)).toEqual(['n2']);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await snapshot(page)).toEqual(before);
    await heading(page, 'n0').click();
    await heading(page, 'n1').click({ modifiers: ['Shift'] });
    await heading(page, 'n0').click({ button: 'right' });
    await action(page, 'Delete').click();
    expect(Object.keys((await snapshot(page)).nodes)).toEqual(['n2']);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await snapshot(page)).toEqual(before);
});

test('right-click outside a multiselection replaces the selection before deleting', async ({ page }) => {
    await setup(page);
    const before = await snapshot(page);
    await heading(page, 'n0').click();
    await heading(page, 'n1').click({ modifiers: ['Shift'] });
    await heading(page, 'n2').click({ button: 'right' });
    expect(await selected(page)).toEqual(['n2']);
    await action(page, 'Delete').click();
    expect(Object.keys((await snapshot(page)).nodes).sort()).toEqual(['n0', 'n1']);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await snapshot(page)).toEqual(before);
});

test('Rename focuses the alias editor and Compact card changes presentation without editing the workflow', async ({ page }) => {
    await setup(page);
    const before = await snapshot(page);
    await heading(page, 'n0').click({ button: 'right' });
    await action(page, 'Rename').click();
    const alias = page.getByLabel('Node name', { exact: true });
    await expect(alias).toBeFocused();
    expect(await snapshot(page)).toEqual(before);
    await alias.fill('Local menu alias'); await alias.press('Tab');
    await expect(heading(page, 'n0')).toHaveText('Local menu alias');
    expect(await snapshot(page)).toEqual(before);
    await heading(page, 'n0').click({ button: 'right' });
    const compact = menu(page).getByRole('menuitemcheckbox', { name: 'Compact card', exact: true });
    await expect(compact).toHaveAttribute('aria-checked', 'false');
    await compact.click();
    await expect(page.locator('.pc-node[data-id="n0"]')).toHaveClass(/pc-node-compact/);
    expect(await snapshot(page)).toEqual(before);
    await page.locator('.pc-node[data-id="n0"]').click({ button: 'right' });
    await expect(menu(page).getByRole('menuitemcheckbox', { name: 'Compact card', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await page.locator('.pc-canvas-host').focus(); await page.keyboard.press('F2');
    await expect(alias).toBeFocused();
    expect(await snapshot(page)).toEqual(before);
});

test('Escape dismisses the menu while retaining the canvas selection and workspace', async ({ page }) => {
    await setup(page);
    await heading(page, 'n0').click();
    await heading(page, 'n0').click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    expect(await selected(page)).toEqual(['n0']);
    await expect(page.locator('.pc-root')).toBeVisible();
    await expect(page.locator('.pc-node[data-id="n0"]')).toHaveClass(/pc-selected/);
});

test('Pin preview follows the clicked Compose output and Run to here executes only its upstream nodes', async ({ page }) => {
    await setup(page);
    const before = await snapshot(page);
    await heading(page, 'n0').click();
    await heading(page, 'n1').click({ button: 'right' });
    const pin = menu(page).getByRole('menuitemcheckbox', { name: 'Pin preview', exact: true });
    await expect(pin).toHaveAttribute('aria-checked', 'false');
    await pin.click();
    const title = page.locator('.pc-output-preview h3');
    const wanted = { workflowId: 'browser-fixture', instancePath: [], nodeId: 'n1', portId: 'out' };
    await expect(title).toHaveText('Compose · Output');
    await heading(page, 'n0').click();
    await expect(title).toHaveText('Compose · Output');
    await expect(page.locator('.pc-output-preview footer')).toContainText('Pinned');
    await heading(page, 'n1').click({ button: 'right' });
    await expect(menu(page).getByRole('menuitemcheckbox', { name: 'Unpin preview', exact: true })).toHaveAttribute('aria-checked', 'true');
    await action(page, 'Run to here').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    const result = await lastRun(page);
    expect(result).toEqual({ ok: true, mode: 'target', calls: 0, target: wanted, resolvedTarget: wanted,
        included: [
            { workflowId: 'browser-fixture', instancePath: [], nodeId: 'n0' },
            { workflowId: 'browser-fixture', instancePath: [], nodeId: 'n1' },
        ], providerCalls: 0 });
    await expect(page.locator('.pc-output-preview [role="tabpanel"] pre')).toContainText('Synthetic rendering fixture.');
    expect(await snapshot(page)).toEqual(before);
});

test('multi-output Run to here directly runs the pinned output and advertises R', async ({ page }) => {
    await setup(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { twoOutputWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const graph = twoOutputWorkflow(); graph.name = 'Context output choices';
        await h.activate(graph); await h.view({ x: 180, y: 0, zoom: .8 });
    });
    await heading(page, 'wrapper').click({ button: 'right' });
    await expect(action(page, 'Pin preview')).toHaveAttribute('aria-haspopup', 'menu');
    await action(page, 'Pin preview').click();
    await page.getByRole('menuitemcheckbox', { name: 'Second', exact: true }).click();
    const wanted = { workflowId: 'two-output-root', instancePath: [], nodeId: 'wrapper', portId: 'second' };
    await expect(page.locator('.pc-output-preview h3')).toContainText('Second');
    await expect(page.locator('.pc-output-preview footer')).toContainText('Pinned preview');
    const before = await snapshot(page);
    const history = await page.evaluate(() => window.canvasHarness.H.peek(window.canvasHarness.graph));
    await heading(page, 'wrapper').click({ button: 'right' });
    const runHere = action(page, 'Run to here');
    await expect(runHere).not.toHaveAttribute('aria-haspopup', 'menu');
    await expect(runHere.locator('.pc-context-shortcut')).toHaveText('R');
    await runHere.click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    const result = await lastRun(page);
    expect(result.ok).toBe(true); expect(result.calls).toBe(0); expect(result.providerCalls).toBe(0);
    expect(result.target).toEqual(wanted);
    expect(result.resolvedTarget).toEqual({ workflowId: 'two-output-root', instancePath: ['wrapper'], nodeId: 'beta', portId: 'out' });
    expect(result.included).toEqual([{ workflowId: 'two-output-root', instancePath: ['wrapper'], nodeId: 'beta' }]);
    await expect(page.locator('.pc-output-preview [role="tabpanel"] pre')).toContainText('Beta');
    await expect(page.locator('.pc-output-preview [role="tabpanel"] pre')).not.toContainText('Alpha');
    expect(await snapshot(page)).toEqual(before);
    expect(await page.evaluate(() => window.canvasHarness.H.peek(window.canvasHarness.graph))).toEqual(history);
});

test('multi-output Run to here preserves an output chosen through the node context menu after unpinning', async ({ page }) => {
    await setup(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { twoOutputWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        await h.activate(twoOutputWorkflow()); await h.view({ x: 180, y: 0, zoom: .8 });
    });
    await heading(page, 'wrapper').click();
    const wanted = { workflowId: 'two-output-root', instancePath: [], nodeId: 'wrapper', portId: 'second' };
    await heading(page, 'wrapper').click({ button: 'right' });
    await action(page, 'Pin preview').click();
    await page.getByRole('menuitemcheckbox', { name: 'Second', exact: true }).click();
    await page.locator('.pc-output-preview').getByRole('button', { name: 'Pin preview', exact: true }).click();
    await expect(page.locator('.pc-output-preview h3')).toContainText('Second');
    await expect(page.locator('.pc-output-preview footer')).not.toContainText('Pinned');
    await heading(page, 'wrapper').click({ button: 'right' });
    await action(page, 'Run to here').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    const result = await lastRun(page);
    expect(result.target).toEqual(wanted);
    expect(result.resolvedTarget).toEqual({ workflowId: 'two-output-root', instancePath: ['wrapper'], nodeId: 'beta', portId: 'out' });
    expect(result.included).toEqual([{ workflowId: 'two-output-root', instancePath: ['wrapper'], nodeId: 'beta' }]);
});

test('multi-output Run to here directly uses the primary output when no output is pinned', async ({ page }) => {
    await setup(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { twoOutputWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        await h.activate(twoOutputWorkflow()); await h.view({ x: 180, y: 0, zoom: .8 });
    });
    await heading(page, 'wrapper').click({ button: 'right' });
    await action(page, 'Run to here').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    const result = await lastRun(page);
    expect(result.target).toEqual({ workflowId: 'two-output-root', instancePath: [], nodeId: 'wrapper', portId: 'first' });
    expect(result.resolvedTarget).toEqual({ workflowId: 'two-output-root', instancePath: ['wrapper'], nodeId: 'alpha', portId: 'out' });
    expect(result.included).toEqual([{ workflowId: 'two-output-root', instancePath: ['wrapper'], nodeId: 'alpha' }]);
    await expect(page.locator('.pc-output-preview [role="tabpanel"] pre')).toContainText('Alpha');
    await expect(page.locator('.pc-output-preview [role="tabpanel"] pre')).not.toContainText('Beta');
});

test('host keyboard styling cannot add shortcut badges or expand the context-menu rows', async ({ page }) => {
    await setup(page);
    await page.addStyleTag({ content: `kbd {
        display: inline-block;
        padding: 2px 4px;
        font-family: var(--monoFontFamily);
        white-space: nowrap;
        background-color: rgba(255, 255, 255, 0.9);
        color: #333;
        border: 1px solid #b4b4b4;
        border-radius: 3px;
        box-shadow: 0 1px 1px rgba(0, 0, 0, 0.2), 0 2px 0 0 rgba(255, 255, 255, 0.7) inset;
        font-size: 90%;
        line-height: 1;
    }` });
    await heading(page, 'n1').click({ button: 'right' });
    const metrics = await menu(page).evaluate(element => ({
        width: element.getBoundingClientRect().width,
        rows: [...element.querySelectorAll('.pc-context-item')].map(row => row.getBoundingClientRect().height),
        shortcuts: [...element.querySelectorAll('.pc-context-shortcut')].map(shortcut => {
            const style = getComputedStyle(shortcut);
            return { background: style.backgroundColor, padding: style.padding, border: style.borderWidth,
                radius: style.borderRadius, shadow: style.boxShadow, fontSize: style.fontSize };
        }),
    }));
    expect(metrics.shortcuts.length).toBeGreaterThan(0);
    for (const shortcut of metrics.shortcuts) expect(shortcut).toEqual({
        background: 'rgba(0, 0, 0, 0)', padding: '0px', border: '0px', radius: '0px', shadow: 'none', fontSize: '12px',
    });
    expect(metrics.width).toBe(296);
    for (const height of metrics.rows) expect(height).toBe(32);
    await menu(page).getByRole('menuitemcheckbox', { name: 'Compact card', exact: true }).click();
    await page.evaluate(async () => { await window.canvasHarness.view({ x: 180, y: 10, zoom: 1 }); });
    await page.locator('.pc-node[data-id="n1"]').click({ button: 'right' });
    const compact = menu(page).getByRole('menuitemcheckbox', { name: 'Compact card', exact: true });
    await expect(compact).toHaveAttribute('aria-checked', 'true');
    await expect(compact.locator('.pc-context-shortcut')).toHaveText('Shift C');
    await expect(compact.locator('.pc-context-check')).toHaveText('✓');
    expect((await compact.boundingBox()).height).toBe(32);
});

test('long subgraph menus fit a small viewport and keyboard navigation skips read-only commands', async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 736, height: 480 });
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { nestedWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const graph = nestedWorkflow(); graph.name = 'Context library';
        await h.activate(graph);
        const node = h.canvas.graph.nodes['first/path'];
        await h.view({ x: 180 - node.x * .7, y: 20 - node.y * .7, zoom: .7 });
    });
    await heading(page, 'first/path').click({ button: 'right' });
    const geometry = await menu(page).evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    });
    expect(geometry.x).toBeGreaterThanOrEqual(4); expect(geometry.y).toBeGreaterThanOrEqual(4);
    expect(geometry.right).toBeLessThanOrEqual(geometry.width - 4);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height - 4);
    await action(page, 'Open saved definition').click();
    await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Outer');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(async () => {
        const h = window.canvasHarness, node = h.canvas.graph.nodes.work;
        await h.view({ x: 180 - node.x * .7, y: 20 - node.y * .7, zoom: .7 });
    });
    const before = await page.evaluate(() => JSON.stringify(window.canvasHarness.S.activeWorkflow()));
    await heading(page, 'work').click({ button: 'right' });
    for (const name of ['Cut', 'Delete', 'Duplicate', 'Make editable copy', 'Unpack subgraph', 'Create subgraph']) {
        await expect(action(page, name)).toBeDisabled();
    }
    await expect(action(page, 'Run to here')).toHaveCount(0);
    await expect(action(page, 'Copy')).toBeEnabled();
    const enabled = await menu(page).locator('button').evaluateAll(buttons => buttons.filter(button => !button.disabled).map(button => button.getAttribute('aria-label') || button.textContent));
    await page.keyboard.press('Home');
    await expect(action(page, 'Details')).toBeFocused();
    for (const name of enabled.slice(1)) {
        await page.keyboard.press('ArrowDown');
        await expect(menu(page).locator('button:focus')).toHaveAttribute('aria-label', name);
    }
    await page.keyboard.press('Home'); await expect(action(page, 'Details')).toBeFocused();
    await page.keyboard.press('End'); await expect(menu(page).locator('button:focus')).toHaveAttribute('aria-label', enabled.at(-1));
    await action(page, 'Open subgraph').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Plan');
    expect(await page.evaluate(() => JSON.stringify(window.canvasHarness.S.activeWorkflow()))).toBe(before);
});
