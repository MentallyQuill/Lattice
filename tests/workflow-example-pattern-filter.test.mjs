import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { parseWorkflow } from '../src/workflow/packages.js?v=0.27.2';
import { validateWorkflow } from '../src/workflow/contracts.js?v=0.27.2';
import { runWorkflowForHost } from '../src/workflow/runtime.js?v=0.27.2';
import { hostHarness, fourteen, retained } from './helpers/pattern-routing-fixtures.mjs';
async function operations(directory) {
 const result = [];
 for (const entry of await readdir(directory, { withFileTypes: true })) {
  const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
  if (entry.isDirectory()) result.push(...await operations(url));
  else if (entry.name.endsWith('.json')) {
   const collect = value => { if (!value || typeof value !== 'object') return; if (value.operation) result.push(value.operation); for (const child of Object.values(value)) collect(child); };
   collect(JSON.parse(await readFile(url, 'utf8')));
  }
 }
 return result;
}
test('active runnable examples use the current Pattern and Filter Text catalog', async () => {
 const activeExampleOperations = await operations(new URL('../examples/', import.meta.url));
 assert.equal(activeExampleOperations.includes('pattern-scan'), false);
 assert.equal(activeExampleOperations.includes('pattern'), true);
 assert.equal(activeExampleOperations.includes('filter-text'), true);
});
test('synthetic Pattern lesson validates and routes fourteen hits through one paragraph deletion', async () => {
 assert.equal(await readFile(new URL('../examples/remastered/fixtures/pattern-filter-reply.txt', import.meta.url), 'utf8'), fourteen);
 const envelope = await readFile(new URL('../examples/pattern-filter-reply.lattice.json', import.meta.url), 'utf8');
 const parsed = parseWorkflow(envelope); assert.equal(parsed.ok, true, JSON.stringify(parsed.error));
 const graph = parsed.data, valid = validateWorkflow(graph); assert.equal(valid.ok, true, JSON.stringify(valid.error)); assert.equal(valid.data.callBound, 0);
 const h = hostHarness(fourteen), result = await runWorkflowForHost(graph, h.ports, h.hooks);
 assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(h.effects.filters, 1); assert.equal(h.effects.requests, 0);
 assert.equal(retained(h.outputs, 'pattern', 'matches').value.totalOccurrences, 14);
 assert.equal(retained(h.outputs, 'filter').text, 'First.\n\nLast.');
 assert.equal(h.settlements[0].terminals[0].artifact.text, 'First.\n\nLast.');
 for (const [text, reason] of [['1 3', 'EMPTY_FILTER_RESULT'], [fourteen, 'FILTER_PERMISSION_BLOCKED']]) {
  const held = hostHarness(text, reason === 'FILTER_PERMISSION_BLOCKED' ? { protectedLiterals: ['3'] } : {});
  const outcome = await runWorkflowForHost(graph, held.ports, held.hooks); assert.equal(outcome.ok, false); assert.equal(held.effects.commits, 0);
 }
});

test('Literal Cleanup exposes a zero-call Draft routing system with current canonical records', async () => {
 const { createLibrarySubgraph } = await import('../src/workflow/library/subgraphs.js?v=0.27.2');
 const created = createLibrarySubgraph('literal-cleanup'); assert.equal(created.ok,true,JSON.stringify(created.error));
 const d=created.data.definition; assert.equal(d.interface[1].kind,'draft');
 assert.ok(Object.values(d.body.nodes).some(node=>node.operation==='filter-text'));
 assert.ok(Object.values(d.body.nodes).some(node=>node.operation==='branch'));
 assert.ok(Object.values(d.body.nodes).some(node=>node.operation==='join'));
});
