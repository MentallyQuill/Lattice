import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateMemoryExamples} from '../tools/build-memory-examples.mjs';

test('foundation generation is deterministic and detects drift without overwriting edited artifacts or exports',async()=>{
 const root=await mkdtemp(join(tmpdir(),'foundation-generation-'));
 try{const first=await generateMemoryExamples({outputRoot:root});assert.equal(first.lessons,2);assert.equal(first.files,10);assert.equal(first.changed.length,11);
  const again=await generateMemoryExamples({outputRoot:root});assert.deepEqual(again.changed,[]);assert.deepEqual((await generateMemoryExamples({outputRoot:root,check:true})).changed,[]);
  const path=join(root,'examples/memory/34-split-lore-chapter-into-passages.lattice.json'),manifest=await readFile(join(root,'examples/memory/generated-manifest.json'));
  await writeFile(path,'user-edited lesson');await writeFile(join(root,'examples/memory/my-export.json'),'personal export');
  await assert.rejects(generateMemoryExamples({outputRoot:root,check:true}),/stale/);await assert.rejects(generateMemoryExamples({outputRoot:root}),/Modified generated artifact/);
  assert.equal(await readFile(path,'utf8'),'user-edited lesson');assert.equal(await readFile(join(root,'examples/memory/my-export.json'),'utf8'),'personal export');assert.deepEqual(await readFile(join(root,'examples/memory/generated-manifest.json')),manifest);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('foundation generator refuses ownership outside the selected subset before changing anything',async()=>{
 const root=await mkdtemp(join(tmpdir(),'foundation-ownership-'));try{await generateMemoryExamples({outputRoot:root});const path=join(root,'examples/memory/generated-manifest.json'),manifest=JSON.parse(await readFile(path));manifest.files.push({path:'../outside.json',sha256:'unreviewed'});await writeFile(path,JSON.stringify(manifest));
  await assert.rejects(generateMemoryExamples({outputRoot:root}),/Unreviewed generated ownership/);assert.deepEqual(JSON.parse(await readFile(path)),manifest);
 }finally{await rm(root,{recursive:true,force:true});}
});
