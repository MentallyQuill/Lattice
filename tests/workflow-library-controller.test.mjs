import assert from 'node:assert/strict';
import {createWorkflowLibraryController} from '../src/ui/workflow-library-controller.js';
import {createWorkflowLibrary} from '../src/ui/workflow-library.js';
import {createWorkflowDocumentSession} from '../src/ui/document-session.js';
import {serializeWorkflowDocument} from '../src/workflow/document-file.js';
import {graph,memoryStore} from './workflow-saved-library.test.mjs';
const store=memoryStore();let seq=0;
const library=createWorkflowLibrary({store,createId:()=>`id-${++seq}`});
const saved=await library.saveAs({json:serializeWorkflowDocument(graph()).data.json,name:'Shared'});
const selection=new Map();
function chat(id){const session=createWorkflowDocumentSession();return {session,controller:createWorkflowLibraryController({session,library,getContext:()=>id,persistSelection:async value=>{selection.set(id,value);return {ok:true,data:{acknowledged:true}};}})};}
const a=chat('a'),b=chat('b');
assert.equal((await a.controller.openSaved(saved.data.id)).ok,true);
assert.equal((await b.controller.openSaved(saved.data.id)).ok,true);
assert.equal(a.controller.getWorkflowIdentity(),b.controller.getWorkflowIdentity());
a.session.current().nodes.text.text='chat a authored';
assert.equal((await a.controller.save()).ok,true);
assert.equal((await b.controller.beforeRun()).ok,true);
assert.equal(b.session.current().nodes.text.text,'chat a authored');
assert.equal((await a.controller.saveAs('Private copy')).ok,true);
assert.notEqual(selection.get('a').id,selection.get('b').id);
a.controller.dispose();b.controller.dispose();
console.log('workflow-library-controller: shared authoring and chat selections ok');

// A dirty imported draft may be saved to the library inside the replacement guard.
const {createWorkflowDocumentController}=await import('../src/ui/document-controller.js');
const draft=createWorkflowDocumentSession();draft.activate(graph());
let documentController;
const managed=createWorkflowLibraryController({session:draft,library,replace:(...args)=>documentController.replace(...args)});
documentController=createWorkflowDocumentController({session:draft,files:{recents:()=>[]},libraryController:managed,prompt:async()=> 'save',activate:(g,options)=>draft.activate(g,options),create:graph,recovery:()=>[]});
const openedAgain=await managed.openSaved(saved.data.id);
assert.equal(openedAgain.ok,true);
assert.equal(draft.source().id,saved.data.id);
managed.dispose();

// Saving from the replacement guard must not reactivate its earlier read of this ID.
for(const delegated of [true,false]) {
    const reopening=createWorkflowDocumentSession(),loaded=await library.read(saved.data.id);
    reopening.activate(loaded.data.graph,{source:loaded.data.source,clean:true});
    reopening.current().nodes.text.text='saved during reopen '+delegated;
    let replacement;
    const reopeningController=createWorkflowLibraryController({session:reopening,library,prompt:async()=> 'save',...(delegated?{replace:(...args)=>replacement.replace(...args)}:{})});
    replacement=createWorkflowDocumentController({session:reopening,files:{recents:()=>[]},libraryController:reopeningController,prompt:async()=> 'save',activate:(g,options)=>reopening.activate(g,options),recovery:()=>[]});
    assert.equal((await reopeningController.openSaved(saved.data.id)).ok,true);
    assert.equal(reopening.current().nodes.text.text,'saved during reopen '+delegated);
    assert.equal(reopening.source().revision,(await library.read(saved.data.id)).data.revision);
    assert.equal(reopening.dirty(),false);
    reopeningController.dispose();
}

// A background refresh may defer, but a run preflight must fail if review becomes busy.
const preflightSession=createWorkflowDocumentSession(),preflightDocument=await library.read(saved.data.id);
preflightSession.activate(preflightDocument.data.graph,{source:preflightDocument.data.source,clean:true});
let reviewBusy=false;
const preflight=createWorkflowLibraryController({session:preflightSession,isBusy:()=>reviewBusy,library:{...library,async read(id){reviewBusy=true;return library.read(id);}}});
const blockedRun=await preflight.beforeRun();
assert.equal(blockedRun.ok,false,'deferred freshness cannot authorize execution');
assert.equal(blockedRun.error.code,'WORKFLOW_BUSY');
preflight.dispose();

let selectedContext='chat A';
const scopedSelection=createWorkflowLibraryController({session:createWorkflowDocumentSession(),library,getContext:()=>selectedContext,getSelection:()=>selectedContext==='chat B'?{kind:'library',id:'chat-b-selection'}:null});
assert.equal((await scopedSelection.openSaved(saved.data.id)).ok,true);
assert.equal(scopedSelection.view().selected.id,saved.data.id);
selectedContext='chat B';assert.equal(scopedSelection.view().selected.id,'chat-b-selection');
selectedContext='chat C';assert.equal(scopedSelection.view().selected,null,'a chat without selection cannot inherit the prior chat cache');
scopedSelection.dispose();
