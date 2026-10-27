import {test,expect} from '@playwright/test';

const panel=page=>page.getByRole('region',{name:'Node details',exact:true});
const schema=JSON.stringify({type:'object',properties:{concerns:{type:'array',items:{type:'string'}},summary:{type:'string'}},required:['summary'],additionalProperties:false});
async function open(page,kind='model'){
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async({kind,schema})=>{
  const h=window.canvasHarness,{operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
  const call={...operationDefaults('model-call'),id:'call',type:'workflow',outputKind:'data',schema,x:350,y:120};
  const graph={id:'slim-inspector-browser',name:'Slim inspector',schema:3,runtime:2,mode:kind==='fixed'?'native-pre':'native-unified',nodes:{call,text:{...operationDefaults('text'),id:'text',type:'workflow',text:'Example',x:60,y:120}},wires:{prompt:{id:'prompt',route:'wire',from:'text',fromPort:'out',to:'call',toPort:'prompt'}},definitions:{},groups:{},portals:{},roles:{}};
  if(kind==='connected'){graph.nodes.consumer={...operationDefaults('reroute'),id:'consumer',type:'workflow',artifactKind:'data',phase:'pre',x:620,y:120};graph.wires.result={id:'result',route:'wire',from:'call',fromPort:'out',to:'consumer',toPort:'in'};}
  if(kind==='inferred'){delete graph.nodes.text;graph.nodes.snapshot={...operationDefaults('reply-snapshot'),id:'snapshot',type:'workflow',x:0,y:120};graph.nodes.body={...operationDefaults('draft-text'),id:'body',type:'workflow',x:160,y:120};graph.wires={draft:{id:'draft',route:'wire',from:'snapshot',fromPort:'out',to:'body',toPort:'draft'},prompt:{id:'prompt',route:'wire',from:'body',fromPort:'out',to:'call',toPort:'prompt'}};}
  await h.activate(graph);h.canvas.select({kind:'node',id:'call'});await h.settle();
 },{kind,schema});
 await expect(panel(page)).toBeVisible();
}
async function fits(page){
 const overflow=await panel(page).evaluate(root=>{const edge=root.getBoundingClientRect();return [...root.querySelectorAll('input,select,textarea,button')].filter(node=>{const b=node.getBoundingClientRect();return b.width>0&&(b.right>edge.right+1||b.left<edge.left-1);}).map(node=>node.getAttribute('aria-label')??node.textContent);});
 expect(overflow).toEqual([]);
 expect(await page.locator('.pc-workspace-details').evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);
}

test('production Model Call uses inline fields, atomic format changes, and a real retry slider with Undo',async({page})=>{
 await open(page);const details=panel(page);
 await expect(details.getByLabel('Output schema schema enabled',{exact:true})).toHaveCount(0);
 await details.getByRole('button',{name:'Edit Output schema field concerns',exact:true}).click();
 await details.getByRole('button',{name:'Edit Output schema list item definition',exact:true}).click();
 await expect(details.locator('[data-schema-path=\'["properties","concerns","items"]\']')).toBeVisible();
 await expect(details.getByRole('button',{name:'Edit Output schema field summary',exact:true})).toBeVisible();
 const before=await page.evaluate(()=>structuredClone(window.canvasHarness.graph.wires));
 await details.getByRole('radio',{name:'Plain text',exact:true}).check();
 expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.call.schema)).toBe('');
 await details.getByRole('radio',{name:'JSON data',exact:true}).check();
 expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.call.schema)).toBe(schema);
 expect(await page.evaluate(()=>window.canvasHarness.graph.wires)).toEqual(before);
 const limits=details.locator('[data-control-group="Limits & retries"]');await limits.locator(':scope > summary').click();
 const retries=details.getByRole('slider',{name:'Additional attempts',exact:true});await retries.focus();await page.keyboard.press('End');
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.call.maxRetries)).toBe(5);
 await expect(details.getByText('Up to 6 model calls in total. Only eligible failures are retried.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.call.maxRetries)).toBe(0);
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});

test('incompatible output and inferred stage changes keep the graph and show rejection',async({page})=>{
 await open(page,'connected');const before=await page.evaluate(()=>structuredClone(window.canvasHarness.graph));
 await panel(page).getByRole('radio',{name:'Plain text',exact:true}).click();
 await expect(panel(page).getByRole('radio',{name:'JSON data',exact:true})).toBeChecked();
 expect(await page.evaluate(()=>window.canvasHarness.graph)).toEqual(before);
 await expect(panel(page).locator('.pc-detail-error').filter({hasText:'Connection types do not match'})).toBeVisible();
 await open(page,'inferred');const stage=panel(page).getByRole('combobox',{name:'Workflow stage',exact:true});
 await expect(stage).toHaveValue('post');await expect(panel(page).getByText('From connections',{exact:true})).toBeVisible();
 await stage.selectOption('pre');await expect(stage).toHaveValue('post');
 expect(await page.evaluate(()=>Object.hasOwn(window.canvasHarness.graph.nodes.call,'phase'))).toBe(false);
 await open(page,'fixed');await expect(panel(page).getByRole('combobox',{name:'Workflow stage',exact:true})).toHaveCount(0);
});

for(const width of [220,258,380,520])test(`schema and record layouts remain usable at ${width}px`,async({page},testInfo)=>{
 await open(page);await page.evaluate(width=>document.querySelector('.pc-body').style.setProperty('--pc-details-width',width+'px'),width);
 await panel(page).getByRole('button',{name:'Edit Output schema field concerns',exact:true}).click();
 await panel(page).getByRole('button',{name:'Edit Output schema list item definition',exact:true}).click();await fits(page);
 const fields=panel(page).getByRole('region',{name:'Output schema fields',exact:true});await expect(fields).toHaveAttribute('tabindex','0');
 await page.screenshot({path:testInfo.outputPath(`model-call-${width}.png`),animations:'disabled'});
});

test('all affected operation families expose their real controls without horizontal overflow',async({page},testInfo)=>{
 test.setTimeout(120000);await open(page);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const operations=['json-decode','extract','model-call','format','read-file','write-file','project-document','pattern','compose','text-rules','select-fields','state','join','collect','decision','advance-time','context-join','chunk','condition','time-trigger','collection','recall','style-transfer','enrich','revise-draft'];
 for(const operation of operations){
  await page.evaluate(async operation=>{const h=window.canvasHarness,{operationDefaults,OPERATIONS}=await import('/src/workflow/catalog.js?v='+h.version);const version=OPERATIONS[operation];const graph={id:'slim-inventory-'+operation,schema:version.minimumSchema??3,runtime:version.minimumRuntime??2,mode:'native-unified',roles:{},nodes:{work:{...operationDefaults(operation),id:'work',type:'workflow',x:200,y:100}},wires:{},definitions:{},groups:{},portals:{}};await h.activate(graph);h.canvas.select({kind:'node',id:'work'});await h.settle();document.querySelector('.pc-body').style.setProperty('--pc-details-width','258px');},operation);
  await expect(panel(page)).toBeVisible();expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.work.operation)).toBe(operation);
  const groups=await panel(page).locator('details[data-control-group]').evaluateAll(nodes=>nodes.filter(node=>!node.open).map(node=>node.getAttribute('data-control-group')));
  for(const name of groups)await panel(page).locator(`details[data-control-group=${JSON.stringify(name)}] > summary`).click();
  await fits(page);
  if(['compose','decision','advance-time','recall'].includes(operation))await page.screenshot({path:testInfo.outputPath(`${operation}-258.png`),animations:'disabled'});
 }
 expect(errors).toEqual([]);expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
