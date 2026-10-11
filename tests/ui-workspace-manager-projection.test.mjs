import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureGraph as starterGraph } from './helpers/workflow-fixtures.mjs';
import { siblingWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js?v=0.27.0';
import { prepareWorkspaceViews, prepareLibraryViews } from '../src/ui/workspace-preparation.js?v=0.27.0';
test('current saved root draws normalized named wires without changing its document',()=>{
 const root=starterGraph('native-guidance'),before=structuredClone(root);const result=prepareWorkspaceViews(root);assert.equal(result.ok,true);const draw=result.data.preparedViews[0].drawBase;
 assert.ok(Object.values(draw.wires).every(edge=>edge.route==='wire'&&edge.fromPort&&edge.toPort));assert.deepEqual(root,before);
});

test('an empty root shelf still exposes disabled subgraph interface nodes', async () => {
 const { prepareNativeSearchCatalog } = await import('../src/ui/native-search-catalog.js?v=0.27.0');
 const result = prepareNativeSearchCatalog({schema:3,runtime:2,mode:'native-unified',workflowId:'empty-shelf',viewPath:[],inDefinition:false});
 assert.equal(result.ok,true);
 const boundaries=result.data.choices.filter(choice=>choice.id.startsWith('boundary:'));
 assert.deepEqual(boundaries.map(choice=>choice.label),['Input','Output']);
 assert.ok(boundaries.every(choice=>choice.disabledReason));
 assert.equal(result.data.choices.some(choice=>choice.definitionRef),false);
});
test('definition manager metadata keeps declared editor types and real nested primitive targets',()=>{
 const root=siblingWorkflow(),original=Object.values(root.definitions)[0],draft=structuredClone(original);delete draft.semanticHash;draft.parameters=[{id:'instructions',label:'Instructions',target:{instancePath:[],nodeId:'work',controlId:'instructions'}}];
 const identity=computeDefinitionIdentity(draft),definition={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},snapshots={[definitionRefKey(definition)]:definition};
 const result=prepareLibraryViews(root.id,snapshots);assert.equal(result.ok,true,JSON.stringify(result));const info=result.data.definitionInfo[definitionRefKey(definition)];
 assert.equal(info.parameters[0].control.editor,'text');assert.equal(info.parameters[0].control.value,'');assert.equal(info.parameters[0].control.key,'instructions');
 assert.ok(info.eligibleTargets.some(row=>row.target.nodeId==='work'&&row.target.controlId==='maxTokens'));assert.ok(info.roles.some(row=>row.id==='Analysis'));
 assert.ok(info.nodeBindings.some(row=>row.id===JSON.stringify([[],'work'])));assert.ok(!JSON.stringify(info).includes('workflowId'));
 assert.deepEqual(snapshots[definitionRefKey(definition)],definition);
});

test('instance rows preserve explicit-null model fields and update maps enumerate all real identities',async()=>{
 const {projectDefinitionInstance,projectDefinitionUpdate}=await import('../src/ui/workspace-preparation.js?v=0.27.0');
 const info={parameters:[{id:'count',label:'Count',control:{key:'count',label:'Count',editor:'number',value:3}}],roles:[{id:'Analysis',label:'Analysis'}],nodeBindings:[{id:JSON.stringify([['inner'],'work']),label:'Inner work',target:{kind:'node',instancePath:['inner'],nodeId:'work'}}],interface:[{id:'in',label:'In',direction:'input',kind:'context'}]};
 const wrapper={parameterOverrides:{count:5},roleOverrides:{Analysis:{model:null}},nodeBindingOverrides:{[info.nodeBindings[0].id]:{profileId:'local'}}};
 const rows=projectDefinitionInstance(info,wrapper,[{id:'local',name:'Local'}],{count:5});assert.equal(rows.parameters[0].control.value,5);assert.equal(rows.bindings[0].model.mode,'block');assert.equal(rows.bindings[0].profile.mode,'inherit');assert.equal(rows.bindings[1].profile.mode,'override');
 const update=projectDefinitionUpdate(info,{...info,interface:[{id:'new',label:'New',direction:'input',kind:'context'},{id:'wrong',label:'Wrong',direction:'output',kind:'context'}]});assert.deepEqual(update.portMap[0].options,[{id:'new',label:'New'}]);assert.equal(update.nodeBindingMap[0].from,info.nodeBindings[0].id);
});

test('mixed structured array controls remain JSON values rather than lossy line editors',async()=>{
 const {projectWorkspacePanels}=await import('../src/ui/workspace-preparation.js?v=0.27.0');const {createGraphViewSession}=await import('../src/ui/graph-view-session.js?v=0.27.0');const {projectPreparedWorkflow}=await import('../src/ui/workflow-surface.js?v=0.27.0');
 const root=starterGraph('reviewed-de-slop');Object.values(root.nodes).find(node=>node.operation==='pattern').rules=[{id:'word',pattern:'word',label:'preserve metadata'},{id:'literal',pattern:'literal'}];const result=prepareWorkspaceViews(root);assert.equal(result.ok,true);const session=createGraphViewSession({root,activationId:'x',...result.data}).data;session.updateView({selection:{primary:{kind:'node',id:Object.values(root.nodes).find(node=>node.operation==='pattern').id},multi:[]}});const workflow=projectPreparedWorkflow(result.data.workflow,{selectedId:Object.values(root.nodes).find(node=>node.operation==='pattern').id});const details=projectWorkspacePanels(session.readEditor(),workflow,{busy:false},'x:0',null,null).nodeDetails;
 const rules=details.controls.find(control=>control.key==='rules');assert.equal(rules.editor,'json');assert.equal(rules.representation,'json-value');assert.deepEqual(rules.value,Object.values(root.nodes).find(node=>node.operation==='pattern').rules);
});


test('pinned preview choices retain actual qualified sources across views and report removed addresses',async()=>{
 const {projectWorkspacePanels}=await import('../src/ui/workspace-preparation.js?v=0.27.0');const {createGraphViewSession}=await import('../src/ui/graph-view-session.js?v=0.27.0');const {projectPreparedWorkflow}=await import('../src/ui/workflow-surface.js?v=0.27.0');const root=siblingWorkflow(),result=prepareWorkspaceViews(root);assert.equal(result.ok,true);assert.ok(result.data.previewChoices.length);const target={workflowId:root.id,instancePath:[],nodeId:'source',portId:'out'},session=createGraphViewSession({root,activationId:'pin',...result.data}).data;session.openInstance(['first/path']);const workflow=projectPreparedWorkflow(result.data.workflow,{viewPath:['first/path']});
 const project=pin=>projectWorkspacePanels(session.readEditor(),workflow,{busy:false},'pin:1',null,pin,workflow,[],result.data.previewChoices).outputPreview;
 assert.equal(project(target).selectedKey,JSON.stringify(target));assert.equal(project({...target,nodeId:'deleted'}).status,'removed');
});


test('prepared direct and portal pin menus name their actual opposite endpoints without runtime authority',()=>{
 const root=siblingWorkflow();root.portals={named:{id:'named',label:'Named scene',kind:'context',source:{nodeId:'source',portId:'out'}}};root.wires.c={id:'c',route:'portal',portalId:'named',to:'second',toPort:'scene'};
 const prepared=prepareWorkspaceViews(root);assert.equal(prepared.ok,true,JSON.stringify(prepared));const draw=prepared.data.preparedViews[0].drawBase;
 const attachment=(id,dir,port)=>draw.nativeAttachments[JSON.stringify([id,dir,port])];
 assert.ok(attachment('first/path','in','scene').jumps.some(jump=>jump.target.nodeId==='source'&&jump.target.portId==='out'));
 assert.ok(attachment('source','out','out').jumps.some(jump=>jump.target.nodeId==='first/path'&&jump.target.portId==='scene'));
 assert.ok(attachment('source','out','out').jumps.some(jump=>jump.target.nodeId==='second'&&jump.target.portId==='scene'&&jump.label.includes('Named scene')));
 assert.ok(attachment('second','in','scene').jumps.some(jump=>jump.target.nodeId==='source'&&jump.target.portId==='out'&&jump.label.includes('Named scene')));
 assert.ok(Object.values(draw.nativeAttachments).flatMap(item=>item.jumps).every(jump=>!Object.hasOwn(jump.target,'workflowId')&&!Object.hasOwn(jump.target,'instancePath')));
 delete root.nodes.second;delete root.wires.c;delete root.nodes.two;delete root.wires.d;const next=prepareWorkspaceViews(root);assert.equal(next.ok,true);assert.ok(!Object.values(next.data.preparedViews[0].drawBase.nativeAttachments).flatMap(item=>item.jumps).some(jump=>jump.target.nodeId==='second'));
});

test('library details never borrow a colliding root title or model and retain local alias and exact ref',async()=>{
 const {projectWorkspacePanels}=await import('../src/ui/workspace-preparation.js?v=0.27.0');const {createGraphViewSession}=await import('../src/ui/graph-view-session.js?v=0.27.0');const root=siblingWorkflow();root.nodes.work={id:'work',type:'workflow',operation:'response-plan',presentation:{alias:'Unrelated root alias'},model:'UNRELATED ROOT MODEL'};const content=prepareWorkspaceViews(root),library=prepareLibraryViews(root.id,root.definitions);assert.equal(content.ok,true);const session=createGraphViewSession({root,activationId:'library-collision',navigation:[...content.data.navigation,...library.data.navigation],preparedViews:[...content.data.preparedViews,...library.data.preparedViews]}).data;const view=library.data.preparedViews[0];session.openLibrary(view.definitionRef);session.updateView({selection:{primary:{kind:'node',id:'work'},multi:[]},nodePresentation:{work:{alias:'Local library alias'}}});
 const rootProjection={selectedId:'work',nodes:[{id:'work',title:'Unrelated root alias',effective:'UNRELATED ROOT MODEL'}],graphId:root.id,profiles:[],targets:[],rows:[],issues:[],callBound:0};const details=projectWorkspacePanels(session.readEditor(),rootProjection,{busy:false},'collision',null,null).nodeDetails;
 assert.equal(details.canonicalTitle,'Response Plan');assert.equal(details.title,'Local library alias');assert.equal(details.alias,'Local library alias');assert.equal(details.model.effective,'local');assert.deepEqual(details.address,{kind:'library',definitionRef:view.definitionRef,nodeId:'work'});assert.equal(details.readOnly,true);
});
