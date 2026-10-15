import assert from 'node:assert/strict';
import {test} from 'node:test';
import {previewDiagnostics} from '../src/ui/preview-diagnostics.js';
import {readFile} from 'node:fs/promises';
const address={workflowId:'root',instancePath:['second'],nodeId:'same'};
const context=extra=>({workflow:{issues:['Input needs a connection'],diagnostics:[],targetSummary:{attemptable:true,diagnostics:[{message:'Input needs a connection'}]},rows:[],...extra?.workflow},state:{...extra?.state},target:{...address,portId:'out'},selectedKey:'selected',sections:[],library:false,title:'Compose'});
test('static completeness diagnostics do not become Preview failures before an attempt',()=>{
 const value=context();delete value.workflow.diagnostics;const projected=previewDiagnostics(value);
 assert.deepEqual(projected.diagnostics,[]);assert.equal(projected.runReason,'');assert.match(projected.emptyMessage,/not run|Run to here/i);
});
test('Preview exposes only the exact selected current cause and retires historical failures',()=>{
 const cause={key:JSON.stringify(['root',['second'],'same']),address,error:{code:'MISSING_INPUT',message:'Connect the request'},inputPortId:'in'};
 const value=context({state:{availability:'current',currentDiagnostics:{nodes:[cause]}}});
 assert.equal(previewDiagnostics(value).diagnostics.length,1);
 value.target={...value.target,instancePath:['first']};assert.deepEqual(previewDiagnostics(value).diagnostics,[]);
 value.target={...value.target,instancePath:['second']};value.state.currentDiagnostics=null;value.state.availability='stale';value.workflow.result={error:'Old failure'};value.workflow.rows=[{address,status:'failed',error:cause.error}];assert.deepEqual(previewDiagnostics(value).diagnostics,[]);
});

test('controller publishes full descendant causes and caches traces until diagnostic ownership changes',async()=>{
 const source=await readFile(new URL('../src/ui/controller.js',import.meta.url),'utf8');
 const actual=(name,env)=>{const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start)+2;return Function('env','with(env){'+source.slice(start,end)+';return '+name+';}')(env);};
 const rows=[{address:{workflowId:'root',instancePath:[],nodeId:'wrapper'},kind:'instance',status:'failed'}];
 let diagnostics={attemptId:'run',documentKey:'doc',nodes:[{address:{workflowId:'root',instancePath:['wrapper'],nodeId:'cause'},error:{code:'INVALID_INPUT'}}]};
 const published=[],editor={view:{identity:{kind:'root',workflowId:'root',instancePath:[]}}};let scans=0;
 const env={workflowRuntime:{},workflowState:{},workflowView:()=>({rows}),graphViews:{readEditContext:()=>({sessionId:'view'}),readEditor:()=>editor},workspaceRevision:1,current:{id:'root'},workspacePrepared:{workflow:{},idleRunRows:[],previewChoices:[]},projectPreparedWorkflow:()=>({}),recallSetupView:()=>null,currentWorkflowDiagnosticState:()=>({availability:'current',currentDiagnostics:diagnostics}),projectWorkspacePanels:()=>({}),settings:()=>({}),canvas:{setPreviewTarget(){},setRunDiagnostics(){},setTrace:value=>published.push(value)},previewAddress:()=>null,targetedPreview:null,pinnedPreview:null,selectedPreview:null,recallDetailsView:null,editorDraw:{},canvasTraceRows:null,workbench:{update(){}},workflowOutputItems:()=>[],selectionMenuCapabilities:()=>[],workspaceIssue:''};
 env.documentSession={draftNamespace:()=> 'doc'};
 env.guideInsertionIsBusy=actual('guideInsertionIsBusy',env);
 env.scopedRunDiagnostics=actual('scopedRunDiagnostics',env);const traces=actual('scopedRunTraces',env);env.scopedRunTraces=(...args)=>{scans++;return traces(...args);};
 const update=actual('updateWorkflowProjection',env);
 update();assert.deepEqual(published,[[{id:'wrapper',status:'failed'}]],'root wrapper sees full DTO before instance paint is filtered');
 update();update();assert.equal(scans,1,'camera and selection publications do not rescan unchanged rows');
 diagnostics=null;update();assert.deepEqual(published.at(-1),[],'losing current causal ownership clears retained failed traces with identical historical rows');
 update();assert.equal(scans,2);
 diagnostics={attemptId:'new',documentKey:'doc',nodes:[{address:{workflowId:'root',instancePath:['wrapper'],nodeId:'cause'},error:{code:'INVALID_INPUT'}}]};update();
 assert.deepEqual(published.at(-1),[{id:'wrapper',status:'failed'}]);assert.equal(scans,3);
});
