import {test,expect} from '@playwright/test';
async function load(page){await page.addInitScript(()=>{window.showOpenFilePicker=undefined;window.showSaveFilePicker=undefined;});await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);}
async function selectFile(page,value,command='Import into graph…'){
    await page.getByRole('button',{name:'File',exact:true}).click();const chooser=page.waitForEvent('filechooser');
    await page.getByRole('menuitem',{name:command,exact:true}).click();await(await chooser).setFiles({name:'workflow.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
}
async function fragment(page){return page.evaluate(async()=>{const h=window.canvasHarness,{exportWorkflow}=await import('/src/workflow/packages.js?v='+h.version),g=h.S.blankGraph('Imported text');g.nodes.text={id:'text',type:'workflow',operation:'compose',operationVersion:1,x:10,y:20,sections:[{name:'Text',text:'Imported fixture'}]};return exportWorkflow(g);});}
async function snapshot(page){return page.evaluate(()=>{const h=window.canvasHarness,s=h.S.settings();return {graph:structuredClone(h.graph),enabled:s.enabled,chat:structuredClone(h.context.chat)};});}
test('current additive review is pure until acceptance and one Undo restores the authored document',async({page})=>{
    await load(page);const before=await snapshot(page),file=await fragment(page);await selectFile(page,file);
    const review=page.getByRole('dialog',{name:'Import into graph',exact:true});await expect(review).toBeVisible();expect(await snapshot(page)).toEqual(before);
    await review.getByRole('button',{name:'Insert into graph',exact:true}).click();
    const after=await snapshot(page);expect(Object.keys(after.graph.nodes).length).toBe(Object.keys(before.graph.nodes).length+1);
    for(const key of ['enabled','chat'])expect(after[key]).toEqual(before[key]);
    await page.keyboard.press('Control+z');const undone=await snapshot(page);expect(undone.graph.nodes).toEqual(before.graph.nodes);expect(undone.graph.wires).toEqual(before.graph.wires);
    await page.keyboard.press('Control+Shift+z');expect((await snapshot(page)).graph.nodes).toEqual(after.graph.nodes);
});
for(const change of ['body','read-only','session','path','root'])test('import review rejects changed '+change+' authority without another history step',async({page})=>{
    await load(page);const file=await fragment(page);await page.evaluate(()=>{const h=window.canvasHarness;window.editOwner={sessionId:'import',viewPath:[],readOnly:false};window.editRoot=h.graph;window.originalEditRoot=h.graph;h.UI.setGraphEditAdapter({root:()=>window.editRoot,readContext:()=>window.editOwner});});await selectFile(page,file);
    const review=page.getByRole('dialog',{name:'Import into graph',exact:true});await expect(review).toBeVisible();
    await page.evaluate(change=>{const h=window.canvasHarness;if(change==='body'){Object.values(h.graph.nodes).find(node=>node.operation==='generate-reply').budgetTokens=192;h.S.touchGraph(h.graph);h.H.flush(h.graph);}else if(change==='read-only')window.editOwner.readOnly=true;else if(change==='session')window.editOwner.sessionId='reopened';else if(change==='path')window.editOwner.viewPath=['child'];else {window.editRoot=structuredClone(h.graph);h.S.activateWorkflow(window.editRoot,{clean:true});}},change);
    const before=await snapshot(page),history=await page.evaluate(()=>window.canvasHarness.H.peek(window.canvasHarness.graph));
    if(change==='root'){
        expect(await page.evaluate(()=>window.editRoot!==window.originalEditRoot&&window.canvasHarness.graph===window.editRoot)).toBe(true);
        await expect(review).toBeHidden();
        expect(await page.evaluate(()=>window.canvasHarness.graph.nodes)).toEqual(await page.evaluate(()=>window.originalEditRoot.nodes));
        await page.evaluate(()=>window.canvasHarness.settle());
    }else{
        await review.getByRole('button',{name:'Insert into graph',exact:true}).click();
        await expect(review.getByRole('alert')).toBeVisible();
    }
    expect(await snapshot(page)).toEqual(before);expect(await page.evaluate(()=>window.canvasHarness.H.peek(window.canvasHarness.graph))).toEqual(history);
});
test('retired and unsupported files reject before review or mutation',async({page})=>{
    await load(page);const file=await fragment(page),before=await snapshot(page);
    for(const invalid of [{schema:1,nodes:{},wires:{}},{...file,schema:99},{...file,graph:{...file.graph,schema:2,runtime:1}}]){
        const count=await page.evaluate(()=>window.canvasHarness.toasts.length);await selectFile(page,invalid);await expect.poll(()=>page.evaluate(()=>window.canvasHarness.toasts.length)).toBeGreaterThan(count);
        await expect(page.getByRole('dialog',{name:'Import into graph',exact:true})).toHaveCount(0);expect(await snapshot(page)).toEqual(before);
    }
});
test('an import captured before a camera gesture preserves the current camera on acceptance',async({page})=>{
    await load(page);await selectFile(page,await fragment(page));await page.evaluate(()=>window.canvasHarness.view({x:654,y:321,zoom:.7}));
    const before=await page.evaluate(()=>({...window.canvasHarness.canvas.view}));await page.getByRole('dialog',{name:'Import into graph',exact:true}).getByRole('button',{name:'Insert into graph',exact:true}).click();
    expect(await page.evaluate(()=>({...window.canvasHarness.canvas.view}))).toEqual(before);
});
