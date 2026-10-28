import assert from 'node:assert/strict';
import {createWorkflowLibraryController} from '../src/ui/workflow-library-controller.js';
import {createWorkflowDocumentController} from '../src/ui/document-controller.js';
import {createWorkflowDocumentSession} from '../src/ui/document-session.js';
import {createWorkflowAutosave} from '../src/ui/workflow-autosave.js';
import {graph} from './workflow-saved-library.test.mjs';
const value=id=>{const g=graph();g.name=id;return {ok:true,data:{graph:g,source:{kind:'library',id,name:id,revision:'r'},revision:'r'}};};
// A recovered copy identical to the acknowledged selection requires no prompt or duplicate save.
{
 const session=createWorkflowDocumentSession(),saved=value('A');session.activate(structuredClone(saved.data.graph),{source:{kind:'recovery',name:'A'}});
 let doc;const ctl=createWorkflowLibraryController({session,library:{read:async()=>saved},getSelection:()=>({kind:'library',id:'A'}),getContext:()=> 'A',persistSelection:async()=>{throw Error('already selected');},replace:(...args)=>doc.replace(...args)});
 doc=createWorkflowDocumentController({session,files:{recents:()=>[]},activate:(g,o)=>session.activate(g,o),prompt:()=>{throw Error('UI absent');}});
 assert.equal((await ctl.beforeRun()).ok,true);assert.equal(session.source().id,'A');assert.equal(session.dirty(),false);ctl.dispose();
}
// An unmatched recovery draft is retained and blocks execution when UI cannot prompt.
{
 const session=createWorkflowDocumentSession();session.activate(value('recovery').data.graph,{source:{kind:'recovery',name:'recovery'}});let doc;
 const ctl=createWorkflowLibraryController({session,library:{read:async()=>value('A')},getSelection:()=>({kind:'library',id:'A'}),replace:(...args)=>doc.replace(...args)});
 doc=createWorkflowDocumentController({session,files:{recents:()=>[]},activate:(g,o)=>session.activate(g,o),prompt:async()=> 'cancel'});
 const result=await ctl.beforeRun();assert.equal(result.error.code,'WORKFLOW_SELECTION_PENDING');assert.equal(session.current().name,'recovery');assert.equal(session.dirty(),true);ctl.dispose();
}
// Immediate preflight waits for the newly selected document before capturing it.
{
 let context='A',release,started;const gate=new Promise(r=>release=r),began=new Promise(r=>started=r);
 const session=createWorkflowDocumentSession();session.activate(value('A').data.graph,{source:value('A').data.source,clean:true});let doc;
 const ctl=createWorkflowLibraryController({session,getContext:()=>context,getSelection:()=>({kind:'library',id:context}),library:{async read(id){if(id==='B'){started();await gate;}return value(id);}},replace:(...args)=>doc.replace(...args)});
 doc=createWorkflowDocumentController({session,files:{recents:()=>[]},activate:(g,o)=>session.activate(g,o),prompt:async()=> 'discard'});
 context='B';const run=ctl.beforeRun();await began;assert.equal(session.source().id,'A');release();assert.equal((await run).ok,true);assert.equal(session.source().id,'B');ctl.dispose();
}
// Chat selection is resolved before execution, including delayed reads and superseded contexts.
{
 let context='A',release,started;const gate=new Promise(r=>release=r),began=new Promise(r=>started=r);
 const session=createWorkflowDocumentSession();session.activate(value('A').data.graph,{source:value('A').data.source,clean:true});let doc;
 const ctl=createWorkflowLibraryController({session,getContext:()=>context,getSelection:()=>({kind:'library',id:context}),library:{async read(id){if(id==='B'){started();await gate;}return value(id);}},replace:(...args)=>doc.replace(...args)});
 doc=createWorkflowDocumentController({session,files:{recents:()=>[]},activate:(g,o)=>session.activate(g,o),prompt:async()=> 'discard'});
 context='B';const b=ctl.restoreSelection();await began;context='C';const c=ctl.beforeRun();release();await b;assert.equal((await c).ok,true);assert.equal(session.source().id,'C');ctl.dispose();
}
// Subscribers see the final transition after pending clears.
{
 const session=createWorkflowDocumentSession();session.activate(graph(),{source:{kind:'library',id:'x',revision:'r'},clean:true});session.current().name='edit';let saver;const states=[];
 saver=createWorkflowAutosave({session,library:{save:async()=>({ok:true,data:{acknowledged:true,revision:'r2'}})},onStatus:()=>states.push(saver.view())});
 await saver.flush();assert.equal(states.at(-1).saving,false);saver.dispose();
}
console.log('final lifecycle regressions: ok');
import {createNativeWorkflowController} from '../src/workflow/host.js';
const previous=graph(),next=graph();next.nodes.text.text='selected graph';let active=previous;
const host=createNativeWorkflowController({context:()=>({chatId:'c',chat:[],chatMetadata:{}}),userId:()=> 'u',isBusy:()=>false,getGraph:()=>active,beforeRun:async()=>{active=next;return {ok:true};}});
const result=await host.runTarget(previous,{workflowId:previous.id,instancePath:[],nodeId:'text',portId:'out'});
assert.equal(result.ok,true,JSON.stringify(result.error));assert.ok(result.recording.artifacts.some(item=>JSON.stringify(item).includes('selected graph')),'preview captures graph after preflight');host.dispose();
// A stale prompt cannot save or activate after the chat changes.
{
 let context='B',answer,shown;const promptShown=new Promise(r=>shown=r),choice=new Promise(r=>answer=r);let saves=0;
 const session=createWorkflowDocumentSession();session.activate(value('draft').data.graph,{source:{kind:'recovery',name:'draft'}});let doc;
 const ctl=createWorkflowLibraryController({session,getContext:()=>context,library:{read:async id=>value(id)},replace:(...args)=>doc.replace(...args)});
 doc=createWorkflowDocumentController({session,files:{recents:()=>[]},activate:(g,o)=>session.activate(g,o),libraryController:{save:async()=>{saves++;return {ok:true,data:{}};}},prompt:()=>{shown();return choice;}});
 const b=ctl.openSaved('B');await promptShown;context='C';answer('save');assert.equal((await b).ok,false);assert.equal(saves,0);assert.equal(session.current().name,'draft');ctl.dispose();
}
