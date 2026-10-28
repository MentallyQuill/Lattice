import assert from 'node:assert/strict';
import test from 'node:test';
import {createWorkflowExampleOrigins,withWorkflowExampleOrigins} from '../src/ui/workflow-example-origin.js';
import {createWorkflowAutosave} from '../src/ui/workflow-autosave.js';
import {createWorkflowLibrary} from '../src/ui/workflow-library.js';
import {createWorkflowDocumentSession} from '../src/ui/document-session.js';
import {serializeWorkflowDocument} from '../src/workflow/document-file.js';
import {memoryStore,graph} from './workflow-saved-library.test.mjs';
for(const external of [false,true])test(`ordinary save reconciles its acknowledged revision after origin failure${external?' without overwriting a later external edit':''}`,async()=>{
 const memory=memoryStore();let failOrigin=false;
 const store={read:name=>failOrigin&&name.startsWith('workflow-origin-')?Promise.resolve({ok:false,error:{code:'OFFLINE',message:'Sidecar unavailable'}}):memory.read(name),write:request=>memory.write(request)};
 const session=createWorkflowDocumentSession(),original=graph();session.activate(original);
 const origins=createWorkflowExampleOrigins({store,getUserId:()=> 'alice'}),base=createWorkflowLibrary({store}),library=withWorkflowExampleOrigins(base,origins,session);
 origins.remember(original,{schemaVersion:1,exampleId:'lesson-22'});
 const first=await library.adopt({json:serializeWorkflowDocument(original).data.json});assert.equal(first.ok,true);session.activate(first.data.graph,{source:first.data.source,clean:true});
 const autosave=createWorkflowAutosave({session,library});
 session.current().nodes.text.text='second';failOrigin=true;const failed=await autosave.flush();assert.equal(failed.ok,false);assert.equal(session.dirty(),true);
 const acknowledged=await base.read(first.data.id);assert.equal(acknowledged.data.graph.nodes.text.text,'second');assert.notEqual(acknowledged.data.revision,first.data.revision);
 session.current().nodes.text.text='third';failOrigin=false;
 if(external){acknowledged.data.graph.nodes.text.text='external';assert.equal((await base.save({id:first.data.id,expectedRevision:acknowledged.data.revision,json:serializeWorkflowDocument(acknowledged.data.graph).data.json})).ok,true);}
 const retried=await autosave.flush();assert.equal(retried.ok,!external,JSON.stringify(retried));
 assert.equal((await base.read(first.data.id)).data.graph.nodes.text.text,external?'external':'third');
 assert.equal(session.current().nodes.text.text,'third');assert.equal(session.dirty(),external);
 if(external){assert.ok(autosave.recovery().length);assert.equal((await autosave.flush()).ok,false,'repeating retry never rebases onto the external revision');}
 else assert.equal(session.source().revision,(await base.read(first.data.id)).data.revision);
 autosave.dispose();
});
