import { test, expect } from '@playwright/test';

async function load(page) {
    await page.addInitScript(() => { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; });
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => window.canvasHarness.activate(window.canvasHarness.graph));
}
async function menu(page, action) {
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: action, exact: true }).click({ timeout: 2500 });
}
const prompt = page => page.getByRole('dialog', { name: 'Save workflow changes?', exact: true });
async function snapshot(page) {
    return page.evaluate(() => { const h = window.canvasHarness; return { graph: structuredClone(h.graph), enabled: h.S.settings().enabled, recovery: h.S.recoveredWorkflows().map(({id,name}) => ({id,name})) }; });
}
async function workflowFile(page) {
    return page.evaluate(() => { const h = window.canvasHarness, file = JSON.parse(h.S.exportGraph(h.graph)); file.graph.name = 'Opened JSON workflow'; return file; });
}
async function choose(page, action, value) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 2500 }), menu(page, action)]);
    await chooser.setFiles({ name: 'example.workflow.json', mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) }); return chooser;
}
async function downloaded(download) { const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
async function edit(page, text = 'Unsaved workflow description') {
    await page.evaluate(async text => { const h = window.canvasHarness; h.graph.description = text; h.S.touchGraph(h.graph); h.UI.refreshIfOpen(); await h.settle(); }, text);
}
async function discard(page) { await expect(prompt(page)).toBeVisible(); await prompt(page).getByRole('button', { name: "Don't Save", exact: true }).click(); }

test('fallback Open uses the system JSON picker and replaces the current document', async ({ page }) => {
    await load(page); const before = await snapshot(page), file = await workflowFile(page);
    const chooser = await choose(page, 'Open workflow…', file);
    expect(chooser.isMultiple()).toBe(false);
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.name)).toBe('Opened JSON workflow');
    const after = await snapshot(page); expect(after.graph.id).toBe(file.graph.id); expect(after.enabled).toBe(before.enabled);
    expect(after.recovery).toEqual(before.recovery);
    await expect(page.locator('.pc-document-name')).toHaveText('example.workflow.json');
    await expect(page.getByLabel('Workflow', { exact: true })).toHaveCount(0);
});

test('fallback Download JSON preserves local bindings and camera without declaring a disk save', async ({ page }) => {
    await load(page);
    const expected = await page.evaluate(async () => {
        const h = window.canvasHarness; h.graph.roles.Analysis = { profileId: 'local-profile', model: 'local-model' };
        h.S.touchGraph(h.graph); h.UI.refreshIfOpen(); await h.settle(); await h.view({ x: 321, y: 87, zoom: .8 });
        return { id: h.graph.id, camera: { ...h.canvas.view } };
    });
    const [download] = await Promise.all([page.waitForEvent('download'), menu(page, 'Download JSON…')]);
    const file = await downloaded(download); expect(file).toMatchObject({ kind: 'lattice-document', schema: 1, minRuntime: 2 });
    expect(file.graph.roles.Analysis).toEqual({ profileId: 'local-profile', model: 'local-model' });
    expect(file.workspaceViews.views.find(view => view.identity.kind === 'root').camera).toEqual(expected.camera);
    expect(await page.evaluate(() => window.canvasHarness.S.documentSession.dirty())).toBe(true);
    await expect(page.getByRole('status', { name: 'Document status', exact: true })).toContainText('Modified');
});

test('portable export removes local connection references and Open accepts that package', async ({ page }) => {
    await load(page); await page.evaluate(() => { const h = window.canvasHarness; h.graph.roles.Analysis = { profileId: 'local-profile', model: 'local-model' }; h.S.touchGraph(h.graph); });
    const before = await snapshot(page);
    const [download] = await Promise.all([page.waitForEvent('download'), menu(page, 'Export workflow JSON…')]);
    const file = await downloaded(download); expect(file).toMatchObject({ kind: 'lattice-workflow', schema: 2, minRuntime: 2 });
    expect(file.graph.roles.Analysis).toEqual({ profileId: null, model: 'local-model' }); expect(await snapshot(page)).toEqual(before);
    await choose(page, 'Open workflow…', file); await discard(page);
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.roles.Analysis.profileId)).toBe(null);
    expect(await page.evaluate(() => window.canvasHarness.graph.id)).toBe(file.graph.id);
});

test('New opens a detached unified starter and preserves Arm', async ({ page }) => {
    await load(page); const before = await snapshot(page); await menu(page, 'New workflow');
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.id)).not.toBe(before.graph.id);
    const after = await snapshot(page); expect(after.graph.name).toBe('Untitled workflow');
    expect(after.graph.mode).toBe('native-unified'); expect(Object.values(after.graph.nodes).map(node => node.operation)).toEqual(['on-send','generate-reply','review-publish']);
    expect(after.enabled).toBe(before.enabled); expect(after.recovery).toEqual(before.recovery);
});

test('closing and reopening cancels an inline rename draft while retaining the current document', async ({ page }) => {
    await load(page); await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Rename graph', exact: true }).click();
    const rename = page.locator('.pc-graph-tabs').getByRole('textbox', { name: 'Graph name', exact: true }); await rename.fill('Discarded rename draft');
    await page.evaluate(async () => { const h = window.canvasHarness, graph = h.graph; h.UI.close(); graph.name = 'Changed while closed'; h.S.touchGraph(graph); h.UI.open(); await h.settle(); });
    await expect(rename).toHaveCount(0); await expect(page.locator('.pc-graph-tabs [role="tab"]').first()).toHaveText('Changed while closed');
});

test('Cancel and Escape preserve edited content and camera through the shared New guard', async ({ page }) => {
    await load(page); await edit(page); await page.evaluate(() => window.canvasHarness.view({ x: 120, y: 80, zoom: .75 })); const before = await snapshot(page);
    await menu(page, 'New workflow'); await expect(prompt(page)).toBeVisible();
    await prompt(page).getByRole('button', { name: 'Cancel', exact: true }).click(); expect(await snapshot(page)).toEqual(before);
    expect(await page.evaluate(() => ({ ...window.canvasHarness.canvas.view }))).toMatchObject({ x: 120, y: 80, zoom: .75 });
    await menu(page, 'New workflow'); await expect(prompt(page)).toBeVisible(); await page.keyboard.press('Escape');
    await expect(prompt(page)).toHaveCount(0); expect(await snapshot(page)).toEqual(before);
});

test('guard Download JSON retains the edited document until an explicit Dont Save choice', async ({ page }) => {
    await load(page); await edit(page, 'Save these workflow edits'); const before = await snapshot(page); await menu(page, 'New workflow');
    const [download] = await Promise.all([page.waitForEvent('download'), prompt(page).getByRole('button', { name: 'Download JSON', exact: true }).click()]);
    const file = await downloaded(download); expect(file.graph.id).toBe(before.graph.id); expect(file.graph.description).toBe('Save these workflow edits');
    expect(await snapshot(page)).toEqual(before); expect(await page.evaluate(() => window.canvasHarness.S.documentSession.dirty())).toBe(true);
    await menu(page, 'New workflow'); await discard(page);
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.id)).not.toBe(before.graph.id);
});

test('Dont Save opens New without downloading the old document', async ({ page }) => {
    await load(page); const downloads = []; page.on('download', value => downloads.push(value)); await edit(page); const before = await snapshot(page);
    await menu(page, 'New workflow'); await discard(page);
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.id)).not.toBe(before.graph.id); expect(downloads).toEqual([]);
});

test('a failed guard download keeps current work and reports the failure', async ({ page }) => {
    await load(page); await edit(page); await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('Save download failed'); }; });
    const before = await snapshot(page); await menu(page, 'New workflow'); await prompt(page).getByRole('button', { name: 'Download JSON', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.canvasHarness.toasts.at(-1).type)).toBe('error'); expect(await snapshot(page)).toEqual(before);
    await menu(page, 'New workflow'); await expect(prompt(page)).toBeVisible(); await page.keyboard.press('Escape');
});

test('the document guard blocks canvas shortcuts and traps forward and backward focus', async ({ page }) => {
    await load(page); await edit(page); await page.evaluate(() => window.canvasHarness.canvas.select({kind:'node',id:Object.keys(window.canvasHarness.graph.nodes)[0]}));
    const before = await snapshot(page); await menu(page, 'New workflow'); await expect(prompt(page)).toBeVisible();
    await page.mouse.click(5,5); await page.keyboard.press('Delete'); expect(await snapshot(page)).toEqual(before);
    await page.evaluate(() => { const clipboardData = new DataTransfer(); clipboardData.setData('text/plain','Do not paste onto the canvas'); document.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true})); });
    expect(await snapshot(page)).toEqual(before); await page.keyboard.press('Tab');
    expect(await prompt(page).evaluate(element => element.contains(document.activeElement))).toBe(true);
    await prompt(page).focus(); await page.keyboard.press('Shift+Tab'); await expect(prompt(page).getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
    await page.keyboard.press('Tab'); await expect(prompt(page).getByRole('button',{name:'Download JSON',exact:true})).toBeFocused(); await page.keyboard.press('Escape');
});

test('cancelled fallback pickers preserve the document and produce no import review', async ({ page }) => {
    await load(page); const before = await snapshot(page);
    for (const action of ['Open workflow…','Import into graph…']) {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'),menu(page,action)]); await chooser.setFiles([]);
        await chooser.element().evaluate(input => input.dispatchEvent(new Event('cancel',{bubbles:true}))); await page.evaluate(() => window.canvasHarness.settle());
        expect(await snapshot(page)).toEqual(before);
    }
    await expect(page.getByRole('dialog',{name:'Import into graph',exact:true})).toHaveCount(0);
});

test('invalid and unreadable fallback selections report errors without replacing current work', async ({ page }) => {
    const errors = []; page.on('pageerror',error => errors.push(error.message)); await load(page); const before = await snapshot(page), file = await workflowFile(page);
    for (const action of ['Open workflow…','Import into graph…']) for (const value of ['{invalid',{kind:'lattice-workflow',schema:99,minRuntime:2}]) {
        const count = await page.evaluate(() => window.canvasHarness.toasts.length); await choose(page,action,value);
        await expect.poll(() => page.evaluate(() => window.canvasHarness.toasts.length)).toBeGreaterThan(count); expect(await snapshot(page)).toEqual(before);
    }
    await page.evaluate(() => { File.prototype.text = async () => { throw new Error('Simulated file read failure'); }; });
    for (const action of ['Open workflow…','Import into graph…']) { const count = await page.evaluate(() => window.canvasHarness.toasts.length); await choose(page,action,file); await expect.poll(() => page.evaluate(() => window.canvasHarness.toasts.length)).toBeGreaterThan(count); expect(await snapshot(page)).toEqual(before); }
    expect(errors).toEqual([]);
});

test('delayed fallback Open loses authority after document activation or workspace close', async ({ page }) => {
    await load(page); await page.evaluate(() => { const read = File.prototype.text; File.prototype.text = async function () { const text = await read.call(this); return new Promise(resolve => { window.releaseFileMenuRead = () => resolve(text); }); }; });
    for (const change of ['switch','close']) {
        await page.evaluate(() => { delete window.releaseFileMenuRead; }); await choose(page,'Open workflow…',await workflowFile(page));
        await page.waitForFunction(() => !!window.releaseFileMenuRead);
        if (change === 'switch') await page.evaluate(() => window.canvasHarness.activate(window.canvasHarness.S.createGraph('Another document')));
        else await menu(page,'Close workspace');
        const before = await snapshot(page); await page.evaluate(async () => { window.releaseFileMenuRead(); await window.canvasHarness.settle(); }); expect(await snapshot(page)).toEqual(before);
    }
    await expect(page.getByRole('dialog',{name:'Lattice',exact:true})).toBeHidden();
});

test('File Close retains the same current document, workspace and camera', async ({ page }) => {
    await load(page); const camera = await page.evaluate(async () => { const h = window.canvasHarness; window.fileMenuRoot = document.querySelector('.pc-root'); window.fileMenuGraph = h.graph; await h.view({x:230,y:145,zoom:.75}); return {...h.canvas.view}; });
    const before = await snapshot(page); await menu(page,'Close workspace'); expect(await snapshot(page)).toEqual(before);
    await page.evaluate(async () => { window.canvasHarness.UI.open(); await window.canvasHarness.settle(); }); expect(await snapshot(page)).toEqual(before);
    expect(await page.evaluate(() => ({sameRoot:window.fileMenuRoot === document.querySelector('.pc-root'),sameDocument:window.fileMenuGraph === window.canvasHarness.graph,camera:{...window.canvasHarness.canvas.view},providerCalls:window.canvasHarness.providerCalls()}))).toEqual({sameRoot:true,sameDocument:true,camera,providerCalls:0});
});
