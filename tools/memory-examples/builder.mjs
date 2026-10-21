/** Foundation-only authoring. No maintenance, resource provisioning or multi-root factories. */
import {OPERATIONS,operationDefaults} from '../../src/workflow/catalog.js';
import {validateWorkflow} from '../../src/workflow/contracts.js';
import {inspectExpandedGraph} from '../../src/workflow/graph-validation.js';
import {exportWorkflow,parseWorkflowPackage} from '../../src/workflow/packages.js';
import {serializeWorkflowDocument,parseWorkflowDocument} from '../../src/workflow/document-file.js';
import {inspectSingletonMetadata} from '../../src/workflow/example-metadata.js';
import {FOUNDATION_RELEASE} from '../../src/workflow/foundation-release.js';
import {layout} from '../remastered/graph-layout.mjs';
const copy=value=>structuredClone(value);
const identities={34:{id:'lesson-34',title:'Split a lore chapter into useful passages',slug:'34-split-lore-chapter-into-passages'},35:{id:'lesson-35',title:'Group replies into three-turn passages',slug:'35-group-replies-into-three-turn-passages'}};
export function must(result,label){if(!result?.ok)throw Error(label+': '+JSON.stringify(result?.error));return result.data;}
export function buildUnifiedRoot({id,label}){
 const key='generation',graph={id,name:label,description:'',schema:4,runtime:3,mode:'native-unified',nodes:{},wires:{},roles:{},groups:{},portals:{},definitions:{},view:{x:0,y:0,zoom:.65}},checkpoints=[];let edge=0;
 const add=(id,operation,settings={},label='')=>{
  if(Object.hasOwn(graph.nodes,id)||!Object.hasOwn(OPERATIONS,operation))throw Error('Use unique nodes and supported operations.');
  const n=graph.nodes[id]={...operationDefaults(operation,settings),...copy(settings),id,type:'workflow',enabled:true,alias:OPERATIONS[operation].title+(label?' · '+label:''),x:0,y:0,w:300,h:210};
  if(n.modelRole&&!graph.roles[n.modelRole])graph.roles[n.modelRole]={profileId:n.profileId??null,model:null};return id;
 };
 const connect=(from,fromPort,to,toPort)=>{const id='edge-'+ ++edge;graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};};
 add('send','on-send');add('generate','generate-reply');add('review','review-publish');connect('send','activation','generate','activation');connect('generate','draft','review','draft');
 return {graph,key,add,connect,checkpoint(nodeId,port,expect){checkpoints.push({node:graph.nodes[nodeId]?.alias??nodeId,port,expect,target:{rootKey:key,hops:[],nodeId}});},finish(){
  layout(graph);graph.runTargets=must(inspectExpandedGraph(graph),'Expanded foundation root').primitives.filter(unit=>unit.terminal).map(unit=>({instancePath:unit.address.instancePath,nodeId:unit.address.nodeId}));
  must(validateWorkflow(graph),'Foundation root');return {graph,key,checkpoints:copy(checkpoints)};
 }};
}
export function assembleMemoryExample(options){
 if(!FOUNDATION_RELEASE.newLessonNumbers.includes(options.number)||options.roots?.length!==1||options.lesson?.difficulty!=='Composition')throw Error('Use one reviewed foundation generation lesson.');
 const identity=identities[options.number],root=options.roots[0].finish(),metadata={schema:1,id:identity.id,title:identity.title,rootKey:root.key,role:'generation',resourceRequirements:[],checkpoints:root.checkpoints};
 must(inspectSingletonMetadata(metadata,root.graph),'Lesson checkpoints');
 const portable=must(parseWorkflowPackage(JSON.stringify(exportWorkflow(root.graph,{exampleMetadata:metadata}))),'Portable roundtrip');
 const editableDocument=must(serializeWorkflowDocument(portable.graph,null,{exampleMetadata:portable.exampleMetadata}),'Editable foundation document').json;
 must(parseWorkflowDocument(editableDocument),'Editable roundtrip');
 const lesson={...copy(options.lesson),collection:'Memory',execution:'unified',minRuntime:3,checkpoints:portable.exampleMetadata.checkpoints};
 return {...identity,number:options.number,goal:options.goal,lesson,portable,editableDocument,ownedFixtures:copy(options.ownedFixtures??{})};
}
