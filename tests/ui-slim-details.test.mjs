import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectNodeControls } from '../src/ui/node-control-projection.js';
import { prepareNativeNodeEdit } from '../src/workflow/definition-library.js';
import { detailsComponent, control, input, click } from './helpers/inspector-component.mjs';

const schema = '{ "type":"object", "properties":{"answer":{"type":"string"}} }';
const root = () => ({ id:'slim-model', schema:3, runtime:2, mode:'native-unified', roles:{}, nodes:{call:{id:'call',type:'workflow',operation:'model-call',outputKind:'data',schema}}, wires:{}, definitions:{}, portals:{}, groups:{} });
const view = (graph, revision = 'one') => ({ selectionKey:'call', revision, address:{workflowId:graph.id,instancePath:[],nodeId:'call'}, title:'Model Call',canonicalTitle:'Model Call',operation:'model-call',iconPath:'',family:'Shaping',phase:'pre',phaseEditable:true,phaseSource:'default',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:projectNodeControls('model-call',graph.nodes.call,{phase:'pre'}),model:null,ports:[] });

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
