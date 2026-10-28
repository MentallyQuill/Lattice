import {test,expect} from '@playwright/test';
async function host(page,{fresh=false,files=new Map()}={}){
 await page.addInitScript(()=>{delete window.showOpenFilePicker;delete window.showSaveFilePicker;});
 await page.route('**/scripts/user.js',route=>route.fulfill({contentType:'text/javascript',body:'export const getCurrentUserHandle=()=>"file-experience-user";'}));
 await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'}));
 await page.route('**/api/plugins/lattice-files/**',route=>route.fulfill({status:404,body:'Optional support absent'}));
 await page.route('**/user/files/*',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill(files.has(name)?{body:files.get(name),contentType:'text/plain'}:{status:404,body:''});});
 await page.route('**/api/files/upload',async route=>{const {name,data}=route.request().postDataJSON();files.set(name,Buffer.from(data,'base64').toString('utf8'));await route.fulfill({json:{path:'user/files/'+name}});});
 await page.route('**/api/files/delete',async route=>{files.delete(route.request().postDataJSON().path.split('/').at(-1));await route.fulfill({json:{ok:true}});});
 await page.route('**/api/chats/get',async route=>{const saved=await page.evaluate(()=>window.savedFileExperienceChat??[{chat_metadata:window.canvasHarness?.context.chatMetadata??{}}]);await route.fulfill({json:saved});});
 await page.goto('/tests/browser/harness.html'+(fresh?'?freshFiles':''));await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async()=>{const h=window.canvasHarness,c=h.context;Object.assign(c,{chatId:'file-story',characterId:0,groupId:null,characters:[{avatar:'companion.png',name:'Companion',chat:'file-story'}],chat:[],chatMetadata:{},getRequestHeaders:()=>({'Content-Type':'application/json'}),saveMetadata:async()=>{window.savedFileExperienceChat=[{chat_metadata:structuredClone(c.chatMetadata)},...structuredClone(c.chat)];}});await(await import('/src/run.js?v='+h.version)).initializeNativeWorkflowController();await h.settle();});
 return files;
}
async function command(page,name){await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name,exact:true}).click();}
test('first-run choices work without browser file APIs, cancel resumes and restart remembers host saving',async({page})=>{
 const files=await host(page,{fresh:true});const setup=page.locator('[data-file-storage-setup]');await expect(setup).toBeVisible();
 await expect(setup.locator('[data-storage-choice]')).toHaveCount(2);await setup.locator('[data-storage-choice="anywhere"]').click();await expect(setup.getByRole('button',{name:'Download setup',exact:true})).toBeVisible();
 await setup.getByRole('button',{name:'Close setup',exact:true}).click();await expect(setup).toHaveCount(0);
 await command(page,'File storage…');await expect(setup.getByRole('button',{name:'Download setup',exact:true})).toBeVisible();await setup.getByRole('button',{name:'Continue saving inside SillyTavern',exact:true}).click();await expect(setup).toHaveCount(0);
 expect([...files.values()].some(value=>value.includes('"choice":"inside"'))).toBe(true);
 await page.reload();await page.waitForFunction(()=>!!window.canvasHarness);await page.evaluate(async()=>{const h=window.canvasHarness;await(await import('/src/run.js?v='+h.version)).initializeNativeWorkflowController();});await expect(setup).toHaveCount(0);
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
test('incomplete authoring saves in the shared library, reopens and Save As has an independent identity',async({page})=>{
 await host(page);await page.evaluate(async()=>{const h=window.canvasHarness,{operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);await h.activate({id:'draft',name:'Unfinished story writer',schema:3,runtime:2,mode:'native-unified',nodes:{writer:{id:'writer',type:'workflow',...operationDefaults('write-file',{managedFiles:true}),x:60,y:90}},wires:{},groups:{},definitions:{},portals:{}});});
 await command(page,'Save workflow');await expect(page.locator('.pc-document-status')).toContainText('Saved in SillyTavern');
 const original=await page.evaluate(async()=>{const h=window.canvasHarness;return(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller.getWorkflowIdentity();});
 await command(page,'New workflow');
 await expect.poll(()=>page.evaluate(async original=>{const h=window.canvasHarness,c=(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller;return c.view().source?.kind==='library'&&!c.view().dirty&&c.getWorkflowIdentity()!==original;},original)).toBe(true);
 await command(page,'Open saved…');await page.getByRole('dialog',{name:'Saved workflows',exact:true}).getByRole('button',{name:'Unfinished story writer',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.writer?.fileTarget.managed)).toBe(true);
 page.once('dialog',dialog=>dialog.accept('Independent story'));await page.keyboard.press('Control+Shift+s');
 await expect(page.locator('.pc-document-name')).toHaveText('Independent story');
 const independent=await page.evaluate(async()=>{const h=window.canvasHarness;return(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller.getWorkflowIdentity();});expect(independent).not.toBe(original);
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
test('a browser file input imports actual private input bytes into host files and keeps workflow JSON empty',async({page})=>{
 const files=await host(page);await page.evaluate(async()=>{const h=window.canvasHarness,{operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);await h.activate({id:'reader',name:'Reader',schema:3,runtime:2,mode:'native-unified',nodes:{reader:{id:'reader',type:'workflow',...operationDefaults('read-file'),x:60,y:90}},wires:{},groups:{},definitions:{},portals:{}});h.canvas.select({kind:'node',id:'reader'});await h.settle();});
 const choose=page.waitForEvent('filechooser');await page.locator('[data-node-file]').getByRole('button',{name:'Import from device…',exact:true}).click();await(await choose).setFiles({name:'Private.txt',mimeType:'text/plain',buffer:Buffer.from('Private source bytes')});
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.reader.fileTarget?.bindingId??'')).not.toBe('');
 expect([...files.values()].some(value=>value==='Private source bytes')).toBe(true);expect(await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph))).not.toContain('Private source bytes');
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
test('two chats share acknowledged edits and keep a conflicting local draft for Save As',async({page,context})=>{
 const files=await host(page);await page.evaluate(async()=>{await window.canvasHarness.reset(1,1);});await command(page,'Save workflow');await expect(page.locator('.pc-document-status')).toContainText('Saved in SillyTavern');
 const shared=await page.evaluate(async()=>{const h=window.canvasHarness;return(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller.getWorkflowIdentity();});
 const second=await context.newPage();await host(second,{files});await second.evaluate(()=>{window.canvasHarness.context.chatId='another-chat';window.canvasHarness.context.characters[0].chat='another-chat';});
 await command(second,'Open saved…');await second.getByRole('dialog',{name:'Saved workflows'}).getByRole('button',{name:'Browser fixture',exact:true}).click();await second.getByRole('dialog',{name:'Save workflow changes?'}).getByRole('button',{name:"Don't Save",exact:true}).click();
 await expect.poll(()=>second.evaluate(async()=>{const h=window.canvasHarness;return(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller.getWorkflowIdentity();})).toBe(shared);
 await page.evaluate(async()=>{const h=window.canvasHarness;h.graph.description='Shared saved edit';h.S.touchGraph(h.graph);await(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller.save();});
 await second.evaluate(async()=>{const h=window.canvasHarness;await(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller.beforeRun();});
 expect(await second.evaluate(()=>window.canvasHarness.graph.description)).toBe('Shared saved edit');
 await second.evaluate(()=>{const h=window.canvasHarness;h.graph.description='Keep my local draft';h.S.touchGraph(h.graph);});
 await page.evaluate(async()=>{const h=window.canvasHarness;h.graph.description='New remote revision';h.S.touchGraph(h.graph);await(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller.save();});
 const conflict=await second.evaluate(async()=>{const h=window.canvasHarness,controller=(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller;const result=await controller.save();return {ok:result.ok,drafts:controller.recovery().length,text:h.graph.description};});
 expect(conflict.ok).toBe(false);expect(conflict.drafts).toBeGreaterThan(0);expect(conflict.text).toBe('Keep my local draft');
 await second.close();
});
test('file recovery confirms a retained version and preserves hidden privacy',async({page})=>{
 const files=await host(page);await page.evaluate(async()=>{
  const h=window.canvasHarness,{operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version),{resolveManagedFileNode}=await import('/src/workflow/managed-file-policy.js?v='+h.version),{getNodeFileAccess}=await import('/src/ui/node-file-access.js?v='+h.version),{sha256Text}=await import('/src/workflow/definition-data.js?v='+h.version),runtime=await import('/src/run.js?v='+h.version);
  const node={id:'writer',type:'workflow',...operationDefaults('write-file',{managedFiles:true}),fileTarget:{managed:true,name:'Private notes',format:'text',visibility:{kind:'hidden'}},x:60,y:90};await h.activate({id:'recovery',name:'Recover notes',schema:3,runtime:2,mode:'native-unified',nodes:{writer:node},wires:{},groups:{},definitions:{},portals:{}});
  const access=getNodeFileAccess();await access.ready;const definition=resolveManagedFileNode(node,{workflowId:runtime.getApplicationFileExperience().controller.getWorkflowIdentity(),address:{workflowId:'recovery',instancePath:[],nodeId:'writer'}}).data.definition,scope={userId:'file-experience-user',chatId:'file-story'},resolved=await access.ensureManaged(definition,{managed:true,scope,isCurrent:()=>true});if(!resolved.ok)throw Error(JSON.stringify(resolved));const backend=access.backend([resolved.data],{scope,isCurrent:()=>true});
  for(const content of ['First','Second']){const before=await backend.load(definition.targetId);const saved=await backend.compareAndSwap({targetId:definition.targetId,expectedRevision:before.data.revision,expectedContent:before.data.content,projectedDocument:{format:'text',content},intentId:'fixture-'+content,fingerprint:sha256Text(content)});if(!saved.ok)throw Error(JSON.stringify(saved));}
  window.recoveryFileBackend=backend;window.recoveryFileTarget=definition.targetId;window.recoveryOutputName=access.snapshot()[resolved.data.bindingId].path.split('/').at(-1);h.canvas.select({kind:'node',id:'writer'});await h.settle();
 });
 await command(page,'Recover selected file…');const recovery=page.getByRole('dialog',{name:'Recover saved file',exact:true});await expect(recovery).toBeVisible();await recovery.getByRole('button',{name:/5 bytes$/}).click();
 const outputName=await page.evaluate(()=>window.recoveryOutputName);await expect(recovery.getByText('Replace the current file with this earlier version?',{exact:false})).toBeVisible();expect(files.get(outputName)).toBe('Second');await recovery.getByRole('button',{name:'Restore this version',exact:true}).click();await expect(recovery).toHaveCount(0);
 expect(files.get(outputName)).toBe('First');expect(await page.evaluate(async()=>(await window.recoveryFileBackend.readVersion(window.recoveryFileTarget,{versionId:'current'})).data.visibility.kind)).toBe('hidden');expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});

test('new workflow authoring autosaves without Save and reopens from host files',async({page})=>{
 const files=await host(page);await command(page,'New workflow');
 const firstPrompt=page.getByRole('dialog',{name:'Save workflow changes?'});if(await firstPrompt.isVisible())await firstPrompt.getByRole('button',{name:"Don't Save",exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>{const h=window.canvasHarness;return(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller.view().source?.kind;})).toBe('library');
 const blankId=await page.evaluate(async()=>{const h=window.canvasHarness;return(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller.getWorkflowIdentity();});
 expect([...files.keys()].some(name=>name.endsWith('workflow-'+blankId+'.json'))).toBe(true);
 await page.evaluate(()=>{const h=window.canvasHarness;h.graph.name='Auto saved draft';h.graph.description='Authored without Save';h.S.touchGraph(h.graph);});
 await expect.poll(()=>[...files.values()].some(value=>value.includes('Authored without Save'))).toBe(true);
 const id=await page.evaluate(async()=>{const h=window.canvasHarness;return(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller.getWorkflowIdentity();});
 expect([...files.keys()].some(name=>name.endsWith('workflow-'+id+'.json'))).toBe(true);
 await expect.poll(()=>page.evaluate(async()=>{const h=window.canvasHarness,c=(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller;return !c.view().dirty;})).toBe(true);
 await page.evaluate(value=>{window.previousAutoSavedId=value;},id);
 await command(page,'New workflow');
 await expect.poll(()=>page.evaluate(async()=>{const h=window.canvasHarness,c=(await import('/src/run.js?v='+h.version)).getApplicationFileExperience().controller;return c.view().source?.kind==='library'&&!c.view().dirty&&c.getWorkflowIdentity()!==window.previousAutoSavedId;})).toBe(true);
 await command(page,'Open saved…');await page.getByRole('dialog',{name:'Saved workflows'}).getByRole('button',{name:'Auto saved draft',exact:true}).click();
 const prompt=page.getByRole('dialog',{name:'Save workflow changes?'});if(await prompt.isVisible())await prompt.getByRole('button',{name:"Don't Save",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.description)).toBe('Authored without Save');
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
