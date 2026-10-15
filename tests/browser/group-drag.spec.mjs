import { test, expect } from '@playwright/test';

const groupId = 'expanded-drag';
const memberIds = ['scene-context', 'smart-compactor'];
const header = page => page.locator(`.pc-group-frame[data-group="${groupId}"] .pc-group-frame-head`);

async function presentation(page) {
    return page.evaluate(groupId => {
        const h = window.canvasHarness;
        const read = graph => ({
            nodes: Object.fromEntries(Object.entries(graph.nodes).map(([id, node]) => [id, {
                x: node.x, y: node.y, inGroup: node.inGroup ?? null,
            }])),
            group: structuredClone(graph.groups[groupId]),
        });
        return {
            root: read(h.S.activeWorkflow()),
            draw: read(h.canvas.graph),
            saved: read(h.S.settings().recoveryDraft.graph),
        };
    }, groupId);
}

async function startDrag(page) {
    await expect(header(page)).toBeVisible();
    const bounds = await header(page).locator('.pc-group-frame-title').boundingBox();
    expect(bounds).not.toBeNull();
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    expect(await page.evaluate(point=>{const hit=document.elementFromPoint(point.x,point.y);return !!hit?.closest('.pc-group-frame-head') && !hit.closest('button');},point),'Start on the group title, clear of readiness and fold actions').toBe(true);
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    return point;
}

test('expanded group header moves saved members, frame and anchors at zoom as one undo step and Escape restores a drag', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async ({ groupId, memberIds }) => {
        const h = window.canvasHarness;
        const { fixtureGraph } = await import('/tests/helpers/workflow-fixtures.mjs');
        const graph = fixtureGraph('native-guidance');
        graph.groups[groupId] = {
            id: groupId, title: 'Expanded drag', collapsed: false, members: memberIds,
            x: 100, y: 140, frame: { x: 70, y: 80, w: 600, h: 420 },
        };
        for (const id of memberIds) graph.nodes[id].inGroup = groupId;
        await h.activate(graph); await h.view({ x: 180, y: 160, zoom: .8 });
        h.canvas.setMulti(['scene-context', 'response-plan']); await h.settle();
    }, { groupId, memberIds });

    const before = await presentation(page);
    expect(before.draw).toEqual(before.root);
    expect(before.saved).toEqual(before.root);
    const expected = structuredClone(before.root);
    for (const id of memberIds) { expected.nodes[id].x += 60; expected.nodes[id].y += 40; }
    expected.group.x += 60; expected.group.y += 40;
    expected.group.frame.x += 60; expected.group.frame.y += 40;

    const start = await startDrag(page);
    expect(await page.evaluate(() => ({ selection: window.canvasHarness.canvas.selection, multi: [...window.canvasHarness.canvas.multi] })))
        .toEqual({ selection: { kind: 'group', id: groupId }, multi: [] });
    await page.mouse.move(start.x + 48, start.y + 32, { steps: 4 }); await page.mouse.up();
    expect(await presentation(page)).toEqual({ root: expected, draw: expected, saved: expected });
    await expect(page.locator(`.pc-group-frame[data-group="${groupId}"]`)).toHaveCount(1);
    for (const id of memberIds) await expect(page.locator(`.pc-node[data-id="${id}"]`)).toBeVisible();

    await page.locator('.pc-canvas-host').focus(); await page.keyboard.press('Control+z');
    expect(await presentation(page)).toEqual(before);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.keyboard.press('Control+Shift+z');
    expect(await presentation(page)).toEqual({ root: expected, draw: expected, saved: expected });
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();

    const history = await page.evaluate(() => window.canvasHarness.H.peek(window.canvasHarness.S.activeWorkflow()));
    const cancelStart = await startDrag(page);
    await page.mouse.move(cancelStart.x + 32, cancelStart.y + 24, { steps: 4 });
    const live = await presentation(page);
    const unfinished = structuredClone(expected);
    for (const id of memberIds) { unfinished.nodes[id].x += 40; unfinished.nodes[id].y += 30; }
    unfinished.group.x += 40; unfinished.group.y += 30;
    unfinished.group.frame.x += 40; unfinished.group.frame.y += 30;
    expect(live).toEqual({ root: expected, draw: unfinished, saved: expected });
    await page.keyboard.press('Escape'); await page.mouse.up();
    expect(await presentation(page)).toEqual({ root: expected, draw: expected, saved: expected });
    expect(await page.evaluate(() => window.canvasHarness.H.peek(window.canvasHarness.S.activeWorkflow()))).toEqual(history);
    expect(await page.evaluate(() => window.canvasHarness.canvas.hasContentGesture())).toBe(false);
});
