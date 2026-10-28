import {test,expect} from '@playwright/test';
async function fixture(page,operation='read-file',browserAccess=false,automatic=false){
 await page.route('**/scripts/user.js',route=>route.fulfill({contentType:'text/javascript',body:'export const getCurrentUserHandle=()=>"node-file-browser";'}));
 await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'}));
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async ({operation,browserAccess,automatic})=>{
  const h=window.canvasHarness;Object.assign(h.context,{chatId:'node-file-chat',characters:[{name:'Companion',avatar:'companion.png',chat:'node-files'}],characterId:0,groupId:null,chat:[],chatMetadata:{},saveMetadata:async()=>true,getRequestHeaders:()=>({'Content-Type':'application/json'})});
  if(automatic){const c=h.context;c.mainApi='openai';c.chatCompletionSettings.chat_completion_source='nanogpt';c.chatCompletionSettings.current_model='initialization-model';c.getChatCompletionModel=settings=>settings.current_model;c.CONNECT_API_MAP={nanogpt:{selected:'openai',source:'nanogpt',label:'NanoGPT'}};}
  await (await import('/src/run.js?v='+h.version)).initializeNativeWorkflowController();
  const {createNodeFileAccess,setNodeFileAccess}=await import('/src/ui/node-file-access.js?v='+h.version);
  let state={bindings:[],records:{}};
  window.nodeFileFixture={text:'',writes:0,picks:0};
  const handle={name:'journal.txt',kind:'file',queryPermission:async()=> 'granted',isSameEntry:async other=>other===handle,getFile:async()=>({size:new TextEncoder().encode(window.nodeFileFixture.text).length,text:async()=>window.nodeFileFixture.text}),createWritable:async()=>{window.nodeFileFixture.writes++;let pending;return {write:async text=>{pending=text;},close:async()=>{window.nodeFileFixture.text=pending;},abort:async()=>{}};}};
  const accessOptions={persistence:{load:async()=>state,save:async next=>{state=next;}},showOpenFilePicker:async()=>{window.nodeFileFixture.picks++;return [handle];},showSaveFilePicker:async()=>{window.nodeFileFixture.picks++;return handle;}};
  const access=createNodeFileAccess(browserAccess?{}:accessOptions);
  window.nodeFileFixture.restart=async()=>{const next=createNodeFileAccess(accessOptions);await next.ready;setNodeFileAccess(next);h.UI.refreshIfOpen();await h.settle();};
  await access.ready;setNodeFileAccess(automatic?{...access,providers:{host:{supported:true}}}:access);
  const {operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
  const node={id:'file',type:'workflow',...operationDefaults(operation,{managedFiles:automatic}),...(operation==='read-file'&&!automatic?{initialization:'require-file',fileTarget:{missing:'error'}}:{}),x:140,y:180,w:260};
  await h.activate({id:'node-files-browser',name:'Node files',schema:3,runtime:2,mode:'native-unified',nodes:{file:node},wires:{},groups:{},definitions:{},portals:{}});
  await h.view({x:150,y:100,zoom:1});
 },{operation,browserAccess,automatic});
}


const file=page=>page.locator('[data-node-file]');
async function openDetails(page){await page.evaluate(async()=>{const h=window.canvasHarness;h.canvas.select({kind:'node',id:'file'});await h.settle();});await expect(file(page)).toBeVisible();}
async function noWrites(page){expect(await page.evaluate(()=>window.nodeFileFixture.writes)).toBe(0);expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);}

test('automatic reader settings switch initialization without model calls or file writes',async({page})=>{
 await fixture(page,'read-file',false,true);await openDetails(page);
 await expect(file(page).locator('[data-file-status]')).toHaveText('Ready');
 const initialization=file(page).getByLabel('When no file is set',{exact:true});await expect(initialization).toHaveCount(1);await expect(initialization).toHaveValue('generate');
 await expect(page.locator('.pc-node-profile[data-id="file"] .profile-bar')).toBeVisible();
 await file(page).getByLabel('Initialization instructions',{exact:true}).fill('Keep unknown story facts unspecified.');await file(page).getByLabel('Initialization instructions',{exact:true}).press('Tab');
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.file.initializationInstructions)).toBe('Keep unknown story facts unspecified.');
 await file(page).getByLabel('Initialization completion limit',{exact:true}).fill('3072');await file(page).getByLabel('Initialization completion limit',{exact:true}).press('Tab');
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.file.initializationMaxTokens)).toBe(3072);
 await file(page).getByLabel('File name',{exact:true}).fill('Story state');
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.file.fileTarget?.name)).toBe('Story state.json');
 expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.file.initializationMaxTokens)).toBe(3072);
 expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.file.fileTarget?.content)).toBeUndefined();
 await file(page).screenshot({path:'.tmp/file-initialization-panel.png'});
 await initialization.selectOption('require-file');
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.file.initialization)).toBe('require-file');
 await expect(file(page).locator('[data-file-status]')).toHaveText('Needs attention');
 await expect(page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness')).toContainText('Setup Required');
 await initialization.selectOption('generate');
 await expect(file(page).locator('[data-file-status]')).toHaveText('Ready');
 await expect(page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness')).toHaveCount(0);
 await expect(page.locator('.pc-node-profile[data-id="file"] .profile-bar')).toBeVisible();
 await expect(file(page).getByLabel('Initialization instructions',{exact:true})).toHaveValue('Keep unknown story facts unspecified.');
 await initialization.selectOption('template');
 await expect(file(page).locator('[data-file-status]')).toHaveText('Ready');
 await expect(file(page).getByLabel('Initialization instructions',{exact:true})).toHaveCount(0);
 await expect(page.locator('.pc-node-profile[data-id="file"] .profile-bar')).toHaveCount(0);
 await noWrites(page);
});

test('generic reader chooses the real input without requiring a filename and configuration writes no output bytes',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await fixture(page);await openDetails(page);
 await expect(file(page).getByLabel('File name',{exact:true})).toHaveValue('');
 await file(page).getByRole('button',{name:'Choose file…',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.file.fileTarget?.name)).toBe('journal.txt');
 await expect(file(page).getByLabel('File name',{exact:true})).toHaveValue('journal');
 await expect(file(page).locator('[data-file-status]')).toHaveText('Ready');
 await expect(file(page).getByRole('button',{name:'Save file settings',exact:true})).toHaveCount(0);
 await expect(file(page).locator('[data-file-advanced]')).not.toHaveAttribute('open');
 await noWrites(page);expect(errors).toEqual([]);await file(page).screenshot({path:testInfo.outputPath('reader-ready.png')});
});

test('inherited writers keep File handling enabled while destination changes stay advanced',async({page})=>{
 await fixture(page,'write-file');await page.evaluate(async()=>{const h=window.canvasHarness;h.canvas.select({kind:'node',id:'file'});await h.settle();});await expect(file(page)).toBeVisible();
 const handling=file(page).getByLabel('File handling',{exact:true});await expect(handling).toBeEnabled();await handling.selectOption('replace');
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.file.fileHandling)).toBe('replace');
 await expect(page.getByLabel('Mutation',{exact:true})).toHaveCount(0);
 await expect(file(page).getByLabel('File destination',{exact:true})).not.toBeVisible();
 await file(page).getByText('Advanced',{exact:true}).click();await expect(file(page).getByLabel('File destination',{exact:true})).toBeVisible();await noWrites(page);
});

test('a configured external file keeps its grant and name while a renamed draft waits for a new copy',async({page})=>{
 await fixture(page);await openDetails(page);await file(page).getByRole('button',{name:'Choose file…',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>!!window.canvasHarness.graph.nodes.file.fileTarget?.bindingId)).toBe(true);
 const original=await page.evaluate(()=>structuredClone(window.canvasHarness.graph.nodes.file.fileTarget));
 await file(page).getByLabel('File name',{exact:true}).fill('Separate destination');
 await expect(file(page)).toContainText('The original file stays unchanged.');
 await page.waitForTimeout(450);expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.file.fileTarget)).toEqual(original);await noWrites(page);
});

test('existing browser grants retain capability guidance under Advanced when native support is unavailable',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'brave',{configurable:true,value:{isBrave:async()=>true}});Object.defineProperty(window,'showOpenFilePicker',{configurable:true,value:undefined});Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined});});
 await fixture(page,'read-file',true);await openDetails(page);
 await expect(file(page).getByRole('button',{name:'Choose file…',exact:true})).toBeDisabled();await expect(file(page).locator('[data-file-access-issue]')).not.toBeVisible();
 await file(page).getByText('Advanced',{exact:true}).click();await expect(file(page).locator('[data-file-access-issue]')).toContainText('Brave');await noWrites(page);
});

test('File controls fit narrow, light and dark panels and keyboard navigation opens Advanced',async({page},testInfo)=>{
 await fixture(page,'read-file',false,true);await openDetails(page);
 const details=page.locator('.pc-workspace-details');
 for(const [name,preset,width] of [['dark','lattice','340px'],['light','ash','340px'],['narrow','lattice','220px']]){
  await page.evaluate(async({preset,width})=>{const h=window.canvasHarness;await(await import('/src/theme.js?v='+h.version)).setPreset(preset);document.querySelector('.pc-body').style.setProperty('--pc-details-width',width);await h.settle();},{preset,width});
  const summary=file(page).getByText('Advanced',{exact:true});await summary.focus();await page.keyboard.press('Enter');await expect(file(page).locator('[data-file-advanced]')).toHaveAttribute('open','');
  expect(await details.evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThanOrEqual(1);
  const overflow=await file(page).locator('button,input,select,textarea,output').evaluateAll(elements=>{const box=document.querySelector('.pc-workspace-details').getBoundingClientRect();return elements.filter(element=>element.getClientRects().length).filter(element=>{const rect=element.getBoundingClientRect();return rect.left<box.left-1||rect.right>box.right+1;}).map(element=>element.getAttribute('aria-label')??element.textContent);});expect(overflow).toEqual([]);
  await details.screenshot({path:testInfo.outputPath('file-'+name+'.png'),animations:'disabled'});await summary.focus();await page.keyboard.press('Enter');
 }
 await noWrites(page);
});
