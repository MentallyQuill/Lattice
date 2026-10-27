import { test, expect } from '@playwright/test';

const preferenceKey = 'lattice.browser-diagnostic-preference';
const userId = 'diagnostic-browser-user';
const chatId = 'diagnostic-browser-chat';

async function installHost(page) {
    await page.route('**/scripts/user.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const getCurrentUserHandle = () => ${JSON.stringify(userId)};` }));
    await page.route('**/script.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const isGenerating = () => false; export const syncMesToSwipe = () => true; export const syncSwipeToMes = () => true;' }));
    // The general harness intentionally starts with ephemeral host settings. This
    // test supplies only the host's remembered preference across page reloads;
    // saved logs themselves use the production IndexedDB adapter.
    await page.route('**/tests/browser/harness.js', async route => {
        const response = await route.fetch(), original = await response.text();
        const marker = 'const S = await import';
        expect(original).toContain(marker);
        const fixture = `const savedDiagnosticPreference = localStorage.getItem(${JSON.stringify(preferenceKey)});
if (savedDiagnosticPreference !== null) context.extensionSettings.lattice = { schema: 2, enabled: false, diagnosticLogging: savedDiagnosticPreference === 'true', recoveryDraft: null, migrationRecovery: [], subgraphLibrary: { definitions: {} }, ui: {} };
context.saveSettingsDebounced = () => localStorage.setItem(${JSON.stringify(preferenceKey)}, String(context.extensionSettings.lattice?.diagnosticLogging === true));
`;
        await route.fulfill({ response, body: original.replace(marker, fixture + marker) });
    });
}

async function setChat(page, currentChat = chatId) {
    await page.evaluate(async currentChat => {
        const h = window.canvasHarness;
        Object.assign(h.context, { chatId: currentChat, characterId: 1, groupId: null });
        const runtime = await import('/src/run.js?v=' + h.version);
        await runtime.initializeNativeWorkflowController();
        await h.context.eventSource.emit(h.context.eventTypes.CHAT_CHANGED);
        document.dispatchEvent(new CustomEvent('pc-state'));
        await h.settle();
    }, currentChat);
}

async function launch(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await setChat(page);
}

async function openDetails(page) {
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'Workflow', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Run details…', exact: true }).click();
    return page.getByRole('dialog', { name: 'Run details', exact: true });
}

async function syntheticHostRun(page, kind) {
    return page.evaluate(async kind => {
        const h = window.canvasHarness, runtime = await import('/src/run.js?v=' + h.version);
        const history = runtime.getWorkflowDiagnosticHistory();
        const recovered = kind === 'recovered';
        const graph = {
            id: 'synthetic-diagnostic-' + kind, name: recovered ? 'Synthetic schema recovery' : 'Synthetic JSON failure', schema: 3, runtime: 2, mode: 'native-unified',
            nodes: {
                source: { id: 'source', type: 'workflow', operation: 'text', text: 'PROMPT-MUST-NOT-BE-SAVED', x: 0, y: 0, w: 260 },
                model: { id: 'model', type: 'workflow', operation: 'model-call', outputKind: 'data', maxRetries: recovered ? 1 : 0,
                    ...(recovered ? { schema: JSON.stringify({ type: 'object', required: ['name'], properties: { name: { type: 'string' } } }) } : {}), x: 400, y: 0, w: 260 },
            },
            wires: { input: { id: 'input', route: 'wire', from: 'source', fromPort: 'out', to: 'model', toPort: 'prompt' } },
        };
        let captures = 0, requests = 0;
        const controller = runtime.createNativeWorkflowController({
            context: () => h.context, userId: () => runtime.getWorkflowDiagnosticScope().userId, isBusy: () => false,
            createDiagnosticCapture: origin => { captures++; return history.begin(origin, { mode: runtime.workflowDiagnosticLoggingEnabled() ? 'full' : 'metadata' }); },
            resolveBinding: () => ({ ok: true, data: { profileId: 'synthetic', model: 'synthetic-model' } }),
            bindingStatus: () => ({ ok: true }), countTokens: async () => ({ tokens: 4 }),
            request: async () => ({ ok: true, data: { text: recovered ? ++requests === 1 ? '{"name":7}' : '{"name":"Mara"}' : (requests++, '<img src=x onerror=alert(1)> malformed JSON'), finish: 'stop', usage: { inputTokens: 11, outputTokens: 7 } } }),
        });
        const result = await controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'model', portId: 'out' });
        const listed = await history.list(runtime.getWorkflowDiagnosticScope());
        controller.dispose();
        return { ok: result.ok, code: result.error?.code, runId: result.runId, actualCalls: result.actualCalls, captures, requests, listOk: listed.ok, entries: listed.ok ? listed.data.entries.length : 0, entry: listed.ok ? listed.data.entries.find(entry => entry.id === result.runId) ?? null : null, storage: history.status() };
    }, kind);
}

async function syntheticPrivateRun(page) {
    return page.evaluate(async () => {
        const h = window.canvasHarness, runtime = await import('/src/run.js?v=' + h.version);
        const { runWorkflowForHost } = await import('/src/workflow/runtime.js?v=' + h.version);
        const scope = runtime.getWorkflowDiagnosticScope(), graph = {
            id: 'synthetic-diagnostic-private', schema: 3, runtime: 2, mode: 'native-unified',
            nodes: { source: { id: 'source', type: 'workflow', operation: 'text', text: 'PRIVATE-PROMPT-MUST-NOT-BE-SAVED' }, model: { id: 'model', type: 'workflow', operation: 'model-call', outputKind: 'data' } },
            wires: { input: { id: 'input', route: 'wire', from: 'source', fromPort: 'out', to: 'model', toPort: 'prompt' } },
        };
        const runId = 'synthetic-private-run', capture = runtime.getWorkflowDiagnosticHistory().begin({ ...scope, workflowId: graph.id, workflowName: 'Synthetic private diagnosis', runId, mode: 'target', native: false, startedAt: Date.now() });
        if (!capture) throw Error('The scoped diagnostic capture was not created.');
        const result = await runWorkflowForHost(graph, {
            runId, target: { workflowId: graph.id, instancePath: [], nodeId: 'model', portId: 'out' },
            resolveBinding: () => ({ ok: true, data: { profileId: 'synthetic', model: 'synthetic-model' } }), countTokens: async () => ({ tokens: 4 }),
            onEvent: capture.event, onDiagnostic: capture.model,
            request: async () => ({ ok: true, data: { text: 'PRIVATE-STORY-TEXT <svg onload=alert(1)> invalid JSON', finish: 'stop' } }),
        }, { authorizeModelInputs: () => ({ ok: true, data: { scope: { actorId: 'mara' } } }) });
        const saved = await capture.finish(result);
        return { ok: result.ok, code: result.error?.code, runId, saved: saved.ok };
    });
}

async function downloadJson(download) {
    const stream = await download.createReadStream();
    let text = '';
    for await (const part of stream) text += part.toString('utf8');
    return JSON.parse(text);
}

test('failure metadata and opt-in responses persist across reload, then export and clear only this chat', async ({ page }, testInfo) => {
    await installHost(page); await launch(page);
    let details = await openDetails(page);
    const toggle = () => details.getByRole('checkbox', { name: 'Save diagnostic logs', exact: true });
    await expect(toggle()).not.toBeChecked();
    await expect(toggle()).toBeEnabled();
    const toggleLayout = await toggle().evaluate(element => ({ direction: getComputedStyle(element.parentElement).flexDirection, width: element.getBoundingClientRect().width }));
    expect(toggleLayout.direction).toBe('row'); expect(toggleLayout.width).toBeLessThan(30);
    await expect(details).toContainText('in this browser'); await expect(details).toContainText('private story text');
    await expect(details).toContainText('Failure metadata is always retained locally');
    await expect(details).toContainText('50 runs'); await expect(details).toContainText('5 MiB');
    await expect(details.locator('[data-diagnostic-log]')).toHaveCount(0);
    const off = await syntheticHostRun(page, 'failure');
    expect(off.code).toBe('INVALID_JSON'); expect(off.actualCalls).toBe(1); expect(off.captures).toBe(1); expect(off.entries).toBe(1);
    expect(off.listOk).toBe(true); expect(off.storage.persistent).toBe(true);
    expect(off.entry.status).toBe('failed'); expect(off.entry.actualCalls).toBe(1);
    expect(off.entry.attempts).toHaveLength(1); expect(off.entry.attempts[0].validationError.code).toBe('INVALID_JSON');
    expect(off.entry.attempts.every(attempt => attempt.response?.text === undefined)).toBe(true);
    expect(JSON.stringify(off.entry)).not.toContain('<img src=x onerror=alert(1)> malformed JSON');
    expect(JSON.stringify(off.entry)).not.toContain('PROMPT-MUST-NOT-BE-SAVED');
    await expect(details.locator('[data-diagnostic-log]')).toHaveCount(1);
    await details.locator(`[data-diagnostic-log="${off.runId}"] button`).click();
    await expect(details.locator('[data-diagnostic-selection]')).toContainText('INVALID_JSON');
    await expect(details).toContainText(/Failure metadata.*switch is off/);
    await expect(details.locator('[data-diagnostic-response]')).toHaveCount(0);
    await expect(details).not.toContainText('malformed JSON'); await expect(details).not.toContainText('PROMPT-MUST-NOT-BE-SAVED');
    const offRecovered = await syntheticHostRun(page, 'recovered');
    expect(offRecovered.ok).toBe(true); expect(offRecovered.actualCalls).toBe(2); expect(offRecovered.captures).toBe(1);
    expect(offRecovered.entries).toBe(1); expect(offRecovered.entry).toBeNull();
    await expect(details.locator('[data-diagnostic-log]')).toHaveCount(1);
    await page.reload(); await page.waitForFunction(() => !!window.canvasHarness); await setChat(page);
    details = await openDetails(page);
    await expect(toggle()).not.toBeChecked(); await expect(details.locator('[data-diagnostic-log]')).toHaveCount(1);
    await details.locator(`[data-diagnostic-log="${off.runId}"] button`).click();
    await expect(details.locator('[data-diagnostic-selection]')).toContainText('INVALID_JSON');
    await expect(details.locator('[data-diagnostic-response]')).toHaveCount(0);
    await expect(details).not.toContainText('malformed JSON'); await expect(details).not.toContainText('PROMPT-MUST-NOT-BE-SAVED');
    await toggle().check();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), preferenceKey)).toBe('true');
    const failed = await syntheticHostRun(page, 'failure');
    expect(failed.code).toBe('INVALID_JSON'); expect(failed.actualCalls).toBe(1); expect(failed.captures).toBe(1);
    expect(failed.listOk).toBe(true); expect(failed.storage.persistent).toBe(true);
    const recovered = await syntheticHostRun(page, 'recovered');
    expect(recovered.ok).toBe(true); expect(recovered.actualCalls).toBe(2);
    const privateRun = await syntheticPrivateRun(page);
    expect(privateRun.code).toBe('INVALID_JSON'); expect(privateRun.saved).toBe(true);
    await expect(details.locator('[data-diagnostic-log]')).toHaveCount(4);
    await details.locator(`[data-diagnostic-log="${failed.runId}"] button`).click();
    await expect(details.locator('[data-diagnostic-selection]')).toContainText('INVALID_JSON');
    await expect(details.locator('[data-diagnostic-response]')).toHaveText('<img src=x onerror=alert(1)> malformed JSON');
    await expect(details.locator('[data-diagnostic-selection] img')).toHaveCount(0);

    await page.reload(); await page.waitForFunction(() => !!window.canvasHarness); await setChat(page);
    details = await openDetails(page);
    await expect(toggle()).toBeChecked(); await expect(details.locator('[data-diagnostic-log]')).toHaveCount(4);
    await expect(details.locator('[data-diagnostic-selection]')).toHaveCount(0);
    await details.locator(`[data-diagnostic-log="${recovered.runId}"] button`).click();
    const selected = details.locator('[data-diagnostic-selection]');
    await expect(selected).toContainText('Completed'); await expect(selected).toContainText('2 of 2 requests');
    await expect(selected).toContainText('Validation: SCHEMA_MISMATCH'); await expect(selected).toContainText('/name');
    await expect(selected).toContainText('Expected string; got number.'); await expect(selected).toContainText('Retry: SCHEMA_MISMATCH');
    await expect(selected).toContainText('Finish: stop'); await expect(selected).toContainText('inputTokens: 11');
    await expect(selected.locator('[data-diagnostic-response]')).toHaveText(['{"name":7}', '{"name":"Mara"}']);
    await expect(selected.locator('button, a')).toHaveCount(0);
    await selected.scrollIntoViewIfNeeded();
    await details.screenshot({ path: testInfo.outputPath('diagnostic-history-recovered-desktop.png') });

    await details.locator(`[data-diagnostic-log="${privateRun.runId}"] button`).click();
    await expect(selected).toContainText('Private model output'); await expect(selected).toContainText('Actor: mara');
    await expect(selected).toContainText('PRIVATE-STORY-TEXT'); await expect(selected.locator('svg')).toHaveCount(0);
    await toggle().uncheck(); await expect(toggle()).not.toBeChecked();
    await expect(selected).toContainText('PRIVATE-STORY-TEXT');
    const downloadPending = page.waitForEvent('download');
    await details.getByRole('button', { name: 'Export logs', exact: true }).click();
    const download = await downloadPending, exported = await downloadJson(download);
    expect(download.suggestedFilename()).toMatch(/^lattice-diagnostics-.*\.json$/);
    expect(exported.version).toBe(1); expect(exported.scope.userId).toBe(userId); expect(exported.scope.chatId).toBe(chatId);
    expect(exported.entries).toHaveLength(4);
    const exportedMetadata = exported.entries.find(entry => entry.id === off.runId);
    expect(exportedMetadata.status).toBe('failed');
    expect(exportedMetadata.attempts.every(attempt => attempt.response?.text === undefined)).toBe(true);
    expect(JSON.stringify(exportedMetadata)).not.toContain('malformed JSON');
    expect(JSON.stringify(exportedMetadata)).not.toContain('PROMPT-MUST-NOT-BE-SAVED');
    expect(exported.entries.some(entry => entry.id === offRecovered.runId)).toBe(false);
    expect(JSON.stringify(exported)).toContain('PRIVATE-STORY-TEXT');
    expect(JSON.stringify(exported)).not.toContain('PROMPT-MUST-NOT-BE-SAVED');
    await selected.locator('[data-diagnostic-response]').scrollIntoViewIfNeeded();
    await details.screenshot({ path: testInfo.outputPath('diagnostic-history-private-desktop.png') });
    await page.setViewportSize({ width: 600, height: 850 });
    expect(await details.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await selected.locator('[data-diagnostic-response]').scrollIntoViewIfNeeded();
    await details.screenshot({ path: testInfo.outputPath('diagnostic-history-private-narrow.png') });

    await setChat(page, 'other-diagnostic-chat');
    await expect(details.locator('[data-diagnostic-log]')).toHaveCount(0); await expect(selected).toHaveCount(0);
    await expect(details).not.toContainText('PRIVATE-STORY-TEXT');
    await toggle().check();
    const other = await syntheticHostRun(page, 'failure'); expect(other.code).toBe('INVALID_JSON');
    await expect(details.locator('[data-diagnostic-log]')).toHaveCount(1);
    await setChat(page);
    await expect(details.locator('[data-diagnostic-log]')).toHaveCount(4);
    await details.getByRole('button', { name: 'Clear logs for this chat', exact: true }).click();
    await expect(details.locator('[data-diagnostic-log]')).toHaveCount(0); await expect(selected).toHaveCount(0);
    await setChat(page, 'other-diagnostic-chat');
    await expect(details.locator(`[data-diagnostic-log="${other.runId}"]`)).toHaveCount(1);
    await setChat(page);
    await expect(details.locator('[data-diagnostic-log]')).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
