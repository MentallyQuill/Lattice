import {test,expect} from '@playwright/test';
const heading=(page,id)=>page.locator(`.pc-node[data-id="${id}"] .pc-native-heading`);
async function start(page){await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);}
async function workflowMenu(page){await page.getByRole('menubar',{name:'Workspace menus'}).getByRole('menuitem',{name:'Workflow',exact:true}).click();}

test('workflow output menu enrolls an explicit terminal and persists one undoable semantic step',async({page})=>{
 await start(page);await page.evaluate(async()=>{const h=window.canvasHarness,{starterGraph}=await import('/src/workflow/starters.js?v='+h.version);const graph=starterGraph('unified-basic');graph.runTargets=[];graph.nodes.extra={...structuredClone(graph.nodes['review-publish']),id:'extra',x:800,y:100};graph.wires.extra={...structuredClone(graph.wires.draft),id:'extra',to:'extra'};await h.activate(graph);h.H.flush(graph);h.H.track(graph);});
 await workflowMenu(page);await page.getByRole('menuitem',{name:'Workflow outputs',exact:true}).click();
 const outputs=page.getByRole('menu',{name:'Workflow outputs options',exact:true});
 await expect(outputs.getByRole('menuitemcheckbox')).toHaveCount(2);
 const target=outputs.getByRole('menuitemcheckbox',{name:/review-publish$/});await expect(target).not.toBeChecked();await target.click();
 expect(await page.evaluate(()=>window.canvasHarness.graph.runTargets)).toEqual([{instancePath:[],nodeId:'review-publish'}]);
 const selection=await page.evaluate(async()=>{const h=window.canvasHarness,r=await import('/src/workflow/resolve.js?v='+h.version),result=r.resolveWorkflow(h.graph);return result.data.primitives.filter(unit=>unit.included).map(unit=>unit.address.nodeId);});expect(selection).toContain('review-publish');expect(selection).not.toContain('extra');
 const roundtrip=await page.evaluate(async()=>{const h=window.canvasHarness,p=await import('/src/workflow/packages.js?v='+h.version);return p.parseWorkflow(JSON.stringify(p.exportWorkflow(h.graph))).data.runTargets;});expect(roundtrip).toEqual([{instancePath:[],nodeId:'review-publish'}]);
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await page.evaluate(()=>window.canvasHarness.graph.runTargets)).toEqual([]);
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await heading(page,'review-publish').click({button:'right'});await page.getByRole('menuitemcheckbox',{name:'Remove from workflow run',exact:true}).click();expect(await page.evaluate(()=>window.canvasHarness.graph.runTargets)).toEqual([]);
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});

test('Run to Here creates current causal paint only after an incomplete selected draft is attempted',async({page},testInfo)=>{
 await start(page);await page.evaluate(async()=>{const h=window.canvasHarness,{operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);const graph={id:'attempt-draft',schema:3,runtime:2,mode:'native-unified',runTargets:[],nodes:{draft:{id:'draft',type:'workflow',...operationDefaults('select-fields'),x:100,y:100,w:260},orphan:{id:'orphan',type:'workflow',...operationDefaults('select-fields'),x:500,y:100,w:260}},wires:{},definitions:{},portals:{},groups:{}};await h.activate(graph);await h.view({x:200,y:50,zoom:1});h.canvas.select({kind:'node',id:'draft'});await h.settle();});
 await expect(page.locator('.pc-output-preview .pc-diagnostic[data-severity="error"]')).toHaveCount(0);await expect(page.locator('.pc-run-failed')).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('quiet-unattempted-preview.png')});
 await heading(page,'draft').click({button:'right'});const run=page.getByRole('menuitem',{name:'Run to here',exact:true});await expect(run).toBeEnabled();await run.click();
 await expect(page.locator('.pc-node[data-id="draft"]')).toHaveClass(/pc-run-failed/);
 await expect(page.locator('.pc-output-preview .pc-diagnostic[data-severity="error"]')).toHaveCount(1);
 await expect(page.getByRole('region',{name:'Current run error',exact:true})).toContainText('MISSING_INPUT');
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
 await heading(page,'orphan').click();await expect(page.locator('.pc-output-preview .pc-diagnostic[data-severity="error"]')).toHaveCount(0);await expect(page.locator('.pc-node-run-diagnostic')).toHaveCount(0);await expect(page.locator('.pc-node[data-id="draft"]')).toHaveClass(/pc-run-failed/);
 await heading(page,'draft').click();
 await page.evaluate(()=>{const h=window.canvasHarness;window.quietDraftElement=document.querySelector('.pc-node[data-id="draft"]');return h.canvas.endpoint('draft','out','out');});
 await page.evaluate(async()=>{const h=window.canvasHarness;await h.view({...h.canvas.view,x:h.canvas.view.x+20});h.canvas.select(null);await h.settle();});await expect(page.locator('.pc-node[data-id="draft"]')).toHaveClass(/pc-run-failed/);expect(await page.evaluate(()=>window.quietDraftElement===document.querySelector('.pc-node[data-id="draft"]'))).toBe(true);
 await page.evaluate(async()=>{const h=window.canvasHarness;h.graph.nodes.draft.x+=20;h.S.touchGraph(h.graph);await h.settle();});
 await expect(page.locator('.pc-node[data-id="draft"]')).toHaveClass(/pc-run-failed/);
 await heading(page,'draft').click();await page.getByRole('textbox',{name:'Node name',exact:true}).fill('A presentation name');await page.getByRole('textbox',{name:'Node name',exact:true}).press('Tab');await expect(page.locator('.pc-node[data-id="draft"]')).toHaveClass(/pc-run-failed/);
 await page.screenshot({path:testInfo.outputPath('current-attempt-input-cause.png')});
 await page.evaluate(async()=>{const h=window.canvasHarness;h.graph.nodes.draft.enabled=false;h.S.touchGraph(h.graph);await h.settle();});
 await expect(page.locator('.pc-node[data-id="draft"]')).not.toHaveClass(/pc-run-failed/);await expect(page.locator('.pc-output-preview .pc-diagnostic[data-severity="error"]')).toHaveCount(0);
});


test('same-ID nested terminals isolate paint and enroll exact root addresses from a child',async({page})=>{
 await start(page);await page.evaluate(async()=>{
  const h=window.canvasHarness,{computeDefinitionIdentity,definitionRefKey}=await import('/src/workflow/definitions.js?v='+h.version);
  const result=computeDefinitionIdentity({id:'nested-output',version:1,name:'Nested output',interface:[],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{same:{id:'same',type:'workflow',operation:'review-publish',x:100,y:100,w:260}},wires:{}}});if(!result.ok)throw Error(JSON.stringify(result));
  const definition={...result.data.materializedDefinition,semanticHash:result.data.semanticHash},ref={id:definition.id,version:definition.version,semanticHash:definition.semanticHash};
  const node=(id,title,x)=>({id,title,type:'subgraph',definition:ref,parameterOverrides:{},roleOverrides:{},nodeBindingOverrides:{},x,y:100,w:260});
  await h.activate({id:'nested-same-outputs',name:'Nested outputs',schema:3,runtime:2,mode:'native-unified',runTargets:[],nodes:{first:node('first','First',100),second:node('second','Second',500)},wires:{},definitions:{[definitionRefKey(definition)]:definition},portals:{},groups:{}});await h.view({x:200,y:50,zoom:1});
 });
 const open=async id=>{await heading(page,id).click({button:'right'});await page.getByRole('menuitem',{name:'Open subgraph',exact:true}).click();await page.evaluate(()=>window.canvasHarness.view({x:200,y:50,zoom:1}));};
 await open('first');await heading(page,'same').click({button:'right'});await page.getByRole('menuitem',{name:'Run to here',exact:true}).click();await expect(page.locator('.pc-node[data-id="same"]')).toHaveClass(/pc-run-failed/);
 await page.locator('.pc-graph-tab').first().click();await open('second');await heading(page,'same').click();await expect(page.locator('.pc-node[data-id="same"]')).not.toHaveClass(/pc-run-failed/);await expect(page.locator('.pc-node[data-id="same"]')).not.toHaveClass(/pc-trace-failed/);await expect(page.locator('.pc-output-preview .pc-diagnostic[data-severity="error"]')).toHaveCount(0);
 await heading(page,'same').click({button:'right'});await page.getByRole('menuitemcheckbox',{name:'Run with workflow',exact:true}).click();expect(await page.evaluate(()=>window.canvasHarness.graph.runTargets)).toEqual([{instancePath:['second'],nodeId:'same'}]);
 await page.locator('.pc-graph-tab').first().click();await heading(page,'first').click({button:'right'});await page.getByRole('menuitem',{name:'Open saved definition',exact:true}).click();await workflowMenu(page);await page.getByRole('menuitem',{name:'Workflow outputs',exact:true}).click();
 const outputs=page.getByRole('menu',{name:'Workflow outputs options',exact:true});await expect(outputs.getByRole('menuitemcheckbox')).toHaveCount(2);for(const item of await outputs.getByRole('menuitemcheckbox').all())await expect(item).toBeDisabled();
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
