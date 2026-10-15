import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { chooseControl } from './details-helpers.mjs';
const activeId = 'lattice:active-sillytavern';
const picker = (page, id = 'plan') => page.locator(`.pc-node-profile[data-id="${id}"]`);
const bar = (page, id = 'plan') => picker(page, id).locator('.profile-bar');
async function fixture(page, shared = false) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async shared => {
        const h = window.canvasHarness, c = h.context;
        c.mainApi = 'openai'; c.chatCompletionSettings.chat_completion_source = 'nanogpt'; c.chatCompletionSettings.current_model = 'active-host-model';
        c.getChatCompletionModel = settings => { window.profileModelReads = (window.profileModelReads || 0) + 1; return settings.current_model; };
        c.CONNECT_API_MAP = { nanogpt: { selected: 'openai', source: 'nanogpt', label: 'NanoGPT' }, claude: { selected: 'openai', source: 'claude', label: 'Claude' } };
        c.extensionSettings.connectionManager = { profiles: [
            { id: 'saved', name: 'Reasoning NanoGPT Deep Plan with a long full connection name', api: 'nanogpt', model: 'reasoning-model', preset: null },
            { id: 'cheap', name: 'Fast compact connection', api: 'nanogpt', model: 'compact-model', preset: null },
            { id: 'local', name: 'Definition connection', api: 'claude', model: 'definition-model', preset: null },
            ...Array.from({ length: 16 }, (_, i) => ({ id: 'extra-' + i, name: 'Connection number ' + String(i).padStart(2, '0'), api: 'nanogpt', model: 'extra-model-' + i, preset: null })),
        ] };
        c.ConnectionManagerRequestService.getProfile = id => c.extensionSettings.connectionManager.profiles.find(profile => profile.id === id);
        let root;
        if (shared) {
            const { nestedWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs'); root = nestedWorkflow(); root.name = 'Pinned profile instances';
            Object.assign(root.nodes['first/path'], { x: 360, y: 160 }); Object.assign(root.nodes.second, { x: 700, y: 160 });
        } else {
            root = { id: 'profile-root', name: 'Node profile controls', schema: 3, runtime: 2, mode: 'native-unified', roles: { Analysis: { profileId: 'cheap' } }, definitions: {}, groups: {}, portals: {}, wires: {}, nodes: {
                scene: { id: 'scene', type: 'workflow', operation: 'scene-context', x: 30, y: 160 },
                compact: { id: 'compact', type: 'workflow', operation: 'smart-compactor', method: 'compress', profileId: 'cheap', x: 310, y: 160 },
                plan: { id: 'plan', type: 'workflow', operation: 'response-plan', profileId: 'saved', x: 620, y: 160 },
                inherited: { id: 'inherited', type: 'workflow', operation: 'response-plan', x: 620, y: 420 },
            } };
        }
        await h.activate(root); await h.view({ x: 60, y: 110, zoom: .85 }); h.canvas.select(null);
    }, shared);
}
async function choose(page, id, query) {
    await bar(page, id).click();
    const input = picker(page, id).getByRole('combobox'); await input.fill(query); await input.press('Enter');
}
test('an unselected node edits its own profile using keyword search and restores fixed and inherited bindings with Undo/Redo', async ({ page }) => {
    await fixture(page);
    await expect(bar(page)).toContainText('Reasoning NanoGPT');
    await expect(picker(page).locator('.node-model-meta')).toHaveText('reasoning-model');
    await expect(bar(page, 'scene')).toHaveCount(0);
    await expect(bar(page, 'inherited')).toContainText('Fast compact');
    await bar(page).click();
    const results = picker(page).getByRole('option'); await expect(results.first()).toContainText('Active SillyTavern model');
    await expect(results.locator('[aria-selected="true"]')).toHaveCount(0);
    await picker(page).getByRole('combobox').fill('FAST nanogpt');
    await expect(results).toHaveCount(2); await expect(results.first()).toContainText('Active SillyTavern model');
    await picker(page).getByRole('combobox').press('Enter');
    await expect(bar(page)).toContainText('Fast compact');
    expect(await page.evaluate(() => window.canvasHarness.graph.nodes.plan.profileId)).toBe('cheap');
    expect(await page.evaluate(() => window.canvasHarness.selection)).toEqual([]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(bar(page)).toContainText('Reasoning NanoGPT');
    await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(bar(page)).toContainText('Fast compact');
    await choose(page, 'inherited', 'active');
    expect(await page.evaluate(() => window.canvasHarness.graph.nodes.inherited.profileId)).toBe(activeId);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await page.evaluate(() => window.canvasHarness.graph.nodes.inherited.profileId ?? null)).toBeNull();
    await expect(bar(page, 'inherited')).toContainText('Fast compact');
});
test('public host events and menu opening refresh metadata while camera and selection bursts reuse cached labels', async ({ page }) => {
    await fixture(page); await choose(page, 'plan', 'active');
    await expect(picker(page).locator('.node-model-meta')).toHaveText('active-host-model');
    const reads = await page.evaluate(() => window.profileModelReads);
    await page.evaluate(async () => { const h = window.canvasHarness; for (let i = 0; i < 8; i++) { await h.view({ x: 60 + i, y: 110, zoom: .85 }); h.canvas.select({ kind: 'node', id: 'compact' }); h.canvas.select(null); } });
    expect(await page.evaluate(() => window.profileModelReads)).toBe(reads);
    await page.evaluate(async () => { const c = window.canvasHarness.context; c.chatCompletionSettings.current_model = 'event-model'; await c.eventSource.emit(c.eventTypes.CHATCOMPLETION_MODEL_CHANGED); });
    await expect(picker(page).locator('.node-model-meta')).toHaveText('event-model');
    await page.evaluate(() => { window.canvasHarness.context.chatCompletionSettings.current_model = 'menu-model'; });
    await bar(page).click(); await expect(picker(page).locator('.node-model-meta')).toHaveText('menu-model'); await page.keyboard.press('Escape');
    await choose(page, 'plan', 'reasoning deep');
    await bar(page).click();
    await page.evaluate(async () => { const c = window.canvasHarness.context; c.extensionSettings.connectionManager.profiles = c.extensionSettings.connectionManager.profiles.filter(profile => profile.id !== 'saved'); await c.eventSource.emit(c.eventTypes.CONNECTION_PROFILE_DELETED); });
    await expect(bar(page)).toContainText('Unavailable connection · saved');
    await expect(picker(page).getByRole('combobox')).toHaveCount(0); await expect(picker(page).locator('.node-model-meta')).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasHarness.graph.nodes.plan.profileId)).toBe('saved');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
test('deep pinned profile edits isolate siblings and library inspection disables editing', async ({ page }) => {
    await fixture(page, true);
    const before = await page.evaluate(() => structuredClone(window.canvasHarness.graph));
    await page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading').dblclick();
    await page.locator('.pc-node-native[data-id="work"] .pc-native-heading').dblclick();
    await page.evaluate(async () => { const h = window.canvasHarness; const node = h.canvas.graph.nodes.work; await h.view({ x: 420 - node.x * .9, y: 170 - node.y * .9, zoom: .9 }); h.canvas.select(null); });
    await choose(page, 'work', 'fast');
    const effectiveProfile = await page.evaluate(() => window.canvasHarness.canvas.graph.nodes.work.profileId);
    // The current document owns nested overrides; drawing holds their effective values.
    const saved = await page.evaluate(() => structuredClone(window.canvasHarness.S.activeWorkflow()));
    expect(saved.nodes['first/path'].nodeBindingOverrides).toEqual({ '[["work"],"work"]': { profileId: 'cheap' } });
    expect(saved.nodes.second).toEqual(before.nodes.second); expect(saved.definitions).toEqual(before.definitions);
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(bar(page, 'work')).toContainText('Definition connection');
    const tab = page.locator('.pc-graph-tab[aria-selected="true"]');
    await tab.click({ button: 'right' });
    // Use the public controller navigation through the parent wrapper's context menu.
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Pinned profile instances', exact: true }).click();
    await page.locator('.pc-node-native[data-id="second"] .pc-native-heading').click({ button: 'right' });
    await page.getByText('Open saved definition', { exact: true }).click();
    await expect(bar(page, 'work')).toBeDisabled();
    expect(effectiveProfile).toBe('cheap');
});
test('new model nodes select the active host option and operation mode changes remove controls', async ({ page }) => {
    await fixture(page);
    await page.locator('[data-family="Shaping"]').click();
    await page.locator('[data-shelf-choice="operation:response-plan"]').click();
    const node = await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === 'response-plan' && !['plan', 'inherited'].includes(node.id)));
    expect(node.profileId).toBe(activeId);
    await expect(bar(page, node.id)).toContainText('Active SillyTavern model');
    await page.locator('.pc-node-native[data-id="compact"] .pc-native-heading').click();
    await chooseControl(page, 'Method', 'select');
    await expect(bar(page, 'compact')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(bar(page, 'compact')).toBeVisible();
});
test('profile popup stays bounded and scrolls independently under a nonidentity camera and narrow viewport', async ({ page }) => {
    await fixture(page);
    await mkdir('.tmp/node-profiles', { recursive: true });
    await page.screenshot({ path: '.tmp/node-profiles/node-profiles-normal-closed.png' });
    await bar(page).click();
    const menu = picker(page).locator('.profile-menu'), list = picker(page).getByRole('listbox');
    await expect(menu).toBeVisible();
    const selected = picker(page).locator('.profile-option[aria-selected="true"]'); await expect(selected).toContainText('long full connection name');
    await page.screenshot({ path: '.tmp/node-profiles/node-profiles-normal-open.png' });
    const camera = await page.evaluate(() => structuredClone(window.canvasHarness.canvas.view));
    await list.hover(); await page.mouse.wheel(0, 2000);
    await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.mouse.wheel(0, 2000); expect(await page.evaluate(() => window.canvasHarness.canvas.view)).toEqual(camera);
    await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
    await page.setViewportSize({ width: 620, height: 820 });
    await page.evaluate(async () => { const h = window.canvasHarness; await h.view({ x: -140, y: 220, zoom: .72 }); });
    await bar(page).click(); await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(621);
    await page.screenshot({ path: '.tmp/node-profiles/node-profiles-narrow-open.png' });
    await page.keyboard.press('Escape'); await bar(page).click();
    await page.locator('.pc-node-native[data-id="plan"] .pc-native-heading').click(); await expect(menu).toHaveCount(0);
});

test('changing documents closes the popup and rejects its captured node action', async ({ page }) => {
    await fixture(page); await bar(page).click();
    const response = await page.evaluate(async () => {
        const h = window.canvasHarness, selection = structuredClone(h.canvas.nodeProfiles.find(row => row.id === 'plan').selection);
        const original = h.graph, other = structuredClone(h.graph); other.id = 'other-profile-root'; other.name = 'Other node profiles';
        await h.activate(other);
        const result = h.canvas.hooks.editProfile(selection, 'cheap');
        return { result, oldValue: original.nodes.plan.profileId, newValue: h.S.activeWorkflow().nodes.plan.profileId };
    });
    expect(response.result.ok).toBe(false); expect(response.result.error.code).toBe('STALE_CONTEXT');
    expect(response.oldValue).toBe('saved'); expect(response.newValue).toBe('saved');
    await expect(picker(page).getByRole('combobox')).toHaveCount(0);
});
test('text-completion settings updates refresh active labels while unchanged workspace saves avoid resolution', async ({ page }) => {
    await fixture(page);
    await page.evaluate(async () => {
        const c = window.canvasHarness.context;
        c.mainApi = 'textgenerationwebui'; c.textCompletionSettings = { type: 'ollama', ollama_model: 'initial-text-model' };
        c.CONNECT_API_MAP.ollama = { selected: 'textgenerationwebui', type: 'ollama', label: 'Ollama' };
        const getProfile = c.ConnectionManagerRequestService.getProfile;
        c.ConnectionManagerRequestService.getProfile = id => { window.profileBindingReads = (window.profileBindingReads || 0) + 1; return getProfile(id); };
        await c.eventSource.emit(c.eventTypes.MAIN_API_CHANGED);
    });
    await choose(page, 'plan', 'active');
    await expect(picker(page).locator('.node-model-meta')).toHaveText('initial-text-model');
    await page.evaluate(async () => { const c = window.canvasHarness.context; c.textCompletionSettings.ollama_model = 'changed-text-model'; await c.eventSource.emit(c.eventTypes.SETTINGS_UPDATED); });
    await expect(picker(page).locator('.node-model-meta')).toHaveText('changed-text-model');
    const reads = await page.evaluate(() => ({ profiles: window.profileBindingReads, models: window.profileModelReads }));
    await page.evaluate(async () => { const h = window.canvasHarness; for (let i = 0; i < 8; i++) { await h.view({ x: 60 + i, y: 110, zoom: .85 }); h.canvas.select({ kind: 'node', id: 'compact' }); h.canvas.select(null); await h.context.eventSource.emit(h.context.eventTypes.SETTINGS_UPDATED); } });
    expect(await page.evaluate(() => ({ profiles: window.profileBindingReads, models: window.profileModelReads }))).toEqual(reads);
});

test('unified model nodes and configured model modes expose independent active profile controls', async ({ page }, testInfo) => {
    await fixture(page);
    await page.getByRole('button', { name: 'Collapse preview', exact: true }).click();
    const ids = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { prepareNativeConnectionEdit } = await import('/src/workflow/connection-edits.js?v=' + h.version);
        let graph = { id: 'unified-profiles', name: 'Unified model profiles', schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, portals: {}, definitions: {} };
        const cases = [
            ['decision', {}, 'pre'], ['model-call', {}, 'pre'], ['enrich', {}, 'post'],
            ['extract', { mode: 'model' }, 'post'], ['revise-draft', {}, 'post'], ['effect-author', {}, 'post'],
            ['express', { mode: 'inner-voice' }, 'pre'], ['context', { mode: 'focus', method: 'compress' }, 'pre'],
            ['item-use-trigger', { itemId: 'wand', mode: 'extract' }, 'post'],
            ['prompted-memory', { actorId: 'mara' }, 'pre'], ['character-direction', { actorId: 'mara' }, 'pre'],
            ['extract', { mode: 'literal' }, 'post'],
        ];
        const ids = [];
        for (const [index, [operation, controls, phase]] of cases.entries()) {
            const result = prepareNativeConnectionEdit(graph, { kind: 'create', operation, controls, phase, graphPoint: { x: index % 3 * 270, y: Math.floor(index / 3) * 220 } });
            if (!result.ok) throw new Error(operation + ': ' + JSON.stringify(result.error));
            graph = result.data.candidate;
            ids.push({ operation, id: result.data.addedNodeIds[0], model: index < 11 });
        }
        await h.activate(graph); await h.view({ x: 210, y: 45, zoom: .78 }); h.canvas.select(null);
        return ids;
    });
    await expect(page.locator('.pc-node-profile .profile-bar')).toHaveCount(11);
    for (const node of ids) {
        if (!node.model) { await expect(bar(page, node.id)).toHaveCount(0); continue; }
        await expect(bar(page, node.id)).toContainText('Active SillyTavern model');
        await expect(picker(page, node.id).locator('.node-model-meta')).toHaveText('active-host-model');
    }
    const decision = ids.find(node => node.operation === 'decision');
    await choose(page, decision.id, 'fast');
    await expect(bar(page, decision.id)).toContainText('Fast compact');
    await expect(picker(page, decision.id).locator('.node-model-meta')).toHaveText('compact-model');
    const modelCall = ids.find(node => node.operation === 'model-call');
    await expect(bar(page, modelCall.id)).toContainText('Active SillyTavern model');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(bar(page, decision.id)).toContainText('Active SillyTavern model');
    const extract = ids.find(node => node.operation === 'extract' && node.model);
    await page.locator(`.pc-node-native[data-id="${extract.id}"] .pc-native-heading`).click();
    await chooseControl(page, 'Mode', 'literal');
    await expect(bar(page, extract.id)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(bar(page, extract.id)).toContainText('Active SillyTavern model');
    await page.screenshot({ path: testInfo.outputPath('unified-model-profiles.png') });
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('a rejected profile edit keeps its error and scrollable list inside a short canvas viewport', async ({ page }) => {
    await fixture(page);
    await page.setViewportSize({ width: 620, height: 400 });
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        await h.view({ x: -340, y: -10, zoom: .72 });
        h.canvas.hooks.editProfile = () => ({ ok: false, error: { code: 'UNAVAILABLE', message: 'This connection is unavailable. Choose another profile or retry after refreshing connection settings. '.repeat(3) } });
    });
    await bar(page).click();
    await picker(page).getByRole('option').first().click();
    await expect(picker(page).locator('.pc-diagnostic[data-severity="error"]')).toBeVisible();
    const menu = await picker(page).locator('.profile-menu').boundingBox();
    const canvas = await page.locator('.pc-canvas-host').boundingBox();
    expect(menu.y).toBeGreaterThanOrEqual(canvas.y);
    expect(menu.y + menu.height).toBeLessThanOrEqual(canvas.y + canvas.height);
    const list = picker(page).getByRole('listbox');
    await list.hover(); await page.mouse.wheel(0, 500);
    await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(picker(page).getByRole('combobox')).toHaveCount(0);
});

test('Details keeps connection selection on the node bar and resets root and qualified overrides directly',async({page})=>{
 await fixture(page);await page.locator('.pc-node-native[data-id="plan"] .pc-native-heading').click();
 const details=page.locator('.pc-node-details');await expect(details.getByRole('combobox',{name:'Connection profile',exact:true})).toHaveCount(0);await expect(details.getByRole('combobox',{name:'Connection mode',exact:true})).toHaveCount(0);
 await expect(details.locator('[data-model-controls]')).not.toHaveAttribute('open','');await details.locator('[data-model-controls] > summary').click();
 await details.getByRole('button',{name:'Use inherited connection',exact:true}).click();expect(await page.evaluate(()=>Object.hasOwn(window.canvasHarness.graph.nodes.plan,'profileId'))).toBe(false);await expect(bar(page)).toContainText('Fast compact');
 await choose(page,'plan','active');await expect(bar(page)).toContainText('Active SillyTavern model');
 await fixture(page,true);await page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading').dblclick();await page.locator('.pc-node-native[data-id="work"] .pc-native-heading').dblclick();await page.evaluate(async()=>{const h=window.canvasHarness,node=h.canvas.graph.nodes.work;await h.view({x:420-node.x*.9,y:170-node.y*.9,zoom:.9});h.canvas.select(null);});await choose(page,'work','fast');await page.locator('.pc-node-native[data-id="work"] .pc-native-heading').click();
 await details.locator('[data-model-controls] > summary').click();await details.getByRole('button',{name:'Use definition connection',exact:true}).click();
 expect(await page.evaluate(()=>window.canvasHarness.S.activeWorkflow().nodes['first/path'].nodeBindingOverrides??{})).toEqual({});await expect(bar(page,'work')).toContainText('Definition connection');
});
