import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareQualifiedScopeEdit } from '../src/workflow/definition-library.js?v=0.30.1';
import { portsForNode } from '../src/workflow/catalog.js?v=0.30.1';
import { validateNodeModifiers } from '../src/workflow/modifiers.js?v=0.30.1';
import { prepareNativeNodeEdit } from '../src/workflow/definition-library.js?v=0.30.1';
const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');

test('atomic detail controls preserve connections and reject incompatible or stale edits', () => {
    const current={id:'atomic-details',schema:3,runtime:2,mode:'native-unified',nodes:{call:{id:'call',type:'workflow',operation:'model-call',outputKind:'data',schema:'{"type":"object"}'},consumer:{id:'consumer',type:'workflow',operation:'reroute',artifactKind:'data'}},wires:{result:{id:'result',route:'wire',from:'call',fromPort:'out',to:'consumer',toPort:'in'}},definitions:{},groups:{},portals:{},roles:{}};
    let stale=false,committed;
    const env={editSubgraphInterface(){},current,detailCapture:()=>stale?{ok:false,error:{code:'STALE_CONTEXT',message:'changed'}}:{ok:true,data:{}},scopeCommand:()=>({viewPath:[]}),prepareNode:(_root,command)=>prepareNativeNodeEdit(current,command),commitCaptured:(_capture,prepared)=>{if(prepared.ok)committed=prepared.data.candidate;return prepared;}};
    const start=source.indexOf('const nodeDetailsActions = {'),end=source.indexOf('\nconst outputPreviewActions',start);
    const actions=Function('env','with(env){'+source.slice(start,end)+';return nodeDetailsActions;}')(env);
    assert.equal(typeof actions.editControls,'function');
    const before=structuredClone(current),selection={address:{nodeId:'call'}};
    assert.equal(actions.editControls(selection,{outputKind:'text',schema:''}).error.code,'ARTIFACT_KIND');
    assert.equal(committed,undefined);assert.deepEqual(current,before);
    delete current.wires.result;
    assert.equal(actions.editControls(selection,{outputKind:'text',schema:''}).ok,true);
    assert.equal(committed.nodes.call.schema,'');assert.equal(committed.nodes.call.outputKind,'text');
    stale=true;assert.equal(actions.editControls(selection,{maxTokens:100}).error.code,'STALE_CONTEXT');
});
function actual(name, env) {
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Actual controller function ' + name);
    const end = source.indexOf('\n}', start) + 2;
    return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}
test('Shift+C toggles only the selected graph card outside editing or active gestures', () => {
    const node = {id:'text',type:'workflow',operation:'text',presentation:{compact:false}};
    const host = {contains: element => element?.graph === true};
    const env = {isCommentFrame:()=>false,selectedKind:'node',selected:node,editorDraw:{nodes:{text:node},nativeCards:{text:{}}},canvas:{host}, document:{activeElement:{graph:true}},typing:()=>false,commentShortcutAvailable:()=>true,presentNode(id,key,value){node.presentation[key]=value;}};
    const toggle = actual('compactCardShortcut', env);
    const event = {key:'C',shiftKey:true,ctrlKey:false,metaKey:false,altKey:false,repeat:false};
    assert.equal(toggle(event), true);
    assert.equal(node.presentation.compact,true);
    assert.equal(toggle({...event,repeat:true}),false);
    env.document.activeElement={graph:false};
    assert.equal(toggle(event),false);
    env.document.activeElement={graph:true}; env.typing=()=>true;
    assert.equal(toggle(event),false);
    env.typing=()=>false; env.commentShortcutAvailable=()=>false;
    assert.equal(toggle(event),false);
    env.commentShortcutAvailable=()=>true; env.selectedKind='group';
    assert.equal(toggle(event),false);
});

test('modifier edits validate a complete candidate and reject stale selections', () => {
    const current = {id:'commands',schema:3,runtime:2,mode:'native-pre',nodes:{text:{id:'text',type:'workflow',operation:'text',text:'  hello  '}},wires:{},groups:{},portals:{},definitions:{},roles:{}};
    let stale=false, committed;
    const env={editSubgraphInterface(){},current,portsForNode,validateNodeModifiers,detailCapture:()=>stale?{ok:false,error:{code:'STALE_CONTEXT',message:'changed'}}:{ok:true,data:{}},scopeCommand:()=>({viewPath:[]}),commitCaptured:(capture,prepared)=>{if(prepared.ok)committed=prepared.data.candidate;return prepared;}};
    env.prepareScopeMutation=(capture,mutate)=>prepareQualifiedScopeEdit(current,{viewPath:[]},mutate);
    const start=source.indexOf('const nodeDetailsActions = {'),end=source.indexOf('\nconst outputPreviewActions',start);
    const actions=Function('env','with(env){'+source.slice(start,end)+';return nodeDetailsActions;}')(env);
    assert.equal(typeof actions.editModifiers,'function');
    const entry={id:'trim-1',type:'trim',version:1,enabled:true,settings:{edges:'both'}};
    const selection={address:{nodeId:'text'}};
    assert.equal(actions.editModifiers(selection,[entry]).ok,true);
    assert.deepEqual(committed.nodes.text.modifiers,[entry]);
    assert.equal(current.nodes.text.modifiers,undefined,'Preparation does not mutate live graph');
    assert.equal(actions.editModifiers(selection,[{...entry,type:'unknown'}]).ok,false);
    assert.deepEqual(committed.nodes.text.modifiers,[entry]);
    stale=true;
    assert.equal(actions.editModifiers(selection,[]).error.code,'STALE_CONTEXT');
});
