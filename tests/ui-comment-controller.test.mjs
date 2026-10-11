import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { prepareWorkspaceViews, prepareLibraryViews, projectEditorDraw, projectWorkspacePanels } from '../src/ui/workspace-preparation.js?v=0.26.0';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.26.0';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js?v=0.26.0';
import { prepareCommentEdit } from '../src/workflow/comment-edits.js?v=0.26.0';
import { prepareSubgraphNodeDeletion } from '../src/workflow/subgraph-authoring.js?v=0.26.0';
import { createCommentFrame, fitCommentFrame, containedCommentNodes, isCommentFrame } from '../src/canvas/comment-frames.js?v=0.26.0';
import { captureCommentPresentation, applyCommentPresentation, applyCommentGroupPresentation } from '../src/ui/comment-presentation.js?v=0.26.0';
import { viewIdentityKey } from '../src/ui/view-state.js?v=0.26.0';
import { workflowSignature } from '../src/workflow/runtime.js?v=0.26.0';
import { makeLocalCopy, prepareQualifiedScopeEdit, reconcileOwners } from '../src/workflow/definition-library.js?v=0.26.0';
import { ownershipEntries, prunePrivateSnapshots } from '../src/workflow/composition-edit.js?v=0.26.0';
import { makeClip, makeDefinitionClip, readClip, prepareClipPaste } from '../src/workflow/clipboard.js?v=0.26.0';
import { graphSemanticSignature } from '../src/workflow/ports.js?v=0.26.0';
import { definitionRefKey } from '../src/workflow/definition-data.js?v=0.26.0';
import { siblingWorkflow, nestedWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
import * as H from '../src/history.js?v=0.26.0';

const controllerText = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function controllerFunction(name, env) {
    const start = controllerText.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Actual controller function ' + name);
    const lineEnd = controllerText.indexOf('\n', start), firstLine = controllerText.slice(start, lineEnd).trim();
    const end = firstLine.endsWith('}') ? lineEnd : controllerText.indexOf('\n}', start) + 2;
    assert.ok(end > start, 'Bounded controller body ' + name);
    const prefix = controllerText.slice(start - 6, start) === 'async ' ? 'async ' : '';
    return Function('env', 'with(env){' + prefix + controllerText.slice(start, end) + ';return ' + name + ';}')(env);
}
function controllerActions(name, next, env) {
    const start = controllerText.indexOf('const ' + name + ' = {'), end = controllerText.indexOf('\nconst ' + next, start);
    assert.ok(start >= 0 && end > start, 'Actual controller actions ' + name);
    return Function('env', 'with(env){' + controllerText.slice(start, end) + ';return ' + name + ';}')(env);
}
function controllerKeydown(env) {
    const prefix = "document.addEventListener('keydown', ", start = controllerText.indexOf(prefix + 'event => {');
    const end = controllerText.indexOf('\n    });', start);
    assert.ok(start >= 0 && end > start, 'Actual controller key handler');
    return Function('env', 'with(env){return ' + controllerText.slice(start + prefix.length, end + 6) + ';}')(env);
}
const frame = () => ({ id:'frame',type:'note',commentFrame:true,moveContents:true,title:'Comment',content:'Notes',color:'#637d89',x:80,y:0,w:220,h:160 });
let sequence = 0;
function fixture(root = { id:'comment-controller-' + ++sequence,schema:3,runtime:2,mode:'native-pre',nodes:{ source:{id:'source',type:'workflow',operation:'scene-context',x:0,y:0},outside:{id:'outside',type:'workflow',operation:'scene-context',x:600,y:100},frame:frame() },wires:{},groups:{},portals:{},roles:{},definitions:{} }) {
    const prepared = prepareWorkspaceViews(root); assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const library = prepareLibraryViews(root.id,root.definitions); assert.equal(library.ok,true,JSON.stringify(library));
    const session = createGraphViewSession({root,activationId:'comment-'+sequence,navigation:[...prepared.data.navigation,...library.data.navigation],preparedViews:[...prepared.data.preparedViews,...library.data.preparedViews]}).data;
    const stored = {workspaceViews:{}}, failures = []; let commits = 0;
    const canvas = {multi:new Set(),selection:null,pointer:{x:12,y:18},host:{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})},widthOf:n=>n.w ?? 160,heightOf:n=>n.h ?? 48,toGraph:(x,y)=>({x,y}),setMulti(ids){this.multi=new Set(ids);},select(item){this.selection=item;},cancelGesture(){}};
    const env = { current:root,graphViews:session,canvas,editorDraw:projectEditorDraw(session.readEditor()),editorCaptures:new WeakMap(),commentCaptures:new WeakMap(),commentPresentationEffects:new WeakMap(),pendingCommentPresentation:new WeakMap(),pendingSubgraphPresentation:new WeakMap(),workspaceRevision:0,workspaceIssue:'',selected:null,selectedKind:null,pendingDocumentPrompt:null,
        isOpen:()=>true,activeEditRoot:()=>env.current,readGraphEditContext:()=>env.graphViews.readEditContext(),captureGraphEditContext,prepareCommentEdit,createCommentFrame,fitCommentFrame,containedCommentNodes,isCommentFrame,captureCommentPresentation,applyCommentPresentation,applyCommentGroupPresentation,viewIdentityKey,projectEditorDraw,definitionRefKey,H,groupMembers:(graph,id)=>Object.values(graph.nodes).filter(node=>node.inGroup===id),
        prepareSubgraphNodeDeletion,prepareQualifiedScopeEdit,reconcileOwners,ownershipEntries,prunePrivateSnapshots,makeClip,makeDefinitionClip,readClip,prepareClipPaste,okToDelete:()=>true,detachedClip:null,flashHistoryNote(){},navigator:{clipboard:{async writeText(value){env.copied=value;}}},
        activeWorkflow:()=>root,activeWorkspaceViews:()=>stored.workspaceViews[root.id],setActiveWorkspaceViews:data=>{stored.workspaceViews[root.id]=data;},settings:()=>stored,save(){},toast(message){failures.push(message);},persistGraphViews(){const saved=env.graphViews?.serialize();if(saved?.ok)stored.workspaceViews[root.id]=saved.data;},workbench:{focusCommentTitle(id,check){if(check())env.focused=id;}},graphDocumentHooks:{},
        commitGraphEdit(graph,command){const result=commitPreparedGraph(graph,command);if(result.ok && result.data.changed){commits++;refresh();}return result;},
    };
    function refresh(){const content=prepareWorkspaceViews(root);assert.equal(content.ok,true,JSON.stringify(content));const shelf=prepareLibraryViews(root.id,root.definitions);const result=session.replacePreparedViews({navigation:[...content.data.navigation,...shelf.data.navigation],preparedViews:[...content.data.preparedViews,...shelf.data.preparedViews]});assert.equal(result.ok,true);env.editorDraw=projectEditorDraw(session.readEditor());}
    for(const name of ['captureEditor','editorCurrent','scopeCommand','commitCaptured','detailCapture','captureCommentEdit','commentGroupOrigin','commentBounds','commentSelectionIds','commentLocation','commitComment','addComment','commentCommand','commentPatch','commentLayout','commentLayoutIds','commentLayoutGroups','commentDocumentState','commentPresentationFailure','commentPresentationCoordinates','deferCommentPresentation','applyCommentPresentationEffect','applyPendingCommentPresentation','handleCommentHistory','currentPick','clipForPick','copySelection','pasteOnCanvas','duplicateSelected','deleteNativeSelection'])env[name]=controllerFunction(name,env);
    env.applyPendingSubgraphPresentation=controllerFunction('applyPendingSubgraphPresentation',env);
    env.activateEditorDraw=()=>{env.applyPendingCommentPresentation();env.editorDraw=projectEditorDraw(session.readEditor());};
    const actions=controllerActions('commentDetailsActions','nodeDetailsActions',env);
    const unlisten=H.onHistoryChange((graph,event)=>env.handleCommentHistory(graph,event)); H.track(root);
    return {root,session,env,canvas,stored,failures,actions,refresh,unlisten,commits:()=>commits};
}
const move = (env,dx=20,dy=10) => ['frame','source'].map(id=>{const node=env.editorDraw.nodes[id];return {id,x:node.x+dx,y:node.y+dy,...(isCommentFrame(node)?{w:node.w,h:node.h}:{})};});

test('comment layout authors visible coordinates once and history restores only affected overlay axes', () => {
    const f=fixture();try {
        f.session.updateView({nodePresentation:{source:{alias:'First alias',compact:true,x:100,y:50},outside:{x:700,y:200}}});f.env.activateEditorDraw();
        const signature=workflowSignature(f.root), capture=f.env.captureCommentEdit(), result=f.env.commentLayout(capture,move(f.env));
        assert.equal(result.ok,true,JSON.stringify(result));assert.equal(f.commits(),1);assert.equal(workflowSignature(f.root),signature);
        assert.deepEqual({x:f.root.nodes.source.x,y:f.root.nodes.source.y},{x:120,y:60});assert.deepEqual(f.session.readEditor().view.nodePresentation.source,{alias:'First alias',compact:true});
        f.session.updateView({nodePresentation:{...f.session.readEditor().view.nodePresentation,source:{alias:'Current alias',compact:false},outside:{x:800,y:300}}});
        assert.ok(H.undo(f.root));f.refresh();f.env.activateEditorDraw();assert.equal(f.env.editorDraw.nodes.source.x,100);assert.equal(f.env.editorDraw.nodes.source.y,50);
        assert.deepEqual(f.session.readEditor().view.nodePresentation.source,{alias:'Current alias',compact:false,x:100,y:50});assert.deepEqual(f.session.readEditor().view.nodePresentation.outside,{x:800,y:300});
        assert.equal(H.undo(f.root),null);assert.ok(H.redo(f.root));f.refresh();f.env.activateEditorDraw();assert.equal(f.env.editorDraw.nodes.source.x,120);assert.equal(f.env.editorDraw.nodes.source.y,60);
    } finally {f.unlisten();}
});

test('comment gestures reject a replaced context before any document or view mutation', () => {
    const f=fixture();try {f.session.updateView({nodePresentation:{source:{x:100,y:50}}});f.env.activateEditorDraw();const capture=f.env.captureCommentEdit(),before=structuredClone(f.root),view=structuredClone(f.session.serialize().data);f.session.invalidateEditorContext();assert.equal(f.env.commentLayout(capture,move(f.env)).ok,false);assert.deepEqual(f.root,before);assert.deepEqual(f.session.serialize().data,view);assert.equal(f.commits(),0);}finally{f.unlisten();}
});

test('layout membership is the captured frame containment and cannot include an unrelated node', () => {
    const f=fixture();try {f.session.updateView({nodePresentation:{source:{x:100,y:50}}});f.env.activateEditorDraw();const capture=f.env.captureCommentEdit(),before=structuredClone(f.root);const positions=move(f.env);positions.push({id:'outside',x:620,y:110});assert.equal(f.env.commentLayout(capture,positions).ok,false);assert.deepEqual(f.root,before);}finally{f.unlisten();}
});

test('details reject stale envelopes and delete only their own frame', () => {
    const f=fixture();try {const view=f.session.readEditor().view,selection={selectionKey:JSON.stringify([view.key,'frame']),revision:f.session.readEditContext().sessionId+':0',address:{workflowId:f.root.id,instancePath:[],nodeId:'frame'}};assert.equal(f.actions.patch({...selection,revision:'expired'},{title:'Wrong'}).ok,false);assert.equal(f.root.nodes.frame.title,'Comment');const before=structuredClone(f.root.nodes.source);assert.equal(f.actions.command(selection,'delete').ok,true);assert.equal(f.root.nodes.frame,undefined);assert.deepEqual(f.root.nodes.source,before);assert.equal(f.commits(),1);}finally{f.unlisten();}
});

test('creation wraps ordinary selected nodes, selects its frame and focuses the title through a fresh capability', () => {
    const f=fixture();try {f.canvas.multi=new Set(['source','frame']);const result=f.env.addComment();assert.equal(result.ok,true,JSON.stringify(result));const comment=f.root.nodes.comment_1;assert.ok(comment);assert.deepEqual({x:comment.x,y:comment.y,w:comment.w,h:comment.h},{x:-24,y:-60,w:208,h:132});assert.deepEqual(f.canvas.selection,{kind:'node',id:comment.id});assert.equal(f.canvas.multi.size,0);assert.equal(f.env.focused,comment.id);}finally{f.unlisten();}
});

test('comment frame projection ignores coordinate overlays and uses a dedicated captured Details envelope', () => {
    const f=fixture();try {f.session.updateView({selection:{primary:{kind:'node',id:'frame'},multi:[]},nodePresentation:{frame:{x:999,y:888},source:{x:20,y:30}}});const drawing=projectEditorDraw(f.session.readEditor());assert.equal(drawing.nodes.frame.x,80);assert.equal(drawing.nodes.frame.y,0);assert.equal(drawing.nodes.source.x,20);const workflow={graphId:f.root.id,selectedId:'frame',nodes:[],profiles:[],targets:[],rows:[],issues:[],callBound:0};const panels=projectWorkspacePanels(f.session.readEditor(),workflow,{busy:false},'revision',null,null);assert.equal(panels.nodeDetails,null);assert.equal(panels.commentDetails.comment.title,'Comment');assert.equal(panels.commentDetails.selection.address.nodeId,'frame');assert.equal(panels.commentDetails.selection.revision,'revision');}finally{f.unlisten();}
});

test('shared child and library comment captures are read-only and cannot author changes', () => {
    const root=structuredClone(siblingWorkflow());root.id='comment-readonly-'+ ++sequence;Object.values(root.definitions)[0].body.nodes.frame=frame();const f=fixture(root);try {assert.equal(f.session.openInstance(['first/path']).ok,true);f.env.activateEditorDraw();const before=structuredClone(root);assert.equal(f.env.captureCommentEdit(),null);assert.equal(f.env.addComment().ok,false);const {id,version,semanticHash}=Object.values(root.definitions)[0];assert.equal(f.session.openLibrary({id,version,semanticHash}).ok,true);f.env.activateEditorDraw();assert.equal(f.env.captureCommentEdit(),null);assert.deepEqual(root,before);}finally{f.unlisten();}
});

test('history applies exact presentation to a closed retained view without navigation', () => {
    const copied=makeLocalCopy(siblingWorkflow(),{instancePath:['first/path'],id:'private-comment-'+ ++sequence});assert.equal(copied.ok,true,JSON.stringify(copied));const root=copied.data.candidate;root.id='comment-owned-'+sequence;const body=root.definitions[definitionRefKey(root.nodes['first/path'].definition)].body;body.nodes.frame={...frame(),x:0,y:0,w:1000,h:500};for(const node of Object.values(body.nodes)){if(node.id!=='frame'){node.x=100;node.y=100;}}
    const f=fixture(root);try {f.session.openInstance(['first/path']);f.session.updateView({nodePresentation:{work:{x:140,y:150,alias:'Work'}}});f.env.activateEditorDraw();const childKey=f.session.readEditor().view.key,capture=f.env.captureCommentEdit(),positions=Object.values(f.env.editorDraw.nodes).map(node=>({id:node.id,x:node.x+20,y:node.y+10,...(isCommentFrame(node)?{w:node.w,h:node.h}:{})}));assert.equal(f.env.commentLayout(capture,positions).ok,true);f.session.closeView(childKey);const active=f.session.readEditor().view.key;assert.ok(H.undo(root));assert.equal(f.session.readEditor().view.key,active);const closed=f.session.project().graphViews.closedViews.find(view=>view.key===childKey);assert.equal(closed.nodePresentation.work.x,140);assert.equal(closed.nodePresentation.work.alias,'Work');}finally{f.unlisten();}
});

test('mixed coordinate presence survives undo and repeated authored transitions keep separate view captures', () => {
    const graph={id:'comment-mixed-'+ ++sequence,schema:3,runtime:2,mode:'native-pre',nodes:{source:{id:'source',type:'workflow',operation:'scene-context',x:0,y:80},outside:{id:'outside',type:'workflow',operation:'scene-context',x:600,y:100},frame:{...frame(),y:30}},wires:{},groups:{},portals:{},roles:{},definitions:{}};
    const f=fixture(graph);try {f.session.updateView({nodePresentation:{source:{x:100}}});f.env.activateEditorDraw();assert.equal(f.env.commentLayout(f.env.captureCommentEdit(),move(f.env)).ok,true);assert.ok(H.undo(graph));f.refresh();f.env.activateEditorDraw();assert.deepEqual(f.session.readEditor().view.nodePresentation.source,{x:100});assert.equal(f.env.editorDraw.nodes.source.y,80);
        f.session.updateView({nodePresentation:{source:{x:100,y:80}}});f.env.activateEditorDraw();const target=[{id:'frame',x:100,y:40,w:220,h:160},{id:'source',x:120,y:90}];assert.equal(f.env.commentLayout(f.env.captureCommentEdit(),target).ok,true);assert.ok(H.undo(graph));f.refresh();f.env.activateEditorDraw();assert.deepEqual(f.session.readEditor().view.nodePresentation.source,{x:100,y:80});assert.equal(f.env.editorDraw.nodes.source.x,100);
    }finally{f.unlisten();}
});

test('history restores saved presentation while the original root has no live view session', () => {
    const f=fixture();try {f.session.updateView({nodePresentation:{source:{x:100,y:50,alias:'Saved alias'}}});f.env.activateEditorDraw();assert.equal(f.env.commentLayout(f.env.captureCommentEdit(),move(f.env)).ok,true);f.env.graphViews=null;assert.ok(H.undo(f.root));const saved=f.stored.workspaceViews[f.root.id].views[0];assert.deepEqual(saved.nodePresentation.source,{alias:'Saved alias',x:100,y:50});assert.ok(H.redo(f.root));assert.deepEqual(f.stored.workspaceViews[f.root.id].views[0].nodePresentation.source,{alias:'Saved alias'});}finally{f.unlisten();}
});

test('removed view history stays pending and applies before the restored child drawing is activated', () => {
    const copied=makeLocalCopy(siblingWorkflow(),{instancePath:['first/path'],id:'private-removed-'+ ++sequence});assert.equal(copied.ok,true);const graph=copied.data.candidate;graph.id='comment-removed-'+sequence;const body=graph.definitions[definitionRefKey(graph.nodes['first/path'].definition)].body;body.nodes.frame={...frame(),x:0,y:0,w:1000,h:500};for(const node of Object.values(body.nodes))if(node.id!=='frame'){node.x=100;node.y=100;}
    const f=fixture(graph);try {assert.equal(f.session.openInstance(['first/path']).ok,true);f.session.updateView({nodePresentation:{work:{x:140,y:150}}});f.env.activateEditorDraw();const key=f.session.readEditor().view.key,positions=Object.values(f.env.editorDraw.nodes).map(node=>({id:node.id,x:node.x+20,y:node.y+10,...(isCommentFrame(node)?{w:node.w,h:node.h}:{})}));assert.equal(f.env.commentLayout(f.env.captureCommentEdit(),positions).ok,true);
        const prepared=prepareWorkspaceViews(graph).data;assert.equal(f.session.replacePreparedViews({navigation:[],preparedViews:prepared.preparedViews.filter(view=>view.identity.kind==='root')}).ok,true);const rootKey=f.session.readEditor().view.key;assert.ok(H.undo(graph));assert.equal(f.env.pendingCommentPresentation.get(graph).has(key),true);f.refresh();assert.equal(f.session.readEditor().view.key,rootKey);assert.equal(f.session.openInstance(['first/path']).ok,true);f.env.activateEditorDraw();assert.equal(f.env.editorDraw.nodes.work.x,140);assert.equal(f.env.editorDraw.nodes.work.y,150);assert.equal(f.env.pendingCommentPresentation.get(graph).has(key),false);
    }finally{f.unlisten();}
});

test('a rejected view update is reported and retained for recovery without dropping unrelated data', () => {
    const f=fixture();try {f.session.updateView({nodePresentation:{source:{x:100,y:50},outside:{alias:'Unrelated'}}});f.env.activateEditorDraw();const capture=f.env.captureCommentEdit(),before=structuredClone(f.session.readEditor().view.nodePresentation);f.env.graphViews={...f.session,updateView:()=>({ok:false,error:{code:'VIEW_LIMIT',message:'Forced presentation limit'}})};const result=f.env.commentLayout(capture,move(f.env));assert.equal(result.ok,false);assert.equal(result.error.code,'COMMENT_PRESENTATION');assert.deepEqual(f.session.readEditor().view.nodePresentation,before);assert.ok(f.failures.includes('Forced presentation limit'));assert.equal(f.env.pendingCommentPresentation.get(f.root).size,1);f.env.graphViews=f.session;f.env.activateEditorDraw();assert.deepEqual(f.session.readEditor().view.nodePresentation.outside,{alias:'Unrelated'});assert.equal(f.env.editorDraw.nodes.source.x,120);assert.equal(f.env.pendingCommentPresentation.get(f.root).size,0);
    }finally{f.unlisten();}
});

test('C creation is unavailable during wire search, content gestures and document transition', () => {
    const env={documentTransition:false,canvas:{hasContentGesture:()=>false},nativeWireBridge:{hasContentGesture:()=>false}},available=controllerFunction('commentShortcutAvailable',env);assert.equal(available(),true);env.nativeWireBridge.hasContentGesture=()=>true;assert.equal(available(),false);env.nativeWireBridge.hasContentGesture=()=>false;env.canvas.hasContentGesture=()=>true;assert.equal(available(),false);env.canvas.hasContentGesture=()=>false;env.documentTransition=true;assert.equal(available(),false);
});

test('movement uses containment bounds captured before a later card measurement changes', () => {
    const f=fixture();try {f.session.updateView({nodePresentation:{source:{x:100,y:50}}});f.env.activateEditorDraw();const capture=f.env.captureCommentEdit(),positions=move(f.env);f.canvas.widthOf=node=>isCommentFrame(node)?node.w:300;assert.equal(f.env.commentLayout(capture,positions).ok,true);assert.equal(f.root.nodes.source.x,120);}finally{f.unlisten();}
});

test('disjoint deferred Undo effects both restore while later Redo changes only its affected node', () => {
    const copied=makeLocalCopy(siblingWorkflow(),{instancePath:['first/path'],id:'private-disjoint-'+ ++sequence});assert.equal(copied.ok,true);const graph=copied.data.candidate;graph.id='comment-disjoint-'+sequence;const body=graph.definitions[definitionRefKey(graph.nodes['first/path'].definition)].body;body.nodes.frame={...frame(),x:0,y:0,w:1000,h:500,moveContents:false};for(const node of Object.values(body.nodes))if(node.id!=='frame'){node.x=100;node.y=100;}
    const f=fixture(graph);try {
        assert.equal(f.session.openInstance(['first/path']).ok,true);f.session.updateView({nodePresentation:{work:{x:140,y:150,alias:'Old work'},entry:{x:180,alias:'Old entry'},exit:{x:800,y:300}}});f.env.activateEditorDraw();
        f.canvas.multi=new Set(['frame','work']);const first=['frame','work'].map(id=>{const node=f.env.editorDraw.nodes[id];return {id,x:node.x+20,y:node.y+10,...(isCommentFrame(node)?{w:node.w,h:node.h}:{})};});assert.equal(f.env.commentLayout(f.env.captureCommentEdit(),first).ok,true);
        f.canvas.multi=new Set(['frame','entry']);const second=['frame','entry'].map(id=>{const node=f.env.editorDraw.nodes[id];return {id,x:node.x+20,y:node.y+10,...(isCommentFrame(node)?{w:node.w,h:node.h}:{})};});assert.equal(f.env.commentLayout(f.env.captureCommentEdit(),second).ok,true);
        const prepared=prepareWorkspaceViews(graph).data;assert.equal(f.session.replacePreparedViews({navigation:[],preparedViews:prepared.preparedViews.filter(view=>view.identity.kind==='root')}).ok,true);const rootKey=f.session.readEditor().view.key;
        assert.ok(H.undo(graph));assert.ok(H.undo(graph));f.refresh();assert.equal(f.session.openInstance(['first/path']).ok,true);f.session.updateView({nodePresentation:{work:{alias:'Current work',compact:true},entry:{alias:'Current entry'},exit:{x:900,y:400,alias:'Unrelated'}}});f.env.activateEditorDraw();
        assert.deepEqual(f.session.readEditor().view.nodePresentation.work,{alias:'Current work',compact:true,x:140,y:150});assert.deepEqual(f.session.readEditor().view.nodePresentation.entry,{alias:'Current entry',x:180});assert.deepEqual(f.session.readEditor().view.nodePresentation.exit,{x:900,y:400,alias:'Unrelated'});
        assert.equal(f.session.replacePreparedViews({navigation:[],preparedViews:prepareWorkspaceViews(graph).data.preparedViews.filter(view=>view.identity.kind==='root')}).ok,true);
        assert.ok(H.redo(graph));assert.ok(H.redo(graph));assert.ok(H.undo(graph));f.refresh();assert.equal(f.session.readEditor().view.key,rootKey);assert.equal(f.session.openInstance(['first/path']).ok,true);f.session.updateView({nodePresentation:{work:{alias:'Latest work',x:999,y:888},entry:{alias:'Latest entry'},exit:{x:700,y:200}}});f.env.activateEditorDraw();
        assert.deepEqual(f.session.readEditor().view.nodePresentation.work,{alias:'Latest work'});assert.deepEqual(f.session.readEditor().view.nodePresentation.entry,{alias:'Latest entry',x:180});assert.deepEqual(f.session.readEditor().view.nodePresentation.exit,{x:700,y:200});assert.equal(f.env.editorDraw.nodes.work.x,160);assert.equal(f.env.editorDraw.nodes.work.y,160);
    }finally{f.unlisten();}
});

test('a real retained-view byte limit still activates a safe current Canvas while Undo presentation stays pending', async () => {
    const f=fixture();let real;try {
        f.session.updateView({nodePresentation:{source:{x:100,y:50}}});f.env.activateEditorDraw();assert.equal(f.env.commentLayout(f.env.captureCommentEdit(),move(f.env)).ok,true);
        // The producer permits bounded retained group presentation. Fill the
        // real aggregate store to its last accepted byte, leaving no room for
        // the Undo step to restore source x/y; no updateView method is replaced.
        let accepted=0,rejected=262144;
        while(accepted+1<rejected){const middle=Math.floor((accepted+rejected)/2),result=f.session.updateView({groupPresentation:{['padding_'+ 'p'.repeat(middle)]:{collapsed:false}}});if(result.ok)accepted=middle;else rejected=middle;}
        assert.equal(f.session.updateView({groupPresentation:{['padding_'+ 'p'.repeat(accepted)]:{collapsed:false}}}).ok,true);
        // History already owns a small validated coordinate effect from above.
        assert.ok(H.undo(f.root));assert.equal(f.env.pendingCommentPresentation.get(f.root).size,1);assert.ok(f.failures.some(message=>message.includes('presentation-data limit')));f.refresh();
        const {fixture:canvasFixture}=await import('./canvas-fixture.mjs');
        real=canvasFixture({nativeCard:node=>f.env.editorDraw?.nativeCards[node.id],nativeScope:()=>({workflowId:f.root.id,instancePath:[],readOnly:f.session.readEditor().readOnly}),canEdit:()=>!f.session.readEditor().readOnly,captureCommentEdit:f.env.captureCommentEdit,onCommentPatch:f.env.commentPatch,onCommentCommand:f.env.commentCommand,onCommentLayout:f.env.commentLayout});
        const oldGraph=real.canvas.graph;
        Object.assign(f.env,{canvas:real.canvas,root:document.createElement('div'),editorDraw:null,selectedPreview:null,canvasTraceRows:null,restoringEditor:false,documentTransition:false,nativeWireBridge:null,cancelConfiguredNode(){},cancelImportReview(){},replaceNativeBridge(){},syncPaneToggles(){},updateWorkflowProjection(){},paintHistory(){},workbench:{update(){}}});
        f.env.activateEditorDraw=controllerFunction('activateEditorDraw',f.env);f.env.activateEditorDraw();
        assert.notEqual(real.canvas.graph,oldGraph);assert.equal(real.canvas.graph,f.env.editorDraw);assert.equal(real.canvas.graph.id,f.root.id);assert.equal(f.env.editorDraw.nodes.source.x,0);assert.equal(real.canvas.hasContentGesture(),false);assert.equal(f.env.pendingCommentPresentation.get(f.root).size,1);assert.ok(f.env.workspaceIssue.includes('presentation-data limit'));
        for(const node of Object.values(f.env.editorDraw.nodes))if(!isCommentFrame(node))real.canvas.geometry.measure(node.id,160,48,[]);
        assert.ok(f.env.captureCommentEdit());assert.equal(f.env.addComment().ok,true);f.env.activateEditorDraw();assert.equal(real.canvas.graph,f.env.editorDraw);
        assert.equal(f.session.updateView({groupPresentation:{}}).ok,true);f.env.activateEditorDraw();assert.equal(f.env.pendingCommentPresentation.get(f.root).size,0);assert.equal(real.canvas.graph.nodes.source.x,100);assert.equal(real.canvas.graph.nodes.source.y,50);
    }finally{f.unlisten();real?.canvas.destroy();real?.host.remove();}
});

function groupedCommentFixture(owned=false) {
    let graph,scope,id;
    if(owned){const copied=makeLocalCopy(siblingWorkflow(),{instancePath:['first/path'],id:'private-group-'+ ++sequence});assert.equal(copied.ok,true);graph=copied.data.candidate;graph.id='comment-group-child-'+sequence;scope=graph.definitions[definitionRefKey(graph.nodes['first/path'].definition)].body;id='work';scope.nodes.frame={...frame(),moveContents:false};scope.nodes.work.x=0;scope.nodes.work.y=0;}
    else{graph={id:'comment-group-root-'+ ++sequence,schema:3,runtime:2,mode:'native-pre',nodes:{source:{id:'source',type:'workflow',operation:'scene-context',x:0,y:0},frame:{...frame(),moveContents:false}},wires:{},groups:{},portals:{},roles:{},definitions:{}};scope=graph;id='source';}
    scope.nodes[id].inGroup='fold';scope.groups={fold:{id:'fold',title:'Fold',members:[id],collapsed:true,x:10,y:20,frame:{x:-24,y:-48,w:208,h:132}}};
    const f=fixture(graph);if(owned)assert.equal(f.session.openInstance(['first/path']).ok,true);
    f.session.updateView({nodePresentation:{[id]:{x:100,y:50,alias:'Moved node'}},groupPresentation:{fold:{x:200,y:300,frame:{x:176,y:252,w:208,h:132},collapsed:true},unrelated:{x:800,y:900,collapsed:false}}});f.env.activateEditorDraw();f.canvas.multi=new Set(['frame',id]);
    const positions=['frame',id].map(nodeId=>{const node=f.env.editorDraw.nodes[nodeId];return {id:nodeId,x:node.x+20,y:node.y+10,...(isCommentFrame(node)?{w:node.w,h:node.h}:{})};});const groups=[{id:'fold',x:220,y:310,frame:{x:196,y:262,w:208,h:132}}];return {...f,id,positions,groups,scope:()=>owned?graph.definitions[definitionRefKey(graph.nodes['first/path'].definition)].body:graph};
}
for(const owned of [false,true])test(`mixed comment and collapsed group commit one authored ${owned?'owned child':'root'} layout and restore exact group overlay`,()=>{
    const f=groupedCommentFixture(owned);try{const signature=workflowSignature(f.root),pins=owned?structuredClone(f.root.nodes['first/path'].definition):null;assert.equal(f.env.commentLayout(f.env.captureCommentEdit(),f.positions,f.groups).ok,true);assert.equal(f.scope().groups.fold.x,220);assert.equal(f.scope().groups.fold.y,310);assert.deepEqual(f.scope().groups.fold.frame,f.groups[0].frame);assert.equal(f.commits(),1);assert.equal(workflowSignature(f.root),signature);if(owned)assert.deepEqual(f.root.nodes['first/path'].definition,pins);assert.deepEqual(f.session.readEditor().view.groupPresentation.fold,{collapsed:true});
        f.session.updateView({groupPresentation:{...f.session.readEditor().view.groupPresentation,fold:{collapsed:false}}});assert.ok(H.undo(f.root));f.refresh();f.env.activateEditorDraw();assert.deepEqual(f.session.readEditor().view.groupPresentation.fold,{collapsed:false,x:200,y:300,frame:{x:176,y:252,w:208,h:132}});assert.deepEqual(f.session.readEditor().view.groupPresentation.unrelated,{x:800,y:900,collapsed:false});assert.equal(f.env.editorDraw.groups.fold.x,200);assert.equal(f.env.editorDraw.nodes[f.id].x,100);assert.equal(H.undo(f.root),null);assert.ok(H.redo(f.root));f.refresh();f.env.activateEditorDraw();assert.deepEqual(f.session.readEditor().view.groupPresentation.fold,{collapsed:false});assert.equal(f.env.editorDraw.groups.fold.x,220);
    }finally{f.unlisten();}
});
test('mixed comment layout rejects omitted and unrelated collapsed group payloads before mutation',()=>{
    const f=groupedCommentFixture();try{const before=structuredClone(f.root),view=structuredClone(f.session.serialize().data),capture=f.env.captureCommentEdit();assert.equal(f.env.commentLayout(capture,f.positions,[]).ok,false);assert.equal(f.env.commentLayout(capture,f.positions,[{id:'missing',x:1,y:2}]).ok,false);assert.deepEqual(f.root,before);assert.deepEqual(f.session.serialize().data,view);assert.equal(f.commits(),0);}finally{f.unlisten();}
});

test('removed owned child composes mixed node and group Undo Redo intents before activation',()=>{
    const f=groupedCommentFixture(true);try{assert.equal(f.env.commentLayout(f.env.captureCommentEdit(),f.positions,f.groups).ok,true);const key=f.session.readEditor().view.key;assert.equal(f.session.replacePreparedViews({navigation:[],preparedViews:prepareWorkspaceViews(f.root).data.preparedViews.filter(view=>view.identity.kind==='root')}).ok,true);const active=f.session.readEditor().view.key;assert.ok(H.undo(f.root));assert.ok(H.redo(f.root));assert.ok(H.undo(f.root));assert.equal(f.session.readEditor().view.key,active);assert.ok(f.env.pendingCommentPresentation.get(f.root).get(key).effect.groupCoordinates.fold.frame);f.refresh();assert.equal(f.session.openInstance(['first/path']).ok,true);f.session.updateView({nodePresentation:{work:{alias:'Latest node',compact:true}},groupPresentation:{fold:{collapsed:false},unrelated:{x:900,y:800,collapsed:true}}});f.env.activateEditorDraw();assert.deepEqual(f.session.readEditor().view.nodePresentation.work,{alias:'Latest node',compact:true,x:100,y:50});assert.deepEqual(f.session.readEditor().view.groupPresentation.fold,{collapsed:false,x:200,y:300,frame:{x:176,y:252,w:208,h:132}});assert.deepEqual(f.session.readEditor().view.groupPresentation.unrelated,{x:900,y:800,collapsed:true});assert.equal(f.env.pendingCommentPresentation.get(f.root).has(key),false);}finally{f.unlisten();}
});

function ownedNestedComments(live=true) {
    const outer=makeLocalCopy(nestedWorkflow(),{instancePath:['first/path'],id:'crud-outer-'+ ++sequence});assert.equal(outer.ok,true,JSON.stringify(outer));
    const leaf=makeLocalCopy(outer.data.candidate,{instancePath:['first/path','work'],id:'crud-leaf-'+sequence});assert.equal(leaf.ok,true,JSON.stringify(leaf));
    const graph=leaf.data.candidate;graph.id='comment-crud-'+sequence;
    const outerBody=graph.definitions[definitionRefKey(graph.nodes['first/path'].definition)].body;
    const scope=graph.definitions[definitionRefKey(outerBody.nodes.work.definition)].body;
    scope.nodes.frame=frame();scope.nodes.secondFrame={...frame(),id:'secondFrame',title:'Second',x:340};
    const runtime=live?{recording:graph.recording={id:'recording',status:'completed'},activation:graph.activation={sessionId:'live'},opaqueHandle:graph.opaqueHandle={authority:'kept'}}:{};
    const f=fixture(graph);assert.equal(f.session.openInstance(['first/path','work']).ok,true);f.env.activateEditorDraw();
    return {...f,runtime,scope:()=>{const outer=f.root.definitions[definitionRefKey(f.root.nodes['first/path'].definition)].body;return f.root.definitions[definitionRefKey(outer.nodes.work.definition)].body;}};
}
function commentCrudIdentity(f) {
    return {signature:graphSemanticSignature(f.root),workflow:workflowSignature(f.root),rootPin:structuredClone(f.root.nodes['first/path'].definition),definitions:Object.entries(f.root.definitions).map(([key,d])=>({key,id:d.id,version:d.version,semanticHash:d.semanticHash,pins:Object.values(d.body.nodes).filter(node=>node.type==='subgraph').map(node=>structuredClone(node.definition))})),owners:structuredClone(f.root.localDefinitionOwners)};
}
function assertCommentCrudIdentity(f,before) {
    const after=commentCrudIdentity(f),{signature:beforeSignature,workflow:beforeWorkflow,...beforePins}=before,{signature,workflow,...pins}=after;
    assert.deepEqual(pins,beforePins);assert.ok(signature===beforeSignature,'root semantic signature retained');assert.ok(workflow===beforeWorkflow,'runtime workflow identity retained');
    for(const [key,value] of Object.entries(f.runtime))assert.equal(f.root[key],value,'retained runtime '+key);
}
for(const route of ['keyboard','menu','cut'])test(`comment-only ${route} deletion preserves owned leaf and ancestor pins in one Undo`,async()=>{
    const f=ownedNestedComments();try{const before=commentCrudIdentity(f),nodes=structuredClone(f.scope().nodes),wires=structuredClone(f.scope().wires);
        const result=route==='cut'?await f.env.copySelection(true,{nodeIds:['frame','secondFrame']}):await f.env.deleteNativeSelection(route==='keyboard'?{kind:'node',id:'frame'}:{kind:'multi',ids:['frame','secondFrame']});
        assert.equal(result,true,JSON.stringify(f.failures));assert.equal(f.commits(),1);assert.equal(f.scope().nodes.frame,undefined);if(route!=='keyboard')assert.equal(f.scope().nodes.secondFrame,undefined);assert.deepEqual(f.scope().wires,wires);assertCommentCrudIdentity(f,before);
        assert.ok(H.undo(f.root));f.refresh();f.env.activateEditorDraw();assert.deepEqual(f.scope().nodes,nodes);assertCommentCrudIdentity(f,before);assert.equal(H.undo(f.root),null);assert.ok(H.redo(f.root));f.refresh();assert.equal(f.scope().nodes.frame,undefined);assertCommentCrudIdentity(f,before);
    }finally{f.unlisten();}
});
for(const route of ['paste','duplicate'])test(`actual controller comment-only ${route} preserves nested pins and runtime identity`,()=>{
    const f=ownedNestedComments();try{const before=commentCrudIdentity(f),nodes=structuredClone(f.scope().nodes);
        if(route==='paste'){const clip=f.env.clipForPick({nodeIds:['frame','secondFrame']});assert.equal(clip.ok,true,JSON.stringify(clip));assert.equal(f.env.pasteOnCanvas(clip.data,{x:500,y:300}),true,JSON.stringify(f.failures));}
        else assert.equal(f.env.duplicateSelected(f.env.editorDraw.nodes.frame).ok,true,JSON.stringify(f.failures));
        assert.equal(f.commits(),1);assert.equal(Object.keys(f.scope().nodes).length,Object.keys(nodes).length+(route==='paste'?2:1));assertCommentCrudIdentity(f,before);
        assert.ok(H.undo(f.root));f.refresh();f.env.activateEditorDraw();assert.deepEqual(f.scope().nodes,nodes);assertCommentCrudIdentity(f,before);assert.equal(H.undo(f.root),null);assert.ok(H.redo(f.root));f.refresh();assertCommentCrudIdentity(f,before);
    }finally{f.unlisten();}
});

test('generic comment deletion rejects a stale capture and Cut retains context through clipboard writes',async()=>{
    const f=ownedNestedComments();try{const before=structuredClone(f.root);
        const deletionToken=f.env.captureEditor().data;f.session.invalidateEditorContext();const deletion=f.env.deleteNativeSelection({kind:'multi',ids:['frame','secondFrame']},deletionToken);assert.equal(await deletion,false);assert.deepEqual(f.root,before);
        let copied;f.env.navigator.clipboard.writeText=()=>new Promise(resolve=>{copied=resolve;});const cut=f.env.copySelection(true,{nodeIds:['frame','secondFrame']});f.session.invalidateEditorContext();copied();assert.equal(await cut,false);assert.deepEqual(f.root,before);assert.equal(f.commits(),0);
        const token=f.env.captureEditor().data,clip=f.env.clipForPick({nodeIds:['frame']}).data;f.session.invalidateEditorContext();assert.equal(f.env.pasteOnCanvas(clip,{x:500,y:300},token),false);assert.deepEqual(f.root,before);
    }finally{f.unlisten();}
});

test('alternate comment CRUD rejects shared child and library writes without changing document or history',async()=>{
    const graph=structuredClone(siblingWorkflow());graph.id='comment-crud-readonly-'+ ++sequence;Object.values(graph.definitions)[0].body.nodes.frame=frame();const f=fixture(graph);
    try{const before=structuredClone(graph);assert.equal(f.session.openInstance(['first/path']).ok,true);f.env.activateEditorDraw();const clip=f.env.clipForPick({nodeIds:['frame']});assert.equal(clip.ok,true);
        for(const library of [false,true]){if(library){const d=Object.values(graph.definitions)[0];assert.equal(f.session.openLibrary({id:d.id,version:d.version,semanticHash:d.semanticHash}).ok,true);f.env.activateEditorDraw();}
            assert.equal(await f.env.deleteNativeSelection({kind:'node',id:'frame'}),false);assert.equal(f.env.pasteOnCanvas(clip.data,{x:500,y:300}),false);assert.equal(f.env.duplicateSelected(f.env.editorDraw.nodes.frame).ok,false);assert.equal(await f.env.copySelection(true,{nodeIds:['frame']}),false);assert.deepEqual(graph,before);
        }assert.equal(f.commits(),0);assert.equal(H.undo(graph),null);
    }finally{f.unlisten();}
});

test('mixed comment and executable deletion keeps the existing owned definition revision behavior',async()=>{
    const f=ownedNestedComments(false);try{const pin=structuredClone(f.root.nodes['first/path'].definition),signature=graphSemanticSignature(f.root);assert.equal(await f.env.deleteNativeSelection({kind:'multi',ids:['frame','work']}),true,JSON.stringify(f.failures));assert.equal(f.scope().nodes.frame,undefined);assert.equal(f.scope().nodes.work,undefined);assert.ok(f.root.nodes['first/path'].definition.version>pin.version);assert.notEqual(graphSemanticSignature(f.root),signature);assert.equal(f.commits(),1);assert.ok(H.undo(f.root));f.refresh();assert.deepEqual(f.root.nodes['first/path'].definition,pin);assert.ok(f.scope().nodes.work);
    }finally{f.unlisten();}
});

test('selected executable nodes delete immediately without a confirmation and restore in one Undo', async () => {
    const f = fixture(); try {
        const before = structuredClone(f.root), source = f.root.nodes.source;
        f.env.okToDelete = () => assert.fail('Selected node deletion must not ask for approval');
        f.env.confirmBox = () => assert.fail('Selected node deletion must not open a dialog');
        const result = f.env.deleteNativeSelection({ kind: 'node', id: source.id });
        assert.equal(f.root.nodes.source, undefined, 'The edit commits in the keyboard event turn');
        assert.equal(await result, true); assert.equal(f.commits(), 1);
        assert.ok(H.undo(f.root)); f.refresh(); assert.deepEqual(f.root.nodes, before.nodes); assert.equal(H.undo(f.root), null);
    } finally { f.unlisten(); }
});

for (const key of ['Delete', 'Backspace']) test(`actual ${key} shortcut deletes current selected nodes immediately with one Undo`, async () => {
    const f = fixture(), real = (await import('./canvas-fixture.mjs')).fixture({ onNativeDelete: selection => f.env.deleteNativeSelection(selection) });
    try {
        f.env.canvas = real.canvas; real.canvas.setGraph(f.env.editorDraw); real.canvas.select({ kind: 'node', id: 'source' });
        const before = structuredClone(f.root);
        f.env.okToDelete = () => assert.fail('Keyboard deletion cannot request confirmation');
        f.env.confirmBox = () => assert.fail('Keyboard deletion cannot open a dialog');
        f.env.typing = controllerFunction('typing', f.env);
        f.env.compactCardShortcut = controllerFunction('compactCardShortcut', f.env);
        const handler = controllerKeydown(f.env);
        real.host.focus(); const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); handler(event);
        assert.equal(event.defaultPrevented, true); assert.equal(f.root.nodes.source, undefined); assert.equal(f.commits(), 1);
        assert.ok(H.undo(f.root)); f.refresh(); assert.deepEqual(f.root.nodes, before.nodes); assert.equal(H.undo(f.root), null);
        const input = document.createElement('input'); document.body.append(input); input.focus(); handler(new window.KeyboardEvent('keydown', { key, cancelable: true }));
        assert.ok(f.root.nodes.source, 'Typing in a field preserves the selected node'); input.remove();
    } finally { f.unlisten(); await real.canvas.destroy(); }
});

test('pending document prompt blocks node deletion shortcuts and Escape preserves the selection', async () => {
    const f = fixture(), real = (await import('./canvas-fixture.mjs')).fixture({ onNativeDelete: selection => f.env.deleteNativeSelection(selection) });
    const promptRoot = document.createElement('div'), prompt = document.createElement('div');
    prompt.className = 'pc-document-prompt'; prompt.tabIndex = -1; promptRoot.append(prompt); document.body.append(promptRoot);
    try {
        f.env.canvas = real.canvas; real.canvas.setGraph(f.env.editorDraw); real.canvas.select({ kind: 'node', id: 'source' });
        const before = structuredClone(f.root), selection = structuredClone(real.canvas.selection), choices = [];
        f.env.root = promptRoot; f.env.pendingDocumentPrompt = { previousWorkflowId: f.root.id };
        f.env.typing = controllerFunction('typing', f.env);
        f.env.chooseDocumentPrompt = choice => { choices.push(choice); f.env.pendingDocumentPrompt = null; };
        const handler = controllerKeydown(f.env);
        for (const key of ['Delete', 'Backspace']) {
            real.host.focus(); const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); handler(event);
            assert.equal(event.defaultPrevented, true); assert.equal(document.activeElement, prompt);
            assert.deepEqual(f.root, before); assert.deepEqual(real.canvas.selection, selection); assert.equal(f.commits(), 0);
        }
        const escape = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); handler(escape);
        assert.equal(escape.defaultPrevented, true); assert.deepEqual(choices, ['cancel']);
        assert.deepEqual(f.root, before); assert.deepEqual(real.canvas.selection, selection); assert.equal(H.undo(f.root), null);
    } finally { promptRoot.remove(); f.unlisten(); await real.canvas.destroy(); }
});

test('comment commit and Undo Redo synchronously persist authored coordinate-overlay changes', () => {
    const f = fixture(), queued = new Map(); let ticket = 0, saves = 0;
    try {
        Object.assign(f.env, { viewSaveTimer: null, setTimeout(callback) { queued.set(++ticket, callback); return ticket; }, clearTimeout(id) { queued.delete(id); }, save() { saves++; } });
        f.env.persistGraphViews = controllerFunction('persistGraphViews', f.env);
        f.session.updateView({ nodePresentation: { source: { x: 100, y: 50, alias: 'Local source' }, outside: { x: 700, y: 200, alias: 'Retained' } } });
        f.env.activateEditorDraw(); f.env.persistGraphViews(true);
        const saved = () => f.stored.workspaceViews[f.root.id].views.find(view => view.identity.kind === 'root').nodePresentation;
        const captured = f.env.captureCommentEdit();
        assert.equal(f.env.commentLayout(captured, move(f.env)).ok, true);
        assert.deepEqual(saved().source, { alias: 'Local source' }, 'The committed document cannot retain obsolete local coordinates');
        assert.deepEqual(saved().outside, { x: 700, y: 200, alias: 'Retained' });
        assert.ok(H.undo(f.root)); f.refresh(); f.env.activateEditorDraw();
        assert.deepEqual(saved().source, { x: 100, y: 50, alias: 'Local source' }, 'Undo persists the restored local coordinates before returning');
        assert.ok(H.redo(f.root)); f.refresh(); f.env.activateEditorDraw();
        assert.deepEqual(saved().source, { alias: 'Local source' }, 'Redo persists removal before returning');
        assert.deepEqual(saved().outside, { x: 700, y: 200, alias: 'Retained' });
        assert.equal(saves, 1, 'Settings snapshots are immediate while external saves remain debounced');
        [...queued.values()][0](); assert.equal(saves, 2);
    } finally { f.unlisten(); }
});
