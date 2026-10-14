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
 await page.getByRole('menuitem',{name:'Workflow',exact:true}).click();await page.getByRole('menuitem',{name:'Configure',exact:true}).hover();await page.getByRole('menuitem',{name:'Workflow Data…',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Workflow Data',exact:true});await dialog.getByLabel('Workflow data document',{exact:true}).selectOption('notes');return dialog;
}

test('history preview and cancel leave data untouched; Apply saves once and lists archive metadata',async({page})=>{
 const dialog=await launch(page),before=await page.evaluate(()=>JSON.stringify(window.canvasHarness.context.chatMetadata));
 await dialog.getByRole('button',{name:'Preview history checkpoint',exact:true}).click();await expect(dialog.getByRole('region',{name:'History checkpoint preview'})).toContainText('Save receipts: 1');
 await page.screenshot({path:'test-results/history-checkpoint-preview.png'});
 expect(await page.evaluate(()=>JSON.stringify(window.canvasHarness.context.chatMetadata))).toBe(before);
 await dialog.getByRole('button',{name:'Cancel checkpoint',exact:true}).click();await expect(dialog.getByRole('region',{name:'History checkpoint preview'})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Preview history checkpoint',exact:true}).click();await dialog.getByRole('button',{name:'Cancel checkpoint',exact:true}).focus();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Apply checkpoint',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(dialog.getByRole('status')).toContainText('History checkpoint saved');
 expect(await page.evaluate(()=>window.canvasHarness.context.historySaves)).toBe(1);
 expect(await page.evaluate(()=>window.canvasHarness.context.chatMetadata.latticeDocuments['default-user'].notes.content)).toBe('Accepted campaign notes.');
 await dialog.getByRole('button',{name:'Inspect saved history',exact:true}).click();await expect(dialog.getByRole('region',{name:'Saved history'})).toContainText('receipts · 1 record');
 await page.screenshot({path:'test-results/history-checkpoint-desktop.png'});
 await page.setViewportSize({width:600,height:850});await expect(dialog).toBeVisible();
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:'test-results/history-checkpoint-narrow.png'});
});

test('unverified checkpoint feedback holds further previews and read-only inspection verifies without resaving',async({page})=>{
 const dialog=await launch(page);await page.route('**/api/chats/get',route=>route.fulfill({contentType:'application/json',body:'[{"chat_metadata":{}}]'}));
 await dialog.getByRole('button',{name:'Preview history checkpoint',exact:true}).click();await dialog.getByRole('button',{name:'Apply checkpoint',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('durable save is unverified');
 await dialog.getByRole('button',{name:'Preview history checkpoint',exact:true}).click();await expect(dialog).toContainText('PERSISTENCE_UNKNOWN');
 await page.unroute('**/api/chats/get');await page.route('**/api/chats/get',async route=>route.fulfill({contentType:'application/json',body:JSON.stringify([{chat_metadata:await page.evaluate(()=>window.canvasHarness.context.chatMetadata)}])}));
 await dialog.getByRole('button',{name:'Inspect saved history',exact:true}).click();await expect(dialog.getByRole('region',{name:'Saved history'})).toBeVisible();expect(await page.evaluate(()=>window.canvasHarness.context.historySaves)).toBe(1);
});
