import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const userId='workflow-data-user',chatId='workflow-data-chat',clockId='lattice-default-clock';
const panel=page=>page.getByRole('region',{name:'Node details',exact:true});
const data=page=>panel(page).locator('[data-workflow-data]');

async function launch(page){
 await page.route('**/scripts/user.js',route=>route.fulfill({contentType:'text/javascript',body:'export const getCurrentUserHandle=()=>"workflow-data-user";'}));
 await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'}));
 await page.route('**/api/chats/get',async route=>{const metadata=await page.evaluate(()=>structuredClone(window.canvasHarness.context.chatMetadata));await route.fulfill({json:[{chat_metadata:metadata}]});});
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async()=>{
  const h=window.canvasHarness,c=h.context,v=h.version;
  Object.assign(c,{chatId:'workflow-data-chat',characters:[{name:'Companion',avatar:'companion.png',chat:'workflow-data'}],characterId:0,groupId:null,chat:[],chatMetadata:{},saveMetadata:async()=>true,getRequestHeaders:()=>({'Content-Type':'application/json'})});
  await (await import('/src/run.js?v='+v)).initializeNativeWorkflowController();
  const {operationDefaults}=await import('/src/workflow/catalog.js?v='+v);
  const graph={id:'workflow-data-settings',name:'Workflow Data settings',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{},wires:{},groups:{},portals:{},definitions:{},view:{x:0,y:0,zoom:1}};
  for(const [id,operation,x] of [['clock','story-clock',100],['clock-two','story-clock',430],['notes','read-file',760],['outcomes','commit-outcomes',1090]])graph.nodes[id]={...operationDefaults(operation),id,type:'workflow',phase:operation==='commit-outcomes'?'post':'pre',x,y:100};
  await h.activate(graph);h.canvas.select({kind:'node',id:'clock'});await h.settle();
 });
 await expect(data(page)).toContainText('Uses Chat clock');
}

async function select(page,id){await page.evaluate(async id=>{const h=window.canvasHarness;h.canvas.select({kind:'node',id});await h.settle();},id);}
async function advanced(page){const group=data(page).locator('[data-workflow-advanced]');if(!await group.evaluate(element=>element.open))await group.locator('summary').click();return group;}
async function save(page){const persisted=page.waitForResponse(response=>response.url().endsWith('/api/chats/get')&&response.request().method()==='POST');await data(page).getByRole('button',{name:'Save settings',exact:true}).click();await persisted;await expect(data(page).locator('[data-save-workflow-data]')).toBeDisabled();await expect(data(page).locator('.pc-diagnostic[data-severity="error"]')).toHaveCount(0);}
async function definition(page,id){return page.evaluate(({userId,id})=>structuredClone(window.canvasHarness.context.chatMetadata.latticeDocumentCatalog?.[userId]?.documents[id]),{userId,id});}

test('actual clock settings preserve saved time while visibility, starting values and shared source bindings change',async({page})=>{
 await launch(page);
 await expect(data(page).getByLabel('Starting day',{exact:true})).toHaveValue('1');await expect(data(page).getByLabel('Starting time',{exact:true})).toHaveValue('00:00');await expect(data(page).getByLabel('Hours per day',{exact:true})).toHaveValue('24');
 await advanced(page);const visibility=data(page).getByRole('group',{name:'Visibility',exact:true});await expect(visibility.getByRole('button')).toHaveCount(3);
 await expect(data(page).getByLabel('Clock format',{exact:true})).toHaveText('JSON');await expect(data(page).getByLabel('Clock source',{exact:true})).toHaveText('Chat clock');
 await expect(data(page).getByRole('button',{name:'Create separate clock',exact:true})).toBeVisible();await expect(data(page).getByLabel('New clock name',{exact:true})).toHaveCount(0);
 await expect(data(page).getByRole('button',{name:/Reset/})).toHaveCount(0);expect(await data(page).innerText()).not.toMatch(/ledger/i);
 await visibility.getByRole('button',{name:'Hidden',exact:true}).click();await save(page);
 const initial=await definition(page,clockId);expect(initial.visibility).toEqual({kind:'hidden'});expect(JSON.parse(initial.content).absoluteMinute).toBe(0);
 const canonical=await page.evaluate(({userId,chatId,clockId})=>{
  const h=window.canvasHarness,initial=h.context.chatMetadata.latticeDocumentCatalog[userId].documents[clockId];
  const value={...JSON.parse(initial.content),absoluteMinute:4321,revision:7};
  h.context.chatMetadata.latticeDocuments={[userId]:{[clockId]:{targetId:clockId,scope:{userId,chatId},format:'json',content:JSON.stringify(value),revision:7,receipts:[]}}};
  return structuredClone(h.context.chatMetadata.latticeDocuments);
 },{userId,chatId,clockId});
 await page.evaluate(async()=>{const h=window.canvasHarness;h.UI.refreshIfOpen();h.canvas.select({kind:'node',id:'clock'});await h.settle();});
 await advanced(page);
 await data(page).getByRole('group',{name:'Visibility',exact:true}).getByRole('button',{name:'Public',exact:true}).click();await save(page);
 expect((await definition(page,clockId)).content).toBe(initial.content);
 expect(await page.evaluate(()=>window.canvasHarness.context.chatMetadata.latticeDocuments)).toEqual(canonical);
 const load=data(page).getByRole('button',{name:'Load initial values',exact:true});if(await load.count())await load.click();await expect(data(page).getByLabel('Starting day',{exact:true})).toBeEnabled();
 await data(page).getByLabel('Starting day',{exact:true}).fill('3');await data(page).getByLabel('Starting time',{exact:true}).fill('06:30');
 await advanced(page);await data(page).getByLabel('Expected calendar',{exact:true}).fill('story-calendar');await data(page).getByLabel('Expected calendar',{exact:true}).blur();
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.clock.calendarId)).toBe('story-calendar');
 await expect(data(page).getByLabel('Starting day',{exact:true})).toHaveValue('3');await expect(data(page).getByLabel('Starting time',{exact:true})).toHaveValue('06:30');
 await save(page);expect(JSON.parse((await definition(page,clockId)).content).absoluteMinute).toBe(3270);
 await expect(data(page).getByLabel('Starting day',{exact:true})).toHaveValue('3');await expect(data(page).getByLabel('Starting time',{exact:true})).toHaveValue('06:30');
 expect(await page.evaluate(()=>window.canvasHarness.context.chatMetadata.latticeDocuments)).toEqual(canonical);
 await advanced(page);await data(page).getByRole('button',{name:'Create separate clock',exact:true}).click();await data(page).getByLabel('New clock name',{exact:true}).fill('Travel clock');await data(page).getByRole('button',{name:'Create clock',exact:true}).click();
 await expect(data(page)).toContainText('Uses Travel clock');const travelId=await page.evaluate(()=>window.canvasHarness.graph.nodes.clock.clockId);expect(travelId).not.toBe(clockId);expect(JSON.parse((await definition(page,travelId)).content).clockId).toBe(travelId);
 await select(page,'clock-two');await advanced(page);await data(page).getByRole('group',{name:'Clock source',exact:true}).getByRole('button',{name:'Travel clock',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes['clock-two'].clockId)).toBe(travelId);await expect(data(page)).toContainText('Uses Travel clock');
 await advanced(page);await data(page).getByRole('group',{name:'Clock source',exact:true}).getByRole('button',{name:'Chat clock',exact:true}).click();await expect(data(page)).toContainText('Uses Chat clock');
 expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.clock.clockId)).toBe(travelId);expect(await page.evaluate(()=>window.canvasHarness.context.chatMetadata.latticeDocuments)).toEqual(canonical);
});

test('privacy saves without loading existing initial values retain visible unconfirmed persistence feedback',async({page})=>{
 await launch(page);
 await page.evaluate(async()=>{
  const h=window.canvasHarness,run=await import('/src/run.js?v='+h.version),{workflowDataPresetFor}=await import('/src/workflow/workflow-data-defaults.js?v='+h.version);
  const {kind,controlKey,...definition}=workflowDataPresetFor('story-clock');definition.content=JSON.stringify({...JSON.parse(definition.content),absoluteMinute:120});
  const saved=run.getStoryDocumentCatalog().define(definition);if(!saved.ok)throw Error(saved.error.message);
  h.UI.refreshIfOpen();h.canvas.select({kind:'node',id:'clock'});await h.settle();
 });
 await advanced(page);await expect(data(page).getByRole('button',{name:'Load initial values',exact:true})).toBeVisible();
 await page.route('**/api/chats/get',route=>route.fulfill({json:[{chat_metadata:{}}]}));
 await data(page).getByRole('group',{name:'Visibility',exact:true}).getByRole('button',{name:'Hidden',exact:true}).click();await save(page);
 await expect(data(page).locator('p[role="status"]')).toContainText(/unconfirmed/i);
 const saved=await definition(page,clockId);expect(saved.visibility).toEqual({kind:'hidden'});expect(JSON.parse(saved.content).absoluteMinute).toBe(120);
});

test('actual file settings offer five formats and three visibility buttons while outcomes retain JSON',async({page})=>{
 await launch(page);await select(page,'notes');await advanced(page);
 const format=data(page).getByLabel('Document format',{exact:true});await expect(format.locator('option')).toHaveCount(5);expect(await format.locator('option').evaluateAll(options=>options.map(option=>option.value))).toEqual(['text','json','jsonl','csv','markdown']);
 await expect(data(page).getByRole('group',{name:'Visibility',exact:true}).getByRole('button')).toHaveCount(3);
 await format.selectOption('markdown');await save(page);expect((await definition(page,'lattice-default-notes')).format).toBe('markdown');
 await select(page,'outcomes');await advanced(page);await expect(data(page).getByLabel('Outcomes format',{exact:true})).toHaveText('JSON');await expect(data(page)).toContainText('Outcomes use a JSON list.');expect(await data(page).innerText()).not.toMatch(/ledger/i);
});

test('product Workflow Data controls have flat beveled edges and fit normal, light and narrow Details',async({page})=>{
 await launch(page);await mkdir(resolve('.tmp'),{recursive:true});
 const visibility=data(page).getByRole('group',{name:'Visibility',exact:true});
 async function visibleSelection(name){
  const buttons=await visibility.getByRole('button').evaluateAll(elements=>elements.map(element=>({name:element.textContent.trim(),pressed:element.getAttribute('aria-pressed'),fill:getComputedStyle(element).backgroundColor})));
  const selected=buttons.find(button=>button.name===name);expect(selected.pressed).toBe('true');
  for(const button of buttons.filter(button=>button.name!==name)){expect(button.pressed).toBe('false');expect(selected.fill).not.toBe(button.fill);}
 }
 const details=page.locator('.pc-workspace-details');await page.evaluate(async()=>{const h=window.canvasHarness;document.querySelector('.pc-body').style.setProperty('--pc-details-width','340px');await h.settle();});
 await details.screenshot({path:resolve('.tmp/workflow-data-ui.png'),animations:'disabled'});await advanced(page);
 await visibleSelection('Public');await visibility.getByRole('button',{name:'Hidden',exact:true}).click();await visibleSelection('Hidden');
 await visibility.getByRole('button',{name:'Public',exact:true}).click();await page.mouse.move(0,0);await visibleSelection('Public');
 await details.screenshot({path:resolve('.tmp/workflow-data-ui-advanced.png'),animations:'disabled'});
 const treatment=await data(page).locator('button,input,select,textarea,.pc-wd-number').evaluateAll(elements=>elements.filter(element=>element.getClientRects().length).map(element=>{const css=getComputedStyle(element);return {radius:css.borderTopLeftRadius,clip:css.clipPath,shadow:css.boxShadow,image:css.backgroundImage};}));
 expect(treatment.length).toBeGreaterThan(8);for(const control of treatment)expect(control).toEqual({radius:'4px',clip:'none',shadow:'none',image:'none'});
 expect(await data(page).locator('.pc-wd-number input').evaluateAll(elements=>elements.map(element=>getComputedStyle(element).borderTopWidth))).toEqual(['0px','0px','0px']);
 await page.evaluate(async()=>{const h=window.canvasHarness;await(await import('/src/theme.js?v='+h.version)).setPreset('ash');await h.settle();});await visibleSelection('Public');await details.screenshot({path:resolve('.tmp/workflow-data-ui-light.png'),animations:'disabled'});
 await page.evaluate(async()=>{const h=window.canvasHarness;await(await import('/src/theme.js?v='+h.version)).setPreset('lattice');document.querySelector('.pc-body').style.setProperty('--pc-details-width','220px');await h.settle();});
 await visibleSelection('Public');
 expect(await details.evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThanOrEqual(1);
 const overflow=await data(page).locator('button,input,select,textarea').evaluateAll(elements=>{const box=document.querySelector('.pc-workspace-details').getBoundingClientRect();return elements.filter(element=>element.getClientRects().length).filter(element=>{const rect=element.getBoundingClientRect();return rect.left<box.left-1||rect.right>box.right+1;}).map(element=>element.getAttribute('aria-label')??element.textContent);});expect(overflow).toEqual([]);
 await details.screenshot({path:resolve('.tmp/workflow-data-ui-narrow.png'),animations:'disabled'});
});


test('disabled sibling system Details seeds and edits only its addressed notes before the first run',async({page})=>{
 await launch(page);const before=await page.evaluate(async()=>{const h=window.canvasHarness,{computeDefinitionIdentity,definitionRefKey}=await import('/src/workflow/definition-data.js?v='+h.version);const identity=computeDefinitionIdentity({id:'notes-system',version:1,name:'System notes',parameters:[],interface:[],body:{schema:3,runtime:2,mode:'native-pre',nodes:{read:{id:'read',type:'workflow',operation:'read-file',x:80,y:80}},wires:{}}});if(!identity.ok)throw Error(JSON.stringify(identity));const definition={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash};let root=structuredClone(h.graph);root.definitions[definitionRefKey(definition)]=definition;for(const id of ['one','two'])root.nodes[id]={id,type:'subgraph',enabled:false,definition:{id:definition.id,version:1,semanticHash:definition.semanticHash},x:100,y:id==='one'?400:650};const {makeLocalCopy}=await import('/src/workflow/definition-library.js?v='+h.version);for(const id of ['one','two']){const copy=makeLocalCopy(root,{instancePath:[id],id:'local-'+id});if(!copy.ok)throw Error(JSON.stringify(copy));root=copy.data.candidate;}await h.activate(root);await h.view({x:100,y:30,zoom:.6});return JSON.stringify(root.definitions);});
 const initial=await page.evaluate(()=>JSON.stringify(window.canvasHarness.context.chatMetadata));
 await page.locator('.pc-node[data-id="one"] .pc-native-heading').dblclick();await select(page,'read');await advanced(page);
 expect(await page.evaluate(()=>JSON.stringify(window.canvasHarness.context.chatMetadata))).toBe(initial);
 const targetId=await data(page).getByLabel('Document document ID',{exact:true}).inputValue();expect(targetId).toMatch(/^lattice-system-notes-/);await data(page).getByLabel('Document format',{exact:true}).selectOption('markdown');await save(page);
 expect((await definition(page,targetId)).format).toBe('markdown');expect(await definition(page,'lattice-default-notes')).toBeUndefined();await data(page).getByRole('group',{name:'Visibility',exact:true}).getByRole('button',{name:'Hidden',exact:true}).click();await save(page);expect((await definition(page,targetId)).visibility.kind).toBe('hidden');
 await page.locator('.pc-graph-tabs [role="tab"]').first().click();await page.evaluate(async()=>{await window.canvasHarness.view({x:100,y:30,zoom:.6});});await page.locator('.pc-node[data-id="two"] .pc-native-heading').dblclick();await select(page,'read');await advanced(page);const sibling=await data(page).getByLabel('Document document ID',{exact:true}).inputValue();expect(sibling).not.toBe(targetId);expect(await definition(page,sibling)).toBeUndefined();
 expect(await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph.definitions))).toBe(before);expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
