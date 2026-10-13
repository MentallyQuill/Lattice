import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compiled } from './helpers/svelte-compile.mjs';
import { JSDOM } from 'jsdom';
import { prepareNodeControlChange } from '../src/workflow/ports.js';
import { describeOperation } from '../src/workflow/catalog.js';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);


async function fixture(name, view, actions) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-detail-panels-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const leaf = await compiled(name, directory);
        const harness = await compiled(name + 'Harness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions } = $props(); let view = $state.raw(initial); export function update(next) { view = next; }</script><Leaf {view} {actions} />`);
        mounted = mount(harness.component, { target: host, props: { initial: view, actions } }); flushSync();
        return { host, update(next) { mounted.update(next); flushSync(); }, async close() { await unmount(mounted); host.remove(); const target = resolve(directory), rel = relative(resolve(tmpdir()), target); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(target, { recursive: true, force: true }); } };
    } catch (error) {
        if (mounted) await unmount(mounted); host.remove(); const rel = relative(resolve(tmpdir()), resolve(directory)); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(directory, { recursive: true, force: true }); throw error;
    }
}

test('actual library details permit local aliases without manufacturing an execution address',async()=>{
 const {nestedWorkflow}=await import('./fixtures/workflow-prepared-fixture.mjs');const {prepareLibraryViews,projectWorkspacePanels}=await import('../src/ui/workspace-preparation.js?v=0.27.2');const {createGraphViewSession}=await import('../src/ui/graph-view-session.js?v=0.27.2');
 const root=nestedWorkflow(),prepared=prepareLibraryViews(root.id,root.definitions);const initial={identity:{kind:'root',workflowId:root.id},readOnly:false,savedGraph:root,effectiveNodes:root.nodes,interface:[],ports:[],drawBase:root};
 const created=createGraphViewSession({root,activationId:'active',navigation:prepared.data.navigation,preparedViews:[initial,...prepared.data.preparedViews]});assert.equal(created.ok,true,JSON.stringify(created));const session=created.data;const ref=prepared.data.preparedViews.find(view=>view.definitionRef.id==='prepared-plan').definitionRef;session.openLibrary(ref);session.updateView({selection:{primary:{kind:'node',id:'work'},multi:[]}});
 const panel=projectWorkspacePanels(session.readEditor(),{selectedId:'work',nodes:[],graphId:root.id,profiles:[],targets:[],rows:[],issues:[],callBound:0},{busy:false},'active:1',null,null).nodeDetails;
 assert.ok(panel);assert.equal(panel.address.kind,'library');assert.deepEqual(panel.address.definitionRef,ref);assert.equal(panel.address.workflowId,undefined);assert.equal(panel.readOnly,true);
 const f=await fixture('NodeDetails',panel,{present:(capture,field,value)=>{assert.equal(capture.address.kind,'library');assert.equal(capture.address.workflowId,undefined);session.updateView({nodePresentation:{work:{[field]:value}}});return {ok:true};},editControl:()=>assert.fail('Library bodies cannot be edited')});
 try{const alias=f.host.querySelector('[aria-label="Node name"]');alias.value='Local note';alias.dispatchEvent(new dom.window.Event('change',{bubbles:true}));flushSync();await tick();assert.equal(session.readEditor().view.nodePresentation.work.alias,'Local note');assert.equal(f.host.querySelector('[aria-label="Instructions"]').disabled,true);}finally{await f.close();}
});


test('rendered Details sections use thin rules without nested card paint and retain readonly editors',async()=>{
 const {nestedWorkflow}=await import('./fixtures/workflow-prepared-fixture.mjs');const {prepareLibraryViews,projectWorkspacePanels}=await import('../src/ui/workspace-preparation.js?v=0.27.2');const {createGraphViewSession}=await import('../src/ui/graph-view-session.js?v=0.27.2');const root=nestedWorkflow(),prepared=prepareLibraryViews(root.id,root.definitions),initial={identity:{kind:'root',workflowId:root.id},readOnly:false,savedGraph:root,effectiveNodes:root.nodes,interface:[],ports:[],drawBase:root};const session=createGraphViewSession({root,activationId:'flat-details',navigation:prepared.data.navigation,preparedViews:[initial,...prepared.data.preparedViews]}).data;session.openLibrary(prepared.data.preparedViews.find(view=>view.definitionRef.id==='prepared-plan').definitionRef);session.updateView({selection:{primary:{kind:'node',id:'work'},multi:[]}});const panel=projectWorkspacePanels(session.readEditor(),{selectedId:'work',nodes:[],graphId:root.id,profiles:[],targets:[],rows:[],issues:[],callBound:0},{busy:false},'flat:1',null,null).nodeDetails;const f=await fixture('NodeDetails',panel,{});
 try{const groups=[...f.host.querySelectorAll('fieldset')];assert.ok(groups.length>=1);for(const group of groups){const paint=dom.window.getComputedStyle(group);assert.equal(paint.backgroundColor,'rgba(0, 0, 0, 0)');assert.equal(parseFloat(paint.borderRadius),0);assert.equal(paint.boxShadow,'none');assert.equal(paint.borderTopWidth,'1px');assert.equal(paint.borderRightWidth,'0px');}assert.equal(f.host.querySelector('[aria-label="Instructions"]').disabled,true);assert.equal(f.host.querySelector('[aria-label="Node name"]').disabled,true,'A missing presentation callback must stay disabled');}finally{await f.close();}
});
