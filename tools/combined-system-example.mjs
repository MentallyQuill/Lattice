import { inspectExpandedGraph } from '../src/workflow/graph-validation.js';
import {builder,layout,must} from './remastered/builder.mjs';
import {liveJson,eventCandidates,confirmEach,writeState,actor,partner} from './remastered/shared.mjs';
import {prepareCreateFromSelection} from '../src/workflow/composition-transform.js';
import {prepareSubgraphNodeDeletion} from '../src/workflow/subgraph-authoring.js';
import {computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definitions.js';
import {FIXTURES} from './remastered/fixtures.mjs';
import {createViewState} from '../src/ui/view-state.js';
import {serializeWorkflowDocument} from '../src/workflow/document-file.js';
import {validateWorkflow} from '../src/workflow/contracts.js';
import {prepareWorkflowPlanner} from '../src/workflow/resolve.js';
import {exportWorkflow,parseWorkflow} from '../src/workflow/packages.js';

export const CLOCK_ID='lattice-default-clock', CALENDAR_ID='story-calendar';
function wandBody(){
 const r=builder(27,'Wand','One confirmed wand use','Frozen fixed effect');r.add('player','player-event-source');
 const candidates=eventCandidates(r,'player',{itemId:'broken-wand',phase:'pre',instructions:'At most one actual use. Exact unchanged source evidence is required.'});
 const confirmed=confirmEach(r,candidates,{phase:'pre',limit:1});const holders=liveJson(r,'holders','wand-holders');
 r.add('holder','current-holder');r.connect(confirmed,'out','holder','events');r.connect(holders,'out','holder','holders');
 r.add('actual-uses','collection',{mode:'filter',fieldPath:['eventType'],value:'item-used'});r.connect('holder','events','actual-uses','in');
 r.add('use-count','collection',{mode:'count'});r.connect('actual-uses','out','use-count','in');
 r.add('has-use','condition',{operator:'greater-than',value:0});r.connect('use-count','out','has-use','in');
 r.add('eligible-use','branch');r.connect('actual-uses','out','eligible-use','in');r.connect('has-use','out','eligible-use','condition');
 r.add('library-file','read-file',{targetId:'wand-effects'});r.add('library','parse-effect-library',{format:'json',libraryId:'wand-effects',revision:'r1',itemId:'broken-wand'});r.connect('library-file','text','library','in');
 const saved=liveJson(r,'saved','wand-outcomes');r.add('pick','random-pick',{ledgerId:'wand-outcomes',rerollPolicy:'reuse'});
 r.connect('eligible-use','yes','pick','events');r.connect('library','out','pick','library');r.connect(saved,'out','pick','saved');
 r.add('guidance-material','format');r.add('guidance','compose',{outputKind:'guidance',mode:'template',sections:[{name:'Material',text:'',kind:'text',required:true,onSkipped:'omit'}],template:'Narrate only this actual wand use using its frozen fixed effect and confirmed holder. Do not reroll or invent another use.\n{{section:Material}}'});r.connect('pick','out','guidance-material','in');r.connect('guidance-material','text','guidance','section.Material');
 r.add('outcome-commit','commit-outcomes',{targetId:'wand-outcomes'});r.connect('pick','out','outcome-commit','outcomes');return r;
}
function weatherBody(waitMinutes){
 const r=builder(24,'Eight-hour rain','The agreed wait reaches the next rain boundary','Story time');r.add('clock','story-clock',{clockId:CLOCK_ID,calendarId:CALENDAR_ID});
 r.data('duration',{kind:'duration',minutes:waitMinutes,evidence:{kind:'authored-rule',origin:'agreed-eight-hour-wait'}});
 r.add('advance','advance-time',{policy:'interrupt',limit:1,schedules:[{scheduleId:'eight-hour-rain',revision:1,kind:'interval',anchorMinute:0,intervalMinutes:480}]});r.connect('clock','out','advance','clock');r.connect('duration','out','advance','proposal');
 r.add('trigger','time-trigger',{scheduleId:'eight-hour-rain',scheduleRevision:1,mode:'interval',anchorMinute:0,intervalMinutes:480,clockId:CLOCK_ID,calendarId:CALENDAR_ID,limit:1});r.connect('clock','out','trigger','previous');r.connect('advance','clock','trigger','destination');
 r.add('due-count','collection',{mode:'count'});r.connect('trigger','occurrences','due-count','in');r.add('has-due','condition',{operator:'greater-than',value:0});r.connect('due-count','out','has-due','in');r.add('due','branch');r.connect('trigger','occurrences','due','in');r.connect('has-due','out','due','condition');
 r.add('guidance-material','format');r.add('guidance','compose',{outputKind:'guidance',mode:'template',sections:[{name:'Material',text:'',kind:'text',required:true,onSkipped:'omit'}],template:'The rain begins at the supplied due time after the agreed eight-hour wait. Do not invent more elapsed time, change player choices, or claim rain lasts forever.\n{{section:Material}}'});r.connect('due','yes','guidance-material','in');r.connect('guidance-material','text','guidance','section.Material');
 r.add('commit-clock','commit-clock');r.connect('advance','report','commit-clock','projection');r.connect('advance','occurrences','commit-clock','occurrences');return r;
}
function relationshipBody(){
 const r=builder(30,'Rowan toward Iris','Stage directional private relationship state','Selected actor state');r.add('player','player-event-source');r.add('clock','story-clock',{clockId:CLOCK_ID,calendarId:CALENDAR_ID});
 const candidates=eventCandidates(r,'player',{phase:'pre',instructions:'At most one genuinely completed supportive interaction by Rowan toward Iris.'});const confirmed=confirmEach(r,candidates,{phase:'pre',limit:1});const state=liveJson(r,'relationship-state','rowan-relationship',{actorScope:'selected',actorId:''});
 r.data('decay-rules',[['trust',10080],['desire',40320],['tension',10080],['excitement',480]].map(([dimension,minutes])=>({decayId:dimension+'-eases',revision:1,targetKey:'rowan-toward-iris-'+dimension,subjectId:actor,objectId:partner,baseline:0,unitsPerMinute:1/minutes,min:0,max:10,initialMinute:0})));
 r.add('decay','state',{mode:'time-decay'});r.connect(state,'out','decay','state');r.connect('decay-rules','out','decay','rules');r.connect('clock','out','decay','clock');
 r.data('relationship-rules',{ruleSetId:'slow-relationship',revision:1,dayLengthMinutes:1440,rules:[['trust',1,1,1,1440],['desire',.1,.1,.2,1440],['tension',-.25,0,0,720],['excitement',.5,.5,1,120]].map(([dimension,amount,sceneCap,dayCap,cooldown])=>({ruleId:dimension+'-support',eventType:'supportive-interaction',targetKey:'rowan-toward-iris-'+dimension,subjectId:actor,objectId:partner,identityFields:['occurrenceId'],mode:'add',amount,min:0,max:10,positiveSceneCap:sceneCap,positiveDayCap:dayCap,cooldownMinutes:cooldown,diminishingFactors:[1,.5,.25],zeroDeltaPolicy:'consume',repeatOnZero:false,cooldownOnZero:false}))});
 r.add('interaction-events','event-normalize',{mode:'progression',eventType:'supportive-interaction'});r.connect(confirmed,'out','interaction-events','events');r.connect('clock','out','interaction-events','clock');
 r.add('relationship','state',{mode:'progression'});r.connect('decay','out','relationship','state');r.connect('relationship-rules','out','relationship','rules');r.connect('interaction-events','out','relationship','events');writeState(r,'relationship','relationship-state-file');return r;
}
/** Build one ordinary flat Main, then extract its independently editable system bodies with the real authoring transform. */
export function buildCombinedExample({waitMinutes=480}={}){
 const r=builder(27,'Combined editable systems','One native reply combines a fixed wand effect and agreed eight-hour rain while staging Rowan toward Iris private state.','Independent system bodies');
 const graph=r.graph;graph.id='combined-editable-systems';graph.name='Wand, weather and relationship';delete graph.template;
 r.add('player','player-event-source');r.add('clock','story-clock',{clockId:CLOCK_ID,calendarId:CALENDAR_ID});
 r.add('compose','compose',{outputKind:'guidance',sections:[{name:'Wand',text:'',kind:'guidance',required:false,onSkipped:'omit'},{name:'Weather',text:'',kind:'guidance',required:false,onSkipped:'omit'}]});r.connect('compose','out','generate','guidance');r.connect('generate','draft','review','draft');
 const selections=[];
 for(const [prefix,body] of [['wand',wandBody()],['weather',weatherBody(waitMinutes)],['relationship',relationshipBody()]]){
  const ignored=new Set(['send','generate','review','player','clock']);const ids=Object.keys(body.graph.nodes).filter(id=>!ignored.has(id));
  const translate=id=>ignored.has(id)?id:prefix+'-'+id;
  for(const id of ids){const node=structuredClone(body.graph.nodes[id]);node.id=translate(id);graph.nodes[node.id]=node;}
  Object.assign(graph.definitions,body.graph.definitions);Object.assign(graph.roles,body.graph.roles);
  for(const edge of Object.values(body.graph.wires))if(ids.includes(edge.to)||ids.includes(edge.from))r.connect(translate(edge.from),edge.fromPort,translate(edge.to),edge.toPort);
  if(prefix!=='relationship')r.connect(prefix+'-guidance','out','compose','section.'+(prefix==='wand'?'Wand':'Weather'));
  selections.push({prefix,nodeIds:ids.map(translate)});
 }
 graph.runTargets=must(inspectExpandedGraph(graph),'Flat Main').primitives.filter(unit=>unit.terminal).map(unit=>({instancePath:unit.address.instancePath,nodeId:unit.address.nodeId}));
 layout(graph);must(validateWorkflow(graph),'Flat Main');let candidate=graph;
 for(const {prefix,nodeIds} of selections){const proposal=must(prepareCreateFromSelection(candidate,{nodeIds,definitionId:'combined-'+prefix,instanceId:prefix,name:prefix==='wand'?'Broken wand':prefix==='weather'?'Eight-hour rain':'Rowan toward Iris'}),'Extract '+prefix);candidate=proposal.candidate;}
 // Extraction exposes optional diagnostics too; this example's reusable interface keeps only Main's connected boundaries.
 for(const {prefix} of selections){
  const wrapper=candidate.nodes[prefix],definition=candidate.definitions[definitionRefKey(wrapper.definition)];
  const unused=definition.interface.filter(port=>!Object.values(candidate.wires).some(w=>port.direction==='input'?w.to===prefix&&w.toPort===port.id:w.from===prefix&&w.fromPort===port.id)).map(port=>port.boundaryNodeId);
  if(unused.length)candidate=must(prepareSubgraphNodeDeletion(candidate,{viewPath:[prefix],expectedRef:wrapper.definition,nodeIds:unused}),'Refine '+prefix+' interface').candidate;
 }
 // Lay out each editable body independently of the original flat Main's unrelated literal-source rows.
 for(const definition of Object.values(candidate.definitions).filter(d=>d.id.startsWith('combined-'))){
  const display={...definition.body,interface:definition.interface,definitions:candidate.definitions};layout(display);definition.body.groups=display.groups;
  if(must(computeDefinitionIdentity(definition),'Body presentation').semanticHash!==definition.semanticHash)throw Error('Layout changed pinned semantics');
 }
 layout(candidate);must(validateWorkflow(candidate),'Combined');must(prepareWorkflowPlanner(candidate),'Combined planner');
 must(parseWorkflow(JSON.stringify(exportWorkflow(candidate))),'Portable round trip');return candidate;
}
export function portableCombinedExample(){return exportWorkflow(buildCombinedExample());}



/** Disposable data definitions. Only the trusted host's explicit catalog authorization grants access. */
export function combinedExampleResources(){
 const publicDocument=(targetId,value,visibility={kind:'public'})=>({targetId,name:targetId,format:'json',content:JSON.stringify(value),visibility});
 return [publicDocument('wand-holders',FIXTURES['wand-holders.json']),publicDocument('wand-effects',{libraryId:'wand-effects',revision:'r1',itemId:'broken-wand',effects:[{id:'sparks',kind:'fixed',weight:1,description:'Blue sparks replace the spell.'}]}),publicDocument('wand-outcomes',[]),publicDocument(CLOCK_ID,{schemaVersion:1,clockId:CLOCK_ID,calendarId:CALENDAR_ID,revision:1,absoluteMinute:0,dayLengthMinutes:1440,settledTimeEventIds:[]}),publicDocument('rowan-relationship',FIXTURES['rowan-relationship.json'],{kind:'actor-private',actorId:actor})];
}
export function combinedWorkspaceViews(graph){
 const navigation=['wand','weather','relationship'].map(id=>({identity:{kind:'instance',workflowId:graph.id,instancePath:[id]},label:id}));
 const views=createViewState({workflowId:graph.id,navigation});if(!views)throw Error('Invalid combined workspace');
 for(const id of ['wand','weather','relationship'])must(views.openInstance([id]),'Open '+id);
 must(views.focusView(JSON.stringify(['root',graph.id])),'Focus Main');return must(views.serialize(),'Workspace views');
}
export function editableCombinedExample(){const graph=buildCombinedExample();return must(serializeWorkflowDocument(graph,combinedWorkspaceViews(graph)),'Editable combined example').json;}

/** Git checkout line endings are the only tolerated reproduction difference. */
export const normalizeExampleCheckout = text => text.replaceAll('\r\n', '\n');
