import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {listWorkflowExampleResults,installWorkflowExample} from '../src/workflow/examples.js';
import {getNodeGuideExample} from '../src/workflow/node-guide-examples.js';
import {parseWorkflowDocument,serializeWorkflowDocument} from '../src/workflow/document-file.js';
import {inspectExampleCheckpoint} from '../src/workflow/example-metadata.js';

test('foundation exposes exactly the previous thirty and stable lessons34 and35',()=>{
 const entries=listWorkflowExampleResults();assert.equal(entries.length,32);assert.deepEqual(entries.map(e=>e.number),[...Array.from({length:30},(_,i)=>i+1),34,35]);assert.ok(entries.every(e=>e.result.ok));
});
test('foundation installed lessons remap every checkpoint and retain identity on save and reopen',()=>{
 for(const number of [34,35]){const result=installWorkflowExample('lesson-'+number);assert.equal(result.ok,true,JSON.stringify(result.error));const {graph,exampleMetadata}=result.data;
 assert.equal(graph.runtime,3);assert.equal(exampleMetadata.id,'lesson-'+number);assert.deepEqual(result.data.companions,[]);assert.ok(exampleMetadata.checkpoints.length>=3);
 for(const checkpoint of exampleMetadata.checkpoints)assert.equal(inspectExampleCheckpoint(graph,checkpoint).ok,true);
 const saved=serializeWorkflowDocument(graph,null,{exampleMetadata});assert.equal(saved.ok,true);assert.deepEqual(parseWorkflowDocument(saved.data.json).data.exampleMetadata,exampleMetadata);
 }
});
test('foundation Chunk guide is a complete lesson with installed fixture bytes',()=>{
 const guide=getNodeGuideExample('chunk');assert.ok(guide);assert.equal(guide.id,'lesson-34');assert.ok(guide.focus.nodeIds.some(id=>guide.graph.nodes[id]?.operation==='chunk'));assert.equal(guide.fixtures[0].name,'harbor-lore-chapter.txt');
 assert.equal(guide.fixtures[0].content,readFileSync('examples/memory/fixtures/harbor-lore-chapter.txt','utf8'));
});
test('foundation generated manifest owns only the two lessons and exact fixture hashes',()=>{
 assert.ok(existsSync('examples/memory/generated-manifest.json'),'foundation manifest is generated');
 const manifest=JSON.parse(readFileSync('examples/memory/generated-manifest.json','utf8'));assert.deepEqual(manifest.lessons,[34,35]);assert.equal(manifest.files.length,10);assert.ok(manifest.files.every(row=>typeof row.sha256==='string'&&row.path));
});

test('foundation catalog exposes both turn fixtures as installed setup downloads',async()=>{
 const {projectWorkflowExamples}=await import('../src/ui/example-catalog.js');const tile=projectWorkflowExamples().find(entry=>entry.id==='lesson-35');assert.equal(tile.fixtures?.length,2);assert.equal(tile.fixtures[0].content,readFileSync('examples/memory/fixtures/thirteen-turn-harbor-chat.jsonl','utf8'));
});
