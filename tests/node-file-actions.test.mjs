import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createNodeFileActions} from '../src/ui/node-file-actions.js';
const settings={bindingId:'',name:'notes.txt',format:'text',missing:'create',content:'saved notes',visibility:{kind:'public'}};
function fixture(choose){
 const commits=[]; let current=true;
 const captured={node:{id:'read',operation:'read-file',targetId:'notes'},nodes:{},view:{legacy:true}};
 const actions=createNodeFileActions({capture:()=>({ok:true,data:captured}),isCurrent:()=>current,access:()=>({choose}),commit:(_capture,_selection,controls)=>{commits.push(controls);return {ok:true};}});
 return {actions,commits,change:()=>{current=false;}};
}
test('choosing a destination commits file intent and preserves migrated data without writing contents',async()=>{
 const requests=[];
 const f=fixture(request=>{requests.push(request);return Promise.resolve({ok:true,data:{bindingId:'disk-1',name:'chosen.txt'}});});
 assert.equal((await f.actions.chooseNodeFile({}, {mode:'save',settings})).ok,true);
 assert.equal(requests.length,1);
 assert.equal(f.commits[0].fileTarget.name,'chosen.txt');
 assert.equal(f.commits[0].fileTarget.bindingId,'disk-1');
 assert.equal(f.commits[0].fileTarget.content,'saved notes');
 assert.equal(f.commits[0].targetId,'notes');
});

test('a picker completion cannot change a node after selection or document changed',async()=>{
 let finish; const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=f.actions.chooseNodeFile({}, {mode:'save',settings});
 f.change();finish({ok:true,data:{bindingId:'disk-1',name:'chosen.txt'}});
 const result=await pending;
 assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_CONTEXT');
 assert.equal(f.commits.length,0);
});

test('saving a changed filename retires the old binding until a new location is chosen',()=>{
 const commits=[];
 const node={id:'write',operation:'write-file',destinationMode:'own',targetId:'journal',fileTarget:{...settings,bindingId:'disk-1'}};
 const actions=createNodeFileActions({capture:()=>({ok:true,data:{node,nodes:{},view:{legacy:false}}}),isCurrent:()=>true,commit:(_capture,_selection,controls)=>{commits.push(controls);return {ok:true};}});
 assert.equal(actions.saveNodeFile({}, {...settings,bindingId:'disk-1',name:'renamed.txt'}).ok,true);
 assert.equal(commits[0].fileTarget.bindingId,'');
 assert.equal(commits[0].fileTarget.name,'renamed.txt');
});

test('a new clock receives a distinct logical identity matching its initial JSON',async()=>{
 const commits=[];const node={id:'clock',operation:'story-clock',clockId:'lattice-default-clock'};
 const actions=createNodeFileActions({capture:()=>({ok:true,data:{node,nodes:{},view:{legacy:false}}}),isCurrent:()=>true,access:()=>({choose:async()=>({ok:true,data:{bindingId:'disk-clock',name:'clock.json'}})}),commit:(_capture,_selection,controls)=>{commits.push(controls);return {ok:true};}});
 const clockSettings={...settings,name:'clock.json',format:'json',content:JSON.stringify({clockId:'lattice-default-clock',absoluteMinute:0})};
 assert.equal((await actions.chooseNodeFile({}, {mode:'save',settings:clockSettings})).ok,true);
 assert.notEqual(commits[0].clockId,'lattice-default-clock');
 assert.equal(JSON.parse(commits[0].fileTarget.content).clockId,commits[0].clockId);
});

test('selecting the same physical file reuses the graph target instead of creating conflicting destinations',async()=>{
 const commits=[];const target={...settings,bindingId:'disk-1'};
 const read={id:'first',operation:'read-file',targetId:'shared',fileTarget:target};
 const node={id:'second',operation:'read-file'};
 const actions=createNodeFileActions({capture:()=>({ok:true,data:{node,nodes:{first:read},view:{legacy:false}}}),isCurrent:()=>true,access:()=>({choose:async()=>({ok:true,data:{bindingId:'disk-1',name:'notes.txt'}})}),commit:(_capture,_selection,controls)=>{commits.push(controls);return {ok:true};}});
 await actions.chooseNodeFile({}, {mode:'open',settings});
 assert.equal(commits[0].targetId,'shared');
 assert.deepEqual(commits[0].fileTarget,target);
});

test('reconnecting an imported clock preserves the identity in its existing JSON',async()=>{
 const commits=[],node={id:'clock',operation:'story-clock',clockId:'campaign-clock',fileTarget:{...settings,bindingId:'',name:'clock.json',format:'json',content:'{"clockId":"campaign-clock"}'}};
 const actions=createNodeFileActions({capture:()=>({ok:true,data:{node,nodes:{},view:{legacy:false}}}),isCurrent:()=>true,access:()=>({choose:async()=>({ok:true,data:{bindingId:'disk-clock',name:'clock.json'}})}),commit:(_c,_s,controls)=>{commits.push(controls);return {ok:true};}});
 assert.equal((await actions.chooseNodeFile({}, {mode:'open',settings:node.fileTarget})).ok,true);
 assert.equal(commits[0].clockId,'campaign-clock');
 assert.equal(JSON.parse(commits[0].fileTarget.content).clockId,'campaign-clock');
});

test('splitting one node from a shared file assigns it an independent logical target',async()=>{
 const commits=[],first={id:'first',operation:'read-file',targetId:'shared',fileTarget:{...settings,bindingId:'disk-shared'}},second={id:'second',operation:'read-file',targetId:'shared',fileTarget:{...settings,bindingId:'disk-shared'}};
 const actions=createNodeFileActions({capture:()=>({ok:true,data:{node:first,nodes:{first,second},view:{legacy:false}}}),isCurrent:()=>true,access:()=>({choose:async()=>({ok:true,data:{bindingId:'disk-other',name:'other.txt'}})}),commit:(_c,_s,controls)=>{commits.push(controls);return {ok:true};}});
 await actions.chooseNodeFile({}, {mode:'save',settings:{...first.fileTarget,name:'other.txt'}});
 assert.notEqual(commits[0].targetId,'shared');
 assert.equal(second.targetId,'shared');
 assert.equal(second.fileTarget.bindingId,'disk-shared');
});

test('confirming a changed format explicitly identifies the existing file binding',async()=>{
 const requests=[],changed={...settings,bindingId:'disk-1',format:'markdown'},node={id:'reader',operation:'read-file',targetId:'notes',fileTarget:changed};
 const actions=createNodeFileActions({capture:()=>({ok:true,data:{node,nodes:{},view:{legacy:false}}}),isCurrent:()=>true,access:()=>({snapshot:()=>({'disk-1':{format:'text'}}),choose:async request=>{requests.push(request);return {ok:true,data:{bindingId:'disk-1',name:'notes.txt'}};}}),commit:()=>({ok:true})});
 await actions.chooseNodeFile({}, {mode:'open',settings:changed});
 assert.equal(requests[0].bindingId,'disk-1');
 assert.equal(requests[0].format,'markdown');
});
