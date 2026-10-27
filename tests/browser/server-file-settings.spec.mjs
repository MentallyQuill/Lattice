import {test,expect} from '@playwright/test';
import {mkdtemp,mkdir,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createServerFileService} from '../../server-plugin/index.mjs';

async function fixture(page,{installed=true}={}){
 const directory=await mkdtemp(join(tmpdir(),'lattice-server-browser-'));
 const user={profile:{handle:'server-browser',admin:true},directories:{root:directory,files:join(directory,'user','files')}};
 const service=createServerFileService(),state={installed,calls:[]};
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'brave',{configurable:true,value:{isBrave:async()=>true}});
  Object.defineProperty(window,'showOpenFilePicker',{configurable:true,value:undefined});
  Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined});
 });
 await page.route('**/api/plugins/lattice-files/**',async route=>{
  if(!state.installed){await route.fulfill({status:404,contentType:'application/json',body:'{}'});return;}
  const request=route.request(),action=new URL(request.url()).pathname.split('/').at(-1),body=request.method()==='POST'?request.postDataJSON():{};
  state.calls.push(action);const result=await service.dispatch(action,user,body);
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.route('**/scripts/user.js',route=>route.fulfill({contentType:'text/javascript',body:'export const getCurrentUserHandle=()=>"server-browser";'}));
 await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'}));
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async()=>{
  const h=window.canvasHarness;
  Object.assign(h.context,{chatId:'server-files-chat',characters:[{name:'Companion',avatar:'companion.png',chat:'server-files-chat'}],characterId:0,groupId:null,chat:[],chatMetadata:{},saveMetadata:async()=>true,getRequestHeaders:()=>({'Content-Type':'application/json'})});
  await (await import('/src/run.js?v='+h.version)).initializeNativeWorkflowController();
  const access=(await import('/src/ui/node-file-access.js?v='+h.version)).getNodeFileAccess();await access.refresh();
  const {operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
  const node={id:'file',type:'workflow',...operationDefaults('write-file'),destinationMode:'own',x:140,y:180,w:260};
  await h.activate({id:'server-files-browser',name:'Server files',schema:3,runtime:2,mode:'native-unified',nodes:{file:node},wires:{},groups:{},definitions:{},portals:{}});
  await h.view({x:150,y:100,zoom:1});
 });
 await page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness').click();
 return {directory,state,path:join(directory,'Stories','SceneContext.txt'),async close(){const scope=relative(resolve(tmpdir()),resolve(directory));expect(scope&&!scope.startsWith('..')&&!isAbsolute(scope)).toBeTruthy();await rm(directory,{recursive:true,force:true});}};
}

test('own file configures a server path in Brave without native APIs or document writes',async({page},testInfo)=>{
 const f=await fixture(page);
 try{
  await expect(page.getByLabel('File path',{exact:true})).toBeVisible();
  await expect(page.locator('[data-node-file]')).not.toContainText('brave://flags');
  await expect(page.locator('[data-choose-node-file]')).toHaveCount(0);
  await page.getByLabel('File path',{exact:true}).fill(f.path);
  await expect(page.getByLabel('Filename',{exact:true})).toHaveValue('SceneContext.txt');
  await page.getByRole('button',{name:'Save file settings',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.file.fileTarget?.path)).toBe(f.path);
  await expect(page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness')).toHaveCount(0);
  await expect(page.locator('[data-file-status]')).toHaveText('File configured');
  await expect(page.locator('.pc-node-details')).not.toContainText('destination identity');
  await expect(page.locator('.pc-node-details')).not.toContainText('Setup Required');
  await expect(stat(f.path)).rejects.toThrow();
  expect(f.state.calls).not.toContain('cas');
  await page.screenshot({path:testInfo.outputPath('server-path-configured.png')});
 }finally{await f.close();}
});

test('missing component gives installation guidance and retry preserves the entered path',async({page})=>{
 const f=await fixture(page,{installed:false});
 try{
  await expect(page.locator('[data-server-file-guide]')).toBeVisible();
  await expect(page.locator('[data-node-file]')).not.toContainText('brave://flags');
  await page.getByLabel('File path',{exact:true}).fill(f.path);
  await expect(page.getByRole('button',{name:'Save file settings',exact:true})).toBeDisabled();
  f.state.installed=true;
  await page.getByRole('button',{name:'Retry file service',exact:true}).click();
  await expect(page.getByLabel('File path',{exact:true})).toHaveValue(f.path);
  await page.getByRole('button',{name:'Save file settings',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!window.canvasHarness.graph.nodes.file.fileTarget?.bindingId)).toBe(true);
  await expect(page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness')).toHaveCount(0);
  expect(f.state.calls).not.toContain('cas');
 }finally{await f.close();}
});
