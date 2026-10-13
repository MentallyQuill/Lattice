import { describeRandom } from '../src/workflow/operations/random-outcomes.js';
import { describeCollection } from '../src/workflow/operations/collection-nodes.js';
import { appendDraftSections } from '../src/workflow/draft-revisions.js?v=0.27.2';
import { applyProgressionEvents } from '../src/workflow/progression.js';
import { executeEvent, describeEvent } from '../src/workflow/operations/event-nodes.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOccurrences, confirmOccurrences, resolveItemHolders, matchLiteralTrigger, toProgressionEvents, sourceFromDraft } from '../src/workflow/operations/event-data.js';

const text = "Mara casts the broken wand at the lock. Mara gives the broken wand to Elias. Elias casts the broken wand at the chest. They remember yesterday's cast.";
const source = { sourceId: 'player-42', revision: 'r1', sceneId: 'scene-42', watch: 'player-message', text, visibility: 'public' };
const entities = { actorIds: ['mara', 'elias'], itemIds: ['broken-wand-01'] };
const span = passage => ({ start: text.indexOf(passage), end: text.indexOf(passage) + passage.length });
const candidates = [
    { eventType: 'item-used', actorId: 'mara', itemId: 'broken-wand-01', position: span('Mara casts the broken wand at the lock.'), semantics: 'actual' },
    { eventType: 'item-transferred', actorId: 'mara', objectId: 'elias', itemId: 'broken-wand-01', position: span('Mara gives the broken wand to Elias.'), semantics: 'actual' },
    { eventType: 'item-used', actorId: 'elias', itemId: 'broken-wand-01', position: span('Elias casts the broken wand at the chest.'), semantics: 'actual' },
    { eventType: 'item-used', actorId: 'mara', itemId: 'broken-wand-01', position: span("They remember yesterday's cast."), semantics: 'recalled' },
];
test('two confirmed wand casts retain distinct occurrences and holders across a transfer', () => {
    const normalized = normalizeOccurrences(source, candidates, entities);
    assert.equal(normalized.ok, true, JSON.stringify(normalized.error));
    assert.equal(normalized.data.events.length, 4);
    assert.equal(normalized.data.events[0].status, 'candidate');
    const decisions = normalized.data.events.map(event => ({ eventId: event.eventId, accepted: event.semantics === 'actual' }));
    const confirmed = confirmOccurrences(normalized.data.events, decisions);
    assert.equal(confirmed.ok, true, JSON.stringify(confirmed.error));
    assert.equal(confirmed.data.events.length, 3);
    const folded = resolveItemHolders({ 'broken-wand-01': 'mara' }, confirmed.data.events);
    assert.equal(folded.ok, true, JSON.stringify(folded.error));
    assert.deepEqual(folded.data.events.filter(event => event.eventType === 'item-used').map(event => [event.actorId, event.holderId]), [['mara','mara'],['elias','elias']]);
    assert.notEqual(folded.data.events[0].eventId, folded.data.events[2].eventId);
    assert.equal(folded.data.holders['broken-wand-01'], 'elias');
    assert.deepEqual(source, { sourceId: 'player-42', revision: 'r1', sceneId: 'scene-42', watch: 'player-message', text, visibility: 'public' });
});
test('literal triggers distinguish per-occurrence matching from a rising edge', () => {
    const watched = { ...source, text: 'The broken wand rests here. The broken wand glows.' };
    const perUse = matchLiteralTrigger(watched, { aliases: ['broken wand'], itemId: 'broken-wand-01', actorId: 'mara', activation: 'per-occurrence', watch: 'player-message' }, entities);
    assert.equal(perUse.ok, true, JSON.stringify(perUse.error));
    assert.equal(perUse.data.events.length, 2);
    const first = matchLiteralTrigger(watched, { aliases: ['broken wand'], itemId: 'broken-wand-01', actorId: 'mara', activation: 'edge-once', watch: 'player-message' }, entities, { matched: false, consumedActivationIds: [] });
    assert.equal(first.ok, true, JSON.stringify(first.error));
    assert.equal(first.data.events.length, 1);
    const repeated = matchLiteralTrigger({ ...watched, sourceId: 'player-43' }, { aliases: ['broken wand'], itemId: 'broken-wand-01', actorId: 'mara', activation: 'edge-once', watch: 'player-message' }, entities, first.data.triggerState);
    assert.equal(repeated.ok, true, JSON.stringify(repeated.error));
    assert.deepEqual(repeated.data.events, []);
    assert.equal(repeated.data.actualCalls, 0);
});
test('an unresolved occurrence holds confirmation instead of becoming no events', () => {
    const normalized = normalizeOccurrences(source, candidates.slice(0,1), entities);
    const result = confirmOccurrences(normalized.data.events, [{ eventId: normalized.data.events[0].eventId, status: 'unresolved' }]);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'UNRESOLVED_EVENTS');
    assert.equal(result.data, undefined);
});
test('candidate normalization refuses unknown entities and preserves source revisions', () => {
    const unknown = normalizeOccurrences(source, [{ ...candidates[0], actorId: 'owner-by-name' }], entities);
    assert.equal(unknown.ok, false);
    const a = normalizeOccurrences(source, candidates.slice(0,1), entities);
    const b = normalizeOccurrences({ ...source, revision: 'r2' }, candidates.slice(0,1), entities);
    assert.notEqual(a.data.events[0].eventId, b.data.events[0].eventId);
    let reads = 0;
    const hostile = { ...candidates[0], get actorId() { reads++; return 'mara'; } };
    assert.equal(normalizeOccurrences(source, [hostile], entities).ok, false);
    assert.equal(reads, 0);
});
test('Character Direction calls only a present actor with that actors private context', async () => {
    const scene = { sceneId: 'scene-42', sourceId: 'draft-42', revision: 'r1', actors: [{ actorId: 'mara', status: 'present' }, { actorId: 'elias', status: 'absent' }] };
    const present = await executeEvent({ operation: 'scene-presence', actorId: 'mara' }, { in: { kind: 'data', value: scene } });
    assert.equal(present.ok, true, JSON.stringify(present.error));
    let requests = 0, contextReads = 0;
    const execution = {
        actorContext: async (actorId,request) => { contextReads++; assert.equal(actorId, 'mara'); assert.equal(Object.hasOwn(request,'data'),false); return { ok: true, data: { scope: { actorId, sceneId: 'scene-42' }, visibility: 'actor-private', context: { visibleScene: 'Mara holds the wand.', privateFeeling: 'Mara fears the flame.' }, memories: [] } }; },
        request: async options => { requests++; assert.equal(options.messages[0].role, 'system'); assert.equal(options.messages[0].content.includes('Dry practical advice'), true); assert.equal(options.messages[1].content.includes('Mara fears the flame.'), true); assert.equal(Object.hasOwn(JSON.parse(options.messages[1].content),'data'),false); return { ok: true, data: { text: 'Mara recommends sheltering the flame.', finish: 'stop' } }; },
    };
    const direction = await executeEvent({ operation: 'character-direction', actorId: 'mara', systemPrompt: 'Dry practical advice.' }, { presence: present.artifact }, execution);
    assert.equal(direction.ok, true, JSON.stringify(direction.error));
    assert.equal(direction.artifact.kind, 'guidance');
    assert.equal(direction.artifact.visibility, 'actor-private');
    assert.equal(direction.artifact.scope.actorId, 'mara');
    const absent = await executeEvent({ operation: 'scene-presence', actorId: 'elias' }, { in: { kind: 'data', value: scene } });
    const skipped = await executeEvent({ operation: 'character-direction', actorId: 'elias', systemPrompt: 'Private fears.' }, { presence: absent.artifact }, execution);
    assert.equal(skipped.ok, true, JSON.stringify(skipped.error));
    assert.equal(skipped.outputStates.out.status, 'skipped');
    assert.equal(requests, 1);
    assert.equal(contextReads, 1);
});
test('Item Use Trigger extracts candidates but only checked confirmations activate actual uses', async () => {
    let calls = 0;
    const node = { operation: 'item-use-trigger', mode: 'extract', watch: 'player-message', itemId: 'broken-wand-01', instructions: 'Find casts and transfers.' };
    const descriptor = describeEvent(node, { phase: 'pre' });
    assert.equal(descriptor.ok, true, JSON.stringify(descriptor.error));
    assert.equal(descriptor.data.descriptor.requestBound, 1);
    const extracted = await executeEvent(node, { source: { kind: 'data', value: source }, entities: { kind: 'data', value: entities } }, { request: async options => {
        calls++;
        assert.equal(options.messages[1].content.includes('Mara gives'), true);
        return { ok: true, data: { text: JSON.stringify({ candidates }), finish: 'stop' } };
    } });
    assert.equal(extracted.ok, true, JSON.stringify(extracted.error));
    assert.equal(extracted.artifact.value.every(event => event.status === 'candidate'), true);
    const confirmations = extracted.artifact.value.map(event => ({ eventId: event.eventId, accepted: event.semantics === 'actual' }));
    const confirmed = await executeEvent({ operation: 'confirm-events' }, { events: extracted.artifact, decisions: { kind: 'data', value: confirmations } });
    assert.equal(confirmed.ok, true, JSON.stringify(confirmed.error));
    assert.equal(confirmed.artifact.value.length, 3);
    const holders = await executeEvent({ operation: 'current-holder' }, { events: confirmed.artifact, holders: { kind: 'data', value: { 'broken-wand-01': 'mara' } } });
    assert.equal(holders.ok, true, JSON.stringify(holders.error));
    assert.equal(holders.outputs.events.value[2].holderId, 'elias');
    assert.equal(calls, 1);
});
test('mention-trigger retry uses staged activation state instead of producing duplicate mentions', async () => {
    const node = { operation: 'item-mention-trigger', actorId: 'mara', itemId: 'broken-wand-01', aliases: ['broken wand'], watch: 'player-message', activation: 'once-per-source' };
    const first = await executeEvent(node, { source: { kind: 'data', value: source }, entities: { kind: 'data', value: entities } });
    assert.equal(first.ok, true, JSON.stringify(first.error));
    assert.equal(first.outputs.out.value.length, 1);
    const retry = await executeEvent(node, { source: { kind: 'data', value: source }, entities: { kind: 'data', value: entities }, state: first.outputs.state });
    assert.equal(retry.ok, true, JSON.stringify(retry.error));
    assert.deepEqual(retry.outputs.out.value, []);
});
test('Prompted Memory targets the resolved holder and retains existing private memory identity', async () => {
    const normalized = normalizeOccurrences(source,candidates.slice(0,1),entities);
    const confirmed = confirmOccurrences(normalized.data.events,[{eventId:normalized.data.events[0].eventId,accepted:true}]);
    const holder = resolveItemHolders({'broken-wand-01':'mara'},confirmed.data.events).data.events[0];
    const scene = { sceneId:'scene-42',sourceId:'player-42',revision:'r1',actors:[{actorId:'mara',status:'present'}] };
    const presence = await executeEvent({operation:'scene-presence',actorId:'mara'},{in:{kind:'data',value:scene}});
    const result = await executeEvent({operation:'prompted-memory',actorId:'mara',mode:'recall',prompt:'What does holding the wand remind her of?'},
        {presence:presence.artifact,event:{kind:'data',value:holder}}, {
            actorContext: async () => ({ok:true,data:{scope:{actorId:'mara',sceneId:'scene-42'},visibility:'actor-private',context:{visibleScene:'She holds the wand.'},memories:[{memoryId:'memory-01',actorId:'mara',visibility:'actor-private',text:'Her mother repaired a wand by this fire.'}]}}),
            request: async options => { assert.equal(options.messages[1].content.includes('memory-01'),true);return {ok:true,data:{text:JSON.stringify({kind:'recalled',memoryId:'memory-01',reflection:'The hearth feels familiar.'}),finish:'stop'}}; },
        });
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.equal(result.artifact.value.memory.memoryId,'memory-01');
    assert.equal(result.artifact.value.memory.text,'Her mother repaired a wand by this fire.');
    assert.equal(result.artifact.value.actorId,'mara');
    assert.equal(result.artifact.value.visibility,'actor-private');
    assert.equal(result.artifact.value.acceptance,'pending');
});
test('private actor scope mismatches fail before a model request', async () => {
    const scene = {sceneId:'scene-42',sourceId:'draft-42',revision:'r1',actors:[{actorId:'mara',status:'present'}]};
    const presence = await executeEvent({operation:'scene-presence',actorId:'mara'},{in:{kind:'data',value:scene}});
    let calls=0;
    const result = await executeEvent({operation:'character-direction',actorId:'mara'}, {presence:presence.artifact}, {
        actorContext:async()=>({ok:true,data:{scope:{actorId:'elias',sceneId:'scene-42'},visibility:'actor-private',context:{secret:'Elias fears water.'}}}),
        request:async()=>{calls++;return {ok:true,data:{text:'Secret',finish:'stop'}};},
    });
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'ACTOR_SCOPE_MISMATCH');
    assert.equal(calls,0);
});
test('new memory creation requires authored permission and stays a pending private proposal', async () => {
    const normalized=normalizeOccurrences(source,candidates.slice(0,1),entities);
    const confirmed=confirmOccurrences(normalized.data.events,[{eventId:normalized.data.events[0].eventId,accepted:true}]);
    const event=resolveItemHolders({'broken-wand-01':'mara'},confirmed.data.events).data.events[0];
    const presence={kind:'data',value:{schemaVersion:1,recordType:'scene-presence',sceneId:'scene-42',sourceId:'player-42',revision:'r1',actorId:'mara',status:'present'}};
    let calls=0;
    const execution={actorContext:async()=>({ok:true,data:{scope:{actorId:'mara',sceneId:'scene-42'},visibility:'actor-private',context:{},memories:[]}}),request:async()=>{calls++;return {ok:true,data:{text:JSON.stringify({kind:'invented',text:'Mara recalls a childhood storm.'}),finish:'stop'}};}};
    const denied=await executeEvent({operation:'prompted-memory',actorId:'mara',mode:'create',allowCreate:false,prompt:'Create a childhood memory.'},{presence,event:{kind:'data',value:event}},execution);
    assert.equal(denied.ok,false);
    assert.equal(denied.error.code,'MEMORY_CREATION_NOT_ALLOWED');
    assert.equal(calls,0);
    const allowed=await executeEvent({operation:'prompted-memory',actorId:'mara',mode:'create',allowCreate:true,prompt:'Create a childhood memory.'},{presence,event:{kind:'data',value:event}},execution);
    assert.equal(allowed.ok,true,JSON.stringify(allowed.error));
    assert.equal(allowed.artifact.value.memory.classification,'invented');
    assert.equal(allowed.artifact.value.acceptance,'pending');
    assert.equal(calls,1);
});
test('actor context capture cannot conceal a source mutation before transmission', async () => {
    const inputs={presence:{kind:'data',value:{schemaVersion:1,recordType:'scene-presence',sceneId:'scene-42',sourceId:'player-42',revision:'r1',actorId:'mara',status:'present'}}};
    let calls=0;
    const result=await executeEvent({operation:'character-direction',actorId:'mara'},inputs,{
        actorContext:async()=>{inputs.presence.value.revision='r2';return {ok:true,data:{scope:{actorId:'mara',sceneId:'scene-42'},visibility:'actor-private',context:{}}};},
        request:async()=>{calls++;return {ok:true,data:{text:'A line.',finish:'stop'}};},
    });
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'STALE_INPUT');
    assert.equal(calls,0);
});
test('literal item aliases preserve punctuation and Unicode word boundaries', () => {
    const watched={...source,text:'wand(+) / xwand(+) / wand(+) / Élan / préÉlan / Élan'};
    const punctuation=matchLiteralTrigger(watched,{aliases:['wand(+)'],itemId:'broken-wand-01',actorId:'mara',activation:'per-occurrence',watch:'player-message'},entities);
    assert.equal(punctuation.ok,true,JSON.stringify(punctuation.error));
    assert.equal(punctuation.data.events.length,2);
    assert.deepEqual(punctuation.data.events.map(event=>event.evidence.text),['wand(+)','wand(+)']);
    const unicode=matchLiteralTrigger(watched,{aliases:['Élan'],itemId:'broken-wand-01',actorId:'mara',activation:'per-occurrence',watch:'player-message'},entities);
    assert.equal(unicode.ok,true,JSON.stringify(unicode.error));
    assert.equal(unicode.data.events.length,2);
});
test('holder folding holds overlapping transfer and use positions instead of guessing order', () => {
    const overlap=[{...candidates[0],position:span('Mara casts the broken wand at the lock.')},{...candidates[1],position:span('Mara casts the broken wand at the lock.')}];
    const normalized=normalizeOccurrences(source,overlap,entities);
    const confirmed=confirmOccurrences(normalized.data.events,normalized.data.events.map(event=>({eventId:event.eventId,accepted:true})));
    const result=resolveItemHolders({'broken-wand-01':'mara'},confirmed.data.events);
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'EVENT_ORDER');
});
test('progression conversion retains occurrence identity and works with bounded progression IDs', async () => {
    const longSource={...source,sourceId:'s'.repeat(256),revision:'r'.repeat(256),sceneId:'c'.repeat(256)};
    const normalized=normalizeOccurrences(longSource,candidates.slice(0,1),entities);
    const confirmed=confirmOccurrences(normalized.data.events,[{eventId:normalized.data.events[0].eventId,accepted:true}]);
    const result=await toProgressionEvents(confirmed.data.events);
    assert.equal(result.ok,true,JSON.stringify(result.error));
    const event=result.data.events[0];
    assert.equal(event.eventId.length<=256,true);
    assert.equal(event.identity.occurrenceId.length<=256,true); assert.equal(event.evidence.occurrenceId,confirmed.data.events[0].eventId);
    assert.equal(event.subjectId,'mara');
    assert.equal(event.status,'confirmed');
    const applied=applyProgressionEvents({values:[{key:'wand-uses',value:0}],ledger:[]},result.data.events,{ruleSetId:'wand',revision:1,rules:[{ruleId:'use',eventType:'item-used',targetKey:'wand-uses',identityFields:['occurrenceId'],mode:'add',amount:1,min:0,max:100}]});
    assert.equal(applied.ok,true,JSON.stringify(applied.error));
    assert.equal(applied.data.state.values[0].value,1);
});
test('Draft event evidence excludes appended presentation and keeps the story body revision', () => {
    const draft={kind:'draft',text:'Mara stores the wand.',source:{originalText:'Mara stores the wand.'}};
    const appended=appendDraftSections(draft,[{id:'notes',text:'A remembered note: Mara casts the broken wand.'}],{nodeId:'append-notes'});
    assert.equal(appended.ok,true,JSON.stringify(appended.error));
    const eventSource=sourceFromDraft(appended.data.draft,{sourceId:'draft-42',revision:'native-r1',sceneId:'scene-42',visibility:'public'});
    assert.equal(eventSource.ok,true,JSON.stringify(eventSource.error));
    assert.equal(eventSource.data.source.text,'Mara stores the wand.');
    assert.equal(eventSource.data.source.watch,'draft');
    const matched=matchLiteralTrigger(eventSource.data.source,{aliases:['broken wand'],itemId:'broken-wand-01',actorId:'mara',activation:'per-occurrence',watch:'draft'},entities);
    assert.equal(matched.ok,true,JSON.stringify(matched.error));
    assert.deepEqual(matched.data.events,[]);
});
test('generic event normalization can adapt an authored scene-action type for relationship rules', async () => {
    const source2={...source,text:'Mara kisses Elias by the harbor.'};
    const candidate={eventType:'scene-action',actorId:'mara',objectId:'elias',position:{start:0,end:source2.text.length},semantics:'actual'};
    const pending=await executeEvent({operation:'event-normalize',mode:'candidates'},{source:{kind:'data',value:source2},entities:{kind:'data',value:entities},candidates:{kind:'data',value:[candidate]}});
    assert.equal(pending.ok,true,JSON.stringify(pending.error));
    const confirmed=confirmOccurrences(pending.artifact.value,[{eventId:pending.artifact.value[0].eventId,accepted:true}]);
    const adapted=await executeEvent({operation:'event-normalize',mode:'progression',eventType:'kiss',absoluteMinute:120},{events:{kind:'data',value:confirmed.data.events}});
    assert.equal(adapted.ok,true,JSON.stringify(adapted.error));
    assert.equal(adapted.artifact.value[0].eventType,'kiss');
    assert.equal(adapted.artifact.value[0].subjectId,'mara');
    assert.equal(adapted.artifact.value[0].objectId,'elias');
    assert.equal(adapted.artifact.value[0].absoluteMinute,120);
});
test('Draft Event Source node exposes body-only evidence from an authenticated assembled Draft', async () => {
    const draft={kind:'draft',text:'Mara stores the wand.',source:{originalText:'Mara stores the wand.'}};
    const appended=appendDraftSections(draft,[{id:'notes',text:'Mara casts the broken wand.'}],{nodeId:'append-notes'});
    const described=describeEvent({operation:'draft-event-source'},{phase:'post'});
    assert.equal(described.ok,true,JSON.stringify(described.error));
    assert.equal(described.data.ports[0].kind,'draft');
    const result=await executeEvent({operation:'draft-event-source'},{in:appended.data.draft,scope:{kind:'data',value:{sourceId:'draft-42',revision:'native-r1',sceneId:'scene-42',visibility:'public'}}},{phase:'post'});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.equal(result.artifact.value.text,'Mara stores the wand.');
});
test('transport failures and unverified completions never become negative event judgments', async () => {
    const node={operation:'item-use-trigger',mode:'extract',watch:'player-message',itemId:'broken-wand-01'};
    const inputs={source:{kind:'data',value:source},entities:{kind:'data',value:entities}};
    const failed=await executeEvent(node,inputs,{request:async()=>({ok:false,error:{code:'HTTP_ERROR',message:'Provider unavailable'}})});
    assert.equal(failed.ok,false);assert.equal(failed.error.code,'HTTP_ERROR');assert.equal(failed.artifact,undefined);
    const incomplete=await executeEvent(node,inputs,{request:async()=>({ok:true,data:{text:'{"candidates":[]}',finish:'length'}})});
    assert.equal(incomplete.ok,false);assert.equal(incomplete.error.code,'TRUNCATED_OUTPUT');
});
test('direct confirmed records require a checked affirmative interpretation and actual event semantics', () => {
    const normalized=normalizeOccurrences(source,candidates.slice(0,1),entities);
    const fake={...normalized.data.events[0],status:'confirmed'};
    assert.equal(resolveItemHolders({'broken-wand-01':'mara'},[fake]).ok,false);
    const recalled={...fake,semantics:'recalled',confirmation:{accepted:true}};
    assert.equal(resolveItemHolders({'broken-wand-01':'mara'},[recalled]).ok,false);
});
test('getter metadata in a direct descriptor cannot silently change the effective phase', () => {
    let reads=0;
    const result=describeEvent({operation:'scene-presence',actorId:'mara',get phase(){reads++;return 'post';}},{phase:'pre'});
    assert.equal(result.ok,false);
    assert.equal(reads,0);
});
test('successful holder projections stay within the portable JSON byte limit', () => {
    const actor='a'.repeat(256),item='i'.repeat(256),sentence='x'.repeat(1250);
    for(let count=50;count<=66;count++) {
        const source2={sourceId:'s'.repeat(256),revision:'r'.repeat(256),sceneId:'c'.repeat(256),watch:'player-message',visibility:'public',text:Array(count).fill(sentence).join(' ')};
        const candidates2=Array.from({length:count},(_,index)=>({eventType:'item-used',actorId:actor,itemId:item,position:{start:index*1251,end:index*1251+1250},semantics:'actual'}));
        const pending=normalizeOccurrences(source2,candidates2,{actorIds:[actor],itemIds:[item]});if(!pending.ok)continue;
        const confirmed=confirmOccurrences(pending.data.events,pending.data.events.map(event=>({eventId:event.eventId,accepted:true})));if(!confirmed.ok)continue;
        const held=resolveItemHolders({[item]:actor},confirmed.data.events);
        if(held.ok)assert.equal(new TextEncoder().encode(JSON.stringify(held.data)).byteLength<=262144,true,'Oversized holder projection escaped bounds');
    }
});
test('random and collection descriptors also reject accessor phase metadata', () => {
    for(const [describe,operation] of [[describeRandom,'random-pick'],[describeCollection,'collection']]) {
        let reads=0;
        const result=describe({operation,get phase(){reads++;return 'post';}},{phase:'pre'});
        assert.equal(result.ok,false);
        assert.equal(reads,0);
    }
});
test('single-gate confirmation uses explicit gate acceptance and never truthiness of a probability', async () => {
    const normalized=normalizeOccurrences(source,candidates.slice(0,1),entities);
    const inputs={events:{kind:'data',value:normalized.data.events}};
    const probability=await executeEvent({operation:'confirm-events',mode:'single-gate'},{...inputs,decisions:{kind:'data',value:{answers:{actualUse:{type:'noul',noul:0.99}}}}});
    assert.equal(probability.ok,true,JSON.stringify(probability.error));
    assert.equal(probability.outputStates.out.status,'unresolved');
    const accepted=await executeEvent({operation:'confirm-events',mode:'single-gate'},{...inputs,decisions:{kind:'data',value:{accepted:true,metric:0.99,decision:{answers:{actualUse:{type:'noul',noul:0.99}}}}}});
    assert.equal(accepted.ok,true,JSON.stringify(accepted.error));
    assert.equal(accepted.artifact.value[0].eventId,normalized.data.events[0].eventId);
    assert.equal(accepted.artifact.value[0].actorId,'mara');
    const rejected=await executeEvent({operation:'confirm-events',mode:'single-gate'},{...inputs,decisions:{kind:'data',value:{accepted:false,metric:0.01}}});
    assert.equal(rejected.ok,true,JSON.stringify(rejected.error));
    assert.deepEqual(rejected.artifact.value,[]);
});
test('literal trigger state never emits an activation ID outside its replay bounds', () => {
    const longId='\\'.repeat(256);
    const longSource={sourceId:longId,revision:longId,sceneId:longId,watch:'player-message',text:'wand',visibility:'public'};
    const longEntities={actorIds:[longId],itemIds:[longId]};
    for(const activation of ['per-occurrence','once-per-source','edge-once']) {
        const settings={aliases:['wand'],itemId:longId,actorId:longId,activation,watch:'player-message'};
        const first=matchLiteralTrigger(longSource,settings,longEntities);
        assert.equal(first.ok,false,'Oversized activation IDs must fail before being emitted.');
        assert.equal(first.error.code,'TRIGGER_STATE_LIMIT');
        assert.equal(first.data,undefined);
    }
});

test('literal word boundaries inspect supplementary Unicode code points on both sides', () => {
    const settings={aliases:['wand'],itemId:'broken-wand-01',actorId:'mara',activation:'per-occurrence',watch:'player-message'};
    const adjacent=matchLiteralTrigger({...source,text:'𐐀wand wand𐐀 / wand'},settings,entities);
    assert.equal(adjacent.ok,true,JSON.stringify(adjacent.error));
    assert.equal(adjacent.data.events.length,1);
    assert.equal(adjacent.data.events[0].evidence.text,'wand');
    const supplementary=matchLiteralTrigger({...source,text:'a𐐀 𐐀a / 𐐀'},{...settings,aliases:['𐐀']},entities);
    assert.equal(supplementary.ok,true,JSON.stringify(supplementary.error));
    assert.equal(supplementary.data.events.length,1);
    assert.equal(supplementary.data.events[0].evidence.text,'𐐀');
});
test('Character Direction optional Data is included with the same actor context in its single request',async()=>{
    const node={operation:'character-direction',actorId:'mara',systemPrompt:'Let projected trust shape Mara’s manner.'};
    const descriptor=describeEvent(node);assert.equal(descriptor.ok,true,JSON.stringify(descriptor.error));
    assert.deepEqual(descriptor.data.ports.filter(port=>port.direction==='input').map(port=>[port.id,port.kind,port.required]),[['presence','data',true],['data','data',false]]);
    const presence={kind:'data',value:{schemaVersion:1,recordType:'scene-presence',sceneId:'scene-42',sourceId:'scene-source',revision:'r1',actorId:'mara',status:'present'}};
    const projected={kind:'data',value:{trust:.85,affection:.75}};let reads=0,calls=0;
    const result=await executeEvent(node,{presence,data:projected},{actorContext(actorId,request,exactPresence){reads++;assert.equal(exactPresence,presence);assert.equal(request.data,projected);return {ok:true,data:{scope:{actorId,sceneId:'scene-42'},visibility:'actor-private',context:{privateFeeling:'Mara fears the sea.'},memories:[]}};},request:async request=>{calls++;const payload=JSON.parse(request.messages[1].content);assert.deepEqual(payload.data,{trust:.85,affection:.75});assert.equal(payload.scope.actorId,'mara');assert.equal(payload.context.privateFeeling,'Mara fears the sea.');assert.ok(request.messages[0].content.includes('projected trust'));return {ok:true,data:{text:'Mara softens her wary manner.',finish:'stop'}};}});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(reads,1);assert.equal(calls,1);assert.equal(result.artifact.text,'Mara softens her wary manner.');assert.equal(result.artifact.visibility,'actor-private');assert.equal(result.artifact.acceptance,'pending');assert.equal(result.artifact.scope.actorId,'mara');assert.equal(result.reports[0].actualCalls,1);
});

for(const [name,value,visibility]of [
    ['hidden',{secret:'hidden'},{kind:'hidden'}],
    ['mixed actors',[{visibility:'actor-private',actorId:'mara',secret:'sea'},{visibility:'actor-private',actorId:'elias',secret:'fire'}],{kind:'public'}],
    ['another actor',{secret:'fire'},{kind:'actor-private',actorId:'elias'}],
])test('Character Direction rejects '+name+' Data before actor or model dispatch',async()=>{
    const presence={kind:'data',value:{schemaVersion:1,recordType:'scene-presence',sceneId:'scene-42',sourceId:'scene-source',revision:'r1',actorId:'mara',status:'present'}};let reads=0,calls=0;
    const result=await executeEvent({operation:'character-direction',actorId:'mara'},{presence,data:{kind:'data',value,visibility}},{actorContext(){reads++;throw Error('unsafe actor dispatch');},request:async()=>{calls++;throw Error('unsafe model dispatch');}});
    assert.equal(result.ok,false);assert.equal(result.error.code,'ACTOR_MODEL_SCOPE');assert.equal(reads,0);assert.equal(calls,0);assert.equal(result.artifact,undefined);
});

test('Character Direction optional Data respects absent actors and both input freshness checks',async()=>{
    const node={operation:'character-direction',actorId:'mara'},base={schemaVersion:1,recordType:'scene-presence',sceneId:'scene-42',sourceId:'scene-source',revision:'r1',actorId:'mara'};
    let reads=0,calls=0;const absent=await executeEvent(node,{presence:{kind:'data',value:{...base,status:'absent'}},data:{kind:'data',value:{trust:.85}}},{actorContext(){reads++;throw Error('absent');},request:async()=>{calls++;throw Error('absent');}});
    assert.equal(absent.ok,true,JSON.stringify(absent.error));assert.equal(absent.outputStates.out.status,'skipped');assert.equal(reads,0);assert.equal(calls,0);
    for(const changedDuring of ['context','model']){
        const inputs={presence:{kind:'data',value:{...base,status:'present'}},data:{kind:'data',value:{trust:.85}}};calls=0;
        const result=await executeEvent(node,inputs,{actorContext(){if(changedDuring==='context')inputs.data.value.trust=.1;return {ok:true,data:{scope:{actorId:'mara',sceneId:'scene-42'},visibility:'actor-private',context:{}}};},request:async()=>{calls++;inputs.data.value.trust=.1;return {ok:true,data:{text:'Changed trust.',finish:'stop'}};}});
        assert.equal(result.ok,false,changedDuring);assert.equal(result.error.code,'STALE_INPUT',changedDuring);assert.equal(result.artifact,undefined);assert.equal(calls,changedDuring==='context'?0:1);
    }
});

test('Character Direction admits the genuine private State projection envelope without stripping proposal metadata',async()=>{
 const {executeProgressionState}=await import('../src/workflow/operations/progression-nodes.js');
 const actorId='mara',presence={kind:'data',value:{schemaVersion:1,recordType:'scene-presence',sceneId:'scene-42',sourceId:'scene-source',revision:'r1',actorId,status:'present'}};
 const projected=await executeProgressionState({mode:'progression'},{state:{kind:'data',value:{values:[{key:'trust',value:.5,min:0,max:1,subjectId:actorId,actorId,visibility:'actor-private'}],ledger:[]}},events:{kind:'data',value:[]},rules:{kind:'data',value:{ruleSetId:'relationship-rules',revision:1,rules:[]}}});
 assert.equal(projected.ok,true,JSON.stringify(projected.error));let calls=0;
 const result=await executeEvent({operation:'character-direction',actorId},{presence,data:projected.artifact},{actorContext(selected,request){assert.equal(request.data,projected.artifact);assert.equal(request.data.status,'proposed');assert.equal(request.data.acceptance,'pending');return {ok:true,data:{scope:{actorId:selected,sceneId:'scene-42'},visibility:'actor-private',context:{}}};},request:async request=>{calls++;assert.equal(JSON.parse(request.messages[1].content).data.values[0].value,.5);return {ok:true,data:{text:'Mara remains careful.',finish:'stop'}};}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(calls,1);assert.equal(result.artifact.acceptance,'pending');assert.equal(result.artifact.scope.actorId,actorId);
 for(const metadata of [{status:'committed'},{acceptance:'accepted'},{authority:'authored-grant'}]){
  let reads=0;const denied=await executeEvent({operation:'character-direction',actorId},{presence,data:{...projected.artifact,...metadata}},{actorContext(){reads++;throw Error('invalid metadata');}});
  assert.equal(denied.ok,false);assert.equal(denied.error.code,'INVALID_INPUT');assert.equal(reads,0);
 }
});
