import {test,expect} from '@playwright/test';
import {mkdtemp,mkdir,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createServerFileService} from '../../server-plugin/index.mjs';

async function fixture(page,{installed=true}={}){
 const directory=await mkdtemp(join(tmpdir(),'lattice-server-browser-'));
 const user={profile:{handle:'server-browser',admin:true},directories:{root:directory,files:join(directory,'user','files')}};
 await mkdir(join(directory,'Stories'),{recursive:true});
 const service=createServerFileService(),state={installed,calls:[]},hostFiles=new Map();
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
 await page.route('**/user/files/*',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill(hostFiles.has(name)?{body:hostFiles.get(name)}:{status:404,body:''});});
 await page.route('**/api/files/upload',async route=>{const {name,data}=route.request().postDataJSON();hostFiles.set(name,Buffer.from(data,'base64').toString('utf8'));await route.fulfill({json:{path:'user/files/'+name}});});
 await page.route('**/scripts/user.js',route=>route.fulfill({contentType:'text/javascript',body:'export const getCurrentUserHandle=()=>"server-browser";'}));
 await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'}));
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async()=>{
  const h=window.canvasHarness;
  Object.assign(h.context,{chatId:'server-files-chat',characters:[{name:'Companion',avatar:'companion.png',chat:'server-files-chat'}],characterId:0,groupId:null,chat:[],chatMetadata:{},saveMetadata:async()=>true,getRequestHeaders:()=>({'Content-Type':'application/json'})});
  await (await import('/src/run.js?v='+h.version)).initializeNativeWorkflowController();
  const access=(await import('/src/ui/node-file-access.js?v='+h.version)).getNodeFileAccess();await access.refresh();
  const {operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
  const node={id:'file',type:'workflow',...operationDefaults('write-file',{managedFiles:true}),fileTarget:{managed:true,name:'SceneContext',format:'text'},x:140,y:180,w:260};
  await h.activate({id:'server-files-browser',name:'Server files',schema:3,runtime:2,mode:'native-unified',nodes:{file:node,text:{id:'text',type:'workflow',...operationDefaults('text'),text:'Scene context',x:20,y:20}},wires:{content:{id:'content',route:'wire',from:'text',fromPort:'out',to:'file',toPort:'text'}},groups:{},definitions:{},portals:{}});
  await h.view({x:150,y:100,zoom:1});
 });
 await page.evaluate(async()=>{const h=window.canvasHarness;h.canvas.select({kind:'node',id:'file'});await h.settle();});
 return {directory,state,path:join(directory,'Stories','SceneContext.txt'),async close(){const scope=relative(resolve(tmpdir()),resolve(directory));expect(scope&&!scope.startsWith('..')&&!isAbsolute(scope)).toBeTruthy();await rm(directory,{recursive:true,force:true});}};
}

async function chooseAnywhere(page){
 await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'File storage…',exact:true}).click();
 const setup=page.locator('[data-file-storage-setup]');await setup.locator('[data-storage-choice="anywhere"]').click();return setup;
}
async function chooseLocation(page,path){
 const file=page.locator('[data-node-file]');await file.getByText('Advanced',{exact:true}).click();await file.getByRole('button',{name:'Choose location…',exact:true}).click();
 const chooser=page.locator('[data-server-file-chooser]');await expect(chooser).toBeVisible();await chooser.getByLabel('Server folder',{exact:true}).fill(path.replace(/[\\/][^\\/]+$/,''));await chooser.getByRole('button',{name:'Go',exact:true}).click();
 await expect(chooser.getByRole('button',{name:'Use this location',exact:true})).toBeEnabled();await chooser.getByLabel('Filename',{exact:true}).fill('SceneContext.txt');await chooser.getByRole('button',{name:'Use this location',exact:true}).click();
}
test('automatic output chooses a custom server location in Brave without browser APIs or content writes',async({page},testInfo)=>{
 const f=await fixture(page);
 try{
  await expect(page.locator('[data-file-status]')).toHaveText('Ready');
  await expect(page.locator('[data-node-file]')).not.toContainText('brave://flags');
  const setup=await chooseAnywhere(page);await setup.getByRole('button',{name:'Done',exact:true}).click();
  await chooseLocation(page,f.path);
  await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.file.fileTarget?.path)).toBe(f.path);
  await expect(page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness')).toHaveCount(0);
  await expect(page.locator('[data-file-status]')).toHaveText('Ready');
  await expect(page.locator('.pc-node-details')).not.toContainText('destination identity');
  await expect(page.locator('.pc-node-details')).not.toContainText('Setup Required');
  await expect(stat(f.path)).rejects.toThrow();
  expect(f.state.calls).not.toContain('cas');
  await page.screenshot({path:testInfo.outputPath('server-path-configured.png')});
 }finally{await f.close();}
});

test('missing optional component guides setup while automatic output stays ready and preserves its name',async({page})=>{
 const f=await fixture(page,{installed:false});
 try{
  await expect(page.locator('[data-file-status]')).toHaveText('Ready');
  await expect(page.locator('[data-node-file]')).not.toContainText('brave://flags');
  const setup=await chooseAnywhere(page);await expect(setup.getByRole('button',{name:'Download setup',exact:true})).toBeVisible();
  await setup.getByRole('button',{name:'Continue saving inside SillyTavern',exact:true}).click();
  await expect(page.locator('[data-file-status]')).toHaveText('Ready');await expect(page.getByLabel('File name',{exact:true})).toHaveValue('SceneContext');
  await chooseAnywhere(page);
  await expect(setup.getByRole('button',{name:'Download setup',exact:true})).toBeVisible();
  f.state.installed=true;
  await setup.getByRole('button',{name:'Check again',exact:true}).click();await setup.getByRole('button',{name:'Done',exact:true}).click();
  await chooseLocation(page,f.path);
  await expect.poll(()=>page.evaluate(()=>!!window.canvasHarness.graph.nodes.file.fileTarget?.bindingId)).toBe(true);
  await expect(page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness')).toHaveCount(0);
  expect(f.state.calls).not.toContain('cas');
 }finally{await f.close();}
});
