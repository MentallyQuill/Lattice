import assert from 'node:assert/strict';
import test from 'node:test';
import {computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definition-data.js?v=0.27.3';
import {iterationHelperChoices} from '../src/ui/configured-node-creation.js?v=0.27.3';
import {prepareWorkspaceViews} from '../src/ui/workspace-preparation.js?v=0.27.3';
import {siblingWorkflow} from './fixtures/workflow-prepared-fixture.mjs';

function itemHelper() {
    const draft={id:'prepared-item-helper',version:1,name:'Prepared item helper',interface:[
        {id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'input'},
        {id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'output'},
    ],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{
        input:{id:'input',type:'subgraph-input',interfacePortId:'item'},
        output:{id:'output',type:'subgraph-output',interfacePortId:'result'},
    },wires:{same:{id:'same',route:'wire',from:'input',fromPort:'out',to:'output',toPort:'in'}}}};
    const identity=computeDefinitionIdentity(draft); assert.equal(identity.ok,true,JSON.stringify(identity));
    return {...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash};
}

function nestedOwnKeyItemHelper() {
    const payload=JSON.parse('{"__proto__":{"polluted":false},"constructor":{"prototype":false}}');
    const childDraft={id:'prepared-own-key-condition',version:1,name:'Own-key condition',interface:[
        {id:'in',label:'Input',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},
        {id:'out',label:'Output',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'},
    ],parameters:[{id:'comparison',label:'Comparison',target:{instancePath:[],nodeId:'check',controlId:'value'}}],body:{schema:3,runtime:2,mode:'native-pre',nodes:{
        entry:{id:'entry',type:'subgraph-input',interfacePortId:'in'},
        check:{id:'check',type:'workflow',operation:'condition',value:null},
        exit:{id:'exit',type:'subgraph-output',interfacePortId:'out'},
    },wires:{a:{id:'a',route:'wire',from:'entry',fromPort:'out',to:'check',toPort:'in'},b:{id:'b',route:'wire',from:'check',fromPort:'out',to:'exit',toPort:'in'}}}};
    const childIdentity=computeDefinitionIdentity(childDraft);assert.equal(childIdentity.ok,true,JSON.stringify(childIdentity));
    const child={...childIdentity.data.materializedDefinition,semanticHash:childIdentity.data.semanticHash},childRef={id:child.id,version:child.version,semanticHash:child.semanticHash},snapshots={[definitionRefKey(child)]:child};
    const parentDraft={id:'prepared-own-key-item-helper',version:1,name:'Own-key item helper',interface:[
        {id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},
        {id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'},
    ],parameters:[],body:{schema:3,runtime:2,mode:'native-pre',nodes:{
        entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},
        inner:{id:'inner',type:'subgraph',definition:childRef,parameterOverrides:{comparison:payload},roleOverrides:{},nodeBindingOverrides:{}},
        exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},
    },wires:{a:{id:'a',route:'wire',from:'entry',fromPort:'out',to:'inner',toPort:'in'},b:{id:'b',route:'wire',from:'inner',fromPort:'out',to:'exit',toPort:'in'}}}};
    const parentIdentity=computeDefinitionIdentity(parentDraft,{snapshots});assert.equal(parentIdentity.ok,true,JSON.stringify(parentIdentity));
    const parent={...parentIdentity.data.materializedDefinition,semanticHash:parentIdentity.data.semanticHash};
    return {parent,definitions:{...snapshots,[definitionRefKey(parent)]:parent}};
}

test('iteration helper discovery keeps exact admitted choices and skips a malformed definition table',()=>{
    const helper=itemHelper(),root={definitions:{[definitionRefKey(helper)]:helper},roles:{}};
    const choices=iterationHelperChoices(root,[{id:'local',name:'Local'}]);
    assert.equal(choices.length,1);assert.equal(choices[0].label,'Prepared item helper');assert.equal(Object.isFrozen(choices),true);
    const malformed=structuredClone(root);malformed.definitions.bad={id:'bad'};
    assert.deepEqual(iterationHelperChoices(malformed),[]);
});

test('iteration helper discovery retains valid nested exposed JSON overrides with own prototype keys',()=>{
    const {parent,definitions}=nestedOwnKeyItemHelper(),choices=iterationHelperChoices({definitions,roles:{}});
    assert.deepEqual(choices.map(choice=>choice.ref.id),[parent.id]);
    assert.equal(choices[0].label,'Own-key item helper');
});

test('workspace preparation detaches one prepared helper choice DTO for every composition view',()=>{
    const root=siblingWorkflow(),helper=itemHelper();root.definitions[definitionRefKey(helper)]=helper;
    const prepared=prepareWorkspaceViews(root);assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const helpers=prepared.data.preparedViews.map(view=>view.drawBase.iterationHelpers);
    assert.equal(helpers.length,3);for(const choices of helpers)assert.equal(choices.length,1);
    assert.notEqual(helpers[0],helpers[1]);assert.notEqual(helpers[0][0],helpers[1][0]);
    assert.equal(Object.isFrozen(helpers[0]),true);assert.equal(Object.isFrozen(helpers[0][0]),true);
    assert.equal(helpers[1][0].label,'Prepared item helper');assert.equal(root.definitions[definitionRefKey(helper)].name,'Prepared item helper');
});
