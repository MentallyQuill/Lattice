import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectNodeFile, nodeFileSetupIssue } from '../src/ui/node-file-projection.js';

test('new file reader requires a node-owned destination and pure transforms do not', () => {
 const node={id:'reader',operation:'read-file'};
 const view=projectNodeFile(node,{supported:true,bindings:{}});
 assert.equal(view.mode,'source');
 assert.equal(view.settings.bindingId,'');
 assert.equal(nodeFileSetupIssue(view).field,'fileTarget');
 assert.match(nodeFileSetupIssue(view).message,/Choose.*file/i);
 assert.equal(projectNodeFile({operation:'format'},{}),null);
 assert.equal(projectNodeFile({operation:'project-document'},{}),null);
});

test('a granted matching file is ready while a renamed or revoked binding needs setup', () => {
 const settings={bindingId:'disk-1',name:'journal.json',format:'json',missing:'create',content:'[]',visibility:{kind:'public'}};
 const node={operation:'read-file',targetId:'journal',fileTarget:settings};
 const ready=projectNodeFile(node,{supported:true,bindings:{'disk-1':{name:'journal.json',status:'ready'}}});
 assert.equal(ready.available,true);
 assert.equal(nodeFileSetupIssue(ready),null);
 const renamed=projectNodeFile({...node,fileTarget:{...settings,name:'other.json'}},{supported:true,bindings:{'disk-1':{name:'journal.json',status:'ready'}}});
 assert.match(nodeFileSetupIssue(renamed).message,/filename|location/i);
 const revoked=projectNodeFile(node,{supported:true,bindings:{'disk-1':{name:'journal.json',status:'permission-required'}}});
 assert.match(nodeFileSetupIssue(revoked).message,/permission/i);
});

test('migration starts from saved chat contents rather than the old initial template', () => {
 const node={operation:'read-file',targetId:'journal'};
 const view=projectNodeFile(node,{supported:true,bindings:{},documents:[{targetId:'journal',name:'Journal',format:'json',visibility:{kind:'public'}}],definitions:{journal:{content:'[]'}},legacyDocuments:{journal:{content:'[{"id":"saved"}]',format:'json'}}});
 assert.equal(view.legacy,true);
 assert.equal(view.settings.content,'[{"id":"saved"}]');
 assert.equal(view.settings.name,'Journal.json');
 assert.ok(nodeFileSetupIssue(view));
});

test('connected writes display the upstream file and missing references have an actionable caution', () => {
 const read={id:'read',operation:'read-file',targetId:'notes',fileTarget:{bindingId:'disk-1',name:'notes.txt',format:'text'}};
 const write={id:'write',operation:'write-file'};
 const state={supported:true,bindings:{'disk-1':{name:'notes.txt',status:'ready'}},nodes:{read,write},wires:{w:{from:'read',fromPort:'reference',to:'write',toPort:'reference'}}};
 const view=projectNodeFile(write,state);
 assert.equal(view.mode,'inherited');
 assert.equal(view.summary,'notes.txt — from Read File');
 assert.equal(nodeFileSetupIssue(view),null);
 const disconnected=projectNodeFile(write,{...state,wires:{}});
 assert.match(nodeFileSetupIssue(disconnected).message,/connect.*reference/i);
 assert.equal(projectNodeFile({operation:'random-pick',ledgerId:''},state),null);
});

test('workspace surfaces file configuration as the existing above-node setup caution', async () => {
 const {prepareWorkspaceViews}=await import('../src/ui/workspace-preparation.js?v=0.28.1');
 const graph={id:'file-workflow',schema:3,runtime:2,mode:'native-unified',name:'Files',nodes:{reader:{id:'reader',type:'workflow',operation:'read-file',x:0,y:0}},wires:{},groups:{}};
 const result=prepareWorkspaceViews(graph,{workflowData:{nodeFiles:{supported:true,bindings:{}}}});
 assert.equal(result.ok,true,JSON.stringify(result));
 const readiness=result.data.preparedViews[0].drawBase.nativeCards.reader.readiness;
 assert.equal(readiness.state,'setup');
 assert.ok(readiness.issues.some(issue=>issue.field==='fileTarget'));
});

test('workspace recomputes live file permissions rather than trusting saved binding IDs', async () => {
 const {prepareWorkspaceViews}=await import('../src/ui/workspace-preparation.js?v=0.28.1');
 const fileTarget={bindingId:'disk-1',name:'notes.txt',format:'text',missing:'create',content:'',visibility:{kind:'public'}};
 const graph={id:'file-workflow',schema:3,runtime:2,mode:'native-unified',name:'Files',nodes:{reader:{id:'reader',type:'workflow',operation:'read-file',targetId:'notes',fileTarget,x:0,y:0}},wires:{},groups:{}};
 const result=prepareWorkspaceViews(graph,{workflowData:{nodeFiles:{supported:true,bindings:{'disk-1':{name:'notes.txt',status:'permission-required'}}}}});
 assert.equal(result.ok,true,JSON.stringify(result));
 const readiness=result.data.preparedViews[0].drawBase.nativeCards.reader.readiness;
 assert.ok(readiness.issues.some(issue=>issue.field==='fileTarget'&&/permission/i.test(issue.message)));
});

test('an unconfigured file remains editable so its caution can be resolved',()=>{
 const view=projectNodeFile({operation:'read-file'},{available:true,supported:true,bindings:{}});
 assert.equal(view.available,true);
 assert.ok(view.issue);
});

test('a disconnected writer can switch to its own destination without an upstream file',()=>{
 const view=projectNodeFile({id:'write',operation:'write-file'},{available:true,supported:true,bindings:{},nodes:{},wires:{}});
 assert.equal(view.available,true);
 assert.match(view.issue,/connect/i);
});

test('disk file setup is available before a chat catalog exists',()=>{
 const view=projectNodeFile({operation:'read-file'},{available:false,supported:true,bindings:{}});
 assert.equal(view.available,true);
});

test('Clock Commit shows the actual commit-clock operation’s inherited clock destination',()=>{
 const clock={id:'clock',operation:'story-clock',clockId:'clock',fileTarget:{bindingId:'clock-disk',name:'clock.json',format:'json'}};
 const advance={id:'advance',operation:'advance-time'},commit={id:'commit',operation:'commit-clock'};
 const view=projectNodeFile(commit,{supported:true,bindings:{'clock-disk':{name:'clock.json',status:'ready'}},nodes:{clock,advance,commit},wires:{a:{from:'clock',to:'advance'},b:{from:'advance',to:'commit'}}});
 assert.equal(view?.mode,'inherited');
 assert.equal(view.summary,'clock.json — from Story Clock');
});

test('changing the configured format requires explicit file reconfiguration',()=>{
 const view=projectNodeFile({operation:'read-file',targetId:'notes',fileTarget:{bindingId:'disk-1',name:'notes.txt',format:'markdown'}},{supported:true,bindings:{'disk-1':{name:'notes.txt',format:'text',status:'ready'}}});
 assert.match(nodeFileSetupIssue(view)?.message??'',/format/i);
});

test('inconsistent shared file settings surface a setup caution before running',()=>{
 const first={id:'first',operation:'read-file',targetId:'shared',fileTarget:{bindingId:'disk-1',name:'one.txt',format:'text'}},second={id:'second',operation:'read-file',targetId:'shared',fileTarget:{bindingId:'disk-2',name:'two.txt',format:'text'}};
 const view=projectNodeFile(first,{supported:true,bindings:{'disk-1':{name:'one.txt',format:'text',status:'ready'}},nodes:{first,second},wires:{}});
 assert.match(nodeFileSetupIssue(view)?.message??'',/sharing|shared/i);
});
