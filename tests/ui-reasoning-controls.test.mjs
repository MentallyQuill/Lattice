import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareWorkspaceViews,projectWorkspacePanels} from '../src/ui/workspace-preparation.js?v=0.28.1';
import {createGraphViewSession} from '../src/ui/graph-view-session.js?v=0.28.1';
import {projectPreparedWorkflow} from '../src/ui/workflow-surface.js?v=0.28.1';
import {readNodeProfileMetadata,prepareNodeProfileOptions} from '../src/ui/node-profile-preparation.js?v=0.28.1';
import {activeModelMetadata,ACTIVE_PROFILE_ID} from '../src/workflow/model-profiles.js';
import {detailsComponent,control,input,click} from './helpers/inspector-component.mjs';

const graph=(node={})=>({id:'reasoning-ui',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{call:{id:'call',type:'workflow',operation:'model-call',profileId:'saved',...node}},wires:{},definitions:{},portals:{},groups:{}});
function fixture(root,options={}){
 const prepared=prepareWorkspaceViews(root,{profiles:[{id:'saved',name:'Saved',api:'openai',source:'openai',model:'gpt-5'}],activeModel:{api:'nanogpt',apiLabel:'NanoGPT',model:'openai/gpt-5'},...options});
 assert.equal(prepared.ok,true,JSON.stringify(prepared.error));
 const session=createGraphViewSession({root,activationId:'reasoning',...prepared.data}).data;
 const workflow=projectPreparedWorkflow(prepared.data.workflow,{selectedId:'call'});
 return {session,workflow,details:(view=workflow)=>projectWorkspacePanels(session.readEditor(),view,{},'reasoning:1',null,null).nodeDetails};
}
const effort=details=>details.controls.find(row=>row.key==='reasoningEffort');

test('profile metadata carries canonical route source without endpoint or settings',()=>{
 const context={CONNECT_API_MAP:{friendly:{selected:'openai',source:'claude',label:'Looks like OpenAI'},local:{selected:'textgenerationwebui',type:'ollama',label:'Local'}}};
 const metadata=readNodeProfileMetadata(context,[{id:'saved',name:'Saved',api:'friendly',model:'claude-sonnet-4-6','api-url':'private-url',secret:'private-key'},{id:'local',api:'local',model:'qwen3'}]);
 assert.deepEqual(metadata.map(({api,source})=>({api,source})),[{api:'openai',source:'claude'},{api:'textgenerationwebui',source:'ollama'}]);
 const options=prepareNodeProfileOptions(metadata,{api:'nanogpt',apiLabel:'NanoGPT',model:'active'});
 assert.equal(options[0].source,'nanogpt');assert.equal(options[1].source,'claude');
 assert.ok(!JSON.stringify(options).includes('private-'));
});

test('reasoning options follow canonical effective profiles after authored fields were cached',()=>{
 const root=graph(),f=fixture(root),first=f.details(),before=structuredClone(root);
 assert.equal(effort(first)?.value,'none');assert.ok(effort(first).options.some(row=>row.value==='minimal'));
 const changed={...f.workflow,profiles:f.workflow.profiles.map(profile=>profile.id==='saved'?{...profile,api:'openai',source:'claude',model:'claude-sonnet-4-6',apiLabel:'Misleading label'}:profile)};
 const second=f.details(changed);
 assert.ok(effort(second).options.some(row=>row.value==='enabled'));
 assert.ok(!effort(second).options.some(row=>row.value==='minimal'));
 assert.deepEqual(root,before);
});

test('Generate Reply uses active host provider metadata without a model binding inspector',()=>{
 const root=graph({operation:'generate-reply'});delete root.nodes.call.profileId;const f=fixture(root);
 const details=f.details();assert.equal(details.model,null);
 assert.equal(effort(details)?.value,'none');
 assert.ok(effort(details).options.some(row=>row.value==='minimal'));
 assert.match(effort(details).help,/NanoGPT|adapter/i);
});

test('model-free modes hide reasoning while authored Custom values remain in saved nodes',()=>{
 for(const [operation,mode] of [['extract',{mode:'literal'}],['repair',{mode:'scan'}],['smart-compactor',{method:'select'}],['express',{mode:'behavior'}]]){
  const root=graph({operation,...mode,reasoningEffort:'custom',reasoningCustom:'future/value'}),details=fixture(root).details();
  assert.equal(effort(details),undefined,operation);assert.equal(root.nodes.call.reasoningCustom,'future/value');
 }
});

test('saved reasoning values stay represented when the effective provider no longer offers them',()=>{
 const f=fixture(graph({reasoningEffort:'xhigh'}),{profiles:[{id:'saved',name:'Saved',api:'openai',source:'nanogpt',model:'model'}]});
 const selected=effort(f.details());assert.equal(selected.value,'xhigh');
 assert.ok(selected.options.some(row=>row.value==='xhigh'));
});

test('inherited roles, model overrides, and readonly instance binding overrides choose their provider',async()=>{
 const root=graph();delete root.nodes.call.profileId;root.roles.Prose={profileId:'saved'};
 assert.ok(effort(fixture(root).details()).options.some(row=>row.value==='minimal'));
 root.nodes.call.model='gpt-6-astra';
 assert.ok(!effort(fixture(root).details()).options.some(row=>row.value==='minimal'));
 const {siblingWorkflow}=await import('./fixtures/workflow-prepared-fixture.mjs');
 const shared=siblingWorkflow();shared.nodes['first/path'].roleOverrides.Analysis={profileId:'saved'};
 const prepared=prepareWorkspaceViews(shared,{profiles:[{id:'saved',api:'openai',source:'claude',model:'claude-sonnet-4-6'}]});
 const session=createGraphViewSession({root:shared,activationId:'reasoning-instance',...prepared.data}).data;
 session.openInstance(['first/path']);
 const view=projectPreparedWorkflow(prepared.data.workflow,{viewPath:['first/path'],selectedId:'work'});
 const details=projectWorkspacePanels(session.readEditor(),view,{},'instance',null,null).nodeDetails;
 assert.equal(details.readOnly,true);assert.ok(effort(details).options.some(row=>row.value==='enabled'));
});

test('Custom reasoning uses one line and selecting another effort preserves its stored text',async()=>{
 let root=graph(),revision=0,panel;
 const view=()=>{const f=fixture(root);return {...f.details(),revision:String(revision)};};
 await detailsComponent(view(),{editControl(_selection,key,value){root.nodes.call[key]=value;revision++;panel.update(view());return {ok:true};}},async f=>{
  panel=f;f.host.querySelector('[data-control-group="Limits & retries"]>summary').click();await f.update(view());
  input(f.host,'Reasoning','custom','change');await f.update(view());
  const custom=control(f.host,'Custom reasoning');assert.equal(custom.tagName,'INPUT');assert.equal(custom.type,'text');
  input(f.host,'Custom reasoning','future/value','change');await f.update(view());
  assert.equal(root.nodes.call.reasoningCustom,'future/value');
  input(f.host,'Reasoning','none','change');await f.update(view());assert.equal(f.host.querySelector('[aria-label="Custom reasoning"]'),null);
  input(f.host,'Reasoning','custom','change');await f.update(view());assert.equal(control(f.host,'Custom reasoning').value,'future/value');
 });
});

test('readonly reasoning controls preserve the selected Custom value',async()=>{
 const details=fixture(graph({reasoningEffort:'custom',reasoningCustom:'kept'})).details();
 await detailsComponent({...details,readOnly:true},{editControl(){assert.fail('Readonly controls cannot save');}},async f=>{
  f.host.querySelector('[data-control-group="Limits & retries"]>summary').click();await f.update({...details,readOnly:true});
  assert.equal(control(f.host,'Reasoning').disabled,true);assert.equal(control(f.host,'Custom reasoning').disabled,true);assert.equal(control(f.host,'Custom reasoning').value,'kept');
 });
});

test('provider reasoning limitations are visible beside the selector',async()=>{
 const details=fixture(graph()).details();
 await detailsComponent(details,{editControl(){return {ok:true};}},async f=>{
  f.host.querySelector('[data-control-group="Limits & retries"]>summary').click();await f.update(details);
  const help=[...f.host.querySelectorAll('small')].find(node=>node.textContent===effort(details).help);
  assert.ok(help);assert.equal(help.closest('.pc-control-help'),null,'The selected provider limitation must be visible without opening About');
 });
});

test('unknown providers retain a Reasoning dropdown with None selected',async()=>{
 const details=fixture(graph(),{profiles:[{id:'saved',api:'future-provider',model:'future-model'}]}).details();
 await detailsComponent(details,{editControl(){return {ok:true};}},async f=>{
  f.host.querySelector('[data-control-group="Limits & retries"]>summary').click();await f.update(details);
  const selected=control(f.host,'Reasoning');assert.equal(selected.tagName,'SELECT');assert.equal(selected.value,'none');
  assert.ok([...selected.options].some(option=>option.value==='custom'));
 });
});

test('switching Custom reasoning preserves unrelated unfinished schema drafts',async()=>{
 let root=graph({outputKind:'data',schema:'{"type":"object"}'}),panel,revision=0;
 const view=()=>({...fixture(root).details(),revision:String(revision)});
 await detailsComponent(view(),{editControl(_selection,key,value){root.nodes.call[key]=value;revision++;panel.update(view());return {ok:true};}},async f=>{
  panel=f;click(f.host,'Edit Output schema schema as JSON');input(f.host,'Output schema schema JSON','{"unfinished":');
  f.host.querySelector('[data-control-group="Limits & retries"]>summary').click();await f.update(view());
  for(const value of ['custom','none','custom']){
   input(f.host,'Reasoning',value,'change');await f.update(view());
   assert.equal(control(f.host,'Output schema schema JSON').value,'{"unfinished":');
  }
 });
});

test('active text-completion routes keep their transport identity and hide chat-only efforts',()=>{
 const activeModel=activeModelMetadata({mainApi:'textgenerationwebui',textCompletionSettings:{type:'openrouter',openrouter_model:'openai/gpt-5'},CONNECT_API_MAP:{openrouter:{selected:'textgenerationwebui',type:'openrouter'}}});
 const details=fixture(graph({profileId:ACTIVE_PROFILE_ID}),{activeModel}).details();
 assert.equal(prepareNodeProfileOptions([],activeModel)[0].api,'textgenerationwebui');
 assert.deepEqual(effort(details).options.map(option=>option.value),['none','custom']);
});
