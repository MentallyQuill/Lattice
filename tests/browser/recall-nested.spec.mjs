import {test,expect} from '@playwright/test';

async function launch(page){
 await page.route('**/scripts/user.js',route=>route.fulfill({contentType:'text/javascript',body:"export function getCurrentUserHandle(){return 'default-user';}"}));
 await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'}));
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async()=>{
  const h=window.canvasHarness,c=h.context;c.chatId='Nested Story';c.characterId=0;c.groupId=null;c.characters=[{avatar:'mara.png',data:{name:'Mara'}}];c.chat=[{mes:'Mara waits.',is_user:true,extra:{}}];
  const {starterGraph}=await import('/src/workflow/starters.js?v='+h.version),{operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version),{computeDefinitionIdentity,definitionRefKey}=await import('/src/workflow/definitions.js?v='+h.version),g=starterGraph('unified-basic');
  const wrapper=(id,memorySetId,enabled=true)=>{const checked=computeDefinitionIdentity({id:id+'-definition',version:1,name:id,parameters:[],interface:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{shortcut:{...operationDefaults('hotkey-arm'),id:'shortcut',type:'workflow',actorId:'character:mara.png',memorySetId,hotkey:{code:id==='right'?'KeyT':'KeyM',ctrl:true,alt:false,shift:true,meta:false},x:200,y:300},recall:{...operationDefaults('recall'),id:'recall',type:'workflow',actorId:'character:mara.png',memorySetId,x:520,y:300}},wires:{}}});if(!checked.ok)throw Error(JSON.stringify(checked.error));const definition={...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};g.definitions[definitionRefKey(definition)]=definition;g.nodes[id]={id,type:'subgraph',enabled,definition:{id:definition.id,version:definition.version,semanticHash:definition.semanticHash},parameterOverrides:{},roleOverrides:{},nodeBindingOverrides:{},x:50,y:450};};
  wrapper('left','left-memories');wrapper('right','right-memories');wrapper('disabled','disabled-memories',false);await h.activate(g);h.canvas.hooks.onOpen(h.graph.nodes.left);await h.view({x:10,y:10,zoom:1});await h.settle();
 });
 await page.getByRole('checkbox',{name:'Enable Lattice',exact:true}).check();
 await page.evaluate(async()=>{const h=window.canvasHarness,r=await import('/src/run.js?v='+h.version);await r.initializeNativeWorkflowController();const synced=r.getNativeWorkflowController().syncRecall();if(!synced.ok||!synced.data.scope)throw Error(JSON.stringify(synced));await h.settle();});
}
async function status(page){return page.evaluate(async()=>{const h=window.canvasHarness,r=await import('/src/run.js?v='+h.version);return r.getNativeWorkflowController().statusRecall().data;});}
test('nested selected Recall queues, cancels and opens exact addressed shortcut details',async({page})=>{
 await launch(page);const recall=page.locator('.pc-node[data-id="recall"]');await expect(recall).toBeVisible();await recall.click({button:'right'});
 await page.getByRole('menuitem',{name:'Queue recall',exact:true}).click();await expect(page.locator('.pc-node-recall-status')).toHaveCount(2);
 expect((await status(page)).requests.filter(item=>item.queued).map(item=>item.memorySetId)).toEqual(['left-memories']);
 await recall.getByRole('button',{name:/Memory recall:/}).click();const details=page.getByRole('region',{name:'Memory recall',exact:true});await expect(details).toContainText('Queued');
 await details.getByRole('button',{name:'Cancel recall',exact:true}).click();await expect(page.locator('.pc-node-recall-status')).toHaveCount(0);
 await details.getByRole('button',{name:/Recall Shortcut/}).click();await expect(page.getByRole('region',{name:'Node details',exact:true})).toContainText('Recall Shortcut');
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
test('global Recall overview labels and reveals sibling instances with duplicate local IDs',async({page})=>{
 await launch(page);await page.getByRole('menuitem',{name:'Workflow',exact:true}).click();await page.getByRole('menuitem',{name:'Memory recall',exact:true}).hover();await page.getByRole('menuitem',{name:'Queue recall for all eligible nodes',exact:true}).click();
 expect((await status(page)).requests.filter(item=>item.queued).map(item=>item.memorySetId).sort()).toEqual(['left-memories','right-memories']);
 await page.getByRole('menuitem',{name:'Workflow',exact:true}).click();await page.getByRole('menuitem',{name:'Memory recall',exact:true}).hover();await page.getByRole('menuitem',{name:'Memory recall overview…',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Memory recall',exact:true});await expect(dialog.locator('[data-recall-set]')).toHaveCount(2);
 await dialog.getByRole('button',{name:'Recalled memories · right / recall',exact:true}).click();await expect(page.locator('.pc-node[data-id="recall"]')).toBeVisible();
 const details=page.getByRole('region',{name:'Memory recall',exact:true});await expect(details).toContainText('right-memories');await details.getByRole('button',{name:'Cancel recall',exact:true}).click();
 expect((await status(page)).requests.filter(item=>item.queued).map(item=>item.memorySetId)).toEqual(['left-memories']);expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
