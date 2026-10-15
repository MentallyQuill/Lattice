import { test, expect } from '@playwright/test';

const elaraReply = 'First.\r\n\r\nElara arrives. Elara waits.\r\n\r\nMiddle.\r\n\r\nElara leaves with Elara.\r\n\r\nLast.';
const filteredElara = 'First.\r\n\r\nMiddle.\r\n\r\nLast.';
const details = page => page.getByRole('region', { name: 'Node details', exact: true });
const preview = page => page.locator('.pc-output-preview');

// Host-only doubles mirror the public browser adapter fixture. The controller,
// authoring transactions, source checks, Pattern, Branch, Filter and Join are real.
async function openLesson(page) {
    await page.addInitScript(() => {
        window.workflowCopies = [];
        window.workflowEffects = { captures: 0, workers: 0, commits: 0 };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(text) { window.workflowCopies.push(text); } } });
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker { constructor(...args) { super(...args); window.workflowEffects.workers++; } };
    });
    await page.route('**/scripts/user.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const getCurrentUserHandle = () => 'readable-workflow-browser';" }));
    await page.route('**/script.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        const context = () => globalThis.SillyTavern.getContext();
        export const isGenerating = () => false;
        export function syncMesToSwipe(index) { const m = context().chat[index]; m.swipe_info[m.swipe_id] = { extra: structuredClone(m.extra || {}) }; return true; }
        export function syncSwipeToMes(index, swipeId) { const m = context().chat[index]; m.swipe_id = swipeId; m.mes = m.swipes[swipeId]; Object.assign(m, structuredClone(m.swipe_info[swipeId])); return true; }
    ` }));
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { patternFilterLesson } = await import('/tools/remastered/pattern-filter.mjs');
        const { parseWorkflow } = await import('/src/workflow/packages.js?v=' + h.version);
        const parsed = parseWorkflow(JSON.stringify(patternFilterLesson()));
        if (!parsed.ok) throw Error(JSON.stringify(parsed.error));
        parsed.data.nodes.pattern.rules = [];
        const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        parsed.data.nodes['captured-context'] = { ...operationDefaults('scene-context'), id: 'captured-context', type: 'workflow', operation: 'scene-context', enabled: true, includeCharacter: false, x: 80, y: 750 };
        h.context.chatId = 'readable-workflow-browser';
        h.context.chat = [{ mes: '**Earlier user**', is_user: true, extra: {} }, { mes: 'Earlier assistant.', is_user: false, extra: {} }, { mes: 'Continue.', is_user: true, extra: {} }];
        const capture = h.context.getCharacterCardFields;
        h.context.getCharacterCardFields = (...args) => { window.workflowEffects.captures++; return capture(...args); };
        h.context.setExtensionPrompt = (key, value) => { h.context.extensionPrompts[key] = { value }; };
        h.context.updateMessageBlock = () => {};
        h.context.swipe = { refresh() {} };
        h.context.saveChat = async () => { window.workflowEffects.commits++; };
        await (await import('/src/run.js?v=' + h.version)).initializeNativeWorkflowController();
        await h.activate(parsed.data);
    });
}

async function select(page, id) {
    await page.evaluate(async id => {
        const h = window.canvasHarness, node = h.graph.nodes[id];
        h.canvas.select({ kind: 'node', id });
        await h.view({ x: 100 - node.x * .6, y: 0, zoom: .6 });
        await h.settle();
    }, id);
}

async function authorTerms(page, text) {
    await select(page, 'pattern');
    const panel = details(page);
    const terms = panel.getByRole('button', { name: 'Use Rules terms', exact: true });
    if (await terms.count()) await terms.click();
    await panel.getByLabel('Rules', { exact: true }).fill(text);
    await expect(panel.locator('[data-control-items]').first()).toContainText(text === 'Elara' ? '1 entries' : '3 entries');
    await panel.getByRole('button', { name: 'Save Rules', exact: true }).click();
    const rules = await page.evaluate(() => window.canvasHarness.graph.nodes.pattern.rules);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    return rules;
}

async function generateReply(page, text) {
    await page.evaluate(async text => {
        const h = window.canvasHarness, c = h.context;
        h.S.settings().enabled = true; h.S.save(); h.UI.refreshIfOpen();
        await c.eventSource.emit(c.eventTypes.GENERATION_STARTED, 'normal', {}, false);
        const ready = await window.latticeGenerationInterceptor(c.chat, 8192, () => {}, 'normal');
        if (!ready.ok || !ready.awaitingNative) throw Error(JSON.stringify(ready));
        const now = new Date().toISOString(), index = c.chat.length;
        c.chat.push({ mes: text, is_user: false, swipe_id: 0, swipes: [text], swipe_info: [{ extra: { preserved: true }, gen_started: now, gen_finished: now }], extra: { preserved: true }, gen_started: now, gen_finished: now });
        await c.eventSource.emit(c.eventTypes.MESSAGE_RECEIVED, index, 'normal');
        await c.eventSource.emit(c.eventTypes.GENERATION_ENDED, c.chat.length);
    }, text);
    await page.waitForFunction(async () => {
        const h = window.canvasHarness, c = (await import('/src/run.js?v=' + h.version)).getNativeWorkflowController();
        return !!c.lastAutomaticResult() && !c.activity();
    });
    return inspectRun(page);
}

async function inspectRun(page) {
    return page.evaluate(async () => {
        const h = window.canvasHarness, controller = (await import('/src/run.js?v=' + h.version)).getNativeWorkflowController();
        const result = controller.lastAutomaticResult()?.result ?? controller.lastResult();
        const { expandRecordAddress } = await import('/src/workflow/record-data.js?v=' + h.version);
        const unit = id => result.recording.units.find(row => expandRecordAddress(result.recording, row.address)?.nodeId === id);
        const artifact = (id, port = 'out') => {
            const pin = unit(id)?.ports.find(pin => pin.direction === 'output' && result.recording.identities.strings[pin.port] === port);
            return pin?.artifact == null ? null : result.recording.artifacts[pin.artifact].value;
        };
        return { latestRunId: controller.lastResult()?.runId, latestRecording: JSON.stringify(controller.lastResult()?.recording), busy: !!controller.activity(), prompts: JSON.stringify(h.context.extensionPrompts), ok: result.ok, error: result.error, runId: result.runId, recording: JSON.stringify(result.recording), actualCalls: result.actualCalls,
            completedUnits: result.recording.units.filter(row => row.status === 'completed').map(row => expandRecordAddress(result.recording, row.address)?.nodeId),
            units: Object.fromEntries(['pattern', 'branch', 'filter', 'join', 'review'].map(id => [id, unit(id)])),
            pattern: artifact('pattern', 'matches'), filter: artifact('filter', 'report'), draft: artifact('join'),
            reviews: result.reviewHandles?.length ?? 0, fresh: result.reviewHandles?.map(handle => controller.candidateStatus(handle).ok) ?? [],
            chat: JSON.stringify(h.context.chat), graph: JSON.stringify(h.graph), effects: { ...window.workflowEffects }, providerCalls: h.providerCalls() };
    });
}

async function openReview(page) {
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'Workflow', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Review host result', exact: true }).click();
    await expect(preview(page).getByRole('button', { name: 'Apply reviewed reply', exact: true })).toBeEnabled();
}

async function pinPort(page, id, label) {
    await select(page, id);
    await page.locator(`.pc-node[data-id="${id}"] .pc-native-heading`).dispatchEvent('contextmenu', { clientX: 100, clientY: 400 });
    await page.locator('.pc-context-menu[role="menu"]').first().getByRole('menuitem', { name: 'Pin preview', exact: true }).press('ArrowRight');
    await page.getByRole('menuitemcheckbox', { name: label, exact: true }).click();
}

test('Pattern placement accepts a later plain Elara term in Details with separate placement and settings Undo', async ({ page }) => {
    await openLesson(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness, graph = structuredClone(h.graph);
        graph.nodes = {}; graph.wires = {}; await h.activate(graph);
    });
    await page.locator('.pc-canvas-host').dblclick({ position: { x: 180, y: 120 } });
    await page.getByRole('combobox', { name: 'Search nodes and subgraphs', exact: true }).fill('Pattern');
    await page.locator('[data-choice="operation:pattern"]').click();
    await expect(page.getByRole('dialog', { name: 'Configure node', exact: true })).toHaveCount(0);
    const placed = await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes));
    expect(placed).toHaveLength(1); expect(placed[0].operation).toBe('pattern');
    await select(page, placed[0].id);
    const panel = details(page);
    await panel.getByRole('button', { name: 'Use Rules terms', exact: true }).click();
    await panel.getByLabel('Rules', { exact: true }).fill('Elara');
    await expect(panel.locator('[data-control-item]')).toHaveText(['Elara']);
    expect(await page.evaluate(id => window.canvasHarness.graph.nodes[id].rules, placed[0].id)).toEqual(placed[0].rules);
    await panel.getByRole('button', { name: 'Save Rules', exact: true }).click();
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).map(node => node.rules))).toEqual([[{ id: 'pattern-1', pattern: 'Elara' }]]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await page.evaluate(id => window.canvasHarness.graph.nodes[id].rules, placed[0].id)).toEqual(placed[0].rules);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes))).toEqual([]);
    expect(await page.evaluate(() => ({ calls: window.canvasHarness.providerCalls(), effects: window.workflowEffects }))).toEqual({ calls: 0, effects: { captures: 0, workers: 0, commits: 0 } });
});

test('plain Elara editing removes each repeated-hit paragraph once and reviews the joined Draft', async ({ page }) => {
    await openLesson(page);
    expect(await authorTerms(page, 'Elara')).toEqual([{ id: 'pattern-1', pattern: 'Elara' }]);
    // Re-entering plain text must retain the authored rule identity.
    expect(await authorTerms(page, 'Elara')).toEqual([{ id: 'pattern-1', pattern: 'Elara' }]);
    const run = await generateReply(page, elaraReply);
    expect(run.ok, JSON.stringify(run.error)).toBe(true);
    expect(run.pattern.value.rules.map(rule => rule.count)).toEqual([4]);
    expect(run.pattern.value.totalOccurrences).toBe(4);
    expect(run.completedUnits.filter(id => id === 'branch')).toHaveLength(1); expect(run.completedUnits.filter(id => id === 'filter')).toHaveLength(1);
    expect(run.filter.value.units).toHaveLength(2);
    expect(run.filter.value.units.map(unit => unit.text)).toEqual(['Elara arrives. Elara waits.\r\n\r\n', 'Elara leaves with Elara.\r\n\r\n']);
    expect(run.draft.text).toBe(filteredElara); expect(run.draft.text).not.toContain('Elara');
    expect(run.actualCalls).toBe(0); expect(run.providerCalls).toBe(0);
    expect(run.effects.workers).toBe(0); expect(run.effects.commits).toBe(0);
    expect(run.reviews).toBe(1); expect(run.fresh).toEqual([true]);
    await openReview(page);
    await expect(preview(page).locator('.pc-readable-prose').first()).toContainText('Middle.');
    await preview(page).getByRole('button', { name: 'Apply reviewed reply', exact: true }).click();
    expect(await page.evaluate(() => ({ text: window.canvasHarness.context.chat.at(-1).mes, swipes: window.canvasHarness.context.chat.at(-1).swipes, effects: window.workflowEffects, calls: window.canvasHarness.providerCalls() }))).toMatchObject({ text: filteredElara, swipes: [elaraReply, filteredElara], effects: { commits: 1, workers: 0 }, calls: 0 });
});

for (const entry of ['1, 2, 3', '["1", "2", "3"]']) test(`${entry} authors equivalent string rules and routes fourteen hits once with faithful previews`, async ({ page }) => {
    await openLesson(page);
    expect(await authorTerms(page, entry)).toEqual([{ id: 'pattern-1', pattern: '1' }, { id: 'pattern-2', pattern: '2' }, { id: 'pattern-3', pattern: '3' }]);
    const text = 'First.\n\n' + '1 '.repeat(12) + '3 3\n\nLast.';
    const run = await generateReply(page, text);
    expect(run.ok, JSON.stringify(run.error)).toBe(true);
    const ruleCounts = run.pattern.value.rules.map(rule => rule.count), totalOccurrences = run.pattern.value.totalOccurrences;
    const filterExecutionCount = run.completedUnits.filter(id => id === 'filter').length, filteredDraftText = run.draft.text;
    expect(ruleCounts).toEqual([12, 0, 2]); expect(totalOccurrences).toBe(14); expect(filterExecutionCount).toBe(1);
    expect(run.completedUnits.filter(id => id === 'branch')).toHaveLength(1); expect(filteredDraftText).toBe('First.\n\nLast.');
    expect(filteredDraftText).not.toContain('Elara'); expect(run.reviews).toBe(1); expect(run.fresh).toEqual([true]);
    expect(run.actualCalls).toBe(0); expect(run.providerCalls).toBe(0); expect(run.effects.workers).toBe(0);
    await openReview(page);
    await select(page, 'join');
    const leaf = preview(page), before = await inspectRun(page);
    await leaf.getByRole('button', { name: 'Source preview', exact: true }).click();
    const source = await leaf.locator('[data-preview-source]').textContent(), envelope = JSON.parse(source);
    expect(envelope.kind).toBe('draft'); expect(envelope.text).toBe(filteredDraftText);
    expect(envelope.lineage).toHaveLength(1);
    expect(envelope.source).toBeTruthy(); expect(envelope.source.token).toBeUndefined(); expect(envelope.source.originalText).toBeUndefined();
    await leaf.getByRole('button', { name: 'Copy source', exact: true }).click();
    expect(await page.evaluate(() => window.workflowCopies)).toEqual([source]);
    await leaf.getByRole('button', { name: 'Readable preview', exact: true }).click();
    await leaf.getByRole('button', { name: 'Pin preview', exact: true }).click();
    await select(page, 'branch');
    await leaf.getByRole('button', { name: 'Pin preview', exact: true }).click();
    await pinPort(page, 'pattern', 'Matches');
    expect(await leaf.locator('[data-preview-pattern-rule] td:last-child').allTextContents()).toEqual(['12', '0', '2']);
    await leaf.getByText('Occurrences · 14 displayed', { exact: true }).click();
    await expect(leaf.locator('[data-preview-occurrence]')).toHaveCount(14);
    await leaf.getByRole('button', { name: 'Source preview', exact: true }).click();
    expect(JSON.parse(await leaf.locator('[data-preview-source]').textContent()).value.recordType).toBe('pattern-matches');
    expect(await inspectRun(page)).toEqual(before);
});

for (const scenario of [
    { name: 'no-hit bypass', text: 'First.\n\nLast.', reason: null },
    { name: 'protected paragraph', text: elaraReply, reason: 'FILTER_PERMISSION_BLOCKED', protectedLiterals: ['Elara'] },
    { name: 'empty story body', text: 'Elara Elara', reason: 'EMPTY_FILTER_RESULT' },
]) test(`${scenario.name} preserves the native source and holds publication when required`, async ({ page }) => {
    await openLesson(page); await authorTerms(page, 'Elara');
    if (scenario.protectedLiterals) await page.evaluate(async protectedLiterals => {
        const h = window.canvasHarness, graph = structuredClone(h.graph); graph.nodes.pattern.protectedLiterals = protectedLiterals; await h.activate(graph);
    }, scenario.protectedLiterals);
    const run = await generateReply(page, scenario.text);
    expect(run.completedUnits.filter(id => id === 'branch')).toHaveLength(1); expect(run.units.filter.status).toBe(scenario.reason ? 'unresolved' : 'skipped');
    expect(run.actualCalls).toBe(0); expect(run.providerCalls).toBe(0); expect(run.effects.workers).toBe(0); expect(run.effects.commits).toBe(0);
    expect(await page.evaluate(() => window.canvasHarness.context.chat.at(-1).mes)).toBe(scenario.text);
    if (!scenario.reason) {
        expect(run.ok).toBe(true); expect(run.units.filter.status).toBe('skipped'); expect(run.draft.text).toBe(scenario.text);
        expect(run.pattern.value.totalOccurrences).toBe(0); expect(run.reviews).toBe(1); await openReview(page);
    } else {
        expect(run.ok).toBe(false); expect(run.error.code).toBe('UNRESOLVED_INPUT'); expect(run.reviews).toBe(0);
        expect(run.draft).toBeNull(); expect(run.units.join.status).toBe('unresolved'); expect(run.units.review.status).toBe('unresolved');
        expect(run.units.filter.ports.find(port => port.direction === 'output' && port.state.status === 'unresolved').state.reason.code).toBe(scenario.reason);
        await pinPort(page, 'filter', 'Report');
        await expect(preview(page)).toContainText(scenario.reason);
        await expect(preview(page).getByRole('button', { name: 'Apply reviewed reply', exact: true })).toHaveCount(0);
    }
    const before = await inspectRun(page);
    await preview(page).getByRole('button', { name: 'Source preview', exact: true }).click();
    await preview(page).getByRole('button', { name: 'Copy source', exact: true }).click();
    await preview(page).getByRole('button', { name: 'Readable preview', exact: true }).click();
    expect(await inspectRun(page)).toEqual(before);
});

test('explicit Scene Context retains separate messages and copies its whole diagnostic envelope without another capture', async ({ page }) => {
    await openLesson(page);
    await select(page, 'captured-context');
    const leaf = preview(page);
    await leaf.locator('[data-run-here]').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    const messages = leaf.locator('[data-preview-message]');
    await expect(messages).toHaveCount(3);
    expect(await messages.locator('header strong').allTextContents()).toEqual(['user', 'assistant', 'user']);
    await expect(messages.nth(0)).toContainText('Earlier user');
    await expect(messages.nth(1)).toContainText('Earlier assistant.');
    const before = await inspectRun(page);
    expect(before.actualCalls).toBe(0); expect(before.providerCalls).toBe(0);
    await messages.nth(0).getByRole('button', { name: 'Copy message', exact: true }).click();
    await leaf.getByRole('button', { name: 'Source preview', exact: true }).click();
    const source = await leaf.locator('[data-preview-source]').textContent(), envelope = JSON.parse(source);
    expect(envelope.kind).toBe('context');
    expect(envelope.messages.map(message => message.text)).toEqual(['**Earlier user**', 'Earlier assistant.', 'Continue.']);
    expect(envelope.source).toBeTruthy(); expect(envelope.report).toBeTruthy();
    await leaf.getByRole('button', { name: 'Copy source', exact: true }).click();
    expect(await page.evaluate(() => window.workflowCopies)).toEqual(['**Earlier user**', source]);
    await leaf.getByRole('button', { name: 'Readable preview', exact: true }).click();
    await leaf.getByRole('button', { name: 'Pin preview', exact: true }).click();
    await select(page, 'pattern');
    await expect(messages).toHaveCount(3);
    await leaf.getByRole('button', { name: 'Pin preview', exact: true }).click();
    expect(await inspectRun(page)).toEqual(before);
});
test('a changed native reply invalidates the real review authority before publication', async ({ page }) => {
    await openLesson(page); await authorTerms(page, 'Elara');
    const run = await generateReply(page, elaraReply);
    expect(run.ok).toBe(true); expect(run.fresh).toEqual([true]);
    await openReview(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        h.context.chat.at(-1).mes += '\nUser edit after review.';
        await h.context.eventSource.emit(h.context.eventTypes.MESSAGE_EDITED, h.context.chat.length - 1);
        h.UI.refreshIfOpen(); await h.settle();
    });
    expect((await inspectRun(page)).fresh).toEqual([false]);
    await expect(preview(page).getByRole('button', { name: 'Apply reviewed reply', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => ({ commits: window.workflowEffects.commits, swipes: window.canvasHarness.context.chat.at(-1).swipes, calls: window.canvasHarness.providerCalls() }))).toEqual({ commits: 0, swipes: [elaraReply], calls: 0 });
});