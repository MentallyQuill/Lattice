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
