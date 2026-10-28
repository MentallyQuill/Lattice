import {test,expect} from '@playwright/test';

const userId='workflow-data-user',chatId='workflow-data-chat',clockId='lattice-default-clock';
const panel=page=>page.getByRole('region',{name:'Node details',exact:true});
const file=page=>panel(page).locator('[data-node-file]');

async function launch(page){
 const chatRequests=[];
 page.on('request',request=>{if(/\/api\/(?:chats|groups)\//.test(request.url()))chatRequests.push({url:new URL(request.url()).pathname,method:request.method()});});
 await page.route('**/scripts/user.js',route=>route.fulfill({contentType:'text/javascript',body:'export const getCurrentUserHandle=()=>"workflow-data-user";'}));
 await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'}));
 await page.route('**/api/chats/get',async route=>{const metadata=await page.evaluate(()=>structuredClone(window.canvasHarness.context.chatMetadata));await route.fulfill({json:[{chat_metadata:metadata}]});});
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async({userId,chatId,clockId})=>{
  const h=window.canvasHarness,c=h.context,v=h.version;
  const fixture=window.workflowFileFixture={writes:0,reads:0,picks:0,persistenceSaves:0,metadataSaves:0,handles:{}};
  Object.assign(c,{chatId,characters:[{name:'Companion',avatar:'companion.png',chat:'workflow-data'},{name:'Mara',avatar:'mara.png'}],characterId:0,groupId:null,chat:[],chatMetadata:{},saveMetadata:async()=>{fixture.metadataSaves++;return true;},getRequestHeaders:()=>({'Content-Type':'application/json'})});
  const run=await import('/src/run.js?v='+v);await run.initializeNativeWorkflowController();
  const {createNodeFileAccess,setNodeFileAccess}=await import('/src/ui/node-file-access.js?v='+v);
  let persisted={bindings:[],records:{}};
  const handleFor=name=>{
   if(fixture.handles[name])return fixture.handles[name];
   const state={text:'Existing disk contents: '+name};
   const handle={name,kind:'file',queryPermission:async()=> 'granted',isSameEntry:async other=>other===handle,getFile:async()=>{fixture.reads++;return {size:new TextEncoder().encode(state.text).length,text:async()=>state.text};},createWritable:async()=>{fixture.writes++;let pending;return {write:async text=>{pending=text;},close:async()=>{state.text=pending;},abort:async()=>{}};}};
   handle.state=state;fixture.handles[name]=handle;
   return handle;
  };
  const access=createNodeFileAccess({persistence:{load:async()=>persisted,save:async next=>{fixture.persistenceSaves++;persisted=next;}},showOpenFilePicker:async()=>{fixture.picks++;return [handleFor(fixture.nextName||'existing.txt')];},showSaveFilePicker:async options=>{fixture.picks++;return handleFor(fixture.nextName||options.suggestedName);}});
  await access.ready;setNodeFileAccess(access);
  const {workflowDataPresetFor}=await import('/src/workflow/workflow-data-defaults.js?v='+v),{kind,controlKey,...definition}=workflowDataPresetFor('story-clock');
  const defined=run.getStoryDocumentCatalog().define(definition);if(!defined.ok)throw Error(defined.error.message);
  const {kind:outcomesKind,controlKey:outcomesKey,...outcomesDefinition}=workflowDataPresetFor('commit-outcomes');
  const outcomesDefined=run.getStoryDocumentCatalog().define(outcomesDefinition);if(!outcomesDefined.ok)throw Error(outcomesDefined.error.message);
  const savedClock={...JSON.parse(definition.content),absoluteMinute:4321,revision:7};
  c.chatMetadata.latticeDocuments={[userId]:{[clockId]:{targetId:clockId,scope:{userId,chatId},format:'json',content:JSON.stringify(savedClock),revision:7,receipts:[{intentId:'accepted-clock',fingerprint:'sha256:'+'a'.repeat(64),revision:7}]},[outcomesDefinition.targetId]:{targetId:outcomesDefinition.targetId,scope:{userId,chatId},format:'json',content:'[]',revision:1,receipts:[]}}};
  const {operationDefaults}=await import('/src/workflow/catalog.js?v='+v);
  const graph={id:'workflow-data-settings',name:'Node File settings',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{},wires:{},groups:{},portals:{},definitions:{},view:{x:0,y:0,zoom:1}};
  for(const [id,operation,x] of [['clock','story-clock',100],['clock-two','story-clock',430],['notes','read-file',760],['outcomes','commit-outcomes',1090]])graph.nodes[id]={...operationDefaults(operation),id,type:'workflow',phase:operation==='commit-outcomes'?'post':'pre',x,y:100};
  await h.activate(graph);h.canvas.select({kind:'node',id:'clock'});await h.settle();
 },{userId,chatId,clockId});
 await expect(file(page)).toBeVisible();
 return {chatRequests};
}
async function select(page,id){await page.evaluate(async id=>{const h=window.canvasHarness;h.canvas.select({kind:'node',id});await h.settle();},id);await expect(file(page)).toBeVisible();}
async function advanced(page){const group=file(page).locator('[data-file-advanced]');if(!await group.evaluate(element=>element.open))await group.locator('summary').click();await expect(group).toHaveAttribute('open','');return group;}
async function legacy(page){return page.evaluate(()=>structuredClone(window.canvasHarness.context.chatMetadata));}
async function target(page,id){return page.evaluate(id=>structuredClone(window.canvasHarness.graph.nodes[id].fileTarget),id);}
async function noContentEffects(page){expect(await page.evaluate(()=>({writes:window.workflowFileFixture.writes,metadataSaves:window.workflowFileFixture.metadataSaves,providerCalls:window.canvasHarness.providerCalls()}))).toEqual({writes:0,metadataSaves:0,providerCalls:0});}
async function hiddenTemplates(page){await expect(file(page).locator('textarea')).toHaveCount(0);await expect(file(page).getByLabel('Initial file content',{exact:true})).toHaveCount(0);await expect(file(page).getByRole('button',{name:'Save file settings',exact:true})).toHaveCount(0);}
async function chooseLocation(page,name){await page.evaluate(name=>{window.workflowFileFixture.nextName=name;},name);await advanced(page);await file(page).getByRole('button',{name:'Choose location…',exact:true}).click();}

test('friendly clock settings autosave without exposing templates or changing canonical time and history',async({page})=>{
 const {chatRequests}=await launch(page),before=await legacy(page),networkBefore=chatRequests.length;
 const siblingBefore=await page.evaluate(()=>structuredClone(window.canvasHarness.graph.nodes['clock-two']));
 const canonical=before.latticeDocuments[userId][clockId].content,initial=before.latticeDocumentCatalog[userId].documents[clockId].content;
 expect(JSON.parse(canonical).absoluteMinute).toBe(4321);expect(JSON.parse(initial).absoluteMinute).toBe(0);
 await expect(file(page)).toContainText('Existing saved chat data is preserved and ready to use.');
 await expect(file(page).getByLabel('File name',{exact:true})).toHaveValue('Chat clock');
 await expect(file(page).getByLabel('File type',{exact:true})).toHaveText('Lattice data · Automatic');
 await expect(file(page).locator('[data-file-status]')).toHaveText('Ready');await hiddenTemplates(page);
 await file(page).getByLabel('File name',{exact:true}).fill('Campaign Clock');
 await expect.poll(async()=> (await target(page,'clock'))?.name).toBe('Campaign Clock');
 expect((await target(page,'clock')).content).toBe(canonical);
 await chooseLocation(page,'Campaign Clock.json');
 await expect.poll(async()=> (await target(page,'clock'))?.bindingId).toBeTruthy();
 const chosen=await page.evaluate(()=>structuredClone(window.canvasHarness.graph.nodes.clock));
 expect(chosen.clockId).toBeTruthy();expect(chosen.clockId).not.toBe(chosen.fileTarget.bindingId);
 expect(JSON.parse(chosen.fileTarget.content).clockId).toBe(chosen.clockId);expect(JSON.parse(chosen.fileTarget.content).absoluteMinute).toBe(4321);
 await expect(file(page).getByLabel('File name',{exact:true})).toHaveValue('Campaign Clock');
 await expect(page.locator('.pc-node-profile[data-id="clock"] .node-file-meta')).toHaveText('Campaign Clock.json');
 await hiddenTemplates(page);expect(await legacy(page)).toEqual(before);expect(chatRequests).toHaveLength(networkBefore);await noContentEffects(page);
 await select(page,'clock-two');expect(await page.evaluate(()=>structuredClone(window.canvasHarness.graph.nodes['clock-two']))).toEqual(siblingBefore);
 await expect(file(page).getByLabel('File name',{exact:true})).toHaveValue('Chat clock');await hiddenTemplates(page);
 await select(page,'clock');await expect(file(page).getByLabel('File name',{exact:true})).toHaveValue('Campaign Clock');
 expect(await legacy(page)).toEqual(before);
});

test('privacy autosaves familiar character choices while incomplete private drafts preserve saved access',async({page})=>{
 const {chatRequests}=await launch(page),before=await legacy(page),networkBefore=chatRequests.length;
 const canonical=before.latticeDocuments[userId][clockId].content;
 await advanced(page);await file(page).getByLabel('File visibility',{exact:true}).selectOption('hidden');
 await expect.poll(async()=> (await target(page,'clock'))?.visibility).toEqual({kind:'hidden'});
 expect((await target(page,'clock')).content).toBe(canonical);
 await file(page).getByLabel('File visibility',{exact:true}).selectOption('actor-private');
 await expect(file(page).getByRole('status').filter({hasText:'Finish the name and character selection'})).toBeVisible();
 const character=file(page).getByLabel('File character',{exact:true});
 await expect(character).toHaveValue('');
 expect(await character.locator('option').allTextContents()).toEqual(['Choose character','Companion','Mara']);
 await expect(file(page).getByLabel('File actor ID',{exact:true})).toHaveCount(0);
 await page.waitForTimeout(350);expect((await target(page,'clock')).visibility).toEqual({kind:'hidden'});
 await character.selectOption({label:'Mara'});
 await expect.poll(async()=> (await target(page,'clock'))?.visibility).toEqual({kind:'actor-private',actorId:'character:mara.png'});
 await select(page,'notes');await select(page,'clock');await advanced(page);
 await expect(file(page).getByLabel('File visibility',{exact:true})).toHaveValue('actor-private');await expect(file(page).getByLabel('File character',{exact:true})).toHaveValue('character:mara.png');
 expect((await target(page,'clock')).content).toBe(canonical);await hiddenTemplates(page);
 expect(await page.evaluate(()=>({reads:window.workflowFileFixture.reads,picks:window.workflowFileFixture.picks}))).toEqual({reads:0,picks:0});
 expect(await legacy(page)).toEqual(before);expect(chatRequests).toHaveLength(networkBefore);await noContentEffects(page);
});

test('all five reader formats require explicit copies while clock and outcomes keep automatic data types',async({page})=>{
 await launch(page);const before=await legacy(page);await select(page,'notes');
 await page.evaluate(()=>{window.workflowFileFixture.nextName='notes.txt';});await file(page).getByRole('button',{name:'Choose file…',exact:true}).click();
 await expect.poll(async()=> (await target(page,'notes'))?.name).toBe('notes.txt');
 await expect(file(page).getByLabel('File type',{exact:true})).toHaveText('Text document · Automatic');
 await advanced(page);const format=file(page).getByLabel('Advanced file format',{exact:true});
 expect(await format.locator('option').evaluateAll(options=>options.map(option=>option.value))).toEqual(['text','json','jsonl','csv','markdown']);
 expect(await file(page).getByLabel('File visibility',{exact:true}).locator('option').evaluateAll(options=>options.map(option=>option.value))).toEqual(['public','hidden','actor-private']);
 for(const [value,name,label] of [['json','notes-json.json','Structured data'],['jsonl','notes-lines.jsonl','JSON Lines'],['csv','notes-table.csv','Spreadsheet'],['markdown','notes-markdown.md','Markdown document']]){
  const original=await target(page,'notes');await format.selectOption(value);
  const copy=file(page).getByRole('button',{name:'Create new copy…',exact:true});await expect(copy).toBeVisible();
  await page.waitForTimeout(350);expect(await target(page,'notes')).toEqual(original);
  await page.evaluate(name=>{window.workflowFileFixture.nextName=name;},name);await copy.click();
  await expect.poll(async()=> (await target(page,'notes'))?.format).toBe(value);
  const configured=await target(page,'notes');expect(configured.name).toBe(name);expect(configured.bindingId).not.toBe(original.bindingId);
  await expect(file(page).getByLabel('File type',{exact:true})).toHaveText(label+' · Automatic');await hiddenTemplates(page);
 }
 for(const [id,name] of [['clock','clock.json'],['outcomes','outcomes.json']]){
  await select(page,id);await expect(file(page).getByLabel('File type',{exact:true})).toHaveText('Lattice data · Automatic');
  await advanced(page);await expect(file(page).getByLabel('Advanced file format',{exact:true})).toHaveCount(0);await hiddenTemplates(page);
  await chooseLocation(page,name);await expect.poll(async()=> (await target(page,id))?.format).toBe('json');
  const content=JSON.parse((await target(page,id)).content);if(id==='clock')expect(content.absoluteMinute).toBe(4321);else expect(content).toEqual([]);
 }
 expect(await legacy(page)).toEqual(before);await noContentEffects(page);
});

test('autosaved File controls keep friendly types and private character selection usable in normal light and narrow Details',async({page},testInfo)=>{
 await launch(page);await select(page,'notes');
 await page.evaluate(()=>{window.workflowFileFixture.nextName='campaign-notes.txt';});await file(page).getByRole('button',{name:'Choose file…',exact:true}).click();
 await expect.poll(async()=> (await target(page,'notes'))?.bindingId).toBeTruthy();
 await expect(file(page).locator('[data-file-advanced]')).not.toHaveAttribute('open');
 await expect(file(page).getByLabel('File name',{exact:true})).toHaveValue('campaign-notes');await hiddenTemplates(page);
 await advanced(page);await file(page).getByLabel('File visibility',{exact:true}).selectOption('actor-private');await file(page).getByLabel('File character',{exact:true}).selectOption({label:'Mara'});
 await expect.poll(async()=> (await target(page,'notes'))?.visibility).toEqual({kind:'actor-private',actorId:'character:mara.png'});
 const details=page.locator('.pc-workspace-details');
 for(const [name,preset,width] of [['normal','lattice','340px'],['light','ash','340px'],['narrow','lattice','220px']]){
  await page.evaluate(async({preset,width})=>{const h=window.canvasHarness;await(await import('/src/theme.js?v='+h.version)).setPreset(preset);document.querySelector('.pc-body').style.setProperty('--pc-details-width',width);await h.settle();},{preset,width});
  await expect(file(page).getByLabel('File visibility',{exact:true})).toHaveValue('actor-private');await expect(file(page).getByLabel('File character',{exact:true})).toHaveValue('character:mara.png');
  await expect(file(page).getByLabel('File type',{exact:true})).toHaveText('Text document · Automatic');await hiddenTemplates(page);
  const treatment=await file(page).locator('button,input,select').evaluateAll(elements=>elements.filter(element=>element.getClientRects().length).map(element=>{const css=getComputedStyle(element);return {radius:css.borderTopLeftRadius,clip:css.clipPath,shadow:css.boxShadow,image:css.backgroundImage};}));
  expect(treatment.length).toBeGreaterThanOrEqual(9);for(const control of treatment)expect(control).toEqual({radius:'4px',clip:'none',shadow:'none',image:'none'});
  expect(await details.evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThanOrEqual(1);
  const overflow=await file(page).locator('button,input,select,output').evaluateAll(elements=>{const box=document.querySelector('.pc-workspace-details').getBoundingClientRect();return elements.filter(element=>element.getClientRects().length).filter(element=>{const rect=element.getBoundingClientRect();return rect.left<box.left-1||rect.right>box.right+1;}).map(element=>element.getAttribute('aria-label')??element.textContent);});expect(overflow).toEqual([]);
  await details.screenshot({path:testInfo.outputPath('legacy-file-'+name+'.png'),animations:'disabled'});
 }
 expect((await target(page,'notes')).visibility).toEqual({kind:'actor-private',actorId:'character:mara.png'});await noContentEffects(page);
});

test('disabled sibling system nodes keep separate file configuration and preserve their canonical history',async({page})=>{
 await launch(page);
 const before=await page.evaluate(async({userId,chatId})=>{
  const h=window.canvasHarness,{computeDefinitionIdentity,definitionRefKey}=await import('/src/workflow/definition-data.js?v='+h.version),{resolveSystemNode}=await import('/src/workflow/system-capabilities.js?v='+h.version);
  const identity=computeDefinitionIdentity({id:'notes-system',version:1,name:'System notes',parameters:[],interface:[],body:{schema:3,runtime:2,mode:'native-pre',nodes:{read:{id:'read',type:'workflow',operation:'read-file',x:80,y:80}},wires:{}}});if(!identity.ok)throw Error(JSON.stringify(identity));
  const definition={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash};let root=structuredClone(h.graph);root.definitions[definitionRefKey(definition)]=definition;
  for(const id of ['one','two'])root.nodes[id]={id,type:'subgraph',enabled:false,definition:{id:definition.id,version:1,semanticHash:definition.semanticHash},x:100,y:id==='one'?400:650};
  const {makeLocalCopy}=await import('/src/workflow/definition-library.js?v='+h.version);
  for(const id of ['one','two']){const copy=makeLocalCopy(root,{instancePath:[id],id:'local-'+id});if(!copy.ok)throw Error(JSON.stringify(copy));root=copy.data.candidate;}
  const run=await import('/src/run.js?v='+h.version),catalog=run.getStoryDocumentCatalog(),targets={};
  h.context.chatMetadata.latticeDocumentHistory??={};h.context.chatMetadata.latticeDocumentHistory[userId]??={};
  for(const id of ['one','two']){
   const resolved=resolveSystemNode({id:'read',type:'workflow',operation:'read-file'},{workflowId:root.id,instancePath:[id],nodeId:'read'});if(!resolved.ok)throw Error(JSON.stringify(resolved));const targetId=targets[id]=resolved.data.node.targetId;
   const defined=catalog.define({targetId,name:'System '+id+' notes',format:'text',content:'Template '+id,visibility:{kind:'public'}});if(!defined.ok)throw Error(JSON.stringify(defined));
   const pageId='archive:'+id,scope={userId,chatId},receipt={intentId:'accepted-'+id,fingerprint:'sha256:'+'b'.repeat(64),revision:2};
   h.context.chatMetadata.latticeDocuments[userId][targetId]={targetId,scope,format:'text',content:'Saved notes '+id,revision:2,receipts:[receipt],history:{schemaVersion:1,epoch:1,head:pageId}};
   h.context.chatMetadata.latticeDocumentHistory[userId][pageId]={schemaVersion:1,pageId,targetId,scope,visibility:{kind:'public'},epoch:1,checkpointId:'checkpoint:'+id,previous:null,kind:'receipts',payload:[{...receipt,intentId:'older-'+id,revision:1}]};
  }
  await h.activate(root);await h.view({x:100,y:30,zoom:.6});
  return {targets,metadata:structuredClone(h.context.chatMetadata),sharedDefinition:structuredClone(h.graph.definitions[definitionRefKey(definition)]),siblingRef:structuredClone(h.graph.nodes.two.definition),siblingDefinition:structuredClone(h.graph.definitions[definitionRefKey(h.graph.nodes.two.definition)])};
 },{userId,chatId});
 async function authored(id){return page.evaluate(async id=>{const h=window.canvasHarness,{definitionRefKey}=await import('/src/workflow/definition-data.js?v='+h.version);return structuredClone(h.graph.definitions[definitionRefKey(h.graph.nodes[id].definition)].body.nodes.read);},id);}
 await page.locator('.pc-node[data-id="one"] .pc-native-heading').dblclick();await select(page,'read');
 await hiddenTemplates(page);await expect(file(page).getByLabel('File name',{exact:true})).toHaveValue('System one notes');
 await advanced(page);await file(page).getByLabel('File visibility',{exact:true}).selectOption('hidden');await file(page).getByLabel('File name',{exact:true}).fill('System One');
 await expect.poll(async()=> (await authored('one')).fileTarget?.visibility).toEqual({kind:'hidden'});expect((await authored('one')).fileTarget.content).toBe('Saved notes one');
 const originalOne=await authored('one');await file(page).getByLabel('Advanced file format',{exact:true}).selectOption('markdown');await expect(file(page).getByRole('button',{name:'Create new copy…',exact:true})).toBeVisible();
 await page.waitForTimeout(350);expect(await authored('one')).toEqual(originalOne);await page.evaluate(()=>{window.workflowFileFixture.nextName='system-one.md';});await file(page).getByRole('button',{name:'Create new copy…',exact:true}).click();await expect.poll(async()=> (await authored('one')).fileTarget?.bindingId).toBeTruthy();
 const one=await authored('one');expect(one.fileTarget.name).toBe('system-one.md');expect(one.fileTarget.visibility).toEqual({kind:'hidden'});expect(one.fileTarget.content).toBe('Saved notes one');
 const untouchedSibling=await page.evaluate(async()=>{const h=window.canvasHarness,{definitionRefKey}=await import('/src/workflow/definition-data.js?v='+h.version);return {ref:structuredClone(h.graph.nodes.two.definition),definition:structuredClone(h.graph.definitions[definitionRefKey(h.graph.nodes.two.definition)])};});
 expect(untouchedSibling.ref).toEqual(before.siblingRef);expect(untouchedSibling.definition).toEqual(before.siblingDefinition);
 await page.locator('.pc-graph-tabs [role="tab"]').first().click();await page.evaluate(async()=>{await window.canvasHarness.view({x:100,y:30,zoom:.6});});
 await page.locator('.pc-node[data-id="two"] .pc-native-heading').dblclick();await select(page,'read');
 await hiddenTemplates(page);await expect(file(page).getByLabel('File name',{exact:true})).toHaveValue('System two notes');expect((await authored('two')).fileTarget??{}).toEqual({});
 await file(page).getByLabel('File name',{exact:true}).fill('System Two');await expect.poll(async()=> (await authored('two')).fileTarget?.content).toBe('Saved notes two');
 await chooseLocation(page,'system-two.txt');await expect.poll(async()=> (await authored('two')).fileTarget?.bindingId).toBeTruthy();
 const two=await authored('two');expect(two.fileTarget.name).toBe('system-two.txt');expect(two.fileTarget.visibility).toEqual({kind:'public'});expect(two.fileTarget.bindingId).not.toBe(one.fileTarget.bindingId);expect(two.targetId).not.toBe(one.targetId);
 expect(await authored('one')).toEqual(one);
 const unchanged=await page.evaluate(async shared=>{const h=window.canvasHarness,{definitionRefKey}=await import('/src/workflow/definition-data.js?v='+h.version);return {metadata:structuredClone(h.context.chatMetadata),sharedDefinition:structuredClone(h.graph.definitions[definitionRefKey(shared)]),enabled:[h.graph.nodes.one.enabled,h.graph.nodes.two.enabled]};},before.sharedDefinition);
 expect(unchanged.metadata).toEqual(before.metadata);expect(unchanged.sharedDefinition).toEqual(before.sharedDefinition);expect(unchanged.enabled).toEqual([false,false]);
 expect(before.targets.one).not.toBe(before.targets.two);await noContentEffects(page);
});
