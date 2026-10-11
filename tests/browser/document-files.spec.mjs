import {test,expect} from '@playwright/test';

async function launch(page) {
    await page.addInitScript(()=>{
        const disk=window.documentDisk={text:'',version:1,writes:0,opens:0,saves:0};
        const handle={
            name:'Canvas.workflow.json',
            async queryPermission(){return 'granted';},
            async isSameEntry(other){return other===handle;},
            async getFile(){return new File([disk.text],handle.name,{lastModified:disk.version});},
            async createWritable(){let text;return {async write(value){text=value;},async close(){disk.text=text;disk.version++;disk.writes++;},async abort(){}};},
        };
        window.showOpenFilePicker=async()=>{disk.opens++;return [handle];};
        window.showSaveFilePicker=async()=>{disk.saves++;return handle;};
    });
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(()=>!!window.canvasHarness);
    await page.evaluate(()=>window.canvasHarness.reset(2,2));
}
async function fileCommand(page,name) {
    await page.getByRole('button',{name:'File',exact:true}).click();
    await page.getByRole('menuitem',{name}).click();
}
async function saveAs(page) {
    await fileCommand(page,/^Save As/);
    await expect(page.locator('.pc-document-name')).toHaveText('Canvas.workflow.json');
    await expect(page.locator('.pc-document-status')).not.toContainText('Modified');
}
async function edit(page,name) {
    await page.evaluate(value=>{const h=window.canvasHarness;h.graph.description=value;h.S.touchGraph(h.graph);},name);
    await expect(page.locator('.pc-document-status')).toContainText('Modified');
}

test('native Save As adopts a file; Save writes it; camera and close preserve the document',async({page})=>{
    await launch(page);
    await expect(page.getByRole('combobox',{name:'Workflow',exact:true})).toHaveCount(0);
    await saveAs(page);
    await edit(page,'Saved edit');
    await page.keyboard.press('Control+s');
    await expect(page.locator('.pc-document-status')).not.toContainText('Modified');
    expect(await page.evaluate(()=>({writes:documentDisk.writes,pickers:documentDisk.saves,description:JSON.parse(documentDisk.text).graph.description}))).toEqual({writes:2,pickers:1,description:'Saved edit'});
    await page.evaluate(async()=>{const h=window.canvasHarness,root=h.graph;await h.view({x:80,y:60,zoom:.8});h.UI.close();h.UI.open();await h.settle();window.sameDocument=root===h.graph;});
    expect(await page.evaluate(()=>window.sameDocument)).toBe(true);
    await expect(page.locator('.pc-document-status')).not.toContainText('Modified');
    await page.getByRole('button',{name:'File',exact:true}).click();
    await page.screenshot({path:'.tmp/document-native-wide.png'});
    await page.setViewportSize({width:760,height:650});
    await page.getByRole('button',{name:'File',exact:true}).click();
    await page.getByRole('menuitem',{name:'Open Recent',exact:true}).click();
    await expect(page.getByRole('menuitem',{name:'Canvas.workflow.json',exact:true})).toBeVisible();
    await page.screenshot({path:'.tmp/document-native-narrow.png'});
});

test('Open and Recent reread disk, guard edits, reset history and clear only the list',async({page})=>{
    await launch(page);await saveAs(page);await edit(page,'Keep this draft');
    await fileCommand(page,/^Open workflow/);
    const prompt=page.getByRole('dialog',{name:'Save workflow changes?',exact:true});
    await expect(prompt).toBeVisible();await prompt.getByRole('button',{name:'Cancel',exact:true}).click();
    expect(await page.evaluate(()=>window.canvasHarness.graph.description)).toBe('Keep this draft');
    await fileCommand(page,/^Open workflow/);await prompt.getByRole('button',{name:"Don't Save",exact:true}).click();
    await expect(prompt).toHaveCount(0);
    expect(await page.evaluate(()=>window.canvasHarness.graph.description)).not.toBe('Keep this draft');
    await page.evaluate(()=>{const value=JSON.parse(documentDisk.text);value.graph.description='Changed on disk';documentDisk.text=JSON.stringify(value);documentDisk.version++;});
    await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Open Recent',exact:true}).click();
    await page.getByRole('menuitem',{name:'Canvas.workflow.json',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.description)).toBe('Changed on disk');
    await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
    const disk=await page.evaluate(()=>documentDisk.text);
    await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Open Recent',exact:true}).click();await page.getByRole('menuitem',{name:'Clear Recent',exact:true}).click();
    expect(await page.evaluate(()=>documentDisk.text)).toBe(disk);
    await page.getByRole('button',{name:'File',exact:true}).click();await expect(page.getByRole('menuitem',{name:'Open Recent',exact:true})).toBeDisabled();
});

test('an external file edit blocks Save and preserves the active draft',async({page})=>{
    await launch(page);await saveAs(page);await edit(page,'Local unsaved work');
    await page.evaluate(()=>{const value=JSON.parse(documentDisk.text);value.graph.description='External work';documentDisk.text=JSON.stringify(value);documentDisk.version++;});
    await page.keyboard.press('Control+s');
    await expect(page.locator('.pc-document-status')).toContainText('Save As');
    expect(await page.evaluate(()=>({draft:window.canvasHarness.graph.description,disk:JSON.parse(documentDisk.text).graph.description,writes:documentDisk.writes}))).toEqual({draft:'Local unsaved work',disk:'External work',writes:1});
});
