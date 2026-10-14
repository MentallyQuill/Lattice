import { test, expect } from '@playwright/test';
import { chooseControl, controlValue } from './details-helpers.mjs';

const details = page => page.getByRole('region', { name: 'Node details', exact: true });

async function launch(page, fixture) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async fixture => {
        const h = window.canvasHarness;
        const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const graph = { id: 'node-capabilities-' + fixture, name: 'Node capabilities', schema: 3, runtime: 2,
            mode: 'native-unified', roles: {}, nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {} };
        const node = (id, operation, controls = {}, x = 80) => ({ ...operationDefaults(operation, controls), ...controls,
            id, type: 'workflow', enabled: true, x, y: 80 });
        if (fixture === 'extract') graph.nodes.extract = node('extract', 'extract', {
            inputKind: 'text', mode: 'literal', patterns: [{ id: 'lantern', literal: 'lantern', label: 'Lantern' }],
        });
        if (fixture === 'collection') graph.nodes.collection = node('collection', 'collection', { mode: 'filter', value: 'lantern' });
        if (fixture === 'ports') {
            graph.nodes.query = node('query', 'text', { text: 'lighthouse' });
            graph.nodes.memory = node('memory', 'memory', { mode: 'recall', query: 'harbor', limit: 4 }, 440);
            graph.nodes.read = node('read', 'read-file', { targetId: 'player-progression' }, 800);
            graph.wires.query = { id: 'query', route: 'wire', from: 'query', fromPort: 'out', to: 'memory', toPort: 'query' };
        }
        await h.activate(graph);
        await h.view({ x: 60, y: 30, zoom: .8 });
    }, fixture);
}

async function select(page, id) {
    await page.evaluate(async id => {
        const h = window.canvasHarness, node = h.graph.nodes[id];
        h.canvas.select({ kind: 'node', id });
        await h.view({ x: 100 - node.x * .8, y: 30, zoom: .8 });
        await h.settle();
    }, id);
    await expect(details(page)).toBeVisible();
}

test('Extract Details saves literal case and word choices and hides them in Model mode', async ({ page }) => {
    await launch(page, 'extract');
    await select(page, 'extract');
    const panel = details(page), caseSensitive = panel.getByRole('checkbox', { name: 'Case sensitive', exact: true });
    await expect(caseSensitive).toBeChecked();
    expect(await controlValue(page, 'Match')).toBe('substring');
    await caseSensitive.uncheck();
    await chooseControl(page, 'Match', 'word');
    const observed = await page.evaluate(async () => {
        const h = window.canvasHarness, node = h.graph.nodes.extract;
        const { executeModelNode } = await import('/src/workflow/operations/model-nodes.js?v=' + h.version);
        const result = await executeModelNode(node, { source: { kind: 'text', text: 'Lantern lanterns LANTERN' } }, { phase: 'pre' });
        if (!result.ok) throw Error(JSON.stringify(result.error));
        return { caseSensitive: node.caseSensitive, match: node.match, records: result.artifact.value.records };
    });
    expect(observed.caseSensitive).toBe(false);
    expect(observed.match).toBe('word');
    expect(observed.records.map(record => record.evidence[0].quote)).toEqual(['Lantern', 'LANTERN']);
    await chooseControl(page, 'Mode', 'model');
    await expect(caseSensitive).toHaveCount(0);
    await expect(panel.getByLabel('Match', { exact: true })).toHaveCount(0);
    await chooseControl(page, 'Mode', 'literal');
    await expect(caseSensitive).not.toBeChecked();
    expect(await controlValue(page, 'Match')).toBe('word');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('Collection Details retains numeric, boolean, null and structured JSON comparison values', async ({ page }) => {
    await launch(page, 'collection');
    await select(page, 'collection');
    const panel = details(page), type = panel.getByLabel('Value type', { exact: true });
    await expect(type).toHaveValue('string');
    const save = panel.getByRole('button', { name: 'Save Value', exact: true });
    for (const [kind, expected] of [['number', 0], ['boolean', false], ['null', null]]) {
        await type.selectOption(kind);
        await save.click();
        await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.nodes.collection.value)).toEqual(expected);
        await select(page, 'collection');
        await expect(type).toHaveValue(kind);
    }
    await type.selectOption('object');
    await panel.getByRole('button', { name: 'Edit Value as JSON', exact: true }).click();
    const json = panel.getByLabel('Value JSON', { exact: true });
    await json.fill('{"unfinished":');
    await save.click();
    await expect(json).toHaveAttribute('aria-invalid', 'true');
    expect(await page.evaluate(() => window.canvasHarness.graph.nodes.collection.value)).toBeNull();
    const structured = { id: 'lantern', present: false, count: 0, optional: null };
    await json.fill(JSON.stringify(structured));
    await save.click();
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.nodes.collection.value)).toEqual(structured);
    await panel.getByRole('button', { name: 'Edit Value as JSON', exact: true }).click();
    await json.fill('[0,false,null,{"id":"lantern"}]');
    await save.click();
    await expect.poll(() => page.evaluate(() => window.canvasHarness.graph.nodes.collection.value)).toEqual([0, false, null, { id: 'lantern' }]);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('Recall exposes its optional wired Text Query and Read File exposes separate parsed Data and live reference pins', async ({ page }) => {
    await launch(page, 'ports');
    await select(page, 'memory');
    const queryPin = page.locator('.pc-port[data-node="memory"][data-dir="in"][data-port="query"]');
    await expect(queryPin).toBeVisible();
    await expect(queryPin).toHaveAttribute('data-kind', 'text');
    await expect(page.locator('.pc-wire-native[data-id="query"]')).toBeVisible();
    await expect(details(page).getByLabel('Query', { exact: true })).toHaveValue('harbor');
    const query = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { describeOperation } = await import('/src/workflow/catalog.js?v=' + h.version);
        return describeOperation(h.graph, h.graph.nodes.memory).data.ports.find(port => port.id === 'query');
    });
    expect(query.required).toBe(false);
    await select(page, 'read');
    for (const [port, kind] of [['text', 'text'], ['document', 'data'], ['value', 'data'], ['reference', 'data']]) {
        const pin = page.locator(`.pc-port[data-node="read"][data-dir="out"][data-port="${port}"]`);
        await expect(pin).toBeVisible();
        await expect(pin).toHaveAttribute('data-kind', kind);
    }
    await expect(page.locator('.pc-node-native[data-id="read"]')).toContainText('Parsed value');
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
