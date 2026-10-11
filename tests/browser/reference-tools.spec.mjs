import { rootCommand, expectRootBusy } from './workflow-commands.mjs';
import { test, expect } from '@playwright/test';
import { chooseControl, controlValue } from './details-helpers.mjs';

async function launch(page, phase = 'post') {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async phase => {
        await window.canvasHarness.activate({ id: 'reference-tools-ui-' + phase, name: 'Reference tools', schema: 3, runtime: 2, mode: 'native-' + phase, roles: {}, nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {}, view: { x: 0, y: 0, zoom: 1 } });
    }, phase);
}
async function insert(page, family, operation) {
    await page.locator(`[data-family="${family}"]`).click();
    await page.locator(`[data-shelf-choice="operation:${operation}"]`).click();
    const id = await page.evaluate(operation => Object.values(window.canvasHarness.graph.nodes).find(node => node.operation === operation).id, operation);
    await page.evaluate(async id => { const h = window.canvasHarness, node = h.graph.nodes[id]; await h.view({ x: 280 - node.x, y: 80 - node.y, zoom: 1 }); }, id);
    await page.locator(`.pc-node[data-id="${id}"] .pc-native-heading`).click();
    return id;
}

async function runResult(page) {
    return page.evaluate(async () => {
        const h = window.canvasHarness, controller = (await import('/src/run.js?v=' + h.version)).getNativeWorkflowController();
        const result = controller.lastResult();
        return result && { ok: result.ok, actualCalls: result.actualCalls, callBound: result.callBound, recording: result.recording };
    });
}

test('post canonical Transpose nodes and Details retain reference, scope and boolean controls', async ({ page }) => {
    await launch(page);
    await expect(page.locator('[data-family="Transpose"]')).toBeEnabled();
    const id = await insert(page, 'Transpose', 'style-transfer');
    await chooseControl(page, 'Mode', 'character-voice');
    await chooseControl(page, 'Input type', 'draft');
    await chooseControl(page, 'Scope', 'dialogue');
    await expect.poll(() => controlValue(page, 'Mode')).toBe('character-voice');
    await expect.poll(() => controlValue(page, 'Scope')).toBe('dialogue');
    await chooseControl(page, 'Reference', 'data');
    await chooseControl(page, 'Mode', 'rhythm');
    await expect.poll(() => controlValue(page, 'Scope')).toBe('dialogue');
    await chooseControl(page, 'Scope', 'narration');
    await expect.poll(() => page.evaluate(id => { const node = window.canvasHarness.graph.nodes[id]; return [node.referenceKind, node.mode, node.scope]; }, id)).toEqual(['data', 'rhythm', 'narration']);
    await expect(page.locator(`.pc-node[data-id="${id}"] .pc-port[data-port="reference"]`)).toHaveAttribute('data-kind', 'data');
    const glossary = await insert(page, 'Transpose', 'terminology-map');
    await page.getByRole('checkbox', { name: 'Case sensitive', exact: true }).uncheck();
    await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].caseSensitive, glossary)).toBe(false);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('canonical cleanup node retains category selection independently of mode and scope', async ({ page }) => {
    await launch(page);
    const id = await insert(page, 'Surface', 'repair');
    await chooseControl(page, 'Mode', 'strict');
    await expect.poll(() => controlValue(page, 'Mode')).toBe('strict');
    await expect.poll(() => controlValue(page, 'Scope')).toBe('narration');
    await page.getByLabel('Policy categories (empty selects all)', { exact: true }).fill('generic-tension-atmosphere');
    await page.locator('[data-save-control="categories"]').click();
    await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].categories, id)).toEqual(['generic-tension-atmosphere']);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('Repair Details shows scope and policy controls only for cleanup modes', async ({ page }) => {
    await launch(page);
    await insert(page, 'Surface', 'repair');
    await expect.poll(() => controlValue(page, 'Mode')).toBe('repair');
    await expect(page.getByLabel('Scope', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Policy categories (empty selects all)', { exact: true })).toHaveCount(0);
    await chooseControl(page, 'Mode', 'contextual');
    await expect.poll(() => controlValue(page, 'Scope')).toBe('narration');
    await expect(page.getByLabel('Policy categories (empty selects all)', { exact: true })).toBeVisible();
    await chooseControl(page, 'Mode', 'scan');
    await expect(page.getByLabel('Scope', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

for (const phase of ['pre', 'post']) test(`${phase} canonical Style and Format Transfer create Text ports and expose their Details controls`, async ({ page }) => {
    await launch(page, phase);
    for (const operation of ['style-transfer', 'format-transfer']) {
        const id = await insert(page, 'Transpose', operation);
        await expect.poll(() => controlValue(page, 'Input type')).toBe('text');
        await expect(page.locator(`.pc-node[data-id="${id}"] .pc-port[data-dir="in"][data-port="in"]`)).toHaveAttribute('data-kind', 'text');
        await expect(page.locator(`.pc-node[data-id="${id}"] .pc-port[data-dir="out"][data-port="out"]`)).toHaveAttribute('data-kind', 'text');
        expect(await page.evaluate(id => window.canvasHarness.graph.nodes[id].inputKind, id)).toBe('text');
        if (phase === 'pre') await expect(page.getByLabel('Input type', { exact: true }).locator('option[value="draft"], input[type="radio"][value="draft"]')).toHaveCount(0);
        if (operation === 'style-transfer') {
            await chooseControl(page, 'Mode', 'rhythm');
            await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].mode, id)).toBe('rhythm');
        }
        await chooseControl(page, 'Strength', 'balanced');
        await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].strength, id)).toBe('balanced');
    }
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('pre Text Terminology Map feeds downstream Text Rules and produces guidance with zero external requests', async ({ page }) => {
    const requests = []; page.on('request', request => requests.push(request.url()));
    await launch(page, 'pre');
    await page.evaluate(async () => {
        const h = window.canvasHarness, { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const node = (id, operation, x, y, controls = {}) => ({ ...operationDefaults(operation), id, type: 'workflow', operation, operationVersion: 1, x, y, ...controls });
        const wire = (id, from, to, toPort = 'in') => ({ id, route: 'wire', from, fromPort: 'out', to, toPort });
        const graph = { id: 'pre-text-terminology', name: 'Pre Text terminology', schema: 3, runtime: 2, mode: 'native-pre', roles: {}, groups: {}, portals: {}, definitions: {}, view: { x: 0, y: 0, zoom: 0.65 },
            nodes: {
                source: node('source', 'compose', 20, 450, { sections: [{ name: 'Text', text: 'Captain waits.' }] }),
                json: node('json', 'compose', 20, 60, { sections: [{ name: 'JSON', text: '{"entries":[{"from":"Captain","to":"Commander"}]}' }] }),
                glossary: node('glossary', 'json-decode', 300, 60),
                map: node('map', 'terminology-map', 600, 240, { inputKind: 'text' }),
                rules: node('rules', 'text-rules', 900, 240, { inputKind: 'text', rules: [{ kind: 'literal', pattern: 'Commander', replacement: 'Admiral' }] }),
                compose: node('compose', 'compose', 1200, 240, { outputKind: 'guidance', sections: [{ name: 'Result', text: '' }] }),
                publish: node('publish', 'guidance', 1500, 240),
            }, wires: {
                json: wire('json', 'json', 'glossary'), reference: wire('reference', 'glossary', 'map', 'reference'), source: wire('source', 'source', 'map'),
                mapped: wire('mapped', 'map', 'rules'), result: wire('result', 'rules', 'compose', 'section.Result'), publish: wire('publish', 'compose', 'publish'),
            } };
        h.context.chatId = 'pre-text-terminology';
        await h.activate(graph);
        await (await import('/src/run.js?v=' + h.version)).initializeNativeWorkflowController();
    });
    await expect(page.locator('.pc-port[data-node="map"][data-dir="out"][data-port="out"]')).toHaveAttribute('data-kind', 'text');
    await expect(page.locator('.pc-port[data-node="rules"][data-dir="in"][data-port="in"]')).toHaveAttribute('data-kind', 'text');
    await rootCommand(page);
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    const result = await runResult(page);
    expect(result).toMatchObject({ ok: true, actualCalls: 0, callBound: 0 });
    expect(result.recording.artifacts.filter(entry => entry.value?.kind === 'text').map(entry => entry.value.text)).toEqual(expect.arrayContaining(['Commander waits.', 'Admiral waits.']));
    expect(result.recording.artifacts.some(entry => entry.value?.kind === 'guidance' && entry.value.text === 'Admiral waits.')).toBe(true);
    expect(result.recording.terminals).toHaveLength(1);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    expect(requests.every(url => new URL(url).hostname === '127.0.0.1')).toBe(true);
});

test('saved post Terminology Map without inputKind retains Draft patches and review candidate behavior', async ({ page }) => {
    await page.route('**/script.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        const context = () => globalThis.SillyTavern.getContext();
        export const isGenerating = () => false;
        export function syncMesToSwipe(index) { const m = context().chat[index]; m.swipe_info[m.swipe_id] = { extra: structuredClone(m.extra || {}) }; return true; }
        export function syncSwipeToMes(index, swipeId) { const m = context().chat[index]; m.swipe_id = swipeId; m.mes = m.swipes[swipeId]; Object.assign(m, structuredClone(m.swipe_info[swipeId])); return true; }
    ` }));
    await launch(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness, { exportWorkflow, parseWorkflow } = await import('/src/workflow/packages.js?v=' + h.version);
        const node = (id, operation, x, y, controls = {}) => ({ id, type: 'workflow', operation, operationVersion: 1, x, y, ...controls });
        const wire = (id, from, to, toPort = 'in') => ({ id, route: 'wire', from, fromPort: 'out', to, toPort });
        const graph = { id: 'legacy-draft-terminology', name: 'Saved Draft terminology', schema: 3, runtime: 2, mode: 'native-post', roles: {}, groups: {}, portals: {}, definitions: {}, view: { x: 0, y: 0, zoom: 0.65 },
            nodes: {
                source: node('source', 'reply-snapshot', 20, 450),
                json: node('json', 'compose', 20, 60, { sections: [{ name: 'JSON', text: '{"entries":[{"from":"Captain","to":"Commander"}]}' }] }),
                glossary: node('glossary', 'json-decode', 300, 60),
                map: node('map', 'terminology-map', 600, 240, { scope: 'whole' }),
                validate: node('validate', 'validate-patches', 900, 240), review: node('review', 'review-gate', 1200, 240), apply: node('apply', 'apply-reply', 1500, 240),
            }, wires: {
                json: wire('json', 'json', 'glossary'), reference: wire('reference', 'glossary', 'map', 'reference'), source: wire('source', 'source', 'map'),
                patches: wire('patches', 'map', 'validate'), review: wire('review', 'validate', 'review'), apply: wire('apply', 'review', 'apply'),
            } };
        const parsed = parseWorkflow(JSON.stringify(exportWorkflow(graph))); if (!parsed.ok) throw Error(parsed.error.message);
        if (Object.hasOwn(parsed.data.nodes.map, 'inputKind')) throw Error('Legacy saved node must retain omitted inputKind.');
        h.context.chatId = 'legacy-draft-terminology';
        h.context.chat.splice(0, h.context.chat.length, { mes: 'Continue.', is_user: true }, { mes: 'Captain waits.', is_user: false, swipe_id: 0, swipes: ['Captain waits.'], swipe_info: [{ extra: {} }], extra: {}, gen_started: 1, gen_finished: 2 });
        await h.activate(parsed.data);
        await (await import('/src/run.js?v=' + h.version)).initializeNativeWorkflowController();
    });
    await expect(page.locator('.pc-port[data-node="map"][data-dir="in"][data-port="in"]')).toHaveAttribute('data-kind', 'draft');
    await expect(page.locator('.pc-port[data-node="map"][data-dir="out"][data-port="out"]')).toHaveAttribute('data-kind', 'patches');
    await rootCommand(page);
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    const result = await runResult(page);
    expect(result).toMatchObject({ ok: true, actualCalls: 0, callBound: 0 });
    expect(result.recording.artifacts.some(entry => entry.value?.kind === 'candidate' && entry.value.text === 'Commander waits.' && entry.value.original === 'Captain waits.')).toBe(true);
    expect(result.recording.terminals).toHaveLength(1);
    expect(await page.evaluate(() => window.canvasHarness.context.chat.at(-1).mes)).toBe('Captain waits.');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
