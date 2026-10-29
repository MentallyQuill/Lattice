import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectNodeControls } from '../src/ui/node-control-projection.js';
import { prepareNativeNodeEdit } from '../src/workflow/definition-library.js';
import {prepareWorkspaceViews,projectWorkspacePanels} from '../src/ui/workspace-preparation.js';
import {createGraphViewSession} from '../src/ui/graph-view-session.js';
import {projectPreparedWorkflow} from '../src/ui/workflow-surface.js?v=0.30.2';
import { detailsComponent, control, input, click } from './helpers/inspector-component.mjs';

const schema = '{ "type":"object", "properties":{"answer":{"type":"string"}} }';
const root = () => ({ id:'slim-model', schema:3, runtime:2, mode:'native-unified', roles:{}, nodes:{call:{id:'call',type:'workflow',operation:'model-call',outputKind:'data',schema}}, wires:{}, definitions:{}, portals:{}, groups:{} });
const view = (graph, revision = 'one') => ({ selectionKey:'call', revision, address:{workflowId:graph.id,instancePath:[],nodeId:'call'}, title:'Model Call',canonicalTitle:'Model Call',operation:'model-call',iconPath:'',family:'Shaping',phase:'pre',phaseEditable:true,phaseSource:'default',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:projectNodeControls('model-call',graph.nodes.call,{phase:'pre'}),model:null,ports:[] });
function actualView(graph,revision){const prepared=prepareWorkspaceViews(graph);assert.equal(prepared.ok,true);const session=createGraphViewSession({root:graph,activationId:'slim-tests',...prepared.data}).data;return projectWorkspacePanels(session.readEditor(),projectPreparedWorkflow(prepared.data.workflow,{selectedId:'call'}),{},String(revision),null,null).nodeDetails;}

test('real modifier capability changes preserve inactive schemas across output revisions',async()=>{
 let graph=root(),revision=0,panel;
 const actions={editControl(selection,key,value){return actions.editControls(selection,{[key]:value});},editControls(_selection,patch){const prepared=prepareNativeNodeEdit(graph,{viewPath:[],kind:'controls',nodeId:'call',controls:patch});if(!prepared.ok)return prepared;graph=prepared.data.candidate;panel.update(actualView(graph,++revision));return {ok:true};}};
 await detailsComponent(actualView(graph,revision),actions,async f=>{
  panel=f;click(f.host,'Edit Output schema schema as JSON');input(f.host,'Output schema schema JSON','{"unfinished":');
  control(f.host,'Output').querySelector('input[value="text"]').click();await f.update(actualView(graph,revision));
  assert.ok(actualView(graph,revision).modifiers,'Text really introduces modifier capabilities');
  control(f.host,'Output').querySelector('input[value="data"]').click();await f.update(actualView(graph,revision));
  assert.equal(graph.nodes.call.schema,schema);
  assert.equal(control(f.host,'Output schema schema JSON').value,'{"unfinished":');
  click(f.host,'Discard Output schema changes');input(f.host,'Output schema schema JSON','');
  f.host.querySelector('[data-save-control="schema"]').click();await f.update(actualView(graph,revision));
  assert.equal(graph.nodes.call.schema,'');
  control(f.host,'Output').querySelector('input[value="text"]').click();await f.update(actualView(graph,revision));
  control(f.host,'Output').querySelector('input[value="data"]').click();await f.update(actualView(graph,revision));
  assert.equal(graph.nodes.call.schema,'','A deliberately cleared schema must not resurrect an older source');
 });
});

test('model settings use purpose groups and dense node controls retain their complete supported settings', () => {
    const fields=projectNodeControls('model-call',{outputKind:'data'},{phase:'pre'});
    assert.equal(fields.find(c=>c.key==='instructions').group,'Instructions');
    assert.equal(fields.find(c=>c.key==='schema').group,'Output');
    assert.equal(fields.find(c=>c.key==='outputKind').group,'Output');
    assert.equal(fields.find(c=>c.key==='maxTokens').group,'Limits & retries');
    assert.equal(fields.find(c=>c.key==='maxRetries').group,'Limits & retries');
    for (const operation of ['chunk','pattern','write-file','project-document','time-trigger','collection','recall']) {
        const controls=projectNodeControls(operation,{}, {phase:operation==='pattern'?'post':'pre'});
        assert.ok(controls.filter(c=>c.group==='Main').length<=4,operation+' should not dump all settings into Main');
        assert.equal(new Set(controls.map(c=>c.key)).size,controls.length,operation+' retains unique controls');
    }
});

test('schema Save and Discard appear only for a draft and discard restores the saved document', async () => {
    let saves=0;
    await detailsComponent(view(root()), { editControl(){saves++;return {ok:true};} }, async f=>{
        assert.equal(f.host.querySelector('[data-save-control="schema"]'),null);
        click(f.host,'Edit Output schema schema as JSON');
        input(f.host,'Output schema schema JSON','{"type":');
        assert.equal(f.host.querySelector('[data-save-control="schema"]').disabled,true);
        click(f.host,'Discard Output schema changes');
        assert.equal(control(f.host,'Output schema schema JSON').value,schema);
        assert.equal(f.host.querySelector('[data-save-control="schema"]'),null);
        assert.equal(saves,0);
    });
});

test('Model Call format changes submit one atomic candidate and retain inactive schema source', async () => {
    let graph=root(), revision=0, panel; const patches=[];
    const actions={ editControl(){assert.fail('Coupled format/schema edits must not use independent actions');}, editControls(_selection,patch){
        patches.push(structuredClone(patch));
        const result=prepareNativeNodeEdit(graph,{viewPath:[],kind:'controls',nodeId:'call',controls:patch});
        if(!result.ok)return result;
        graph=result.data.candidate;panel.update(view(graph,String(++revision)));return {ok:true};
    }};
    await detailsComponent(view(graph), actions, async f=>{
        panel=f;
        const output=control(f.host,'Output');
        output.querySelector('input[value="text"]').click();
        await f.update(view(graph,String(revision)));
        assert.deepEqual(patches[0],{outputKind:'text',schema:''});assert.equal(graph.nodes.call.schema,'');
        assert.equal(f.host.querySelector('[data-schema-control]'),null);
        control(f.host,'Output').querySelector('input[value="data"]').click();
        await f.update(view(graph,String(revision)));
        assert.deepEqual(patches[1],{outputKind:'data',schema});assert.equal(graph.nodes.call.schema,schema);
        assert.ok(f.host.querySelector('[data-schema-control]'));
    });
});

test('an unfinished schema draft survives accepted Text and Data format changes', async () => {
    let graph=root(), revision=0, panel;
    const actions={editControl(){return {ok:true};},editControls(_selection,patch){const result=prepareNativeNodeEdit(graph,{viewPath:[],kind:'controls',nodeId:'call',controls:patch});if(!result.ok)return result;graph=result.data.candidate;panel.update(view(graph,String(++revision)));return {ok:true};}};
    await detailsComponent(view(graph),actions,async f=>{
        panel=f;click(f.host,'Edit Output schema schema as JSON');input(f.host,'Output schema schema JSON','{"unfinished":');
        control(f.host,'Output').querySelector('input[value="text"]').click();await f.update(view(graph,String(revision)));
        assert.equal(graph.nodes.call.schema,'');
        control(f.host,'Output').querySelector('input[value="data"]').click();await f.update(view(graph,String(revision)));
        assert.equal(graph.nodes.call.schema,schema);assert.equal(control(f.host,'Output schema schema JSON').value,'{"unfinished":');
        assert.equal(f.host.querySelector('[data-save-control="schema"]').disabled,true);
    });
});

test('additional attempts use the real None to five range and communicate the total call bound',async()=>{
 let graph=root(),panel;
 await detailsComponent(view(graph),{editControl(_selection,key,value){const result=prepareNativeNodeEdit(graph,{viewPath:[],kind:'controls',nodeId:'call',controls:{[key]:value}});if(!result.ok)return result;graph=result.data.candidate;panel.update(view(graph,'two'));return {ok:true};}},async f=>{
  panel=f;f.host.querySelector('[data-control-group="Limits & retries"]>summary').click();await f.update(view(graph));
  const slider=control(f.host,'Additional attempts');assert.equal(slider.type,'range');assert.equal(slider.min,'0');assert.equal(slider.max,'5');
  assert.match(f.host.textContent,/None/);input(f.host,'Additional attempts','5','change');await f.update(view(graph,'two'));
  assert.equal(graph.nodes.call.maxRetries,5);assert.match(f.host.textContent,/Up to 6 model calls/);
  assert.equal(f.host.querySelector('[data-control-group="Limits & retries"]').open,true,'An accepted edit keeps the active group open');
 });
});

test('literal Extract exposes schema validation without offering unused model controls',async()=>{
 const graph=root();graph.nodes.call={id:'call',type:'workflow',operation:'extract',mode:'literal',inputKind:'text',schema:'',patterns:[],instructions:'Retain saved instructions',maxTokens:2048,maxRetries:0};
 const metadata={...view(root()),operation:'extract',canonicalTitle:'Extract',title:'Extract',controls:projectNodeControls('extract',graph.nodes.call,{phase:'pre'})};
 await detailsComponent(metadata,{editControl(){assert.fail('Inspection must not edit stored settings');}},async f=>{
  assert.equal(f.host.querySelector('[aria-label="Instructions"]'),null);
  assert.equal(f.host.querySelector('[data-control-group="Limits & retries"]'),null);
  assert.ok(f.host.querySelector('[data-schema-control]'));
  assert.equal(graph.nodes.call.instructions,'Retain saved instructions');
 });
});

test('a rejected retry slider restores the saved count and total-call hint',async()=>{
 const metadata=view(root());
 await detailsComponent(metadata,{editControl(){return {ok:false,error:{code:'REJECTED',message:'The edit was rejected.'}};}},async f=>{
  f.host.querySelector('[data-control-group="Limits & retries"]>summary').click();await f.update(metadata);
  input(f.host,'Additional attempts','5');input(f.host,'Additional attempts','5','change');await f.update(metadata);
  assert.equal(control(f.host,'Additional attempts').value,'0');assert.match(f.host.textContent,/No retries on failure/);assert.match(f.host.textContent,/rejected/i);
 });
});
