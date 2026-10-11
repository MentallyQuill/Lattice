import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);
const initialView = (namespace = 'document-one', contract = 'json-contract') => ({ documentNamespace: namespace, editorContractKey: contract, selectionKey: 'same-node', revision: 'one', address: { workflowId: 'same-id', instancePath: [], nodeId: 'node' }, title: 'Node', canonicalTitle: 'Node', iconPath: '', family: 'Shaping', phase: 'pre', alias: '', compact: false, enabled: true, readOnly: false, canPresent: true, controls: [{ key: 'data', label: 'Data', editor: 'json', representation: 'json-value', value: [] }], model: null, ports: [] });
async function fixture(check) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-details-drafts-')), files = new Map();
    let mounted; const host = document.createElement('div'); document.body.append(host);
    async function component(url) {
        if (files.has(url.href)) return files.get(url.href);
        const path = join(directory, 'component-' + files.size + '.mjs'); files.set(url.href, path);
        const result = compile(await readFile(url, 'utf8'), { filename: url.pathname, generate: 'client', css: 'injected' });
        let code = result.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
        const imports = [...code.matchAll(/from\s+(['"])([^'"]+)\1/g)];
        for (const item of imports) {
            const specifier = item[2]; let target;
            if (specifier.endsWith('.svelte')) target = pathToFileURL(await component(new URL(specifier, url))).href;
            else if (specifier.startsWith('.')) target = new URL(specifier, url).href;
            else target = specifier === 'svelte' ? clientURL : import.meta.resolve(specifier);
            code = code.replace(item[0], 'from ' + JSON.stringify(target));
        }
        await writeFile(path, code); return path;
    }
    try {
        const path = await component(new URL('../ui/NodeDetails.svelte', import.meta.url));
        const harness = compile(`<script>import Leaf from ${JSON.stringify(pathToFileURL(path).href)}; let { initial, actions } = $props(); let view = $state(initial); export function update(next) { view = next; }</script><Leaf {view} {actions} />`, { filename: 'DraftHarness.svelte', generate: 'client' });
        let code = harness.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
        const harnessPath = join(directory, 'harness.mjs'); await writeFile(harnessPath, code);
        let resolveEdit, submitted; const actions = { editControl: (_selection, _key, value) => { submitted = value; return new Promise(resolve => { resolveEdit = resolve; }); } };
        mounted = mount((await import(pathToFileURL(harnessPath).href)).default, { target: host, props: { initial: initialView(), actions } }); flushSync(); await tick();
        const update = async view => { mounted.update(view); flushSync(); await tick(); };
        const input = value => { const element = host.querySelector('[aria-label="Data"]'); assert.ok(element); element.value = value; element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync(); };
        await check({ host, update, submitted: () => submitted, input, text: () => host.querySelector('[aria-label="Data"]').value, save() { host.querySelector('[data-save-control="data"]').click(); flushSync(); }, async accept() { resolveEdit({ ok: true }); await tick(); flushSync(); } });
    } finally {
        if (mounted) await unmount(mounted); host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory)); assert.ok(scope && scope.startsWith('lattice-details-drafts-') && !scope.startsWith('..') && !isAbsolute(scope)); await rm(directory, { recursive: true, force: true });
    }
}
test('draft ownership distinguishes same-ID documents and restores retained namespaces', async () => fixture(async f => {
    f.input('{unfinished');
    await f.update(initialView('document-two')); assert.equal(f.text(), '[]');
    await f.update(initialView()); assert.equal(f.text(), '{unfinished');
    await f.update(null); await f.update(initialView()); assert.equal(f.text(), '{unfinished');
}));
test('incompatible editor contracts permanently discard old drafts', async () => fixture(async f => {
    f.input('{obsolete');
    await f.update(initialView('document-one', 'incompatible-contract')); assert.equal(f.text(), '[]');
    await f.update(initialView()); assert.equal(f.text(), '[]');
}));
test('old acknowledgments cannot clear a restored draft after navigation', async () => fixture(async f => {
    f.input('[1]'); f.save();
    await f.update(initialView('document-two')); await f.update(initialView());
    await f.accept(); assert.equal(f.text(), '[1]');
}));
test('own successful acknowledgment clears only submitted generation after revision publication', async () => fixture(async f => {
    f.input('[1]'); f.save();
    await f.update({ ...initialView(), revision: 'two', controls: [{ ...initialView().controls[0], value: [2] }] });
    await f.accept(); assert.equal(f.text(), '[\n  2\n]');
}));
test('new local generation survives earlier successful acknowledgment', async () => fixture(async f => {
    f.input('[1]'); f.save(); f.input('{newer'); await f.accept(); assert.equal(f.text(), '{newer');
}));

test('typed structured Save submits detached plain data through the existing action payload', async () => fixture(async f => {
    const view = initialView();
    view.controls = [{ key: 'data', label: 'Data', editor: 'json', representation: 'json-value', structured: 'sections', value: [] }];
    await f.update({ ...view, editorContractKey: 'structured-sections' });
    f.host.querySelector('[aria-label="Add section"]').click(); flushSync();
    const text = f.host.querySelector('[aria-label="Section 1 text"]'); text.value = 'Typed'; text.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync();
    f.save();
    assert.deepEqual(structuredClone(f.submitted()), [{ name: 'section1', text: 'Typed' }]);
    await f.accept();
}));

test('spec versions and mode grammars invalidate incompatible inspector drafts', async () => fixture(async f => {
    const view=initialView();delete view.editorContractKey;
    const control={...view.controls[0],inputSpec:{id:'condition.value',version:1,editor:'value',formats:['auto','json','rows'],storage:'json-value',limits:{maxBytes:262144}}};
    const next={...view,controls:[control]};await f.update(next);f.input('{unfinished');
    await f.update({...next,controls:[{...control,inputSpec:{...control.inputSpec,version:2}}]});assert.equal(f.text(),'[]');
    await f.update(next);assert.equal(f.text(),'[]');f.input('{unfinished mode');
    await f.update({...next,controls:[{...control,inputSpec:{...control.inputSpec,id:'pattern.rules:regex'}}]});assert.equal(f.text(),'[]');
    await f.update(next);assert.equal(f.text(),'[]');
}));
