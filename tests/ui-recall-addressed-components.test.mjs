import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {compiled} from './helpers/svelte-compile.mjs';
import {projectRecallView} from '../src/ui/recall-projection.js';
import {operationDefaults} from '../src/workflow/catalog.js';
import {nestedRecallFixture} from './helpers/nested-recall-fixture.mjs';
const dom=new JSDOM('<body></body>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;
for(const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLButtonElement','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const {mount,unmount,flushSync,tick}=await import(new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href);
async function render(name,props,inspect){const directory=await mkdtemp(join(tmpdir(),'lattice-recall-addresses-')),host=document.createElement('div');document.body.append(host);let component;try{const leaf=await compiled(name,directory);component=mount(leaf.component,{target:host,props});flushSync();await inspect(host);}finally{if(component)await unmount(component);host.remove();await rm(directory,{recursive:true,force:true});}}
test('addressed overview links show readable local paths and reveal exact global identities',async()=>{
 const f=nestedRecallFixture(),view=projectRecallView({rootGraph:f.graph,status:f.controller.status().data,enabled:true,nodeIds:[],viewKind:'instance',instancePath:['left']}),revealed=[];
 await render('RecallOverview',{view,actions:{refresh(){},capture(){return {};},change(){return {ok:true};},reportIssue(){},reveal:id=>revealed.push(id)}},host=>{const link=[...host.querySelectorAll('button')].find(button=>button.textContent==='Recalled memories · right / recall');assert.ok(link,'A sibling Recall is labelled by its local path.');link.click();assert.deepEqual(revealed,['["nested-recall",["right"],"recall"]']);});f.controller.dispose();
});
test('a root shortcut with a full address still reports that no Recall consumes its request',async()=>{
 const f=nestedRecallFixture();f.graph.nodes.unused={id:'unused',type:'workflow',...operationDefaults('hotkey-arm'),actorId:'mara',memorySetId:'unused-memories'};
 const view=projectRecallView({rootGraph:f.graph,status:f.controller.status().data,enabled:true,nodeIds:['unused'],viewKind:'root'});
 await render('RecallDetails',{view:view.nodes.unused,actions:{queue:()=>({ok:true}),cancel:()=>({ok:true}),revealShortcut(){}}},host=>assert.match(host.textContent,/Add a matching Recall node and connect it/));f.controller.dispose();
});
test('a late Details result cannot appear on a sibling Recall with the same local node ID',async()=>{
 const f=nestedRecallFixture(),status=f.controller.status().data,left=projectRecallView({rootGraph:f.graph,status,enabled:true,nodeIds:['recall'],viewKind:'instance',instancePath:['left']}).nodes.recall,right=projectRecallView({rootGraph:f.graph,status,enabled:true,nodeIds:['recall'],viewKind:'instance',instancePath:['right']}).nodes.recall;
 const directory=await mkdtemp(join(tmpdir(),'lattice-recall-sibling-details-')),host=document.createElement('div');document.body.append(host);let component,resolve;
 try{const leaf=await compiled('RecallDetails',directory),harness=await compiled('AddressedRecallHarness',directory,`<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)};let {initial,actions}=$props();let view=$state.raw(initial);export function update(value){view=value;}</script><Leaf {view} {actions}/>`);
  component=mount(harness.component,{target:host,props:{initial:left,actions:{queue:()=>new Promise(done=>resolve=done)}}});flushSync();host.querySelector('button').click();await tick();component.update(right);flushSync();
  resolve({ok:false,error:{code:'STALE_RECALL_CONTEXT',message:'Wrong sibling failure'}});await tick();flushSync();assert.equal(host.querySelectorAll('.pc-diagnostic').length,0,'A previous instance cannot publish a late queue error into the selected sibling.');assert.match(host.textContent,/right-memories/);
 }finally{if(component)await unmount(component);host.remove();await rm(directory,{recursive:true,force:true});f.controller.dispose();}
});
