import assert from 'node:assert/strict';
import test from 'node:test';
import { executeControl, describeControl } from '../src/workflow/operations/control-nodes.js';

const data = value => ({ kind: 'data', value });
const helper = { id: 'ordered-helper', version: 1, semanticHash: 'sha256:' + 'a'.repeat(64) };
test('an optional skipped contribution completes Collect with an empty ordered collection', async () => {
    const result = await executeControl({ type: 'workflow', operation: 'collect', inputs: [{ id: 'optional', label: 'Optional', required: false }] }, {}, { inputStates: { optional: { status: 'skipped' } } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.outputs.out, data([]));
});

test('Join keeps the base Draft when its declared optional revision was skipped', async () => {
    const draft = { kind: 'draft', text: 'Base', source: { originalText: 'Base' } };
    const result = await executeControl({ type: 'workflow', operation: 'join', artifactKind: 'draft', inputs: [{ id: 'base', label: 'Base', required: true }, { id: 'revision', label: 'Revision', required: false }] }, { base: draft }, { inputStates: { base: { status: 'completed' }, revision: { status: 'skipped' } } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.outputs.out, draft);
});

test('unresolved optional inputs hold Join rather than silently selecting the base', async () => {
    const result = await executeControl({ type: 'workflow', operation: 'join', inputs: [{ id: 'base', label: 'Base', required: true }, { id: 'other', label: 'Other', required: false }] }, { base: data(1) }, { inputStates: { base: { status: 'completed' }, other: { status: 'unresolved', reason: { code: 'UNCERTAIN', message: 'Needs review' } } } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.outputStates.out.status, 'unresolved');
    assert.equal(result.outputs, undefined);
});

test('Confidence Gate preserves the decision and sends a middle-band metric to unresolved', async () => {
    const decision = { answers: { kiss: { noul: 0.5 } }, provider: 'typed-fixture' };
    const result = await executeControl({ type: 'workflow', operation: 'confidence-gate', metricPath: ['answers','kiss','noul'], acceptMin: 0.8, rejectMax: 0.2 }, { in: data(decision) });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.outputs.unresolved.value.decision, decision);
    assert.equal(result.outputs.unresolved.value.accepted, undefined);
    assert.equal(result.outputStates.accepted.status, 'skipped');
    assert.equal(result.outputStates.rejected.status, 'skipped');
});

test('Confidence Gate uses the authored metric path instead of inventing provider confidence', async () => {
    const decision = { choice: 'wand', act_probability: 0.99 };
    const result = await executeControl({ type: 'workflow', operation: 'confidence-gate', metricPath: ['taskProbability'], acceptMin: 0.8, rejectMax: 0.2 }, { in: data(decision) });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.outputs.unresolved.value.metric, null);
    assert.deepEqual(result.outputs.unresolved.value.decision, decision);
});

test('For Each processes ordered items against the previous checked projected state', async () => {
    const seen = [];
    const result = await executeControl({ type: 'workflow', operation: 'for-each', helper, mode: 'projected-state', limit: 3, requestBoundPerIteration: 0 }, { in: data([2, 3]), state: data({ total: 0 }) }, { iterateHelper: async invocation => {
        seen.push([invocation.index, invocation.projectedState.total]);
        const total = invocation.projectedState.total + invocation.item;
        return { ok: true, artifact: data(total), projectedState: { total } };
    } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(seen, [[0, 0], [1, 2]]);
    assert.deepEqual(result.outputs.out, data([2, 5]));
    assert.deepEqual(result.outputs.state, data({ total: 5 }));
});

test('an empty collection validates its pinned helper and completes without invoking it', async () => {
    const result = await executeControl({ type: 'workflow', operation: 'for-each', helper, limit: 3, requestBoundPerIteration: 0 }, { in: data([]) }, { iterateHelper: () => { throw new Error('No work'); } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.outputs.out, data([]));
    const invalid = await executeControl({ type: 'workflow', operation: 'for-each', helper: { ...helper, semanticHash: 'arbitrary' } }, { in: data([]) });
    assert.equal(invalid.ok, false);
});

test('For Each rejects excess items and unbounded or executable helper settings', async () => {
    const excess = await executeControl({ type: 'workflow', operation: 'for-each', helper, limit: 1 }, { in: data([1, 2]) });
    assert.equal(excess.error.code, 'ITERATION_LIMIT');
    assert.equal(describeControl({ type: 'workflow', operation: 'for-each', helper: () => {}, limit: 129 }).ok, false);
});

test('For Each does not publish partial results after helper failure or cancellation', async () => {
    const failed = await executeControl({ type: 'workflow', operation: 'for-each', helper }, { in: data([1, 2]) }, { iterateHelper: async ({ index }) => index ? { ok: false, error: { code: 'PROVIDER_FAILED', message: 'Failed' } } : { ok: true, artifact: data(1) } });
    assert.equal(failed.error.code, 'PROVIDER_FAILED');
    assert.equal(failed.outputs, undefined);
    const controller = new AbortController();
    const cancelled = await executeControl({ type: 'workflow', operation: 'for-each', helper }, { in: data([1]) }, { signal: controller.signal, iterateHelper: async () => { controller.abort(); return { ok: true, artifact: data('late') }; } });
    assert.equal(cancelled.error.code, 'ABORTED');
    assert.equal(cancelled.outputs, undefined);
});

test('For Each closes saved request capabilities after each iteration',async()=>{
    let saved,calls=0;
    const result=await executeControl({type:'workflow',operation:'for-each',helper,requestBoundPerIteration:1},{in:data([1])},{request:async()=>{calls++;return {ok:true,data:{text:'one',finish:'stop'}};},iterateHelper:async(_,ports)=>{saved=ports.request;return {ok:true,artifact:data(1)};}});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    const late=await saved({messages:[],maxTokens:1});
    assert.equal(late.ok,false);
    assert.equal(late.error.code,'ITERATION_CLOSED');assert.equal(calls,0);
});

test('For Each rejects concurrent helper requests before dispatching a second request',async()=>{
    let calls=0;
    const result=await executeControl({type:'workflow',operation:'for-each',helper,requestBoundPerIteration:2},{in:data([1])},{request:async()=>{calls++;await new Promise(resolve=>setImmediate(resolve));return {ok:true,data:{text:'one',finish:'stop'}};},iterateHelper:async(_, {request})=>{await Promise.all([request({messages:[],maxTokens:1}),request({messages:[],maxTokens:1})]);return {ok:true,artifact:data('ignored')};}});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'ITERATION_REQUEST_IN_PROGRESS');assert.equal(calls,1);assert.equal(result.outputs,undefined);
});

test('Condition compares object content independently of JSON property order',async()=>{
    const result=await executeControl({type:'workflow',operation:'condition',value:{a:1,b:2}},{in:data({b:2,a:1})});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.outputs.out.value.accepted,true);
});


test('Branch, Join and privacy-inherited report envelopes retain live Matches.value identity', async () => {
    const { scanPatternDraft, getPatternReportBinding } = await import('../src/workflow/operations/pattern-engine.js?v=0.27.0');
    const { preserveArtifactPrivacy } = await import('../src/workflow/artifact-privacy.js?v=0.27.0');
    const { filterPatternDraft } = await import('../src/workflow/operations/filter-text.js?v=0.27.0');
    const { settings, slots } = await import('./helpers/pattern-routing-fixtures.mjs');
    const input = { kind: 'draft', text: 'First.\n\n1 3\n\nLast.', source: { originalText: 'First.\n\n1 3\n\nLast.' } };
    const scanned = await scanPatternDraft(input, settings()); assert.equal(scanned.ok, true);
    const report = scanned.outputs.matches;
    const branch = await executeControl({ operation: 'branch', artifactKind: 'data' }, { in: report, condition: data(true) });
    assert.equal(branch.ok, true); assert.equal(branch.outputs.yes, report);
    const joined = await executeControl({ operation: 'join', artifactKind: 'data', inputs: slots('hit', 'miss') }, { hit: branch.outputs.yes }, { inputStates: { hit: { status: 'completed' }, miss: branch.outputStates.no } });
    assert.equal(joined.ok, true); assert.equal(joined.outputs.out, report);
    const privateResult = preserveArtifactPrivacy(joined, { privateDecision: { kind: 'data', value: true, visibility: { kind: 'actor-private', actorId: 'mara' } } });
    assert.equal(privateResult.ok, true); assert.notEqual(privateResult.outputs.out, report); assert.equal(privateResult.outputs.out.value, report.value);
    assert.deepEqual(privateResult.outputs.out.visibility, { kind: 'actor-private', actorId: 'mara' });
    assert.equal(getPatternReportBinding(privateResult.outputs.out.value, input).ok, true);
    const filtered = filterPatternDraft(input, joined.outputs.out, { action: 'remove', unit: 'paragraph', scope: 'whole', protectedLiterals: [] }, { nodeId: 'filter' });
    assert.equal(filtered.ok, true); assert.equal(filtered.outputs.out.text, 'First.\n\nLast.');
    const privateFilter = filterPatternDraft(input, privateResult.outputs.out, { action: 'remove', unit: 'paragraph', scope: 'whole', protectedLiterals: [] }, { nodeId: 'private-filter' });
    assert.equal(privateFilter.ok, true, JSON.stringify(privateFilter.error));
    assert.equal(preserveArtifactPrivacy(privateFilter, { in: input, matches: privateResult.outputs.out }).error.code, 'PRIVATE_MATERIAL', 'live evidence does not permit disclosing a private decision');
});

test('Collect and For Each descriptive copies cannot recover live Filter evidence or Draft authority', async () => {
    const { scanPatternDraft, getPatternReportBinding } = await import('../src/workflow/operations/pattern-engine.js?v=0.27.0');
    const { filterPatternDraft } = await import('../src/workflow/operations/filter-text.js?v=0.27.0');
    const { settings, slots } = await import('./helpers/pattern-routing-fixtures.mjs');
    const input = { kind: 'draft', text: 'First.\n1\nLast.', source: { originalText: 'First.\n1\nLast.' } };
    const scan = await scanPatternDraft(input, settings()), report = scan.outputs.matches;
    const collected = await executeControl({ operation: 'collect', artifactKind: 'data', inputs: slots('matches') }, { matches: report });
    assert.equal(collected.ok, true); assert.notEqual(collected.outputs.out.value[0], report.value);
    const seen = [];
    const each = await executeControl({ operation: 'for-each', helper }, { in: collected.outputs.out }, { iterateHelper: async ({ item }) => { seen.push(item); return { ok: true, artifact: data(item) }; } });
    assert.equal(each.ok, true); assert.notEqual(seen[0], report.value); assert.notEqual(each.outputs.out.value[0], seen[0]);
    for (const value of [collected.outputs.out.value[0], seen[0], each.outputs.out.value[0]]) {
        assert.equal(getPatternReportBinding(value, input).error.code, 'INVALID_MATCH_REPORT');
        assert.equal(filterPatternDraft(input, data(value), { action: 'remove', unit: 'line', scope: 'whole', protectedLiterals: [] }, { nodeId: 'copied-filter' }).error.code, 'INVALID_MATCH_REPORT');
    }
    const forged = await executeControl({ operation: 'for-each', helper }, { in: data([input]) }, { iterateHelper: async () => ({ ok: true, artifact: input }) });
    assert.equal(forged.error.code, 'INVALID_ITERATION_RESULT'); assert.equal(forged.outputs, undefined);
});

test('Condition JSON comparison values validate in graphs and exposed pinned controls', async () => {
    const { validateNamedGraphStructure } = await import('../src/workflow/graph-validation.js');
    const { describeExposedControl } = await import('../src/workflow/definition-data.js');
    const graph = value => ({ id: 'json-comparison', schema: 3, runtime: 2, mode: 'native-pre', nodes: { check: { id: 'check', type: 'workflow', operation: 'condition', value } }, wires: {}, definitions: {} });
    for (const value of [null, false, 0, '', [], {}, { 'a.b': ['red, blue', 0, false, null] }]) {
        const valid = validateNamedGraphStructure(graph(value)); assert.equal(valid.ok, true, JSON.stringify(valid));
        const exposed = describeExposedControl(graph(value).nodes.check, 'value'); assert.equal(exposed.ok, true, JSON.stringify(exposed));
        assert.equal(exposed.data.type, 'json-value'); assert.deepEqual(exposed.data.default, value);
    }
    const accessor = {}; Object.defineProperty(accessor, 'x', { enumerable: true, get() { throw Error('getter must not run'); } });
    const inherited = Object.create({ inherited: true }); inherited.own = 1;
    let deep = null; for (let index = 0; index < 33; index++) deep = [deep];
    for (const value of [Infinity, undefined, accessor, inherited, 'x'.repeat(262145), Array.from({ length: 10000 }, () => null), deep]) {
        assert.equal(validateNamedGraphStructure(graph(value)).ok, false);
        assert.equal(describeExposedControl(graph(value).nodes.check, 'value').ok, false);
    }
});

test('declared semantic JSON prototype-like names round trip real graph creation editing and pinned exports', async () => {
    const { prepareNativeConnectionEdit } = await import('../src/workflow/connection-edits.js');
    const { prepareNodeControlChange } = await import('../src/workflow/ports.js');
    const { validateGraphStructure, safeWorkflowData } = await import('../src/workflow/contracts.js');
    const { cloneDefinitionData, computeDefinitionIdentity, definitionRefKey, describeExposedControl } = await import('../src/workflow/definition-data.js');
    const { serializeWorkflowDocument, parseWorkflowDocument } = await import('../src/workflow/document-file.js');
    const { exportSubgraph, parseSubgraph } = await import('../src/workflow/packages.js');
    const value = { ['__proto__']: { constructor: { prototype: [0, false, null, ''] } }, 'a.b': 'red, blue' };
    const root = { id: 'json-authoring', schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, definitions: {} };
    const created = prepareNativeConnectionEdit(root, { kind: 'create', operation: 'condition', phase: 'pre', controls: { value }, graphPoint: { x: 0, y: 0 } });
    assert.equal(created.ok, true, JSON.stringify(created));
    const node = Object.values(created.data.candidate.nodes)[0];
    assert.deepEqual(node.value, value); assert.equal(Object.hasOwn(node.value, '__proto__'), true); assert.equal({}.polluted, undefined);
    const edited = prepareNodeControlChange(created.data.candidate, { nodeId: node.id, controls: { value: { ['__proto__']: { polluted: false } } } });
    assert.equal(edited.ok, true, JSON.stringify(edited)); assert.equal(validateGraphStructure(edited.data.candidate).ok, true);
    const document = serializeWorkflowDocument(edited.data.candidate); assert.equal(document.ok, true, JSON.stringify(document));
    const restored = parseWorkflowDocument(document.data.json); assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.deepEqual(restored.data.graph.nodes[node.id].value, { ['__proto__']: { polluted: false } });
    const described = describeExposedControl(node, 'value'); assert.equal(described.ok, true, JSON.stringify(described)); assert.deepEqual(described.data.default, value);
    const draft = { id: 'json-helper', version: 1, name: 'JSON helper', interface: [{ id: 'in', label: 'Input', kind: 'data', direction: 'input', required: true, cardinality: 'one', boundaryNodeId: 'entry' }, { id: 'out', label: 'Output', kind: 'data', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'exit' }], parameters: [{ id: 'comparison', label: 'Comparison', target: { instancePath: [], nodeId: 'check', controlId: 'value' } }], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'in' }, check: { id: 'check', type: 'workflow', operation: 'condition', value }, exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'out' } }, wires: { a: { id: 'a', route: 'wire', from: 'entry', fromPort: 'out', to: 'check', toPort: 'in' }, b: { id: 'b', route: 'wire', from: 'check', fromPort: 'out', to: 'exit', toPort: 'in' } } } };
    const identity = computeDefinitionIdentity(draft); assert.equal(identity.ok, true, JSON.stringify(identity));
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash }, table = { [definitionRefKey(definition)]: definition };
    const exported = exportSubgraph(definition, table), imported = parseSubgraph(JSON.stringify(exported));
    assert.equal(imported.ok, true, JSON.stringify(imported)); assert.deepEqual(imported.data.definition.body.nodes.check.value, value);
    const instanceRoot = { ...root, nodes: { instance: { id: 'instance', type: 'subgraph', definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash }, parameterOverrides: { comparison: value }, roleOverrides: {}, nodeBindingOverrides: {} } }, definitions: table };
    assert.equal(validateGraphStructure(instanceRoot).ok, true, 'Exact exposed JSON comparison overrides accept the same own-key payload');
    const instanceFile = serializeWorkflowDocument(instanceRoot); assert.equal(instanceFile.ok, true, JSON.stringify(instanceFile));
    const instanceImport = parseWorkflowDocument(instanceFile.data.json); assert.equal(instanceImport.ok, true, JSON.stringify(instanceImport));
    assert.deepEqual(instanceImport.data.graph.nodes.instance.parameterOverrides.comparison, value);
    assert.equal(safeWorkflowData({ ...instanceRoot, nodes: { instance: { ...instanceRoot.nodes.instance, parameterOverrides: { unknown: value } } } }), false);
    for (const operation of ['select-fields','format']) {
        const fields = [{ name: 'mapped', path: ['a.b', 0], required: false, default: value }];
        const mappedNode = { id: 'check', type: 'workflow', operation, fields };
        const mappedDescriptor = describeExposedControl(mappedNode, 'fields'); assert.equal(mappedDescriptor.ok, true, JSON.stringify(mappedDescriptor)); assert.deepEqual(mappedDescriptor.data.default, fields);
        const mappedDraft = { ...draft, id: 'mapped-' + operation, parameters: [{ id: 'mapping', label: 'Mapping', target: { instancePath: [], nodeId: 'check', controlId: 'fields' } }], body: { ...draft.body, nodes: { ...draft.body.nodes, check: mappedNode }, wires: { ...draft.body.wires, b: { ...draft.body.wires.b, fromPort: operation === 'format' ? 'records' : 'out' } } } };
        const mappedIdentity = computeDefinitionIdentity(mappedDraft); assert.equal(mappedIdentity.ok, true, JSON.stringify(mappedIdentity));
        const mappedDefinition = { ...mappedIdentity.data.materializedDefinition, semanticHash: mappedIdentity.data.semanticHash }, mappedTable = { [definitionRefKey(mappedDefinition)]: mappedDefinition };
        const mappedExport = exportSubgraph(mappedDefinition, mappedTable), mappedImport = parseSubgraph(JSON.stringify(mappedExport)); assert.equal(mappedImport.ok, true, JSON.stringify(mappedImport)); assert.deepEqual(mappedImport.data.definition.body.nodes.check.fields, fields);
        const mappedRoot = { ...root, definitions: mappedTable, nodes: { instance: { ...instanceRoot.nodes.instance, definition: { id: mappedDefinition.id, version: mappedDefinition.version, semanticHash: mappedDefinition.semanticHash }, parameterOverrides: { mapping: fields } } } };
        assert.equal(validateGraphStructure(mappedRoot).ok, true); const mappedFile = serializeWorkflowDocument(mappedRoot); assert.equal(mappedFile.ok, true, JSON.stringify(mappedFile)); assert.deepEqual(parseWorkflowDocument(mappedFile.data.json).data.graph.nodes.instance.parameterOverrides.mapping, fields);
    }
    for (const metadata of [{ ['__proto__']: value }, { nested: { type: 'workflow', operation: 'condition', value } }, { nested: { type: 'json-value', default: value } }]) {
        assert.equal(safeWorkflowData(metadata), false); assert.equal(cloneDefinitionData(metadata).ok, false);
        assert.equal(safeWorkflowData({ ...created.data.candidate, metadata }), false);
    }
    for (const secret of ['password', 'provider', 'authorization', 'token', 'headers']) assert.equal(safeWorkflowData({ ...created.data.candidate, nodes: { ...created.data.candidate.nodes, [node.id]: { ...node, value: { [secret]: 'hidden' } } } }), false);
});
