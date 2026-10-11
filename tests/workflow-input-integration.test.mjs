import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeOperation, operationDefaults } from '../src/workflow/catalog.js';
import { validateGraphStructure } from '../src/workflow/contracts.js';

const node = (id, operation, controls = {}) => ({ id, type: 'workflow', operation, operationVersion: 1, ...controls });
const graph = (phase, nodes, wires = {}) => ({ id: 'input-integration', schema: 3, runtime: 2, mode: 'native-unified', nodes: Object.fromEntries(Object.entries(nodes).map(([id,node])=>[id,{phase,...node}])), wires, definitions: {}, portals: {} });
const wire = (id, from, to, toPort = 'in') => ({ id, route: 'wire', from, fromPort: 'out', to, toPort });

test('the Input shelf operations describe a zero-call Text source in both phases', () => {
    for (const phase of ['pre', 'post']) for (const operation of ['text', 'file-input', 'prompt-source']) {
        const source = node('source', operation), g = graph(phase, { source });
        const result = describeOperation(g, g.nodes.source);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.data.descriptor.family, 'Input');
        assert.equal(result.data.descriptor.phase, phase);
        assert.equal(result.data.descriptor.requestBound, 0);
        assert.equal(result.data.descriptor.modelRole, null);
        assert.deepEqual(result.data.ports.map(pin => [pin.id, pin.direction, pin.kind]), [['out', 'output', 'text']]);
        assert.equal(validateGraphStructure(g).ok, true);
        assert.equal(operationDefaults(operation).operationVersion, 1);
    }
});

import { runWorkflow } from '../src/workflow/runtime.js';

test('Text flows through JSON Decode and Compose into zero-call guidance', async () => {
    const g = graph('pre', {
        text: node('text', 'text', { text: '{"direction":"Keep the exchange quiet."}' }),
        decode: node('decode', 'json-decode'),
        compose: node('compose', 'compose', { mode: 'template', outputKind: 'guidance', template: 'Direction: {{data:/direction}}' }),
        output: node('output', 'guidance'),
    }, { a: wire('a', 'text', 'decode'), b: wire('b', 'decode', 'compose', 'data'), c: wire('c', 'compose', 'output') });
    let requests = 0;
    const result = await runWorkflow(g, { target: {workflowId:g.id,instancePath:[],nodeId:'output',portId:'out'}, countTokens: () => ({ tokens: 10 }), request: () => { requests++; throw Error('Unexpected request'); } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, 0);
    assert.equal(requests, 0);
    assert.ok(JSON.stringify(result.recording).includes('Direction: Keep the exchange quiet.'));
});

import { prepareNativeSearchCatalog } from '../src/ui/native-search-catalog.js';

test('source discovery has canonical Input entries and includes host prompts inside static subgraphs',()=>{
    const scope={schema:3,runtime:2,mode:'native-unified',workflowId:'input-integration',viewPath:[],inDefinition:false};
    const root=prepareNativeSearchCatalog(scope);
    assert.equal(root.ok,true);
    for(const operation of ['text','file-input','prompt-source']) {
        const choice=root.data.choices.find(choice=>choice.id==='operation:'+operation);
        assert.ok(choice,operation);
        assert.equal(choice.family,'Input');
        assert.ok(choice.purpose.length>0);
    }
    const nested=prepareNativeSearchCatalog({...scope,inDefinition:true,viewPath:['wrapper']});
    assert.equal(nested.ok,true);
    assert.ok(nested.data.choices.some(choice=>choice.id==='operation:text'));
    assert.ok(nested.data.choices.some(choice=>choice.id==='operation:file-input'));
    assert.equal(nested.data.choices.some(choice=>choice.id==='operation:prompt-source'),true);
});

import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js';
import { workflowSignature } from '../src/workflow/runtime.js';
import { prepareCreateFromSelection } from '../src/workflow/composition.js';

test('File Input persists a portable snapshot and feeds JSON Decode',async()=>{
    const g=graph('post',{file:node('file','file-input',{fileName:'brief.json',content:'{"token":"ordinary data","direction":"Quiet"}',loaded:true}),decode:node('decode','json-decode')},{a:wire('a','file','decode')});
    const exported=exportWorkflow(g);assert.equal(exported.kind,'lattice-workflow');
    const restored=parseWorkflow(JSON.stringify(exported));assert.equal(restored.ok,true,JSON.stringify(restored));
    assert.equal(restored.data.nodes.file.content,g.nodes.file.content);
    assert.equal(workflowSignature(restored.data),workflowSignature(g));
    const result=await runWorkflow(restored.data,{target:{workflowId:g.id,instancePath:[],nodeId:'decode',portId:'out'}});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.ok(JSON.stringify(result.recording).includes('ordinary data'));
    g.nodes.file.content='{}';assert.notEqual(workflowSignature(g),workflowSignature(restored.data));
});

test('static subgraphs accept portable and owned host prompt sources',()=>{
    for(const operation of ['text','file-input','prompt-source']) {
        const g=graph('pre',{source:node('source',operation)});
        const wrapped=prepareCreateFromSelection(g,{nodeIds:['source'],definitionId:'source-'+operation,name:'Source'});
        assert.equal(wrapped.ok,true,JSON.stringify(wrapped));
    }
});
