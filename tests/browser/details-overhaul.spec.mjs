import { test, expect } from '@playwright/test';
import { openDetailGroup } from './details-helpers.mjs';

async function setup(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(()=>!!window.canvasHarness);
    await page.evaluate(async()=>{
        const h=window.canvasHarness, { fixtureGraph: starterGraph }=await import('/tests/helpers/workflow-fixtures.mjs');
        await h.activate(starterGraph('structured-guidance'));
        h.canvas.select({kind:'node',id:'compose-json'}); await h.settle();
    });
}

test('simplified inspector keeps modifier edits undoable and compact confined to graph commands',async({page},testInfo)=>{
    await setup(page);
    const panel=page.getByRole('region',{name:'Node details',exact:true});
    await expect(panel.getByLabel('Node name',{exact:true})).toHaveValue('Compose');
    await expect(panel.getByLabel('Compact card',{exact:true})).toHaveCount(0);
    await expect(panel.getByLabel('Enabled',{exact:true})).toHaveCount(0);
    const before=await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph));
    const name=panel.getByLabel('Node name',{exact:true});
    await name.fill('C'); await name.press('Shift+C');
    expect(await page.locator('.pc-node[data-id="compose-json"]').evaluate(e=>e.classList.contains('pc-node-compact'))).toBe(false);
    await name.fill('Compose'); await name.press('Tab');
    const card=page.locator('.pc-node[data-id="compose-json"]'); await card.focus(); await page.keyboard.press('Shift+C');
    await expect(card).toHaveClass(/pc-node-compact/);
    await card.focus(); await page.keyboard.press('F2'); await expect(name).toBeFocused();
    await panel.getByLabel('Trim output',{exact:true}).check();
    await expect(card.locator('.pc-modifier-badge')).toHaveText('+1');
    expect(await page.evaluate(()=>window.canvasHarness.graph.nodes['compose-json'].modifiers[0].type)).toBe('trim');
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    expect(await page.evaluate(()=>window.canvasHarness.graph.nodes['compose-json'].modifiers)).toBeUndefined();
    await page.getByRole('button',{name:'Redo',exact:true}).click();
    await panel.getByLabel('Wrap output',{exact:true}).check();
    const wrap=panel.locator('[data-modifier-id]').nth(1);
    await wrap.locator('summary').click();
    await panel.getByLabel('Wrap Prefix',{exact:true}).fill('<result>');
    await panel.getByLabel('Wrap Suffix',{exact:true}).fill('</result>');
    await panel.getByRole('button',{name:'Save Wrap settings',exact:true}).click();
    expect(await page.evaluate(()=>window.canvasHarness.graph.nodes['compose-json'].modifiers[1].settings.prefix)).toBe('<result>');
    await panel.getByRole('button',{name:'Move Wrap up',exact:true}).click();
    expect(await page.evaluate(()=>window.canvasHarness.graph.nodes['compose-json'].modifiers.map(m=>m.type))).toEqual(['wrap','trim']);
    await panel.getByLabel('Enable Wrap modifier',{exact:true}).uncheck();
    await expect(card.locator('.pc-modifier-badge')).toHaveText('+1');
    expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
    expect(await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph))).not.toBe(before);
    await page.screenshot({path:testInfo.outputPath('details-active-modifiers.png'),animations:'disabled'});
});

test('real JSON Decode schema saves as text and survives history',async({page})=>{
    await setup(page);
    await page.evaluate(async()=>{const h=window.canvasHarness;h.canvas.select({kind:'node',id:'json-decode'});await h.settle();});
    await page.getByLabel('Schema schema enabled',{exact:true}).check();
    await page.getByRole('button',{name:'Edit Schema schema as JSON',exact:true}).click();
    const schema=page.getByLabel('Schema schema JSON',{exact:true});
    const value='{ "type": "object" }'; await schema.fill(value);
    await page.getByRole('button',{name:'Save Schema',exact:true}).click();
    expect(await page.evaluate(()=>window.canvasHarness.graph.nodes['json-decode'].schema)).toBe(value);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    expect(await page.evaluate(()=>typeof window.canvasHarness.graph.nodes['json-decode'].schema)).toBe('string');
    expect(await page.evaluate(()=>window.canvasHarness.graph.nodes['json-decode'].schema)).toBe('');
    await expect(page.getByLabel('Schema schema enabled',{exact:true})).not.toBeChecked();
    await page.getByRole('button',{name:'Redo',exact:true}).click();
    await expect(schema).toHaveValue(value);
});

for(const theme of ['lattice','ash']) for(const width of [220,258,520]) {
    test(`details layout is readable at ${width}px in ${theme}`,async({page},testInfo)=>{
        await setup(page);
        await page.evaluate(async({theme,width})=>{const h=window.canvasHarness,t=await import('/src/theme.js?v='+h.version);t.setPreset(theme);await h.settle();document.querySelector('.pc-native-workspace').style.setProperty('--pc-details-width',width+'px');},{theme,width});
        const panel=page.locator('.pc-workspace-details');
        expect(await panel.evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
        await expect(page.getByRole('button',{name:'Add section',exact:true})).toBeVisible();
        await page.screenshot({path:testInfo.outputPath(`details-${theme}-${width}.png`),animations:'disabled'});
    });
}

for(const theme of ['lattice','ash']) for(const state of ['model','curve','readonly']) {
    test(`narrow ${state} details remain legible in ${theme}`,async({page},testInfo)=>{
        await setup(page);
        await page.evaluate(async({state,theme})=>{
            const h=window.canvasHarness, { fixtureGraph: starterGraph }=await import('/tests/helpers/workflow-fixtures.mjs'), {operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
            if(state==='model') {
                const graph=starterGraph('native-guidance'); graph.nodes['response-plan'].enabled=false;
                await h.activate(graph); h.canvas.select({kind:'node',id:'response-plan'});
            } else if(state==='curve') {
                const graph={id:'visual-curve',name:'State curve',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{curve:{...operationDefaults('state',{mode:'curve'}),id:'curve',type:'workflow',operation:'state',operationVersion:1,x:100,y:100}},wires:{},groups:{},portals:{},definitions:{},view:{x:0,y:0,zoom:1}};
                await h.activate(graph); h.canvas.select({kind:'node',id:'curve'});
            } else {
                const {effectiveInstanceWorkflow}=await import('/tests/fixtures/workflow-effective-instance.mjs');
                const graph=effectiveInstanceWorkflow();graph.mode='native-unified';await h.activate(graph);
            }
            const t=await import('/src/theme.js?v='+h.version); t.setPreset(theme); await h.settle();
            document.querySelector('.pc-native-workspace').style.setProperty('--pc-details-width','220px');
        },{state,theme});
        if(state==='readonly') {
            await page.locator('.pc-node[data-id="one"] .pc-native-heading').dblclick();
            await page.evaluate(async()=>{const h=window.canvasHarness;h.canvas.select({kind:'node',id:'inherited'});await h.settle();});
            await expect(page.getByText('Read-only body',{exact:true})).toBeVisible();
            await expect(page.getByLabel('Instructions',{exact:true})).toBeDisabled();
            await expect(page.getByLabel('Node name',{exact:true})).toBeEnabled();
        } else if(state==='curve') {
            await openDetailGroup(page, 'Bounds');
            await openDetailGroup(page, 'Phases');
            await expect(page.getByLabel('Decay',{exact:true})).toBeVisible();
            await expect(page.getByLabel('Curve ID',{exact:true})).toHaveAttribute('type','text');
            await expect(page.getByRole('button',{name:'Edit Phase durations as JSON',exact:true})).toBeVisible();
        } else {
            await expect(page.getByText('Blocks run · Disabled',{exact:true})).toBeVisible();
            await expect(page.getByLabel('Model mode',{exact:true})).toBeHidden();
            await expect(page.locator('details[data-model-controls] > summary')).toHaveText('Advanced model settings');
            await expect(page.locator('.pc-node-details .pc-diagnostic[data-severity="error"]').filter({ hasText: /profile|connection/i })).toBeVisible();
        }
        expect(await page.locator('.pc-workspace-details').evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({path:testInfo.outputPath(`details-${state}-${theme}.png`),animations:'disabled'});
        expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
    });
}


test('shared table import remains local and cancelling preserves the ordinary inspector and graph',async({page})=>{
 await setup(page);await page.evaluate(async()=>{const h=window.canvasHarness,{operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);await h.activate({id:'n7-overhaul-import',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{fields:{...operationDefaults('select-fields'),id:'fields',type:'workflow',x:80,y:80}},wires:{},definitions:{},portals:{},groups:{}});h.canvas.select({kind:'node',id:'fields'});await h.settle();});
 const panel=page.getByRole('region',{name:'Node details',exact:true}),before=await page.evaluate(()=>structuredClone(window.canvasHarness.graph));
 await panel.getByRole('button',{name:'Import Fields table',exact:true}).click();await panel.getByLabel('Table data',{exact:true}).fill('Name,Path\nOne,invalid');
 await panel.getByLabel('Map name column',{exact:true}).selectOption('Name');await panel.getByLabel('Map path column',{exact:true}).selectOption('Path');await panel.getByRole('button',{name:'Review import',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('Row 2, cell 2');await expect(panel.getByRole('button',{name:'Save Fields',exact:true})).toBeDisabled();
 await panel.getByRole('button',{name:'Cancel import',exact:true}).click();await expect(panel.getByRole('button',{name:'Save Fields',exact:true})).toBeEnabled();
 await panel.getByRole('button',{name:'Import Fields table',exact:true}).click();await expect(panel.getByLabel('Table data',{exact:true})).toHaveValue('Name,Path\nOne,invalid');
 expect(await page.evaluate(()=>window.canvasHarness.graph)).toEqual(before);expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
