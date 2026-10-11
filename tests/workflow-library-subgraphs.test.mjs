import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { parseSubgraph, exportSubgraph, parseWorkflow, exportWorkflow } from '../src/workflow/packages.js';
import { computeDefinitionIdentity, definitionRefKey, validateDefinition } from '../src/workflow/definitions.js';
import { resolveWorkflow } from '../src/workflow/resolve.js';
import { runWorkflowForHost, runWorkflow } from '../src/workflow/runtime.js';
import { fixtureLibraryWorkflow } from './helpers/workflow-fixtures.mjs';
import { hostHarness, retained, unit } from './helpers/pattern-routing-fixtures.mjs';
import { operationFor } from '../src/workflow/catalog.js';
// Git core.autocrlf changes storage newlines, not package JSON content.
const canonicalFile = url => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');

assert.ok(existsSync(new URL('../src/workflow/library/subgraphs.js', import.meta.url)), 'portable library factory exists');
const { createLibrarySubgraph } = await import('../src/workflow/library/subgraphs.js');
const lens = createLibrarySubgraph('context-lens');
assert.equal(lens.ok, true);
const parsed = parseSubgraph(lens.data.json);
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.data.definition, lens.data.definition);
assert.equal(validateDefinition(parsed.data.definition, parsed.data.definitions).ok, true);
assert.equal(computeDefinitionIdentity(parsed.data.definition).data.semanticHash, parsed.data.definition.semanticHash);
assert.equal(JSON.stringify(exportSubgraph(parsed.data.definition, parsed.data.definitions), null, 2) + '\n', lens.data.json);
assert.deepEqual(lens.data.definition.interface.map(port => [port.id, port.kind]), [['context', 'context'], ['selected-context', 'context']]);
assert.equal(lens.data.definition.body.nodes.compact.method, 'select');
assert.deepEqual(lens.data.definition.parameters.map(parameter => parameter.id), ['targetTokens', 'keepRecent', 'pins', 'method', 'purpose', 'maxTokens']);
assert.ok(Object.values(lens.data.definition.body.nodes).every(node => !['scene-context', 'guidance'].includes(node.operation)));
console.log('workflow-library-subgraphs: Context Lens passed');

const library = await import('../src/workflow/library/subgraphs.js');
const scene = createLibrarySubgraph('scene-compass');
assert.equal(scene.ok, true, 'Scene Compass package exists');
const scenePackage = parseSubgraph(scene.data.json).data;
assert.deepEqual(Object.keys(scenePackage.definitions), [definitionRefKey(lens.data.definition)]);
assert.deepEqual(scenePackage.definition.body.nodes.lens.definition, { id: lens.data.definition.id, version: 1, semanticHash: lens.data.definition.semanticHash });
assert.equal(scenePackage.definition.body.definitions, undefined, 'closure remains flat outside bodies');
assert.equal(computeDefinitionIdentity(scenePackage.definition).data.semanticHash, scenePackage.definition.semanticHash);
assert.ok(scenePackage.definition.parameters.some(parameter => parameter.target.instancePath[0] === 'lens'));
assert.match(scenePackage.definition.body.nodes.plan.instructions, /user agency/i);
const sceneRoot = fixtureLibraryWorkflow('scene-compass');
assert.equal(sceneRoot.ok, true);
assert.equal(resolveWorkflow(sceneRoot.data.graph).data.callBound, 1);
assert.equal(library.createLibraryWorkflow, undefined, 'production root wrappers are retired');
const sceneBefore = JSON.stringify(sceneRoot.data.graph);
const requests = [];
const sceneRun = await runWorkflow(sceneRoot.data.graph, {
    target:{workflowId:sceneRoot.data.graph.id,instancePath:[],nodeId:'output',portId:'out'},
    snapshot: () => ({ kind: 'context', messages: [{ id: 'user-1', role: 'user', text: 'Mara waits by the door.' }] }),
    countTokens: async text => ({ tokens: Math.ceil(text.length / 4), method: 'fixed-test' }),
    resolveBinding: node => { assert.equal(node.modelRole, 'Analysis'); return { ok: true, data: { model: 'fixed-test-model' } }; },
    request: async request => { requests.push(request); return { ok: true, data: { text: 'Mara could choose to leave.', finish: 'stop' } }; },
});
assert.equal(sceneRun.ok, true);
assert.equal(sceneRun.actualCalls, 1);
assert.equal(requests.length, 1);
assert.match(requests[0].messages[0].content, /Preserve user agency/);
assert.equal(JSON.stringify(sceneRoot.data.graph), sceneBefore);
console.log('workflow-library-subgraphs: Scene Compass passed');

const cleanupIds = ['literal-cleanup', 'formatting-cleanup', 'prose-cleanup'];
for (const id of cleanupIds) {
    const recipe = createLibrarySubgraph(id);
    assert.equal(recipe.ok, true, `${id} now has permission-preserving registered operations`);
    const root = fixtureLibraryWorkflow(id);
    assert.equal(root.ok, true, JSON.stringify(root.error));
    assert.deepEqual(Object.values(root.data.graph.nodes).map(node => node.operation ?? node.type), id === 'literal-cleanup' ? ['subgraph', 'on-send', 'generate-reply', 'review-publish'] : ['reply-snapshot', 'subgraph', 'review-gate', 'apply-reply']);
    assert.equal(resolveWorkflow(root.data.graph).data.callBound, id === 'prose-cleanup' ? 1 : 0);
}
const literalDefinition = createLibrarySubgraph('literal-cleanup').data.definition;
assert.equal(literalDefinition.body.nodes.scan.scope, 'narration');
assert.deepEqual(literalDefinition.body.nodes.scan.rules, ['the words hung in the air', 'the tension was palpable', 'something unreadable'].map((pattern,index)=>({id:'prose-'+index,pattern})));
assert.equal(literalDefinition.body.nodes.filter.unit, 'paragraph');
assert.equal(literalDefinition.body.nodes.filter.scope, 'narration');
assert.equal(literalDefinition.interface[1].id, 'filtered-draft');
assert.equal(literalDefinition.interface[1].kind, 'draft');
const formattingDefinition = createLibrarySubgraph('formatting-cleanup').data.definition;
assert.equal(formattingDefinition.body.nodes.rules.scope, 'whole');
assert.deepEqual(formattingDefinition.body.nodes.rules.rules, [{ kind: 'literal', pattern: '\r\n', replacement: '\n', flags: '' }]);
const proseDefinition = createLibrarySubgraph('prose-cleanup').data.definition;
assert.equal(proseDefinition.body.nodes.repair.mode, 'contextual');
assert.equal(proseDefinition.body.nodes.repair.scope, 'narration');
assert.deepEqual(proseDefinition.body.nodes.repair.categories, []);
const optionalContext = proseDefinition.interface.find(port => port.id === 'context');
assert.equal(optionalContext?.required, false);
assert.equal(optionalContext?.kind, 'context');
assert.equal(proseDefinition.body.nodes[optionalContext.boundaryNodeId].type, 'subgraph-input');
console.log('workflow-library-subgraphs: cleanup definitions and roots passed');
for (const id of ['context-lens', 'scene-compass', ...cleanupIds]) {
    const { definition, json } = createLibrarySubgraph(id).data;
    const imported = parseSubgraph(json);
    assert.equal(imported.ok, true);
    assert.equal(definition.id, `lattice.library.${id}`);
    assert.equal(definition.version, 1);
    assert.equal(definition.semanticHash, computeDefinitionIdentity(definition).data.semanticHash);
    assert.equal(JSON.stringify(exportSubgraph(imported.data.definition, imported.data.definitions), null, 2) + '\n', json);
    for (const snapshot of [definition, ...Object.values(imported.data.definitions)]) {
        assert.equal(snapshot.body.definitions, undefined);
        for (const node of Object.values(snapshot.body.nodes)) {
            if (node.type !== 'workflow') continue;
            const op = operationFor(node, { phase: snapshot.body.mode.slice(7) });
            assert.ok(op, 'every package operation is registered');
            assert.ok(!op.terminal && op.input, 'sources and terminals stay outside definition bodies');
            assert.equal(node.profileId, undefined);
            assert.equal(node.model, undefined);
        }
        assert.ok(Object.values(snapshot.body.roles).every(binding => binding.model === null && binding.profileId === undefined));
    }
    const local = structuredClone(definition);
    local.name = 'Local display name';
    for (const node of Object.values(local.body.nodes)) if (node.type === 'workflow') node.profileId = 'private-local-profile';
    for (const binding of Object.values(local.body.roles)) binding.profileId = 'private-role-profile';
    assert.equal(computeDefinitionIdentity(local).data.semanticHash, definition.semanticHash);
    const stripped = exportSubgraph(local, imported.data.definitions);
    assert.ok(!JSON.stringify(stripped).includes('private-local-profile'));
    assert.ok(!JSON.stringify(stripped).includes('private-role-profile'));
    assert.equal(parseSubgraph(JSON.stringify(stripped)).ok, true);
    const semanticChange = structuredClone(definition);
    if (id === 'context-lens') semanticChange.body.nodes.compact.targetTokens++;
    if (id === 'scene-compass') semanticChange.body.nodes.plan.instructions += ' Changed.';
    if (id === 'literal-cleanup') semanticChange.body.nodes.filter.unit = 'line';
    if (id === 'prose-cleanup') semanticChange.body.nodes.repair.instructions += ' Changed.';
    if (id === 'formatting-cleanup') semanticChange.body.nodes.rules.rules[0].replacement += ' Changed.';
    assert.notEqual(computeDefinitionIdentity(semanticChange).data.semanticHash, definition.semanticHash);
    const example = new URL(`../examples/library/subgraphs/${id}.json`, import.meta.url);
    assert.ok(existsSync(example), `${id} canonical subgraph file exists`);
    assert.equal(canonicalFile(example), json, `${id} example is generated from its canonical factory`);
    if (id !== 'context-lens') {
        const root = fixtureLibraryWorkflow(id).data;
        const importedRoot = parseWorkflow(JSON.stringify(exportWorkflow(root.graph)));
        assert.equal(importedRoot.ok, true);
        assert.deepEqual(importedRoot.data, root.graph);
        assert.ok(Object.hasOwn(root.graph.definitions, definitionRefKey(root.graph.nodes.library.definition)));
    }
}
assert.equal(existsSync(new URL('../examples/library/workflows/context-lens.json', import.meta.url)), false);
for (const invalid of ['missing', '', null, 7, {}, 'constructor', '__proto__']) {
    assert.equal(createLibrarySubgraph(invalid).error.code, 'UNKNOWN_LIBRARY_SUBGRAPH');
    assert.equal(fixtureLibraryWorkflow(invalid).error.code, 'UNKNOWN_LIBRARY_SUBGRAPH');
}
const tamperedScene = JSON.parse(scene.data.json);
tamperedScene.definitions[definitionRefKey(lens.data.definition)].body.nodes.compact.targetTokens++;
assert.equal(parseSubgraph(JSON.stringify(tamperedScene)).error.code, 'DEFINITION_HASH');
const missingScene = JSON.parse(scene.data.json);
missingScene.definitions = {};
assert.equal(parseSubgraph(JSON.stringify(missingScene)).error.code, 'MISSING_DEFINITION');
assert.equal(createLibrarySubgraph('context-lens').data.json, lens.data.json, 'factories remain deterministic and detached');
console.log('workflow-library-subgraphs: canonical files and portability passed');

for (const method of ['select', 'compress']) {
    const graph = structuredClone(sceneRoot.data.graph);
    graph.nodes.library.parameterOverrides = { method, targetTokens: 100, keepRecent: 1 };
    const target = { workflowId: graph.id, instancePath: ['library', 'lens'], nodeId: 'compact', portId: 'out' };
    assert.equal(resolveWorkflow(graph, { target }).data.callBound, method === 'compress' ? 1 : 0);
    assert.equal(resolveWorkflow(graph).data.callBound, method === 'compress' ? 2 : 1);
    const result = await runWorkflow(graph, {
        target,
        snapshot: () => ({ kind: 'context', messages: [{ id: 'history', role: 'user', text: 'Older fact. '.repeat(100) }, { id: 'recent', role: 'user', text: 'Current scene.' }] }),
        countTokens: async text => ({ tokens: Math.ceil(text.length / 4), method: 'fixed-test' }),
        resolveBinding: () => ({ ok: true, data: { model: 'fixed-test-model' } }),
        request: async () => ({ ok: true, data: { text: 'Earlier facts summarized.', finish: 'stop' } }),
    });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, method === 'compress' ? 1 : 0);
    assert.equal(result.recording.terminals.length, 0, 'utility target carries no terminal authority');
    assert.ok(result.recording.artifacts.some(entry => entry.value?.kind === 'context' && entry.value?.messages?.some(message => message.id === 'recent')));
}
let unboundEffects = 0;
const unbound = await runWorkflow(sceneRoot.data.graph, {target:{workflowId:sceneRoot.data.graph.id,instancePath:[],nodeId:'output',portId:'out'}, countTokens: async()=>({tokens:1,method:'fixture'}), snapshot: () => { unboundEffects++; return {kind:'context',messages:[{id:'scene',role:'user',text:'A scene.'}]}; }, request: () => { unboundEffects++; } });
assert.equal(unbound.error.code, 'BINDING_MISSING');
assert.equal(unbound.actualCalls, 0);
assert.equal(unboundEffects, 1, 'source access precedes activation-time model binding');
console.log('workflow-library-subgraphs: utility modes and unresolved roles passed');

async function inspectLibrary(graph,options,{inspect}) {
    const result=await runWorkflow(graph,{...options,target:{workflowId:graph.id,instancePath:[],nodeId:'library',portId:'candidate'}});
    if(result.ok){const candidate=result.recording.artifacts.find(artifact=>artifact.kind==='candidate')?.value;assert.ok(candidate);inspect({candidate});assert.deepEqual(result.recording.terminals,[],'target inspections carry no terminal authority');}
    return result;
}
const sourceDraft = text => ({ kind: 'draft', text, source: { chatId: 'library-fixture', messageIndex: 3, swipeId: 0, originalText: text, token: { identity: 'original' } } });
const testBinding = node => { assert.equal(node.modelRole, 'Prose'); return { ok: true, data: { model: 'fixed-prose' } }; };
const testCount = async text => ({ tokens: Math.ceil(text.length / 4), method: 'fixed-test' });
const literalPhrase = 'something unreadable', protectedPhrase = 'the tension was palpable';

// The current static library routes once, deletes units atomically and retains review authority at the root.
for (const [text, extra, expected, reason, filters] of [
    ['First.\n\nsomething unreadable something unreadable\n\nLast.', {}, 'First.\n\nLast.', null, 1],
    ['First.\n\nLast.', {}, 'First.\n\nLast.', null, 0],
    ['First.\n\nsomething unreadable\n\nLast.', { spans: [] }, null, 'FILTER_PERMISSION_BLOCKED', 1],
    ['First.\n\nsomething unreadable\n\nLast.', { protectedLiterals: [literalPhrase] }, null, 'FILTER_PERMISSION_BLOCKED', 1],
    ['First.\n\nsomething unreadable "quoted"\n\nLast.', {}, null, 'FILTER_PERMISSION_BLOCKED', 1],
    ['First.\n\nsomething unreadable\n\nLast.', { exemptions: [literalPhrase] }, 'First.\n\nsomething unreadable\n\nLast.', null, 0],
    ['something unreadable', {}, null, 'EMPTY_FILTER_RESULT', 1],
]) {
    const graph=fixtureLibraryWorkflow('literal-cleanup').data.graph, h=hostHarness(text,extra), before=structuredClone(graph);
    const result=await runWorkflowForHost(graph,h.ports,h.hooks);
    assert.equal(result.ok,!reason,JSON.stringify(result.error)); assert.equal(result.actualCalls,0); assert.equal(h.effects.requests,0); assert.equal(h.effects.filters,filters);
    assert.deepEqual(graph,before);
    const report=retained(h.outputs,'scan','matches',['library']);
    assert.ok(report); assert.equal(report.value.totalOccurrences,text.includes(literalPhrase+' '+literalPhrase)?2:extra.exemptions||!text.includes(literalPhrase)?0:1);
    if(reason){
        assert.equal(h.effects.commits,0);assert.equal(h.settlements.length,0);
        const row=unit(result,'filter',['library']), pin=row.ports.find(pin=>pin.direction==='output'&&result.recording.identities.strings[pin.port]==='out');
        assert.equal(pin.state.reason.code,reason);
    } else {
        assert.equal(h.settlements[0].terminals[0].artifact.text,expected);assert.equal(h.effects.commits,1);
        if(!filters)assert.equal(retained(h.outputs,'join','out',['library']),retained(h.outputs,'generate-reply','draft'));
    }
}
console.log('workflow-library-subgraphs: atomic literal filtering, no-hit bypass, permission/empty holds and zero-call bound passed');

function ruleWorkerHarness() {
    const resources = [];
    return {
        createWorker() {
            const worker = new Worker(new URL('./fixtures/text-rules-node-worker.mjs', import.meta.url)), handlers = new Map();
            const resource = { worker, termination: null }; resources.push(resource);
            return {
                addEventListener(type, listener) {
                    const handler = type === 'message' ? data => { if (!data?.fixtureStarted) listener({ data }); } : error => listener({ error });
                    handlers.set(listener, handler); worker.on(type, handler);
                },
                removeEventListener(type, listener) { worker.off(type, handlers.get(listener)); handlers.delete(listener); },
                postMessage(message) { worker.postMessage(message); },
                terminate() { resource.termination = worker.terminate(); return resource.termination; },
            };
        },
        async cleaned() { for (const resource of resources) { assert.ok(resource.termination); await resource.termination; assert.equal(resource.worker.threadId, -1); } },
    };
}
for (const [input, expected] of [
    [sourceDraft('one\r\ntwo'), 'one\ntwo'],
    [{ ...sourceDraft('one\r\ntwo'), spans: [] }, 'one\r\ntwo'],
    [{ ...sourceDraft('one\r\ntwo'), protectedLiterals: ['one\r\ntwo'] }, 'one\r\ntwo'],
    [{ ...sourceDraft('one\r\n"two\r\nthree"'), scope: 'narration', spans: [{ index: 0, start: 0, end: 5, text: 'one\r\n' }] }, 'one\n"two\r\nthree"'],
]) {
    const harness = ruleWorkerHarness(), before = structuredClone(input);
    let terminal, effects = 0;
    const forbidden = () => { effects++; throw Error('Formatting must use no model services'); };
    const result = await inspectLibrary(fixtureLibraryWorkflow('formatting-cleanup').data.graph, {
        snapshot: () => input, createWorker: harness.createWorker, resolveBinding: forbidden, countTokens: forbidden, request: forbidden,
    }, { inspect({candidate}) { terminal = candidate; return { ok: true }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, 0);
    assert.equal(effects, 0);
    assert.equal(terminal.text, expected);
    assert.deepEqual(structuredClone(terminal.source),{chatId:input.source.chatId,messageIndex:input.source.messageIndex,swipeId:input.source.swipeId});
    assert.equal(terminal.reviewRequired, true);
    assert.deepEqual(input, before);
    await harness.cleaned();
}
console.log('workflow-library-subgraphs: formatting permissions and zero-call bound passed');

for (const mode of ['inspect', 'contextual', 'strict']) {
    const graph = fixtureLibraryWorkflow('prose-cleanup').data.graph;
    graph.nodes.library.parameterOverrides = { mode };
    assert.equal(resolveWorkflow(graph).data.callBound, mode === 'inspect' ? 0 : 1);
    const input = sourceDraft('The tension was palpable. "adequate."'), before = structuredClone(input);
    let requests = 0, bindings = 0, terminal;
    const result = await inspectLibrary(graph, {
        snapshot: () => input, countTokens: testCount,
        resolveBinding(node) { bindings++; return testBinding(node); },
        request: async request => { requests++; assert.match(request.messages[0].content, /prose/i); return { ok: true, data: { text: 'The room fell quiet. "adequate."', finish: 'stop' } }; },
    }, { inspect({candidate}) { terminal = candidate; return { ok: true }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(requests, mode === 'inspect' ? 0 : 1);
    assert.equal(bindings, mode === 'inspect' ? 0 : 1);
    assert.equal(result.actualCalls, requests);
    assert.equal(terminal.text, mode === 'inspect' ? input.text : 'The room fell quiet. "adequate."');
    assert.equal(terminal.reviewRequired, true);
    assert.deepEqual(structuredClone(terminal.source),{chatId:input.source.chatId,messageIndex:input.source.messageIndex,swipeId:input.source.swipeId});
    assert.deepEqual(input, before);
}
console.log('workflow-library-subgraphs: prose cleanup zero/one-call modes passed');
