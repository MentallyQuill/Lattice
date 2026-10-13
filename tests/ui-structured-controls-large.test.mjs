import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
import { describePrimitive } from '../src/workflow/operations/nodes.js?v=0.27.1';
import { prepareWorkspaceViews, projectWorkspacePanels } from '../src/ui/workspace-preparation.js?v=0.27.1';
import { projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.1';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.1';
import { prepareGraphCandidate } from '../src/workflow/composition.js?v=0.27.1';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js?v=0.27.1';
import * as history from '../src/history.js?v=0.27.1';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);

async function compiledDetails(directory) {
    const files = new Map();
    async function component(url) {
        if (files.has(url.href)) return files.get(url.href);
        const path = join(directory, 'component-' + files.size + '.mjs'); files.set(url.href, path);
        const result = compile(await readFile(url, 'utf8'), { filename: url.pathname, generate: 'client', css: 'injected' });
        let code = result.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
        for (const item of [...code.matchAll(/from\s+(['"])([^'"]+)\1/g)]) {
            const specifier = item[2];
            const target = specifier.endsWith('.svelte') ? pathToFileURL(await component(new URL(specifier, url))).href : specifier.startsWith('.') ? new URL(specifier, url).href : specifier;
            code = code.replace(item[0], 'from ' + JSON.stringify(target));
        }
        await writeFile(path, code); return path;
    }
    const leaf = await component(new URL('../ui/NodeDetails.svelte', import.meta.url));
    const harness = compile(`<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf).href)}; let { initial, actions } = $props(); let view = $state.raw(initial); export function update(next) { view = next; }</script><Leaf {view} {actions} />`, { filename: 'LargeDetailsHarness.svelte', generate: 'client' });
    const code = harness.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
    const path = join(directory, 'harness.mjs'); await writeFile(path, code);
    return (await import(pathToFileURL(path).href)).default;
}

test('64 substantial Compose sections retain exact content through typed Save and invalid draft restoration', async () => {
    // The actual primitive admits 64 sections, each at most 100,000 UTF-16 units.
    // Catch truncated/reordered typed payloads, lost raw drafts, and JSON work on row input.
    const sections = Array.from({ length: 64 }, (_, index) => ({ name: 'section_' + index, text: `Start ${index}\n` + 'Context 🌿 and quoted "text".\n'.repeat(64) + `End ${index}` }));
    sections[31].text = 'Near limit\n' + 'x'.repeat(99000) + '\nEnd near limit';
    const root = { id: 'large-details', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, nodes: { compose: { id: 'compose', type: 'workflow', operation: 'compose', operationVersion: 1, phase: 'pre', x: 0, y: 0, sections } }, wires: {}, groups: {}, portals: {}, definitions: {} };
    assert.equal(describePrimitive(root.nodes.compose).ok, true);
    assert.equal(describePrimitive({ ...root.nodes.compose, sections: [...sections, { name: 'overflow', text: '' }] }).ok, false);
    assert.ok(new TextEncoder().encode(JSON.stringify(sections)).byteLength > 200000);
    const original = structuredClone(sections), expected = structuredClone(sections);
    expected[31].text += '\nEdited 🌿 "exactly"';
    let session, revision = 0, mounted, submitted, saves = 0;
    function panel() {
        const prepared = prepareWorkspaceViews(root); assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
        session = createGraphViewSession({ root, activationId: 'large-details', ...prepared.data }).data;
        session.updateView({ selection: { primary: { kind: 'node', id: 'compose' }, multi: [] } });
        const workflow = projectPreparedWorkflow(prepared.data.workflow, { selectedId: 'compose' });
        return projectWorkspacePanels({ ...session.readEditor(), documentNamespace: 'retained-large-document' }, workflow, {}, 'revision-' + revision, null, null).nodeDetails;
    }
    const initial = panel(); history.reset(root);
    const actions = { editControl(_selection, key, value) {
        assert.equal(key, 'sections'); submitted = structuredClone(value); saves++;
        const context = captureGraphEditContext(root, () => session.readEditContext()); assert.equal(context.ok, true);
        const candidate = structuredClone(root); candidate.nodes.compose.sections = value;
        const prepared = prepareGraphCandidate(root, candidate); assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
        const result = commitPreparedGraph(root, { ...prepared.data, context: context.data }); assert.equal(result.ok, true, JSON.stringify(result.error));
        revision++; mounted.update(panel()); flushSync(); return result;
    } };
    const directory = await mkdtemp(join(tmpdir(), 'lattice-large-details-'));
    const host = document.createElement('div'); document.body.append(host);
    const settle = async () => { flushSync(); await tick(); flushSync(); };
    try {
        mounted = mount(await compiledDetails(directory), { target: host, props: { initial, actions } }); await settle();
        assert.equal(host.querySelectorAll('.pc-structured-row').length, 64);
        assert.equal(host.querySelector('[aria-label="Add section"]').disabled, true);
        const field = host.querySelector('[aria-label="Section 32 text"]'); assert.equal(field.value, original[31].text);
        const originalParse = JSON.parse, originalStringify = JSON.stringify; let parses = 0, encodes = 0;
        JSON.parse = function(...args) { parses++; return originalParse.apply(this, args); };
        JSON.stringify = function(...args) { encodes++; return originalStringify.apply(this, args); };
        try {
            field.value = expected[31].text; field.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync();
            assert.equal(parses, 0, 'typed input never parses the full section list');
            assert.equal(encodes, 0, 'typed input never serializes the full section list');
        } finally { JSON.parse = originalParse; JSON.stringify = originalStringify; }
        assert.deepEqual(root.nodes.compose.sections, original, 'editing remains staged until Save');
        host.querySelector('[data-save-control="sections"]').click(); await settle();
        assert.equal(saves, 1); assert.deepEqual(submitted, expected); assert.deepEqual(root.nodes.compose.sections, expected);
        host.querySelector('[aria-label="Edit Sections as JSON"]').click(); await settle();
        const raw = host.querySelector('[aria-label="Sections"]'), invalid = JSON.stringify(expected, null, 2).slice(0, -1);
        raw.value = invalid; raw.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await settle();
        host.querySelector('[data-save-control="sections"]').click(); await settle();
        assert.equal(saves, 1, 'invalid JSON never reaches checked commit'); assert.equal(raw.getAttribute('aria-invalid'), 'true');
        revision++; mounted.update(panel()); await settle();
        assert.equal(host.querySelector('[aria-label="Sections"]').value, invalid);
        mounted.update(null); await settle(); mounted.update(panel()); await settle();
        assert.equal(host.querySelector('[aria-label="Sections"]').value, invalid);
        assert.equal(host.querySelector('[aria-label="Sections"]').getAttribute('aria-invalid'), 'true');
        assert.deepEqual(root.nodes.compose.sections, expected, 'rejected draft never changes the committed surrounding content');
    } finally {
        if (mounted) await unmount(mounted); host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory)); assert.ok(scope && scope.startsWith('lattice-large-details-') && !scope.startsWith('..') && !isAbsolute(scope)); await rm(directory, { recursive: true, force: true });
    }
});


test('128 Pattern expressions keep stable IDs and labels through typed reorder and Save',async()=>{
 const {projectNodeControls}=await import('../src/ui/node-control-projection.js');
 const original=Array.from({length:128},(_,i)=>({id:'pattern-'+(i+1),pattern:'term '+i,...(i%2?{label:'Label '+i}:{})}));
 const control=projectNodeControls('pattern',{rules:original},{phase:'post'}).find(row=>row.key==='rules');
 const initial={selectionKey:'pattern',revision:'1',address:{workflowId:'root',instancePath:[],nodeId:'pattern'},title:'Pattern',canonicalTitle:'Pattern',iconPath:'',family:'Data',phase:'post',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:[control],model:null,ports:[]};
 const directory=await mkdtemp(join(tmpdir(),'lattice-large-details-')),host=document.createElement('div');document.body.append(host);let mounted,submitted;
 try{
  mounted=mount(await compiledDetails(directory),{target:host,props:{initial,actions:{editControl(_selection,key,value){assert.equal(key,'rules');submitted=value;return {ok:true};}}}});flushSync();await tick();
  assert.equal(host.querySelectorAll('.pc-structured-row').length,128);assert.equal(host.querySelector('[aria-label="Add pattern"]').disabled,true);
  const parse=JSON.parse,stringify=JSON.stringify;let parses=0,encodes=0;JSON.parse=function(...args){parses++;return parse.apply(this,args);};JSON.stringify=function(...args){encodes++;return stringify.apply(this,args);};
  try{const editor=host.querySelector('[aria-label="Pattern 128 expression"]');editor.value='a{1,3}';editor.dispatchEvent(new dom.window.Event('input',{bubbles:true}));flushSync();host.querySelector('[aria-label="Move pattern 128 up"]').click();flushSync();assert.equal(parses,0);assert.equal(encodes,0);}finally{JSON.parse=parse;JSON.stringify=stringify;}
  assert.equal(submitted,undefined);host.querySelector('[data-save-control="rules"]').click();flushSync();await tick();flushSync();
  const expected=structuredClone(original);expected[127].pattern='a{1,3}';[expected[126],expected[127]]=[expected[127],expected[126]];assert.deepEqual(submitted,expected);assert.equal(submitted[126].id,'pattern-128');assert.equal(submitted[126].label,'Label 127');assert.deepEqual(control.value,original);
 }finally{if(mounted)await unmount(mounted);host.remove();await rm(directory,{recursive:true,force:true});}
});
