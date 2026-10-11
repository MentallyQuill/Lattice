import {test,expect} from '@playwright/test';

async function launchWithoutChat(page){
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async()=>{
  const h=window.canvasHarness;h.context.chatId=null;h.context.chat=[];h.context.chatMetadata={};
  await h.activate({id:'automatic-workflow-data',name:'Automatic Workflow Data',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{},wires:{},groups:{},portals:{},definitions:{},view:{x:0,y:0,zoom:1}});
 });
}

async function submitAutomaticRead(page,before,phase){
 const configuration=page.getByRole('dialog',{name:'Configure node',exact:true});
 await expect(configuration).toBeVisible();
 await expect(configuration.getByLabel('Workflow data document',{exact:true})).toHaveValue('lattice-default-notes');
 await expect(configuration.getByLabel('Node stage',{exact:true})).toHaveValue(phase);
 expect(await page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes))).toEqual(before);
 await expect(page.getByRole('dialog',{name:'Workflow Data',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>({chatId:window.canvasHarness.context.chatId,chat:window.canvasHarness.context.chat,metadata:window.canvasHarness.context.chatMetadata,calls:window.canvasHarness.providerCalls()}))).toEqual({chatId:null,chat:[],metadata:{},calls:0});
 await configuration.getByRole('button',{name:'Create node',exact:true}).click();
 await expect(configuration).toHaveCount(0);
}

async function addFromSearch(page,operation,label){
 const before=await page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes));
 const host=page.locator('.pc-canvas-host'),position=await host.evaluate(element=>{
  const box=element.getBoundingClientRect();
  for(let y=40;y<box.height-50;y+=80)for(let x=40;x<box.width-50;x+=80){const hit=document.elementFromPoint(box.left+x,box.top+y);if(hit?.closest('.pc-canvas-host')===element&&!hit.closest('.pc-node'))return {x,y};}
  throw Error('The fixture needs an empty canvas point for search.');
 });
 await host.dblclick({position});
 await page.getByRole('combobox',{name:'Search nodes and subgraphs',exact:true}).fill(label);
 await page.locator(`[data-choice="operation:${operation}"]`).click();
 await expect(page.getByRole('dialog',{name:'Add node',exact:true})).toHaveCount(0);
 if(operation==='read-file')await submitAutomaticRead(page,before,'pre');
 else await expect(page.getByRole('dialog',{name:'Configure node',exact:true})).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes).length)).toBe(before.length+1);
 return page.evaluate(before=>Object.values(window.canvasHarness.graph.nodes).find(node=>!before.includes(node.id)),before);
}

async function readHistory(page,before,read){
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 expect(await page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes))).toEqual(before);
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 expect(await page.evaluate(id=>window.canvasHarness.graph.nodes[id],read.id)).toEqual(read);
}

test('automatic data targets need no active chat or setup, with Read File prefilled creation',async({page})=>{
 await launchWithoutChat(page);
 for(const [operation,label,key,targetId,phase] of [['story-clock','Story Clock','clockId','lattice-default-clock','pre'],['read-file','Read File','targetId','lattice-default-notes','pre'],['commit-outcomes','Outcome Commit','targetId','lattice-default-outcomes','post']]){
  const before=await page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes));
  const node=await addFromSearch(page,operation,label);expect(node[key]).toBe(targetId);expect(node.phase).toBe(phase);
  await expect(page.getByRole('dialog',{name:/Configure|Workflow Data/})).toHaveCount(0);
  if(operation==='read-file')await readHistory(page,before,node);
 }
 expect(await page.evaluate(()=>window.canvasHarness.context.chatMetadata)).toEqual({});
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 expect(await page.evaluate(()=>Object.values(window.canvasHarness.graph.nodes).map(node=>node.operation))).toEqual(['story-clock','read-file']);
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 expect(await page.evaluate(()=>Object.values(window.canvasHarness.graph.nodes).filter(node=>node.operation==='commit-outcomes').length)).toBe(1);
});

test('automatic reads added beside a response node retain its effective response stage',async({page})=>{
 await launchWithoutChat(page);
 const outcomes=await addFromSearch(page,'commit-outcomes','Outcome Commit');
 await page.evaluate(async id=>{const h=window.canvasHarness;h.canvas.select({kind:'node',id});await h.settle();},outcomes.id);
 const before=await page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes));
 await page.locator('.pc-family-row[data-family="Input"]').click();await page.locator('[data-shelf-choice="operation:read-file"]').click();
 await submitAutomaticRead(page,before,'post');
 await expect.poll(()=>page.evaluate(()=>Object.values(window.canvasHarness.graph.nodes).filter(node=>node.operation==='read-file').length)).toBe(1);
 const read=await page.evaluate(()=>Object.values(window.canvasHarness.graph.nodes).find(node=>node.operation==='read-file'));expect(read.phase).toBe('post');expect(read.targetId).toBe('lattice-default-notes');
 await readHistory(page,before,read);
 expect(await page.evaluate(()=>({chatId:window.canvasHarness.context.chatId,chat:window.canvasHarness.context.chat,metadata:window.canvasHarness.context.chatMetadata,calls:window.canvasHarness.providerCalls()}))).toEqual({chatId:null,chat:[],metadata:{},calls:0});
});
