import { test, expect } from '@playwright/test';

const details = page => page.getByRole('region', { name: 'Node details', exact: true });
const activeTab = page => page.locator('.pc-graph-tab[aria-selected="true"]');
const modelSummary = page => details(page).locator('[data-model-controls] > summary');

async function sharedModelFixture(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { siblingWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const { computeDefinitionIdentity, definitionRefKey } = await import('/src/workflow/definitions.js?v=' + h.version);
        const root = siblingWorkflow(), draft = structuredClone(Object.values(root.definitions)[0]);
        delete draft.semanticHash;
        Object.assign(draft.body.nodes.entry, { x: 60, y: 100 });
        Object.assign(draft.body.nodes.work, { x: 380, y: 100, profileId: 'local', model: 'definition-model' });
        Object.assign(draft.body.nodes.exit, { x: 700, y: 100 });
        const checked = computeDefinitionIdentity(draft);
        if (!checked.ok) throw new Error(checked.error.message);
        const definition = { ...checked.data.materializedDefinition, semanticHash: checked.data.semanticHash };
        const ref = { id: definition.id, version: definition.version, semanticHash: definition.semanticHash };
        root.definitions = { [definitionRefKey(ref)]: definition };
        root.nodes['first/path'].definition = ref;
        root.nodes.second.definition = ref;
        root.name = 'Shared pinned model nodes';
        for (const [id, x, y] of [['source', 50, 200], ['first/path', 370, 60], ['second', 370, 340], ['one', 700, 60], ['two', 700, 340]]) {
            Object.assign(root.nodes[id], { x, y });
        }
        const c = h.context;
        c.extensionSettings.connectionManager = { profiles: [
            { id: 'local', name: 'Definition connection', api: 'openai', model: 'local-profile-model', preset: null },
            { id: 'cheap', name: 'Instance connection', api: 'openai', model: 'cheap-profile-model', preset: null },
        ] };
        c.CONNECT_API_MAP = { openai: { selected: 'openai', source: 'openai' } };
        c.ConnectionManagerRequestService.getProfile = id => c.extensionSettings.connectionManager.profiles.find(profile => profile.id === id);
        await h.activate(root);
    });
}

async function savedBindings(page) {
    return page.evaluate(() => {
        const root = window.canvasHarness.S.activeWorkflow();
        return { overrides: root.nodes['first/path'].nodeBindingOverrides, sibling: root.nodes.second, definitions: root.definitions };
    });
}

test('a pinned instance edits its own connection and profile model with Undo and Redo in the same tab', async ({ page }) => {
    await sharedModelFixture(page);
    const before = await savedBindings(page);
    await page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading').dblclick();
    await page.locator('.pc-node-native[data-id="work"] .pc-native-heading').click();
    await expect(details(page).getByText('Read-only body', { exact: true })).toBeVisible();
    await expect(details(page).getByLabel('Instructions', { exact: true })).toBeDisabled();
    const profile = details(page).getByLabel('Connection profile', { exact: true });
    const modelMode = details(page).getByLabel('Model mode', { exact: true });
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    const redo = page.getByRole('button', { name: 'Redo', exact: true });
    const childTabId = await activeTab(page).getAttribute('id');
    await expect(profile).toBeEnabled();
    await expect(profile).toHaveValue('local');
    await expect(modelMode.locator('option:checked')).toHaveText('Use definition model');
    await expect(modelSummary(page)).toContainText('local · definition-model');

    await profile.selectOption('cheap');
    await expect(modelSummary(page)).toContainText('cheap · definition-model');
    expect((await savedBindings(page)).overrides).toEqual({ '[[],"work"]': { profileId: 'cheap' } });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(activeTab(page)).toHaveAttribute('id', childTabId);
    await expect(profile).toHaveValue('local');
    await expect(modelSummary(page)).toContainText('local · definition-model');
    expect((await savedBindings(page)).overrides).toEqual({});
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(activeTab(page)).toHaveAttribute('id', childTabId);
    await expect(profile).toHaveValue('cheap');
    await expect(modelSummary(page)).toContainText('cheap · definition-model');

    await modelMode.selectOption('block');
    await expect(modelMode.locator('option:checked')).toHaveText('Use profile model');
    await expect(modelSummary(page)).toContainText('cheap · cheap-profile-model');
    expect((await savedBindings(page)).overrides).toEqual({ '[[],"work"]': { profileId: 'cheap', model: null } });
    await undo.click();
    await expect(activeTab(page)).toHaveAttribute('id', childTabId);
    await expect(modelMode.locator('option:checked')).toHaveText('Use definition model');
    await expect(modelSummary(page)).toContainText('cheap · definition-model');
    await redo.click();
    await expect(activeTab(page)).toHaveAttribute('id', childTabId);
    await expect(modelMode.locator('option:checked')).toHaveText('Use profile model');
    await expect(modelSummary(page)).toContainText('cheap · cheap-profile-model');
    const after = await savedBindings(page);
    expect(after.definitions).toEqual(before.definitions);
    expect(after.sibling).toEqual(before.sibling);
    expect(after.overrides).toEqual({ '[[],"work"]': { profileId: 'cheap', model: null } });

    await page.getByRole('tab', { name: 'Shared pinned model nodes', exact: true }).click();
    await page.locator('.pc-node-native[data-id="second"] .pc-native-heading').dblclick();
    await page.locator('.pc-node-native[data-id="work"] .pc-native-heading').click();
    await expect(details(page).getByLabel('Connection profile', { exact: true })).toHaveValue('local');
    await expect(details(page).getByLabel('Model mode', { exact: true }).locator('option:checked')).toHaveText('Use definition model');
    await expect(modelSummary(page)).toContainText('local · definition-model');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
