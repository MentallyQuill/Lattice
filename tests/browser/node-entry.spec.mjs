import { test, expect } from '@playwright/test';

// Synthetic public authoring fixtures. The real controller, shared editors,
// configured session, validation, transaction and history remain in the loop.
const details = page => page.getByRole('region', { name: 'Node details', exact: true });
const configuration = page => page.getByRole('dialog', { name: 'Configure node', exact: true });
const table = scope => scope.getByRole('region', { name: 'Table import', exact: true });
const quote = value => '"' + value.replaceAll('"', '""') + '"';

async function setup(page, fixture = 'empty') {
    await page.addInitScript(() => {
        window.nodeEntryEffects = { captures: 0, workers: 0, commits: 0 };
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(...args) { super(...args); window.nodeEntryEffects.workers++; }
        };
    });
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async fixture => {
        const h = window.canvasHarness;
        const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const graph = { id: 'node-entry-synthetic', name: 'Synthetic node entry', schema: 3, runtime: 2,
            mode: 'native-unified', roles: {}, nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {}, view: { x: 0, y: 0, zoom: 1 } };
        const node = (id, operation, controls = {}, x = 80) => ({ ...operationDefaults(operation), ...controls,
            id, type: 'workflow', operation, operationVersion: 1, enabled: true, x, y: 80 });
        if (fixture === 'pattern') {
            graph.nodes.pattern = node('pattern', 'pattern', { mode: 'literal', rules: [{ id: 'pattern-1', pattern: 'old', label: 'Keep' }] });
            graph.nodes.other = node('other', 'compose', { sections: [{ name: 'Body', text: 'Synthetic text.' }] }, 400);
        } else if (fixture === 'fields') graph.nodes.fields = node('fields', 'select-fields', { fields: [] });
        else if (fixture === 'null-condition') graph.nodes.condition = node('condition', 'condition', { value: null });
        else if (fixture === 'curve') graph.nodes.curve = { ...operationDefaults('state', { mode: 'curve' }), id: 'curve', type: 'workflow', operation: 'state', operationVersion: 1, enabled: true, x: 80, y: 80 };
        else if (fixture === 'creation-origin') graph.nodes.origin = node('origin','generate-reply');
        else if (fixture === 'source' || fixture === 'connected-slots') {
            graph.nodes.source = node('source', 'condition', { value: null });
            if (fixture === 'connected-slots') {
                graph.nodes.join = node('join', 'join', {}, 400);
                graph.wires.joined = { id: 'joined', route: 'wire', from: 'source', fromPort: 'out', to: 'join', toPort: 'base' };
            }
        }
        const capture = h.context.getCharacterCardFields;
        h.context.getCharacterCardFields = (...args) => { window.nodeEntryEffects.captures++; return capture(...args); };
        h.context.saveChat = async () => { window.nodeEntryEffects.commits++; };
        await h.activate(graph);
        await h.view({ x: 70, y: 20, zoom: .85 });
        window.nodeEntryEffects.captures = window.nodeEntryEffects.workers = window.nodeEntryEffects.commits = 0;
    }, fixture);
}
async function saved(page) { return page.evaluate(() => structuredClone(window.canvasHarness.graph)); }
async function noWork(page) {
    expect(await page.evaluate(() => ({ calls: window.canvasHarness.providerCalls(), effects: window.nodeEntryEffects })))
        .toEqual({ calls: 0, effects: { captures: 0, workers: 0, commits: 0 } });
}
async function select(page, id) {
    await page.evaluate(async id => { const h = window.canvasHarness; h.canvas.select({ kind: 'node', id }); await h.settle(); }, id);
    await expect(details(page)).toBeVisible();
}
async function choose(scope, label, value) {
    const control = scope.getByLabel(label, { exact: true });
    if (await control.getAttribute('role') === 'radiogroup') await control.locator(`input[value="${value}"]`).check();
    else await control.selectOption(value);
}
async function startCreation(page, operation, label, variant = '') {
    const host = page.locator('.pc-canvas-host');
    const position = await host.evaluate(element => {
        const box = element.getBoundingClientRect();
        for (let y = 40; y < box.height - 50; y += 80) for (let x = 40; x < box.width - 50; x += 80) {
            const hit = document.elementFromPoint(box.left + x, box.top + y);
            if (hit?.closest('.pc-canvas-host') === element && !hit.closest('.pc-node')) return { x, y };
        }
        throw Error('The synthetic fixture needs an empty canvas position.');
    });
    const wireVariant=variant && !['focus','curve'].includes(variant);
    if(wireVariant){const port=page.locator('.pc-port[data-node="origin"][data-port="'+(variant==='guidance'?'guidance':'draft')+'"]'),point=await port.boundingBox(),bounds=await host.boundingBox();expect(point).not.toBeNull();await page.mouse.move(point.x+point.width/2,point.y+point.height/2);await page.mouse.down();await page.mouse.move(bounds.x+position.x,bounds.y+position.y,{steps:5});await page.mouse.up();}
    else await host.dblclick({ position });
    await page.getByRole('combobox', { name: 'Search nodes and subgraphs', exact: true }).fill(label);
    await page.locator(`[data-choice="operation:${operation}${wireVariant ? ':' + variant : ''}"]`).click();
    await expect(configuration(page)).toBeVisible();
    if(['focus','curve'].includes(variant))await choose(configuration(page),'Mode',variant);
    return configuration(page);
}
async function terms(scope, text, format = 'auto') {
    const toggle = scope.getByRole('button', { name: 'Use Rules terms', exact: true });
    if (await toggle.count()) await toggle.click();
    await scope.getByLabel('Rules input format', { exact: true }).selectOption(format);
    await scope.getByLabel('Rules', { exact: true }).fill(text);
}
// Planned shared wrapper entry. Inner labels match committed ControlImport.
async function openTable(scope, label) {
    if (!await table(scope).isVisible()) await scope.getByRole('button', { name: 'Import ' + label + ' table', exact: true }).click();
    await expect(table(scope)).toBeVisible();
    return table(scope);
}
async function importDraft(scope, label, text, columns, action = 'replace', delimiter = ',') {
    const importer = await openTable(scope, label);
    await importer.getByLabel('Table delimiter', { exact: true }).selectOption(delimiter);
    await importer.getByLabel('Import action', { exact: true }).selectOption(action);
    await importer.getByLabel('Table data', { exact: true }).fill(text);
    for (const [field, header] of Object.entries(columns)) await importer.getByLabel('Map ' + field + ' column', { exact: true }).selectOption(header);
    return importer;
}
async function undo(page) { await page.getByRole('button', { name: 'Undo', exact: true }).click(); }
async function redo(page) { await page.getByRole('button', { name: 'Redo', exact: true }).click(); }

for (const entry of [
    { name: 'plain', text: 'though', format: 'auto', expected: [{ id: 'pattern-1', pattern: 'though' }] },
    { name: 'CSV', text: '"red, blue", green', format: 'csv', expected: [{ id: 'pattern-1', pattern: 'red, blue' }, { id: 'pattern-2', pattern: 'green' }] },
    { name: 'JSON', text: '[{"id":"authored","pattern":"001","label":"Keep"}]', format: 'json', expected: [{ id: 'authored', pattern: '001', label: 'Keep' }] },
]) test('Pattern ' + entry.name + ' entry uses the shared creation/details route and one Undo per save', async ({ page }) => {
    await setup(page);
    const dialog = await startCreation(page, 'pattern', 'Pattern');
    expect(Object.keys((await saved(page)).nodes)).toEqual([]);
    await terms(dialog, entry.text, entry.format);
    expect(Object.keys((await saved(page)).nodes)).toEqual([]);
    await dialog.getByRole('button', { name: 'Create node', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const created = Object.values((await saved(page)).nodes);
    expect(created).toHaveLength(1); expect(created[0].rules).toEqual(entry.expected);
    await undo(page); expect(Object.keys((await saved(page)).nodes)).toEqual([]);
    await redo(page); expect((await saved(page)).nodes[created[0].id].rules).toEqual(entry.expected);
    await select(page, created[0].id);
    await terms(details(page), '[{"id":"edited","pattern":"changed","label":"Exact"}]', 'json');
    expect((await saved(page)).nodes[created[0].id].rules).toEqual(entry.expected);
    await details(page).getByRole('button', { name: 'Save Rules', exact: true }).click();
    expect((await saved(page)).nodes[created[0].id].rules).toEqual([{ id: 'edited', pattern: 'changed', label: 'Exact' }]);
    await undo(page); expect((await saved(page)).nodes[created[0].id].rules).toEqual(entry.expected);
    await noWork(page);
});

test('mapped CSV Add rows previews exact cells, confirms a local candidate, then saves in one transaction', async ({ page }) => {
    await setup(page, 'pattern'); await select(page, 'pattern');
    const before = await saved(page);
    const importer = await importDraft(details(page), 'Rules', 'Identity,Expression,Label\nauthored,"red, blue","Color\nline"', { id: 'Identity', pattern: 'Expression', label: 'Label' }, 'add');
    await expect(importer.getByRole('button', { name: 'Confirm import', exact: true })).toBeDisabled();
    await importer.getByRole('button', { name: 'Review import', exact: true }).click();
    await expect(importer.getByRole('table', { name: 'Imported rows' })).toContainText('red, blue');
    await expect(importer.getByRole('table', { name: 'Imported rows' })).toContainText('Color\nline');
    await expect(importer.getByRole('status').first()).toContainText('1 imported row');
    expect(await saved(page)).toEqual(before);
    await importer.getByRole('button', { name: 'Confirm import', exact: true }).click();
    expect(await saved(page)).toEqual(before);
    await details(page).getByRole('button', { name: 'Save Rules', exact: true }).click();
    expect((await saved(page)).nodes.pattern.rules).toEqual([...before.nodes.pattern.rules, { id: 'authored', pattern: 'red, blue', label: 'Color\nline' }]);
    await undo(page); expect((await saved(page)).nodes.pattern.rules).toEqual(before.nodes.pattern.rules);
    await noWork(page);
});

test('mapped TSV Replace rows keeps invalid source and located errors through creation form remount', async ({ page }) => {
    await setup(page);
    const dialog = await startCreation(page, 'pattern', 'Pattern');
    const text = 'Expression\tLabel\tIdentity\nred, blue\t\tx\ngreen\tSecond\tx';
    let importer = await importDraft(dialog, 'Rules', text, { pattern: 'Expression', label: 'Label', id: 'Identity' }, 'replace', '\t');
    await importer.getByRole('button', { name: 'Review import', exact: true }).click();
    await expect(importer.getByRole('alert')).toContainText('Row 3, cell 3');
    await expect(importer.getByRole('button', { name: 'Confirm import', exact: true })).toBeDisabled();
    const create = dialog.getByRole('button', { name: 'Create node', exact: true });
    if (await create.isEnabled()) await create.click();
    expect(Object.keys((await saved(page)).nodes)).toEqual([]);
    await dialog.getByRole('button', { name: 'Configuration format', exact: true }).click();
    await expect(dialog.getByLabel('Node controls JSON', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Configuration format', exact: true }).click();
    importer = await openTable(dialog, 'Rules');
    await expect(importer.getByLabel('Table data', { exact: true })).toHaveValue(text);
    await expect(importer.getByLabel('Table delimiter', { exact: true })).toHaveValue('\t');
    await expect(importer.getByLabel('Map id column', { exact: true })).toHaveValue('Identity');
    await expect(importer.getByRole('alert')).toContainText('Row 3, cell 3');
    await importer.getByLabel('Table data', { exact: true }).fill(text.replace('Second\tx', 'Second\ty'));
    await importer.getByRole('button', { name: 'Review import', exact: true }).click();
    await importer.getByRole('button', { name: 'Confirm import', exact: true }).click();
    expect(Object.keys((await saved(page)).nodes)).toEqual([]);
    await create.click();
    const created = Object.values((await saved(page)).nodes);
    expect(created).toHaveLength(1); expect(created[0].rules).toEqual([{ id: 'x', pattern: 'red, blue', label: '' }, { id: 'y', pattern: 'green', label: 'Second' }]);
    await undo(page); expect(Object.keys((await saved(page)).nodes)).toEqual([]);
    await noWork(page);
});

test('invalid details import survives qualified selection changes and Cancel saves nothing', async ({ page }) => {
    await setup(page, 'pattern'); await select(page, 'pattern');
    const before = await saved(page), text = 'pattern,id\nnew,x\nagain,x';
    let importer = await importDraft(details(page), 'Rules', text, { pattern: 'pattern', id: 'id' });
    await importer.getByRole('button', { name: 'Review import', exact: true }).click();
    await expect(importer.getByRole('alert')).toContainText('Row 3, cell 2');
    await select(page, 'other'); await select(page, 'pattern');
    importer = await openTable(details(page), 'Rules');
    await expect(importer.getByLabel('Table data', { exact: true })).toHaveValue(text);
    await expect(importer.getByRole('alert')).toContainText('Row 3, cell 2');
    await importer.getByRole('button', { name: 'Cancel import', exact: true }).click();
    expect(await saved(page)).toEqual(before);
    importer = await openTable(details(page), 'Rules');
    await expect(importer.getByLabel('Table data', { exact: true })).toHaveValue(text);
    await noWork(page);
});

test('typed TSV fields retain literal path keys and exact null false zero empty and absent defaults', async ({ page }) => {
    await setup(page, 'fields'); await select(page, 'fields');
    const before = await saved(page);
    const text = ['Name\tPath\tRequired\tDefault', 'Null\t' + quote('["a.b,c",0]') + '\tfalse\tnull', 'Zero\t[]\t\t0', 'False\t[]\t\tfalse', 'Empty\t[]\t\t' + quote('""'), 'Absent\t[]\t\t'].join('\n');
    const importer = await importDraft(details(page), 'Fields', text, { name: 'Name', path: 'Path', required: 'Required', default: 'Default' }, 'replace', '\t');
    await importer.getByRole('button', { name: 'Review import', exact: true }).click();
    await expect(importer.getByRole('status').first()).toContainText('5 imported rows');
    expect(await saved(page)).toEqual(before);
    await importer.getByRole('button', { name: 'Confirm import', exact: true }).click();
    expect(await saved(page)).toEqual(before);
    await details(page).getByRole('button', { name: 'Save Fields', exact: true }).click();
    expect((await saved(page)).nodes.fields.fields).toEqual([{ name: 'Null', path: ['a.b,c', 0], required: false, default: null }, { name: 'Zero', path: [], default: 0 }, { name: 'False', path: [], default: false }, { name: 'Empty', path: [], default: '' }, { name: 'Absent', path: [] }]);
    await undo(page); expect((await saved(page)).nodes.fields.fields).toEqual([]);
    await noWork(page);
});

test('rejected changed-port Save retains confirmed slot rows and the saved wire', async ({ page }) => {
    await setup(page, 'connected-slots'); await select(page, 'join');
    const before = await saved(page);
    const importer = await importDraft(details(page), 'Inputs', 'id,label,required\nreplacement,New,false', { id: 'id', label: 'label', required: 'required' });
    await importer.getByRole('button', { name: 'Review import', exact: true }).click();
    await importer.getByRole('button', { name: 'Confirm import', exact: true }).click();
    await details(page).getByRole('button', { name: 'Save Inputs', exact: true }).click();
    await expect(details(page).locator('.pc-diagnostic[data-severity="error"]')).toBeVisible();
    expect(await saved(page)).toEqual(before);
    await expect(details(page).getByLabel('Slot 1 ID', { exact: true })).toHaveValue('replacement');
    await noWork(page);
});

test('wire creation still rejects a selected pin removed by a reviewed slots import', async ({ page }) => {
    await setup(page, 'source');
    const before = await saved(page);
    const origin = page.locator('.pc-port[data-node="source"][data-dir="out"]').first();
    const point = await origin.boundingBox(); expect(point).not.toBeNull();
    const host = await page.locator('.pc-canvas-host').boundingBox(); expect(host).not.toBeNull();
    await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2); await page.mouse.down();
    await page.mouse.move(host.x + host.width - 100, host.y + host.height - 100, { steps: 5 }); await page.mouse.up();
    await page.getByRole('combobox', { name: 'Search nodes and subgraphs', exact: true }).fill('Join');
    await page.locator('[data-choice="operation:join"]').click();
    const pins = page.getByRole('dialog', { name: 'Choose connection port', exact: true });
    await expect(pins).toBeVisible(); await pins.locator('[data-port="base"]').click();
    const dialog = configuration(page); await expect(dialog).toBeVisible();
    const importer = await importDraft(dialog, 'Inputs', 'id,label,required\nreplacement,New,false', { id: 'id', label: 'label', required: 'required' });
    await importer.getByRole('button', { name: 'Review import', exact: true }).click();
    await importer.getByRole('button', { name: 'Confirm import', exact: true }).click();
    await dialog.getByRole('button', { name: 'Create node', exact: true }).click();
    await expect(dialog.locator('.pc-diagnostic[data-severity="error"]')).toContainText('CONFIGURATION_PORT_CHANGED');
    await expect(dialog.locator('.pc-diagnostic[data-severity="error"]')).toContainText('compatible output and input pins');
    expect(await saved(page)).toEqual(before);
    await dialog.getByRole('button', { name: 'Close node configuration', exact: true }).click();
    expect(await saved(page)).toEqual(before); await noWork(page);
});

test('Condition null and State curve durations retain their real dynamic friendly editors', async ({ page }) => {
    await setup(page, 'null-condition'); await select(page, 'condition');
    await expect(details(page).getByLabel('Value type', { exact: true })).toHaveValue('null');
    await details(page).getByRole('button', { name: 'Save Value', exact: true }).click();
    expect((await saved(page)).nodes.condition.value).toBeNull();
    await noWork(page);
    await setup(page, 'curve'); await select(page, 'curve');
    const phases = details(page).locator('details[data-control-group="Phases"]');
    await phases.locator('summary').click();
    await expect(details(page).getByLabel('Duration 1 steps', { exact: true })).toHaveValue('1');
    await details(page).getByLabel('Duration 1 steps', { exact: true }).fill('2');
    await details(page).getByLabel('Duration 1 steps', { exact: true }).press('Tab');
    await details(page).getByRole('button', { name: 'Save Phase durations', exact: true }).click();
    expect((await saved(page)).nodes.curve.durations.onset).toBe(2);
    await undo(page); expect((await saved(page)).nodes.curve.durations.onset).toBe(1);
    await noWork(page);
});

// Remaining N7 routes: N5 owns seven schema operations; N6 owns Decision/Advance Time.
const routes = [
    ['smart-compactor', 'Smart Compactor', '', 'pre', true], ['pattern', 'Pattern', '', 'post', true],
    ['filter-text', 'Filter Text', '', 'post', true], ['repair', 'Repair', '', 'post', true],
    ['compose', 'Compose', '', 'pre', false], ['text-rules', 'Text Rules', '', 'pre', false],
    ['select-fields', 'Select Fields', '', 'pre', false], ['style-transfer', 'Style Transfer', '', 'pre', false],
    ['format-transfer', 'Format Transfer', '', 'pre', false], ['terminology-map', 'Terminology Map', '', 'pre', false],
    ['context', 'Context', 'focus', 'pre', false], ['state', 'State', '', 'pre', false], ['state', 'State', 'curve', 'pre', false],
    ['condition', 'Condition', '', 'pre', false], ['join', 'Join', '', 'pre', false],
    ['collect', 'Collect', '', 'pre', false], ['confidence-gate', 'Confidence Gate', '', 'pre', false],
    ['revise-draft', 'Revise Draft', '', 'post', true], ['collection', 'Collection', '', 'pre', false],
    ['context-join', 'Context Join', '', 'pre', true],
    ['style-transfer', 'Style Transfer', 'reply-draft', 'post', true],
    ['format-transfer', 'Format Transfer', 'reply-draft', 'post', true],
    ['terminology-map', 'Terminology Map', 'reply-draft', 'post', true],
    ['text-rules', 'Text Rules', 'draft', 'post', true], ['compose', 'Compose', 'guidance', 'pre', true],
];
for (const [operation, label, variant, phase, locked] of routes) test(operation + (variant ? ':' + variant : '') + ' opens configuration with its source-kind stage and Cancel leaves no creation step', async ({ page }) => {
    await setup(page,variant&&!['focus','curve'].includes(variant)?'creation-origin':'empty'); const before = await saved(page);
    const dialog = await startCreation(page, operation, label, variant);
    await expect(dialog.getByLabel('Node stage', { exact: true })).toHaveValue(phase);
    if (locked) await expect(dialog.getByLabel('Node stage', { exact: true })).toBeDisabled();
    else await expect(dialog.getByLabel('Node stage', { exact: true })).toBeEnabled();
    expect(await saved(page)).toEqual(before);
    await dialog.getByRole('button', { name: 'Close node configuration', exact: true }).click();
    await expect(dialog).toHaveCount(0); expect(await saved(page)).toEqual(before);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await noWork(page);
});


test('unsaved Plain Pattern terms remain the import Add base after real selection remount',async({page})=>{
 await setup(page,'pattern');await select(page,'pattern');const before=await saved(page);
 await terms(details(page),'local','json');await details(page).getByLabel('Rules input format',{exact:true}).selectOption('plain');
 await importDraft(details(page),'Rules','Expression,ID\nadded,added',{pattern:'Expression',id:'ID'},'add');await select(page,'other');await select(page,'pattern');
 const importer=table(details(page));await expect(importer.getByLabel('Table data',{exact:true})).toHaveValue('Expression,ID\nadded,added');await importer.getByRole('button',{name:'Review import',exact:true}).click();await importer.getByRole('button',{name:'Confirm import',exact:true}).click();expect(await saved(page)).toEqual(before);
 await details(page).getByRole('button',{name:'Save Rules',exact:true}).click();expect((await saved(page)).nodes.pattern.rules).toEqual([{id:'pattern-1',pattern:'local',label:'Keep'},{id:'added',pattern:'added'}]);
 await undo(page);expect((await saved(page)).nodes.pattern.rules).toEqual(before.nodes.pattern.rules);await noWork(page);
});
