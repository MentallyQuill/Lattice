import {test,expect} from '@playwright/test';
async function fixture(page,operation='read-file'){
 await page.route('**/scripts/user.js',route=>route.fulfill({contentType:'text/javascript',body:'export const getCurrentUserHandle=()=>"node-file-browser";'}));
 await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'}));
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async operation=>{
  const h=window.canvasHarness;Object.assign(h.context,{chatId:'node-file-chat',characters:[{name:'Companion',avatar:'companion.png',chat:'node-files'}],characterId:0,groupId:null,chat:[],chatMetadata:{},saveMetadata:async()=>true,getRequestHeaders:()=>({'Content-Type':'application/json'})});
  await (await import('/src/run.js?v='+h.version)).initializeNativeWorkflowController();
  const {createNodeFileAccess,setNodeFileAccess}=await import('/src/ui/node-file-access.js?v='+h.version);
  let state={bindings:[],records:{}};
  window.nodeFileFixture={text:'',writes:0,picks:0};
  const handle={name:'journal.txt',kind:'file',queryPermission:async()=> 'granted',isSameEntry:async other=>other===handle,getFile:async()=>({size:new TextEncoder().encode(window.nodeFileFixture.text).length,text:async()=>window.nodeFileFixture.text}),createWritable:async()=>{window.nodeFileFixture.writes++;let pending;return {write:async text=>{pending=text;},close:async()=>{window.nodeFileFixture.text=pending;},abort:async()=>{}};}};
  const accessOptions={persistence:{load:async()=>state,save:async next=>{state=next;}},showOpenFilePicker:async()=>{window.nodeFileFixture.picks++;return [handle];},showSaveFilePicker:async()=>{window.nodeFileFixture.picks++;return handle;}};
  const access=createNodeFileAccess(accessOptions);
  window.nodeFileFixture.restart=async()=>{const next=createNodeFileAccess(accessOptions);await next.ready;setNodeFileAccess(next);h.UI.refreshIfOpen();await h.settle();};
  await access.ready;setNodeFileAccess(access);
  const {operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
  const node={id:'file',type:'workflow',...operationDefaults(operation),x:140,y:180,w:260};
  await h.activate({id:'node-files-browser',name:'Node files',schema:3,runtime:2,mode:'native-unified',nodes:{file:node},wires:{},groups:{},definitions:{},portals:{}});
  await h.view({x:150,y:100,zoom:1});
 },operation);
}
test('file setup caution opens the node File section and configuration never writes bytes',async({page},testInfo)=>{
 const browserErrors=[];page.on('pageerror',error=>browserErrors.push(error.message));
 await fixture(page);
 const badge=page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness');
 await expect(badge).toHaveAttribute('data-readiness','setup');await badge.click();
 await expect(page.locator('[data-node-file]')).toBeVisible();
 await expect(page.getByLabel('Filename',{exact:true})).toBeFocused();
 await page.getByLabel('Filename',{exact:true}).fill('journal.txt');
 await page.getByRole('button',{name:'Choose location…',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.file.fileTarget?.name)).toBe('journal.txt');
 await expect(badge).toHaveCount(0);
 expect(await page.evaluate(()=>window.nodeFileFixture.writes)).toBe(0);
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
 expect(browserErrors).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('node-file-configured.png')});
});

test('a disconnected writer can choose its own file without creating a Read File node',async({page})=>{
 await fixture(page,'write-file');
 await page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness').click();
 await page.getByLabel('File destination',{exact:true}).selectOption('own');
 await page.getByLabel('Filename',{exact:true}).fill('journal.txt');
 await page.getByRole('button',{name:'Choose location…',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.file.fileTarget?.name)).toBe('journal.txt');
 expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.file.destinationMode)).toBe('own');
 expect(await page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes).length)).toBe(1);
 expect(await page.evaluate(()=>window.nodeFileFixture.writes)).toBe(0);
});


test('a granted restored binding verifies readiness without canceling its first run',async({page})=>{
 await fixture(page);
 await page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness').click();
 await page.getByLabel('Filename',{exact:true}).fill('journal.txt');
 await page.getByRole('button',{name:'Choose location…',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>!!window.canvasHarness.graph.nodes.file.fileTarget?.bindingId)).toBe(true);
 await page.evaluate(()=>window.nodeFileFixture.restart());
 await page.locator('.pc-output-preview [data-run-here]').click();
 await expect(page.locator('.pc-output-preview .pc-preview-status')).toHaveAttribute('data-status','current');
 expect(await page.evaluate(()=>window.nodeFileFixture.writes)).toBe(0);
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
