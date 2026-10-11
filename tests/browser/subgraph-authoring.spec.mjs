import { setCompact, openDetailGroup } from './details-helpers.mjs';
import { test, expect } from '@playwright/test';

async function setup(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { canvasWorkflow } = await import('/tests/browser/native-fixture.mjs');
        const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const graph = canvasWorkflow(operationDefaults, 5, 3);
        graph.id = 'subgraph-authoring'; graph.name = 'Subgraph authoring';
        graph.nodes.n2.sections.push({ name: 'External', text: '' });
        graph.wires.shared = { id: 'shared', route: 'wire', from: 'n0', fromPort: 'out', to: 'n2', toPort: 'section.External' };
        graph.wires.w4 = { id: 'w4', route: 'wire', from: 'n2', fromPort: 'out', to: 'n4', toPort: 'section.Text' };
        await h.activate(graph); await h.view({ x: 160, y: 50, zoom: 0.85 });
    });
}
async function create(page) {
    await page.locator('.pc-node[data-id="n1"] .pc-native-heading').click();
    await page.locator('.pc-node[data-id="n2"] .pc-native-heading').click({ modifiers: ['Shift'] });
    await expect.poll(() => page.evaluate(() => [...window.canvasHarness.canvas.multi].sort())).toEqual(['n1', 'n2']);
    await page.locator('.pc-node[data-id="n1"] .pc-native-heading').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Create subgraph', exact: true }).click();
    await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Subgraph');
    return page.evaluate(() => {
        const root = structuredClone(window.canvasHarness.S.activeWorkflow());
        delete root.updatedAt;
        return Object.values(root.nodes).find(node => node.type === 'subgraph').id;
    });
}
async function snapshot(page) {
    return page.evaluate(() => {
        const root = structuredClone(window.canvasHarness.S.activeWorkflow());
        delete root.updatedAt;
        const wrapper = Object.values(root.nodes).find(node => node.type === 'subgraph');
        const definition = wrapper && root.definitions[JSON.stringify([wrapper.definition.id, wrapper.definition.version, wrapper.definition.semanticHash])];
        return { root, wrapper, definition };
    });
}

test('selection creates an editable tab with shared input, output fanout, preserved wires and one-step undo', async ({ page }) => {
    await setup(page); const before = (await snapshot(page)).root;
    const wrapperId = await create(page), state = await snapshot(page);
    expect(state.definition.interface.filter(port => port.direction === 'input' && port.kind === 'text')).toHaveLength(1);
    expect(state.definition.interface.filter(port => port.direction === 'input' && port.kind === 'data')).toHaveLength(2);
    expect(state.definition.interface.filter(port => port.direction === 'output')).toHaveLength(1);
    expect(state.root.wires.w1.to).toBe(wrapperId); expect(state.root.wires.shared).toBeUndefined();
    expect(state.root.wires.w3.from).toBe(wrapperId); expect(state.root.wires.w4.from).toBe(wrapperId);
    expect(state.definition.body.wires.w2.from).toBe('n1'); expect(state.definition.body.wires.w2.to).toBe('n2');
    await expect(page.locator('.pc-node-subgraph-input')).toHaveCount(3);
    await expect(page.locator('.pc-node-subgraph-output')).toHaveCount(1);
    await page.locator('.pc-node-subgraph-input .pc-native-heading').first().click();
    await expect(page.getByLabel('Node name', { exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.pc-graph-tabs [role="tab"]')).toHaveCount(1);
    expect((await snapshot(page)).root).toEqual(before);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.locator(`.pc-node[data-id="${wrapperId}"] .pc-native-heading`).dblclick();
    await expect(page.locator('.pc-node-subgraph-input')).toHaveCount(3);
    await expect(page.locator('.pc-node-subgraph-output')).toHaveCount(1);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('boundary blocks rename real parent pins and add a typed input that can be wired with the mouse', async ({ page }) => {
    await setup(page); const wrapperId = await create(page);
    await page.locator('.pc-node-subgraph-input:has(.pc-port[data-kind="text"]) .pc-native-heading').click();
    await expect(page.getByLabel('Node name', { exact: true })).toBeEnabled();
    const previousLabel = await page.getByLabel('Node name', { exact: true }).inputValue();
    await page.getByLabel('Node name', { exact: true }).fill('Source text');
    await page.locator('[data-save-boundary]').click();
    let state = await snapshot(page);
    expect(state.definition.interface.find(port => port.direction === 'input' && port.kind === 'text').label).toBe('Source text');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Node name', { exact: true })).toHaveValue(previousLabel);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.getByLabel('Node name', { exact: true })).toHaveValue('Source text');
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    await expect(page.locator(`.pc-node[data-id="${wrapperId}"] .pc-native-pin-label`).filter({ hasText: 'Source text' })).toHaveCount(1);
    await page.locator(`.pc-node[data-id="${wrapperId}"] .pc-native-heading`).dblclick();
    await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
    await page.locator('[data-shelf-choice="boundary:input"]').click();
    await expect(page.locator('.pc-node-subgraph-input')).toHaveCount(4);
    await expect(page.getByLabel('Node name', { exact: true })).toBeFocused();
    await page.getByLabel('Node name', { exact: true }).fill('Alternate text');
    await page.locator('[data-save-boundary]').click();
    state = await snapshot(page);
    const added = state.definition.interface.find(port => port.label === 'Alternate text');
    expect(added.kind).toBe('text'); expect(added.required).toBe(false);
    const source = page.locator(`.pc-port[data-node="${added.boundaryNodeId}"][data-dir="out"]`);
    const destination = page.locator('.pc-port[data-node="n2"][data-port="section.External"]');
    const a = await source.boundingBox(), b = await destination.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 }); await page.mouse.up();
    await expect.poll(async () => {
        const current = await snapshot(page);
        return Object.values(current.definition.body.wires).some(edge => edge.from === added.boundaryNodeId && edge.to === 'n2' && edge.toPort === 'section.External');
    }).toBe(true);
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    await expect(page.locator(`.pc-node[data-id="${wrapperId}"] .pc-native-pin-label`).filter({ hasText: 'Alternate text' })).toHaveCount(1);
    expect(await page.evaluate(() => window.canvasHarness.toasts.filter(item => item.level === 'error'))).toEqual([]);
});

test('empty subgraph bodies add input and output nodes from the shelf', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
        const root = window.canvasHarness.S.activeWorkflow();
        root.nodes.note = { id: 'note', type: 'note', x: 400, y: 300, content: 'Reusable notes' };
        window.canvasHarness.UI.refreshIfOpen();
    });
    await page.locator('.pc-node[data-id="note"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Create subgraph', exact: true }).click();
    await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Subgraph');
    await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
    await page.locator('[data-shelf-choice="boundary:input"]').click();
    await expect(page.getByLabel('Node name', { exact: true })).toBeFocused();
    await expect(page.locator('.pc-node-subgraph-input')).toHaveCount(1);
    await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
    await page.locator('[data-shelf-choice="boundary:output"]').click();
    await expect(page.locator('.pc-node-subgraph-output')).toHaveCount(1);
});

test('ordinary Delete removes connected interface pins and Undo restores the complete graph', async ({ page }) => {
    await setup(page); const wrapperId = await create(page), before = await snapshot(page);
    const port = before.definition.interface.find(item => item.direction === 'output');
    await page.locator(`.pc-node[data-id="${port.boundaryNodeId}"] .pc-native-heading`).click();
    await expect(page.locator('.pc-node-subgraph-output button')).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Delete selection/ }).click();
    const deleted = await snapshot(page);
    expect(deleted.definition.interface.some(item => item.id === port.id)).toBe(false);
    expect(deleted.definition.body.nodes[port.boundaryNodeId]).toBeUndefined();
    expect(Object.values(deleted.root.wires).some(edge => edge.from === wrapperId && edge.fromPort === port.id)).toBe(false);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await snapshot(page)).root).toEqual(before.root);
    await expect(page.locator('.pc-node-subgraph-output')).toHaveCount(1);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect((await snapshot(page)).root).toEqual(deleted.root);
});

test('explicit shelf saves update future insertions while placed copies and deletion stay independent', async ({ page }) => {
    await setup(page);
    await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
    await expect(page.locator('[data-shelf-choice="boundary:input"]')).toBeDisabled();
    await expect(page.locator('[data-shelf-choice="boundary:output"]')).toBeDisabled();
    const wrapperId = await create(page);
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    const wrapper = page.locator(`.pc-node[data-id="${wrapperId}"] .pc-native-heading`);
    await wrapper.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Subgraphs', exact: true }).click();
    await page.getByLabel('Subgraph name', { exact: true }).fill('Reusable cleanup');
    await page.locator('[data-save-subgraph]').click();
    const saved = await page.evaluate(async () => { const L = await import('/src/library.js?v=' + window.canvasHarness.version); return L.getSubgraphShelfEntries().data[0]; });
    const key = JSON.stringify([saved.id, saved.version, saved.semanticHash]);
    await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
    await page.locator('[data-shelf-choice]').filter({ hasText: 'Reusable cleanup' }).click();
    const pinned = await snapshot(page);
    const savedWrapper = Object.values(pinned.root.nodes).find(node => node.type === 'subgraph' && node.id !== wrapperId);
    expect(savedWrapper.definition).toEqual({ id: saved.id, version: saved.version, semanticHash: saved.semanticHash });
    await wrapper.dblclick();
    await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
    await page.locator('[data-shelf-choice="boundary:output"]').click();
    await page.getByLabel('Node name', { exact: true }).fill('Another output');
    await page.locator('[data-save-boundary]').click();
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    await wrapper.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Subgraphs', exact: true }).click();
    await page.getByLabel('Save as', { exact: true }).selectOption(saved.id);
    await page.getByLabel('Subgraph name', { exact: true }).fill('Reusable cleanup');
    await page.locator('[data-save-subgraph]').click();
    const updated = await page.evaluate(async () => { const L = await import('/src/library.js?v=' + window.canvasHarness.version); return L.getSubgraphShelfEntries().data[0]; });
    expect(updated.version).toBeGreaterThan(saved.version);
    expect(updated.interface.some(port => port.label === 'Another output')).toBe(true);
    const afterUpdate = (await snapshot(page)).root;
    expect(afterUpdate.nodes[savedWrapper.id]).toEqual(pinned.root.nodes[savedWrapper.id]);
    const oldDefinition = afterUpdate.definitions[key]; expect(oldDefinition).toEqual(pinned.root.definitions[key]);
    await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
    const row = page.locator('[data-shelf-choice]').filter({ hasText: 'Reusable cleanup' });
    await expect(row).toHaveCount(1);
    await row.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(row).toHaveCount(0);
    expect((await snapshot(page)).root).toEqual(afterUpdate);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('extracting an existing subgraph preserves descendant tabs, presentation and camera through undo and redo', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness, { nestedWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const root = nestedWorkflow(); root.id = 'relocated-subgraph-views'; root.name = 'Relocated views';
        root.nodes['first/path'].x = 320; root.nodes['first/path'].y = 140;
        await h.activate(root);
    });
    await page.locator('.pc-node[data-id="first/path"] .pc-native-heading').dblclick();
    await page.locator('.pc-node[data-id="work"] .pc-native-heading').click();
    await page.getByLabel('Node name', { exact: true }).fill('My inner wrapper');
    await page.getByLabel('Node name', { exact: true }).press('Tab');
    await setCompact(page, true);
    await page.evaluate(() => window.canvasHarness.view({ x: 511, y: 193, zoom: 0.7 }));
    await page.locator('.pc-node[data-id="work"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open subgraph', exact: true }).click();
    await page.evaluate(() => window.canvasHarness.view({ x: 177, y: 81, zoom: 0.8 }));
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    const savedViews = async () => (await page.evaluate(() => window.canvasHarness.S.activeWorkspaceViews().views)).map(view => ({ ...view, portalPresentation: view.portalPresentation ?? {}, groupPresentation: view.groupPresentation ?? {} }));
    const before = await savedViews();
    const descendants = before.filter(view => view.identity.kind === 'instance');
    expect(descendants).toHaveLength(2);
    await page.locator('.pc-node[data-id="first/path"] .pc-native-heading').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Create subgraph', exact: true }).click();
    const wrapperId = await page.evaluate(() => Object.values(window.canvasHarness.S.activeWorkflow().nodes).find(node => node.type === 'subgraph' && node.id !== 'second').id);
    const relocated = descendants.map(view => ({ ...view, identity: { ...view.identity, instancePath: [wrapperId, ...view.identity.instancePath] } }));
    for (const expected of relocated) expect((await savedViews()).find(view => JSON.stringify(view.identity) === JSON.stringify(expected.identity))).toEqual(expected);
    await expect(page.locator('.pc-graph-tabs [role="tab"]')).toHaveCount(4);
    await page.locator('.pc-graph-tabs [role="tab"]').filter({ hasText: 'Outer' }).click();
    await page.getByLabel('Node name', { exact: true }).fill('Edited after extraction');
    await page.getByLabel('Node name', { exact: true }).press('Tab');
    await setCompact(page, false);
    await page.evaluate(() => window.canvasHarness.view({ x: 611, y: 230, zoom: 0.65 }));
    await page.getByRole('button', { name: /^Close Plan/ }).click();
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    const latestRelocated = (await savedViews()).filter(view => view.identity.kind === 'instance' && view.identity.instancePath.length > 1);
    const latestOriginal = latestRelocated.map(view => ({ ...view, identity: { ...view.identity, instancePath: view.identity.instancePath.slice(1) } }));
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    for (const expected of latestOriginal) expect((await savedViews()).find(view => JSON.stringify(view.identity) === JSON.stringify(expected.identity))).toEqual(expected);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    for (const expected of latestRelocated) expect((await savedViews()).find(view => JSON.stringify(view.identity) === JSON.stringify(expected.identity))).toEqual(expected);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('nested tabs first opened after extraction retain their presentation through undo and redo', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness, { nestedWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const root = nestedWorkflow(); root.id = 'new-subgraph-views'; root.name = 'New nested views';
        root.nodes['first/path'].x = 320; root.nodes['first/path'].y = 140;
        await h.activate(root);
    });
    await expect(page.locator('.pc-graph-tabs [role="tab"]')).toHaveCount(1);
    await page.locator('.pc-node[data-id="first/path"] .pc-native-heading').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Create subgraph', exact: true }).click();
    await page.locator('.pc-node[data-id="first/path"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open subgraph', exact: true }).click();
    await page.locator('.pc-node[data-id="work"] .pc-native-heading').click();
    await page.getByLabel('Node name', { exact: true }).fill('Opened after extraction');
    await page.getByLabel('Node name', { exact: true }).press('Tab');
    await setCompact(page, true);
    await page.evaluate(() => window.canvasHarness.view({ x: 611, y: 230, zoom: 0.65 }));
    await page.locator('.pc-node[data-id="work"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open subgraph', exact: true }).click();
    await page.evaluate(() => window.canvasHarness.view({ x: 700, y: 300, zoom: 0.8 }));
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    const savedViews = async () => (await page.evaluate(() => window.canvasHarness.S.activeWorkspaceViews().views)).map(view => ({ ...view, portalPresentation: view.portalPresentation ?? {}, groupPresentation: view.groupPresentation ?? {} }));
    const outgoing = (await savedViews()).filter(view => view.identity.kind === 'instance' && view.identity.instancePath.length > 1);
    expect(outgoing).toHaveLength(2);
    const incoming = outgoing.map(view => ({ ...view, identity: { ...view.identity, instancePath: view.identity.instancePath.slice(1) } }));
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    for (const expected of incoming) expect((await savedViews()).find(view => JSON.stringify(view.identity) === JSON.stringify(expected.identity))).toEqual(expected);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    for (const expected of outgoing) expect((await savedViews()).find(view => JSON.stringify(view.identity) === JSON.stringify(expected.identity))).toEqual(expected);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('effective wrapper contents survive editable body changes and explicit shelf saves from graph and library tabs', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness, { effectiveInstanceWorkflow } = await import('/tests/fixtures/workflow-effective-instance.mjs');
        const root = effectiveInstanceWorkflow(); root.mode = 'native-unified';
        root.nodes.one.nodeBindingOverrides = { '[[],"compact"]': { model: null } };
        await h.activate(root); await h.view({ x: 160, y: 50, zoom: 0.85 });
    });
    const rootSnapshot = () => page.evaluate(() => { const root = structuredClone(window.canvasHarness.S.activeWorkflow()); delete root.updatedAt; return root; });
    const before = await rootSnapshot(), wrapper = page.locator('.pc-node[data-id="one"] .pc-native-heading');
    await wrapper.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Subgraphs', exact: true }).click();
    await page.getByLabel('Subgraph name', { exact: true }).fill('Configured instance');
    await page.locator('[data-save-subgraph]').click();
    expect(await rootSnapshot()).toEqual(before);
    await wrapper.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Make editable copy', exact: true }).click();
    await page.locator('.pc-node[data-id="compact"] .pc-native-heading').click();
    await openDetailGroup(page,'Model');
    await expect(page.getByLabel('Model mode', { exact: true })).toHaveValue('block');
    await page.getByLabel('Model mode', { exact: true }).selectOption('inherit');
    await expect.poll(() => page.evaluate(async () => {
        const h = window.canvasHarness, { inspectExpandedGraph } = await import('/src/workflow/graph-validation.js?v=' + h.version);
        return inspectExpandedGraph(h.S.activeWorkflow()).data.primitives.find(unit => unit.address.instancePath[0] === 'one' && unit.address.nodeId === 'compact').node.model;
    })).toBe('parent-model');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Model mode', { exact: true })).toHaveValue('block');
    await expect(page.getByLabel('Target tokens', { exact: true })).toHaveValue('720');
    await page.getByLabel('Target tokens', { exact: true }).fill('2500');
    await page.getByLabel('Target tokens', { exact: true }).press('Tab');
    const effectiveTokens = () => page.evaluate(async () => {
        const h = window.canvasHarness, { inspectExpandedGraph } = await import('/src/workflow/graph-validation.js?v=' + h.version);
        return inspectExpandedGraph(h.S.activeWorkflow()).data.primitives.find(unit => unit.address.instancePath[0] === 'one' && unit.address.nodeId === 'compact').node.targetTokens;
    });
    await expect.poll(effectiveTokens).toBe(2500);
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect.poll(effectiveTokens).toBe(720);
    await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect.poll(effectiveTokens).toBe(2500);
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    await wrapper.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Subgraphs', exact: true }).click();
    await page.getByLabel('Subgraph name', { exact: true }).fill('Edited instance');
    await page.locator('[data-save-subgraph]').click();
    const savedValues = await page.evaluate(async () => {
        const h = window.canvasHarness, L = await import('/src/library.js?v=' + h.version), { inspectDefinitionGraph } = await import('/src/workflow/graph-validation.js?v=' + h.version);
        const snapshots = L.getSubgraphLibrary().data.definitions;
        return L.getSubgraphShelfEntries().data.map(definition => { const expanded = inspectDefinitionGraph(definition, snapshots).data.expansion; const compact = expanded.primitives.find(unit => unit.address.nodeId === 'compact').node; return { name: definition.name, targetTokens: compact.targetTokens, model: compact.model }; });
    });
    expect(savedValues).toEqual([{ name: 'Configured instance', targetTokens: 720, model: null }, { name: 'Edited instance', targetTokens: 2500, model: null }]);
    await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
    await page.locator('[data-shelf-choice]').filter({ hasText: 'Configured instance' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open saved definition', exact: true }).click();
    await page.evaluate(() => window.canvasHarness.view({ x: 320, y: 180, zoom: 0.85 }));
    await page.locator('.pc-node-subgraph .pc-native-heading').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Subgraphs', exact: true }).click();
    await expect(page.getByLabel('Subgraph name', { exact: true })).toBeVisible();
    await page.getByLabel('Subgraph name', { exact: true }).fill('Saved from library');
    await page.locator('[data-save-subgraph]').click();
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    expect(await page.evaluate(() => window.canvasHarness.toasts.filter(item => item.level === 'error'))).toEqual([]);
});

test('Create subgraph accepts Context Join, Smart Compactor, Response Plan and Generate Reply together', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        const n = (id, operation, x, y, controls = {}) => ({ id, type: 'workflow', operation, operationVersion: 1, x, y, ...controls });
        const w = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
        const edges = [w('activation', 'send', 'activation', 'generate', 'activation'), w('first-context', 'scene', 'out', 'join', 'context-1'), w('second-context', 'other-scene', 'out', 'join', 'context-2'), w('joined', 'join', 'out', 'compact', 'in'), w('compacted', 'compact', 'out', 'plan', 'in'), w('guidance', 'plan', 'out', 'generate', 'guidance'), w('reply', 'generate', 'draft', 'review', 'draft')];
        await h.activate({ id: 'pictured-generation', name: 'Pictured generation', schema: 3, runtime: 2, mode: 'native-unified', definitions: {}, portals: {}, nodes: {
            send: n('send', 'on-send', 0, 0), scene: n('scene', 'scene-context', 0, 220), 'other-scene': n('other-scene', 'scene-context', 0, 440),
            join: n('join', 'context-join', 320, 230), compact: n('compact', 'smart-compactor', 640, 230), plan: n('plan', 'response-plan', 960, 230),
            generate: n('generate', 'generate-reply', 1280, 0), review: n('review', 'review-publish', 1600, 0),
        }, wires: Object.fromEntries(edges.map(edge => [edge.id, edge])) });
        h.canvas.fit();
    });
    const before = (await snapshot(page)).root;
    await page.locator('.pc-node[data-id="join"] .pc-native-heading').click();
    for (const id of ['compact', 'plan', 'generate']) await page.locator(`.pc-node[data-id="${id}"] .pc-native-heading`).click({ modifiers: ['Shift'] });
    await expect.poll(() => page.evaluate(() => [...window.canvasHarness.canvas.multi].sort())).toEqual(['compact', 'generate', 'join', 'plan']);
    await page.locator('.pc-node[data-id="generate"] .pc-native-heading').click({ button: 'right' });
    const command = page.getByRole('menuitem', { name: 'Create subgraph', exact: true });
    await expect(command).toBeEnabled();
    await command.click();
    await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Subgraph');
    await expect(page.locator('.pc-node[data-id="generate"]')).toBeVisible();
    await expect(page.locator('.pc-node-subgraph-input')).toHaveCount(3);
    await expect(page.locator('.pc-node-subgraph-output')).toHaveCount(2);
    const state = await snapshot(page);
    expect(state.root.wires.activation.to).toBe(state.wrapper.id);
    expect(state.root.wires.reply.from).toBe(state.wrapper.id);
    expect(state.definition.body.nodes.generate.operation).toBe('generate-reply');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await snapshot(page)).root).toEqual(before);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    expect(await page.evaluate(() => window.canvasHarness.toasts.filter(item => item.level === 'error'))).toEqual([]);
});


test('Create subgraph accepts the complete lifecycle and host sources', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness, { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const n = (id, operation, x, y) => ({ ...operationDefaults(operation), id, type: 'workflow', operation, operationVersion: 1, x, y });
        const w = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
        const edges = [w('activation', 'send', 'activation', 'generate', 'activation'), w('context', 'scene', 'out', 'plan', 'in'), w('guidance', 'plan', 'out', 'generate', 'guidance'), w('reply', 'generate', 'draft', 'review', 'draft')];
        await h.activate({ id: 'complete-lifecycle-subgraph', name: 'Complete lifecycle', schema: 3, runtime: 2, mode: 'native-unified', definitions: {}, portals: {}, nodes: {
            send: n('send', 'on-send', 0, 0), scene: n('scene', 'scene-context', 0, 230), plan: n('plan', 'response-plan', 360, 230),
            generate: n('generate', 'generate-reply', 720, 0), review: n('review', 'review-publish', 1080, 0),
            memory: n('memory', 'memory', 360, 480), state: n('state', 'state', 720, 480),
        }, wires: Object.fromEntries(edges.map(edge => [edge.id, edge])) });
        h.canvas.fit();
    });
    const before = (await snapshot(page)).root;
    await page.locator('.pc-node[data-id="send"] .pc-native-heading').click();
    for (const id of ['scene', 'plan', 'generate', 'review', 'memory', 'state']) await page.locator('.pc-node[data-id="' + id + '"] .pc-native-heading').click({ modifiers: ['Shift'] });
    await expect.poll(() => page.evaluate(() => [...window.canvasHarness.canvas.multi].sort())).toEqual(['generate', 'memory', 'plan', 'review', 'scene', 'send', 'state']);
    await page.locator('.pc-node[data-id="review"] .pc-native-heading').click({ button: 'right' });
    const command = page.getByRole('menuitem', { name: 'Create subgraph', exact: true });
    await expect(command).toBeEnabled();
    await command.click();
    await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Subgraph');
    const state = await snapshot(page);
    expect(Object.values(state.root.nodes).filter(node => node.type === 'subgraph')).toHaveLength(1);
    for (const id of ['send', 'scene', 'plan', 'generate', 'review', 'memory', 'state']) expect(state.definition.body.nodes[id].operation).toBe(before.nodes[id].operation);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await snapshot(page)).root).toEqual(before);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
    expect(await page.evaluate(() => window.canvasHarness.toasts.filter(item => item.level === 'error'))).toEqual([]);
});
