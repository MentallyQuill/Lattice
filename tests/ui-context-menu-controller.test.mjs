import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { prepareWorkspaceViews, projectWorkspacePanels, projectEditorDraw } from '../src/ui/workspace-preparation.js?v=0.28.1';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.28.1';
import { createWorkflowSession, projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.28.1';
import { siblingWorkflow, twoOutputWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
import { diagnosticText } from '../src/ui/diagnostics.js?v=0.28.1';
import { isCommentFrame } from '../src/canvas/comment-frames.js?v=0.28.1';

import {workflowRunTargets,setWorkflowRunTargets} from '../src/workflow/run-targets.js?v=0.28.1';
import {captureGraphEditContext,commitPreparedGraph} from '../src/workflow/transactions.js?v=0.28.1';
import {prepareGraphCandidate} from '../src/workflow/prepared-graph-edit.js?v=0.28.1';
import {exportWorkflow,parseWorkflow} from '../src/workflow/packages.js?v=0.28.1';
import {operationFor} from '../src/workflow/catalog.js?v=0.28.1';
import {runWorkflow,workflowSignature} from '../src/workflow/runtime.js?v=0.28.1';
import * as H from '../src/history.js?v=0.28.1';
const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function actual(name, env) {
    const functionStart = source.indexOf('function ' + name + '(');
    const start = functionStart >= 0 ? functionStart : source.indexOf('const ' + name + ' =');
    assert.ok(start >= 0, 'Actual controller function ' + name);
    const line = source.slice(start, source.indexOf('\n', start));
    const end = functionStart < 0 || line.includes('} ') || line.endsWith('}') ? start + line.length : source.indexOf('\n}', start) + 2;
    return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}
function fixture(graph = siblingWorkflow(), path = ['second']) {
    let bindingReads = 0;
    const prepared = prepareWorkspaceViews(graph, { resolveBinding: () => { bindingReads++; return { ok: true, data: { profileId: 'local', model: 'test-model' } }; } });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root: graph, activationId: 'context-menu', ...prepared.data }).data;
    if (path.length) assert.equal(session.openInstance(path).ok, true);
    const env = { current: graph, graphViews: session, workspacePrepared: prepared.data, editorDraw: projectEditorDraw(session.readEditor()),
        workspaceRevision: 0, workflowState: { busy: false }, pinnedPreview: null, targetedPreview: null, selectedPreview: null, selectedKind: null, selected: null,
        editorCaptures: new WeakMap(), isOpen: () => true, activeEditRoot: () => graph, projectPreparedWorkflow, diagnosticText, isCommentFrame,
        workflowRuntime: { getNativeWorkflowController: () => ({ activity: () => null }) },
        updateWorkflowProjection() {}, workbench: { revealPreview() {} }, applyPreviewReview() {}, rejectPreviewReview() {},
    };
    for (const name of ['previewAddress', 'effectivePreview', 'nodePreviewChoices', 'togglePreviewTarget', 'captureEditor', 'editorCurrent', 'runPreviewHere']) env[name] = actual(name, env);
    const start = source.indexOf('const outputPreviewActions = {'), end = source.indexOf('\n};', start) + 3;
    env.outputPreviewActions = Function('env', 'with(env){' + source.slice(start, end) + ';return outputPreviewActions;}')(env);
    env.canvasPreviewMenuItems = actual('canvasPreviewMenuItems', env);
    const token = env.captureEditor(true).data;
    return { env, token, session, bindingReads: () => bindingReads };
}

test('context preview pin captures the clicked instance rather than an identically named sibling', () => {
    const f = fixture(), count = f.bindingReads();
    const items = f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.work, f.token);
    const pin = items.find(item => item.id === 'pin-preview');
    assert.ok(pin); pin.action();
    assert.deepEqual(f.env.pinnedPreview, { workflowId: 'prepared-root', instancePath: ['second'], nodeId: 'work', portId: 'out' });
    for (let i = 0; i < 4; i++) f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.work, f.token);
    assert.equal(f.bindingReads(), count, 'menu building uses cached summaries and never re-resolves model bindings');
});

test('a wrapper with several outputs pins the explicitly chosen port', () => {
    const f = fixture(twoOutputWorkflow(), []);
    const items = f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.wrapper, f.token);
    const pin = items.find(item => item.id === 'pin-preview');
    assert.ok(pin?.children);
    assert.deepEqual(pin.children.map(item => item.label), ['First', 'Second']);
    pin.children[1].action();
    assert.deepEqual(f.env.pinnedPreview, { workflowId: 'two-output-root', instancePath: [], nodeId: 'wrapper', portId: 'second' });
});

test('Run to here is a direct action for the primary output of a multi-output node', () => {
    const f = fixture(twoOutputWorkflow(), []);
    let launched = null;
    f.env.workflowSession = { run({ target }) { launched = target; } };
    const run = f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.wrapper, f.token).find(item => item.id === 'run-to-here');
    assert.equal(run.children, undefined);
    assert.equal(run.shortcut, 'R');
    run.action();
    assert.deepEqual(launched, { workflowId: 'two-output-root', instancePath: [], nodeId: 'wrapper', portId: 'first' });
});

test('direct Run to here respects the node output chosen in Preview without running another node', () => {
    const f = fixture(twoOutputWorkflow(), []);
    let launched = null;
    f.env.workflowSession = { run({ target }) { launched = target; } };
    const wanted = { workflowId: 'two-output-root', instancePath: [], nodeId: 'wrapper', portId: 'second' };
    f.env.selectedPreview = wanted;
    f.env.pinnedPreview = { workflowId: 'two-output-root', instancePath: ['wrapper'], nodeId: 'alpha', portId: 'out' };
    f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.wrapper, f.token).find(item => item.id === 'run-to-here').action();
    assert.deepEqual(launched, wanted);
    f.env.selectedPreview = f.env.pinnedPreview;
    f.env.pinnedPreview = wanted;
    f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.wrapper, f.token).find(item => item.id === 'run-to-here').action();
    assert.deepEqual(launched, wanted);
    f.env.selectedPreview = { workflowId: 'two-output-root', instancePath: ['wrapper'], nodeId: 'alpha', portId: 'out' };
    f.env.pinnedPreview = { ...wanted, instancePath: ['other-instance'] };
    f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.wrapper, f.token).find(item => item.id === 'run-to-here').action();
    assert.deepEqual(launched, { ...wanted, portId: 'first' });
});

test('direct Run to here cannot dispatch after changing graph views or during native host activity', () => {
    const f = fixture();
    let launched = null;
    f.env.workflowSession = { run({ target }) { launched = target; } };
    const run = f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.work, f.token).find(item => item.id === 'run-to-here');
    f.env.workflowRuntime.getNativeWorkflowController = () => ({ activity: () => ({ busy: true }) });
    run.action();
    assert.equal(launched, null);
    f.env.workflowRuntime.getNativeWorkflowController = () => ({ activity: () => null });
    f.session.focusView(f.session.project().graphViews.tabs[0].key);
    run.action();
    assert.equal(launched, null);
});

test('Run to here rechecks busy state before dispatching the captured qualified target', () => {
    const f = fixture();
    let launched = null;
    f.env.workflowSession = { run({ target }) { launched = target; } };
    const run = f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.work, f.token).find(item => item.id === 'run-to-here');
    assert.ok(run); assert.equal(run.disabled, false);
    f.env.workflowState.busy = true; run.action();
    assert.equal(launched, null);
    f.env.workflowState.busy = false; run.action();
    assert.deepEqual(launched, { workflowId: 'prepared-root', instancePath: ['second'], nodeId: 'work', portId: 'out' });
});


test('Run to here admits an incomplete selected closure so the session can diagnose it', () => {
    const graph = siblingWorkflow(); delete graph.wires.c;
    const f = fixture(graph); let launched = null;
    f.env.workflowSession = { run({target}) { launched = target; } };
    const run = f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.work, f.token).find(item => item.id === 'run-to-here');
    assert.equal(run.disabled, false); run.action();
    assert.deepEqual(launched, {workflowId:graph.id,instancePath:['second'],nodeId:'work',portId:'out'});
});

test('direct Run to here rejects native generation even when activation input is missing', () => {
    const graph = {id:'native-incomplete',schema:3,runtime:2,mode:'native-unified',runTargets:[],nodes:{generate:{id:'generate',type:'workflow',operation:'generate-reply'}},wires:{},definitions:{},portals:{}};
    const f = fixture(graph, []); let launched = null;
    f.env.workflowSession = { run({target}) { launched = target; } };
    const target = {workflowId:graph.id,instancePath:[],nodeId:'generate',portId:'draft'};
    f.env.runPreviewHere(f.session.readEditContext().sessionId + ':0', target);
    assert.equal(launched, null);
    const run = f.env.canvasPreviewMenuItems(f.env.editorDraw.nodes.generate, f.token).find(item => item.id === 'run-to-here');
    assert.equal(run.disabled, true);
});

test('controller scopes diagnostics and legacy traces to the exact workflow instance', () => {
    const editor={view:{identity:{kind:'instance',workflowId:'root',instancePath:['second']}}};
    const address=(workflowId,instancePath)=>({workflowId,instancePath,nodeId:'same'});
    const nodes=[address('root',['first']),address('root',['second']),address('other',['second'])].map(address=>({key:JSON.stringify([address.workflowId,address.instancePath,address.nodeId]),address,error:{code:'MISSING_INPUT',message:'Connect input'},inputPortId:'in'}));
    const scope=actual('scopedRunDiagnostics',{}), trace=actual('scopedRunTraces',{});
    assert.deepEqual(scope({attemptId:'run',documentKey:'doc',nodes},editor).nodes,[nodes[1]]);
    assert.deepEqual(trace(nodes.map(node=>({address:node.address,status:'failed'})),editor,'current',{attemptId:'run',documentKey:'doc',nodes}),[{id:'same',status:'failed'}]);
    for(const availability of ['stale','superseded','cancelled','invalid']) assert.deepEqual(trace(nodes.map(node=>({address:node.address,status:'failed'})),editor,availability),[]);
    editor.view.identity.kind='library'; assert.equal(scope({nodes},editor),null);assert.deepEqual(trace([{address:nodes[1].address,status:'failed'}],editor,'current'),[]);
});


test('workflow output enrollment is explicit, persisted, undoable, and rejects stale/library commands',()=>{
 const graph={id:'outputs',schema:3,runtime:2,mode:'native-unified',runTargets:[],nodes:{one:{id:'one',type:'workflow',operation:'review-publish'},two:{id:'two',type:'workflow',operation:'review-publish'}},wires:{},definitions:{},portals:{}};
 const f=fixture(graph,[]),env=f.env, key=f.session.readEditContext().sessionId+':0';
 env.workflowRunTargets=workflowRunTargets;env.setWorkflowRunTargets=setWorkflowRunTargets;env.captureGraphEditContext=captureGraphEditContext;env.prepareGraphCandidate=prepareGraphCandidate;
 env.readGraphEditContext=()=>f.session.readEditContext();env.rootSystemWritable=()=>f.session.readEditor().view.identity.kind!=='library';env.commitGraphEdit=commitPreparedGraph;env.graphDocumentHooks={};env.operationFor=operationFor;
 env.workspacePrepared.runTargets=[];
 env.changeWorkflowOutput=actual('changeWorkflowOutput',env);env.workflowOutputItems=actual('workflowOutputItems',env);
 H.track(graph);
 const items=env.workflowOutputItems();assert.ok(items.length);assert.ok(items.every(item=>!item.checked));
 assert.equal(env.changeWorkflowOutput(key,{instancePath:[],nodeId:'one'},true).ok,true);
 assert.deepEqual(graph.runTargets,[{instancePath:[],nodeId:'one'}]);
 const exported=exportWorkflow(graph);const imported=parseWorkflow(JSON.stringify(exported));assert.equal(imported.ok,true);assert.deepEqual(imported.data.runTargets,graph.runTargets);
 assert.ok(H.undo(graph));assert.deepEqual(graph.runTargets,[]);assert.ok(H.redo(graph));assert.deepEqual(graph.runTargets,[{instancePath:[],nodeId:'one'}]);
 assert.equal(env.changeWorkflowOutput(key,{instancePath:[],nodeId:'one'},false).ok,true);assert.deepEqual(graph.runTargets,[]);
 assert.equal(env.changeWorkflowOutput('stale',{instancePath:[],nodeId:'two'},true).ok,false);assert.deepEqual(graph.runTargets,[]);
 env.rootSystemWritable=()=>false;assert.equal(env.changeWorkflowOutput(key,{instancePath:[],nodeId:'two'},true).ok,false);assert.deepEqual(graph.runTargets,[]);
});


test('an external automatic attempt immediately retires old diagnostics through the settlement gap',()=>{
 const root={id:'automatic-root'},documentOwner={},old={attemptId:'old',documentKey:'doc',nodes:[]};
 const env={current:root,retiredCanvasAttempt:null,workflowState:{availability:'current',preparationError:{code:'OLD'},result:{runId:'old'}},documentSession:{capture:()=>documentOwner,draftNamespace:()=> 'doc'},workflowSession:{currentDiagnostics:()=>old}};
 const state=actual('currentWorkflowDiagnosticState',env);
 assert.equal(state(null).currentDiagnostics,old);
 const other={busy:true,native:true,graph:{id:root.id},documentToken:documentOwner,runId:'foreign'};assert.equal(state(other).currentDiagnostics,old);
 const activity={...other,graph:root,runId:'new'};
 assert.equal(state(activity).currentDiagnostics,null);assert.equal(state(activity).availability,'superseded');assert.equal(state(activity).preparationError,null);
 assert.equal(state(null).currentDiagnostics,null,'the prior failure cannot flash after native activity ends and before its result is adopted');
 const fresh={...old,attemptId:'new'};env.workflowSession.currentDiagnostics=()=>fresh;env.workflowState.result={runId:'new'};
 assert.equal(state(null).currentDiagnostics,fresh);assert.equal(state(null).availability,'current');
});


test('fresh global automatic preparation error survives retirement of a recorded manual failure',async()=>{
 const graph={id:'retained-manual',schema:3,runtime:2,mode:'native-unified',runTargets:[],nodes:{draft:{id:'draft',type:'workflow',operation:'select-fields',fields:[]}},wires:{},definitions:{},portals:{}};
 const f=fixture(graph,[]),owner={};let latest,state;
 const runtime={cancel(){},lastAutomaticResult:()=>latest,runTarget:(root,target,options)=>runWorkflow(root,{...options,target,runId:'manual'})};
 const session=createWorkflowSession({runtime:()=>runtime,current:()=>graph,epoch:()=>1,documentToken:()=>owner,active:()=>true,changed:value=>state=value});
 const target={workflowId:graph.id,instancePath:[],nodeId:'draft',portId:'out'};
 await session.run({target});assert.equal(state.result.runId,'manual');assert.equal(state.result.recording.status,'failed');assert.equal(session.currentDiagnostics('doc').nodes[0].error.code,'MISSING_INPUT');
 const env={current:graph,retiredCanvasAttempt:null,workflowState:state,documentSession:{capture:()=>owner,draftNamespace:()=> 'doc'},workflowSession:session};
 const currentState=actual('currentWorkflowDiagnosticState',env),scope=actual('scopedRunDiagnostics',{}),traces=actual('scopedRunTraces',{});
 assert.ok(currentState(null).currentDiagnostics);
 const busy={busy:true,native:true,graph,documentToken:owner,runId:'automatic-empty'};
 assert.equal(currentState(busy).currentDiagnostics,null);assert.equal(currentState(null).currentDiagnostics,null,'settlement gap cannot restore old paint');
 latest={origin:{graph,graphId:graph.id,documentToken:owner,signature:workflowSignature(graph),kind:'send',phase:'unified',runId:'automatic-empty'},result:{mode:'root',runId:'automatic-empty',ok:false,actualCalls:0,error:{code:'MISSING_RUN_TARGETS',message:'Choose workflow outputs before running this workflow.'}}};
 session.receiveAutomatic(latest);env.workflowState=state;
 assert.equal(state.preparationError.code,'MISSING_RUN_TARGETS');assert.equal(state.result.runId,'manual','the real session retains historical recording');assert.equal(session.currentDiagnostics('doc'),null,'no admitted selection means no current node DTO');
 const projected=currentState(null);assert.equal(projected.preparationError?.code,'MISSING_RUN_TARGETS');
 assert.equal(scope(projected.currentDiagnostics,f.session.readEditor()),null);
 const panelState={...state,...projected},workflow=projectPreparedWorkflow(f.env.workspacePrepared.workflow,{...panelState,selectedTarget:target});
 const panels=projectWorkspacePanels(f.session.readEditor(),workflow,panelState,'revision',target,null);
 assert.equal(panels.outputPreview.diagnostics[0].technical.code,'MISSING_RUN_TARGETS');assert.equal(panels.runDetails.diagnostics[0].technical.code,'MISSING_RUN_TARGETS');
 assert.deepEqual(traces(workflow.rows,f.session.readEditor(),projected.availability),[],'retained failed trace cannot repaint the old cause');
 session.receiveAutomatic(latest);env.workflowState=state;assert.equal(currentState(null).preparationError.code,'MISSING_RUN_TARGETS','latest replay cannot retire the accepted fresh error');
});
