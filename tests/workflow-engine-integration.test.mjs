import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkflow } from '../src/workflow/runtime.js';
import { describeOperation, operationDefaults } from '../src/workflow/catalog.js';
import { expandRecordAddress } from '../src/workflow/record-data.js';
const node=(id,operation,settings={})=>({id,type:'workflow',operation,...settings});
const wire=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
const graph=(nodes,wires=[])=>({id:'engine-integration',schema:3,runtime:2,mode:'native-unified',nodes,wires:Object.fromEntries(wires.map(edge=>[edge.id,edge])),definitions:{},portals:{}});
const target=(nodeId)=>({workflowId:'engine-integration',instancePath:[],nodeId,portId:'out'});
const row=(result,id)=>result.recording.units.find(unit=>expandRecordAddress(result.recording,unit.address).nodeId===id);
const output=(result,id)=>{const unit=row(result,id),pin=unit.ports.find(pin=>pin.direction==='output'&&result.recording.identities.strings[pin.port]==='out');return result.recording.artifacts[pin.artifact].value;};

test('Decision is editable through the real catalog and executes on its own text binding',async()=>{
    const root=graph({source:node('source','compose',{sections:[{name:'scene',text:'Mira kissed Elias.'}]}),decision:node('decision','decision',{inputKind:'text',questions:{kiss:{type:'noul',instructions:'Did Mira kiss Elias in this scene?'}}})},[wire('scene','source','out','decision','in')]);
    const described=describeOperation(root,root.nodes.decision);assert.equal(described.ok,true,JSON.stringify(described.error));
    assert.equal(operationDefaults('decision').operation,'decision');assert.equal(described.data.descriptor.requestCapability,'text-completion');
    const binding={profileId:'decision-model',model:'separate-model'};let calls=0;
    const result=await runWorkflow(root,{target:target('decision'),resolveBinding:async()=>({ok:true,data:binding}),countTokens:async()=>({tokens:12}),request:async request=>{assert.equal(request.binding,binding);calls++;return {ok:true,data:{text:JSON.stringify({answers:{kiss:{type:'noul',accepted:true}}}),finish:'stop',usage:{outputTokens:7}}};}});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(calls,1);assert.equal(result.actualCalls,1);assert.equal(result.callBound,1);
    assert.equal(output(result,'decision').value.answers.kiss.accepted,true);assert.equal(row(result,'decision').request.status,'completed');
});



test('Decision request failure records one attempt without starting another transport',async()=>{
    const root=graph({source:node('source','compose',{sections:[{name:'scene',text:'Mira kissed Elias.'}]}),decision:node('decision','decision',{inputKind:'text',profileId:'independent-text',questions:{kiss:{type:'noul',instructions:'Did Mira kiss Elias?'}}})},[wire('scene','source','out','decision','in')]);
    const binding={model:'other-model',profileId:'independent-text'},events=[],order=[];
    const result=await runWorkflow(root,{target:target('decision'),onEvent:event=>events.push(event),resolveBinding:async selected=>{order.push('bind');assert.equal(selected.profileId,'independent-text');assert.equal(selected.modelRole,'decision');return {ok:true,data:binding};},countTokens:async()=>({tokens:10}),request:async options=>{order.push('text');assert.equal(options.binding,binding);return {ok:false,error:{code:'RATE_LIMITED',message:'Retry later'}};}});
    assert.equal(result.ok,false);assert.equal(result.error.code,'RATE_LIMITED');assert.equal(result.callBound,1);assert.equal(result.actualCalls,1);assert.deepEqual(order,['bind','text']);
    assert.deepEqual(events.filter(event=>event.type==='request-start').map(event=>[event.attempt,event.capability]),[[1,'text-completion']]);
    assert.equal(row(result,'decision').request.status,'failed');
});

test('malformed or cancelled Decision responses fail instead of becoming No',async()=>{
    const root=graph({source:node('source','compose',{sections:[{name:'scene',text:'Mira kissed Elias.'}]}),decision:node('decision','decision',{inputKind:'text'})},[wire('scene','source','out','decision','in')]);
    const ports={target:target('decision'),resolveBinding:async()=>({ok:true,data:{profileId:'text',model:'decision-model'}}),countTokens:async()=>({tokens:1}),request:async()=>({ok:true,data:{text:'{"answers":{"decision":{"type":"noul","accepted":2}}}',finish:'stop'}})};
    const malformed=await runWorkflow(root,ports);assert.equal(malformed.error.code,'INVALID_DECISION_OUTPUT');assert.equal(malformed.actualCalls,1);assert.equal(row(malformed,'decision').status,'failed');
    const controller=new AbortController();const cancelled=await runWorkflow(root,{...ports,signal:controller.signal,request:async()=>{controller.abort();return {ok:true,data:{text:'{"answers":{"decision":{"type":"noul","accepted":true}}}',finish:'stop'}};}});
    assert.equal(cancelled.error.code,'ABORTED');assert.equal(cancelled.recording.status,'cancelled');assert.equal(cancelled.actualCalls,1);
});

test('Condition compares structured arrays with numeric and Boolean entries through graph admission',async()=>{
    const root=graph({text:node('text','text',{text:'{"values":[1,true,null,{"k":"x"}]}'}),data:node('data','json-decode'),condition:node('condition','condition',{path:['values'],value:[1,true,null,{k:'x'}]})},[wire('a','text','out','data','in'),wire('b','data','out','condition','in')]);
    const result=await runWorkflow(root,{target:target('condition')});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(output(result,'condition').value.accepted,true);
});

test('Model Call produces schema-checked Data through the real named workflow ports',async()=>{
    const root=graph({prompt:node('prompt','text',{text:'Invent a wand effect.'}),model:node('model','model-call',{outputKind:'data',schema:'{"type":"object","required":["effect"],"properties":{"effect":{"type":"string"}},"additionalProperties":false}'})},[wire('prompt','prompt','out','model','prompt')]);
    const result=await runWorkflow(root,{target:target('model'),resolveBinding:async()=>({ok:true,data:{profileId:'wild-author'}}),countTokens:async()=>({tokens:5}),request:async()=>({ok:true,data:{text:'{"effect":"paper moths"}',finish:'stop'}})});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(output(result,'model').value,{effect:'paper moths'});assert.equal(result.actualCalls,1);
});

test('revised Draft authority survives Branch and Join before legacy final validation',async()=>{
    const root=graph({source:node('source','reply-snapshot'),revise:node('revise','revise-draft',{scope:'whole'}),literal:node('literal','text',{text:'{"accepted":false}'}),decision:node('decision','json-decode'),branch:node('branch','branch',{artifactKind:'draft'}),optional:node('optional','revise-draft',{scope:'whole'}),join:node('join','join',{artifactKind:'draft'}),scan:node('scan','repair',{mode:'scan'}),final:node('final','validate-patches')},[wire('a','source','out','revise','draft'),wire('b','literal','out','decision','in'),wire('c','decision','out','branch','condition'),wire('d','revise','out','branch','in'),wire('e','branch','yes','optional','draft'),wire('f','revise','out','join','base'),wire('g','optional','out','join','optional'),wire('h','join','out','scan','in'),wire('i','scan','out','final','in')]);
    let calls=0,bindings=0;const result=await runWorkflow(root,{target:target('final'),snapshot:async()=>({kind:'draft',text:'Original prose.',source:{originalText:'Original prose.',chatId:'Story-2'}}),resolveBinding:async()=>{bindings++;return {ok:true,data:{profileId:'revision'}};},countTokens:async()=>({tokens:5}),request:async()=>{calls++;return {ok:true,data:{text:'First prose.',finish:'stop'}};}});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(calls,1);assert.equal(bindings,1);assert.equal(row(result,'optional').status,'skipped');
    assert.equal(output(result,'final').original,'Original prose.');assert.equal(output(result,'final').text,'First prose.');
});

test('empty Enrich finishes without resolving or calling a model connection', async () => {
    const root = graph({ literal: node('literal', 'text', { text: '{"type":"extracted-records","records":[],"sourceRefs":[]}' }), data: node('data', 'json-decode'), enrich: node('enrich', 'enrich') }, [wire('a', 'literal', 'out', 'data', 'in'), wire('b', 'data', 'out', 'enrich', 'data')]);
    let bindings = 0, calls = 0;
    const result = await runWorkflow(root, { target: target('enrich'), resolveBinding: async () => { bindings++; return { ok: false, error: { code: 'BINDING_MISSING', message: 'No selected model' } }; }, request: async () => { calls++; throw new Error('Empty records need no call'); } });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(bindings, 0); assert.equal(calls, 0); assert.equal(result.actualCalls, 0); assert.deepEqual(output(result, 'enrich').value.records, []);
});

test('extracted notes append to the Draft while the story-body output excludes the dropdown', async () => {
    const root = graph({ source: node('source', 'reply-snapshot'), extract: node('extract', 'extract', { mode: 'literal', patterns: [{ id: 'wand', literal: 'broken wand', label: 'Broken wand' }] }), render: node('render', 'render-notes'), append: node('append', 'append'), body: node('body', 'draft-text') }, [wire('a', 'source', 'out', 'extract', 'source'), wire('b', 'extract', 'out', 'render', 'data'), wire('c', 'source', 'out', 'append', 'draft'), wire('d', 'render', 'out', 'append', 'section'), wire('e', 'append', 'out', 'body', 'draft')]);
    const result = await runWorkflow(root, { target: target('body'), snapshot: async () => ({ kind: 'draft', text: 'She raised the broken wand.', source: { originalText: 'She raised the broken wand.', chatId: 'Story-2' } }) });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.actualCalls, 0); assert.match(output(result, 'append').text, /<details>/); assert.match(output(result, 'append').text, /Broken wand/); assert.equal(output(result, 'body').text, 'She raised the broken wand.');
});

test('unavailable Decision binding reports zero transmitted calls', async () => {
    const root = graph({ source: node('source', 'text', { text: 'Mira kissed Elias.' }), decision: node('decision', 'decision', { inputKind: 'text', profileId: 'missing' }) }, [wire('a', 'source', 'out', 'decision', 'in')]);
    let bindings = 0, calls = 0, tokenizations = 0;
    const result = await runWorkflow(root, { target: target('decision'), resolveBinding: async () => { bindings++; return { ok: false, error: { code: 'BINDING_MISSING', message: 'Profile unavailable' } }; }, countTokens: async () => { tokenizations++; return { tokens: 5 }; }, request: async () => { calls++; return { ok: true, data: { text: '{}', finish: 'stop' } }; } });
    assert.equal(result.ok, false); assert.equal(result.error.code, 'BINDING_MISSING'); assert.equal(bindings, 1); assert.equal(calls, 0); assert.equal(tokenizations, 0); assert.equal(result.actualCalls, 0);
});

test('host settlement retains the ordinary Decision binding and records its completion connection', async () => {
    const { runWorkflowForHost } = await import('../src/workflow/runtime.js');
    const root = graph({ source: node('source', 'text', { text: 'A kiss.' }), decision: node('decision', 'decision', { inputKind: 'text', profileId: 'decision-text' }) }, [wire('a', 'source', 'out', 'decision', 'in')]);
    const binding = { profileId: 'decision-text', model: 'separate-model' }; let retained;
    const ports = { resolveBinding: async () => ({ ok: true, data: binding }), countTokens: async () => ({ tokens: 5 }), request: async () => ({ ok: true, data: { text: '{"answers":{"decision":{"type":"noul","accepted":true}}}', finish: 'stop' } }) };
    const hooks = { settle: async value => { retained = value.bindings; return { ok: true }; } };
    const result = await runWorkflowForHost(root, ports, hooks); assert.equal(result.error.code, 'MISSING_RUN_TARGETS');
    const targeted = await runWorkflowForHost(root, { ...ports, target: target('decision') }, hooks);
    assert.equal(targeted.ok, true, JSON.stringify(targeted.error)); assert.deepEqual(retained.map(item => [item.binding, item.capability, item.role]), [[binding, 'text-completion', 'decision']]); assert.equal(retained[0].binding,binding); assert.equal(row(targeted, 'decision').binding.profileId, 'decision-text'); assert.equal(row(targeted, 'decision').binding.model, 'separate-model'); assert.equal(row(targeted, 'decision').binding.capability, 'text-completion'); assert.equal(output(targeted, 'decision').value.actualCalls, 1);
});

for (const phase of ['pre', 'post']) test('ordinary Decision target preserves its authored ' + phase + ' stage', async () => {
    const root = graph({ source: node('source', 'text', { text: 'A kiss.',phase }), decision: node('decision', 'decision', { inputKind: 'text', profileId: 'decision-text',phase }) }, [wire('a', 'source', 'out', 'decision', 'in')]);
    let bindings = 0;
    const result = await runWorkflow(root, { target: target('decision'), resolveBinding: async () => { bindings++; return { ok: true, data: { profileId: 'decision-text' } }; }, countTokens: async () => ({ tokens: 4 }), request: async () => ({ ok: true, data: { text: '{"answers":{"decision":{"type":"noul","accepted":true}}}', finish: 'stop' } }) });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(bindings, 1); assert.equal(result.actualCalls, 1); assert.equal(output(result, 'decision').value.actualCalls, 1);
});

test('retired Fast Decision is unavailable in the catalog and rejects execution before effects',async()=>{
    const root=graph({source:node('source','text',{text:'Scene'}),retired:node('retired','fast-decision',{inputKind:'text'})},[wire('scene','source','out','retired','in')]);
    assert.throws(()=>operationDefaults('fast-decision'),/Unknown workflow operation/);
    assert.equal(describeOperation(root,root.nodes.retired).ok,false);
    let effects=0;const effect=()=>{effects++;return {ok:true,data:{}};};
    const result=await runWorkflow(root,{target:target('retired'),resolveBinding:effect,countTokens:effect,request:effect,resolveFastBinding:effect,requestFastDecision:effect});
    assert.equal(result.ok,false);assert.equal(result.actualCalls,0);assert.equal(effects,0);
});
