import { test, expect } from '@playwright/test';

async function launch(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    const ids = await page.evaluate(() => window.canvasHarness.reset(1, 1));
    await page.evaluate(id => window.canvasHarness.canvas.select({kind: 'node', id}), ids[0]);
}

test('node guide uses the real card and lazy themed example with approved disclosure defaults', async ({page}) => {
    await launch(page);
    const help = page.getByRole('button', {name: 'Open Compose guide', exact: true});
    await expect(help).toBeVisible();
    await help.click();
    const guide = page.getByRole('dialog', {name: 'Compose guide', exact: true});
    await expect(guide).toBeVisible();
    await expect(guide.getByRole('heading', {name: 'How to use it'})).toBeVisible();
    await expect(guide.locator('details[data-guide-settings]')).toHaveAttribute('open', '');
    await expect(guide.locator('details[data-guide-example]')).not.toHaveAttribute('open');
    await expect(guide.locator('[data-guide-node] .pc-node')).toHaveCount(1);
    await expect(guide.locator('.pc-canvas-host')).toHaveCount(0);
    await guide.screenshot({path: '.tmp/node-guide-desktop.png'});
    await guide.locator('details[data-guide-example] > summary').click();
    const canvas = guide.locator('.pc-canvas-host');
    await expect(canvas).toBeVisible();
    await expect(canvas.locator('[data-pc-renderer="svelte"]')).toHaveCount(1);
    await expect(canvas.locator('.pc-node')).toHaveCount(5);
    await expect(canvas.locator('.pc-wire-native')).toHaveCount(4);
    await expect(guide.getByRole('button', {name: 'Add example to current tab', exact: true})).toBeVisible();
    await expect(guide.getByText(/Drag to pan|Scroll to zoom|See these settings in Details/)).toHaveCount(0);
    const colors = await page.evaluate(() => [...document.querySelectorAll('.pc-canvas-host')].map(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).backgroundImage]));
    expect(colors.at(-1)).toEqual(colors[0]);
    const before = await page.evaluate(() => ({camera: {...window.canvasHarness.canvas.view}, graph: JSON.stringify(window.canvasHarness.graph)}));
    await canvas.hover(); await page.mouse.wheel(0, -100);
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
    await page.mouse.move(box.x + 70, box.y + 50); await page.mouse.up();
    expect(await page.evaluate(() => ({camera: {...window.canvasHarness.canvas.view}, graph: JSON.stringify(window.canvasHarness.graph)}))).toEqual(before);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    await page.keyboard.press('Escape');
    await expect(guide).toHaveCount(0);
    await expect(help).toBeFocused();
});

test('example preview stays readable on a narrow screen and follows theme changes', async ({page}) => {
    await page.setViewportSize({width: 390, height: 1000});
    await launch(page);
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    const guide = page.locator('.pc-node-guide-dialog');
    await guide.locator('details[data-guide-example] > summary').click();
    const canvas = guide.locator('.pc-canvas-host');
    await expect(canvas.locator('.pc-wire-native')).toHaveCount(4);
    const layout = await canvas.evaluate(el => ({width: el.clientWidth, scale: new DOMMatrix(getComputedStyle(el.querySelector('.pc-viewport')).transform).a}));
    expect(layout.width).toBeLessThan(350); expect(layout.scale).toBeGreaterThanOrEqual(.92);
    expect(await guide.locator('.pc-node-guide').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        h.S.settings().ui.theme.style.grid = 'lines';
        const {applyTheme} = await import('/src/theme.js?v=' + h.version);
        applyTheme(); h.UI.refreshIfOpen(); await h.settle();
    });
    const themes = await page.evaluate(() => [...document.querySelectorAll('.pc-canvas-host')].map(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).backgroundImage]));
    expect(themes.at(-1)).toEqual(themes[0]); expect(themes[0][1]).toContain('linear-gradient');
    await canvas.scrollIntoViewIfNeeded();
    await canvas.screenshot({path: '.tmp/node-guide-narrow.png'});
});

test('focused guide bracket hotkeys zoom its camera without changing the parent graph camera', async ({page}) => {
    await launch(page);
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    const guide = page.getByRole('dialog', {name: 'Compose guide', exact: true});
    await guide.locator('details[data-guide-example] > summary').click();
    const canvas = guide.locator('.pc-canvas-host');
    await expect(canvas.locator('.pc-wire-native')).toHaveCount(4);
    const localCamera = () => canvas.evaluate(el => {
        const matrix = new DOMMatrix(getComputedStyle(el.querySelector('.pc-viewport')).transform);
        return {x: matrix.e, y: matrix.f, scale: matrix.a};
    });
    const parentBefore = await page.evaluate(() => ({camera: {...window.canvasHarness.canvas.view}, graph: JSON.stringify(window.canvasHarness.graph)}));
    const before = await localCamera();
    await canvas.focus();
    await page.keyboard.press('BracketRight');
    const zoomed = await localCamera();
    expect(zoomed.scale).toBeCloseTo(before.scale * 1.15, 5);
    const center = await canvas.evaluate(el => ({x: el.clientWidth / 2, y: el.clientHeight / 2}));
    expect(zoomed.x).toBeCloseTo(center.x - (center.x - before.x) * 1.15, 3);
    expect(zoomed.y).toBeCloseTo(center.y - (center.y - before.y) * 1.15, 3);
    await page.keyboard.press('BracketLeft');
    const restored = await localCamera();
    expect(restored.scale).toBeCloseTo(before.scale, 5);
    expect(restored.x).toBeCloseTo(before.x, 3);
    expect(restored.y).toBeCloseTo(before.y, 3);
    expect(await page.evaluate(() => ({camera: {...window.canvasHarness.canvas.view}, graph: JSON.stringify(window.canvasHarness.graph)}))).toEqual(parentBefore);
});

test('file-backed examples include readable and copyable setup data', async ({page, context}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await launch(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const {getNodeGuideExample} = await import('/src/workflow/node-guide-examples.js?v=' + h.version);
        const example = getNodeGuideExample('story-clock');
        const node = Object.values(example.graph.nodes).find(node => node.operation === 'story-clock');
        await h.activate(example.graph); h.canvas.select({kind: 'node', id: node.id}); await h.settle();
    });
    await page.getByRole('button', {name: 'Open Story Clock guide', exact: true}).click();
    const guide = page.locator('.pc-node-guide-dialog');
    await guide.locator('details[data-guide-example] > summary').click();
    await guide.getByText('Setup data', {exact: true}).click();
    const fixture = guide.getByRole('textbox', {name: 'story-clock.json', exact: true});
    await expect(fixture).toBeVisible();
    expect(JSON.parse(await fixture.inputValue())).toBeTruthy();
    await guide.getByRole('button', {name: 'Copy story-clock.json', exact: true}).click();
    await expect(guide.getByRole('status')).toHaveText('Copied story-clock.json.');
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toEqual(await fixture.inputValue());
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('subgraph boundary guides remain available inside a nested view', async ({page}) => {
    await launch(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const {getNodeGuideExample} = await import('/src/workflow/node-guide-examples.js?v=' + h.version);
        const example = getNodeGuideExample('subgraph');
        await h.activate(example.graph);
        const wrapper = Object.values(h.graph.nodes).find(node => node.type === 'subgraph');
        h.canvas.hooks.onOpen(wrapper); await h.settle();
    });
    const before = await page.evaluate(() => JSON.stringify(window.canvasHarness.graph));
    for (const key of ['subgraph-input', 'subgraph-output']) {
        await page.evaluate(async key => {
            const h = window.canvasHarness;
            const node = Object.values(h.canvas.graph.nodes).find(node => node.type === key);
            if (!node) throw Error('Missing boundary ' + key);
            h.canvas.select({kind: 'node', id: node.id}); await h.settle();
        }, key);
        await page.locator('.pc-workspace-details button[title^="Help with"]').click();
        const guide = page.locator('.pc-node-guide-dialog');
        await expect(guide.locator('.pc-node-guide')).toHaveAttribute('data-guide-key', key);
        await expect(guide.locator('[data-guide-node] .pc-node')).toHaveCount(1);
        await guide.locator('details[data-guide-example] > summary').click();
        await expect(guide.locator('.pc-canvas-host')).toBeVisible();
        await expect(guide.getByRole('button', {name: 'Add example to current tab', exact: true})).toBeDisabled();
        await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => JSON.stringify(window.canvasHarness.graph))).toEqual(before);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('closing the workspace expires guide previews and reopening starts with no guide', async ({page}) => {
    await launch(page);
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    const guide = page.locator('.pc-node-guide-dialog');
    await guide.locator('details[data-guide-example] > summary').click();
    await expect(guide.locator('.pc-canvas-host')).toBeVisible();
    await page.evaluate(async () => { const h = window.canvasHarness; h.UI.close(); h.UI.open(); await h.settle(); });
    await expect(guide).toHaveCount(0);
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    await expect(guide.locator('[data-guide-example]')).not.toHaveAttribute('open');
});

test('guides cover model, data, recall, structural and comment nodes without execution', async ({page}) => {
    await launch(page);
    for (const key of ['file-input', 'state', 'recall', 'for-each', 'subgraph', 'comment']) {
        await page.evaluate(async key => {
            const h = window.canvasHarness;
            const {getNodeGuideExample} = await import('/src/workflow/node-guide-examples.js?v=' + h.version);
            const example = getNodeGuideExample(key);
            const node = Object.values(example.graph.nodes).find(node => key === 'comment' ? node.commentFrame : node.operation === key || node.type === key);
            if (!node) throw Error('Missing root example node for ' + key);
            await h.activate(example.graph); h.canvas.select({kind: 'node', id: node.id}); await h.settle();
        }, key);
        await page.locator('.pc-workspace-details button[title^="Help with"]').click();
        const guide = page.locator('.pc-node-guide-dialog');
        await expect(guide.locator('.pc-node-guide')).toHaveAttribute('data-guide-key', key);
        await expect(guide.locator('[data-guide-settings]')).toHaveAttribute('open', '');
        expect((await guide.locator('dd').allTextContents()).every(text => text.trim().length > 15)).toBe(true);
        await guide.locator('details[data-guide-example] > summary').click();
        await expect(guide.locator('.pc-canvas-host')).toBeVisible();
        await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('adding the complete Compose example preserves existing content and takes one undo', async ({page}) => {
    await launch(page);
    const before = await page.evaluate(() => structuredClone(window.canvasHarness.graph));
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    const guide = page.getByRole('dialog', {name: 'Compose guide', exact: true});
    await guide.locator('details[data-guide-example] > summary').click();
    await guide.getByRole('button', {name: 'Add example to current tab', exact: true}).click();
    await expect(guide).toHaveCount(0);
    const after = await page.evaluate(() => structuredClone(window.canvasHarness.graph));
    expect(Object.keys(after.nodes)).toHaveLength(Object.keys(before.nodes).length + 5);
    for (const id of Object.keys(before.nodes)) expect(after.nodes[id]).toEqual(before.nodes[id]);
    expect(Object.values(after.nodes).filter(node => node.operation === 'generate-reply')).toHaveLength(1);
    expect(Object.values(after.wires)).toHaveLength(4);
    expect(await page.evaluate(() => window.canvasHarness.selection.length)).toBe(5);
    await page.keyboard.press('Control+KeyZ');
    const undone = await page.evaluate(() => structuredClone(window.canvasHarness.graph));
    expect(undone.nodes).toEqual(before.nodes); expect(undone.wires).toEqual(before.wires);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});


test('guide insertion status refreshes across native busy and settled publications while typed drafts survive', async ({page}) => {
    await launch(page);
    await page.evaluate(async () => { const h = window.canvasHarness; h.graph.nodes.n0.outputKind = 'guidance'; h.graph.nodes.n0.budgetTokens = 128; await h.activate(h.graph); h.canvas.select({kind: 'node', id: 'n0'}); await h.settle(); });
    const section = page.getByRole('textbox', {name: 'Section 1 text', exact: true});
    await section.fill('Unsaved typed guide draft');
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    const guide = page.getByRole('dialog', {name: 'Compose guide', exact: true});
    await guide.locator('details[data-guide-example] > summary').click();
    const add = guide.getByRole('button', {name: 'Add example to current tab', exact: true});
    await expect(add).toBeEnabled();
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        h.context.getTokenCountAsync = () => new Promise(resolve => { window.releaseGuideTokens = () => resolve(1); });
        const runtime = (await import('/src/run.js?v=' + h.version)).getNativeWorkflowController();
        window.guideRun = runtime.runTarget(h.graph, {workflowId: h.graph.id, instancePath: [], nodeId: 'n0', portId: 'out'}).then(result => { window.guideRunResult = result; return result; });
    });
    await page.waitForFunction(() => !!window.releaseGuideTokens || !!window.guideRunResult);
    expect(await page.evaluate(() => window.guideRunResult), 'run must reach its real tokenizer gate').toBeUndefined();
    await expect(add).toBeDisabled();
    await expect(guide).toContainText('Wait for the current run to finish');
    await expect(guide.locator('[data-guide-example]')).toHaveAttribute('open', '');
    await page.evaluate(async () => { window.releaseGuideTokens(); await window.guideRun; await window.canvasHarness.settle(); });
    await expect(add).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(section).toHaveValue('Unsaved typed guide draft');
    await page.locator('[data-save-control="sections"]').click();
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.nodes.n0.sections[0].text)).toBe('Unsaved typed guide draft');
    await page.getByRole('button', {name: 'Edit Sections as JSON', exact: true}).click();
    const raw = page.getByRole('textbox', {name: 'Sections', exact: true});
    await raw.fill('{unfinished guide draft');
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    await guide.locator('details[data-guide-example] > summary').click();
    await page.keyboard.press('Escape');
    await page.evaluate(async () => { const h = window.canvasHarness; h.UI.refreshIfOpen(); await h.settle(); });
    await expect(raw).toHaveValue('{unfinished guide draft');
    expect(await page.evaluate(() => window.canvasHarness.graph.nodes.n0.sections[0].text)).toBe('Unsaved typed guide draft');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

for (const replacement of ['document', 'operation']) test('guide lifetime expires on same-ID ' + replacement + ' replacement', async ({page}) => {
    await launch(page);
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    const guide = page.locator('.pc-node-guide-dialog');
    await guide.locator('details[data-guide-example] > summary').click();
    await expect(guide.locator('.pc-canvas-host')).toBeVisible();
    await page.evaluate(async replacement => {
        const h = window.canvasHarness;
        if (replacement === 'document') {
            const next = structuredClone(h.graph); next.name = 'Replacement with identical IDs';
            await h.activate(next);
        } else {
            const {operationDefaults} = await import('/src/workflow/catalog.js?v=' + h.version);
            h.graph.nodes.n0 = {...operationDefaults('text'), id: 'n0', type: 'workflow', operation: 'text', operationVersion: 1, text: 'Replacement operation', x: 40, y: 80};
            h.S.save(); h.UI.refreshIfOpen(); await h.settle();
        }
        h.canvas.select({kind: 'node', id: 'n0'}); await h.settle();
    }, replacement);
    await expect(guide).toHaveCount(0);
    await page.locator('.pc-workspace-details button[title^="Help with"]').click();
    await expect(guide.locator('[data-guide-example]')).not.toHaveAttribute('open');
    await expect(guide.locator('.pc-node-guide')).toHaveAttribute('data-guide-key', replacement === 'operation' ? 'text' : 'compose');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});


async function stableGuideWorkbench(page) {
    await launch(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness, v = h.version;
        const {prepareWorkspaceViews, projectWorkspacePanels} = await import('/src/ui/workspace-preparation.js?v=' + v);
        const {createGraphViewSession} = await import('/src/ui/graph-view-session.js?v=' + v);
        const {projectPreparedWorkflow} = await import('/src/ui/workflow-surface.js?v=' + v);
        const {getNodeGuideExample} = await import('/src/workflow/node-guide-examples.js?v=' + v);
        const {prepareNodeGuideScene} = await import('/src/ui/node-guide-scene.js?v=' + v);
        const {mountWorkbench} = await import('/dist/lattice-ui.js?v=' + v);
        const root = h.graph, prepared = prepareWorkspaceViews(root).data;
        const session = createGraphViewSession({root, activationId: 'stable-guide', ...prepared}).data;
        const workflow = projectPreparedWorkflow(prepared.workflow, {selectedId: 'n0'});
        const details = projectWorkspacePanels({...session.readEditor(), documentNamespace: 'document-one'}, workflow, {}, 'same-revision', null, null).nodeDetails;
        h.UI.close();
        window.guideProbeBusy = false;
        const component = mountWorkbench(document.body, {command() {}, nodeGuide: {
            status: () => ({enabled: !window.guideProbeBusy, reason: window.guideProbeBusy ? 'Wait for the current run to finish.' : ''}),
            example(key) { const example = getNodeGuideExample(key); return {ok: true, data: {example, scene: prepareNodeGuideScene(example.graph, example.focus).data}}; },
        }});
        window.guideProbe = {component, details};
        component.root.style.display = 'flex';
        component.update({graphId: root.id, nodeDetails: details, workflow, guideInsertionBusy: false});
        await h.settle();
    });
}

test('guide status observes explicit busy changes with retained frozen Details and revision', async ({page}) => {
    await stableGuideWorkbench(page);
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    const guide = page.getByRole('dialog', {name: 'Compose guide', exact: true});
    await guide.locator('details[data-guide-example] > summary').click();
    const add = guide.getByRole('button', {name: 'Add example to current tab', exact: true});
    await expect(add).toBeEnabled();
    await page.evaluate(() => { window.guideProbeBusy = true; window.guideProbe.component.update({guideInsertionBusy: true}); });
    await expect(add).toBeDisabled();
    await expect(guide).toContainText('Wait for the current run to finish.');
    await page.evaluate(() => { window.guideProbeBusy = false; window.guideProbe.component.update({guideInsertionBusy: false}); });
    await expect(add).toBeEnabled();
    await expect(guide.locator('[data-guide-example]')).toHaveAttribute('open', '');
    await page.evaluate(() => window.guideProbe.component.destroy());
});

test('guide namespace expires retained example state when selection and revision IDs match', async ({page}) => {
    await stableGuideWorkbench(page);
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    const guide = page.getByRole('dialog', {name: 'Compose guide', exact: true});
    await guide.locator('details[data-guide-example] > summary').click();
    await expect(guide.locator('.pc-canvas-host')).toBeVisible();
    await page.evaluate(() => { const p = window.guideProbe; p.component.update({nodeDetails: Object.freeze({...p.details, documentNamespace: 'document-two'})}); });
    await expect(guide).toHaveCount(0);
    await page.getByRole('button', {name: 'Open Compose guide', exact: true}).click();
    await expect(guide.locator('[data-guide-example]')).not.toHaveAttribute('open');
    await page.evaluate(() => window.guideProbe.component.destroy());
});
