import assert from 'node:assert/strict';
import test from 'node:test';
import {createNodeFileAccess} from '../src/ui/node-file-access.js';
import {sha256Text} from '../src/workflow/definition-data.js';
import {selectRandomOutcomes} from '../src/workflow/operations/random-outcomes.js';
import {normalizeOccurrences,confirmOccurrences,resolveItemHolders} from '../src/workflow/operations/event-data.js';
const must=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.data;};
const scope={userId:'owner',chatId:'story'};
async function fixture(format='text',initial='zero'){
 let text=initial,writes=0,state={bindings:[],records:{}};
 const handle={name:'state.'+(format==='json'?'json':'txt'),kind:'file',queryPermission:async()=>'granted',getFile:async()=>({size:Buffer.byteLength(text),text:async()=>text}),createWritable:async()=>{let next;return {write:async value=>{next=value;},close:async()=>{text=next;writes++;}};}};
 const persistence={load:async()=>state,save:async value=>{state={bindings:value.bindings.map(row=>({...row})),records:structuredClone(value.records)};}};
 const create=()=>createNodeFileAccess({persistence,showSaveFilePicker:async()=>handle,showOpenFilePicker:async()=>[handle]});
 let access=create();await access.ready;const selected=must(await access.choose({mode:'save',name:handle.name,format}));
 const definition={targetId:'state',...selected,format,content:initial,missing:'create',visibility:{kind:'public'}};
 return {backend:()=>access.backend([definition],{scope,isCurrent:()=>true}),reload:async()=>{access=create();must(await access.ready);},writes:()=>writes,tamper:change=>change(state)};
}
const update=(snapshot,content,intentId,historyHandling)=>({targetId:'state',expectedRevision:snapshot.revision,expectedContent:snapshot.content,projectedDocument:{format:snapshot.format,content},intentId,fingerprint:sha256Text(intentId),...(historyHandling?{historyHandling}:{})});
test('1000 accepted saves compact receipts, survive reload and deduplicate archived retries',async()=>{
 const f=await fixture();let first;
 for(let index=1;index<=1000;index++){
  if(index%100===0)await f.reload();const backend=f.backend(),before=must(await backend.load('state')),change=update(before,'save '+index,'save-'+index);first??=change;
  must(await backend.compareAndSwap(change));must(await backend.compareAndSwap(change));
 }
 await f.reload();const backend=f.backend(),saved=must(await backend.load('state'));
 assert.equal(saved.content,'save 1000');assert.ok(saved.receipts.length<224);assert.ok(saved.history.epoch>=4);
 assert.equal(must(await backend.lookupHistory('state',{intentId:'save-1'})).receipt.intentId,'save-1');
 must(await backend.compareAndSwap(first));assert.equal(f.writes(),1000);
});
for(const mode of ['replace','append'])test(`100 accepted clock turns automatically retain replay identities (${mode})`,async()=>{
 const clock={schemaVersion:1,clockId:'state',calendarId:'days',revision:1,dayLengthMinutes:1440,absoluteMinute:0,settledTimeEventIds:[],acceptedTimeAdvances:[]};
 const f=await fixture('json',JSON.stringify(clock));
 for(let turn=1;turn<=100;turn++){
  if(turn%10===0)await f.reload();const backend=f.backend(),snapshot=must(await backend.load('state')),previous=JSON.parse(snapshot.content),{acceptedTimeAdvances,...previousClock}=previous;
  const next={...previous,revision:previous.revision+1,absoluteMinute:turn,acceptedTimeAdvances:[...acceptedTimeAdvances,{turnId:'turn-'+turn,projectionKey:'projection-'+turn,previousClock}]};
  must(await backend.compareAndSwap(update(snapshot,JSON.stringify(next),'turn-'+turn,mode)));
 }
 await f.reload();const backend=f.backend(),saved=JSON.parse(must(await backend.load('state')).content);
 assert.equal(saved.absoluteMinute,100);assert.ok(saved.acceptedTimeAdvances.length<24);
 assert.equal(must(await backend.lookupHistory('state',{turnId:'turn-1'})).clockTurn.previousClock.absoluteMinute,0);
 assert.equal(f.writes(),100);
});
test('recovery rotates twenty versions, checks captured revision and keeps current replay authority',async()=>{
 const f=await fixture();
 for(let index=1;index<=230;index++){const backend=f.backend(),snapshot=must(await backend.load('state'));must(await backend.compareAndSwap(update(snapshot,'value '+index,'version-'+index)));}
 await f.reload();const backend=f.backend(),snapshot=must(await backend.load('state')),versions=must(await backend.listVersions('state'));
 assert.equal(versions.versions.length,20);assert.equal(versions.versions[0].revision,sha256Text('value 229'));
 const request={versionId:versions.versions.at(-1).versionId,expectedRevision:snapshot.revision,intentId:'restore-1'};
 assert.equal((await backend.restoreVersion('state',{...request,expectedRevision:'stale'})).ok,false);
 must(await backend.restoreVersion('state',request));
 assert.equal(must(await backend.load('state')).content,'value 210');
 assert.equal(must(await backend.lookupHistory('state',{intentId:'version-1'})).receipt.intentId,'version-1');
 assert.equal((await backend.restoreVersion('state',request)).ok,false);
});
test('restoring a checkpointed progression keeps current replay identities with a fresh history marker',async()=>{
 const f=await fixture('json',JSON.stringify({values:[{key:'xp',value:0}],ledger:[]}));
 for(let index=1;index<=226;index++){
  const backend=f.backend(),snapshot=must(await backend.load('state')),value=JSON.parse(snapshot.content);
  value.values[0].value=index;value.ledger.push({eventId:'award-'+index,identityKey:'award-'+index,eventIdentity:'facts-'+index});
  must(await backend.compareAndSwap(update(snapshot,JSON.stringify(value),'award-'+index)));
 }
 const backend=f.backend(),snapshot=must(await backend.load('state')),versions=must(await backend.listVersions('state'));
 must(await backend.restoreVersion('state',{versionId:versions.versions[0].versionId,expectedRevision:snapshot.revision,intentId:'restore-progression'}));
 const restored=must(await backend.load('state')),value=JSON.parse(restored.content);
 assert.equal(value.values[0].value,225);assert.equal(value.historyCheckpoint.epoch,restored.history.epoch);
 assert.deepEqual(must(await backend.lookupHistory('state',{progression:{identityKeys:['award-226'],eventIds:['award-226']}})).progression,{knownIdentityKeys:['award-226'],eventIdentities:[{eventId:'award-226',eventIdentity:'facts-226'}]});
});
test('restoring a clock preserves consumed future and opaque identities as well as archived past events',async()=>{
 const clock={schemaVersion:1,clockId:'state',calendarId:'days',revision:1,dayLengthMinutes:1440,absoluteMinute:0,settledTimeEventIds:[],acceptedTimeAdvances:[]};
 const f=await fixture('json',JSON.stringify(clock)),backend=f.backend(),past='time:["state","past",1,10]',future='time:["state","future",1,100]';
 for(const minute of [10,20]){const snapshot=must(await backend.load('state'));must(await backend.compareAndSwap(update(snapshot,JSON.stringify({...clock,revision:minute,absoluteMinute:minute,settledTimeEventIds:[past,future,'authored:opaque']}),'clock-'+minute)));}
 const snapshot=must(await backend.load('state')),versions=must(await backend.listVersions('state'));
 must(await backend.restoreVersion('state',{versionId:versions.versions[0].versionId,expectedRevision:snapshot.revision,intentId:'restore-clock'}));
 const restored=must(await backend.readVersion('state',{versionId:'current'}));
 assert.equal(JSON.parse(restored.snapshot.content).absoluteMinute,10);
 assert.deepEqual(JSON.parse(restored.snapshot.content).settledTimeEventIds,[future,'authored:opaque']);
 assert.ok(Object.values(restored.pages).some(page=>page.kind==='clock-events'&&page.payload.includes(past)));
});
test('retained-version reads reject altered bytes or privacy metadata before exposing a branch snapshot',async()=>{
 for(const damage of [version=>{version.content='altered bytes';},version=>{version.visibility={kind:'actor-private',actorId:'another-actor'};}]){
  const f=await fixture(),backend=f.backend(),snapshot=must(await backend.load('state'));
  must(await backend.compareAndSwap(update(snapshot,'accepted','version-check')));
  const versionId=must(await backend.listVersions('state')).versions[0].versionId;
  f.tamper(state=>damage(Object.values(state.records)[0].versions[0]));
  assert.equal((await backend.readVersion('state',{versionId})).ok,false);
 }
});
const library={libraryId:'wand-effects',revision:'1',itemId:'wand',effects:[{id:'sparks',kind:'fixed',weight:1,description:'Violet sparks.'}]};
async function outcome(index){
 const source={sourceId:'use-'+index,revision:'r1',sceneId:'scene',watch:'player-message',text:'Mara uses the wand.',visibility:'public'};
 const events=must(normalizeOccurrences(source,[{eventType:'item-used',actorId:'mara',itemId:'wand',position:{start:0,end:source.text.length},semantics:'actual'}],{actorIds:['mara'],itemIds:['wand']})).events;
 const confirmed=must(confirmOccurrences(events,[{eventId:events[0].eventId,accepted:true}])).events,event=must(resolveItemHolders({wand:'mara'},confirmed)).events[0];
 return {...must(await selectRandomOutcomes([event],library,[],{random:()=>0})).outcomes[0],acceptance:'accepted'};
}
test('Replace keeps the new accepted outcomes visible while retiring older records',async()=>{
 const f=await fixture('json','[]'),backend=f.backend(),first=await outcome(1),second=await outcome(2);
 let snapshot=must(await backend.load('state'));must(await backend.compareAndSwap(update(snapshot,JSON.stringify([first]),'outcome-1','replace')));
 snapshot=must(await backend.load('state'));assert.deepEqual(JSON.parse(snapshot.content),[first]);
 must(await backend.compareAndSwap(update(snapshot,JSON.stringify([first,second]),'outcome-2','replace')));
 assert.deepEqual(JSON.parse(must(await backend.load('state')).content),[second]);
 assert.deepEqual(must(await backend.lookupHistory('state',{outcomes:{eventIds:[first.event.eventId],libraryId:library.libraryId,rerollId:null}})).outcomes,[first]);
});
for(const mode of ['replace','append'])test(`1000 accepted outcome saves preserve exact draws across reload and retry (${mode})`,async()=>{
 const f=await fixture('json','[]');let first;
 for(let index=1;index<=1000;index++){
  if(index%100===0)await f.reload();const backend=f.backend(),snapshot=must(await backend.load('state')),accepted=await outcome(index);first??=accepted;
  const change=update(snapshot,JSON.stringify([...JSON.parse(snapshot.content),accepted]),'outcome-'+index,mode);
  must(await backend.compareAndSwap(change));must(await backend.compareAndSwap(change));
 }
 await f.reload();const backend=f.backend(),snapshot=must(await backend.load('state')),archived=must(await backend.lookupHistory('state',{outcomes:{eventIds:[first.event.eventId],libraryId:library.libraryId,rerollId:null}}));
 assert.deepEqual(archived.outcomes,[first]);assert.ok(JSON.parse(snapshot.content).length<96);assert.equal(f.writes(),1000);
 const reused=must(await selectRandomOutcomes([first.event],library,archived.outcomes,{random:()=>{throw Error('A saved draw must not run again');}}));assert.equal(reused.draws,0);
});
