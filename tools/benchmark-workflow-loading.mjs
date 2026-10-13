/**
 * Browser benchmark of the current examples/workflow UI; no production source mutations.
 * Build first: npm run build.
 * node tools/benchmark-workflow-loading.mjs [--quick] [--profile] [--throttled]
 * node tools/benchmark-workflow-loading.mjs --general [--quick] [--profile] [--throttled]
 * Historical audit substitutions were promoted to production; this tool now measures real code.
 * First rAF is a rendering opportunity, not a pixel timestamp. Readiness is verified separately.
 * Pure synchronous function profiles are inclusive; CDP counters include measurement bookkeeping.
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
const mode=process.argv.includes('--general')?'general':'examples';
const profiled=process.argv.includes('--profile');
const rates=process.argv.includes('--throttled')?[1,4]:[1];
const workingTree=execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim();
let contextSequence=0;
const out = resolve(root, 'benchmark-results/workflow-loading-benchmark');
await mkdir(out, { recursive: true });
const targets = {
  '/src/ui/example-catalog.js': ['projectWorkflowExamples','projectThumbnail'],
  '/src/workflow/examples.js': ['admitExamplePackages','independentCopy','listWorkflowExamples','listWorkflowExampleResults','installWorkflowExample'],
  '/src/ui/controller.js': ['refreshExampleCatalog','prepareWorkspaceDocument','activateEditorDraw','setCanvasGraph','renderAll','renderDocumentState','updateWorkflowProjection','persistGraphViews','workspaceInputs'],
  '/src/ui/configured-node-creation.js': ['iterationHelperChoices'],
  '/src/ui/workspace-preparation.js': ['prepareWorkflowThumbnail','prepareWorkspaceViews','prepareLibraryViews','prepareEditorDrawBase','projectEditorDraw','projectWorkspacePanels','prepareEndpointAttachments'],
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
const patches = {},missingTargets={};
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
  const missing=[...names].filter(name=>!found.includes(name));
  if(missing.length)missingTargets[path]=missing;
  if(missing.some(name=>['prepareWorkspaceDocument','setCanvasGraph','setGraph','#renderScene'].includes(name)))throw Error('Required instrumentation target changed in '+path);
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
const errors=[], rows=[];
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
  if(profile)await page.route('**/src/**/*.js?*',async route=>{
    const response=await route.fetch();
    const body=instrument(await response.text(),new URL(route.request().url()).pathname);
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
  await page.evaluate(async()=>{const file=[...document.querySelectorAll('[role="menubar"] [role="menuitem"]')].find(e=>e.textContent.trim()==='File');file.click();await new Promise(r=>requestAnimationFrame(r));});
}
async function sample(env,kind,number,repeat=0,expectedName){
  const {page,cdp}=env;
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  const before=await metrics(cdp),catalogState=env.catalogOpened?'warm':'cold';
  const value=await page.evaluate(async ({kind,number,expectedName})=>{
    const audit=window.__latency,h=window.canvasHarness,tokenBefore=h.S.documentSession.capture();
    audit.reset();
    const graphBefore=h.graph.name,start=performance.now();
    if(kind==='picker'){
      const trigger=[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.trim()==='Open examples…');
      if(!trigger)throw Error('Examples menu trigger missing');trigger.click();
    }else if(kind==='example'){
      const button=[...document.querySelectorAll('.pc-example-tile')].find(e=>e.querySelector('.pc-example-title')?.textContent.trim().startsWith(number+'. '));
      if(!button||button.disabled)throw Error('Example tile unavailable '+number);button.click();
    }else if(kind==='file'){
      const button=[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.trim().startsWith('Open workflow…'));
      if(!button)throw Error('Open workflow command missing');button.click();
    }else h.UI.open();
    const syncDispatchMs=performance.now()-start;
    const frame=()=>new Promise(r=>requestAnimationFrame(r));
    await frame();
    const firstFrameMs=performance.now()-start;
    const dialog=()=>document.querySelector('[role="dialog"][aria-label="Examples"]');
    const dialogAtFirstFrame=!!dialog();
    const canvasReady=()=>{
      const expected=Object.values(h.canvas.graph.nodes).filter(n=>n.type!=='note'||!n.commentFrame).length;
      return document.querySelectorAll('.pc-canvas-host .pc-node-native').length===expected;
    };
    let catalogReadyMs=null;
    const visiblePreviewState=()=>{
      const grid=dialog()?.querySelector('.pc-examples-grid');
      if(!grid)return {expectedVisiblePreviews:0,mountedVisiblePreviews:0,visiblePreviewCards:0};
      const bounds=grid.getBoundingClientRect();
      const visible=[...grid.querySelectorAll('.pc-example-preview')].filter(preview=>{
        const rect=preview.getBoundingClientRect();
        return rect.width>0&&rect.height>0&&rect.bottom>bounds.top&&rect.top<bounds.bottom&&rect.right>bounds.left&&rect.left<bounds.right;
      });
      return {expectedVisiblePreviews:visible.length,
        mountedVisiblePreviews:visible.filter(preview=>preview.querySelector('.pc-example-card')).length,
        visiblePreviewCards:visible.reduce((count,preview)=>count+preview.querySelectorAll('.pc-example-card').length,0)};
    };
    const ready=()=>{
      if(kind==='picker'){
        const root=dialog(),grid=root?.querySelector('.pc-examples-grid');
        const catalogReady=!!root&&root.getAttribute('aria-busy')!=='true'&&grid?.getAttribute('aria-busy')!=='true'
          &&root.querySelectorAll('.pc-example-tile').length===30&&root.querySelectorAll('.pc-example-preview').length===30;
        if(catalogReady&&catalogReadyMs===null)catalogReadyMs=performance.now()-start;
        const previews=visiblePreviewState();
        return catalogReady&&previews.expectedVisiblePreviews>0&&previews.mountedVisiblePreviews===previews.expectedVisiblePreviews;
      }
      if(kind==='reopen')return canvasReady();
      const current=h.S.documentSession.capture();
      return current!==tokenBefore&&(!expectedName||h.graph.name===expectedName)
        &&(kind!=='example'||!dialog())&&canvasReady();
    };
    while(!ready()){
      if(performance.now()-start>15000)throw Error('Action did not reach ready state: '+kind+' '+number);
      await frame();
    }
    const readyMs=performance.now()-start;
    await frame();await frame();
    const end=performance.now(),grid=document.querySelector('.pc-examples-grid');
    return {syncDispatchMs,firstFrameMs,catalogReadyMs,readyMs,settledMs:end-start,dialogAtFirstFrame,
      ...(kind==='picker'?visiblePreviewState():{}),
      pickerDom:grid?.querySelectorAll('*').length??0,previewDom:grid?.querySelectorAll('svg *').length??0,
      tileCount:grid?.querySelectorAll('.pc-example-tile').length??0,
      canvasDom:document.querySelector('.pc-canvas-host')?.querySelectorAll('*').length??0,
      renderedCards:document.querySelectorAll('.pc-canvas-host .pc-node-native').length,
      graphBefore,graphAfter:h.graph.name,providers:h.providerCalls(),profile:structuredClone(audit.rows),start,end};
  },{kind,number,expectedName});
  const after=await metrics(cdp);
  await page.waitForTimeout(10);
  value.longTasks=await page.evaluate(({start,end})=>window.__latency.long.filter(e=>e.start+e.duration>start&&e.start<end),{start:value.start,end:value.end});
  delete value.start;delete value.end;
  if(kind==='picker')env.catalogOpened=true;
  const row={kind,number,repeat,contextId:env.contextId,sequence:++env.sequence,
    catalogState:kind==='picker'?catalogState:undefined,rate:env.rate,profiled:env.profile,...value,
    layoutCount:after.LayoutCount-before.LayoutCount,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,
    styleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000};
  rows.push(row);
  console.log(JSON.stringify({kind,number,repeat,rate:env.rate,profiled:env.profile,catalogState:row.catalogState,
    firstFrameMs:Math.round(row.firstFrameMs),readyMs:Math.round(row.readyMs),settledMs:Math.round(row.settledMs),
    pickerDom:row.pickerDom,preparations:row.profile['ui/controller.js:prepareWorkspaceDocument']?.calls,
    scenes:row.profile['canvas.js:#renderScene']?.calls}));
  return row;
}
async function closePicker(page){
  await page.evaluate(async()=>{
    document.querySelector('[role="dialog"][aria-label="Examples"] [aria-label="Close panel"]')?.click();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  });
}
async function openPicker(env,repeat=0){await fileMenu(env.page);return sample(env,'picker',undefined,repeat);}
async function examples(rate){
  for(let cold=0;cold<(quick?1:3);cold++){
    const env=await setup(rate,profiled);
    try{
      await env.page.waitForTimeout(220);
      await openPicker(env,cold);
      if(cold!==0)continue;
      if(rate===1)await env.page.screenshot({path:resolve(out,'examples-overview.png')});
      for(let repeat=1;repeat<=(quick?2:4);repeat++){await closePicker(env.page);await openPicker(env,repeat);}
      const selected=quick?[1,27,29,30]:env.metadata.map(e=>e.number);
      for(let repeat=0;repeat<(quick?2:3);repeat++){
        for(const number of repeat===0?selected:selected.filter(n=>[1,23,24,25,26,27,28,29,30].includes(n))){
          const metadata=env.metadata.find(e=>e.number===number);
          await clean(env.page);await env.page.waitForTimeout(220);
          await sample(env,'example',number,repeat,number+'. '+metadata.title);
          await openPicker(env,100+number);
        }
      }
      await closePicker(env.page);
      for(let repeat=0;repeat<(quick?1:3);repeat++){
        await clean(env.page);await env.page.evaluate(()=>window.canvasHarness.UI.close());
        await sample(env,'reopen',30,repeat);
      }
    }finally{await env.context.close();}
  }
}
async function general(rate){
  const env=await setup(rate,profiled);
  try{
    for(const size of quick?[100,250,'combined']:[25,100,250,25,'combined']){
      const fixture=await env.page.evaluate(async size=>{
        const h=window.canvasHarness;let text,name;
        if(size==='combined'){
          text=await(await fetch('/examples/unified/unified-combined-systems.lattice-document.json')).text();
          name=JSON.parse(text).graph.name;
        }else{
          const {canvasWorkflow}=await import('/tests/browser/native-fixture.mjs');
          const {operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
          const {serializeWorkflowDocument}=await import('/src/workflow/document-file.js?v='+h.version);
          const graph=canvasWorkflow(operationDefaults,size,8);graph.name='Audit '+size+' nodes';
          const encoded=serializeWorkflowDocument(graph);if(!encoded.ok)throw Error(JSON.stringify(encoded));
          text=encoded.data.json;name=graph.name;
        }
        const {setWorkflowFileAccess}=await import('/src/ui/controller.js?v='+h.version);
        setWorkflowFileAccess({native:false,ready:Promise.resolve({ok:true}),recents:()=>[],
          open:async()=>({ok:true,data:{text,source:{kind:'audit',name:'audit.workflow.json'}}}),
          save:async()=>({ok:false,cancelled:true})});
        return {size,name,bytes:new TextEncoder().encode(text).length};
      },size);
      for(let repeat=0;repeat<(quick?2:3);repeat++){
        await clean(env.page);await fileMenu(env.page);await env.page.waitForTimeout(220);
        const row=await sample(env,'file',size,repeat,fixture.name);row.fixture=fixture;
      }
      await clean(env.page);
      for(let repeat=0;repeat<(quick?1:2);repeat++){
        await env.page.evaluate(()=>window.canvasHarness.UI.close());
        const row=await sample(env,'reopen',size,repeat);row.fixture=fixture;
      }
    }
  }finally{await env.context.close();}
}
try{
  for(const rate of rates)await(mode==='general'?general(rate):examples(rate));
  if(errors.length||rows.some(row=>row.providers!==0))throw Error('Browser/provider errors: '+JSON.stringify(errors));
  const filename=mode+(profiled?'-profiled':'')+'.json';
  await writeFile(resolve(out,filename),JSON.stringify({date,revision,workingTree,browser:await browser.version(),
    cpu:cpus()[0].model,viewport:{width:1440,height:1000},patches,missingTargets,errors,rows,
    scope:'Actual UI handlers via DOM clicks in the mock host. First-frame callback records a rendering opportunity. Ready requires all 30 catalog tiles, no busy state and card content in every preview intersecting the grid viewport for Examples (catalogReadyMs records the earlier shell/catalog milestone) or a fresh verified document activation and card scene; settled adds two frames for deferred fit. Clean replacements; in-memory File adapter excludes OS/disk/network delays. Selected synchronous function profiles overlap; CDP counters include bookkeeping. --throttled is an artificial sensitivity test.'},null,2));
  console.log('Saved '+rows.length+' samples to '+resolve(out,filename));
}finally{await browser.close();await new Promise(r=>server.close(r));}
