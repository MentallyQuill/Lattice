import { test, expect } from '@playwright/test';
async function finishExampleChoice(page, picker) {
    const guard=page.getByRole('dialog',{name:'Save workflow changes?',exact:true});
    await expect.poll(async()=>await guard.isVisible()||!await picker.isVisible()).toBe(true);
    if(await guard.isVisible())await guard.getByRole('button',{name:"Don't Save",exact:true}).click();
    await expect(picker).toBeHidden();
}

async function launch(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.getByRole('menuitem', { name: 'File', exact: true}).click();
    await page.getByRole('menuitem', {name: 'Open examples…', exact: true}).click();
    return page.getByRole('dialog', {name: 'Examples', exact: true});
}
test('curriculum search, difficulty and lesson details teach before independent opening', async ({page}) => {
    const dialog = await launch(page);
    const original = await page.evaluate(() => JSON.stringify(window.canvasHarness.graph));
    await expect(dialog.locator('.pc-example-tile')).toHaveCount(32);
    await dialog.getByLabel('Search lessons').fill('Story Clock');
    expect(await dialog.locator('.pc-example-tile').count()).toBeGreaterThan(0);
    expect(await dialog.locator('.pc-example-tile').count()).toBeLessThan(32);
    await dialog.getByLabel('Search lessons').fill('');
    await dialog.getByLabel('Difficulty').selectOption('Capstone');
    await expect(dialog.locator('.pc-example-tile')).toHaveCount(4);
    await dialog.getByLabel('Difficulty').selectOption('Foundations');
    await expect(dialog.locator('.pc-example-tile')).toHaveCount(8);
    const details = dialog.getByRole('button', {name: 'Details for Follow a reply from Send to Review', exact: true});
    await details.focus(); await page.keyboard.press('Enter');
    const lesson = dialog.getByRole('region', {name: 'Lesson 1 details'});
    await expect(lesson.getByRole('heading', {name: 'Setup', exact: true})).toBeVisible();
    await expect(lesson.getByRole('heading', {name: 'Checkpoints', exact: true})).toBeVisible();
    await expect(lesson.locator('[data-checkpoint]').first()).toContainText(/.+ → .+/);
    expect(await page.evaluate(() => JSON.stringify(window.canvasHarness.graph))).toBe(original);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    await lesson.getByRole('button', {name: 'Open independent copy', exact: true}).click();
    await finishExampleChoice(page, dialog);
    const after = await page.evaluate(async () => {
        const h = window.canvasHarness, {settings} = await import('/src/state.js?v=' + h.version);
        return {graph: h.graph, stored: settings(), calls: h.providerCalls()};
    });
    expect(after.graph.name).toBe('1. Follow a reply from Send to Review');
    expect(after.stored.enabled).toBe(false);
    expect(Object.hasOwn(after.stored,'nativeBindings')).toBe(false);
    expect(after.calls).toBe(0);
    expect(Object.hasOwn(after.stored,'graphs')).toBe(false);
    expect(JSON.stringify(after.graph)).not.toBe(original);
    expect(Object.values(after.graph.nodes).some(node => node.type === 'note' && /Generate Reply/.test(node.content))).toBe(true);
});
test('search supports empty results and an unavailable lesson retains readable instructions', async ({page}) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const {REMASTERED_WORKFLOW_EXAMPLE_DATA} = await import('/src/workflow/remastered-example-data.js?v=' + window.canvasHarness.version);
        Object.values(REMASTERED_WORKFLOW_EXAMPLE_DATA[0].packages[0].graph.nodes).find(node => node.type === 'workflow').operation = 'unknown-lesson-operation';
        window.canvasHarness.UI.close(); window.canvasHarness.UI.open(); await window.canvasHarness.settle();
    });
    await page.getByRole('menuitem', { name: 'File', exact: true}).click();
    await page.getByRole('menuitem', {name: 'Open examples…', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Examples', exact: true});
    await dialog.getByLabel('Search lessons').fill('no matching curriculum concept');
    await expect(dialog.getByText('No lessons match your search and difficulty.')).toBeVisible();
    await dialog.getByLabel('Search lessons').fill('');
    await expect(dialog.getByRole('button', {name: 'Follow a reply from Send to Review', exact: true})).toBeDisabled();
    await dialog.getByRole('button', {name: 'Details for Follow a reply from Send to Review', exact: true}).click();
    const lesson = dialog.getByRole('region', {name: 'Lesson 1 details'});
    await expect(lesson.getByRole('button', {name: 'Open independent copy', exact: true})).toBeDisabled();
    await expect(lesson.getByRole('heading', {name: 'Setup', exact: true})).toBeVisible();
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('independent opening from details closes without lifecycle errors', async ({page}) => {
    const errors = []; page.on('pageerror', error => errors.push(error.stack));
    const dialog = await launch(page);
    await dialog.getByRole('button', {name: 'Details for Follow a reply from Send to Review', exact: true}).click();
    await dialog.getByRole('button', {name: 'Open independent copy', exact: true}).click();
    await finishExampleChoice(page, dialog);
    await page.evaluate(() => window.canvasHarness.settle());
    expect(errors).toEqual([]);
});

test('closing lesson details restores keyboard focus and suppresses background graph shortcuts', async ({page}) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    const before = await page.evaluate(async () => {
        const h = window.canvasHarness, ids = await h.reset();
        h.canvas.select({kind:'node', id:ids[0]});
        return {graph:JSON.stringify(h.graph), selection:h.canvas.selection, history:h.H.peek(h.graph)};
    });
    await page.getByRole('menuitem', { name: 'File', exact:true}).click();
    await page.getByRole('menuitem', {name:'Open examples…', exact:true}).click();
    const dialog = page.getByRole('dialog', {name:'Examples', exact:true});
    const trigger = dialog.getByRole('button', {name:'Details for Follow a reply from Send to Review', exact:true});
    await trigger.focus(); await page.keyboard.press('Enter');
    await expect(dialog.getByRole('heading', {name:'1. Follow a reply from Send to Review', exact:true})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', {name:'Close lesson details', exact:true})).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('region', {name:'Lesson 1 details'})).toHaveCount(0);
    for (const key of ['Delete', 'Control+x', 'Control+z', 'Control+a']) await page.keyboard.press(key);
    expect(await page.evaluate(() => {const h=window.canvasHarness;return {graph:JSON.stringify(h.graph), selection:h.canvas.selection, history:h.H.peek(h.graph)};})).toEqual(before);
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
