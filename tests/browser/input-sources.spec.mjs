import { test, expect } from '@playwright/test';

async function launch(page, phase = 'pre') {
    await page.route('**/script.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const isGenerating = () => false; export const syncMesToSwipe = () => true; export const syncSwipeToMes = () => true;' }));
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async phase => {
        const c = window.canvasHarness.context;
        Object.assign(c, { chatId: 'input-browser', characterId: 1, groupId: null });
        c.chat.splice(0, c.chat.length, { mes: 'Continue.', is_user: true }, { mes: 'Reply fixture.', is_user: false, swipe_id: 0, swipes: ['Reply fixture.'], swipe_info: [{ extra: {} }], extra: {} });
        await window.canvasHarness.activate({ id: 'input-sources-' + phase, name: 'Input sources', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {}, view: { x: 0, y: 0, zoom: 1 } });
        await (await import('/src/run.js?v=' + window.canvasHarness.version)).initializeNativeWorkflowController();
    }, phase);
}
async function select(page, id) {
    await page.evaluate(async id => {
        const h = window.canvasHarness, node = h.graph.nodes[id];
        await h.view({ x: 280 - node.x, y: 80 - node.y, zoom: 1 });
    }, id);
    await page.locator(`.pc-node[data-id="${id}"] .pc-native-heading`).click();
}
async function choose(page, operation) {
    await page.locator('[data-family="Input"]').click();
    await page.locator(`[data-shelf-choice="operation:${operation}"]`).click();
    const id = await page.evaluate(operation => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === operation).id, operation);
    await select(page, id); return id;
}
async function expectFileDiagnostic(page, message, code) {
    const diagnostic = page.locator('[data-file-input-controls] .pc-diagnostic[data-severity="error"]');
    await expect(diagnostic.locator(':scope > p')).toHaveText(message);
    await expect(diagnostic.locator('strong')).toContainText('Error:');
    const supportCode = diagnostic.locator('code'), disclosure = diagnostic.getByText('Technical details', { exact: true });
    await expect(supportCode).toBeHidden();
    await disclosure.focus(); await disclosure.press('Enter');
    await expect(supportCode).toBeVisible(); await expect(supportCode).toHaveText(code);
    await disclosure.press('Enter'); await expect(supportCode).toBeHidden();
}

for (const phase of ['pre', 'post']) test(`${phase} File Input stores an undoable portable UTF-8 snapshot and replaces it from Details`, async ({ page }) => {
    await launch(page, phase);
    const id = await choose(page, 'file-input');
    await page.getByLabel('Workflow stage', { exact: true }).selectOption(phase);
    expect(await page.evaluate(id => window.canvasHarness.graph.nodes[id].phase, id)).toBe(phase);
    await expect(page.getByLabel('Choose file', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Content', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('File name', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Loaded', { exact: true })).toHaveCount(0);
    await page.getByLabel('Choose file', { exact: true }).setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('\ufeffFirst line\nCafé 🙂\n') });
    await expect.poll(() => page.evaluate(id => {
        const n = window.canvasHarness.graph.nodes[id]; return { fileName: n.fileName, content: n.content, loaded: n.loaded };
    }, id)).toEqual({ fileName: 'notes.md', content: 'First line\nCafé 🙂\n', loaded: true });
    await expect(page.getByLabel('Replace file', { exact: true })).toBeEnabled();
    await expect(page.locator('[data-file-input-controls]')).toContainText('notes.md');
    await expect(page.locator('[data-file-input-controls]')).toContainText('embedded');
    await expect(page.locator('.pc-output-preview [data-run-here]')).toContainText('maximum 0 requests');
    await page.locator('.pc-output-preview [data-run-here]').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    await expect(page.locator('.pc-output-preview [role="tabpanel"] .pc-readable-prose')).toContainText('Café 🙂');
    await page.getByRole('button', { name: 'Source preview', exact: true }).click();
    expect(await page.locator('[data-preview-source]').evaluate(element => JSON.parse(element.textContent).text)).toBe('First line\nCafé 🙂\n');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Choose file', { exact: true })).toBeEnabled();
    expect(await page.evaluate(id => window.canvasHarness.graph.nodes[id].loaded, id)).toBe(false);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.getByLabel('Replace file', { exact: true })).toBeEnabled();
    await page.getByLabel('Replace file', { exact: true }).setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from('') });
    await expect.poll(() => page.evaluate(id => {
        const n = window.canvasHarness.graph.nodes[id]; return { fileName: n.fileName, content: n.content, loaded: n.loaded };
    }, id)).toEqual({ fileName: 'empty.json', content: '', loaded: true });
    const roundtrip = await page.evaluate(async id => {
        const h = window.canvasHarness, { exportWorkflow, parseWorkflow } = await import('/src/workflow/packages.js?v=' + h.version);
        const parsed = parseWorkflow(JSON.stringify(exportWorkflow(h.graph))); if (!parsed.ok) throw Error(parsed.error.message);
        await h.activate(parsed.data); const n = h.graph.nodes[id];
        return { fileName: n.fileName, content: n.content, loaded: n.loaded, providerCalls: h.providerCalls() };
    }, id);
    expect(roundtrip).toEqual({ fileName: 'empty.json', content: '', loaded: true, providerCalls: 0 });
});

test('failed file loads display an error and leave the saved snapshot intact', async ({ page }) => {
    await launch(page); const id = await choose(page, 'file-input');
    await page.getByLabel('Choose file', { exact: true }).setInputFiles({ name: 'saved.txt', mimeType: 'text/plain', buffer: Buffer.from('Saved text') });
    await expect(page.getByLabel('Replace file', { exact: true })).toBeEnabled();
    await page.getByLabel('Replace file', { exact: true }).setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from([0xc3, 0x28]) });
    await expectFileDiagnostic(page, 'Choose a UTF-8 text file.', 'FILE_INVALID_UTF8');
    expect(await page.evaluate(id => {
        const n = window.canvasHarness.graph.nodes[id]; return { fileName: n.fileName, content: n.content, loaded: n.loaded };
    }, id)).toEqual({ fileName: 'saved.txt', content: 'Saved text', loaded: true });
    await page.getByLabel('Replace file', { exact: true }).setInputFiles({ name: 'too-large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(400001, 65) });
    await expectFileDiagnostic(page, 'Choose a file no larger than 400,000 bytes.', 'FILE_TOO_LARGE');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('source Details preserves multiline Text and shows the prompt identifier only for a prompt entry', async ({ page }) => {
    await launch(page); const text = await choose(page, 'text');
    await page.locator('.pc-node-details').getByLabel('Text', { exact: true }).fill('First paragraph.\n\nSecond paragraph.');
    await page.locator('.pc-node-details').getByLabel('Text', { exact: true }).press('Tab');
    await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].text, text)).toBe('First paragraph.\n\nSecond paragraph.');
    await choose(page, 'prompt-source');
    await expect(page.getByLabel('Source', { exact: true })).toHaveValue('system');
    await expect(page.getByLabel('Prompt ID', { exact: true })).toHaveCount(0);
    await page.getByLabel('Source', { exact: true }).selectOption('prompt-entry');
    await expect(page.getByLabel('Prompt ID', { exact: true })).toHaveValue('main');
    await page.getByLabel('Source', { exact: true }).selectOption('system');
    await expect(page.getByLabel('Prompt ID', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

for (const returnToFile of [false, true]) test(returnToFile ? 'returning to the original node during a delayed file read still expires the load' : 'changing selection during a delayed file read leaves both nodes unchanged', async ({ page }) => {
    await launch(page); const fileId = await choose(page, 'file-input'), textId = await choose(page, 'text');
    await select(page, fileId);
    await page.evaluate(() => {
        const original = File.prototype.arrayBuffer;
        File.prototype.arrayBuffer = function () {
            if (this.name !== 'slow.txt') return original.call(this);
            return new Promise(resolve => { window.finishInputRead = () => { File.prototype.arrayBuffer = original; resolve(new TextEncoder().encode('Delayed text').buffer); }; });
        };
    });
    await page.getByLabel('Choose file', { exact: true }).setInputFiles({ name: 'slow.txt', mimeType: 'text/plain', buffer: Buffer.from('Delayed text') });
    await page.waitForFunction(() => !!window.finishInputRead);
    await expect(page.locator('[data-file-input-controls]')).toContainText('Loading file');
    await select(page, textId);
    if (returnToFile) await select(page, fileId);
    await page.evaluate(async () => { window.finishInputRead(); await window.canvasHarness.settle(); });
    expect(await page.evaluate(({ fileId, textId }) => {
        const h = window.canvasHarness, file = h.graph.nodes[fileId];
        return { fileName: file.fileName, content: file.content, loaded: file.loaded, text: h.graph.nodes[textId].text };
    }, { fileId, textId })).toEqual({ fileName: '', content: '', loaded: false, text: '' });
    await expect(page.locator('[data-file-input-controls] .pc-diagnostic[data-severity="error"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
