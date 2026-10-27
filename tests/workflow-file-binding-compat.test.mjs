import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDefinitionIdentity, validateDefinition } from '../src/workflow/definitions.js';
import { operationDefaults, operationFor, semanticControlsForNode } from '../src/workflow/catalog.js';
import { exportSubgraph, parseSubgraph } from '../src/workflow/packages.js';

// Canonical version-1 Read File body before the additive bindToChat control.
const LEGACY_HASH='sha256:ca402413158365bfdc2ac34d425064fc6a8539ff69f4fb1542c3fb4bf1c3c2db';
const legacy=()=>({id:'file-binding-compat',version:1,name:'Legacy file reader',parameters:[],interface:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{read:{id:'read',type:'workflow',operation:'read-file',operationVersion:1,targetId:'scene.json',modelRole:null}},wires:{}}});
const must=result=>{assert.equal(result.ok,true,JSON.stringify(result.error));return result.data;};

test('unbound Read File keeps its legacy semantic pin for omitted and false binding',()=>{
    const node={id:'read',type:'workflow',...operationDefaults('read-file')};
    assert.equal(operationFor(node).defaults.bindToChat,false);
    assert.equal(Object.hasOwn(node,'bindToChat'),false);
    assert.equal(Object.hasOwn(semanticControlsForNode({...node,bindToChat:false}),'bindToChat'),false);
    let previous;
    for(const explicit of [false,true]){
        const input=legacy();if(explicit)input.body.nodes.read.bindToChat=false;
        const identity=must(computeDefinitionIdentity(input));assert.equal(identity.semanticHash,LEGACY_HASH);
        assert.equal(Object.hasOwn(identity.materializedDefinition.body.nodes.read,'bindToChat'),false);
        if(previous)assert.deepEqual(identity.materializedDefinition,previous);previous=identity.materializedDefinition;
        const saved={...identity.materializedDefinition,semanticHash:identity.semanticHash};
        must(validateDefinition(saved));assert.deepEqual(must(parseSubgraph(JSON.stringify(exportSubgraph(saved)))).definition,saved);
    }
});

test('bound Read File changes its semantic pin and retains binding through package round trips',()=>{
    const input=legacy();input.body.nodes.read.bindToChat=true;
    const identity=must(computeDefinitionIdentity(input));assert.notEqual(identity.semanticHash,LEGACY_HASH);
    assert.equal(JSON.parse(identity.canonicalContent).body.nodes.read.controls.bindToChat,true);
    const saved={...identity.materializedDefinition,semanticHash:identity.semanticHash};must(validateDefinition(saved));
    const parsed=must(parseSubgraph(JSON.stringify(exportSubgraph(saved))));assert.equal(parsed.definition.body.nodes.read.bindToChat,true);
});
