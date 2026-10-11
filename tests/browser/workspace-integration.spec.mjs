import { rootCommand, expectRootBusy } from './workflow-commands.mjs';
import { test, expect } from '@playwright/test';
async function activate(page,fixture='nestedWorkflow') {
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 const id=await page.evaluate(async fixture=>{const h=window.canvasHarness;const { [fixture==='portalWorkflow'?'siblingWorkflow':fixture]: create }=await import('/tests/fixtures/workflow-prepared-fixture.mjs');const root=create();if(fixture==='portalWorkflow'){const {computeDefinitionIdentity,definitionRefKey}=await import('/src/workflow/definitions.js?v='+h.version);const draft=structuredClone(Object.values(root.definitions)[0]);delete draft.semanticHash;draft.body.portals={publisher:{id:'publisher',label:'Saved publisher',kind:'guidance',source:{nodeId:'work',portId:'out'}}};draft.body.wires.b={id:'b',route:'portal',portalId:'publisher',to:'exit',toPort:'in'};const checked=computeDefinitionIdentity(draft);const definition={...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash},ref={id:definition.id,version:definition.version,semanticHash:definition.semanticHash};root.definitions={[definitionRefKey(ref)]:definition};root.nodes['first/path'].definition=ref;root.nodes.second.definition=ref;}root.name='Actual workspace integration';await h.activate(root);window.workspaceRootId=root.id;return root.id;},fixture);
 await page.evaluate(()=>window.canvasHarness.settle());expect(await page.evaluate(()=>window.canvasHarness.canvas.graph.id)).toBe(id);return id;
}
async function subgraphCommand(page, id, command) {
 await page.locator(`.pc-node-native[data-id="${id}"] .pc-native-heading`).click({button:'right'});
 await page.getByRole('menuitem',{name:command,exact:true}).click();
}
async function openShelfDefinition(page, key) {
 await page.locator('.pc-family-row[data-family="Subgraphs"]').click();
 await page.locator('[data-shelf-choice='+JSON.stringify('definition:'+key)+']').click({button:'right'});
 await page.getByRole('menuitem',{name:'Open saved definition',exact:true}).click();
}
test('real activated child tabs retain root identity, camera and readonly alias without document/history edits',async({page})=>{
 const id=await activate(page);await page.evaluate(()=>{const context=window.canvasHarness.context;context.extensionSettings.connectionManager ??={profiles:[]};const manager=context.extensionSettings.connectionManager,profiles=manager.profiles;window.workspaceBindingReads=0;Object.defineProperty(manager,'profiles',{configurable:true,get(){window.workspaceBindingReads++;return profiles;}});});const before=await page.evaluate(id=>JSON.stringify(window.canvasHarness.S.activeWorkflow()),id);
 await page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading').dblclick();await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Outer');await expect(page.locator('.pc-graph-location')).toContainText('Outer');
 await page.locator('.pc-node-native[data-id="work"]').click();await expect(page.getByLabel('Node name',{exact:true})).toBeEnabled();await page.getByLabel('Node name',{exact:true}).fill('Local wrapper alias');await page.getByLabel('Node name',{exact:true}).press('Tab');
 await page.getByRole('button',{name:'Graph',exact:true}).click();await page.getByRole('menuitem',{name:'Zoom in',exact:true}).click();await settleCamera(page);const childCamera=await page.evaluate(()=>({...window.canvasHarness.canvas.view}));
 await graphTab(page,{name:'Actual workspace integration',exact:true}).click();await graphTab(page,{name:/Outer/}).click();expect(await page.evaluate(()=>({...window.canvasHarness.canvas.view}))).toEqual(childCamera);
 expect(await page.evaluate(id=>JSON.stringify(window.canvasHarness.S.activeWorkflow()),id)).toBe(before);await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();await expect(page.getByLabel('Node name',{exact:true})).toHaveValue('Local wrapper alias');expect(await page.evaluate(()=>window.workspaceBindingReads)).toBe(0);
});
test('local copy uses the real editable parent, then child body edits take one root history step',async({page})=>{
 const id=await activate(page,'siblingWorkflow');await subgraphCommand(page,'first/path','Make editable copy');
 const owned=await page.evaluate(id=>window.canvasHarness.S.activeWorkflow().localDefinitionOwners,id);expect(owned).toEqual(expect.arrayContaining([expect.objectContaining({instancePath:['first/path']})]));
 await page.locator('.pc-node-native[data-id="work"]').click();await expect(page.getByLabel('Instructions',{exact:true})).toBeEnabled();await page.getByLabel('Instructions',{exact:true}).fill('Owned body edit');await page.getByLabel('Instructions',{exact:true}).press('Tab');
 const savedInstructions=await page.evaluate(id=>{const root=window.canvasHarness.S.activeWorkflow();return root.definitions[JSON.stringify([root.nodes['first/path'].definition.id,root.nodes['first/path'].definition.version,root.nodes['first/path'].definition.semanticHash])].body.nodes.work.instructions;},id);expect(savedInstructions).toBe('Owned body edit');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('Instructions',{exact:true})).toHaveValue('');await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await page.evaluate(id=>window.canvasHarness.S.activeWorkflow().nodes['first/path'].localCopy,id)).toBeUndefined();await expect(page.getByLabel('Instructions',{exact:true})).toBeDisabled();
});
test('actual library inspection opens the exact nested pin and cannot gain runtime edit authority',async({page})=>{
 const id=await activate(page);await subgraphCommand(page,'first/path','Open saved definition');
 await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Outer');await page.locator('.pc-node-native[data-id="work"] .pc-native-heading').dblclick();await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Plan');
 await page.locator('.pc-node-native[data-id="work"]').click();await expect(page.getByLabel('Instructions',{exact:true})).toBeDisabled();await expect(page.getByLabel('Node name',{exact:true})).toBeEnabled();
 const state=await page.evaluate(id=>({root:window.canvasHarness.S.activeWorkflow().id,drawId:window.canvasHarness.canvas.graph.id,readOnly:window.canvasHarness.canvas.hooks.nativeScope()}),id);expect(state.root).toBe(id);expect(state.drawId).toBeUndefined();expect(state.readOnly.workflowId).toBeUndefined();
});

test('readonly portal manager writes a scoped local label and retains the authored root document',async({page})=>{
 const id=await activate(page,'portalWorkflow'),before=await page.evaluate(id=>JSON.stringify(window.canvasHarness.S.activeWorkflow()),id);
 await page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading').dblclick();await page.locator('.pc-details-heading').getByRole('button',{name:'Portals',exact:true}).click();
 await expect(page.getByLabel('Portal name',{exact:true})).toHaveValue('Saved publisher');await expect(page.locator('[data-portal-create]')).toBeDisabled();await page.getByLabel('Portal name',{exact:true}).fill('Local label');await page.locator('[data-portal-rename]').click();await expect(page.getByLabel('Portal name',{exact:true})).toHaveValue('Local label');await page.getByRole('button',{name:'Close',exact:true}).click();
 expect(await page.evaluate(id=>JSON.stringify(window.canvasHarness.S.activeWorkflow()),id)).toBe(before);await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
 const persisted=await page.evaluate(()=>window.canvasHarness.S.activeWorkspaceViews());const child=persisted.views.find(view=>view.identity.kind==='instance');expect(child.portalPresentation.publisher.label).toBe('Local label');expect(child.portalPresentation.publisher.source).toEqual({nodeId:'work',portId:'out'});
});

test('production node search commits an actual root candidate as one undoable step',async({page})=>{
 const id=await activate(page,'siblingWorkflow'),before=await page.evaluate(id=>Object.keys(window.canvasHarness.S.activeWorkflow().nodes),id),host=page.locator('.pc-canvas-host'),box=await host.boundingBox();
 await host.dblclick({position:{x:box.width-40,y:box.height-80}});await expect(page.getByRole('dialog',{name:'Add node',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Search nodes and subgraphs',exact:true}).fill('Compose');await page.locator('[data-choice="operation:compose"]').click();
 const after=await page.evaluate(id=>Object.keys(window.canvasHarness.S.activeWorkflow().nodes),id);expect(after.length).toBe(before.length+1);await expect(page.getByRole('dialog',{name:'Add node',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await page.evaluate(id=>Object.keys(window.canvasHarness.S.activeWorkflow().nodes),id)).toEqual(before);
});


test('a genuine deferred root run survives child open close reopen and cached view operations',async({page,context})=>{
 let releaseWorker,workerRequested=false;const gate=new Promise(resolve=>{releaseWorker=resolve;});
 await page.clock.install();
 await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:`const context=()=>globalThis.SillyTavern.getContext();export const isGenerating=()=>false;export function syncMesToSwipe(index){const m=context().chat[index];m.swipe_info[m.swipe_id]={extra:structuredClone(m.extra||{})};return true;}export function syncSwipeToMes(index,swipeId){const m=context().chat[index];m.swipe_id=swipeId;m.mes=m.swipes[swipeId];Object.assign(m,structuredClone(m.swipe_info[swipeId]));return true;}`}));
 await context.route(/\/(?:text-rules-worker|worker-entry)(?:[./-]|$)/,async route=>{workerRequested=true;await gate;await route.continue();});
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 const id=await page.evaluate(async()=>{
  const h=window.canvasHarness,v=h.version;const {starterGraph}=await import('/src/workflow/starters.js?v='+v);const {parseSubgraph}=await import('/src/workflow/packages.js?v='+v);const {definitionRefKey}=await import('/src/workflow/definitions.js?v='+v);
  const graph=starterGraph('literal-cleanup'),parsed=parseSubgraph(await(await fetch('/workflows/subgraphs/literal-cleanup.json')).text());if(!parsed.ok)throw new Error(parsed.error.message);const definition=parsed.data.definition,old=graph.nodes['text-rules'];graph.definitions={...parsed.data.definitions,[definitionRefKey(definition)]:definition};graph.nodes[old.id]={id:old.id,type:'subgraph',definition:{id:definition.id,version:definition.version,semanticHash:definition.semanticHash},parameterOverrides:{},roleOverrides:{},nodeBindingOverrides:{},x:old.x,y:old.y};graph.wires['wire-1'].toPort='draft';graph.wires['wire-2'].fromPort='patches';
  Object.assign(h.context,{chatId:'workspace-deferred',characterId:1,groupId:null});h.context.chat.splice(0,h.context.chat.length,{mes:'Continue.',is_user:true},{mes:'It was very very quiet.',is_user:false,swipe_id:0,swipes:['It was very very quiet.'],swipe_info:[{extra:{},gen_started:1,gen_finished:2}],extra:{},gen_started:1,gen_finished:2});await h.activate(graph);await(await import('/src/run.js?v='+v)).initializeNativeWorkflowController();return graph.id;
 });
 await page.evaluate(()=>window.canvasHarness.settle());const before=await page.evaluate(id=>JSON.stringify(window.canvasHarness.S.activeWorkflow()),id);
 await page.locator('.pc-node-native[data-id="text-rules"] .pc-native-heading').dblclick();await page.getByRole('button',{name:/^Close Literal cleanup/}).click();
 // Keep the deliberately blocked Worker inside its real one-second deadline
 // while browser actions run; advance only the camera animation below.
 await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
 await rootCommand(page);await expect.poll(async()=>workerRequested?true:await page.evaluate(async()=>{const h=window.canvasHarness,r=(await import('/src/run.js?v='+h.version)).getNativeWorkflowController().lastResult();return r?.error??false;})).toBe(true);
 await page.evaluate(async()=>{
  const h=window.canvasHarness,c=h.context,runtime=(await import('/src/run.js?v='+h.version)).getNativeWorkflowController();const counts=window.workspaceRunViewCounts={bindings:0,snapshotSource:0,tokens:0,lore:0,freshness:0,cancel:0};const manager=c.extensionSettings.connectionManager??={profiles:[]},profiles=manager.profiles,chat=c.chat;Object.defineProperty(manager,'profiles',{configurable:true,get(){counts.bindings++;return profiles;}});Object.defineProperty(c,'chat',{configurable:true,get(){counts.snapshotSource++;return chat;}});for(const [key,count]of [['getTokenCountAsync','tokens'],['getWorldInfoPrompt','lore']]){const original=c[key];c[key]=function(...args){counts[count]++;return original.apply(this,args);};}for(const [key,count]of [['candidateStatus','freshness'],['cancel','cancel']]){const original=runtime[key];runtime[key]=function(...args){counts[count]++;return original.apply(this,args);};}window.workspaceRunRuntime=runtime;
 });
 try {
  await page.getByRole('button',{name:'Graph view actions',exact:true}).click();await page.getByRole('menuitem',{name:/^Reopen Literal cleanup/}).click();await page.getByRole('button',{name:'Graph',exact:true}).click();await page.getByRole('menuitem',{name:'Zoom in',exact:true}).click();await page.clock.runFor(200);await page.locator('.pc-node-native[data-id="rules"] .pc-native-heading').click();await page.getByRole('button',{name:/^Close Literal cleanup/}).click();await page.getByRole('button',{name:'Graph view actions',exact:true}).click();await page.getByRole('menuitem',{name:/^Reopen Literal cleanup/}).click();
  expect(await page.evaluate(()=>window.workspaceRunViewCounts)).toEqual({bindings:0,snapshotSource:0,tokens:0,lore:0,freshness:0,cancel:0});await expectRootBusy(page,true);
 } finally {releaseWorker();await page.clock.resume();}
 await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');await expect(page.locator('.pc-graph-tabs [role="tab"][aria-selected="true"]')).toContainText('Literal cleanup');const result=await page.evaluate(()=>{const result=window.workspaceRunRuntime.lastResult();return {ok:result.ok,mode:result.mode,calls:result.actualCalls};});expect(result).toEqual({ok:true,mode:'root',calls:0});expect(await page.evaluate(id=>JSON.stringify(window.canvasHarness.S.activeWorkflow()),id)).toBe(before);
});


test('native canvas keeps a flat default and quiet meter while camera tools stay accessible in Graph menu',async({page})=>{
 await page.setViewportSize({width:320,height:900});const id=await activate(page,'siblingWorkflow'),before=await page.evaluate(id=>JSON.stringify(window.canvasHarness.S.activeWorkflow()),id);
 await expect(page.locator('.pc-status')).toHaveCount(0);await expect(page.getByRole('toolbar',{name:'Canvas tools'})).toHaveCount(0);await expect(page.locator('.pc-gesture-hint')).toHaveCount(0);expect(await page.locator('.pc-canvas-host').evaluate(element=>getComputedStyle(element).backgroundImage)).toBe('none');
 const graph=await page.locator('.pc-canvas-area').boundingBox(),meter=await page.locator('.pc-run-meter').boundingBox();expect(meter.x).toBeGreaterThanOrEqual(graph.x);expect(meter.y+meter.height).toBeLessThanOrEqual(graph.y+graph.height);await expect(page.getByRole('checkbox',{name:'Arm',exact:true})).toBeVisible();
 const camera=async label=>{await page.getByRole('button',{name:'Graph',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();await settleCamera(page);};await camera('Pan tool');expect(await page.evaluate(()=>window.canvasHarness.canvas.mode)).toBe('pan');await camera('Select tool');expect(await page.evaluate(()=>window.canvasHarness.canvas.mode)).toBe('select');const zoom=await page.evaluate(()=>window.canvasHarness.canvas.view.zoom);await camera('Zoom in');expect(await page.evaluate(()=>window.canvasHarness.canvas.view.zoom)).toBeGreaterThan(zoom);await camera('Zoom out');expect(await page.evaluate(()=>window.canvasHarness.canvas.view.zoom)).toBeCloseTo(zoom,5);await camera('Fit to view');expect(await page.evaluate(id=>JSON.stringify(window.canvasHarness.S.activeWorkflow()),id)).toBe(before);
 await page.evaluate(async()=>{const h=window.canvasHarness,theme=await import('/src/theme.js?v='+h.version);theme.setStyle('grid','lines');theme.applyTheme();h.UI.refreshIfOpen();});expect(await page.locator('.pc-canvas-host').evaluate(element=>getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
 expect(await page.evaluate(()=>window.canvasHarness.S.activeWorkflow().schema===3&&window.canvasHarness.S.activeWorkflow().runtime===2)).toBe(true);
});


function graphTab(page, options) { return page.locator('.pc-graph-tabs').getByRole('tab', options); }
async function settleCamera(page) { await expect.poll(() => page.evaluate(() => window.canvasHarness.canvas.host.classList.contains('pc-interacting'))).toBe(false); }
function editItem(page, name) {
    return page.getByRole('menuitem', { name, exact: true });
}
async function editCommand(page, name) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await editItem(page, name).click();
}
async function ownedChild(page) {
    const id = await activate(page, 'siblingWorkflow');
    await subgraphCommand(page, 'first/path', 'Make editable copy');
    return id;
}

test('actual root selection survives view roundtrips with matching paint and one undoable Delete', async ({ page }) => {
    const id = await activate(page, 'siblingWorkflow');
    await page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading').dblclick();
    const child = graphTab(page, { name: /Plan/ }), root = graphTab(page, { name: 'Actual workspace integration', exact: true });
    await root.click();
    await page.evaluate(async () => {
        const h = window.canvasHarness, node = h.canvas.graph.nodes.one;
        await h.view({ x: 320 - node.x * .8, y: 180 - node.y * .8, zoom: .8 });
    });
    await page.locator('.pc-node-native[data-id="one"] .pc-native-heading').click();
    await child.click(); await root.click();
    expect(await page.evaluate(() => window.canvasHarness.canvas.selection)).toEqual({ kind: 'node', id: 'one' });
    await expect(page.locator('.pc-node-native[data-id="one"]')).toHaveClass(/pc-selected/);
    const deletionPrompts = [];
    page.on('dialog', async dialog => { deletionPrompts.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); });
    await page.locator('.pc-canvas-host').focus(); await page.keyboard.press('Delete');
    await expect.poll(() => page.evaluate(id => !!window.canvasHarness.S.activeWorkflow().nodes.one, id)).toBe(false);
    expect(deletionPrompts).toEqual([]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await page.evaluate(id => !!window.canvasHarness.S.activeWorkflow().nodes.one, id)).toBe(true);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    // Dispatch the actual MouseEvents used by cable selection to the SVG hit target.
    // Native pin dragging uses pointer capture; cable selection remains the accepted mouse path.
    await page.locator('.pc-wire-hit[data-id="a"]').dispatchEvent('mousedown', { button: 0, buttons: 1 });
    await page.locator('.pc-wire-hit[data-id="a"]').dispatchEvent('mouseup', { button: 0, buttons: 0 });
    expect(await page.evaluate(() => window.canvasHarness.canvas.selection)).toEqual({ kind: 'wire', id: 'a' });
    await expect(page.locator('.pc-wire[data-id="a"]')).toHaveClass(/pc-selected/);
    await child.click(); await root.click();
    expect(await page.evaluate(() => window.canvasHarness.canvas.selection)).toEqual({ kind: 'wire', id: 'a' });
    await expect(page.locator('.pc-wire[data-id="a"]')).toHaveClass(/pc-selected/);
    await editCommand(page, 'Delete selection');
    await expect.poll(() => page.evaluate(id => !!window.canvasHarness.S.activeWorkflow().wires.a, id)).toBe(false);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await page.evaluate(id => !!window.canvasHarness.S.activeWorkflow().wires.a, id)).toBe(true);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('owned child Edit and Cut use its saved scope and reject blocked or stale clipboard continuations', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const id = await ownedChild(page);
    await page.locator('.pc-node-native[data-id="work"] .pc-native-heading').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    for (const name of ['Copy', 'Cut', 'Delete selection']) await expect(editItem(page, name)).toBeEnabled();
    await page.keyboard.press('Escape');
    const before = await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), id);
    await page.evaluate(() => { window.workspaceWriteText = navigator.clipboard.writeText; Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('Fixture write denied'); } }); });
    await editCommand(page, 'Cut');
    await expect.poll(() => page.evaluate(() => window.canvasHarness.toasts.at(-1)?.message)).toContain('not cut');
    expect(await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), id)).toBe(before);
    await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => new Promise(resolve => { window.workspaceFinishCut = resolve; }) }));
    await editCommand(page, 'Cut');
    await page.waitForFunction(() => !!window.workspaceFinishCut);
    await graphTab(page, { name: 'Actual workspace integration', exact: true }).click();
    await page.evaluate(() => window.workspaceFinishCut()); await page.evaluate(() => window.canvasHarness.settle());
    expect(await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), id)).toBe(before);
    await graphTab(page, { name: /Plan/ }).click();
    await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: window.workspaceWriteText }));
    await page.locator('.pc-node-native[data-id="work"] .pc-native-heading').click();
    const deletionPrompts = [];
    page.on('dialog', async dialog => { deletionPrompts.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); });
    await editCommand(page, 'Cut');
    await expect(page.locator('.pc-node-native[data-id="work"]')).toHaveCount(0);
    expect(deletionPrompts).toEqual([]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const restored = await page.evaluate(id => { const root = structuredClone(window.canvasHarness.S.activeWorkflow()); delete root.updatedAt; return root; }, id), authored = JSON.parse(before); delete authored.updatedAt; expect(restored).toEqual(authored);
});

test('actual nested library Copy and Paste carries its exact closure into an unrelated root and guards a stale paste owner', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await activate(page);
    const state = await page.evaluate(async () => {
        const h = window.canvasHarness, { nestedWorkflow } = await import('/tests/fixtures/workflow-prepared-fixture.mjs');
        const { starterGraph } = await import('/src/workflow/starters.js?v=' + h.version);
        const source = nestedWorkflow(), root = starterGraph('structured-guidance'), definition = Object.values(source.definitions).find(item => item.id === 'prepared-outer');
        h.S.settings().subgraphLibrary = { definitions: source.definitions }; await h.activate(root);
        return { id: root.id, name: root.name, key: JSON.stringify([definition.id, definition.version, definition.semanticHash]) };
    });

    await openShelfDefinition(page, state.key);
    const library = graphTab(page, { name: /Outer/ });
    await page.locator('.pc-node-native[data-id="work"] .pc-native-heading').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(editItem(page, 'Copy')).toBeEnabled();
    await expect(editItem(page, 'Cut')).toBeDisabled();
    await expect(editItem(page, 'Delete selection')).toBeDisabled();
    await editItem(page, 'Copy').click();
    await expect.poll(() => page.evaluate(async () => { try { return Object.keys(JSON.parse(await navigator.clipboard.readText()).graph.definitions).length; } catch { return 0; } })).toBe(1);
    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(await page.evaluate(id => Object.keys(window.canvasHarness.S.activeWorkflow().definitions).length, state.id)).toBe(0);
    await graphTab(page, { name: state.name, exact: true }).click();
    await editCommand(page, 'Paste');
    await expect.poll(() => page.evaluate(id => Object.keys(window.canvasHarness.S.activeWorkflow().definitions).length, state.id)).toBe(1);
    expect(await page.evaluate(id => Object.values(window.canvasHarness.S.activeWorkflow().nodes).some(node => node.type === 'subgraph' && node.definition.id === 'prepared-plan'), state.id)).toBe(true);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    const before = await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), state.id);
    await page.evaluate(text => Object.defineProperty(navigator.clipboard, 'readText', { configurable: true, value: () => new Promise(resolve => { window.workspaceFinishPaste = () => resolve(text); }) }), clipText);
    await editCommand(page, 'Paste'); await page.waitForFunction(() => !!window.workspaceFinishPaste);
    await library.click(); await page.evaluate(() => window.workspaceFinishPaste()); await page.evaluate(() => window.canvasHarness.settle());
    expect(await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), state.id)).toBe(before);
});

test('actual direct and portal pin menus jump to the opposite prepared endpoints', async ({ page }) => {
    const id = await activate(page, 'portalWorkflow'), before = await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), id);
    await page.locator('.pc-port[data-node="first/path"][data-dir="in"][data-port="scene"]').click({ button: 'right' });
    await page.getByRole('button', { name: /Go to Scene context/i }).click();
    expect(await page.evaluate(() => window.canvasHarness.canvas.selection)).toEqual({ kind: 'node', id: 'source' });
    await page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading').dblclick();
    await page.locator('.pc-port[data-node="exit"][data-dir="in"][data-port="in"]').click({ button: 'right' });
    await page.getByRole('button', { name: /Go to Response Plan.*Saved publisher/i }).click();
    expect(await page.evaluate(() => window.canvasHarness.canvas.selection)).toEqual({ kind: 'node', id: 'work' });
    await page.locator('.pc-port[data-node="work"][data-dir="out"][data-port="out"]').click({ button: 'right' });
    await page.getByRole('button', { name: /Go to Proposal.*Saved publisher/i }).click();
    expect(await page.evaluate(() => window.canvasHarness.canvas.selection)).toEqual({ kind: 'node', id: 'exit' });
    expect(await page.evaluate(id => JSON.stringify(window.canvasHarness.S.activeWorkflow()), id)).toBe(before);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('native root and child frame joins align at fractional and high DPR with noninteractive foreground recess', async ({ browser }) => {
    for (const deviceScaleFactor of [1.25, 2]) {
        const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, deviceScaleFactor }), page = await context.newPage();
        try {
            await activate(page, 'siblingWorkflow');
            const check = async () => {
                const graph = await page.locator('.pc-canvas-area').boundingBox(), first = await graphTab(page, { name: 'Actual workspace integration', exact: true }).boundingBox();
                expect(first.x).toBeCloseTo(graph.x, 4);
                const paint = await page.locator('.pc-canvas-area').evaluate(element => { const edge = getComputedStyle(element, '::after'), preview = getComputedStyle(document.querySelector('.pc-preview-pane'), '::after'); return { content: edge.content, shadow: edge.boxShadow, pointer: edge.pointerEvents, z: edge.zIndex, left: edge.left, previewShadow: preview.boxShadow }; });
                expect(paint.content).toBe('""'); expect(paint.pointer).toBe('none'); expect(paint.z).toBe('4'); expect(paint.left).toBe('1px');
                expect(paint.shadow).toContain('2px 2px 3px'); expect(paint.shadow).toContain('-1px -1px 0px'); expect(paint.previewShadow).toBe(paint.shadow);
            };
            await check(); await page.locator('.pc-node-native[data-id="first/path"] .pc-native-heading').dblclick();
            await expect(graphTab(page, { name: /Plan/ })).toHaveAttribute('aria-selected', 'true'); await check();
        } finally { await context.close(); }
    }
});
