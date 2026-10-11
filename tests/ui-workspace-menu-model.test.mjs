import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workspaceMenus } from '../ui/workspace-menu-model.ts';
const base = {history:{undo:false,redo:false}, camera:{mode:'select'}, selectionActions:{copy:false,cut:false,delete:false}, menuCapabilities:{}, outputPreview:null};
const items = (state, name, panels) => workspaceMenus(state,panels).find(menu=>menu.name===name).groups.flat();
const item = (state,name,command,panels) => items(state,name,panels).find(entry=>entry.command===command);

test('View advertises F for Fit selection and leaves zoom-preserving Center selection unbound',()=>{
 assert.equal(item(base,'View','fit-selection').shortcut,'F');
 assert.equal(item(base,'View','center-selection').shortcut,'');
});
test('six menu groups expose current actions and no unified or legacy generation entries',()=>{
 const workflow={phase:'unified',assigned:false,busy:false,issues:[],nodes:[],result:null};
 assert.deepEqual(workspaceMenus({...base,workflow}).map(menu=>menu.name),['File','Edit','View','Graph','Workflow','Help']);
 const commands=items({...base,workflow},'Workflow').map(entry=>entry.command);
 assert.ok(!commands.includes('run-workflow'));assert.ok(!commands.includes('new-pre'));assert.ok(!commands.includes('new-post'));
 assert.equal(item({...base,workflow},'Workflow','assign-workflow-phase'),undefined);
 assert.equal(item({...base,workflow,enabled:true},'Workflow','enable-workflow').checked,true);
});
test('exact selection capabilities govern graph rows and panel state governs accessible checks',()=>{
 const state={...base,readOnly:true,menuCapabilities:{inspect:true,rename:false,duplicate:false,group:false,ungroup:true,createSubgraph:false,saveSubgraph:true,comment:false,compact:true,compactChecked:true,fitSelection:true,hasSelection:true},inspectorOpen:true};
 assert.equal(item(state,'Graph','details-selection').disabled,false);assert.equal(item(state,'Graph','rename-selection').disabled,true);
 assert.equal(item(state,'Graph','ungroup-selection').disabled,false);assert.equal(item(state,'Graph','compact-selection').checked,true);
 assert.equal(item(state,'Edit','duplicate-selection').disabled,true);assert.equal(item(state,'Edit','paste').disabled,true);
 assert.equal(item(state,'View','toggle-preview',{previewOpen:false,shelfOpen:true}).checked,false);
 assert.equal(item(state,'View','toggle-shelf',{previewOpen:false,shelfOpen:true}).checked,true);
 assert.equal(item(state,'Graph','select-tool').kind,'radio');assert.equal(item(state,'Graph','select-tool').checked,true);
});
test('owned current root alone governs Stop and assignment regardless of selected projection',()=>{
 const root={phase:'unified',assigned:true,busy:false,ownedBusy:true,issues:[],nodes:[],result:null};
 const selected={...root,assigned:false,ownedBusy:false};
 assert.equal(item({...base,workflow:selected,rootWorkflow:root,menuCapabilities:{stop:true}},'Workflow','stop-workflow').disabled,false);
 assert.equal(item({...base,workflow:root,rootWorkflow:{...root,ownedBusy:false},menuCapabilities:{stop:false}},'Workflow','stop-workflow').disabled,true);
 assert.equal(item({...base,workflow:selected,rootWorkflow:root},'Workflow','clear-workflow-assignment'),undefined);
 assert.equal(item({...base,workflow:selected,rootWorkflow:root},'Workflow','assign-workflow-phase'),undefined);
});
test('diagnostic output eligibility and tracking come from current request-bound output preview',()=>{
 const outputPreview={selectedKey:'choice',pinned:true,followSelection:false,busy:false,runHere:{enabled:false}};
 const state={...base,outputPreview};
 assert.equal(item(state,'Workflow','run-preview').disabled,true);assert.equal(item({...state,outputPreview:{...outputPreview,runHere:{enabled:true}}},'Workflow','run-preview').disabled,false);
 assert.equal(item(state,'View','pin-preview').checked,true);assert.equal(item(state,'View','follow-preview').checked,false);
 assert.equal(item({...base,workflow:{busy:true,result:{}}},'Workflow','run-preview').disabled,true);
});

test('Review host result remains available for the actual saved root terminal from a child',()=>{
 const child={phase:'unified',assigned:false,nodes:[{operation:'compose',terminal:false}]};
 const root={phase:'unified',assigned:false,nodes:[{operation:'apply-reply',terminal:true}]};
 assert.equal(item({...base,workflow:child,rootWorkflow:root},'Workflow','review-host-result').disabled,false);
 assert.equal(item({...base,workflow:child,rootWorkflow:{...root,nodes:[]}},'Workflow','review-host-result').disabled,true);
});
test('Review host result uses the root expanded review inventory when every native step is nested',()=>{
 const terminal={kind:'terminal',address:{workflowId:'nested-reply',instancePath:['body'],nodeId:'review-publish'}};
 const root={phase:'unified',nodes:[{operation:'subgraph',terminal:false}],reviewTerminals:[terminal]};
 const child={phase:'unified',nodes:[],reviewTerminals:[]};
 assert.equal(item({...base,workflow:child,rootWorkflow:root},'Workflow','review-host-result').disabled,false);
 assert.equal(item({...base,workflow:{...child,reviewTerminals:[terminal]},rootWorkflow:{...root,reviewTerminals:[]}},'Workflow','review-host-result').disabled,true);
});
test('owned root activity disables diagnostics even when the selected preview is idle',()=>{
 const outputPreview={selectedKey:'choice',busy:false,runHere:{enabled:true}};
 const rootWorkflow={phase:'unified',ownedBusy:true,nodes:[]};
 assert.equal(item({...base,rootWorkflow,outputPreview},'Workflow','run-preview').disabled,true);
 assert.equal(item({...base,rootWorkflow:{...rootWorkflow,ownedBusy:false},outputPreview},'Workflow','run-preview').disabled,false);

});

test('Workflow Add system availability follows root authoring capability from a read-only child and busy root',()=>{
 assert.equal(item({...base,readOnly:true,menuCapabilities:{addSystem:true},rootWorkflow:{ownedBusy:false}},'Workflow','add-system').disabled,false);
 assert.equal(item({...base,menuCapabilities:{addSystem:true},rootWorkflow:{ownedBusy:true}},'Workflow','add-system').disabled,true);
 assert.equal(item({...base,menuCapabilities:{addSystem:false}},'Workflow','add-system').disabled,true);
});

test('menu models preserve disabled Run and Recall reasons for visible accessible descriptions',()=>{
 const reason='Choose the required connection before running.';
 const outputPreview={selectedKey:'choice',busy:false,runHere:{enabled:false,reason}};
 assert.equal(item({...base,outputPreview},'Workflow','run-preview').reason,reason);
 const commands={selected:{queueNodeIds:[],cancelNodeIds:[],queueReason:'Select an eligible Recall node.',cancelReason:'No selected recall is queued.'},all:{queueNodeIds:[],cancelNodeIds:[],queueReason:'No eligible Recall nodes.',cancelReason:'No recall is queued.'}};
 const recall=item({...base,recall:{commands}},'Workflow','memory-recall-menu').children;
 assert.equal(recall.find(entry=>entry.command==='recall-queue-selected').reason,commands.selected.queueReason);
 assert.equal(recall.find(entry=>entry.command==='recall-cancel-all').reason,commands.all.cancelReason);
});
