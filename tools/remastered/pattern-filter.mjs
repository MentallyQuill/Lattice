import { operationDefaults } from '../../src/workflow/catalog.js';
import { exportWorkflow } from '../../src/workflow/packages.js';
import { validateWorkflow } from '../../src/workflow/contracts.js';
export const PATTERN_FILTER_SOURCE = 'First.\n\n' + '1 '.repeat(12) + '3 3\n\nLast.';
export function patternFilterLesson() {
 const graph = { id: 'pattern-filter-reply', name: 'Detect, route and filter a reply', schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, definitions: {}, portals: {}, groups: {}, roles: {}, description: 'Synthetic teaching source: First., a paragraph containing twelve 1 tokens and two 3 tokens, then Last. Supply the fixture as the native reply in a practice chat. Pattern detects 14 occurrences with counts 12/0/2; Branch chooses once per reply. Filter Text removes the matching paragraph atomically. Inspect Matched, Matches and Filter report before accepting Review / Publish. No private file, profile or auxiliary model is required. Incomplete detection holds routing; blocked or empty filtering holds review. Copy source copies only the retained privacy-projected payload; a copied report cannot authorize filtering.' };
 const add = (id, operation, settings={}, column=0, row=0) => graph.nodes[id] = { ...operationDefaults(operation), ...settings, id, type: 'workflow', enabled: true, x:80+column*330,y:100+row*250,w:270,h:210 };
 add('send','on-send'); add('generate','generate-reply',{},1); add('pattern','pattern',{rules:['1','2','3'].map((pattern,index)=>({id:'term-'+index,pattern})),mode:'whole-word',scope:'whole'},2);
 add('branch','branch',{artifactKind:'draft'},3); add('filter','filter-text',{action:'remove',unit:'paragraph',scope:'whole',protectedLiterals:[]},4);
 add('join','join',{artifactKind:'draft',inputs:[{id:'filtered',label:'Filtered',required:false},{id:'bypass',label:'No match',required:false}]},5); add('review','review-publish',{},6);
 graph.nodes.fixture={id:'fixture',type:'note',title:'Synthetic source fixture',content:PATTERN_FILTER_SOURCE,x:80,y:400,w:500,h:220};
 for (const [id,from,fromPort,to,toPort] of [['activation','send','activation','generate','activation'],['source','generate','draft','pattern','in'],['payload','pattern','out','branch','in'],['condition','pattern','matched','branch','condition'],['selected','branch','yes','filter','in'],['report','pattern','matches','filter','matches'],['filtered','filter','out','join','filtered'],['bypass','branch','no','join','bypass'],['review','join','out','review','draft']]) graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};
 const valid=validateWorkflow(graph); if(!valid.ok)throw Error(JSON.stringify(valid.error)); return exportWorkflow(graph);
}
