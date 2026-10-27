import {test,expect} from '@playwright/test';

async function launch(page){
 await page.route('**/scripts/user.js',route=>route.fulfill({contentType:'text/javascript',body:"export function getCurrentUserHandle(){return 'default-user';}"}));
 await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'}));
 await page.route('**/api/chats/get',async route=>{
  const saved=await page.evaluate(()=>structuredClone(window.canvasHarness.context.chatMetadata));
  await route.fulfill({contentType:'application/json',body:JSON.stringify([{chat_metadata:saved}])});
 });
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async()=>{
  const h=window.canvasHarness,c=h.context;c.chatId='Story-2';c.characterId=0;c.groupId=null;c.characters=[{name:'Mara',avatar:'mara.png',chat:'Story-2'}];c.chat=[{mes:'Mara waits.',is_user:true,extra:{}}];c.getRequestHeaders=()=>({'Content-Type':'application/json'});c.historySaves=0;c.saveMetadata=async()=>{c.historySaves++;};
  const runtime=await import('/src/run.js?v='+h.version),catalog=runtime.getStoryDocumentCatalog();
  catalog.define({targetId:'notes',name:'Campaign notes',format:'text',content:'',visibility:{kind:'public'}});
  c.chatMetadata.latticeDocuments={'default-user':{notes:{targetId:'notes',revision:2,format:'text',content:'Accepted campaign notes.',receipts:[{intentId:'old',fingerprint:'sha256:'+'a'.repeat(64),revision:2}],scope:{userId:'default-user',chatId:'Story-2'}}}};
  document.dispatchEvent(new CustomEvent('pc-state'));await h.settle();
 });
}

test('retired global file configuration is absent while saved chat documents remain untouched',async({page})=>{
 await launch(page);const before=await page.evaluate(()=>({metadata:JSON.stringify(window.canvasHarness.context.chatMetadata),saves:window.canvasHarness.context.historySaves}));
 await page.getByRole('menuitem',{name:'Workflow',exact:true}).click();
 await expect(page.getByRole('menuitem',{name:'Configure',exact:true})).toHaveCount(0);
 await expect(page.getByRole('menuitem',{name:'Legacy chat data…',exact:true})).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'Legacy chat data',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Preview history checkpoint',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>({metadata:JSON.stringify(window.canvasHarness.context.chatMetadata),saves:window.canvasHarness.context.historySaves}))).toEqual(before);
});

test('current workflow tools preserve retained private documents and their archive metadata',async({page})=>{
 await launch(page);await page.evaluate(()=>{
  const c=window.canvasHarness.context;
  c.chatMetadata.latticeDocuments['default-user'].notes.visibility={kind:'actor-private',actorId:'mara'};
  c.chatMetadata.latticeDocumentHistory={'default-user':{retainedArchive:{kind:'legacy-archive',targetId:'notes',privateActorIds:['mara'],receipts:[{intentId:'retired-intent',revision:1}]}}};
 });
 const before=await page.evaluate(()=>JSON.stringify(window.canvasHarness.context.chatMetadata));
 await page.getByRole('menuitem',{name:'Workflow',exact:true}).click();
 await page.getByRole('menuitem',{name:'Memory recall',exact:true}).hover();
 await page.getByRole('menuitem',{name:'Memory recall overview…',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Memory recall',exact:true})).toBeVisible();
 await expect(page.getByRole('dialog',{name:'Legacy chat data',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Close',exact:true}).click();
 expect(await page.evaluate(()=>JSON.stringify(window.canvasHarness.context.chatMetadata))).toBe(before);
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
