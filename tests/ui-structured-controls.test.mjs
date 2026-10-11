import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);

async function compiled(name, directory, source) {
    const output = compile(source, { filename: name + '.svelte', generate: 'client', css: 'injected' });
    assert.deepEqual(output.warnings.filter(warning => warning.code.startsWith('a11y')), []);
    const code = output.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
    const resolvedCode = code.replace(/from\s+(['"])(\.\.[^'"]+)\1/g, (_, quote, specifier) => 'from ' + JSON.stringify(new URL(specifier, new URL('../ui/', import.meta.url)).href));
    const path = join(directory, name + '.mjs'); await writeFile(path, resolvedCode);
    return { path, component: (await import(pathToFileURL(path).href)).default };
}
async function fixture(kind, initial, check, extra = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-structured-controls-'));
    const host = document.createElement('div'); host.style.width = '220px'; document.body.append(host);
    let mounted;
    try {
        const source = await readFile(new URL('../ui/StructuredControl.svelte', import.meta.url), 'utf8');
        const leaf = await compiled('StructuredControl', directory, source);
        const harness = await compiled('StructuredHarness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, control, initialDisabled, initialError } = $props(); let text = $state(initial); let disabled = $state(initialDisabled); let changes = $state([]); let typed = $state(); export function read() { return { text, typed, changes: [...changes] }; } export function update(next) { text = next; } export function disable(next) { disabled = next; } function ontext(next) { typed = undefined; text = next; changes = [...changes, next]; } function onDraft(value) { typed = value; }</script><Leaf {control} {text} {disabled} {ontext} draftValue={typed} onDraft={control.typedMode ? onDraft : undefined} idPrefix="structured-test" error={initialError} />`);
        const control = { key: kind, label: extra.label ?? kind, value: null, editor: 'json', representation: 'json-value', structured: kind, ...extra.control };
        mounted = mount(harness.component, { target: host, props: { initial, control, initialDisabled: extra.disabled ?? false, initialError: extra.error } }); flushSync(); await tick();
        await check({ host, read: () => mounted.read(), update(next) { mounted.update(next); flushSync(); }, disable(next) { mounted.disable(next); flushSync(); } });
    } finally {
        if (mounted) await unmount(mounted); host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory)); assert.ok(scope && scope.startsWith('lattice-structured-controls-') && !scope.startsWith('..') && !isAbsolute(scope)); await rm(directory, { recursive: true, force: true });
    }
}
function input(host, label, value, type = 'input') {
    const element = host.querySelector(`[aria-label="${label}"]`); assert.ok(element, `Missing ${label}`);
    if (element.type === 'checkbox') element.checked = value; else element.value = value;
    element.dispatchEvent(new dom.window.Event(type, { bubbles: true })); flushSync();
    return element;
}
function click(host, label) {
    const element = host.querySelector(`button[aria-label="${label}"]`); assert.ok(element, `Missing ${label}`); element.click(); flushSync(); return element;
}

test('rules rows retain supported flags and update the shared JSON draft in order', async () => {
    await fixture('rules', '[{"kind":"literal","pattern":"old","flags":"iu"},{"kind":"regex","pattern":"x+","replacement":"y","flags":"ms"}]', async f => {
        input(f.host, 'Rule 1 pattern', 'new');
        assert.deepEqual(JSON.parse(f.read().text), [{ kind: 'literal', pattern: 'new', flags: 'iu' }, { kind: 'regex', pattern: 'x+', replacement: 'y', flags: 'ms' }]);
        assert.equal(Object.hasOwn(JSON.parse(f.read().text)[0], 'replacement'), false);
        click(f.host, 'Move rule 2 up');
        assert.equal(JSON.parse(f.read().text)[0].kind, 'regex');
        click(f.host, 'Add rule'); assert.equal(JSON.parse(f.read().text).length, 3);
        click(f.host, 'Remove rule 3'); assert.equal(JSON.parse(f.read().text).length, 2);
    });
});

test('field rows keep typed paths and explicit defaults without filling absent options', async () => {
    await fixture('fields', '[{"name":"title","path":["items",0,"title"]},{"name":"optional","path":[],"required":false,"default":null}]', async f => {
        input(f.host, 'Field 1 path (JSON array)', '["items",2,"title"]', 'change');
        assert.deepEqual(JSON.parse(f.read().text), [{ name: 'title', path: ['items', 2, 'title'] }, { name: 'optional', path: [], required: false, default: null }]);
        input(f.host, 'Field 1 required', false, 'change');
        input(f.host, 'Field 1 use default', true, 'change');
        input(f.host, 'Field 1 default (JSON)', 'false', 'change');
        assert.deepEqual(JSON.parse(f.read().text)[0], { name: 'title', path: ['items', 2, 'title'], required: false, default: false });
        input(f.host, 'Field 2 use default', false, 'change');
        assert.equal(Object.hasOwn(JSON.parse(f.read().text)[1], 'default'), false);
        click(f.host, 'Add field'); assert.equal(JSON.parse(f.read().text).length, 3);
        click(f.host, 'Remove field 3'); assert.equal(JSON.parse(f.read().text).length, 2);
    });
});

test('section rows edit fallback text and support ordered additions and removals', async () => {
    await fixture('sections', '[{"name":"Intro","text":"first"},{"name":"Body","text":"second"}]', async f => {
        input(f.host, 'Section 2 text', 'revised\nbody');
        click(f.host, 'Move section 2 up');
        assert.deepEqual(JSON.parse(f.read().text), [{ name: 'Body', text: 'revised\nbody' }, { name: 'Intro', text: 'first' }]);
        click(f.host, 'Add section');
        const sections = JSON.parse(f.read().text); assert.equal(sections.length, 3); assert.equal(typeof sections[2].name, 'string'); assert.equal(sections[2].text, '');
        click(f.host, 'Remove section 3'); assert.equal(JSON.parse(f.read().text).length, 2);
    });
});

test('context slots retain stable IDs while ordered rows obey the two-slot minimum', async () => {
    await fixture('slots', '[{"id":"context-1","label":"First"},{"id":"context-2","label":"Second"}]', async f => {
        input(f.host, 'Slot 1 label', 'Renamed');
        assert.deepEqual(JSON.parse(f.read().text), [{ id: 'context-1', label: 'Renamed' }, { id: 'context-2', label: 'Second' }]);
        assert.equal(f.host.querySelector('[aria-label="Remove slot 1"]').disabled, true);
        click(f.host, 'Add slot'); assert.equal(JSON.parse(f.read().text).length, 3);
        const ids = JSON.parse(f.read().text).map(slot => slot.id); assert.equal(new Set(ids).size, 3);
        click(f.host, 'Move slot 3 up'); assert.equal(JSON.parse(f.read().text)[1].id, ids[2]);
        click(f.host, 'Remove slot 2'); assert.equal(JSON.parse(f.read().text).length, 2);
        click(f.host, 'Remove slot 1'); assert.equal(JSON.parse(f.read().text).length, 2);
    });
});

test('named state values stay numbers and preserve names including own prototype-like keys', async () => {
    await fixture('numeric-map', '{"trust":0.25,"__proto__":0.5}', async f => {
        input(f.host, 'Value 1 number', '0.75', 'change');
        assert.deepEqual(JSON.parse(f.read().text), { trust: 0.75, ['__proto__']: 0.5 });
        input(f.host, 'Value 1 name', 'patience', 'change');
        assert.deepEqual(JSON.parse(f.read().text), { patience: 0.75, ['__proto__']: 0.5 });
        click(f.host, 'Add value'); assert.equal(Object.keys(JSON.parse(f.read().text)).length, 3);
        click(f.host, 'Remove value 3'); assert.deepEqual(JSON.parse(f.read().text), { patience: 0.75, ['__proto__']: 0.5 });
    });
});

test('phase durations preserve omitted phases and edit only positive integer durations', async () => {
    await fixture('durations', '{"onset":2,"aftermath":4}', async f => {
        input(f.host, 'Duration 1 steps', '3', 'change');
        assert.deepEqual(JSON.parse(f.read().text), { onset: 3, aftermath: 4 });
        input(f.host, 'Duration 1 steps', '1.5', 'change');
        assert.deepEqual(JSON.parse(f.read().text), { onset: 3, aftermath: 4 });
        click(f.host, 'Add duration'); assert.deepEqual(JSON.parse(f.read().text), { onset: 3, aftermath: 4, peak: 1 });
        click(f.host, 'Remove duration 3'); assert.deepEqual(JSON.parse(f.read().text), { onset: 3, aftermath: 4 });
    });
});

test('invalid raw drafts remain exact and row/raw switching edits one parent value', async () => {
    const initial = '  [{"kind":"literal",\n';
    await fixture('rules', initial, async f => {
        const raw = f.host.querySelector('textarea[aria-label="rules"]'); assert.ok(raw, 'Invalid rules need an editable raw JSON draft');
        assert.equal(raw.value, initial); assert.deepEqual(f.read().changes, []);
        const repaired = '[{"kind":"regex","pattern":"a+","flags":"im"}]';
        input(f.host, 'rules', repaired); assert.equal(f.read().text, repaired);
        click(f.host, 'Edit rules as rows');
        input(f.host, 'Rule 1 pattern', 'b+');
        click(f.host, 'Edit rules as JSON');
        assert.deepEqual(JSON.parse(f.host.querySelector('textarea[aria-label="rules"]').value), [{ kind: 'regex', pattern: 'b+', flags: 'im' }]);
        input(f.host, 'rules', '[{"kind":"literal","pattern":"parent"}]');
        click(f.host, 'Edit rules as rows'); assert.equal(f.host.querySelector('[aria-label="Rule 1 pattern"]').value, 'parent');
    });
});

test('unknown keys and options fall back to raw without silently removing them', async () => {
    for (const [kind, initial] of [
        ['rules', '[{"kind":"regex","pattern":"x","flags":"g"}]'],
        ['rules', '[{"kind":"literal","pattern":"x","caseSensitive":true}]'],
        ['fields', '[{"name":"x","path":[],"extra":{"keep":true}}]'],
        ['sections', '[{"name":"Intro","text":"fallback","path":["x"],"template":"{{x}}"}]'],
        ['slots', '[{"id":"a","label":"A","extra":true},{"id":"b","label":"B"}]'],
        ['durations', '{"onset":1,"futurePhase":2}'],
    ]) await fixture(kind, initial, async f => {
        const raw = f.host.querySelector(`textarea[aria-label="${kind}"]`); assert.ok(raw, `Unsupported ${kind} shape needs raw editing`);
        assert.equal(raw.value, initial); assert.equal(f.read().text, initial); assert.deepEqual(f.read().changes, []);
        const changed = initial + ' '; input(f.host, kind, changed); assert.equal(f.read().text, changed);
    });
});

test('invalid JSON entered in a field default survives in the shared raw draft', async () => {
    await fixture('fields', '[{"name":"x","path":[],"default":null}]', async f => {
        input(f.host, 'Field 1 default (JSON)', '{"nested":', 'change');
        const raw = f.host.querySelector('textarea[aria-label="fields"]'); assert.ok(raw, 'Invalid nested JSON should switch to its shared raw draft');
        assert.equal(raw.value, f.read().text); assert.match(raw.value, /"default": \{"nested":/);
        assert.throws(() => JSON.parse(f.read().text));
        input(f.host, 'fields', '[{"name":"x","path":[],"default":{"nested":false}}]');
        click(f.host, 'Edit fields as rows');
        input(f.host, 'Field 1 path (JSON array)', '["nested",', 'change');
        assert.equal(f.host.querySelector('textarea[aria-label="fields"]').value, f.read().text);
        assert.match(f.read().text, /"path": \["nested",/);
    });
});

test('disabled row and raw editors cannot change the parent draft even through forced events', async () => {
    for (const [kind, initial, label, value] of [
        ['rules', '[{"kind":"literal","pattern":"before"}]', 'Rule 1 pattern', 'after'],
        ['fields', '[{"name":"x","path":[],"required":false,"default":null}]', 'Field 1 use default', false],
        ['sections', '[{"name":"Intro","text":"before"}]', 'Section 1 text', 'after'],
        ['slots', '[{"id":"a","label":"A"},{"id":"b","label":"B"}]', 'Slot 1 ID', 'after'],
        ['numeric-map', '{"trust":0.5}', 'Value 1 number', '0.8'],
        ['durations', '{"onset":2}', 'Duration 1 steps', '4'],
    ]) await fixture(kind, initial, async f => {
        f.disable(true);
        for (const editor of f.host.querySelectorAll('input,select,textarea,button')) assert.equal(editor.disabled, true, `${kind} editor must disable native controls`);
        input(f.host, label, value, label.includes('use default') || kind === 'numeric-map' || kind === 'durations' ? 'change' : 'input');
        for (const button of f.host.querySelectorAll('button')) button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        flushSync(); assert.equal(f.read().text, initial); assert.deepEqual(f.read().changes, []);
    });
    await fixture('rules', 'invalid raw text', async f => {
        input(f.host, 'rules', '[{"kind":"literal","pattern":"after"}]');
        assert.equal(f.read().text, 'invalid raw text'); assert.deepEqual(f.read().changes, []);
    }, { disabled: true });
});

test('a nonfinite default stays raw instead of being rewritten as null by another field edit', async () => {
    const initial = '[{"name":"x","path":[],"default":{"overflow":1e400}}]';
    await fixture('fields', initial, async f => {
        const raw = f.host.querySelector('textarea[aria-label="fields"]'); assert.ok(raw, 'A default that cannot round-trip as JSON must stay raw');
        assert.equal(raw.value, initial); assert.deepEqual(f.read().changes, []);
    });
});


test('raw JSON exposes the parent validation error through accessible attributes', async () => {
    await fixture('rules', '[', async f => {
        const raw = f.host.querySelector('textarea[aria-label="rules"]');
        assert.equal(raw.getAttribute('aria-invalid'), 'true');
        assert.equal(raw.getAttribute('aria-describedby'), 'structured-test-error');
        input(f.host, 'rules', '[{"kind":"literal","pattern":"fixed"}]');
        assert.equal(f.read().changes.length, 1);
    }, { error: 'Invalid rules JSON' });
});

test('rejected numeric edits restore the displayed value from the shared draft', async () => {
    for (const [kind, initial, label, invalid, expected] of [
        ['durations', '{"onset":3}', 'Duration 1 steps', '1.5', '3'],
        ['numeric-map', '{"trust":0.5}', 'Value 1 number', '', '0.5'],
    ]) await fixture(kind, initial, async f => {
        const editor = input(f.host, label, invalid, 'change');
        assert.equal(editor.value, expected); assert.equal(f.read().text, initial); assert.deepEqual(f.read().changes, []);
    });
});

test('typed row draft updates avoid serializing and reparsing the whole structured value', async () => {
    await fixture('sections', '[{"name":"Intro","text":"first"},{"name":"Body","text":"second"}]', async f => {
        const originalParse = JSON.parse, originalStringify = JSON.stringify;
        let parses = 0, encodes = 0;
        JSON.parse = function(...args) { parses++; return originalParse.apply(this, args); };
        JSON.stringify = function(...args) { encodes++; return originalStringify.apply(this, args); };
        try {
            input(f.host, 'Section 2 text', 'changed');
            input(f.host, 'Section 2 text', 'changed twice');
            assert.equal(parses, 0, 'typed row inputs never parse the parent JSON');
            assert.equal(encodes, 0, 'typed row inputs never serialize the parent JSON');
        } finally { JSON.parse = originalParse; JSON.stringify = originalStringify; }
        assert.deepEqual(f.read().typed, [{ name: 'Intro', text: 'first' }, { name: 'Body', text: 'changed twice' }]);
        click(f.host, 'Edit sections as JSON');
        assert.deepEqual(JSON.parse(f.host.querySelector('[aria-label="sections"]').value), f.read().typed);
    }, { control: { typedMode: true } });
});

test('section rows expose Guidance, required and skipped policy through raw and typed drafts', async () => {
    const initial = '[{"name":"Guide","text":"fallback","kind":"guidance","required":false,"onSkipped":"omit"},{"name":"Text","text":"literal"}]';
    for (const typedMode of [false, true]) await fixture('sections', initial, async f => {
        const originalParse = JSON.parse, originalStringify = JSON.stringify;
        let parses = 0, encodes = 0;
        if (typedMode) {
            JSON.parse = function(...args) { parses++; return originalParse.apply(this, args); };
            JSON.stringify = function(...args) { encodes++; return originalStringify.apply(this, args); };
        }
        try {
            input(f.host, 'Section 1 kind', 'text', 'change');
            input(f.host, 'Section 1 required', true, 'change');
            input(f.host, 'Section 1 skipped source', 'fallback', 'change');
            click(f.host, 'Move section 1 down');
            if (typedMode) {
                assert.equal(parses, 0, 'System section inputs never parse the parent JSON');
                assert.equal(encodes, 0, 'System section inputs never serialize the parent JSON');
            }
        } finally { JSON.parse = originalParse; JSON.stringify = originalStringify; }
        const result = typedMode ? f.read().typed : JSON.parse(f.read().text);
        assert.deepEqual(result, [{ name: 'Text', text: 'literal' }, { name: 'Guide', text: 'fallback', kind: 'text', required: true, onSkipped: 'fallback' }]);
        if (typedMode) {
            click(f.host, 'Edit sections as JSON');
            assert.deepEqual(JSON.parse(f.host.querySelector('[aria-label="sections"]').value), result);
        }
    }, { control: { typedMode } });
});


test('Pattern and Extract expression rows keep exact text, IDs and optional labels', async () => {
    for (const [kind, field, extra] of [['patterns','pattern',{}],['extract','literal',{label:''}]]) await fixture(kind, JSON.stringify([{id:'pattern-1',[field]:'a{1,3}',label:'Keep'},{id:'pattern-3',[field]:'b',...extra}]), async f => {
        input(f.host, 'Pattern 1 ' + (field === 'pattern' ? 'expression' : 'phrase'), 'edited{1,4}');
        click(f.host, 'Move pattern 2 up');
        const rows = JSON.parse(f.read().text); assert.equal(rows[0].id,'pattern-3'); assert.equal(rows[1].id,'pattern-1'); assert.equal(rows[1][field],'edited{1,4}'); assert.equal(rows[1].label,'Keep');
        click(f.host, 'Add pattern'); assert.equal(JSON.parse(f.read().text)[2].id,'pattern-2');
    });
});

test('Join slots use their own minimum and preserve required flags on label edits', async () => {
    await fixture('slots','[{"id":"one","label":"One","required":false}]',async f=>{
        input(f.host,'Slot 1 label','Changed'); assert.deepEqual(JSON.parse(f.read().text),[{id:'one',label:'Changed',required:false}]);
        assert.equal(f.host.querySelector('[aria-label="Remove slot 1"]').disabled,true);
        click(f.host,'Add slot'); assert.equal(JSON.parse(f.read().text)[1].required,true);
        click(f.host,'Remove slot 1'); assert.equal(JSON.parse(f.read().text).length,1);
    },{control:{inputSpec:{id:'join.inputs',version:1,editor:'rows',formats:['auto','json','rows'],storage:'json-value',limits:{maxItems:16}}}});
});


async function leafFixture(name, props, check) {
    const directory=await mkdtemp(join(tmpdir(),'lattice-structured-controls-')),host=document.createElement('div');document.body.append(host);let mounted;
    try {
        const leaf=await compiled(name,directory,await readFile(new URL('../ui/'+name+'.svelte',import.meta.url),'utf8'));
        const changes=[];mounted=mount(leaf.component,{target:host,props:{...props,ontext:value=>changes.push(value),onDraft:value=>changes.push(value),onformat:()=>{}}});flushSync();
        await check(host,changes);
    } finally {if(mounted)await unmount(mounted);host.remove();await rm(directory,{recursive:true,force:true});}
}
test('terms show parsed entries before Save and explain nonrepresentable Plain text exports',async()=>{
    const {projectNodeControls}=await import('../src/ui/node-control-projection.js');
    const control=projectNodeControls('pattern',{},{}).find(row=>row.key==='protectedLiterals');
    const source='001,"red, blue","say ""hello"""';
    await leafFixture('TermListControl',{control,text:source,format:'auto',idPrefix:'terms'},async(host,changes)=>{
        assert.match(host.querySelector('[data-control-items]').textContent,/3 entries/);assert.match(host.textContent,/001/);assert.match(host.textContent,/red, blue/);
        click(host,'Export '+control.label+' as Plain text');assert.match(host.textContent,/one entry/);assert.equal(changes.length,0);
        click(host,'Export '+control.label+' as Advanced JSON');assert.deepEqual(JSON.parse(changes[0]),['001','red, blue','say "hello"']);
    });
});
test('hotkeys expose physical keys and preserve exact modifier states without accepting unknown advanced shape',async()=>{
    const {projectNodeControls}=await import('../src/ui/node-control-projection.js');const control=projectNodeControls('hotkey-arm',{},{}).find(row=>row.key==='hotkey');
    const value={code:'KeyM',ctrl:true,alt:false,shift:false,meta:false};
    await leafFixture('HotkeyControl',{control,text:JSON.stringify(value),idPrefix:'hotkey'},async(host,changes)=>{
        assert.equal(host.querySelector('[aria-label="Physical key"]').value,'KeyM');input(host,'Alt',true,'change');assert.deepEqual(changes[0],{...value,alt:true});
    });
    await leafFixture('HotkeyControl',{control,text:JSON.stringify({...value,extra:true}),idPrefix:'hotkey'},async(host,changes)=>{assert.ok(host.querySelector('textarea'));assert.match(host.textContent,/Advanced JSON/);assert.equal(changes.length,0);});
});
