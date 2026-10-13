import { test, expect } from '@playwright/test';
import { chooseControl, controlValue } from './details-helpers.mjs';

const details = page => page.getByRole('region', { name: 'Node details', exact: true });

async function setup(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { fixtureGraph } = await import('/tests/helpers/workflow-fixtures.mjs');
        await h.activate(fixtureGraph('structured-guidance'));
        h.canvas.select({ kind: 'node', id: 'generate-reply' });
        await h.settle();
    });
}

async function select(page, id) {
    await page.evaluate(async id => {
        const h = window.canvasHarness;
        h.canvas.select({ kind: 'node', id });
        await h.settle();
    }, id);
}

async function expectChoices(page, label, names) {
    const control = details(page).getByLabel(label, { exact: true });
    const role = await control.getAttribute('role') === 'radiogroup' ? 'radio' : 'option';
    await expect(control.getByRole(role)).toHaveCount(names.length);
    for (const name of names) await expect(control.getByRole(role, { name, exact: true })).toHaveCount(1);
}

async function settings(page) {
    return page.evaluate(() => {
        const node = window.canvasHarness.graph.nodes['generate-reply'];
        return { role: node.injectionRole, position: node.injectionPosition, depth: node.injectionDepth };
    });
}

async function setDepth(page, value) {
    const depth = details(page).getByLabel('Injection depth', { exact: true });
    await depth.fill(String(value));
    await depth.press('Tab');
    await expect.poll(async () => (await settings(page)).depth).toBe(value);
}

test('Generate Reply exposes usable default guidance injection controls', async ({ page }) => {
    await setup(page);
    expect(await controlValue(page, 'Injection role')).toBe('system');
    expect(await controlValue(page, 'Injection position')).toBe('in-chat');
    await expectChoices(page, 'Injection role', ['System', 'User', 'Assistant']);
    await expectChoices(page, 'Injection position', ['Before main prompt', 'After main prompt', 'In chat']);
    const depth = details(page).getByLabel('Injection depth', { exact: true });
    await expect(depth).toHaveValue('0');
    await expect(depth).toHaveAttribute('min', '0');
    await expect(depth).toHaveAttribute('max', '10000');
    await expect(depth).toHaveAttribute('step', '1');
    for (const id of ['compose-guidance', 'guidance', 'on-send', 'review-publish']) {
        await select(page, id);
        for (const label of ['Injection role', 'Injection position', 'Injection depth']) {
            await expect(details(page).getByLabel(label, { exact: true })).toHaveCount(0);
        }
    }
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('injection edits use history and retain depth while main prompt positions hide it', async ({ page }) => {
    await setup(page);
    await chooseControl(page, 'Injection role', 'user');
    await expect.poll(async () => (await settings(page)).role).toBe('user');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await controlValue(page, 'Injection role')).toBe('system');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect(await controlValue(page, 'Injection role')).toBe('user');

    await setDepth(page, 7);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(details(page).getByLabel('Injection depth', { exact: true })).toHaveValue('0');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(details(page).getByLabel('Injection depth', { exact: true })).toHaveValue('7');

    await chooseControl(page, 'Injection position', 'before-prompt');
    await expect(details(page).getByLabel('Injection depth', { exact: true })).toHaveCount(0);
    expect(await settings(page)).toEqual({ role: 'user', position: 'before-prompt', depth: 7 });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await controlValue(page, 'Injection position')).toBe('in-chat');
    await expect(details(page).getByLabel('Injection depth', { exact: true })).toHaveValue('7');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect(await controlValue(page, 'Injection position')).toBe('before-prompt');
    await expect(details(page).getByLabel('Injection depth', { exact: true })).toHaveCount(0);

    await chooseControl(page, 'Injection position', 'in-prompt');
    await expect(details(page).getByLabel('Injection depth', { exact: true })).toHaveCount(0);
    expect(await settings(page)).toEqual({ role: 'user', position: 'in-prompt', depth: 7 });
    await chooseControl(page, 'Injection position', 'in-chat');
    await expect(details(page).getByLabel('Injection depth', { exact: true })).toHaveValue('7');
    expect(await settings(page)).toEqual({ role: 'user', position: 'in-chat', depth: 7 });
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('exported injection settings restore the selected role and hidden depth', async ({ page }) => {
    await setup(page);
    await chooseControl(page, 'Injection role', 'assistant');
    await setDepth(page, 10000);
    await chooseControl(page, 'Injection position', 'in-prompt');
    await expect(details(page).getByLabel('Injection depth', { exact: true })).toHaveCount(0);
    const restored = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { exportWorkflow, parseWorkflow } = await import('/src/workflow/packages.js?v=' + h.version);
        const parsed = parseWorkflow(JSON.stringify(exportWorkflow(h.graph)));
        if (!parsed.ok) throw Error(parsed.error.message);
        await h.activate(parsed.data);
        h.canvas.select({ kind: 'node', id: 'generate-reply' });
        await h.settle();
        const node = h.graph.nodes['generate-reply'];
        return { role: node.injectionRole, position: node.injectionPosition, depth: node.injectionDepth };
    });
    expect(restored).toEqual({ role: 'assistant', position: 'in-prompt', depth: 10000 });
    expect(await controlValue(page, 'Injection role')).toBe('assistant');
    expect(await controlValue(page, 'Injection position')).toBe('in-prompt');
    await expect(details(page).getByLabel('Injection depth', { exact: true })).toHaveCount(0);
    await chooseControl(page, 'Injection position', 'in-chat');
    await expect(details(page).getByLabel('Injection depth', { exact: true })).toHaveValue('10000');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
