import assert from 'node:assert/strict';
import {createWorkflowAutosave} from '../src/ui/workflow-autosave.js';
import {createWorkflowDocumentSession} from '../src/ui/document-session.js';
const graph=()=>({id:'saved',name:'Shared',schema:3,runtime:2,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'text',text:'before'}},wires:{}});
const session=createWorkflowDocumentSession();session.activate(graph(),{source:{kind:'library',id:'saved',name:'Shared',revision:'r1'},clean:true});
let release,started;
const began=new Promise(resolve=>started=resolve),writes=[];
const autosave=createWorkflowAutosave({session,delay:60000,library:{async save(value){writes.push(value);started();await new Promise(resolve=>release=resolve);return {ok:true,data:{acknowledged:true,revision:'r2',source:{kind:'library',id:'saved',name:'Shared',revision:'r2'}}};}}});
session.current().nodes.text.text='captured';
const pending=autosave.flush();await began;
session.current().nodes.text.text='newer';release();await pending;
assert.equal(JSON.parse(writes[0].json).graph.nodes.text.text,'captured');
assert.equal(session.dirty(),true,'acknowledged captured bytes do not mark later edits clean');
assert.equal(session.source().revision,'r2');
autosave.dispose();
console.log('workflow-autosave: captured snapshot ok');

// Refresh invoked for the old chat must never continue against its replacement.
let context='old',complete;
const switched=createWorkflowDocumentSession();switched.activate(graph(),{clean:true,source:{kind:'library',id:'saved',revision:'r1'}});switched.current().name='editing';
let reads=0;
const switching=createWorkflowAutosave({session:switched,getContext:()=>context,library:{async save(){await new Promise(resolve=>complete=resolve);return {ok:true,data:{acknowledged:true,revision:'r2'}};},async read(){reads++;return {ok:false,error:{code:'UNEXPECTED'}};}}});
const writing=switching.flush();
const refreshing=switching.refresh();
context='new';switched.activate(graph(),{clean:true,source:{kind:'library',id:'replacement',revision:'new'}});complete();
await writing;await refreshing;
assert.equal(reads,0,'a refresh waiting on an old save does not read the replacement chat');
assert.equal(switched.source().id,'replacement');
assert.equal(switching.recovery().length,0,'replacement chat cannot see an outgoing private draft');
context='old';assert.equal(switching.recovery().length,1,'the outgoing draft is retained in its captured context');
switching.dispose();

// A debounce firing during a write must queue the later edit after acknowledgement.
const follow=createWorkflowDocumentSession();follow.activate(graph(),{source:{kind:'library',id:'saved',revision:'r1'},clean:true});
let finish;const attempts=[];
const following=createWorkflowAutosave({session:follow,delay:1,library:{async save(value){attempts.push(value);if(attempts.length===1)await new Promise(resolve=>finish=resolve);return {ok:true,data:{acknowledged:true,revision:'r'+(attempts.length+1)}};}}});
follow.current().name='first';const first=following.flush();
follow.current().name='second';following.changed();
await new Promise(resolve=>setTimeout(resolve,5));finish();await first;
await new Promise(resolve=>setTimeout(resolve,15));
assert.equal(attempts.length,2);
assert.equal(JSON.parse(attempts[1].json).graph.name,'second');
assert.equal(follow.dirty(),false);following.dispose();

for(const failure of [{ok:false,error:{code:'REVISION_CONFLICT',message:'Changed elsewhere'}},{ok:true,data:{revision:'unconfirmed'}}]) {
    const retained=createWorkflowDocumentSession();retained.activate(graph(),{source:{kind:'library',id:'saved',revision:'r1'},clean:true});retained.current().name='unsaved';
    const saver=createWorkflowAutosave({session:retained,library:{save:async()=>failure}});
    assert.equal((await saver.flush()).ok,false);assert.equal(retained.dirty(),true);assert.equal(retained.source().revision,'r1');assert.equal(saver.recovery().length,1);saver.dispose();
}
const reviewed=createWorkflowDocumentSession();reviewed.activate(graph(),{source:{kind:'library',id:'saved',revision:'r1'},clean:true});
let busy=true,checked=0;const remote=graph();remote.nodes.text.text='remote edit';
const review=createWorkflowAutosave({session:reviewed,isBusy:()=>busy,library:{async read(){checked++;return {ok:true,data:{graph:remote,source:{kind:'library',id:'saved',revision:'r2'},revision:'r2'}};}}});
assert.equal((await review.refresh()).data.deferred,true);assert.equal(checked,0);assert.equal(reviewed.current().nodes.text.text,'before');
busy=false;assert.equal((await review.refresh()).ok,true);assert.equal(checked,1);assert.equal(reviewed.current().nodes.text.text,'remote edit');review.dispose();
