import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';
import { starterGraph } from '../src/workflow/starters.js?v=0.27.3';
import { cloneWorkflowDocument } from '../src/workflow/document.js?v=0.27.3';
import { prepareWorkspaceViews } from '../src/ui/workspace-preparation.js?v=0.27.3';
import { projectPreparedWorkflow, createWorkflowSession } from '../src/ui/workflow-surface.js?v=0.27.3';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLMediaElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);
const directory = await mkdtemp(join(tmpdir(), 'lattice-legacy-root-toolbar-'));
after(async () => {
    const target = resolve(directory), rel = relative(resolve(tmpdir()), target);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(target, { recursive: true, force: true });
});
const toolbar = await compiled('Toolbar', directory);
const harness = await compiled('LegacyToolbarHarness', directory, `<script>import Toolbar from ${JSON.stringify(pathToFileURL(toolbar.path).href)}; let { initial, actions } = $props(); let state = $state.raw(initial); export function update(next) { state = next; }</script><Toolbar {state} {actions} local={() => {}} />`);
const settle = async () => { flushSync(); await tick(); flushSync(); };
const state = (workflow) => ({ graphs: [], graphId: 'root', enabled: true, inspectorOpen: true, document:{name:'Current document',dirty:false,native:false,recents:[],recovery:[]}, workflow, history: { undo: false, redo: false }, selectionActions: {} });
async function fixture(initial, command = () => {}) {
    const host = document.createElement('div'); document.body.append(host);
    const mounted = mount(harness.component, { target: host, props: { initial, actions: { command, setEnabled(){}, logoUrl: '/assets/lattice-logo.svg' } } }); await settle();
    return { host, stop: () => host.querySelector('.pc-root-stop'), async update(next) { mounted.update(next); await settle(); }, async close() { await unmount(mounted); host.remove(); } };
}
test('an invalid pinned projection cannot restore a retired root Run control', async () => {
    const root=cloneWorkflowDocument(starterGraph('unified-basic')).data;
    const prepared=prepareWorkspaceViews(root);assert.equal(prepared.ok,true);
    const invalid=projectPreparedWorkflow(prepared.data.workflow,{selectedTarget:{workflowId:root.id,instancePath:[],nodeId:'deleted',portId:'out'}});
    assert.ok(invalid.issues.length);
    const f=await fixture(state(invalid));try {assert.equal(f.host.querySelector('.pc-root-run'),null);assert.equal(f.stop(),null);assert.equal(f.host.querySelector('.pc-document-name').textContent,'Current document');}finally{await f.close();}
});
test('owned native activity exposes Stop even while the selected projection is idle', async () => {
    const calls=[],idle={phase:'unified',callBound:0,busy:false,ownedBusy:true};
    const f=await fixture(state(idle),command=>calls.push(command));
    try {assert.ok(f.stop());f.stop().click();await settle();assert.deepEqual(calls,['stop-workflow']);await f.update(state({...idle,ownedBusy:false}));assert.equal(f.stop(),null);assert.equal(f.host.querySelector('.pc-root-run'),null);}finally{await f.close();}
});
test('missing current workflow keeps document controls without exposing retired execution', async () => {
    const f=await fixture(state(undefined));try {assert.equal(f.stop(),null);assert.equal(f.host.querySelector('.pc-root-run'),null);assert.match(f.host.querySelector('[aria-label="Workflow status"]').textContent,/unavailable/);assert.equal(f.host.querySelector('.pc-enable-input').checked,true);}finally{await f.close();}
});
