import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const host = page => page.locator('.pc-canvas-host');
const card = (page, id) => page.locator(`.pc-node[data-id="${id}"] .pc-native-heading`);
const frame = (page, id) => page.locator(`.pc-comment-frame[data-id="${id}"]`);
const details = page => page.locator('.pc-comment-details');

async function load(page) {
    await page.addInitScript(() => { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; });
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
}

async function setup(page, variant = 'ordinary') {
    await load(page);
    return page.evaluate(async variant => {
        const h = window.canvasHarness;
        const [{ canvasWorkflow }, { operationDefaults }] = await Promise.all([
            import('/tests/browser/native-fixture.mjs'), import('/src/workflow/catalog.js?v=' + h.version),
        ]);
        const graph = canvasWorkflow(operationDefaults, 3, 3);
        graph.id = 'comment-acceptance'; graph.name = 'Comment acceptance';
        if (variant === 'contents') {
            graph.nodes.ordinary = { id: 'ordinary', type: 'note', title: 'Ordinary note', content: 'Keep this note ordinary.', x: 40, y: 300 };
            graph.nodes.otherFrame = { id: 'otherFrame', type: 'note', commentFrame: true, moveContents: true,
                title: 'Other comment', content: '', color: '#637d89', x: 400, y: 300, w: 160, h: 100 };
        } else if (variant === 'backward') {
            Object.assign(graph.nodes.n0, { x: 500, y: 80 });
            Object.assign(graph.nodes.n1, { x: 40, y: 80 });
            Object.assign(graph.nodes.n2, { x: 240, y: 190 });
        } else if (variant === 'group') {
            graph.nodes.n0.inGroup = 'bundle'; graph.nodes.n1.inGroup = 'bundle';
            graph.groups.bundle = { id: 'bundle', title: 'Folded group', collapsed: true, members: ['n0', 'n1'], x: 40, y: 80, w: 260 };
            graph.nodes.annotation = { id: 'annotation', type: 'note', commentFrame: true, moveContents: false,
                title: 'Selected comment', content: '', color: '#637d89', x: 360, y: 20, w: 300, h: 220 };
        }
        let workspaceViews = null;
        if (variant === 'overlay') {
            const { createViewState } = await import('/src/ui/view-state.js?v=' + h.version);
            const view = createViewState({ workflowId: graph.id, initialCamera: { x: 180, y: 160, zoom: .8 } });
            const updated = view?.updateView({ nodePresentation: { n0: { x: 70, y: 100, alias: 'Local source' } } });
            if (!updated?.ok) throw Error('The persisted view fixture could not be prepared.');
            workspaceViews = structuredClone(view.serialize().data);
        }
        await h.activate(graph, { workspaceViews }); await h.view({ x: 180, y: 160, zoom: .8 });
        return graph.id;
    }, variant);
}

async function selectNodes(page, ids) {
    await card(page, ids[0]).click();
    for (const id of ids.slice(1)) await card(page, id).click({ modifiers: ['Control'] });
}

async function createWithC(page, ids) {
    const before = await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes));
    if (ids?.length) await selectNodes(page, ids);
    await host(page).focus(); await page.keyboard.press('c');
    await expect.poll(() => page.evaluate(before => Object.values(window.canvasHarness.graph.nodes)
        .filter(node => node.commentFrame && !before.includes(node.id)).length, before)).toBe(1);
    return page.evaluate(before => Object.values(window.canvasHarness.graph.nodes)
        .find(node => node.commentFrame && !before.includes(node.id)).id, before);
}

async function positions(page, ids, drawing = false) {
    return page.evaluate(({ ids, drawing }) => {
        const h = window.canvasHarness, graph = drawing ? h.canvas.graph : h.graph;
        return Object.fromEntries(ids.map(id => [id, { x: graph.nodes[id].x, y: graph.nodes[id].y }]));
    }, { ids, drawing });
}

async function bounds(page, ids) {
    return page.evaluate(ids => {
        const { canvas } = window.canvasHarness, origin = canvas.host.getBoundingClientRect(), view = canvas.view;
        return ids.map(id => {
            const rect = canvas.nodeLayer.querySelector(`.pc-node[data-id="${id}"]`).getBoundingClientRect();
            return { x: (rect.left - origin.left - view.x) / view.zoom, y: (rect.top - origin.top - view.y) / view.zoom,
                w: rect.width / view.zoom, h: rect.height / view.zoom };
        });
    }, ids);
}

function surrounding(rects) {
    const left = Math.min(...rects.map(r => r.x)), top = Math.min(...rects.map(r => r.y));
    const right = Math.max(...rects.map(r => r.x + r.w)), bottom = Math.max(...rects.map(r => r.y + r.h));
    // Approved graph-space padding is 24, with a 36-pixel title header.
    return { x: left - 24, y: top - 60, w: right - left + 48, h: bottom - top + 84 };
}

async function rectangle(page, id) {
    return page.evaluate(id => {
        const node = window.canvasHarness.graph.nodes[id];
        return { x: node.x, y: node.y, w: node.w, h: node.h };
    }, id);
}

function expectRectangle(actual, wanted) {
    for (const key of ['x', 'y', 'w', 'h']) expect(actual[key], key).toBeCloseTo(wanted[key], 4);
}

async function drag(page, locator, dx, dy) {
    const box = await locator.boundingBox(); expect(box).not.toBeNull();
    const portion = await locator.evaluate(element => element.matches('.pc-comment-resize') ? .8 : .5);
    const at = { x: box.x + box.width * portion, y: box.y + box.height * portion };
    await page.mouse.move(at.x, at.y); await page.mouse.down();
    await page.mouse.move(at.x + dx, at.y + dy, { steps: 5 }); await page.mouse.up();
    await page.evaluate(() => window.canvasHarness.settle());
}

async function menu(page, name, command) {
    await page.getByRole('button', { name, exact: true }).click();
    const label = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page.getByRole('menu', { name, exact: true }).getByRole('menuitem', { name: new RegExp('^' + label + '(?:\\s|$)') }).click();
}

async function exportedJSON(page, action) {
    const pending = page.waitForEvent('download'); await action();
    return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}

async function subgraphCommand(page, id, command) {
    await card(page, id).click({ button: 'right' });
    await page.getByRole('menuitem', { name: command, exact: true }).click();
}

async function shelfCommand(page, key, command) {
    await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
    await page.locator('[data-shelf-choice=' + JSON.stringify('definition:' + key) + ']').click({ button: 'right' });
    await page.getByRole('menuitem', { name: command, exact: true }).click();
}

test.afterEach(async ({ page }) => {
    expect(await page.evaluate(() => window.canvasHarness?.providerCalls() ?? 0)).toBe(0);
});

test('C frames measured selection and typing C in its title keeps a single editable comment', async ({ page }) => {
    await setup(page);
    const expected = surrounding(await bounds(page, ['n0', 'n1']));
    const semanticBefore = await page.evaluate(async () => {
        const h = window.canvasHarness, { graphSemanticSignature } = await import('/src/workflow/ports.js?v=' + h.version);
        return graphSemanticSignature(h.graph);
    });
    const id = await createWithC(page, ['n0', 'n1']);
    expectRectangle(await rectangle(page, id), expected);
    const title = frame(page, id).locator('.pc-comment-title-input');
    await expect(title).toBeFocused(); await expect(title).toHaveValue('Comment');
    await title.fill('Planning'); await title.press('End'); await title.press('c'); await title.press('Tab');
    await expect(title).toHaveValue('Planningc');
    await expect(page.locator('.pc-comment-frame')).toHaveCount(1);
    await details(page).getByRole('textbox', { name: 'Comment notes', exact: true }).fill('First pass\nReview before running.');
    await details(page).getByRole('textbox', { name: 'Comment notes', exact: true }).press('Tab');
    await expect(frame(page, id).locator('.pc-comment-notes')).toHaveText('First pass\nReview before running.');
    expect(await page.evaluate(id => window.canvasHarness.graph.nodes[id], id)).toMatchObject({
        type: 'note', commentFrame: true, moveContents: true, title: 'Planningc', content: 'First pass\nReview before running.',
    });
    expect(await page.evaluate(async () => {
        const h = window.canvasHarness, { graphSemanticSignature } = await import('/src/workflow/ports.js?v=' + h.version);
        return graphSemanticSignature(h.graph);
    })).toBe(semanticBefore);
});

test('C with no selection creates an empty frame at the canvas cursor', async ({ page }) => {
    await setup(page);
    await host(page).focus();
    const at = await page.evaluate(() => {
        const { canvas } = window.canvasHarness, rect = canvas.host.getBoundingClientRect(), view = canvas.view;
        return { x: rect.left + view.x + 700 * view.zoom, y: rect.top + view.y + 450 * view.zoom };
    });
    await page.mouse.move(at.x, at.y);
    const id = await createWithC(page);
    expectRectangle(await rectangle(page, id), { x: 700, y: 450, w: 360, h: 220 });
    await expect(frame(page, id).locator('.pc-comment-title-input')).toBeFocused();
});

test('header drag moves current contained root nodes in one authored undo step', async ({ page }) => {
    await setup(page, 'contents');
    // Writable root drags already author their positions before comment creation.
    await drag(page, card(page, 'n0'), 24, 16);
    expect(await positions(page, ['n0'])).toEqual({ n0: { x: 70, y: 100 } });
    expect(await positions(page, ['n0'], true)).toEqual({ n0: { x: 70, y: 100 } });
    const id = await createWithC(page, ['n0', 'n1', 'ordinary']);
    await host(page).focus();
    const ids = [id, 'n0', 'n1', 'ordinary', 'n2', 'otherFrame'];
    const savedBefore = await positions(page, ids), drawnBefore = await positions(page, ids, true);
    await drag(page, frame(page, id).locator('.pc-comment-select'), 48, 32);
    const savedAfter = await positions(page, ids);
    expect(savedAfter).toEqual({
        [id]: { x: savedBefore[id].x + 60, y: savedBefore[id].y + 40 },
        n0: { x: 130, y: 140 }, n1: { x: 400, y: 120 }, ordinary: { x: 100, y: 340 },
        n2: { x: 640, y: 80 }, otherFrame: { x: 400, y: 300 },
    });
    expect(await positions(page, ids, true)).toEqual(savedAfter);
    await host(page).focus(); await page.keyboard.press('Control+z');
    expect(await positions(page, ids)).toEqual(savedBefore);
    expect(await positions(page, ids, true)).toEqual(drawnBefore);
    await page.keyboard.press('Control+Shift+z');
    expect(await positions(page, ids)).toEqual(savedAfter);
    expect(await positions(page, ids, true)).toEqual(savedAfter);
    await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
    await expect(frame(page, id)).toHaveCount(0);
    await expect(frame(page, 'otherFrame')).toHaveCount(1);
    expect(await positions(page, ['n0', 'n1', 'ordinary'])).toEqual({ n0: { x: 70, y: 100 }, n1: { x: 340, y: 80 }, ordinary: { x: 40, y: 300 } });
});

test('header drag undo restores persisted local node coordinates while preserving its alias', async ({ page }) => {
    await setup(page, 'overlay');
    expect(await positions(page, ['n0'])).toEqual({ n0: { x: 40, y: 80 } });
    expect(await positions(page, ['n0'], true)).toEqual({ n0: { x: 70, y: 100 } });
    const id = await createWithC(page, ['n0', 'n1']);
    await host(page).focus();
    const ids = [id, 'n0', 'n1'], savedBefore = await positions(page, ids), drawnBefore = await positions(page, ids, true);
    const presentation = () => page.evaluate(() => {
        const h = window.canvasHarness;
        return h.S.activeWorkspaceViews().views.find(view => view.identity.kind === 'root').nodePresentation.n0;
    });
    await drag(page, frame(page, id).locator('.pc-comment-select'), 48, 32);
    const savedAfter = await positions(page, ids);
    expect(savedAfter).toEqual({ [id]: { x: savedBefore[id].x + 60, y: savedBefore[id].y + 40 }, n0: { x: 130, y: 140 }, n1: { x: 400, y: 120 } });
    expect(await presentation()).toEqual({ alias: 'Local source' });
    await host(page).focus(); await page.keyboard.press('Control+z');
    expect(await positions(page, ids)).toEqual(savedBefore);
    expect(await positions(page, ids, true)).toEqual(drawnBefore);
    expect(await presentation()).toEqual({ x: 70, y: 100, alias: 'Local source' });
    await page.keyboard.press('Control+Shift+z');
    expect(await positions(page, ids)).toEqual(savedAfter);
    expect(await positions(page, ids, true)).toEqual(savedAfter);
    expect(await presentation()).toEqual({ alias: 'Local source' });
    await expect(page.locator('.pc-node[data-id="n0"] .pc-node-title')).toHaveText('Local source');
});

test('Move contents off moves only the frame', async ({ page }) => {
    await setup(page);
    const id = await createWithC(page, ['n0', 'n1']);
    await details(page).getByRole('checkbox', { name: 'Move contents', exact: true }).uncheck();
    const before = await positions(page, [id, 'n0', 'n1', 'n2']);
    await drag(page, frame(page, id).locator('.pc-comment-select'), 48, 32);
    expect(await positions(page, [id, 'n0', 'n1', 'n2'])).toEqual({ ...before, [id]: { x: before[id].x + 60, y: before[id].y + 40 } });
    expect(await page.evaluate(id => window.canvasHarness.graph.nodes[id].moveContents, id)).toBe(false);
});

test('a selected comment and collapsed group move together without unfolding in one undo step', async ({ page }) => {
    await setup(page, 'group');
    const ids = ['annotation', 'n0', 'n1', 'n2'], before = await positions(page, ids);
    const groupBefore = await page.evaluate(() => structuredClone(window.canvasHarness.graph.groups.bundle));
    await frame(page, 'annotation').locator('.pc-comment-select').click();
    await page.locator('.pc-node-group[data-group="bundle"] .pc-node-title').click({ modifiers: ['Control'] });
    expect(new Set(await page.evaluate(() => [...window.canvasHarness.canvas.multi]))).toEqual(new Set(['annotation', 'n0', 'n1']));
    await drag(page, frame(page, 'annotation').locator('.pc-comment-select'), 48, 32);
    const after = { annotation: { x: 420, y: 60 }, n0: { x: 100, y: 120 }, n1: { x: 400, y: 120 }, n2: { x: 640, y: 80 } };
    expect(await positions(page, ids)).toEqual(after);
    expect(await page.evaluate(() => window.canvasHarness.graph.groups.bundle)).toEqual({ ...groupBefore, x: 100, y: 120 });
    await expect(page.locator('.pc-node-group[data-group="bundle"]')).toHaveCount(1);
    await expect(page.locator('.pc-node[data-id="n0"], .pc-node[data-id="n1"]')).toHaveCount(0);
    await host(page).focus(); await page.keyboard.press('Control+z');
    expect(await positions(page, ids)).toEqual(before);
    expect(await page.evaluate(() => window.canvasHarness.graph.groups.bundle)).toEqual(groupBefore);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.keyboard.press('Control+Shift+z');
    expect(await positions(page, ids)).toEqual(after);
    expect(await page.evaluate(() => window.canvasHarness.graph.groups.bundle.collapsed)).toBe(true);
});

test('selected-node menu creates a frame whose resize, fit and delete leave its contents intact', async ({ page }) => {
    await setup(page);
    const initialNodes = await positions(page, ['n0', 'n1', 'n2']);
    const initialWires = await page.evaluate(() => structuredClone(window.canvasHarness.graph.wires));
    const expected = surrounding(await bounds(page, ['n0', 'n1']));
    await selectNodes(page, ['n0', 'n1']);
    await card(page, 'n1').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Comment around selection', exact: true }).click();
    const id = await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).find(node => node.commentFrame).id);
    expectRectangle(await rectangle(page, id), expected);
    await card(page, 'n0').click();
    expect(await page.evaluate(() => window.canvasHarness.canvas.selection)).toEqual({ kind: 'node', id: 'n0' });
    await frame(page, id).locator('.pc-comment-select').click();
    await expect(details(page)).toBeVisible();
    await drag(page, frame(page, id).locator('.pc-comment-resize'), 80, 40);
    expectRectangle(await rectangle(page, id), { ...expected, w: Math.round(expected.w + 100), h: Math.round(expected.h + 50) });
    expect(await positions(page, ['n0', 'n1', 'n2'])).toEqual(initialNodes);
    await details(page).getByRole('button', { name: 'Fit to contents', exact: true }).click();
    expectRectangle(await rectangle(page, id), expected);
    await details(page).getByRole('button', { name: 'Delete comment', exact: true }).click();
    await expect(frame(page, id)).toHaveCount(0);
    expect(await positions(page, ['n0', 'n1', 'n2'])).toEqual(initialNodes);
    expect(await page.evaluate(() => window.canvasHarness.graph.wires)).toEqual(initialWires);
    await host(page).focus(); await page.keyboard.press('Control+z');
    await expect(frame(page, id)).toHaveCount(1); expectRectangle(await rectangle(page, id), expected);
});

test('clipboard and downloaded workflow roundtrip preserve authored comment fields', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await setup(page);
    const id = await createWithC(page, ['n0']);
    await frame(page, id).locator('.pc-comment-title-input').fill('Portable comment');
    await frame(page, id).locator('.pc-comment-title-input').press('Tab');
    await details(page).getByRole('textbox', { name: 'Comment notes', exact: true }).fill('One\nTwo');
    await details(page).getByRole('textbox', { name: 'Comment notes', exact: true }).press('Tab');
    await details(page).getByLabel('Comment color', { exact: true }).evaluate(input => {
        input.value = '#718c69'; input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await details(page).getByRole('checkbox', { name: 'Move contents', exact: true }).uncheck();
    const authoredRectangle = await rectangle(page, id);
    const authored = { type: 'note', commentFrame: true, moveContents: false, title: 'Portable comment', content: 'One\nTwo', color: '#718c69', ...authoredRectangle };
    await host(page).focus(); await page.keyboard.press('Control+c');
    await expect.poll(() => page.evaluate(async () => {
        try { return JSON.parse(await navigator.clipboard.readText()).graph?.nodes?.[window.canvasHarness.canvas.selection.id]?.title; }
        catch { return null; }
    })).toBe('Portable comment');
    const copied = await page.evaluate(async id => JSON.parse(await navigator.clipboard.readText()).graph.nodes[id], id);
    expect(copied).toMatchObject(authored);
    await menu(page, 'Edit', 'Paste');
    await expect.poll(() => page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).filter(node => node.commentFrame).length)).toBe(2);
    const pasted = await page.evaluate(id => Object.values(window.canvasHarness.graph.nodes).find(node => node.commentFrame && node.id !== id), id);
    expect(pasted).toMatchObject({ ...authored, x: pasted.x, y: pasted.y });
    const exported = await exportedJSON(page, () => menu(page, 'File', 'Export workflow JSON…'));
    expect(exported.graph.nodes[id]).toMatchObject(authored);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Open workflow…', exact: true }).click();
    await (await chooser).setFiles({ name: 'comment.workflow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    const guard = page.getByRole('dialog', { name: 'Save workflow changes?', exact: true });
    await expect(guard).toBeVisible(); await guard.getByRole('button', { name: "Don't Save", exact: true }).click();
    await expect(page.locator('.pc-document-name')).toHaveText('comment.workflow.json');
    expect(await page.evaluate(id => window.canvasHarness.graph.nodes[id], id)).toMatchObject(authored);
    await expect(frame(page, id).locator('.pc-comment-title-input')).toHaveValue('Portable comment');
});

async function sharedFrameFixture(page) {
    await load(page);
    return page.evaluate(async () => {
        const h = window.canvasHarness, { siblingWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const root = structuredClone(siblingWorkflow()), definition = Object.values(root.definitions)[0];
        root.name = 'Read-only comment fixture';
        for (const [id, x, y] of [['source', 40, 80], ['first/path', 340, 80], ['second', 640, 80], ['one', 340, 320], ['two', 640, 320]]) Object.assign(root.nodes[id], { x, y });
        for (const [id, x] of [['entry', 40], ['work', 340], ['exit', 640]]) Object.assign(definition.body.nodes[id], { x, y: 80 });
        definition.body.nodes.annotation = { id: 'annotation', type: 'note', commentFrame: true, moveContents: false,
            title: 'Pinned comment', content: 'Read-only\nPreserved notes', color: '#718c69', x: 16, y: 20, w: 930, h: 330 };
        h.S.settings().subgraphLibrary = { definitions: structuredClone(root.definitions) };
        await h.activate(root); await h.view({ x: 180, y: 160, zoom: .8 });
        return { id: root.id, key: JSON.stringify([definition.id, definition.version, definition.semanticHash]) };
    });
}

test('downloaded subgraphs retain comment fields when imported back into the library', async ({ page }) => {
    const source = await sharedFrameFixture(page);
    const before = await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), source.id);
    const exported = await exportedJSON(page, () => subgraphCommand(page, 'first/path', 'Export subgraph'));
    const authored = { type: 'note', commentFrame: true, moveContents: false, title: 'Pinned comment',
        content: 'Read-only\nPreserved notes', color: '#718c69', x: 16, y: 20, w: 930, h: 330 };
    expect(exported.definition.body.nodes.annotation).toMatchObject(authored);
    await shelfCommand(page, source.key, 'Delete');
    await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
    await expect(page.locator('[data-shelf-choice=' + JSON.stringify('definition:' + source.key) + ']')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Shelf removal retains exact snapshots for placed instances. Reimport the
    // downloaded package through the same checked library API as file import.
    await page.evaluate(async exported => {
        const h = window.canvasHarness;
        const { parseSubgraph } = await import('/src/workflow/packages.js?v=' + h.version);
        const { installSubgraphDefinition } = await import('/src/library.js?v=' + h.version);
        const parsed = parseSubgraph(JSON.stringify(exported));
        if (!parsed.ok) throw Error(parsed.error.message);
        const installed = installSubgraphDefinition(parsed.data.definition, parsed.data.definitions);
        if (!installed.ok) throw Error(installed.error.message);
        h.UI.refreshIfOpen(); await h.settle();
    }, exported);
    expect(await page.evaluate(key => window.canvasHarness.S.settings().subgraphLibrary.definitions[key].body.nodes.annotation, source.key)).toMatchObject(authored);
    expect(await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), source.id)).toBe(before);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await shelfCommand(page, source.key, 'Open saved definition');
    await expect(frame(page, 'annotation').locator('.pc-comment-title')).toHaveText('Pinned comment');
});

for (const kind of ['shared', 'library']) {
    test(`${kind} definition comments expose disabled controls and reject drag, C and Delete`, async ({ page }) => {
        const source = await sharedFrameFixture(page);
        const before = await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), source.id);
        if (kind === 'shared') await card(page, 'first/path').dblclick();
        else await shelfCommand(page, source.key, 'Open saved definition');
        await page.evaluate(() => window.canvasHarness.view({ x: 180, y: 160, zoom: .8 }));
        const annotation = frame(page, 'annotation');
        await annotation.locator('.pc-comment-select').click();
        await expect(details(page).getByRole('textbox', { name: 'Comment title', exact: true })).toBeDisabled();
        await expect(details(page).getByRole('textbox', { name: 'Comment notes', exact: true })).toBeDisabled();
        await expect(details(page).getByRole('checkbox', { name: 'Move contents', exact: true })).toBeDisabled();
        await expect(details(page).getByRole('button', { name: 'Delete comment', exact: true })).toBeDisabled();
        await expect(annotation.locator('.pc-comment-title-input, .pc-comment-resize')).toHaveCount(0);
        const drawnBefore = await positions(page, ['annotation'], true);
        await drag(page, annotation.locator('.pc-comment-select'), 48, 32);
        expect(await positions(page, ['annotation'], true)).toEqual(drawnBefore);
        await host(page).focus(); await page.keyboard.press('c'); await page.keyboard.press('Delete');
        await expect(page.locator('.pc-comment-frame')).toHaveCount(1);
        expect(await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), source.id)).toBe(before);
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    });
}

test('direct splines keep horizontal pin leads and returning bows while cards receive clicks above wires', async ({ page }) => {
    for (const variant of ['ordinary', 'backward']) {
        await setup(page, variant);
        if (variant === 'backward') await page.evaluate(async () => {
            const h = window.canvasHarness, path = h.canvas.svg.querySelector('.pc-wire[data-id="w1"]');
            const point = path.getPointAtLength(path.getTotalLength() / 2);
            const obstacle = h.canvas.nodeLayer.querySelector('.pc-node[data-id="n2"]').getBoundingClientRect();
            // Arrange the stacking check around the actual route, independently
            // of whether a returning connection uses a bow or a shallow span.
            Object.assign(h.graph.nodes.n2, { x: point.x - obstacle.width / h.canvas.view.zoom / 2,
                y: point.y - obstacle.height / h.canvas.view.zoom / 2 });
            h.S.touchGraph(h.graph); h.UI.refreshIfOpen(); await h.settle();
        });
        const route = await page.evaluate(() => {
            const { canvas } = window.canvasHarness, wire = canvas.graph.wires.w1;
            const path = canvas.svg.querySelector('.pc-wire[data-id="w1"]'), hit = canvas.svg.querySelector('.pc-wire-hit[data-id="w1"]');
            const total = path.getTotalLength(), matrix = path.getScreenCTM();
            const point = length => { const p = path.getPointAtLength(length), s = new DOMPoint(p.x, p.y).matrixTransform(matrix); return { x: s.x, y: s.y }; };
            const pin = (id, dir, port) => {
                const r = canvas.nodeLayer.querySelector(`.pc-port[data-node="${id}"][data-dir="${dir}"][data-port="${port}"]`).getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            };
            const start = point(0), end = point(total), samples = Array.from({ length: 101 }, (_, i) => point(total * i / 100));
            const distance = Math.hypot(end.x - start.x, end.y - start.y);
            const bow = Math.max(...samples.map(p => Math.abs((end.x - start.x) * (start.y - p.y) - (start.x - p.x) * (end.y - start.y)) / distance));
            const obstacle = canvas.nodeLayer.querySelector('.pc-node[data-id="n2"]').getBoundingClientRect();
            const covered = samples.find(p => p.x > obstacle.left + 20 && p.x < obstacle.right - 20 && p.y > obstacle.top + 20 && p.y < obstacle.bottom - 20);
            return { start, end, departure: point(5), arrival: point(total - 5), output: pin(wire.from, 'out', wire.fromPort),
                input: pin(wire.to, 'in', wire.toPort), length: total * canvas.view.zoom, distance, bow, sameHit: path.getAttribute('d') === hit.getAttribute('d'),
                covered: covered ? { ...covered, nodeId: document.elementFromPoint(covered.x, covered.y)?.closest('.pc-node')?.dataset.id } : null };
        });
        expect(Math.hypot(route.start.x - route.output.x, route.start.y - route.output.y)).toBeLessThanOrEqual(1);
        expect(Math.hypot(route.end.x - route.input.x, route.end.y - route.input.y)).toBeLessThanOrEqual(1);
        expect(route.departure.x).toBeGreaterThan(route.start.x);
        expect(Math.abs(route.departure.y - route.start.y)).toBeLessThan(1);
        expect(route.end.x).toBeGreaterThan(route.arrival.x);
        expect(Math.abs(route.end.y - route.arrival.y)).toBeLessThan(1);
        expect(route.sameHit).toBe(true);
        if (variant === 'ordinary') expect(route.length).toBeLessThan(route.distance + 50);
        else {
            expect(route.bow).toBeGreaterThan(20);
            expect(route.covered).toMatchObject({ nodeId: 'n2' });
            await page.mouse.click(route.covered.x, route.covered.y);
            expect(await page.evaluate(() => window.canvasHarness.canvas.selection)).toEqual({ kind: 'node', id: 'n2' });
        }
    }
});
