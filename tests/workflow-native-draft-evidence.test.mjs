import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDraftRevision,appendDraftSections} from '../src/workflow/draft-revisions.js?v=0.27.2';
import {sourceFromDraft,normalizeOccurrences,confirmOccurrences} from '../src/workflow/operations/event-data.js?v=0.27.2';
import {validateNativeFileEvidence} from '../src/workflow/native-settlement.js?v=0.27.2';
const module=await import('../src/workflow/native-draft-evidence.js?v=0.27.2').catch(()=>({}));
const original={kind:'draft',text:'The sword killed Orr.',source:{token:'native-original',originalText:'The sword killed Orr.'}};
const revised=()=>createDraftRevision(original,'At dusk, the sword killed Orr.',{nodeId:'polish',scope:'whole'}).data.draft;
function capture(draft,registry){const scope={sourceId:'current-native',revision:'root',sceneId:'scene-2',visibility:'public'};const source=sourceFromDraft(draft,scope);assert.equal(source.ok,true);const artifact={kind:'data',value:source.data.source};const retained=registry.retain({draft,scope:{kind:'data',value:scope},source:artifact});return {retained,source:retained.ok?retained.data.source.value:artifact.value};}
function events(source){const start=source.text.indexOf('sword killed Orr');const normalized=normalizeOccurrences(source,[{eventType:'scene-action',actorId:'mara',itemId:'sword',objectId:'orr',position:{start,end:start+'sword killed Orr'.length},semantics:'actual'}],{actorIds:['mara','orr'],itemIds:['sword']});assert.equal(normalized.ok,true,JSON.stringify(normalized));return confirmOccurrences(normalized.data.events,[{eventId:normalized.data.events[0].eventId,accepted:true}]).data.events;}
function registry(extra={}){assert.equal(typeof module.createNativeDraftEvidenceRegistry,'function');const result=module.createNativeDraftEvidenceRegistry({getOriginalDraft:()=>original,isCurrent:()=>true,...extra});assert.equal(result.ok,true,JSON.stringify(result));return result.data;}
test('re-extracted final Draft evidence settles after prose changes its quoted offsets',()=>{
 const proof=registry(),draft=revised(),captured=capture(draft,proof);assert.equal(captured.retained.ok,true);const canonical=events(captured.source);
 assert.equal(validateNativeFileEvidence(canonical,draft.text,original.text).ok,false);
 assert.equal(validateNativeFileEvidence(canonical,draft.text,original.text,{draftEvidence:proof,finalDraft:draft}).ok,true);
 const final=appendDraftSections(draft,[{id:'notes',text:'The sword killed Someone Else.'}],{nodeId:'notes'}).data.draft;
 assert.equal(validateNativeFileEvidence(canonical,draft.text,original.text,{draftEvidence:proof,finalDraft:final}).ok,true);
});
test('prior evidence cannot follow another body revision or be restored by notes',()=>{
 const proof=registry(),draft=revised(),captured=capture(draft,proof),canonical=events(captured.source);
 const final=createDraftRevision(draft,'At dusk, the sword spared Orr.',{nodeId:'correction',scope:'whole'}).data.draft;
 const notes=appendDraftSections(final,[{id:'notes',text:draft.text}],{nodeId:'notes'}).data.draft;
 assert.equal(proof.validate(canonical,notes).ok,false);assert.equal(validateNativeFileEvidence(canonical,final.text,original.text,{draftEvidence:proof,finalDraft:notes}).ok,false);
});
test('detached registry, forged lineage and unrelated native source never grant proof',()=>{
 const proof=registry(),draft=revised(),captured=capture(draft,proof),canonical=events(captured.source);
 assert.equal(proof.retain({draft:structuredClone(draft),scope:{kind:'data',value:{sourceId:'current-native',revision:'root',sceneId:'scene-2',visibility:'public'}},source:{kind:'data',value:captured.source}}).ok,false);
 assert.equal(validateNativeFileEvidence(canonical,draft.text,original.text,{draftEvidence:{validate:()=>({ok:true})},finalDraft:draft}).ok,false);
 const other={kind:'draft',text:original.text,source:{...original.source,token:'another-native'}};
 assert.equal(capture(other,proof).retained.ok,false);
});
test('released or callback-revoked native source cannot capture or validate',()=>{
 let current=true;const proof=registry({isCurrent:()=>current,getOriginalDraft:()=>{current=false;return original;}});const draft=revised();assert.equal(capture(draft,proof).retained.ok,false);
 const live=registry(),captured=capture(draft,live);live.release();assert.equal(live.validate(events(captured.source),draft).ok,false);assert.equal(capture(draft,live).retained.ok,false);
});
test('source scope or text cannot be substituted after the authentic Draft is read',()=>{
 const proof=registry(),draft=revised(),scope={sourceId:'current-native',revision:'root',sceneId:'scene-2',visibility:'public'},source=sourceFromDraft(draft,scope).data.source;
 assert.equal(proof.retain({draft,scope:{kind:'data',value:scope},source:{kind:'data',value:{...source,text:'Forged scene.'}}}).ok,false);
});
import {runWorkflowForHost} from '../src/workflow/runtime.js?v=0.27.2';
function runtimeGraph(){const n=(id,operation,more={})=>({id,type:'workflow',operation,...more}),w=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});return {id:'evidence-runtime',schema:3,runtime:2,mode:'native-unified',nodes:{reply:n('reply','reply-snapshot'),revise:n('revise','revise-draft',{scope:'whole',instructions:'Polish prose.'}),scope:n('scope','text',{text:JSON.stringify({sourceId:'current-native',revision:'root',sceneId:'scene-2',visibility:'public'})}),decode:n('decode','json-decode'),source:n('source','draft-event-source')},wires:{a:w('a','reply','out','revise','draft'),b:w('b','revise','out','source','in'),c:w('c','scope','out','decode','in'),d:w('d','decode','out','source','scope')}};}
test('actual runtime retains private re-extraction proof after a real model revision',async()=>{
 const proof=registry();let calls=0,retains=0;
 const result=await runWorkflowForHost(runtimeGraph(),{target:{workflowId:'evidence-runtime',instancePath:[],nodeId:'source',portId:'out'},resolveBinding:()=>({ok:true,data:{profileId:'prose',model:'model'}}),countTokens:async()=>({tokens:1}),request:async()=>{calls++;return {ok:true,data:{text:'At dusk, the sword killed Orr.',finish:'stop'}};},retainDraftEventSource:input=>{retains++;return proof.retain(input);}},{executeHostOperation:()=>({ok:true,artifact:original})});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(calls,1);assert.equal(retains,1);assert.equal(JSON.stringify(result.recording).includes('draftEvidence'),false);
});
test('failed private evidence retention aborts the actual runtime before it exposes usable source output',async()=>{
 const result=await runWorkflowForHost(runtimeGraph(),{target:{workflowId:'evidence-runtime',instancePath:[],nodeId:'source',portId:'out'},resolveBinding:()=>({ok:true,data:{profileId:'prose',model:'model'}}),countTokens:async()=>({tokens:1}),request:async()=>({ok:true,data:{text:'At dusk, the sword killed Orr.',finish:'stop'}}),retainDraftEventSource:()=>({ok:true,data:{retained:false}})},{executeHostOperation:()=>({ok:true,artifact:original})});
 assert.equal(result.ok,false);assert.equal(result.error.code,'DRAFT_EVIDENCE_RETENTION_FAILED');
});
test('initial native bodies use trusted token identity instead of a reused authored revision',()=>{
 const first=registry(),one=capture(original,first);assert.equal(one.retained.ok,true);assert.equal(one.retained.data.source.value.revision,original.source.token);
 const other={kind:'draft',text:original.text,source:{...original.source,token:'later-identical-native'}};
 const second=registry({getOriginalDraft:()=>other}),two=capture(other,second);assert.equal(two.retained.ok,true);assert.notEqual(one.retained.data.source.value.revision,two.retained.data.source.value.revision);
 assert.notEqual(events(one.retained.data.source.value)[0].eventId,events(two.retained.data.source.value)[0].eventId);
});
