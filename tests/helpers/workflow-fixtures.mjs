// Test-only operation layouts. Production creation supports only unified-basic.
import { operationDefaults } from '../../src/workflow/catalog.js?v=0.27.2';
import { starterGraph } from '../../src/workflow/starters.js?v=0.27.2';
import { createLibrarySubgraph } from '../../src/workflow/library/subgraphs.js?v=0.27.2';
import { parseSubgraph } from '../../src/workflow/packages.js?v=0.27.2';
import { definitionRefKey } from '../../src/workflow/definitions.js?v=0.27.2';
const root = id => ({ id:'fixture-'+id, name:id, schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{},wires:{},portals:{},definitions:{},groups:{},view:{x:0,y:0,zoom:1} });
const add = (graph,id,operation,phase,controls={}) => graph.nodes[id] = {...operationDefaults(operation,controls.mode?{mode:controls.mode}:{}),profileId:null,...controls,id,type:'workflow',operationVersion:1,enabled:true,phase,x:100+Object.keys(graph.nodes).length*310,y:140,w:260};
const wire = (graph,id,from,to,fromPort='out',toPort='in') => graph.wires[id] = {id,route:'wire',from,fromPort,to,toPort};
export function withNativeBoundary(graph,guidanceNodeId) {
    for(const [id,operation,phase] of [['on-send','on-send','pre'],['generate-reply','generate-reply','pre'],['review-publish','review-publish','post']]) add(graph,id,operation,phase);
    wire(graph,'activation','on-send','generate-reply','activation','activation');
    wire(graph,'draft','generate-reply','review-publish','draft','draft');
    if(guidanceNodeId)wire(graph,'native-guidance',guidanceNodeId,'generate-reply','out','guidance');
    return graph;
}
export function fixtureLibraryWorkflow(id) {
    const created=createLibrarySubgraph(id);
    if(!created.ok)return created;
    const parsed=parseSubgraph(created.data.json);if(!parsed.ok)return parsed;
    const {definition,definitions}=parsed.data,graph=root('library-'+id),pre=id==='scene-compass';
    graph.definitions={...definitions,[definitionRefKey(definition)]:definition};graph.roles=structuredClone(definition.body.roles);
    add(graph,'source',pre?'scene-context':'reply-snapshot',pre?'pre':'post');
    graph.nodes.library={id:'library',type:'subgraph',definition:{id:definition.id,version:definition.version,semanticHash:definition.semanticHash},parameterOverrides:{},roleOverrides:{},nodeBindingOverrides:{},x:410,y:140,w:260};
    wire(graph,'source','source','library','out',definition.interface[0].id);
    if(pre){add(graph,'output','guidance','pre');wire(graph,'output','library','output',definition.interface[1].id);withNativeBoundary(graph,'output');}
    else if(id==='literal-cleanup'){delete graph.nodes.source;withNativeBoundary(graph);delete graph.wires.source;graph.wires.draft.from='library';graph.wires.draft.fromPort='filtered-draft';wire(graph,'library-source','generate-reply','library','draft','draft');}
    else{add(graph,'review','review-gate','post');add(graph,'apply','apply-reply','post');wire(graph,'review','library','review',definition.interface[1].id);wire(graph,'apply','review','apply');}
    return {ok:true,data:{graph}};
}
export function fixtureGraph(id) {
    if(id==='unified-basic')return starterGraph(id);
    if(['scene-compass','library-literal-cleanup','formatting-cleanup','prose-cleanup'].includes(id))return fixtureLibraryWorkflow(id==='library-literal-cleanup'?'literal-cleanup':id).data.graph;
    const graph=root(id);
    const layouts={
        'native-guidance':['scene-context','smart-compactor','response-plan','guidance'],
        'structured-guidance':['compose','json-decode','select-fields','compose','guidance'],
        'literal-cleanup':['reply-snapshot','text-rules','validate-patches','review-gate','apply-reply'],
        'reviewed-de-slop':['reply-snapshot','pattern','repair','validate-patches','review-gate','apply-reply'],
    };
    if(Object.hasOwn(layouts,id)){
        const operations=layouts[id],pre=['native-guidance','structured-guidance'].includes(id),ids=id==='structured-guidance'?['compose-json','json-decode','select-fields','compose-guidance','guidance']:operations;
        operations.forEach((operation,index)=>{add(graph,ids[index],operation,pre?'pre':'post');if(index)wire(graph,'wire-'+index,ids[index-1],ids[index],'out',ids[index]==='compose-guidance'?'data':'in');});
        if(id==='native-guidance'){graph.roles.Analysis={profileId:null,model:null};graph.nodes['smart-compactor'].method='compress';graph.nodes['response-plan'].instructions='Suggest scene direction and actor intentions. Preserve user agency; proposals are not established events.';}
        if(id==='structured-guidance'){graph.nodes['compose-json'].sections=[{name:'Scene',text:JSON.stringify({direction:'A quiet conversation.',constraint:'Let the user choose their next action.'},null,2)}];graph.nodes['select-fields'].fields=[{name:'direction',path:['direction']},{name:'constraint',path:['constraint']}];Object.assign(graph.nodes['compose-guidance'],{mode:'template',outputKind:'guidance',template:'Direction: {{data:/direction}}\nConstraint: {{data:/constraint}}'});}
        if(id==='literal-cleanup')Object.assign(graph.nodes['text-rules'],{inputKind:'draft',scope:'whole',rules:[{kind:'literal',pattern:'very very',replacement:'very',flags:''}]});
        if(id==='reviewed-de-slop'){graph.roles.Prose={profileId:null,model:null};graph.nodes['pattern'].rules=['a testament to','delve','tapestry'].map((pattern,index)=>({id:'term-'+index,pattern}));Object.assign(graph.nodes.repair,{mode:'contextual',scope:'whole'});const members=['pattern','repair','validate-patches'];graph.groups['ai-de-slop']={id:'ai-de-slop',title:'AI De-slop',collapsed:true,x:410,y:140,w:260,members};for(const member of members)graph.nodes[member].inGroup='ai-de-slop';}
        return pre?withNativeBoundary(graph,'guidance'):graph;
    }
    if(id==='reflect-and-express'){
        graph.roles.Analysis={profileId:null,model:null};
        for(const [key,operation,controls]of [['scene-context','scene-context',{}],['focus','context',{mode:'focus',method:'select'}],['prior','memory',{mode:'read',view:'state'}],['reflect','reflect',{mode:'character'}],['express','express',{mode:'behavior'}],['guidance','guidance',{}]])add(graph,key,operation,'pre',controls);
        wire(graph,'wire-1','scene-context','focus','out','context');wire(graph,'wire-2','focus','reflect','out','context');wire(graph,'wire-3','prior','reflect','out','state');wire(graph,'wire-4','reflect','express','out','assessment');wire(graph,'wire-5','express','guidance');return withNativeBoundary(graph,'guidance');
    }
    if(['internalize-and-commit','consequence-clock'].includes(id)){
        const track=id==='consequence-clock';if(!track)graph.roles.Analysis={profileId:null,model:null};
        add(graph,'prior','memory','post',{mode:'read',view:'state'});add(graph,'events','memory','post',{mode:'read',view:'events'});add(graph,'update',track?'state':'internalize','post',track?{mode:'track',trackId:'consequences'}:{mode:'experience'});add(graph,'commit','memory','post',{mode:'commit'});
        wire(graph,'wire-1','prior','update','out','state');wire(graph,'wire-2','events','update','out','events');wire(graph,'wire-3','update','commit','out','proposal');return withNativeBoundary(graph);
    }
    throw Error('Unknown test workflow fixture.');
}
