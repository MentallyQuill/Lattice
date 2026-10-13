import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';
import { OPERATIONS, operationDefaults, describeOperation } from '../src/workflow/catalog.js';
import { projectNodeControls } from '../src/ui/node-control-projection.js';
import { readControlRows, writeControlRows } from '../src/ui/control-input-adapters.js';
import { parseControlInput } from '../src/ui/control-input-contracts.js';
import { deferredNodeDescription, nodeNeedsConfiguration, createConfiguredNodeSession, configuredCreationStage, iterationHelperChoices } from '../src/ui/configured-node-creation.js';
import { prepareNativeSearchCatalog, resolveNativeSearchChoice } from '../src/ui/native-search-catalog.js';
import { prepareNativeConnectionEdit } from '../src/workflow/connection-edits.js';
import { prepareNativeNodeEdit } from '../src/workflow/definition-library.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import { prepareNodeProfileOptions, readNodeProfileMetadata } from '../src/ui/node-profile-preparation.js';
import { activeModelMetadata } from '../src/workflow/model-profiles.js';
import { workflowDataPresetFor } from '../src/workflow/workflow-data-defaults.js';
import { safe } from '../src/state.js';
import * as H from '../src/history.js?v=0.27.1';

const operations = ['decision', 'advance-time', 'time-trigger'];
const scope = { schema: 3, runtime: 2, mode: 'native-unified', workflowId: 'n6-integration', viewPath: [], inDefinition: false };
const emptyGraph = () => ({ id: 'n6-integration', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, nodes: {}, wires: {}, definitions: {}, portals: {} });
const question = { type: 'noul', instructions: 'Before, exact words.', criteria: { true: { evidence: [null, false, 0, ''] }, false: [] } };
const schedule = { scheduleId: 'curse-1', kind: 'interval', anchorMinute: 0, intervalMinutes: 480, revision: 7, clockId: 'chosen-clock', calendarId: 'chosen-calendar', scope: { visibility: 'private', actorId: 'Rowan', values: [null, false, 0, ''] } };
function settings(operation) {
    const controls = Object.fromEntries(Object.entries(operationDefaults(operation)).filter(([key]) => OPERATIONS[operation].controls.includes(key)));
    if (operation === 'decision') controls.questions = { 'question-1': structuredClone(question) };
    if (operation === 'advance-time') controls.schedules = [structuredClone(schedule)];
    if (operation === 'time-trigger') Object.assign(controls, { scheduleId: 'trigger-1', metadata: { scope: { visibility: 'private', actorId: 'Rowan' }, own: { numeric: 0, 'a.b': false, 'red, blue': null } } });
    return controls;
}
const controllerSource = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function actualFunction(name, environment) {
    const start = controllerSource.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Missing actual controller function ' + name);
    const lineEnd = controllerSource.indexOf('\n', start);
    const firstLine = controllerSource.slice(start, lineEnd).trimEnd();
    const end = firstLine.endsWith('}') ? lineEnd : controllerSource.indexOf('\n}', start) + 2;
    assert.ok(end > start);
    return Function('environment', 'with(environment){' + controllerSource.slice(start, end) + ';return ' + name + ';}')(environment);
}
function controller(root = emptyGraph()) {
    H.track(root);
    const readContext = () => ({ sessionId: 'n6-authoring', viewPath: [], readOnly: false });
    const capture = captureGraphEditContext(root, readContext);
    assert.equal(capture.ok, true, JSON.stringify(capture));
    const token = Object.freeze({});
    let current = true, commits = 0, preparations = 0;
    const context = { chatId: 'n6-story', chatMetadata: {}, chat: [] };
    const editorCaptures = new WeakMap([[token, { root, path: [], context: capture.data }]]);
    const environment = {
        current: root, selected: null,
        graphViews: { readEditor: () => ({ view: { identity: { kind: 'root' } }, prepared: { savedGraph: root } }) },
        editorDraw: { nativeCards: {} }, editorCaptures,
        editorCurrent: value => current && value === token,
        workflowRuntime: { getStoryDocumentCatalog: () => undefined },
        nodeDocumentCaptures: new Map(), nodeCreationScopes: new WeakMap(), pendingConfiguredNode: null,
        ctx: () => context, safe, prepareNodeProfileOptions, readNodeProfileMetadata, activeModelMetadata, workflowDataPresetFor,
        createConfiguredNodeSession, configuredCreationStage, nodeNeedsConfiguration, iterationHelperChoices,
        workbench: { update(value) { if ('configureNode' in value) environment.view = value.configureNode; } },
        canvas: { toGraph: (x, y) => ({ x, y }) }, toast() {}, graphDocumentHooks: {},
        prepareNativeCreation(value, command) { preparations++; return prepareNativeConnectionEdit(root, command); },
        prepareShelfNodeCreation(value, command, at) { preparations++; return prepareNativeConnectionEdit(root, { ...command, graphPoint: at ?? { x: 0, y: 0 } }); },
        commitGraphEdit(graph, prepared) {
            const result = commitPreparedGraph(graph, prepared);
            if (result.ok && result.data.changed) commits++;
            return result;
        },
    };
    environment.profiles = actualFunction('profiles', environment);
    environment.commitCaptured = actualFunction('commitCaptured', environment);
    const sessionStart = controllerSource.indexOf('const configuredNodeSession =');
    const sessionEnd = controllerSource.indexOf('\n});', sessionStart) + 4;
    assert.ok(sessionStart >= 0 && sessionEnd > sessionStart);
    environment.configuredNodeSession = Function('environment', 'with(environment){' + controllerSource.slice(sessionStart, sessionEnd) + ';return configuredNodeSession;}')(environment);
    for (const name of ['requestNodeCreation', 'cancelConfiguredNode', 'commitNodeCreation']) environment[name] = actualFunction(name, environment);
    environment.detailCapture = selection => current && root.nodes[selection.address.nodeId] ? { ok: true, data: token } : { ok: false, error: { code: 'STALE_CONTEXT', message: 'The detail capture expired.' } };
    environment.scopeCommand = () => ({ viewPath: [] });
    environment.prepareNode = actualFunction('prepareNode', { prepareNativeNodeEdit });
    const editStart = controllerSource.indexOf('    editControl(selection,key,value)');
    const editEnd = controllerSource.indexOf('\n', editStart);
    assert.ok(editStart >= 0 && editEnd > editStart);
    const editControl = Function('environment', 'with(environment){return ({' + controllerSource.slice(editStart, editEnd).trim().replace(/,$/, '') + '}).editControl;}')(environment);
    return {
        root, environment, token, editControl, commits: () => commits, preparations: () => preparations,
        expire() { current = false; },
        refresh() { const next = captureGraphEditContext(root, readContext); assert.equal(next.ok, true, JSON.stringify(next)); editorCaptures.set(token, { root, path: [], context: next.data }); },
    };
}
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLMediaElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const { mount, unmount, flushSync, tick } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
async function panel(name, view, actions) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-n6-integration-'));
    const target = document.createElement('div'); document.body.append(target);
    let mounted;
    async function close() {
        if (mounted) await unmount(mounted);
        target.remove();
        const local = relative(resolve(tmpdir()), resolve(directory));
        assert.ok(local && !local.startsWith('..') && !isAbsolute(local));
        await rm(directory, { recursive: true, force: true });
    }
    try {
        const leaf = await compiled(name, directory);
        const harness = await compiled('N6ParentHarness', directory, `<script>import Parent from ${JSON.stringify(pathToFileURL(leaf.path).href)};let {initial,actions}=$props();let view=$state.raw(initial);export function update(next){view=next;}</script><Parent {view} {actions}/>`);
        mounted = mount(harness.component, { target, props: { initial: view, actions } });
        flushSync(); await tick(); flushSync();
        return { host: target, mounted, close };
    } catch (error) { await close(); throw error; }
}
function input(host, label, value, event = 'input') {
    const element = host.querySelector('[aria-label="' + label + '"]');
    assert.ok(element, 'Missing ' + label);
    if (['checkbox', 'radio'].includes(element.type)) element.checked = value; else element.value = value;
    element.dispatchEvent(new dom.window.Event(event, { bubbles: true })); flushSync();
    return element;
}
async function click(host, label) {
    const element = [...host.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label || button.textContent.trim() === label);
    assert.ok(element, 'Missing ' + label); element.click(); flushSync(); await tick(); flushSync();
}
function detail(root, id = 'node', revision = 'r1') {
    const node = root.nodes[id], phase = node.phase ?? 'pre';
    return { selectionKey: id, revision, address: { workflowId: root.id, instancePath: [], nodeId: id }, title: node.operation, canonicalTitle: node.operation, iconPath: '', family: 'Derive', phase, operation: node.operation, alias: '', compact: false, enabled: true, readOnly: false, canPresent: true, controls: projectNodeControls(node.operation, node, { phase }), model: null, ports: [] };
}
function editing(operation, controls = {}) {
    const root = emptyGraph(); root.nodes.node = { id: 'node', type: 'workflow', operation, ...settings(operation), ...controls, phase: 'post' };
    return controller(root);
}
const keyFor = operation => operation === 'decision' ? 'questions' : operation === 'advance-time' ? 'schedules' : 'metadata';
function labelFor(operation) { return projectNodeControls(operation, settings(operation), { phase: 'post' }).find(control => control.key === keyFor(operation)).label; }
async function createPanel(f, operation, controls = settings(operation)) {
    const pending = f.environment.requestNodeCreation(f.token, { kind: 'create', operation, controls, graphPoint: { x: 20, y: 30 } });
    assert.ok(f.environment.view, operation + ' must use actual configured creation');
    let applied;
    const form = await panel('ConfigureNode', f.environment.view, {
        apply: (key, text, phase) => applied=f.environment.configuredNodeSession.apply(key, text, phase),
        cancel: key => f.environment.cancelConfiguredNode(key),
    });
    return { form, pending, get applied(){return applied;} };
}
async function inspectorRemount(form, view) {
    form.mounted.update(null); flushSync(); await tick();
    form.mounted.update({ ...view, revision: 'r2' }); flushSync(); await tick(); flushSync();
}
function oneUndo(f, before) {
    assert.ok(H.undo(f.root), 'One authoring Undo step must exist');
    assert.deepEqual(f.root, before);
    assert.equal(H.undo(f.root), null, 'The interaction must not create a second Undo step');
}


const remaining=['smart-compactor','pattern','filter-text','repair','compose','text-rules','select-fields','style-transfer','format-transfer','terminology-map','context','state','condition','join','collect','confidence-gate','revise-draft','collection','context-join'];
test('all remaining covered friendly controls require configured creation and preserve actual command stage',()=>{
 for(const operation of remaining) assert.equal(nodeNeedsConfiguration(operation),true,operation);
 for(const [operation,controls,phase,locked] of [['style-transfer',{inputKind:'text'},'pre',false],['style-transfer',{inputKind:'draft'},'post',true],['compose',{outputKind:'guidance'},'pre',true],['text-rules',{inputKind:'draft'},'post',true],['pattern',{},'post',true]]){
  assert.deepEqual(configuredCreationStage(operation,'native-unified','pre',false,controls),{phase,phaseLocked:locked});
 }
 assert.deepEqual(configuredCreationStage('join','native-unified','post',false),{phase:'post',phaseLocked:false});
 assert.deepEqual(configuredCreationStage('join','native-pre','post',true),{phase:'pre',phaseLocked:true});
});
test('shared inspector imports current unsaved rows, blocks Save while open, retains invalid source across selection, confirms only local then ordinary Save',async()=>{
 const f=editing('pattern');f.root.nodes.node.rules=[{id:'saved',pattern:'old'}];f.refresh();
 const view=detail(f.root);let calls=0;const form=await panel('NodeDetails',view,{editControl:(selection,key,value)=>{calls++;return f.editControl(selection,key,value);}});
 try{
  await click(form.host,'Import Rules table');
  assert.equal(form.host.querySelector('[data-save-control="rules"]').disabled,true);
  input(form.host,'Table delimiter','\t','change');input(form.host,'Table data','Expression\tID\nnew\tx\nagain\tx');
  input(form.host,'Map pattern column','Expression','change');input(form.host,'Map id column','ID','change');await click(form.host,'Review import');
  assert.match(form.host.querySelector('[role="alert"]').textContent,/Row 3, cell 2/);
  await inspectorRemount(form,view);
  assert.equal(form.host.querySelector('[aria-label="Table data"]').value,'Expression\tID\nnew\tx\nagain\tx');
  input(form.host,'Table data','Expression\tID\nnew\tx\nagain\ty');await click(form.host,'Review import');await click(form.host,'Confirm import');
  assert.equal(calls,0);assert.deepEqual(f.root.nodes.node.rules,[{id:'saved',pattern:'old'}]);
  await click(form.host,'Import Rules table');input(form.host,'Import action','add','change');input(form.host,'Table data','Expression\tID\nthird\tz');await click(form.host,'Review import');await click(form.host,'Confirm import');
  await click(form.host,'Save Rules');assert.equal(calls,1);assert.deepEqual(f.root.nodes.node.rules,[{id:'x',pattern:'new'},{id:'y',pattern:'again'},{id:'z',pattern:'third'}]);
 }finally{await form.close();}
});
test('actual Extract Create cannot bypass an open invalid import through Advanced JSON and repairs through ordinary creation once',async()=>{
 const f=controller(),before=structuredClone(f.root),{form,pending}=await createPanel(f,'extract');
 try{
  await click(form.host,'Import Literal patterns table');input(form.host,'Table data','Literal,ID\none,same\ntwo,same');input(form.host,'Map literal column','Literal','change');input(form.host,'Map id column','ID','change');await click(form.host,'Review import');
  await click(form.host,'Configuration format');await click(form.host,'Create node');assert.equal(f.preparations(),0);
  await click(form.host,'Configuration format');assert.equal(form.host.querySelector('[aria-label="Table data"]').value,'Literal,ID\none,same\ntwo,same');
  input(form.host,'Table data','Literal,ID\none,one\ntwo,two');await click(form.host,'Review import');await click(form.host,'Confirm import');assert.equal(f.preparations(),0);
  await click(form.host,'Create node');const prepared=await pending;assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.equal(f.environment.commitNodeCreation(f.token,prepared).ok,true);assert.equal(f.commits(),1);oneUndo(f,before);
 }finally{await form.close();}
});


test('invalid current entry blocks import instead of replacing it with saved rows',async()=>{
 const f=editing('pattern'),form=await panel('NodeDetails',detail(f.root),{editControl:f.editControl});
 try{await click(form.host,'Edit Rules as JSON');input(form.host,'Rules','[{"unfinished":');
  const button=[...form.host.querySelectorAll('button')].find(b=>b.textContent==='Import Rules table');assert.ok(button);assert.equal(button.disabled,true);button.click();flushSync();assert.equal(form.host.querySelector('[aria-label="Table import"]'),null);
 }finally{await form.close();}
});
test('pristine import metadata never freezes authoritative rows on revision and pending Save disables import edits',async()=>{
 const f=editing('pattern');f.root.nodes.node.rules=[{id:'saved',pattern:'old'}];f.refresh();let resolve,submitted;
 const view=detail(f.root),form=await panel('NodeDetails',view,{editControl:(_selection,_key,value)=>{submitted=value;return new Promise(done=>resolve=done);}});
 try{
  await click(form.host,'Import Rules table');input(form.host,'Table data','Expression,ID\nadded,added');input(form.host,'Map pattern column','Expression','change');input(form.host,'Map id column','ID','change');input(form.host,'Import action','add','change');await click(form.host,'Cancel import');
  f.root.nodes.node.rules=[{id:'authoritative',pattern:'new revision'}];form.mounted.update(detail(f.root,'node','r2'));flushSync();await tick();flushSync();
  await click(form.host,'Import Rules table');await click(form.host,'Review import');await click(form.host,'Confirm import');await click(form.host,'Save Rules');
  assert.equal([...form.host.querySelectorAll('button')].find(b=>b.textContent==='Import Rules table').disabled,true);
  resolve({ok:false,error:{code:'REJECTED',message:'Retain draft'}});await tick();flushSync();
  await click(form.host,'Import Rules table');await click(form.host,'Cancel import');
  assert.deepEqual(submitted,[{id:'authoritative',pattern:'new revision'},{id:'added',pattern:'added'}]);
  assert.deepEqual(f.root.nodes.node.rules,[{id:'authoritative',pattern:'new revision'}]);
 }finally{await form.close();}
});

test('actual shared Compose invalid JSON Save retains actionable diagnostic code across selection remount',async()=>{
 const f=editing('compose');let calls=0;const view=detail(f.root),form=await panel('NodeDetails',view,{editControl:()=>{calls++;return {ok:true};}});
 try{await click(form.host,'Edit Sections as JSON');input(form.host,'Sections','{"unfinished":');await click(form.host,'Save Sections');
  const diagnostic=()=>form.host.querySelector('.pc-diagnostic[data-severity="error"]');assert.match(diagnostic().textContent,/Enter valid JSON/);assert.equal(diagnostic().querySelector('code').textContent,'INVALID_CONTROL_JSON');
  await inspectorRemount(form,view);assert.match(diagnostic().textContent,/Enter valid JSON/);assert.equal(calls,0);assert.equal(form.host.querySelector('[aria-label="Sections"]').value,'{"unfinished":');
 }finally{await form.close();}
});


test('import Add rebases the actual unsaved term grammar across inspector remount without a saved fallback',async()=>{
 const f=editing('pattern');f.root.nodes.node.rules=[{id:'saved',pattern:'old'}];f.refresh();const view=detail(f.root),form=await panel('NodeDetails',view,{editControl:f.editControl});
 try{await click(form.host,'Use Rules terms');input(form.host,'Rules','local');input(form.host,'Rules input format','plain','change');await click(form.host,'Import Rules table');input(form.host,'Table data','Expression\nadded');input(form.host,'Map pattern column','Expression','change');input(form.host,'Import action','add','change');await inspectorRemount(form,view);await click(form.host,'Review import');
  const confirm=[...form.host.querySelectorAll('button')].find(b=>b.textContent==='Confirm import');assert.equal(confirm.disabled,false);await click(form.host,'Confirm import');await click(form.host,'Save Rules');
  assert.deepEqual(f.root.nodes.node.rules,[{id:'saved',pattern:'local'},{id:'pattern-1',pattern:'added'}]);
 }finally{await form.close();}
});


test('Configure Pattern can cancel a retained import over an invalid Advanced JSON base without losing either draft',async()=>{
 const f=controller(),before=structuredClone(f.root),{form,pending}=await createPanel(f,'pattern',{...settings('pattern'),mode:'literal'});
 const button=label=>[...form.host.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
 const source='Expression\tID\nnew\timport-id';
 try{
  await click(form.host,'Import Rules table');input(form.host,'Table delimiter','\t','change');input(form.host,'Import action','add','change');input(form.host,'Table data',source);
  input(form.host,'Map pattern column','Expression','change');input(form.host,'Map id column','ID','change');
  await click(form.host,'Configuration format');const controls=JSON.parse(form.host.querySelector('[aria-label="Node controls JSON"]').value);
  controls.rules=[{id:'x',pattern:''}];input(form.host,'Node controls JSON',JSON.stringify(controls));
  await click(form.host,'Configuration format');
  assert.match(form.host.textContent,/Repair the current Rules entry before importing/);
  assert.equal(form.host.querySelector('[aria-label="Table data"]').disabled,true);assert.equal(button('Review import').disabled,true);assert.equal(button('Confirm import').disabled,true);
  assert.equal(button('Create node').disabled,true);assert.equal(button('Cancel import').disabled,false,'Invalid ordinary base must leave the editable import escape action available');
  await click(form.host,'Cancel import');
  assert.equal(form.host.querySelector('[aria-label="Table import"]'),null);assert.equal(form.host.querySelector('[aria-label="Pattern 1 expression"]').value,'','Ordinary Rules editor returns with the exact invalid expression for repair');assert.equal(form.host.querySelector('[aria-label="Pattern 1 ID"]').value,'x');
  assert.equal(button('Import Rules table').disabled,true);
  await click(form.host,'Configuration format');const retained=JSON.parse(form.host.querySelector('[aria-label="Node controls JSON"]').value);
  assert.deepEqual(retained.rules,[{id:'x',pattern:''}]);assert.equal(retained.mode,'literal');
  retained.rules=[{id:'x',pattern:'repaired'}];input(form.host,'Node controls JSON',JSON.stringify(retained));await click(form.host,'Configuration format');
  await click(form.host,'Import Rules table');
  assert.equal(form.host.querySelector('[aria-label="Table data"]').value,source);assert.equal(form.host.querySelector('[aria-label="Table delimiter"]').value,'\t');
  assert.equal(form.host.querySelector('[aria-label="Import action"]').value,'add');assert.equal(form.host.querySelector('[aria-label="Map pattern column"]').value,'Expression');assert.equal(form.host.querySelector('[aria-label="Map id column"]').value,'ID');
  assert.equal(f.preparations(),0);assert.equal(f.commits(),0);assert.deepEqual(f.root,before);
  await click(form.host,'Cancel import');await click(form.host,'Cancel');await pending;
 }finally{await form.close();}
});

for (const operation of ['pattern', 'extract']) {
 const label=operation==='pattern'?'Rules':'Literal patterns', key=operation==='pattern'?'rules':'patterns';
 const record=(id,text)=>operation==='pattern'?{id,pattern:text}:{id,literal:text,label:''};
 test(operation+' restored editor subsequent JSON edit saves explicit identity through native Save',async()=>{
  const f=editing(operation,{[key]:[record('saved','old')]});
  const before=structuredClone(f.root),view=detail(f.root),form=await panel('NodeDetails',view,{editControl:f.editControl});
  try{
   await click(form.host,'Use '+label+' terms');input(form.host,label,'local');input(form.host,label+' input format','plain','change');
   await inspectorRemount(form,view);
   // Returned term entry explicitly chooses JSON; the old restored JSON editor already advertises it.
   if(form.host.querySelector('[aria-label="'+label+' input format"]'))input(form.host,label+' input format','json','change');
   input(form.host,label,JSON.stringify([record('new-rule','Mara')]));await click(form.host,'Save '+label);
   assert.deepEqual(f.root.nodes.node[key],[record('new-rule','Mara')]);assert.equal(f.commits(),1);oneUndo(f,before);
  }finally{await form.close();}
 });
 test(operation+' restored Plain subsequent edit saves commas and brackets as one native rule',async()=>{
  const f=editing(operation,{[key]:[record('saved','old')]}),before=structuredClone(f.root),view=detail(f.root),form=await panel('NodeDetails',view,{editControl:f.editControl});
  try{
   await click(form.host,'Use '+label+' terms');input(form.host,label,'local');input(form.host,label+' input format','plain','change');await inspectorRemount(form,view);
   assert.equal(form.host.querySelector('[aria-label="'+label+' input format"]').value,'plain');
   input(form.host,label,'[red, blue], Mara');await click(form.host,'Save '+label);
   assert.deepEqual(f.root.nodes.node[key],[record('saved','[red, blue], Mara')]);assert.equal(f.commits(),1);oneUndo(f,before);
  }finally{await form.close();}
 });
 test(operation+' restored Plain commas and brackets keeps term interpretation through rows and JSON edits',async()=>{
  const f=editing(operation,{[key]:[record('saved','old')]});
  const view=detail(f.root),form=await panel('NodeDetails',view,{editControl:f.editControl});
  try{
   await click(form.host,'Use '+label+' terms');input(form.host,label,'[red, blue]');input(form.host,label+' input format','plain','change');
   await inspectorRemount(form,view);
   assert.equal(form.host.querySelector('[aria-label="'+label+' input format"]')?.value,'plain');
   assert.equal(form.host.querySelector('[aria-label="'+label+'"]').value,'[red, blue]');
   input(form.host,label,'[red, blue], Mara');await click(form.host,'Use '+label+' rows');
   assert.equal(form.host.querySelector('[aria-label="Pattern 1 '+(operation==='pattern'?'expression':'phrase')+'"]').value,'[red, blue], Mara');
   await inspectorRemount(form,view);await click(form.host,'Edit '+label+' as JSON');
   input(form.host,label,JSON.stringify([record('explicit','Rowan')]));await click(form.host,'Save '+label);
   assert.deepEqual(f.root.nodes.node[key],[record('explicit','Rowan')]);
  }finally{await form.close();}
 });
 test(operation+' restored editor blocks unfinished JSON and retains exact source on return to terms',async()=>{
  const f=editing(operation,{[key]:[record('saved','old')]});const view=detail(f.root),before=structuredClone(f.root),form=await panel('NodeDetails',view,{editControl:f.editControl});
  const unfinished='[{"id":"new-rule",';
  try{
   await click(form.host,'Use '+label+' terms');input(form.host,label,'local');input(form.host,label+' input format','plain','change');await inspectorRemount(form,view);
   if(form.host.querySelector('[aria-label="'+label+' input format"]'))input(form.host,label+' input format','json','change');
   input(form.host,label,unfinished);await click(form.host,'Save '+label);
   assert.deepEqual(f.root,before);assert.equal(f.commits(),0);assert.match(form.host.textContent,/Enter valid JSON/);
   await inspectorRemount(form,view);assert.equal(form.host.querySelector('[aria-label="'+label+'"]').value,unfinished);
   await click(form.host,'Use '+label+' rows');assert.equal(form.host.querySelector('[aria-label="'+label+' input format"]').value,'json');
   assert.equal(form.host.querySelector('[aria-label="'+label+'"]').value,unfinished);
  }finally{await form.close();}
 });
 test(operation+' Configure remount preserves Plain and CSV then creates explicit JSON identity once',async()=>{
  const f=controller(),before=structuredClone(f.root),{form,pending}=await createPanel(f,operation);
  try{
   await click(form.host,'Use '+label+' terms');input(form.host,label,'[red, blue]');input(form.host,label+' input format','plain','change');
   await click(form.host,'Configuration format');await click(form.host,'Configuration format');
   assert.equal(form.host.querySelector('[aria-label="'+label+' input format"]')?.value,'plain');
   assert.equal(form.host.querySelector('[aria-label="'+label+'"]').value,'[red, blue]');
   input(form.host,label+' input format','csv','change');input(form.host,label,'"red, blue",green');
   await click(form.host,'Configuration format');await click(form.host,'Configuration format');
   assert.equal(form.host.querySelector('[aria-label="'+label+' input format"]').value,'csv');
   assert.equal(form.host.querySelector('[aria-label="'+label+'"]').value,'"red, blue",green');
   await click(form.host,'Use '+label+' rows');await click(form.host,'Edit '+label+' as JSON');
   input(form.host,label,'[{"unfinished":');await click(form.host,'Create node');assert.equal(f.preparations(),0);assert.deepEqual(f.root,before);
   input(form.host,label,JSON.stringify([record('created-id','Mara')]));await click(form.host,'Create node');
   const prepared=await pending;assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.equal(f.environment.commitNodeCreation(f.token,prepared).ok,true);
   const node=Object.values(f.root.nodes)[0];assert.deepEqual(node[key],[record('created-id','Mara')]);assert.equal(f.commits(),1);assert.equal(node.phase,'post');oneUndo(f,before);
  }finally{await form.close();}
 });
}
