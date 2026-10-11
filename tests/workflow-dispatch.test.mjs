import assert from 'node:assert/strict';
import { installMock } from './mock.js';
import * as state from '../src/state.js?v=0.26.0';
import { callCount, sendWorkflowState } from '../src/run.js?v=0.26.0';
import { runWorkflow, workflowSignature } from '../src/workflow/runtime.js?v=0.26.0';
import { graphSemanticSignature } from '../src/workflow/ports.js?v=0.26.0';
import { starterGraph } from '../src/workflow/starters.js?v=0.26.0';
import { exportWorkflow } from '../src/workflow/packages.js?v=0.26.0';
import { isWorkflowGraph } from '../src/workflow/contracts.js?v=0.26.0';

const context = installMock();
let loreScans = 0, snapshots = 0, getterReads = 0;
context.getWorldInfoPrompt = async () => { loreScans++; return {}; };
context.getCharacterCardFields = () => { snapshots++; return {}; };
const current = starterGraph('native-guidance');
assert.equal(callCount(current), 2);
assert.equal(workflowSignature(current), graphSemanticSignature(current));
const changed = structuredClone(current);
Object.values(changed.wires)[0].fromPort = 'changed';
assert.notEqual(workflowSignature(changed), workflowSignature(current));

let bindings = 0, calls = 0;
const unbound = await runWorkflow(current, {
    resolveBinding() { bindings++; return { ok: false, error: { code: 'FIXTURE_UNBOUND', message: 'No connection is assigned.' } }; },
    async request() { calls++; }, snapshot() { snapshots++; },
});
assert.equal(unbound.error.code, 'FIXTURE_UNBOUND');
assert.equal(bindings, 1); assert.equal(calls, 0); assert.equal(snapshots, 0);

// Current public boundaries reject unsafe metadata before inspecting host context.
const unsafe = [null, undefined, 'graph', 0, true, 1n, Symbol('graph')];
for (const schema of [1, 2, 99]) unsafe.push({ ...structuredClone(current), schema });
unsafe.push({ ...structuredClone(current), runtime: 1 });
for (const key of ['schema', 'mode', 'runtime', 'nodes', 'wires']) {
    const value = structuredClone(current);
    Object.defineProperty(value, key, { enumerable: true, get() { getterReads++; throw new Error('Accessor must not run'); } });
    unsafe.push(value);
}
const inherited = Object.setPrototypeOf(structuredClone(current), { get schema() { getterReads++; return 3; } });
delete inherited.schema; unsafe.push(inherited);
unsafe.push(Object.assign([], structuredClone(current)));
unsafe.push(Object.defineProperties(function () {}, Object.getOwnPropertyDescriptors(current)));
const revoked = Proxy.revocable({}, {}); revoked.revoke(); unsafe.push(revoked.proxy);
unsafe.push(new Proxy({}, { getPrototypeOf() { throw new Error('Uninspectable prototype'); } }));
unsafe.push(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('Uninspectable descriptors'); } }));
for (const graph of unsafe) {
    assert.equal(isWorkflowGraph(graph), false);
    assert.equal(callCount(graph), 0);
    const result = await runWorkflow(graph, {
        resolveBinding() { bindings++; throw new Error('Invalid graph reached bindings'); },
        async request() { calls++; throw new Error('Invalid graph reached provider'); },
        snapshot() { snapshots++; throw new Error('Invalid graph reached source'); },
    });
    assert.equal(result.ok, false);
}
assert.equal(getterReads, 0); assert.equal(bindings, 1); assert.equal(calls, 0);
assert.equal(loreScans, 0); assert.equal(snapshots, 0);
const malformedCurrent = structuredClone(current);
state.activateWorkflow(malformedCurrent);
malformedCurrent.schema = 99;
assert.equal(sendWorkflowState().automatic, false);
assert.equal(getterReads, 0);

const imported = state.importGraph(JSON.stringify(exportWorkflow(current)));
assert.equal(imported.ok, true); assert.equal(imported.graph.schema, 3);
assert.equal(JSON.parse(state.exportGraph(imported.graph)).schema, 2);
const before = structuredClone(state.settings());
for (const data of [current, { graph: current }, { kind: 'comfytavern-workflow', schema: 2, minRuntime: 2, graph: current },
    { ...exportWorkflow(current), graph: { ...current, schema: 2, runtime: 1 } }]) {
    assert.equal(state.importGraph(JSON.stringify(data)).ok, false);
}
assert.deepEqual(state.settings(), before);
state.activateWorkflow(imported.graph);
assert.equal(sendWorkflowState().automatic, true);
assert.match(sendWorkflowState().armedText, /maximum 2 auxiliary requests/i);
assert.match(sendWorkflowState().armedText, /SillyTavern builds its normal prompt/i);
assert.equal(typeof state.connect, 'undefined');
assert.equal(typeof state.migrateGraph, 'undefined');
console.log('workflow-dispatch: current admission and zero effects verified');
