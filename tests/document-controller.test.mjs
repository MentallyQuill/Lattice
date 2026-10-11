import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkflowDocumentController } from '../src/ui/document-controller.js';
import { createWorkflowDocumentSession } from '../src/ui/document-session.js';
import { serializeWorkflowDocument } from '../src/workflow/document-file.js';

const graph = (id = 'one') => ({id, name:id, schema:3, runtime:2, mode:'native-unified', nodes:{}, wires:{}, groups:{}, portals:{}, definitions:{}, roles:{}});
const ok = data => ({ok:true,data});
function fixture() {
    const session = createWorkflowDocumentSession();
    session.activate(graph(), {clean:true,source:{id:'first',name:'first.json'}});
    const prompts = [], notices = [], writes = [], activations = [], entries = [];
    const files = {native:true, recents:()=>entries, clearRecent:async()=>ok({}), open:async()=>ok({text:serializeWorkflowDocument(graph('two')).data.json,source:{id:'second',name:'second.json'}}), readRecent:async()=>ok({text:serializeWorkflowDocument(graph('recent')).data.json,source:{id:'recent',name:'recent.json'}}), save:async(json,source,options)=>{writes.push({json,source,options});return ok({source:{id:'saved',name:'saved.json'},downloaded:false});}};
    const env = {session,files,create:()=>graph('new'),examples:()=>ok({graph:graph('example'),companions:[]}),recovery:()=>[{id:'old',name:'Old',graph:graph('old')}],views:()=>null,prompt:async()=>{prompts.push(true);return 'discard';},activate:(value,options)=>{activations.push(value);session.activate(value,options);},changed(){},report:(message)=>notices.push(message)};
    return {session,files,env,prompts,notices,writes,activations,controller:createWorkflowDocumentController(env)};
}

test('Open reads the native picker immediately and guards a dirty replacement',async()=>{
    const f=fixture();f.session.current().name='edited';let picked=false;
    const original=f.files.open;f.files.open=()=>{picked=true;return original();};
    const pending=f.controller.open();assert.equal(picked,true);await pending;
    assert.equal(f.prompts.length,1);assert.equal(f.session.current().id,'two');assert.equal(f.session.dirty(),false);
});
test('cancelled guard preserves source, graph and draft',async()=>{
    const f=fixture(),root=f.session.current(),source=f.session.source();root.name='edited';f.env.prompt=async()=> 'cancel';
    await f.controller.newDocument();assert.equal(f.session.current(),root);assert.equal(f.session.source(),source);assert.equal(f.activations.length,0);
});
test('failed native save does not proceed from a dirty document',async()=>{
    const f=fixture(),root=f.session.current();root.name='edited';f.env.prompt=async()=> 'save';f.files.save=async()=>({ok:false,error:{message:'Disk full'}});
    await f.controller.newDocument();assert.equal(f.session.current(),root);assert.equal(f.session.dirty(),true);assert.equal(f.notices.at(-1),'Disk full');
});
test('edits arriving while Save is pending stay dirty and block replacement',async()=>{
    const f=fixture(),root=f.session.current();root.name='first edit';f.env.prompt=async()=> 'save';let finish;
    f.files.save=()=>new Promise(resolve=>{finish=resolve;});const pending=f.controller.newDocument();
    await new Promise(resolve=>setTimeout(resolve,0));root.name='newer edit';finish(ok({source:{name:'saved.json'},downloaded:false}));await pending;
    assert.equal(f.session.current(),root);assert.equal(f.session.dirty(),true);assert.equal(f.activations.length,0);
});
test('stale read completion cannot replace a newer activation',async()=>{
    const f=fixture();let finish;f.files.open=()=>new Promise(resolve=>{finish=resolve;});const pending=f.controller.open();
    const other=graph('external');f.session.activate(other,{clean:true});finish(ok({text:serializeWorkflowDocument(graph('late')).data.json,source:{name:'late.json'}}));await pending;
    assert.equal(f.session.current(),other);assert.equal(f.activations.length,0);
});
test('closing the workbench cancels a pending replacement without discarding the document',async()=>{
    const f=fixture(),root=f.session.current();let finish;
    f.files.open=()=>new Promise(resolve=>{finish=resolve;});const pending=f.controller.open();
    f.controller.cancelReplacement();finish(ok({text:serializeWorkflowDocument(graph('late')).data.json,source:{name:'late.json'}}));await pending;
    assert.equal(f.session.current(),root);assert.equal(f.activations.length,0);
});
test('malformed files preserve an edited document without prompting to discard it',async()=>{
    const f=fixture(),root=f.session.current();root.name='edited';f.files.open=async()=>ok({text:'invalid',source:{name:'invalid.json'}});
    await f.controller.open();assert.equal(f.session.current(),root);assert.equal(f.prompts.length,0);assert.equal(f.notices.length,1);
});
test('Save As adopts its source only on successful write',async()=>{
    const f=fixture();f.session.current().name='edited';await f.controller.save(true);
    assert.equal(f.writes.length,1);assert.equal(f.writes[0].options.saveAs,true);assert.equal(f.session.source().name,'saved.json');assert.equal(f.session.dirty(),false);
});
test('download feedback does not claim disk saving or clear the native save checkpoint',async()=>{
    const f=fixture();f.files.native=false;f.session.current().name='edited';f.files.save=async()=>ok({source:null,downloaded:true});await f.controller.save();
    assert.equal(f.session.dirty(),true);assert.match(f.notices.at(-1),/download/i);assert.doesNotMatch(f.notices.at(-1),/^Saved/);
});
test('a browser download cannot authorize discarding the unsaved document',async()=>{
    const f=fixture(),root=f.session.current();root.name='edited';f.files.native=false;
    f.env.prompt=async()=> 'save';f.files.save=async()=>ok({source:null,downloaded:true});
    await f.controller.newDocument();assert.equal(f.session.current(),root);assert.equal(f.session.dirty(),true);assert.equal(f.activations.length,0);
});
test('Recent, examples, recovery and New use the same replacement guard',async()=>{
    for(const action of [c=>c.recent('recent'),c=>c.example('example'),c=>c.recover('old'),c=>c.newDocument()]) {
        const f=fixture(),root=f.session.current();root.name='edited';f.env.prompt=async()=>{f.prompts.push(true);return 'cancel';};await action(f.controller);
        assert.equal(f.prompts.length,1);assert.equal(f.session.current(),root);assert.equal(f.activations.length,0);
    }
});
