import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectNodeFile, nodeFileSetupIssue } from '../src/ui/node-file-projection.js';

test('a reader can require a selected file while pure transforms have no destination', () => {
 const node={id:'reader',operation:'read-file',initialization:'require-file'};
 const view=projectNodeFile(node,{supported:true,bindings:{}});
 assert.equal(view.mode,'source');
 assert.equal(view.settings.bindingId,'');
 assert.equal(nodeFileSetupIssue(view).field,'fileTarget');
 assert.match(nodeFileSetupIssue(view).message,/Choose.*file/i);
 assert.equal(projectNodeFile({operation:'format'},{}),null);
 assert.equal(projectNodeFile({operation:'project-document'},{}),null);
});

test('unset readers prepare automatic managed data and retain initialization controls',()=>{
 for(const initialization of ['generate','template']){
  const node={id:'reader',operation:'read-file',initialization,initializationInstructions:'Keep unknown facts unspecified.',initializationMaxTokens:4096};
  const view=projectNodeFile(node,{supported:true,storage:'host',bindings:{}});
  assert.equal(view.managed,true);
  assert.equal(view.status,'Ready');
  assert.equal(view.settings.format,'json');
  assert.equal(nodeFileSetupIssue(view),null);
  assert.equal(view.initialization,initialization);
  assert.equal(view.initializationInstructions,'Keep unknown facts unspecified.');
  assert.equal(view.initializationMaxTokens,4096);
  assert.equal(Object.hasOwn(node,'fileTarget'),false,'display preparation does not edit workflow settings');
 }
});

test('a reader requiring a file cannot become ready from an unbound managed marker',()=>{
 const node={id:'reader',operation:'read-file',initialization:'require-file',fileTarget:{managed:true}};
 const view=projectNodeFile(node,{supported:true,storage:'host',bindings:{}});
 assert.equal(view.managed,false);
 assert.match(nodeFileSetupIssue(view)?.message??'',/Choose.*file/i);
 assert.deepEqual(node.fileTarget,{managed:true});
});

test('browser file access guidance is retained separately from the setup caution', () => {
 const accessIssue={code:'FILE_ACCESS_BRAVE',message:'Brave is not exposing direct file saving. Enable File System Access API and relaunch Brave.'};
 const view=projectNodeFile({id:'writer',operation:'write-file',destinationMode:'own'},{supported:false,accessIssue,bindings:{}});
 assert.deepEqual(view.accessIssue,accessIssue);
 assert.match(nodeFileSetupIssue(view).message,/browser setup.*File section/i);
 assert.doesNotMatch(nodeFileSetupIssue(view).message,/Open Lattice in a browser|Choose.*location/);
 const supported=projectNodeFile({operation:'read-file',initialization:'require-file'},{supported:true,accessIssue,bindings:{}});
 assert.equal(supported.accessIssue,undefined,'the live capability check takes precedence over a stale diagnostic');
});

test('server bindings expose their resolved path and server setup without requiring native browser access',()=>{
 const fileTarget={bindingId:'server-1',name:'SceneContext.txt',format:'text'};
 const view=projectNodeFile({id:'writer',operation:'write-file',destinationMode:'own',targetId:'scene',fileTarget},{storage:'server',supported:true,nativeSupported:false,location:{basePath:'/data/user/files/lattice'},bindings:{'server-1':{name:'SceneContext.txt',path:'/stories/SceneContext.txt',format:'text',status:'ready',storage:'server'}}});
 assert.equal(view.storage,'server');
 assert.equal(view.settings.path,'/stories/SceneContext.txt');
 assert.equal(view.issue,undefined);
 assert.equal(view.location.basePath,'/data/user/files/lattice');
 const unavailable=projectNodeFile({operation:'read-file',initialization:'require-file'},{storage:'server',supported:false,bindings:{}});
 assert.match(unavailable.accessIssue.message,/server.*locations|File storage setup/i);
 assert.doesNotMatch(unavailable.issue,/browser/i);
 const native=projectNodeFile({operation:'read-file',fileTarget},{storage:'server',supported:false,nativeSupported:true,bindings:{'server-1':{name:'SceneContext.txt',status:'ready',storage:'native'}}});
 assert.equal(native.storage,'native');
 assert.equal(native.supported,true);
 assert.equal(native.issue,undefined);
});

test('an own-file writer without its logical target must save file settings before it is ready',()=>{
 const view=projectNodeFile({id:'write',operation:'write-file',destinationMode:'own',fileTarget:{bindingId:'disk-1',name:'notes.txt',format:'text'}},{supported:true,storage:'server',bindings:{'disk-1':{storage:'server',name:'notes.txt',format:'text',status:'ready',path:'/notes.txt'}}});
 assert.match(nodeFileSetupIssue(view)?.message??'',/Choose.*destination/i);
});

test('a granted matching file is ready while a renamed or revoked binding needs setup', () => {
 const settings={bindingId:'disk-1',name:'journal.json',format:'json',missing:'create',content:'[]',visibility:{kind:'public'}};
 const node={operation:'read-file',targetId:'journal',fileTarget:settings};
 const ready=projectNodeFile(node,{supported:true,bindings:{'disk-1':{name:'journal.json',status:'ready'}}});
 assert.equal(ready.available,true);
 assert.equal(nodeFileSetupIssue(ready),null);
 const renamed=projectNodeFile({...node,fileTarget:{...settings,name:'other.json'}},{supported:true,bindings:{'disk-1':{name:'journal.json',status:'ready'}}});
 assert.match(nodeFileSetupIssue(renamed).message,/Choose.*file/i);
 const revoked=projectNodeFile(node,{supported:true,bindings:{'disk-1':{name:'journal.json',status:'permission-required'}}});
 assert.match(nodeFileSetupIssue(revoked).message,/permission/i);
});

test('migration starts from saved chat contents rather than the old initial template', () => {
 const node={operation:'read-file',targetId:'journal'};
 const view=projectNodeFile(node,{supported:true,bindings:{},documents:[{targetId:'journal',name:'Journal',format:'json',visibility:{kind:'public'}}],definitions:{journal:{content:'[]'}},legacyDocuments:{journal:{content:'[{"id":"saved"}]',format:'json'}}});
 assert.equal(view.legacy,true);
 assert.equal(view.settings.content,'[{"id":"saved"}]');
 assert.equal(view.settings.name,'Journal.json');
 assert.equal(nodeFileSetupIssue(view),null,'working legacy data needs no mandatory file migration');
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

test('inherited files retain the browser setup instructions from their owning node', () => {
 const accessIssue={code:'FILE_ACCESS_BRAVE',message:'Brave is not exposing direct file saving. Enable File System Access API and relaunch Brave.'};
 const read={id:'read',operation:'read-file',initialization:'require-file'},write={id:'write',operation:'write-file'};
 const view=projectNodeFile(write,{supported:false,accessIssue,nodes:{read,write},wires:{w:{from:'read',fromPort:'reference',to:'write',toPort:'reference'}}});
 assert.equal(view.mode,'inherited');
 assert.deepEqual(view.accessIssue,accessIssue);
 assert.match(view.issue,/browser setup/);
});

test('workspace surfaces file configuration as the existing above-node setup caution', async () => {
 const {prepareWorkspaceViews}=await import('../src/ui/workspace-preparation.js?v=0.30.3');
 const graph={id:'file-workflow',schema:3,runtime:2,mode:'native-unified',name:'Files',nodes:{reader:{id:'reader',type:'workflow',operation:'read-file',initialization:'require-file',x:0,y:0}},wires:{},groups:{}};
 const result=prepareWorkspaceViews(graph,{workflowData:{nodeFiles:{supported:true,bindings:{}}}});
 assert.equal(result.ok,true,JSON.stringify(result));
 const readiness=result.data.preparedViews[0].drawBase.nativeCards.reader.readiness;
 assert.equal(readiness.state,'setup');
 assert.ok(readiness.issues.some(issue=>issue.field==='fileTarget'));
});

test('workspace recomputes live file permissions rather than trusting saved binding IDs', async () => {
 const {prepareWorkspaceViews}=await import('../src/ui/workspace-preparation.js?v=0.30.3');
 const fileTarget={bindingId:'disk-1',name:'notes.txt',format:'text',missing:'create',content:'',visibility:{kind:'public'}};
 const graph={id:'file-workflow',schema:3,runtime:2,mode:'native-unified',name:'Files',nodes:{reader:{id:'reader',type:'workflow',operation:'read-file',targetId:'notes',fileTarget,x:0,y:0}},wires:{},groups:{}};
 const result=prepareWorkspaceViews(graph,{workflowData:{nodeFiles:{supported:true,bindings:{'disk-1':{name:'notes.txt',status:'permission-required'}}}}});
 assert.equal(result.ok,true,JSON.stringify(result));
 const readiness=result.data.preparedViews[0].drawBase.nativeCards.reader.readiness;
 assert.ok(readiness.issues.some(issue=>issue.field==='fileTarget'&&/permission/i.test(issue.message)));
});

test('an unconfigured file remains editable so its caution can be resolved',()=>{
 const view=projectNodeFile({operation:'read-file',initialization:'require-file'},{available:true,supported:true,bindings:{}});
 assert.equal(view.available,true);
 assert.ok(view.issue);
});

test('a disconnected writer can switch to its own destination without an upstream file',()=>{
 const view=projectNodeFile({id:'write',operation:'write-file'},{available:true,supported:true,bindings:{},nodes:{},wires:{}});
 assert.equal(view.available,true);
 assert.match(view.issue,/connect/i);
});

test('disk file setup is available before a chat catalog exists',()=>{
 const view=projectNodeFile({operation:'read-file',initialization:'require-file'},{available:false,supported:true,bindings:{}});
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

test('managed writers are ready automatically and legacy data remains usable without native APIs',()=>{
 const node={id:'writer',title:'SceneContext.txt',operation:'write-file',destinationMode:'own',fileTarget:{managed:true},fileHandling:'replace'};
 const view=projectNodeFile(node,{storage:'host',supported:true,bindings:{}});
 assert.equal(view.managed,true);
 assert.equal(view.friendlyName,'SceneContext');
 assert.equal(view.typeLabel,'Text document');
 assert.equal(view.status,'Ready');
 assert.equal(nodeFileSetupIssue(view),null);
 assert.equal(view.fileHandling,'replace');
 assert.equal(view.saving,true);
 const legacy=projectNodeFile({id:'clock',operation:'story-clock',clockId:'clock'},{supported:false,documents:[{targetId:'clock',name:'Story Clock',format:'json'}],legacyDocuments:{clock:{content:'{}',format:'json'}}});
 assert.equal(nodeFileSetupIssue(legacy),null);
 assert.equal(legacy.status,'Ready');
});

test('migration adopts only trusted empty unbound own files and preserves privacy and names',async()=>{
 const {managedNodeFileMigration}=await import('../src/ui/node-file-projection.js');
 const node={id:'writer',operation:'write-file',destinationMode:'own',fileTarget:{bindingId:'',path:'',name:'SceneContext.txt',format:'text',missing:'create',content:'',visibility:{kind:'actor-private',actorId:'mara'}}};
 assert.deepEqual(managedNodeFileMigration(node,{hasCanonicalData:false}),{managed:true,name:'SceneContext.txt',format:'text',missing:'create',visibility:{kind:'actor-private',actorId:'mara'}});
 for(const options of [{},{hasCanonicalData:true}])assert.equal(managedNodeFileMigration(node,options),null);
 for(const extra of [{path:'Stories/notes.txt'},{bindingId:'existing'},{content:'Do not discard'}])assert.equal(managedNodeFileMigration({...node,fileTarget:{...node.fileTarget,...extra}},{hasCanonicalData:false}),null);
 assert.equal(managedNodeFileMigration({...node,destinationMode:'connected'},{hasCanonicalData:false}),null);
});

test('File owns duplicate handling, mutation, destination and character identifiers; writer content is a connection caution',async()=>{
 const {nodeFileOwnsControl,nodeFileContentIssue}=await import('../src/ui/node-file-projection.js');
 assert.equal(nodeFileOwnsControl('write-file','fileHandling'),true);assert.equal(nodeFileOwnsControl('write-file','mode'),true);assert.equal(nodeFileOwnsControl('project-document','mode'),false);assert.equal(nodeFileOwnsControl('story-clock','clockId'),true);
 for(const key of ['initialization','initializationInstructions','initializationMaxTokens'])assert.equal(nodeFileOwnsControl('read-file',key),true,'reader initialization belongs to the File section');
 const view=projectNodeFile({id:'writer',operation:'write-file',destinationMode:'own',fileHandling:'replace',fileTarget:{managed:true}},{supported:true,storage:'host',wires:{}});
 assert.equal(view.status,'Ready');assert.equal(nodeFileSetupIssue(view),null);assert.equal(nodeFileContentIssue(view).code,'MISSING_INPUT');assert.match(view.inputIssue,/Connect Text or Records/);
});

test('automatic file guidance describes ordinary defaults and leaves technical setup optional',async()=>{
 const {getNodeGuide}=await import('../src/ui/node-guide-content.js');
 assert.match(getNodeGuide('write-file').howTo.join(' '),/automatic/i);
 assert.match(getNodeGuide('write-file').howTo.join(' '),/Replace.*Append/);
 assert.doesNotMatch(getNodeGuide('story-clock').howTo.join(' '),/Workflow Data|JSON source/);
});

test('host availability never masquerades as native permission for an existing native grant',()=>{
 const node={operation:'read-file',targetId:'notes',fileTarget:{bindingId:'native-old',name:'notes.txt',format:'text'}};
 const view=projectNodeFile(node,{storage:'host',supported:true,nativeSupported:false,bindings:{'native-old':{storage:'native',name:'notes.txt',status:'ready'}}});
 assert.equal(view.supported,false);assert.ok(view.issue);assert.equal(view.storage,'native');
});
