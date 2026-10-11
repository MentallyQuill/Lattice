import { test, expect } from '@playwright/test';
import { chooseControl, chooseNodeProfile, openDetailGroup } from './details-helpers.mjs';

const preview = page => page.locator('.pc-output-preview');
const details = page => page.getByRole('region', { name: 'Node details', exact: true });
async function openExamples(page) {
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Examples', exact: true });
    await expect(dialog).toBeVisible(); return dialog;
}
async function openExample(page, title) {
    const dialog = await openExamples(page);
    await dialog.getByRole('button', { name: title, exact: true }).click();
    await finishExampleChoice(page);
    await expect(dialog).toBeHidden();
}
async function finishExampleChoice(page) {
    const guard=page.getByRole('dialog',{name:'Save workflow changes?',exact:true});
    const picker=page.getByRole('dialog',{name:'Examples',exact:true});
    await expect.poll(async()=>await guard.isVisible()||!await picker.isVisible()).toBe(true);
    if(await guard.isVisible())await guard.getByRole('button',{name:"Don't Save",exact:true}).click();
}
// Authoring fixtures retain diagnostic operation layouts as unified roots.
async function installWorkflow(page, title) {
    await page.evaluate(async title => {
        const h = window.canvasHarness, { fixtureGraph } = await import('/tests/helpers/workflow-fixtures.mjs');
        const id = { 'Scene guidance': 'native-guidance', 'Reviewed AI De-slop': 'reviewed-de-slop' }[title];
        if (!id) throw new Error('Unknown authoring fixture: ' + title);
        await h.activate(fixtureGraph(id));
    }, title);
}
async function bindNode(page, operation, profile) {
    await inspectOperation(page, operation);
    await chooseNodeProfile(page, await operationId(page, operation), profile);
    await openDetailGroup(page, 'Model');
}
async function expectCurrentDocument(page) {
    await expect(page.locator('.pc-root-workflow-status')).toContainText('unified');
    await expect(page.getByRole('button',{name:'Workflows',exact:true})).toHaveCount(0);
    await expect(page.getByRole('combobox',{name:'Workflow',exact:true})).toHaveCount(0);
}
async function expectBound(page, bound) {
    await expect(page.locator('.pc-root-workflow-status')).toContainText('≤ ' + bound + ' requests');
}
async function operationId(page, operation) {
    return page.evaluate(operation => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === operation)?.id, operation);
}
async function openFormation(page) {
    const group = page.getByRole('group', { name: 'Group: AI De-slop', exact: true });
    const open = group.getByRole('button', { name: 'Open group', exact: true });
    if (await open.count()) await open.click();
    const scan = await operationId(page, 'pattern-scan'), repair = await operationId(page, 'repair');
    await expect(page.locator(`.pc-node-native[data-id="${scan}"]`)).toBeVisible();
    await expect(page.locator(`.pc-node-native[data-id="${repair}"]`)).toBeVisible();
}
async function inspectOperation(page, operation) {
    const id = await operationId(page, operation); expect(id).toBeTruthy();
    const card = page.locator(`.pc-node-native[data-id="${id}"]`);
    if (!await card.count()) await openFormation(page);
    await card.locator('.pc-native-heading').click();
    const toggle = page.getByRole('button', { name: 'Toggle inspector', exact: true });
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
    await expect(details(page)).toBeVisible(); return details(page);
}
async function selectTerminal(page, operation, pin = true) {
    const id = await operationId(page, operation); expect(id).toBeTruthy();
    const leaf = preview(page);
    const pinControl = leaf.getByRole('button', { name: 'Pin preview', exact: true });
    if (await pinControl.getAttribute('aria-pressed') === 'true') await pinControl.click();
    await page.evaluate(id => window.canvasHarness.canvas.select({ kind: 'node', id }), id);
    await expect(leaf.locator('h3')).toContainText('Host result');
    if (pin) await pinControl.click();
    await expect(pinControl).toHaveAttribute('aria-pressed', String(pin));
}
async function nativeSend(page) {
    await page.evaluate(async () => {
        const h = window.canvasHarness, c = h.context, s = h.S.settings();
        s.enabled = true;
        h.S.save(); h.UI.refreshIfOpen();
        if(!c.chat.at(-1)?.is_user)c.chat.push({mes:'Continue.',is_user:true,extra:{}});
        await c.eventSource.emit(c.eventTypes.GENERATION_STARTED, 'normal', {}, false);
        const ready = await window.latticeGenerationInterceptor(c.chat, 8192, () => {}, 'normal');
        if (!ready.ok || !ready.awaitingNative) throw Error(JSON.stringify(ready));
        const now = new Date().toISOString(), index = c.chat.length;
        c.chat.push({mes:'We delve.',is_user:false,swipe_id:0,swipes:['We delve.'],swipe_info:[{extra:{preserved:true},gen_started:now,gen_finished:now}],extra:{preserved:true},gen_started:now,gen_finished:now});
        await c.eventSource.emit(c.eventTypes.MESSAGE_RECEIVED, index, 'normal');
        await c.eventSource.emit(c.eventTypes.GENERATION_ENDED, c.chat.length);
    });
}
async function runRoot(page) {
    await selectTerminal(page, 'review-publish');
    await nativeSend(page);
}
async function artifact(page, label) {
    const leaf = preview(page);
    await leaf.getByRole('tab', { name: label, exact: true }).click();
    const panel = leaf.getByRole('tabpanel'); await expect(panel).toBeVisible(); return panel;
}
async function candidateText(page, text) {
    const panel = await artifact(page, 'candidate');
    await expect(panel.locator('pre')).toContainText(text);
}
async function expectRequests(page, actual, bound) {
    const meter = page.getByRole('button', { name: /^Open run details\./ });
    await expect(meter).toHaveAttribute('aria-label', new RegExp(actual + ' of ' + bound + ' requests\\.'));
    await meter.click();
    const dialog = page.getByRole('dialog', { name: 'Run details', exact: true });
    await expect(dialog.locator('.pc-run-summary').getByText(actual + ' of ' + bound + ' requests', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close panel', exact: true }).click();
}
async function saveRules(page, rules) {
    const region = details(page);
    await region.getByLabel('Rules', { exact: true }).fill(JSON.stringify(rules, null, 2));
    await region.getByRole('button', { name: 'Save Rules', exact: true }).click();
}
// Review/Send fixtures use the public saved graph, never a panel
// DTO or manufactured review handle. UI binding itself is tested separately.
async function fixtureRole(page, role, profile) {
    await page.evaluate(async ({ role, profile }) => {
        const h = window.canvasHarness, { ACTIVE_PROFILE_ID } = await import('/src/workflow/model-profiles.js?v=' + h.version);
        h.graph.roles ??= {}; h.graph.roles[role] = { profileId: profile, model: null };
        // These authored diagnostic cases exercise saved role inheritance.
        // Preserve all independently selected node profiles and model overrides.
        for (const node of Object.values(h.graph.nodes)) if (node.modelRole === role && node.profileId === ACTIVE_PROFILE_ID) node.profileId = null;
        h.S.touchGraph(h.graph); h.UI.refreshIfOpen();
    }, { role, profile });
}
async function canvasHistory(page, key) {
    await page.getByLabel('Node canvas', { exact: true }).focus();
    await page.keyboard.press(key);
}

test('editing imported structured scan rules preserves findings and metadata and rejects invalid drafts', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await installWorkflow(page, 'Reviewed AI De-slop');
    await page.evaluate(() => {
        const node = Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === 'pattern-scan');
        node.rules = [{ phrase: 'delve', note: 'Keep this preference', details: { category: 'wording' } }, 'weave'];
        node.caseSensitive = true; node.exemptions = ['delve safely']; node.protectedLiterals = ['weave'];
        window.canvasHarness.S.touchGraph(window.canvasHarness.graph); window.canvasHarness.UI.refreshIfOpen();
    });
    await inspectOperation(page, 'pattern-scan');
    const editor = page.getByLabel('Rules', { exact: true });
    const initial = await editor.inputValue();
    await editor.focus(); await page.evaluate(() => { window.ruleEditorElement = document.activeElement; });
    await editor.fill(JSON.stringify([...JSON.parse(initial), 'tapestry'], null, 2));
    expect(await page.evaluate(() => document.activeElement === window.ruleEditorElement && document.contains(window.ruleEditorElement))).toBe(true);
    await details(page).getByRole('button', { name: 'Save Rules', exact: true }).click();
    const read = () => page.evaluate(async () => {
        const node = Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === 'pattern-scan');
        const { scanDraft } = await import('/src/workflow/repair.js?v=' + window.canvasHarness.version);
        const text = 'Delve, delve, delve safely, weave, tapestry.';
        return { node, scan: scanDraft({ kind: 'draft', text, source: { originalText: text } }, node) };
    });
    let state = await read();
    expect(state.node.rules).toEqual([{ phrase: 'delve', note: 'Keep this preference', details: { category: 'wording' } }, 'weave', 'tapestry']);
    expect(state.scan.artifact.findings.map(f => [f.text, f.protected])).toEqual([['delve', false], ['weave', true], ['tapestry', false]]);
    expect(state.scan.artifact.caseSensitive).toBe(true);
    expect(state.scan.artifact.exemptions).toEqual(['delve safely']);
    const revisedRules = JSON.parse(await editor.inputValue()); revisedRules[0].phrase = 'Delve';
    await saveRules(page, revisedRules);
    state = await read();
    expect(state.node.rules[0]).toEqual({ phrase: 'Delve', note: 'Keep this preference', details: { category: 'wording' } });
    expect(state.scan.artifact.findings.map(f => f.text)).toEqual(['Delve', 'weave', 'tapestry']);
    const saved = state.node.rules;
    await editor.fill('{"phrase":');
    await details(page).getByRole('button', { name: 'Save Rules', exact: true }).click();
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    await expect(details(page).locator('.pc-diagnostic[data-severity="error"]')).toContainText('Enter valid JSON before saving.');
    expect((await read()).node.rules).toEqual(saved);
    await page.getByLabel('Case sensitive', { exact: true }).uncheck();
    await expect(editor).toHaveValue('{"phrase":');
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    await expect(details(page).locator('.pc-diagnostic[data-severity="error"]')).toContainText('Enter valid JSON before saving.');
    expect((await read()).node.rules).toEqual(saved);
    await saveRules(page, ['ordinary phrase', { phrase: 'delve', note: 'retained' }]);
    await expect(editor).toHaveAttribute('aria-invalid', 'false');
    expect((await read()).node.rules).toEqual(['ordinary phrase', { phrase: 'delve', note: 'retained' }]);
    expect(await page.evaluate(() => document.contains(window.ruleEditorElement))).toBe(true);
});

test('formation request summary follows scan mode and additional reachable repair members', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => {
        const c = window.canvasHarness.context;
        c.extensionSettings.connectionManager = { profiles: [{ id: 'prose', name: 'Prose connection', api: 'openai', model: 'workflow-test-model', preset: null }] };
        c.CONNECT_API_MAP = { openai: { selected: 'openai', source: 'openai' } };
        c.ConnectionManagerRequestService = { getProfile: id => c.extensionSettings.connectionManager.profiles.find(profile => profile.id === id) };
    });
    await installWorkflow(page, 'Reviewed AI De-slop');
    await fixtureRole(page, 'Prose', 'prose');
    await inspectOperation(page, 'repair');
    await chooseControl(page, 'Mode', 'scan');
    await expectBound(page, 0);
    await chooseControl(page, 'Mode', 'repair');
    await page.evaluate(() => {
        const { graph, S, UI } = window.canvasHarness;
        const group = Object.values(graph.groups)[0];
        const byOp = op => Object.values(graph.nodes).find(n => n.operation === op);
        for (const op of ['repair', 'validate-patches', 'apply-reply']) {
            const node = structuredClone(byOp(op)); node.id = op + '-extra'; node.inGroup = group.id;
            graph.nodes[node.id] = node; group.members.push(node.id);
        }
        for (const [i, [from, to]] of [[byOp('reply-snapshot').id, 'repair-extra'], ['repair-extra', 'validate-patches-extra'], ['validate-patches-extra', 'apply-reply-extra']].entries()) {
            const id = 'extra-wire-' + i; graph.wires[id] = {id,route:'wire',from,fromPort:'out',to,toPort:'in'};
        }
        S.touchGraph(graph); window.canvasHarness.canvas.render(); UI.refreshIfOpen();
    });
    await expectBound(page, 2);
});

test('independently bind model nodes in a unified workflow without arming it', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => {
        const c = window.canvasHarness.context;
        c.extensionSettings.connectionManager = { profiles: [{ id: 'analysis', name: 'Analysis connection', api: 'openai', model: 'compact-profile-model', preset: null }, { id: 'planning', name: 'Planning connection', api: 'openai', model: 'plan-profile-model', preset: null }] };
        c.CONNECT_API_MAP = { openai: { selected: 'openai', source: 'openai' } };
        c.ConnectionManagerRequestService.getProfile = id => c.extensionSettings.connectionManager.profiles.find(profile => profile.id === id);
    });
    await expect(page.getByRole('button', { name: 'Setup', exact: true })).toHaveCount(0);
    await openExample(page, 'Keep useful context within a budget');
    const compactDetails = await inspectOperation(page, 'smart-compactor');
    const compactId = await operationId(page, 'smart-compactor');
    const compactBar = page.locator(`.pc-node-profile[data-id="${compactId}"] .profile-bar`);
    await expect(compactBar).toHaveCount(0);
    await chooseControl(page, 'Method', 'compress');
    await expect(compactBar).toContainText('Active');
    await expect(compactDetails.getByLabel('Connection profile', { exact: true })).toHaveCount(0);
    await expect(compactDetails.locator('[data-model-controls] > summary')).toHaveText('Advanced model settings');
    const before = await page.evaluate(() => { const settings = window.canvasHarness.S.settings(); return { enabled: settings.enabled, collection: Object.hasOwn(settings,'graphs') }; });
    expect(before).toEqual({ enabled: false, collection: false });
    const roleBefore = await page.evaluate(() => structuredClone(window.canvasHarness.graph.roles.Analysis));
    await bindNode(page, 'smart-compactor', 'analysis');
    await expect(details(page).getByLabel('Model mode', { exact: true }).locator('option:checked')).toHaveText('Use profile model');
    await bindNode(page, 'response-plan', 'planning');
    await expect(details(page).getByLabel('Model mode', { exact: true }).locator('option:checked')).toHaveText('Use profile model');
    await details(page).getByLabel('Model mode', { exact: true }).selectOption('override');
    await details(page).getByLabel('Model identifier', { exact: true }).fill('independent-plan-model');
    await details(page).getByLabel('Model identifier', { exact: true }).press('Tab');
    expect(await page.evaluate(() => {
        const nodes = Object.values(window.canvasHarness.graph.nodes), compact = nodes.find(node => node.operation === 'smart-compactor'), plan = nodes.find(node => node.operation === 'response-plan');
        return { compact: [compact.profileId, compact.model], plan: [plan.profileId, plan.model] };
    })).toEqual({ compact: ['analysis', null], plan: ['planning', 'independent-plan-model'] });
    expect(await page.evaluate(() => window.canvasHarness.graph.roles.Analysis)).toEqual(roleBefore);
    await expectCurrentDocument(page);
    expect(await page.evaluate(() => Object.hasOwn(window.canvasHarness.S.settings(),'workflowMode'))).toBe(false);
    expect(await page.evaluate(() => window.canvasHarness.S.settings().enabled)).toBe(false);
    await inspectOperation(page, 'smart-compactor');
    await page.getByLabel('Target tokens', { exact: true }).fill('900');
    await page.getByLabel('Target tokens', { exact: true }).press('Tab');
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === 'smart-compactor').targetTokens)).toBe(900);
    await chooseControl(page, 'Method', 'select');
    await expect(compactBar).toHaveCount(0);
    await expectBound(page, 1);
    await chooseControl(page, 'Method', 'compress');
    await expect(compactBar).toContainText('Analysis connection');
    await expectBound(page, 2);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    expect(await page.evaluate(() => window.canvasHarness.S.settings().enabled)).toBe(false);
});



test('unified workflow keeps its AI De-slop primitives and preserves a focused editor', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => {
        const c = window.canvasHarness.context;
        c.extensionSettings.connectionManager = { profiles: [{ id: 'prose', name: 'Prose connection', api: 'openai', model: 'workflow-test-model', preset: null }] };
        c.CONNECT_API_MAP = { openai: { selected: 'openai', source: 'openai' } };
        c.ConnectionManagerRequestService = { getProfile: id => c.extensionSettings.connectionManager.profiles.find(profile => profile.id === id) };
        c.getWorldInfoPrompt = () => { throw new Error('Native UI must not scan lore'); };
    });
    await installWorkflow(page, 'Reviewed AI De-slop');
    const ids = await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes));
    await expect(page.getByRole('group', { name: 'Group: AI De-slop', exact: true })).toBeVisible();
    await bindNode(page, 'repair', 'prose');
    await expectCurrentDocument(page);
    await expectBound(page, 1);
    await openFormation(page);
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes))).toEqual(ids);
    await inspectOperation(page, 'pattern-scan');
    const rules = page.getByLabel('Rules', { exact: true });
    await rules.focus(); await page.evaluate(() => { window.workflowEditorProbe = document.activeElement; });
    await rules.fill(JSON.stringify(['tapestry', 'delve'], null, 2));
    expect(await page.evaluate(() => document.activeElement === window.workflowEditorProbe && document.contains(window.workflowEditorProbe))).toBe(true);
    await details(page).getByRole('button', { name: 'Save Rules', exact: true }).click();
    await inspectOperation(page, 'repair');
    await expect(details(page).getByLabel('Node name', { exact: true })).toHaveValue('Repair');
    await expect(details(page).locator('.pc-detail-identity')).toContainText('Surface · post phase');
    const modelBinding = await openDetailGroup(page, 'Model');
    await expect(modelBinding).toContainText('workflow-test-model');
    await expect(details(page).getByLabel('Model mode', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.canvasHarness.graph.roles.Prose)).toEqual({ profileId: null, model: null });
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === 'repair').profileId)).toBe('prose');
    await details(page).getByLabel('Model mode', { exact: true }).selectOption('override');
    await expect(details(page).getByLabel('Model identifier', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === 'repair').model)).toBeNull();
    await details(page).getByLabel('Model identifier', { exact: true }).fill('node-override-model');
    await details(page).getByLabel('Model identifier', { exact: true }).press('Tab');
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === 'repair').model)).toBe('node-override-model');
    await expect(modelBinding).toContainText('node-override-model');
});


test('examples and model details open without domain scans or provider requests', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(() => {
        window.nativeLoreScans = 0;
        window.canvasHarness.context.getWorldInfoPrompt = async () => { window.nativeLoreScans++; return {}; };
    });
    await openExample(page, 'Keep useful context within a budget');
    await inspectOperation(page, 'response-plan');
    expect(await page.evaluate(() => window.nativeLoreScans)).toBe(0);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    const id = await operationId(page, 'response-plan');
    await expect(page.locator(`.pc-node-profile[data-id="${id}"] .profile-bar`)).toBeVisible();
    await expect(details(page).locator('[data-model-controls] > summary')).toHaveText('Advanced model settings');
});






test('current empty-canvas creation offers compatible operations', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await installWorkflow(page, 'Scene guidance');
    await page.locator('.pc-canvas-host').dblclick({ position: { x: 8, y: 8 } });
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).some(node => node.type === 'prompt'))).toBe(false);
    const search = page.getByRole('dialog', { name: 'Add node', exact: true });
    await expect(search.getByRole('combobox', { name: 'Search nodes and subgraphs', exact: true })).toBeVisible();
    await expect(search.getByRole('option').filter({ hasText: 'Scene Context' })).toBeVisible();
});


async function prepareReviewRoot(page) {
    await page.evaluate(async () => {
        const h = window.canvasHarness, { withNativeBoundary } = await import('/tests/helpers/workflow-fixtures.mjs');
        const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const g = h.graph; delete g.nodes['apply-reply'];
        for (const [id, wire] of Object.entries(g.wires)) if (wire.to === 'apply-reply' || wire.from === 'apply-reply') delete g.wires[id];
        withNativeBoundary(g);
        g.nodes.revision = {...operationDefaults('revise-draft'),id:'revision',type:'workflow',operationVersion:1,phase:'post',profileId:'prose',scope:'whole',instructions:'Replace delve with explore.',x:650,y:500};
        g.wires.draft = {id:'draft',route:'wire',from:'generate-reply',fromPort:'draft',to:'revision',toPort:'draft'};
        g.wires.revision = {id:'revision',route:'wire',from:'revision',fromPort:'out',to:'review-publish',toPort:'draft'};
        h.S.touchGraph(g); h.UI.refreshIfOpen(); await h.settle();
    });
}
async function reviewFixture(page) {
    await page.route('**/scripts/user.js', route => route.fulfill({contentType:'text/javascript',body: "export const getCurrentUserHandle = () => 'workflow-browser-user';"}));
    await page.route('**/script.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        const context = () => globalThis.SillyTavern.getContext();
        export const isGenerating = () => false;
        export function syncMesToSwipe(index) { const m = context().chat[index]; m.swipe_info[m.swipe_id] = { extra: structuredClone(m.extra || {}) }; return true; }
        export function syncSwipeToMes(index, swipeId) { const m = context().chat[index]; m.swipe_id = swipeId; m.mes = m.swipes[swipeId]; Object.assign(m, structuredClone(m.swipe_info[swipeId])); return true; }
    ` }));
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const c = window.canvasHarness.context;
        c.chatId = 'synthetic-workflow-ui';
        c.chat = [{ mes: 'Hello', is_user: true }, { mes: 'We delve.', is_user: false, swipe_id: 0, swipes: ['We delve.'], swipe_info: [{ extra: { preserved: true } }], extra: { preserved: true }, gen_started: 1, gen_finished: 2 }];
        c.extensionSettings.connectionManager = { profiles: [{ id: 'prose', name: 'Prose connection', api: 'openai', model: 'workflow-test-model', preset: null }] };
        c.CONNECT_API_MAP = { openai: { selected: 'openai', source: 'openai' } };
        window.workflowRequests = [];
        c.ConnectionManagerRequestService = {
            getProfile: id => c.extensionSettings.connectionManager.profiles.find(profile => profile.id === id),
            sendRequest: async (...args) => { window.workflowRequests.push(args); return { choices: [{ message: { content: 'We explore.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 10 } }; },
        };
        c.ChatCompletionService = { presetToGeneratePayload: async (_preset, _route, payload) => payload };
        c.setExtensionPrompt = (key, value, position, depth, scan, role) => { c.extensionPrompts[key] = { value, position, depth, scan, role }; };
        c.updateMessageBlock = () => {}; c.swipe = { refresh() {} };
        c.saveChat = async () => { window.workflowSaveAttempts = (window.workflowSaveAttempts || 0) + 1; };
        await (await import('/src/run.js?v=' + window.canvasHarness.version)).initializeNativeWorkflowController();
    });
    await installWorkflow(page, 'Reviewed AI De-slop');
    await fixtureRole(page, 'Prose', 'prose');
    await prepareReviewRoot(page);
    expect(await page.evaluate(() => [window.canvasHarness.graph.schema, window.canvasHarness.graph.runtime])).toEqual([3, 2]);
}
test('a real reviewed run requires Apply and preserves the original swipe', async ({ page }) => {
    await reviewFixture(page);
    await runRoot(page);
    await expectRequests(page, 1, 1);
    await candidateText(page, 'We explore.');
    expect(await page.evaluate(() => window.canvasHarness.context.chat.at(-1).mes)).toBe('We delve.');
    await page.getByRole('button', { name: 'Apply reviewed reply', exact: true }).click();
    await expect(page.getByText('Reply applied locally. Saving is unconfirmed.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.canvasHarness.context.chat.at(-1).swipes)).toEqual(['We delve.', 'We explore.']);
    expect(await page.evaluate(() => window.workflowSaveAttempts)).toBe(1);
    expect(await page.evaluate(() => window.workflowRequests.length)).toBe(1);
});
test('an external reply edit disables Apply and a rejected candidate preserves the original', async ({ page }) => {
    await reviewFixture(page);
    await runRoot(page);
    const apply = page.getByRole('button', { name: 'Apply reviewed reply', exact: true });
    await expect(apply).toBeEnabled();
    await page.evaluate(async () => { const c = window.canvasHarness.context; c.chat.at(-1).mes = 'External edit.'; await c.eventSource.emit(c.eventTypes.MESSAGE_EDITED, c.chat.length - 1); });
    await expect(apply).toBeDisabled();
    await expect(preview(page).locator('.pc-diagnostic > p').filter({ hasText: /no longer available|chat, reply, swipe, or prompt changed/ })).toBeVisible();
    await page.getByRole('button', { name: 'Reject reply', exact: true }).click();
    expect(await page.evaluate(() => window.canvasHarness.context.chat.at(-1).mes)).toBe('External edit.');
    expect(await page.evaluate(() => window.workflowSaveAttempts || 0)).toBe(0);
});


test('switching graph or closing cancels a delayed run and ignores its late result', async ({ page }) => {
    await reviewFixture(page);
    await page.evaluate(() => {
        const c = window.canvasHarness.context;
        c.ConnectionManagerRequestService.sendRequest = (...args) => new Promise(resolve => { window.finishWorkflowRequest = resolve; window.workflowSignal = args[3].signal; });
    });
    await runRoot(page);
    await page.waitForFunction(() => !!window.finishWorkflowRequest);
    await installWorkflow(page, 'Scene guidance');
    expect(await page.evaluate(() => window.workflowSignal.aborted)).toBe(true);
    await page.evaluate(async () => { window.finishWorkflowRequest({ choices: [{ message: { content: '{"patches":[{"index":0,"replacement":"late"}]}' }, finish_reason: 'stop' }] }); await window.canvasHarness.settle(); });
    await expect(page.getByRole('button', { name: 'Apply reviewed reply', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasHarness.context.chat.at(-1).mes)).toBe('We delve.');
    await installWorkflow(page, 'Reviewed AI De-slop');
    await fixtureRole(page, 'Prose', 'prose');
    await prepareReviewRoot(page);
    await page.evaluate(() => { window.finishWorkflowRequest = null; });
    await runRoot(page);
    await page.waitForFunction(() => !!window.finishWorkflowRequest);
    await page.getByRole('button', { name: 'Close canvas', exact: true }).click();
    expect(await page.evaluate(() => window.workflowSignal.aborted)).toBe(true);
    await page.evaluate(async () => { window.finishWorkflowRequest({ choices: [{ message: { content: '{"patches":[{"index":0,"replacement":"late"}]}' }, finish_reason: 'stop' }] }); window.canvasHarness.UI.open(); await window.canvasHarness.settle(); });
    await expect(page.getByRole('button', { name: 'Apply reviewed reply', exact: true })).toHaveCount(0);
});
test('Run to here stays diagnostic and actual Send retains addressed request evidence', async ({ page }) => {
    await reviewFixture(page);
    await inspectOperation(page, 'reply-snapshot');
    await page.locator('.pc-output-preview [data-run-here]').click();
    await expectRequests(page,0,0);
    await expect(page.getByRole('button',{name:'Apply reviewed reply',exact:true})).toHaveCount(0);
    const target = await page.evaluate(async () => {
        const h=window.canvasHarness,r=(await import('/src/run.js?v='+h.version)).getNativeWorkflowController().lastResult();
        return {ok:r.ok,mode:r.mode,calls:r.actualCalls,raw:('calls' in r)||('artifact' in r)||('reports' in r)};
    });
    expect(target).toEqual({ok:true,mode:'target',calls:0,raw:false});
    await runRoot(page); await expectRequests(page,1,1); await candidateText(page,'We explore.');
    const automatic=await page.evaluate(async()=>{const h=window.canvasHarness,r=(await import('/src/run.js?v='+h.version)).getNativeWorkflowController().lastAutomaticResult();return {ok:r.result.ok,calls:r.result.actualCalls,status:r.result.recording.status,phase:r.origin.phase,graphId:r.origin.graphId};});
    expect(automatic).toMatchObject({ok:true,calls:1,status:'completed',phase:'unified'});
    expect(automatic.graphId).toBe(await page.evaluate(()=>window.canvasHarness.graph.id));
    expect(await page.evaluate(()=>window.workflowRequests.length)).toBe(1);
});

test('document replacement expires automatic Send evidence and reopening permits a fresh owned Send', async ({ page }) => {
    await reviewFixture(page); await runRoot(page); await candidateText(page,'We explore.');
    const opened = await page.evaluate(()=>{window.reviewDocument=window.canvasHarness.graph;return window.reviewDocument.id;});
    await installWorkflow(page,'Scene guidance');
    await expect(page.getByRole('button',{name:'Apply reviewed reply',exact:true})).toHaveCount(0);
    await page.evaluate(async()=>window.canvasHarness.activate(window.reviewDocument));
    await selectTerminal(page,'review-publish',false);
    await expect(preview(page)).not.toContainText('We explore.');
    await expect(page.getByRole('button',{name:'Apply reviewed reply',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Close canvas',exact:true}).click();
    await page.evaluate(async()=>{const h=window.canvasHarness,c=h.context;window.previousAutomaticRunId=(await import('/src/run.js?v='+h.version)).getNativeWorkflowController().lastAutomaticResult()?.result.runId;if(!c.chat.at(-1)?.is_user)c.chat.push({mes:'Continue.',is_user:true,extra:{}});await c.eventSource.emit(c.eventTypes.GENERATION_STARTED,'normal',{},false);const ready=await window.latticeGenerationInterceptor(c.chat,8192,()=>{},'normal');if(!ready.ok||!ready.awaitingNative)throw Error(JSON.stringify(ready));const now=new Date().toISOString(),index=c.chat.length;c.chat.push({mes:'We delve.',is_user:false,swipe_id:0,swipes:['We delve.'],swipe_info:[{extra:{},gen_started:now,gen_finished:now}],extra:{},gen_started:now,gen_finished:now});await c.eventSource.emit(c.eventTypes.MESSAGE_RECEIVED,index,'normal');await c.eventSource.emit(c.eventTypes.GENERATION_ENDED,c.chat.length);});
    await expect(page.locator('.pc-root')).not.toHaveClass(/pc-open/);
    await page.waitForFunction(async()=>{const h=window.canvasHarness,r=(await import('/src/run.js?v='+h.version)).getNativeWorkflowController().lastAutomaticResult();return r?.result.ok&&r.result.runId!==window.previousAutomaticRunId&&r.origin.graphId===h.S.activeWorkflow().id;});
    await page.evaluate(async()=>{window.canvasHarness.UI.open();await window.canvasHarness.settle();});
    await selectTerminal(page,'review-publish',false); await candidateText(page,'We explore.');
    expect(await page.evaluate(async()=>(await import('/src/run.js?v='+window.canvasHarness.version)).getNativeWorkflowController().lastAutomaticResult().origin.graphId)).toBe(opened);
    expect(await page.evaluate(()=>window.workflowRequests.length)).toBe(2);
    expect(await page.evaluate(async()=>{
        const h=window.canvasHarness,controller=(await import('/src/run.js?v='+h.version)).getNativeWorkflowController(),automatic=controller.lastAutomaticResult();
        return automatic.origin.documentToken===h.S.documentSession.capture() && controller.candidateStatus(automatic.result.reviewHandles[0]).ok;
    })).toBe(true);
});

test('Send indicator follows the enabled open unified document', async ({ page }) => {
    await reviewFixture(page);
    await page.evaluate(()=>{const h=window.canvasHarness;h.graph.name='Open reviewed workflow';h.S.settings().enabled=true;h.S.touchGraph(h.graph);document.dispatchEvent(new CustomEvent('pc-state'));});
    const indicator=page.locator('#pc-sendbar');await expect(indicator).toHaveClass(/pc-sendbar-on/);
    await expect(indicator).toHaveAttribute('title',/Open reviewed workflow.*unified workflow/);
    await expect(indicator).toHaveAttribute('title',/1 auxiliary requests/);
    await indicator.dispatchEvent('contextmenu');await indicator.dispatchEvent('contextmenu');
    expect(await page.evaluate(()=>window.canvasHarness.toasts.at(-1).message)).toMatch(/Open reviewed workflow.*unified/);
    await page.evaluate(()=>{const h=window.canvasHarness;h.S.settings().enabled=false;h.S.save();document.dispatchEvent(new CustomEvent('pc-state'));});
    await expect(indicator).not.toHaveClass(/pc-sendbar-on/);
    expect(await page.evaluate(()=>Object.hasOwn(window.canvasHarness.S.settings(),'nativeBindings'))).toBe(false);
});

test('review controls and comparison stay usable in a narrow viewport', async ({ page }) => {
    await reviewFixture(page);
    await page.setViewportSize({ width: 760, height: 900 });
    await runRoot(page);
    await expect((await artifact(page, 'candidate')).locator('pre')).toContainText('We delve.');
    await candidateText(page, 'We explore.');
    await expect(page.getByRole('button', { name: 'Apply reviewed reply', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Reject reply', exact: true }).click();
    await expect(page.getByText('Proposed reply rejected. Original reply preserved.', { exact: true })).toBeVisible();
});



test('named wire inspection describes artifact flow', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await installWorkflow(page, 'Scene guidance');
    const before = await page.evaluate(() => {
        const h = window.canvasHarness;
        return { wire: Object.values(h.graph.wires)[0], nodes: structuredClone(h.graph.nodes), roles: structuredClone(h.graph.roles), wireIds: Object.keys(h.graph.wires) };
    });
    const pin = page.locator(`.pc-node-native[data-id="${before.wire.from}"] .pc-port[data-dir="out"][data-port="out"]`);
    await pin.click({ button: 'right' });
    const menu = page.getByRole('dialog', { name: 'Pin actions', exact: true });
    await expect(menu.locator('.pc-kind')).toHaveText('context');
    await expect(menu.getByRole('button', { name: 'Go to Smart Compactor · Input', exact: true })).toBeVisible();
    await expect(page.getByText('How it joins', { exact: true })).toHaveCount(0);
    const cut = menu.getByRole('button', { name: 'Break link · ' + before.wire.id, exact: true });
    await expect(cut).toBeVisible(); await cut.click();
    const remaining = () => page.evaluate(() => ({ nodes: window.canvasHarness.graph.nodes, roles: window.canvasHarness.graph.roles, wireIds: Object.keys(window.canvasHarness.graph.wires) }));
    await expect.poll(async () => (await remaining()).wireIds).toEqual(before.wireIds.filter(id => id !== before.wire.id));
    expect((await remaining()).nodes).toEqual(before.nodes); expect((await remaining()).roles).toEqual(before.roles);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await remaining()).wireIds).toEqual(before.wireIds);
    // Use the existing public selection fixture, then the real graph keyboard
    // control. Native wire deletion must not delete either endpoint node.
    await page.evaluate(id => window.canvasHarness.canvas.select({ kind: 'wire', id }), before.wire.id);
    await page.getByLabel('Node canvas', { exact: true }).focus(); await page.keyboard.press('Delete');
    await expect.poll(async () => (await remaining()).wireIds).toEqual(before.wireIds.filter(id => id !== before.wire.id));
    expect((await remaining()).nodes).toEqual(before.nodes); expect((await remaining()).roles).toEqual(before.roles);
    await expect(page.getByText('How it joins', { exact: true })).toHaveCount(0);
});


test('the native canvas provides a keyboard-accessible duplicate action', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await installWorkflow(page, 'Scene guidance');
    await inspectOperation(page, 'response-plan');
    await page.getByLabel('Node canvas', { exact: true }).focus();
    await page.keyboard.press('Control+d');
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).filter(node => node.operation === 'response-plan').length)).toBe(2);
});


test('native camera pan and zoom preserve the focused editor without domain work', async ({ page }) => {
    await reviewFixture(page);
    await runRoot(page);
    await expect(page.getByRole('button', { name: 'Apply reviewed reply', exact: true })).toBeVisible();
    await inspectOperation(page, 'repair');
    await page.getByLabel('Instructions', { exact: true }).focus();
    const measured = await page.evaluate(async () => {
        const { context: c, canvas, settle } = window.canvasHarness;
        const controller = (await import('/src/run.js?v=' + window.canvasHarness.version)).getNativeWorkflowController();
        const editor = document.activeElement, node = canvas.nodeLayer.querySelector('.pc-node-native'), requests = window.workflowRequests.length;
        let drawAdmissions = 0, bindings = 0, freshness = 0, tokens = 0, lore = 0;
        const setGraph = canvas.setGraph.bind(canvas), getProfile = c.ConnectionManagerRequestService.getProfile, candidateStatus = controller.candidateStatus, count = c.getTokenCountAsync;
        canvas.setGraph = (...args) => { drawAdmissions++; return setGraph(...args); };
        c.ConnectionManagerRequestService.getProfile = (...args) => { bindings++; return getProfile(...args); };
        controller.candidateStatus = (...args) => { freshness++; return candidateStatus(...args); };
        c.getTokenCountAsync = (...args) => { tokens++; return count(...args); };
        c.getWorldInfoPrompt = async () => { lore++; return {}; };
        const rect = canvas.host.getBoundingClientRect(), point = { clientX: rect.left + 150, clientY: rect.top + 150 };
        for (let i = 0; i < 30; i++) canvas.host.dispatchEvent(new WheelEvent('wheel', { ...point, deltaY: -1, cancelable: true }));
        await settle(); await new Promise(resolve => setTimeout(resolve, 200));
        canvas.host.dispatchEvent(new MouseEvent('mousedown', { ...point, button: 1, bubbles: true, cancelable: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: point.clientX + 30, clientY: point.clientY + 20, buttons: 4 }));
        window.dispatchEvent(new MouseEvent('mouseup', { clientX: point.clientX + 30, clientY: point.clientY + 20, button: 1 }));
        await settle();
        return { drawAdmissions, bindings, freshness, tokens, lore, requests: window.workflowRequests.length - requests, sameEditor: editor === document.activeElement && document.contains(editor), sameNode: node === canvas.nodeLayer.querySelector('.pc-node-native') };
    });
    expect(measured).toEqual({ drawAdmissions: 0, bindings: 0, freshness: 0, tokens: 0, lore: 0, requests: 0, sameEditor: true, sameNode: true });
    expect(await page.evaluate(async () => { const controller = (await import('/src/run.js?v=' + window.canvasHarness.version)).getNativeWorkflowController(); return controller.candidateStatus(controller.lastResult().reviewHandles[0]).ok; })).toBe(true);
    const title = await page.locator('.pc-node-title').filter({ hasText: /^Reply Snapshot$/ }).boundingBox();
    await page.mouse.move(title.x + 20, title.y + 8); await page.mouse.down();
    await page.mouse.move(title.x + 60, title.y + 28, { steps: 4 }); await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Apply reviewed reply', exact: true })).toBeEnabled();
    expect(await page.evaluate(async () => { const controller = (await import('/src/run.js?v=' + window.canvasHarness.version)).getNativeWorkflowController(); return controller.candidateStatus(controller.lastResult().reviewHandles[0]).ok; })).toBe(true);
    await inspectOperation(page, 'repair');
    await page.getByLabel('Instructions', { exact: true }).fill('A semantic operation edit.');
    await page.getByLabel('Instructions', { exact: true }).press('Tab');
    await expect(page.getByRole('button', { name: 'Apply reviewed reply', exact: true })).toHaveCount(0);
});

test('native presentation undo preserves reviewed authority while semantic undo and redo revoke it', async ({ page }) => {
    await reviewFixture(page);
    await page.evaluate(() => { const h = window.canvasHarness; h.H.flush(h.graph); });
    await runRoot(page);
    const apply = page.getByRole('button', { name: 'Apply reviewed reply', exact: true });
    await expect(apply).toBeEnabled();
    await page.evaluate(async () => {
        const h = window.canvasHarness, runtime = (await import('/src/run.js?v=' + window.canvasHarness.version)).getNativeWorkflowController();
        window.historyReviewedCandidate = runtime.lastResult().reviewHandles[0];
        const node = Object.values(h.graph.nodes).find(n => n.operation === 'repair');
        node.presentation = { alias: 'Presentation alias', compact: true }; node.x += 25;
        h.S.touchGraph(h.graph); h.H.flush(h.graph); h.UI.refreshIfOpen();
    });
    await canvasHistory(page, 'Control+z'); await expect(apply).toBeEnabled();
    expect(await page.evaluate(async () => (await import('/src/run.js?v=' + window.canvasHarness.version)).getNativeWorkflowController().candidateStatus(window.historyReviewedCandidate).ok)).toBe(true);
    await canvasHistory(page, 'Control+Shift+z'); await expect(apply).toBeEnabled();
    expect(await page.evaluate(async () => (await import('/src/run.js?v=' + window.canvasHarness.version)).getNativeWorkflowController().candidateStatus(window.historyReviewedCandidate).ok)).toBe(true);
    await page.evaluate(() => {
        const h = window.canvasHarness, node = Object.values(h.graph.nodes).find(n => n.operation === 'repair');
        node.instructions = 'Semantic history edit'; h.S.touchGraph(h.graph); h.H.flush(h.graph); h.UI.refreshIfOpen();
    });
    await expect(apply).toHaveCount(0);
    await canvasHistory(page, 'Control+z'); await expect(apply).toHaveCount(0);
    expect(await page.evaluate(async () => (await import('/src/run.js?v=' + window.canvasHarness.version)).getNativeWorkflowController().candidateStatus(window.historyReviewedCandidate).ok)).toBe(false);
    await canvasHistory(page, 'Control+Shift+z'); await expect(apply).toHaveCount(0);
    expect(await page.evaluate(() => window.workflowRequests.length)).toBe(1);
    expect(await page.evaluate(() => window.workflowSaveAttempts || 0)).toBe(0);
    expect(await page.evaluate(() => window.canvasHarness.context.chat.at(-1).mes)).toBe('We delve.');
});

test('accepted semantic additive import cancels a root request and history cannot resurrect its late authority', async ({ page }) => {
    await reviewFixture(page);
    await page.evaluate(() => {
        const h = window.canvasHarness; h.H.flush(h.graph);
        h.context.ConnectionManagerRequestService.sendRequest = (...args) => new Promise(resolve => { window.importPendingRequest = resolve; window.importRequestSignal = args[3].signal; });
    });
    await runRoot(page);
    await page.waitForFunction(() => !!window.importPendingRequest);
    const before = await page.evaluate(async () => { const h = window.canvasHarness, { graphSemanticSignature } = await import('/src/workflow/ports.js?v=' + h.version); return { nodes: Object.keys(h.graph.nodes).length, chat: structuredClone(h.context.chat), signature: graphSemanticSignature(h.graph) }; });
    const imported = await page.evaluate(async () => { const h = window.canvasHarness, { exportWorkflow } = await import('/src/workflow/packages.js?v=' + h.version), { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version), graph = h.S.blankGraph('Imported snapshot'); graph.nodes.snapshot = { ...operationDefaults('reply-snapshot'), id: 'snapshot', type: 'workflow', operationVersion: 1, x: 0, y: 0 }; return exportWorkflow(graph); });
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Import into graph…', exact: true }).click();
    await (await chooser).setFiles({ name: 'post-fragment.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    const review = page.getByRole('dialog', { name: 'Import into graph' });
    await expect(review).toBeVisible();
    expect(await page.evaluate(() => window.importRequestSignal.aborted)).toBe(false);
    await review.getByRole('button', { name: 'Insert into graph', exact: true }).click();
    expect(await page.evaluate(() => window.importRequestSignal.aborted)).toBe(true);
    expect(await page.evaluate(async () => (await import('/src/workflow/ports.js?v=' + window.canvasHarness.version)).graphSemanticSignature(window.canvasHarness.graph))).not.toBe(before.signature);
    await page.evaluate(async () => { window.importPendingRequest({ choices: [{ message: { content: '{"patches":[{"index":0,"replacement":"late"}]}' }, finish_reason: 'stop' }] }); await window.canvasHarness.settle(); });
    const apply = page.getByRole('button', { name: 'Apply reviewed reply', exact: true });
    await expect(apply).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes).length)).toBe(before.nodes + 1);
    await canvasHistory(page, 'Control+z'); await expect(apply).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes).length)).toBe(before.nodes);
    await canvasHistory(page, 'Control+Shift+z'); await expect(apply).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasHarness.context.chat)).toEqual(before.chat);
    expect(await page.evaluate(() => window.workflowSaveAttempts || 0)).toBe(0);
});




test('an imported native graph with omitted role records can bind its model node', async ({ page }) => {
    await reviewFixture(page);
    const imported = await page.evaluate(async () => {
        const h = window.canvasHarness, envelope = JSON.parse(h.S.exportGraph(h.graph));
        delete envelope.graph.roles;
        const result = h.S.importGraph(JSON.stringify(envelope));await h.activate(result.graph);return result.graph.id;
    });
    expect(imported).toBeTruthy();
    await bindNode(page, 'repair', 'prose');
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === 'repair').profileId)).toBe('prose');
    expect(await page.evaluate(() => window.canvasHarness.graph.roles?.Prose?.profileId)).toBeUndefined();
});


test('narrow workflow inspection and review remain opaque during selection feedback', async ({ page }) => {
    await reviewFixture(page);
    await page.setViewportSize({ width: 760, height: 1000 });
    for (const theme of ['obsidian', 'ash']) {
        await page.evaluate(async theme => (await import('/src/theme.js?v=' + window.canvasHarness.version)).setPreset(theme), theme);
        await inspectOperation(page, 'pattern-scan');
        const opacity = await page.locator('.pc-inspector').evaluate(inspector => {
            const animations = inspector.getAnimations();
            const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
            canvas.width = canvas.height = 1;
            return [0, 200, 399].map(time => {
                for (const animation of animations) { animation.pause(); animation.currentTime = time; }
                context.clearRect(0, 0, 1, 1);
                context.fillStyle = getComputedStyle(inspector).backgroundColor;
                context.fillRect(0, 0, 1, 1);
                return context.getImageData(0, 0, 1, 1).data[3];
            });
        });
        expect(opacity, theme + ' must hide graph content throughout inspection feedback').toEqual([255, 255, 255]);
        const editor = page.getByLabel('Rules', { exact: true });
        await editor.focus(); await page.evaluate(() => { window.narrowWorkflowEditor = document.activeElement; });
        await editor.fill(JSON.stringify(['delve'], null, 2));
        expect(await page.evaluate(() => document.activeElement === window.narrowWorkflowEditor && document.contains(window.narrowWorkflowEditor))).toBe(true);
    }
    await details(page).getByRole('button', { name: 'Save Rules', exact: true }).click();
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === 'pattern-scan').rules)).toEqual(['delve']);
    await runRoot(page);
    await expect(page.getByRole('button', { name: 'Apply reviewed reply', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('narrow toolbar exposes readable labeled pane and theme controls', async ({ page }) => {
    await reviewFixture(page);
    await page.setViewportSize({ width: 760, height: 1000 });
    for (const theme of ['obsidian', 'ash']) {
        await page.evaluate(async theme => (await import('/src/theme.js?v=' + window.canvasHarness.version)).setPreset(theme), theme);
        await expect(page.locator('.pc-details-heading').getByRole('button', { name: 'Subgraphs', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Toggle inspector', exact: true }).getByText('Details', { exact: true })).toBeVisible();
        await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'View', exact: true }).click();
        await expect(page.getByRole('menuitem', { name: 'Theme and colours…', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const subgraphs = page.locator('.pc-family-row[data-family="Subgraphs"]');
    await subgraphs.focus(); await page.keyboard.press('Enter');
    const shelf = page.getByRole('menu', { name: 'Subgraphs nodes', exact: true });
    await expect(shelf.locator('[data-shelf-group="Interface"]')).toBeVisible();
    await expect(shelf.locator('[data-shelf-choice="boundary:input"]')).toBeDisabled();
    await expect(shelf.locator('[data-shelf-choice="boundary:output"]')).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Manage subgraphs', exact: true })).toHaveCount(0);
    await expect(shelf.getByRole('menuitem', { name: /Manage subgraphs/i })).toHaveCount(0);
    await page.keyboard.press('Escape');
    const detailsToggle = page.getByRole('button', { name: 'Toggle inspector', exact: true }), previous = await detailsToggle.getAttribute('aria-pressed');
    await detailsToggle.focus(); await page.keyboard.press('Enter');
    await expect(detailsToggle).toHaveAttribute('aria-pressed', previous === 'true' ? 'false' : 'true');
});
