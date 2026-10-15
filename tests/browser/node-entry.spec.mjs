import { test, expect } from '@playwright/test';

// Synthetic public authoring fixtures. The real controller, shared editors,
// immediate placement, validation, transaction and history remain in the loop.
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
        } else if (fixture === 'extract') {
            graph.nodes.pattern = node('pattern', 'extract', { mode:'literal', patterns:[{id:'pattern-1',literal:'old',label:''}] });
            graph.nodes.other = node('other', 'compose', { sections:[{name:'Body',text:'Synthetic text.'}] },400);
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
    const beforeIds = Object.keys((await saved(page)).nodes);
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
    await expect(configuration(page)).toHaveCount(0);
    const created = Object.values((await saved(page)).nodes).find(node => !beforeIds.includes(node.id));
    expect(created).toBeTruthy();
    await select(page, created.id);
    if(['focus','curve'].includes(variant))await choose(details(page),'Mode',variant);
    return details(page);
}
async function remount(page, id) { await page.evaluate(async () => { window.canvasHarness.canvas.select(null); await window.canvasHarness.settle(); }); await select(page, id); }
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

test('successful immediate node placement opens Details without an asynchronous panel error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    await startCreation(page, 'text-rules', 'Text Rules');
    await expect(configuration(page)).toHaveCount(0);
    const created = Object.values((await saved(page)).nodes);
    expect(created).toHaveLength(1);
    expect(created[0].operation).toBe('text-rules');
    await page.evaluate(() => window.canvasHarness.settle());
    expect(errors).toEqual([]);
    await noWork(page);
});

for (const entry of [
    { name: 'plain', text: 'though', format: 'auto', expected: [{ id: 'pattern-1', pattern: 'though' }] },
    { name: 'CSV', text: '"red, blue", green', format: 'csv', expected: [{ id: 'pattern-1', pattern: 'red, blue' }, { id: 'pattern-2', pattern: 'green' }] },
    { name: 'JSON', text: '[{"id":"authored","pattern":"001","label":"Keep"}]', format: 'json', expected: [{ id: 'authored', pattern: '001', label: 'Keep' }] },
]) test('Pattern ' + entry.name + ' edits a placed node through Details with separate placement and Save Undo', async ({ page }) => {
    await setup(page);
    const panel = await startCreation(page, 'pattern', 'Pattern');
    const placed = Object.values((await saved(page)).nodes)[0], defaults = structuredClone(placed.rules);
    await terms(panel, entry.text, entry.format);
    expect((await saved(page)).nodes[placed.id].rules).toEqual(defaults);
    await panel.getByRole('button', { name: 'Save Rules', exact: true }).click();
    expect((await saved(page)).nodes[placed.id].rules).toEqual(entry.expected);
    await undo(page); expect((await saved(page)).nodes[placed.id].rules).toEqual(defaults);
    await undo(page); expect(Object.keys((await saved(page)).nodes)).toEqual([]);
    await redo(page); await redo(page); expect((await saved(page)).nodes[placed.id].rules).toEqual(entry.expected);
    await select(page, placed.id);
    await terms(details(page), '[{"id":"edited","pattern":"changed","label":"Exact"}]', 'json');
    expect((await saved(page)).nodes[placed.id].rules).toEqual(entry.expected);
    await details(page).getByRole('button', { name: 'Save Rules', exact: true }).click();
    expect((await saved(page)).nodes[placed.id].rules).toEqual([{ id: 'edited', pattern: 'changed', label: 'Exact' }]);
    await undo(page); expect((await saved(page)).nodes[placed.id].rules).toEqual(entry.expected);
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

test('mapped TSV Replace rows keeps invalid source and located errors through placed Details remount', async ({ page }) => {
    await setup(page);
    const panel = await startCreation(page, 'pattern', 'Pattern'), placed = Object.values((await saved(page)).nodes)[0];
    const text = 'Expression\tLabel\tIdentity\nred, blue\t\tx\ngreen\tSecond\tx';
    let importer = await importDraft(panel, 'Rules', text, { pattern: 'Expression', label: 'Label', id: 'Identity' }, 'replace', '\t');
    await importer.getByRole('button', { name: 'Review import', exact: true }).click();
    await expect(importer.getByRole('alert')).toContainText('Row 3, cell 3');
    await expect(importer.getByRole('button', { name: 'Confirm import', exact: true })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Save Rules', exact: true })).toBeDisabled();
    expect((await saved(page)).nodes[placed.id].rules).toEqual(placed.rules);
    await remount(page, placed.id);
    importer = await openTable(details(page), 'Rules');
    await expect(importer.getByLabel('Table data', { exact: true })).toHaveValue(text);
    await expect(importer.getByLabel('Table delimiter', { exact: true })).toHaveValue('\t');
    await expect(importer.getByLabel('Map id column', { exact: true })).toHaveValue('Identity');
    await expect(importer.getByRole('alert')).toContainText('Row 3, cell 3');
    await importer.getByLabel('Table data', { exact: true }).fill(text.replace('Second\tx', 'Second\ty'));
    await importer.getByRole('button', { name: 'Review import', exact: true }).click();
    await importer.getByRole('button', { name: 'Confirm import', exact: true }).click();
    expect((await saved(page)).nodes[placed.id].rules).toEqual(placed.rules);
    await details(page).getByRole('button', { name: 'Save Rules', exact: true }).click();
    expect((await saved(page)).nodes[placed.id].rules).toEqual([{ id: 'x', pattern: 'red, blue', label: '' }, { id: 'y', pattern: 'green', label: 'Second' }]);
    await undo(page); expect((await saved(page)).nodes[placed.id].rules).toEqual(placed.rules);
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

test('wire creation places its selected pin immediately and a later reviewed slot edit preserves the connection', async ({ page }) => {
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
    await expect(configuration(page)).toHaveCount(0);
    const placed = Object.values((await saved(page)).nodes).find(node => node.operation === 'join');
    expect(placed).toBeTruthy(); await select(page, placed.id);
    const connected = await saved(page);
    expect(Object.values(connected.wires).some(wire => wire.from === 'source' && wire.to === placed.id && wire.toPort === 'base')).toBe(true);
    const importer = await importDraft(details(page), 'Inputs', 'id,label,required\nreplacement,New,false', { id: 'id', label: 'label', required: 'required' });
    await importer.getByRole('button', { name: 'Review import', exact: true }).click();
    await importer.getByRole('button', { name: 'Confirm import', exact: true }).click();
    await details(page).getByRole('button', { name: 'Save Inputs', exact: true }).click();
    await expect(details(page).locator('.pc-diagnostic[data-severity="error"]')).toBeVisible();
    expect(await saved(page)).toEqual(connected);
    await undo(page); expect((await saved(page)).nodes).toEqual(before.nodes); expect((await saved(page)).wires).toEqual(before.wires);
    await noWork(page);
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
    ['smart-compactor', 'Smart Compactor', '', 'pre'], ['pattern', 'Pattern', '', 'post'],
    ['filter-text', 'Filter Text', '', 'post'], ['repair', 'Repair', '', 'post'],
    ['compose', 'Compose', '', 'pre'], ['text-rules', 'Text Rules', '', 'pre'],
    ['select-fields', 'Select Fields', '', 'pre'], ['style-transfer', 'Style Transfer', '', 'pre'],
    ['format-transfer', 'Format Transfer', '', 'pre'], ['terminology-map', 'Terminology Map', '', 'pre'],
    ['context', 'Context', 'focus', 'pre'], ['state', 'State', '', 'pre'], ['state', 'State', 'curve', 'pre'],
    ['condition', 'Condition', '', 'pre'], ['join', 'Join', '', 'pre'],
    ['collect', 'Collect', '', 'pre'], ['confidence-gate', 'Confidence Gate', '', 'pre'],
    ['revise-draft', 'Revise Draft', '', 'post'], ['collection', 'Collection', '', 'pre'],
    ['context-join', 'Context Join', '', 'pre'],
    ['style-transfer', 'Style Transfer', 'reply-draft', 'post'],
    ['format-transfer', 'Format Transfer', 'reply-draft', 'post'],
    ['terminology-map', 'Terminology Map', 'reply-draft', 'post'],
    ['text-rules', 'Text Rules', 'draft', 'post'], ['compose', 'Compose', 'guidance', 'pre'],
];
for (const [operation, label, variant, phase] of routes) test(operation + (variant ? ':' + variant : '') + ' places immediately with its source-kind stage and one placement Undo', async ({ page }) => {
    await setup(page,variant&&!['focus','curve'].includes(variant)?'creation-origin':'empty'); const before = await saved(page);
    const panel = await startCreation(page, operation, label, variant);
    const graph = await saved(page), created = Object.values(graph.nodes).find(node => !Object.hasOwn(before.nodes, node.id));
    expect(created.phase).toBe(phase);
    const stage = panel.getByLabel('Workflow stage', { exact: true });
    await expect(panel.locator('header small')).toContainText(phase + ' phase');
    if (await stage.count()) await expect(stage).toHaveValue(phase);
    await expect(configuration(page)).toHaveCount(0);
    if (['focus','curve'].includes(variant)) await undo(page);
    await undo(page); expect((await saved(page)).nodes).toEqual(before.nodes); expect((await saved(page)).wires).toEqual(before.wires);
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

for(const operation of ['pattern','extract']) {
 const label=operation==='pattern'?'Rules':'Literal patterns',key=operation==='pattern'?'rules':'patterns';
 const record=(id,text)=>operation==='pattern'?{id,pattern:text}:{id,literal:text,label:''};
 test(operation+' restored Plain editor converts rows and subsequent JSON native Save retains explicit ID',async({page})=>{
  await setup(page,operation);
  await select(page,'pattern');const panel=details(page),before=(await saved(page)).nodes.pattern[key];
  await panel.getByRole('button',{name:'Use '+label+' terms',exact:true}).click();
  await panel.getByLabel(label,{exact:true}).fill('[red, blue]');await panel.getByLabel(label+' input format',{exact:true}).selectOption('plain');
  await select(page,'other');await select(page,'pattern');
  await expect(panel.getByLabel(label+' input format',{exact:true})).toHaveValue('plain');await expect(panel.getByLabel(label,{exact:true})).toHaveValue('[red, blue]');
  await panel.getByLabel(label,{exact:true}).fill('[red, blue], Mara');await panel.getByRole('button',{name:'Use '+label+' rows',exact:true}).click();
  await expect(panel.getByLabel('Pattern 1 '+(operation==='pattern'?'expression':'phrase'),{exact:true})).toHaveValue('[red, blue], Mara');
  await select(page,'other');await select(page,'pattern');await panel.getByRole('button',{name:'Edit '+label+' as JSON',exact:true}).click();
  const unfinished='[{"id":"new-rule",';await panel.getByLabel(label,{exact:true}).fill(unfinished);await panel.getByRole('button',{name:'Save '+label,exact:true}).click();
  expect((await saved(page)).nodes.pattern[key]).toEqual(before);
  await select(page,'other');await select(page,'pattern');await expect(panel.getByLabel(label,{exact:true})).toHaveValue(unfinished);
  await panel.getByRole('button',{name:'Use '+label+' terms',exact:true}).click();await expect(panel.getByLabel(label+' input format',{exact:true})).toHaveValue('json');
  await expect(panel.getByLabel(label,{exact:true})).toHaveValue(unfinished);
  await panel.getByLabel(label,{exact:true}).fill(JSON.stringify([record('new-rule','Mara')]));await panel.getByRole('button',{name:'Save '+label,exact:true}).click();
  expect((await saved(page)).nodes.pattern[key]).toEqual([record('new-rule','Mara')]);await undo(page);expect((await saved(page)).nodes.pattern[key]).toEqual(before);await noWork(page);
 });
 test(operation+' placed Details remount retains Plain CSV and invalid JSON then saves exact identity',async({page})=>{
  await setup(page);const panel=await startCreation(page,operation,operation==='pattern'?'Pattern':'Extract');
  const placed=Object.values((await saved(page)).nodes)[0];
  await panel.getByRole('button',{name:'Use '+label+' terms',exact:true}).click();await panel.getByLabel(label,{exact:true}).fill('[red, blue]');await panel.getByLabel(label+' input format',{exact:true}).selectOption('plain');
  await remount(page,placed.id);
  await expect(panel.getByLabel(label+' input format',{exact:true})).toHaveValue('plain');await expect(panel.getByLabel(label,{exact:true})).toHaveValue('[red, blue]');
  await panel.getByLabel(label+' input format',{exact:true}).selectOption('csv');await panel.getByLabel(label,{exact:true}).fill('"red, blue",green');
  await remount(page,placed.id);
  await expect(panel.getByLabel(label+' input format',{exact:true})).toHaveValue('csv');await expect(panel.getByLabel(label,{exact:true})).toHaveValue('"red, blue",green');
  await panel.getByRole('button',{name:'Use '+label+' rows',exact:true}).click();await panel.getByRole('button',{name:'Edit '+label+' as JSON',exact:true}).click();
  const unfinished='[{"unfinished":';await panel.getByLabel(label,{exact:true}).fill(unfinished);await panel.getByRole('button',{name:'Save '+label,exact:true}).click();expect((await saved(page)).nodes[placed.id][key]).toEqual(placed[key]);
  await remount(page,placed.id);
  await panel.getByRole('button',{name:'Use '+label+' terms',exact:true}).click();await expect(panel.getByLabel(label+' input format',{exact:true})).toHaveValue('json');await expect(panel.getByLabel(label,{exact:true})).toHaveValue(unfinished);
  await panel.getByLabel(label,{exact:true}).fill(JSON.stringify([record('created-id','Mara')]));await panel.getByRole('button',{name:'Save '+label,exact:true}).click();
  expect((await saved(page)).nodes[placed.id][key]).toEqual([record('created-id','Mara')]);expect((await saved(page)).nodes[placed.id].phase).toBe('post');await undo(page);expect((await saved(page)).nodes[placed.id][key]).toEqual(placed[key]);await undo(page);expect(Object.keys((await saved(page)).nodes)).toEqual([]);await noWork(page);
 });
}
