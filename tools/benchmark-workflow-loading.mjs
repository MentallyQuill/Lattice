/**
 * Diagnostic browser benchmark; no production source files are edited.
 * Run npm run build first.
 *   node tools/benchmark-workflow-loading.mjs [--quick]
 *   node tools/benchmark-workflow-loading.mjs --general [--quick]
 *   node tools/benchmark-workflow-loading.mjs --experiments [--quick]
 *   node tools/benchmark-workflow-loading.mjs --helpers [--quick]
 * Cache-bypass and empty-preview variants are savings bounds, not product fixes.
 * Timings are synthetic-click dispatch, first rAF opportunity and three-rAF settling.
 * File input is an in-memory fixture; dirty-prompt time and OS/network I/O are excluded.
 * Profiles time selected synchronous functions; selfMs includes uninstrumented calls.
 * CDP counters also include selector/profiling bookkeeping and are supporting diagnostics.
 */
import { chromium } from '@playwright/test';
import ts from 'typescript';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const date=new Date().toISOString();
const quick=process.argv.includes('--quick');
const mode=process.argv.includes('--general')?'general':process.argv.includes('--experiments')?'experiments':process.argv.includes('--helpers')?'helpers':'examples';
let contextSequence=0;
const out = resolve(root, 'benchmark-results/workflow-loading-benchmark');
await mkdir(out, { recursive: true });
const targets = {
  '/src/ui/example-catalog.js': ['projectWorkflowExamples','projectThumbnail'],
  '/src/workflow/examples.js': ['admitExamplePackages','independentCopy','listWorkflowExamples','listWorkflowExampleResults','installWorkflowExample'],
  '/src/ui/controller.js': ['refreshExampleCatalog','prepareWorkspaceDocument','activateEditorDraw','setCanvasGraph','renderAll','renderDocumentState','updateWorkflowProjection','persistGraphViews','workspaceInputs'],
  '/src/ui/workspace-preparation.js': ['prepareWorkspaceViews','prepareLibraryViews','prepareEditorDrawBase','projectEditorDraw','projectWorkspacePanels','prepareEndpointAttachments'],
  '/src/workflow/graph-validation.js': ['inspectExpandedGraph','inspectScope','inspectSnapshots','expandChecked','prepareDefinitionRegistry','inspectPreparedDefinition','safeWorkflowData'],
  '/src/workflow/graph-artifacts.js': ['prepareGraphArtifacts','graphArtifactsFor'],
  '/src/workflow/packages.js': ['parseWorkflow','exportWorkflow'],
  '/src/workflow/contracts.js': ['validateGraphStructure','validateWorkflow'],
  '/src/workflow/document.js': ['cloneWorkflowDocument'],
  '/src/workflow/document-file.js': ['serializeWorkflowDocument','parseWorkflowDocument','workflowDocumentSnapshot'],
  '/src/workflow/resolve.js': ['prepareWorkflowPlanner'],
  '/src/ui/graph-view-session.js': ['createGraphViewSession'],
  '/src/ui/workflow-surface.js': ['prepareWorkflowProjection','projectPreparedWorkflow'],
  '/src/ui/native-search-catalog.js': ['prepareNativeSearchCatalog'],
  '/src/state.js': ['admitActiveDocument','activateDocument','activateWorkflow','persistRecovery','flushRecovery','save'],
  '/src/canvas.js': ['setGraph','#renderScene','#drawNodes','#drawWires','fit','safePreparedGraph'],
};
const patches = {};
function instrument(code, path) {
  const names = new Set(targets[path] ?? []);
  const ast = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [], found = [];
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.body && node.name &&
        !node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      const name = node.name.getText(ast);
      if (names.has(name)) {
        const label = path.replace('/src/','') + ':' + name;
        found.push(name);
        edits.push({at:node.body.getStart(ast)+1, text:'const __auditFrame=window.__latency.enter('+JSON.stringify(label)+');try{'});
        edits.push({at:node.body.end-1, text:'}finally{window.__latency.leave(__auditFrame);}'});
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if(names.size&&[...names].some(name=>!found.includes(name)))throw Error('Instrumentation targets changed in '+path+': '+[...names].filter(name=>!found.includes(name)).join(', '));
  if(names.size)patches[path] = found;
  for (const edit of edits.sort((a,b)=>b.at-a.at)) code = code.slice(0,edit.at) + edit.text + code.slice(edit.at);
  return code;
}
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server = createServer(async (req,res) => {
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+(pathname==='/'?'/tests/browser/harness.html':pathname));
    if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
    res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(path));
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();
const errors=[], rows=[], micro=[];
async function setup(rate=1,profile=false,variant='baseline'){
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push({variant,message:e.message}));
  await page.addInitScript(()=>{
    window.__latency={
      rows:{},stack:[],long:[],
      enter(name){const frame={name,start:performance.now(),child:0};this.stack.push(frame);return frame;},
      leave(frame){const time=performance.now()-frame.start;this.stack.pop();const parent=this.stack.at(-1);if(parent)parent.child+=time;
        const row=this.rows[frame.name]??={calls:0,inclusiveMs:0,selfMs:0,maxMs:0};
        row.calls++;row.inclusiveMs+=time;row.selfMs+=time-frame.child;row.maxMs=Math.max(row.maxMs,time);},
      reset(){this.rows={};this.long=[];},
    };
    new PerformanceObserver(list=>window.__latency.long.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
  });
  if(variant.startsWith('single-activation'))await page.route('**/index.js?*',async route=>{
    const response=await route.fetch();const original=await response.text();
    const body=original.replace('previous = snapshot(); UI.refreshIfOpen(); paintSendbar();','previous = snapshot(); paintSendbar();');
    if(body===original)throw Error('Activation experiment did not match source');
    await route.fulfill({response,body});
  });
  if(profile||variant!=='baseline')await page.route('**/src/**/*.js?*',async route=>{
    const response=await route.fetch();
    const path=new URL(route.request().url()).pathname;
    let body=await response.text();
    if(profile)body=instrument(body,path);
    // Measurement-only alternatives; never change checked-out production code.
    if((variant==='early-catalog-cache'||variant==='cache-plus-empty-preview')&&path==='/src/ui/example-catalog.js')
      body=body.replace('export function projectWorkflowExamples() {','export function projectWorkflowExamples() { if(cachedTiles) return cachedTiles;');
    if((variant==='no-thumbnail-dom'||variant==='cache-plus-empty-preview')&&path==='/src/ui/example-catalog.js')
      body=body.replaceAll('return cachedTiles;','return cachedTiles.map(tile=>({...tile,thumbnail:tile.thumbnail?{bounds:tile.thumbnail.bounds,nodes:[],wires:[],groups:[],comments:[]}:null}));')
               .replace('return cachedTiles;\n}', 'return cachedTiles;\n}');
    if(variant.startsWith('single-activation-single-render')&&path==='/src/ui/controller.js')
      body=body.replace('if (isOpen()) { current = graph; setCanvasGraph(); renderAll(); }','if (isOpen()) { current = graph; setCanvasGraph(); renderAll({ canvasReady: true }); }');
    if(variant.includes('hoisted-helpers')&&path==='/src/ui/workspace-preparation.js'){
      const before=body;
      body=body.replace('const navigation = [], preparedViews = composition.data.views.map(view => {','const commonIterationHelpers = iterationHelperChoices(root, helperProfiles); const navigation = [], preparedViews = composition.data.views.map(view => {')
        .replace('drawBase.iterationHelpers = iterationHelperChoices(root, helperProfiles);','drawBase.iterationHelpers = structuredClone(commonIterationHelpers);');
      if(body===before||!body.includes('structuredClone(commonIterationHelpers)'))throw Error('Helper experiment did not match source');
    }
    await route.fulfill({response,body});
  });
  const cdp=await context.newCDPSession(page);
  if(rate!==1)await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  await cdp.send('Performance.enable');
  await page.goto(url+'/tests/browser/harness.html');
  await page.waitForFunction(()=>!!window.canvasHarness);
  const metadata=await page.evaluate(async()=>{
    const h=window.canvasHarness;
    const entries=(await import('/src/workflow/remastered-example-data.js?v='+h.version)).REMASTERED_WORKFLOW_EXAMPLE_DATA;
    return entries.map(e=>({id:e.id,number:e.number,title:e.title,difficulty:e.lesson?.difficulty,
      bytes:new TextEncoder().encode(JSON.stringify(e.packages[0])).length,
      rootNodes:Object.keys(e.packages[0].graph.nodes).length,
      rootWires:Object.keys(e.packages[0].graph.wires).length,
      definitions:Object.keys(e.packages[0].graph.definitions??{}).length}));
  });
  return {context,page,cdp,rate,profile,variant,metadata,contextId:++contextSequence,sequence:0,catalogOpened:false};
}
async function metrics(cdp){return Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));}
async function clean(page){
  await page.evaluate(()=>{const s=window.canvasHarness.S.documentSession;s.markSaved(s.capture(),s.snapshot(),s.source());});
}
async function fileMenu(page){
  await page.evaluate(async()=>{document.querySelector('[role="menuitem"][data-command="unused"]');const file=[...document.querySelectorAll('[role="menubar"] [role="menuitem"]')].find(e=>e.textContent.trim()==='File');file.click();await new Promise(r=>requestAnimationFrame(r));});
}
async function sample(env,kind,number=undefined,repeat=0){
  const {page,cdp}=env;
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  const before=await metrics(cdp),catalogState=env.catalogOpened?'warm':'cold';
  const value=await page.evaluate(async ({kind,number})=>{
    const audit=window.__latency,h=window.canvasHarness;
    audit.reset();
    const graphBefore=h.graph.name,start=performance.now();
    if(kind==='picker'){
      const trigger=[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.trim()==='Open examples…');
      if(!trigger)throw Error('Examples menu trigger missing');trigger.click();
    }else if(kind==='example'){
      const button=[...document.querySelectorAll('.pc-example-tile')].find(e=>e.querySelector('.pc-example-title')?.textContent.trim().startsWith(number+'. '));
      if(!button)throw Error('Example tile missing '+number);button.click();
    }else if(kind==='file'){const button=[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.trim().startsWith('Open workflow…'));if(!button)throw Error('Open command missing');button.click();}else if(kind==='reopen'){
      h.UI.open();
    }
    const clickHandlerMs=performance.now()-start;
    const firstFrame=await new Promise(r=>requestAnimationFrame(()=>r(performance.now()-start)));
    await new Promise(r=>requestAnimationFrame(r));
    await new Promise(r=>requestAnimationFrame(r));
    // For workflow activation, resolve after the picker closes and deferred fit runs.
    if(kind==='example'&&document.querySelector('[role="dialog"][aria-label="Examples"]'))throw Error('Example did not close picker');
    const end=performance.now(),settledMs=end-start,profile=structuredClone(audit.rows);
    if(kind==='example'&&!h.graph.name.startsWith(number+'. '))throw Error('Wrong lesson activated');
    if(kind!=='picker'){const expected=Object.values(h.canvas.graph.nodes).filter(n=>n.type!=='note'||!n.commentFrame).length;const actual=document.querySelectorAll('.pc-canvas-host .pc-node-native').length;if(actual!==expected)throw Error('Rendered card count disagrees with prepared scene');}
    if(kind==='picker'&&document.querySelectorAll('.pc-example-tile').length!==30)throw Error('Missing example tiles');
    const root=document.querySelector('.pc-examples-grid');
    return {clickHandlerMs,firstFrameMs:firstFrame,settledMs,
      pickerDom:root?.querySelectorAll('*').length??0,previewDom:root?.querySelectorAll('svg *').length??0,
      tileCount:root?.querySelectorAll('.pc-example-tile').length??0,
      canvasDom:document.querySelector('.pc-canvas-host')?.querySelectorAll('*').length??0,
      renderedCards:document.querySelectorAll('.pc-canvas-host .pc-node-native').length,
      graphBefore,graphAfter:h.graph.name,providers:h.providerCalls(),profile,start,end,
      longTasks:audit.long.filter(e=>e.start>=start)};
  },{kind,number});
  const after=await metrics(cdp);
  await page.waitForTimeout(10);
  value.longTasks=await page.evaluate(({start,end})=>window.__latency.long.filter(e=>e.start+e.duration>start&&e.start<end),{start:value.start,end:value.end});
  delete value.start;delete value.end;
  if(kind==='picker')env.catalogOpened=true;
  const row={kind,number,repeat,contextId:env.contextId,sequence:++env.sequence,catalogState:kind==='picker'?catalogState:undefined,rate:env.rate,profiled:env.profile,variant:env.variant,...value,
    layoutCount:after.LayoutCount-before.LayoutCount,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,
    styleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000};
  rows.push(row);
  console.log(JSON.stringify({kind,number,repeat,rate:env.rate,profiled:env.profile,variant:env.variant,
    handler:Math.round(value.clickHandlerMs),firstFrame:Math.round(value.firstFrameMs),settled:Math.round(value.settledMs),
    layouts:row.layoutCount,layoutMs:Math.round(row.layoutMs)}));
  return row;
}
async function closePicker(page){await page.evaluate(async()=>{document.querySelector('[role="dialog"][aria-label="Examples"] [aria-label="Close panel"]')?.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function openPicker(env,repeat=0){await fileMenu(env.page);return sample(env,'picker',undefined,repeat);}
async function run_examples(){
  // Repeated uninstrumented measurements; fresh page means cold catalog, but app modules are already loaded.
  for(const rate of quick?[1]:[1,4]){
    for(let cold=0;cold<(quick?1:3);cold++){
      const env=await setup(rate,false);
      await openPicker(env,cold);
      if(cold===0){
        for(let i=0;i<(quick?1:4);i++){await closePicker(env.page);await openPicker(env,i+1);}
        // Measure every lesson once; repeat representative larger examples twice more.
        const selected=quick?[1,27,29,30]:rate===1?env.metadata.map(x=>x.number):[1,18,23,24,25,26,27,28,29,30];
        for(const number of selected){
          await clean(env.page);await sample(env,'example',number,0);await openPicker(env,100+number);
        }
        for(let repeat=1;repeat<=(quick?0:2);repeat++)for(const number of [1,23,24,25,26,27,28,29,30]){
          await clean(env.page);await sample(env,'example',number,repeat);await openPicker(env,200+number);
        }
        // General workspace opening on the current advanced lesson.
        await closePicker(env.page);await clean(env.page);
        for(let i=0;i<(quick?1:3);i++){await env.page.evaluate(()=>window.canvasHarness.UI.close());await sample(env,'reopen',30,i);}
      }
      await env.context.close();
    }
  }
  const profiled=await setup(1,true);
  await openPicker(profiled,0);await closePicker(profiled.page);await openPicker(profiled,1);
  for(const number of [1,23,24,25,26,27,28,29,30]){
    await clean(profiled.page);await sample(profiled,'example',number,0);await openPicker(profiled,100+number);
  }
  await closePicker(profiled.page);await profiled.page.evaluate(()=>window.canvasHarness.UI.close());await sample(profiled,'reopen',30,0);
  // Separate primitive stages using the same admitted source; do not sum these as activation totals.
  const microEnv=await setup(1,false);
  micro.push(...await microEnv.page.evaluate(async()=>{
    const h=window.canvasHarness;
    const {installWorkflowExample}=await import('/src/workflow/examples.js?v='+h.version);
    const {prepareWorkspaceViews}=await import('/src/ui/workspace-preparation.js?v='+h.version);
    const {cloneWorkflowDocument}=await import('/src/workflow/document.js?v='+h.version);
    const results=[];
    for(const number of [1,23,24,25,26,27,28,29,30]){
      const id='lesson-'+String(number).padStart(2,'0'),row={number};
      for(const [name,fn]of Object.entries({install:()=>installWorkflowExample(id),
        prepare:()=>prepareWorkspaceViews(graph),clone:()=>cloneWorkflowDocument(graph)})){
        var graph=installWorkflowExample(id).data.graph;
        const times=[];
        for(let i=0;i<7;i++){const start=performance.now();const result=fn();if(!result.ok)throw Error(JSON.stringify(result));times.push(performance.now()-start);}
        row[name]=times;
      }
      results.push(row);
    }
    return results;
  }));
  await microEnv.context.close();
  const metadata=profiled.metadata;
  await profiled.context.close();
  for(const variant of ['early-catalog-cache','no-thumbnail-dom']){
    for(const rate of [1,4]){
      const env=await setup(rate,false,variant);
      await openPicker(env,0);
      for(let i=1;i<=3;i++){await closePicker(env.page);await openPicker(env,i);}
      await env.context.close();
    }
  }
  await writeFile(resolve(out,'audit.json'),JSON.stringify({
    date,revision,browser:await browser.version(),cpu:cpus()[0].model,
    viewport:{width:1440,height:1000},scope:'Local static browser harness; freshly built production Svelte UI. Synthetic DOM click invokes actual UI handlers; durations exclude Playwright actionability, app startup, dirty guard user think time, disk/network file picking and host/model calls. First-frame callback is an opportunity to render; 3-rAF settled includes deferred fit, not a pixel presentation guarantee. CPU throttle 4 is a sensitivity test, not measured hardware.',
    patches,metadata,errors,rows,micro},null,2));
  if(errors.length)throw Error(JSON.stringify(errors));
  console.log('Saved '+rows.length+' samples to '+out);

}
async function run_general(){
  for(const rate of quick?[1]:[1,4])for(const profiled of rate===1?[false,true]:[false]){
    const env=await setup(rate,profiled);
    for(const size of (quick?[25,100]:[25,100,250,25,'combined'])){
      const fixture=await env.page.evaluate(async size=>{
        const h=window.canvasHarness;
        let text,name;
        if(size==='combined'){
          text=await (await fetch('/examples/unified/unified-combined-systems.lattice-document.json')).text();
          name=JSON.parse(text).graph.name;
        }else{
          const {canvasWorkflow}=await import('/tests/browser/native-fixture.mjs');
          const {operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
          const {serializeWorkflowDocument}=await import('/src/workflow/document-file.js?v='+h.version);
          const graph=canvasWorkflow(operationDefaults,size,8);graph.name='Audit '+size+' nodes';
          const encoded=serializeWorkflowDocument(graph);if(!encoded.ok)throw Error(JSON.stringify(encoded));text=encoded.data.json;name=graph.name;
        }
        const {setWorkflowFileAccess}=await import('/src/ui/controller.js?v='+h.version);
        setWorkflowFileAccess({native:false,ready:Promise.resolve({ok:true}),recents:()=>[],open:async()=>({ok:true,data:{text,source:{kind:'audit',name:'audit.workflow.json'}}}),save:async()=>({ok:false,cancelled:true})});
        return {size,name,bytes:new TextEncoder().encode(text).length};
      },size);
      for(let repeat=0;repeat<(quick?1:3);repeat++){
        await clean(env.page);await fileMenu(env.page);
        const row=await sample(env,'file',size,repeat);row.fixture=fixture;
        if(row.graphAfter!==fixture.name)throw Error('File did not activate: '+JSON.stringify(row));
      }
      await clean(env.page);
      for(let repeat=0;repeat<(quick?1:2);repeat++){await env.page.evaluate(()=>window.canvasHarness.UI.close());const row=await sample(env,'reopen',size,repeat);row.fixture=fixture;}
    }
    await env.context.close();
  }
  await writeFile(resolve(out,'general-workflows.json'),JSON.stringify({date,revision,browser:await browser.version(),cpu:cpus()[0].model,scope:'Actual File/Open command with in-memory adapter; excludes OS picker/network/disk latency. Same 3-rAF timing and instrumentation as examples audit.',errors,rows},null,2));
  if(errors.length)throw Error(JSON.stringify(errors));
  console.log('Saved general workflow audit: '+rows.length+' samples');

}
async function run_experiments(){
  for(const variant of ['baseline','early-catalog-cache','no-thumbnail-dom','cache-plus-empty-preview']){
    const env=await setup(1,false,variant);await openPicker(env,0);
    for(let repeat=1;repeat<=(quick?1:4);repeat++){await closePicker(env.page);await env.page.waitForTimeout(220);await openPicker(env,repeat);}
    await env.context.close();
  }
  for(const variant of ['baseline','single-activation','single-activation-single-render']){
    const env=await setup(1,true,variant);await openPicker(env,0);
    for(let repeat=0;repeat<(quick?1:3);repeat++)for(const number of (quick?[27]:[1,27,29,30])){
      await clean(env.page);await env.page.waitForTimeout(220);await sample(env,'example',number,repeat);await openPicker(env,100+number);
    }
    await closePicker(env.page);
    const fixture=await env.page.evaluate(async()=>{
      const h=window.canvasHarness,text=await(await fetch('/examples/unified/unified-combined-systems.lattice-document.json')).text();
      const {setWorkflowFileAccess}=await import('/src/ui/controller.js?v='+h.version);
      setWorkflowFileAccess({native:false,ready:Promise.resolve({ok:true}),recents:()=>[],open:async()=>({ok:true,data:{text,source:{kind:'audit',name:'audit.workflow.json'}}})});
      return {name:JSON.parse(text).graph.name,bytes:new TextEncoder().encode(text).length};
    });
    for(let repeat=0;repeat<(quick?0:2);repeat++){
      await clean(env.page);await fileMenu(env.page);await env.page.waitForTimeout(220);
      const row=await sample(env,'file','combined',repeat);row.fixture=fixture;
      if(row.graphAfter!==fixture.name)throw Error('Combined did not activate');
    }
    await env.context.close();
  }
  await writeFile(resolve(out,'experiments.json'),JSON.stringify({date,revision,browser:await browser.version(),cpu:cpus()[0].model,scope:'Measurement-only source substitutions. No production edits. Cache variants bypass invalidation and empty preview variants remove content; diagnostic savings bounds, not complete product implementations. Single-activation removes only index.js redundant UI refresh; single-render also skips the activation listener renderAll Canvas.render after setGraph.',errors,rows},null,2));
  if(errors.length)throw Error(JSON.stringify(errors));
  console.log('Saved '+rows.length+' controlled experiment samples');

}
async function run_helpers(){
  for(const variant of ['baseline','hoisted-helpers','single-activation-single-render-hoisted-helpers']){
    const env=await setup(1,true,variant);
    const fixture=await env.page.evaluate(async()=>{
      const h=window.canvasHarness,text=await(await fetch('/examples/unified/unified-combined-systems.lattice-document.json')).text();
      const {setWorkflowFileAccess}=await import('/src/ui/controller.js?v='+h.version);
      setWorkflowFileAccess({native:false,ready:Promise.resolve({ok:true}),recents:()=>[],open:async()=>({ok:true,data:{text,source:{kind:'audit',name:'audit.workflow.json'}}})});
      return {name:JSON.parse(text).graph.name,bytes:new TextEncoder().encode(text).length};
    });
    for(let repeat=0;repeat<(quick?1:3);repeat++){
      await clean(env.page);await fileMenu(env.page);await env.page.waitForTimeout(220);
      const row=await sample(env,'file','combined',repeat);row.fixture=fixture;
      if(row.graphAfter!==fixture.name)throw Error('Combined did not activate');
    }
    await env.context.close();
  }
  await writeFile(resolve(out,'iteration-helpers.json'),JSON.stringify({date,revision,browser:await browser.version(),cpu:cpus()[0].model,scope:'Combined-workflow helper hoist A/B. Computes identical iteration helper choices once per workspace preparation, clones the DTO per view. Final variant also removes redundant activation refresh and render. Source substitutions only.',errors,rows},null,2));
  if(errors.length)throw Error(JSON.stringify(errors));
  console.log('Saved helper experiment');

}
try{await ({examples:run_examples,general:run_general,experiments:run_experiments,helpers:run_helpers})[mode]();}finally{await browser.close();await new Promise(r=>server.close(r));}
