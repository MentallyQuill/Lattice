import { test, expect } from '@playwright/test';
async function setup(page) {
    await page.addInitScript(() => { const disk = window.systemDisk = { text: '', version: 1 }; const handle = { name: 'Systems.workflow.json', async queryPermission() { return 'granted'; }, async isSameEntry(other) { return other === handle; }, async getFile() { return new File([disk.text], handle.name, { lastModified: disk.version }); }, async createWritable() { let text; return { async write(value) { text = value; }, async close() { disk.text = text; disk.version++; }, async abort() { } }; } }; window.showSaveFilePicker = async () => handle; window.showOpenFilePicker = async () => [handle]; });
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => {
        const h = window.canvasHarness, { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version), { computeDefinitionIdentity, definitionRefKey } = await import('/src/workflow/definitions.js?v=' + h.version), L = await import('/src/library.js?v=' + h.version);
        const node = (id, operation, settings = {}) => ({ id, type: 'workflow', ...operationDefaults(operation), ...settings }), wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
        const identity = computeDefinitionIdentity({ id: 'weather-system', version: 1, name: 'Weather', parameters: [], interface: [{ id: 'guidance', label: 'Guidance', direction: 'output', kind: 'guidance', required: false, cardinality: 'one', boundaryNodeId: 'output' }], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { compose: node('compose', 'compose', { outputKind: 'guidance', sections: [{ name: 'weather', text: 'Rain over the harbor.' }], x: 100, y: 80 }), output: { id: 'output', type: 'subgraph-output', interfacePortId: 'guidance', x: 460, y: 80 } }, wires: { out: wire('out', 'compose', 'out', 'output', 'in') } } });
        if (!identity.ok)
            throw Error(JSON.stringify(identity));
        const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
        if (!L.installSubgraphDefinition(definition, {}).ok)
            throw Error('Cannot install saved helper');
        const ref = { id: definition.id, version: definition.version, semanticHash: definition.semanticHash };
        const graph = { id: 'system-main', name: 'Harbor systems', schema: 3, runtime: 2, mode: 'native-unified', nodes: { send: node('send', 'on-send', { x: 0, y: 0 }), generate: node('generate', 'generate-reply', { x: 800, y: 0 }), review: node('review', 'review-publish', { x: 1150, y: 0 }), merge: node('merge', 'compose', { x: 430, y: 0, outputKind: 'guidance', mode: 'template', template: '{{section:base}}', sections: [{ name: 'base', text: 'Keep the scene grounded.' }] }), origin: { id: 'origin', type: 'subgraph', definition: ref, parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {}, x: 0, y: 200 } }, wires: { send: wire('send', 'send', 'activation', 'generate', 'activation'), review: wire('review', 'generate', 'draft', 'review', 'draft'), guidance: wire('guidance', 'merge', 'out', 'generate', 'guidance') }, definitions: { [definitionRefKey(definition)]: definition }, portals: {} };
        await h.activate(graph);
        await h.view({ x: 90, y: 80, zoom: .7 });
    });
}
async function authoredGraph(page) { return page.evaluate(() => { const graph = structuredClone(window.canvasHarness.graph); delete graph.updatedAt; return graph; }); }
async function menu(page, group, name) { await page.getByRole('menuitem', { name: group, exact: true }).click(); await page.getByRole('menuitem', { name, exact: true }).click(); }
async function openAdd(page) { await menu(page, 'Workflow', 'Add system…'); await expect(page.getByRole('dialog', { name: 'Add system', exact: true })).toBeVisible(); }
async function openAssistance(page, instanceId) { await page.locator('.pc-graph-tabs [role="tab"]').first().click(); await page.locator(`.pc-node[data-id="${instanceId}"] .pc-native-heading`).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Configure system connections…', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Configure system connections', exact: true })).toBeVisible(); }
async function preview(page) { await page.getByLabel('System Guidance output', { exact: true }).selectOption('guidance'); await page.getByLabel('Guidance merge destination', { exact: true }).selectOption('merge'); await page.getByRole('button', { name: 'Preview connections', exact: true }).click(); await expect(page.getByText('Connection preview', { exact: true })).toBeVisible(); await expect(page.getByText(/Template:[\s\S]*section:Weather/)).toBeVisible(); }
test('Add system from pinned child previews an effective template merge, supports edit/skip/history and saves opened tabs', async ({ page }) => {
    await setup(page);
    await page.locator('.pc-node[data-id="origin"] .pc-native-heading').dblclick();
    await expect(page.locator('.pc-graph-tabs [aria-selected="true"] [aria-label="Read only"]')).toBeVisible();
    const before = await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes));
    await openAdd(page);
    await page.screenshot({ path: '.tmp/workflow-systems/screenshots/add-system-selection-wide.png' });
    await page.setViewportSize({ width: 760, height: 650 });
    await page.screenshot({ path: '.tmp/workflow-systems/screenshots/add-system-selection-narrow.png' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.getByRole('button', { name: 'Add system', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Preview connections', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add system', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Add system', exact: true })).toHaveCount(0);
    const instanceId = await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).find(n => n.type === 'subgraph' && n.id !== 'origin').id);
    const placed = await authoredGraph(page);
    await openAssistance(page, instanceId);
    await preview(page);
    await page.screenshot({ path: '.tmp/workflow-systems/screenshots/add-system-preview-wide.png' });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await authoredGraph(page)).toEqual(placed);
    await openAssistance(page, instanceId); await preview(page);
    await page.getByRole('button', { name: 'Apply configuration', exact: true }).click();
    expect(await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).filter(n => n.type === 'subgraph').length)).toBe(2);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await authoredGraph(page)).toEqual(placed);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await page.evaluate(() => Object.keys(window.canvasHarness.graph.nodes))).toEqual(before);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    await page.locator(`.pc-node[data-id="${instanceId}"] .pc-native-heading`).dblclick();
    await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Weather');
    await page.locator('.pc-node[data-id="compose"] .pc-native-heading').click();
    await page.getByLabel('Section 1 text', { exact: true }).fill('Clear weather after rain.');
    await page.getByRole('button', { name: 'Save Sections', exact: true }).click();
    await expect.poll(() => page.evaluate(id => { const h = window.canvasHarness, n = h.graph.nodes[id]; return h.graph.definitions[JSON.stringify([n.definition.id, n.definition.version, n.definition.semanticHash])].body.nodes.compose.sections[0].text; }, instanceId)).toBe('Clear weather after rain.');
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    await page.locator(`.pc-node[data-id="${instanceId}"] .pc-native-heading`).click();
    await expect(page.getByLabel('Run this system', { exact: true })).toBeChecked();
    await page.screenshot({ path: '.tmp/workflow-systems/screenshots/system-enabled-wide.png' });
    await page.getByLabel('Run this system', { exact: true }).uncheck();
    await expect.poll(() => page.evaluate(id => window.canvasHarness.graph.nodes[id].enabled, instanceId)).toBe(false);
    await expect(page.getByText('System skipped', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Run this system', { exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.getByLabel('Run this system', { exact: true })).not.toBeChecked();
    await page.locator(`.pc-node[data-id="${instanceId}"] .pc-native-heading`).dblclick();
    await menu(page, 'File', 'Save As…');
    await expect.poll(() => page.evaluate(() => systemDisk.text.length)).toBeGreaterThan(0);
    const saved = await page.evaluate(() => JSON.parse(systemDisk.text));
    expect(saved.workspaceViews.views.filter(v => v.identity.kind === 'instance' && v.open).length).toBeGreaterThanOrEqual(2);
    await menu(page, 'File', 'Open workflow…');
    await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Weather');
    expect(await page.evaluate(id => window.canvasHarness.graph.nodes[id].enabled, instanceId)).toBe(false);
    await page.locator('.pc-graph-tabs [role="tab"]').first().click();
    await page.locator(`.pc-node[data-id="${instanceId}"] .pc-native-heading`).click();
    await page.getByLabel('Run this system', { exact: true }).check();
    await page.screenshot({ path: '.tmp/workflow-systems/screenshots/system-enabled-final.png' });
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});


test('two successive Add system commands from child tabs place separate vacant Main wrappers',async({page})=>{
 await setup(page);await page.locator('.pc-node[data-id="origin"] .pc-native-heading').dblclick();
 for(let i=0;i<2;i++){await openAdd(page);await page.getByRole('button',{name:'Add system',exact:true}).click();await expect(page.getByRole('dialog',{name:'Add system',exact:true})).toHaveCount(0);}
 await page.locator('.pc-graph-tabs [role="tab"]').first().click();
 const boxes=await page.locator('.pc-node.pc-node-subgraph').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {id:node.dataset.id,x:b.x,y:b.y,right:b.right,bottom:b.bottom};}));expect(boxes).toHaveLength(3);
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];expect(a.right<=b.x||a.x>=b.right||a.bottom<=b.y||a.y>=b.bottom).toBe(true);}
 await page.screenshot({path:'.tmp/workflow-systems/screenshots/repeated-add-system-main.png'});expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
