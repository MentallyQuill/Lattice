import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const { mount, unmount, flushSync, tick } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
const directory = await mkdtemp(join(tmpdir(), 'lattice-document-components-'));
after(async () => {
    const target = resolve(directory), rel = relative(resolve(tmpdir()), target);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(target, { recursive: true, force: true });
});
const settle = async () => { flushSync(); await tick(); flushSync(); };
const click = async element => { assert.ok(element, 'the command is visible'); element.click(); await settle(); };
const key = async (element, value, options = {}) => { element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options })); await settle(); };
const state = document => ({ graphId: 'root', armed: false, inspectorOpen: false, history: { undo: false, redo: false, undoTitle: '', redoTitle: '', note: '', showNote: false }, camera: { x: 0, y: 0, zoom: 1, mode: 'select' }, selectionCount: 0, document });
let sequence = 0;
async function fixture(name, initial, actions = {}, local = () => {}, valueProp = 'state', extraProps = {}) {
    const leaf = await compiled(name, directory);
    const source = `<script>import Component from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions, local, extraProps } = $props(); let state = $state.raw(initial); export function update(next) { state = next; }</script><Component ${valueProp}={state} {actions} {local} {...extraProps} />`;
    const harness = await compiled('DocumentHarness' + ++sequence, directory, source);
    const host = document.createElement('div'); document.body.append(host);
    const mounted = mount(harness.component, { target: host, props: { initial, actions, local, extraProps } }); await settle();
    const menu = name => host.querySelector(`[role="menu"][aria-label="${name}"]`);
    const item = (label, name = 'File') => [...(menu(name)?.querySelectorAll('[role="menuitem"]') ?? [])].find(element => element.querySelector('span')?.textContent === label || element.textContent.trim() === label);
    return { host, mounted, menu, item, async open(name = 'File') { if (!menu(name)) await click(host.querySelector(`[data-menu="${name}"]`)); }, async update(next) { mounted.update(next); await settle(); }, async close() { await unmount(mounted); host.remove(); } };
}

test('native File commands own document creation opening and saving', async () => {
    const commands = [], localCommands = [];
    const f = await fixture('WorkspaceMenus', state({ name: 'draft.json', dirty: true, busy: false, native: true, recents: [], recovery: [] }), { command: command => commands.push(command) }, command => localCommands.push(command));
    try {
        for (const [label, command] of [['New workflow', 'new'], ['Open workflow…', 'open-workflow'], ['Save workflow', 'save'], ['Save As…', 'save-as'], ['Import into graph…', 'import-into-graph'], ['Export workflow JSON…', 'export']]) {
            await f.open(); await click(f.item(label)); assert.equal(commands.at(-1), command); assert.equal(f.menu('File'), null);
        }
        await f.open(); await click(f.item('Open examples…')); assert.deepEqual(localCommands, ['examples']);
        assert.equal(f.host.querySelector('[data-menu="Workflows"]'), null);
    } finally { await f.close(); }
});

test('fallback File offers a JSON download without promising same-file saving', async () => {
    const commands = [];
    const f = await fixture('WorkspaceMenus', state({ name: 'Untitled', dirty: true, busy: false, native: false, recents: [], recovery: [] }), { command: command => commands.push(command) });
    try {
        await f.open();
        assert.equal(f.item('Save workflow'), undefined); assert.equal(f.item('Save As…'), undefined);
        await click(f.item('Download JSON…')); assert.deepEqual(commands, ['download-document']);
    } finally { await f.close(); }
});

test('Open Recent supports nested keyboard navigation and clearing just the recent list', async () => {
    const commands = [];
    const f = await fixture('WorkspaceMenus', state({ name: 'draft.json', dirty: false, busy: false, native: true, recents: [{ id: 'first', name: 'first.json' }, { id: 'second', name: 'second.json' }], recovery: [] }), { command: command => commands.push(command) });
    try {
        const file = f.host.querySelector('[data-menu="File"]'); file.focus(); await key(file, 'ArrowDown');
        assert.equal(document.activeElement, f.item('New workflow'));
        const recent = f.item('Open Recent'); assert.ok(recent); assert.equal(recent.getAttribute('aria-haspopup'), 'menu'); recent.focus(); await key(recent, 'ArrowRight');
        assert.equal(document.activeElement, f.item('first.json', 'Open Recent'));
        await key(document.activeElement, 'ArrowDown'); assert.equal(document.activeElement, f.item('second.json', 'Open Recent'));
        await key(document.activeElement, 'ArrowLeft'); assert.equal(f.menu('Open Recent'), null); assert.equal(document.activeElement, recent);
        await key(recent, 'ArrowRight'); await click(f.item('second.json', 'Open Recent')); assert.deepEqual(commands, ['open-recent:second']); assert.equal(document.activeElement, file);
        await f.open(); await click(f.item('Open Recent')); await key(f.item('first.json', 'Open Recent'), 'End');
        const clear = f.item('Clear Recent', 'Open Recent'); assert.equal(document.activeElement, clear); assert.match(clear.title, /Files stay on disk/);
        await key(clear, 'Escape'); assert.equal(f.menu('Open Recent'), null); assert.equal(document.activeElement, f.item('Open Recent'));
        await click(f.item('Open Recent')); await click(f.item('Clear Recent', 'Open Recent')); assert.deepEqual(commands, ['open-recent:second', 'clear-recent']); assert.equal(f.menu('File'), null);
    } finally { await f.close(); }
});

test('migration recovery remains separately selectable when native recent files are unavailable', async () => {
    const commands = [];
    const f = await fixture('WorkspaceMenus', state({ name: 'Untitled', dirty: false, busy: false, native: false, recents: [], recovery: [{ id: 'legacy', name: 'Old scene' }, { id: 'damaged', name: 'Unreadable scene', issue: 'This stored workflow needs repair.' }] }), { command: command => commands.push(command) });
    try {
        await f.open(); assert.equal(f.item('Open Recent').disabled, true);
        await click(f.item('Recover previous workflows'));
        assert.equal(f.menu('Open Recent'), null); assert.ok(f.menu('Recover previous workflows'));
        const damaged = f.item('Unreadable scene', 'Recover previous workflows'); assert.equal(damaged.disabled, false); assert.match(damaged.title, /needs repair/);
        await click(damaged); assert.deepEqual(commands, ['recover-workflow:damaged']);
        await f.open(); await click(f.item('Recover previous workflows')); await click(f.item('Old scene', 'Recover previous workflows')); assert.deepEqual(commands, ['recover-workflow:damaged', 'recover-workflow:legacy']);
        assert.equal(f.menu('File'), null);
    } finally { await f.close(); }
});

test('toolbar reports document edits and file status separately from workflow execution', async () => {
    const initial = { ...state({ name: 'scene.json', dirty: true, busy: false, native: true, recents: [], recovery: [] }), graphs: [], workflow: { phase: 'unified', assigned: true, callBound: 2, issues: [], busy: false, status: 'Ready' } };
    const f = await fixture('Toolbar', initial, {});
    try {
        assert.equal(f.host.querySelector('select[aria-label="Workflow"]'), null);
        assert.equal(f.host.querySelector('.pc-document-name').textContent, 'scene.json');
        assert.match(f.host.querySelector('[aria-label="Document status"]').textContent, /Modified/);
        assert.match(f.host.querySelector('[aria-label="Workflow status"]').textContent, /Ready/);
        assert.doesNotMatch(f.host.textContent, /Assigned|Unassigned|Autosave in SillyTavern/);
        await f.update({ ...initial, document: { ...initial.document, busy: true, status: 'Writing scene.json' } });
        assert.match(f.host.querySelector('[aria-label="Document status"]').textContent, /Modified.*Working.*Writing scene.json/);
        await f.update({ ...initial, document: { ...initial.document, dirty: false, status: 'Saved to scene.json' } });
        assert.match(f.host.querySelector('[aria-label="Document status"]').textContent, /Saved to scene.json/);
        assert.doesNotMatch(f.host.querySelector('[aria-label="Document status"]').textContent, /Modified/);
    } finally { await f.close(); }
});

test('shared unsaved-changes prompt offers Save Dont Save and Cancel with trapped focus', async () => {
    const anchor = document.createElement('button'); document.body.append(anchor); anchor.focus();
    const choices = [], f = await fixture('DocumentPrompt', { name: 'scene.json' }, { choose: (...args) => choices.push(args) }, () => {}, 'view');
    const escaped = []; const background = event => escaped.push(event.key); document.addEventListener('keydown', background);
    try {
        assert.equal(f.host.querySelector('select'), null, 'replacement does not choose the next document phase');
        const button = label => [...f.host.querySelectorAll('button')].find(element => element.textContent === label);
        assert.equal(document.activeElement, button('Cancel')); assert.match(f.host.textContent, /scene.json.*unsaved changes/);
        await key(button('Cancel'), 'Tab'); assert.equal(document.activeElement, button('Save'));
        await key(button('Save'), 'Tab', { shiftKey: true }); assert.equal(document.activeElement, button('Cancel'));
        await key(button('Cancel'), 'Escape'); assert.deepEqual(choices, [['cancel']]); assert.deepEqual(escaped, []);
        await click(button("Don't Save")); await click(button('Save')); assert.deepEqual(choices, [['cancel'], ['discard'], ['save']]);
    } finally { document.removeEventListener('keydown', background); await f.close(); assert.equal(document.activeElement, anchor); anchor.remove(); }
});

test('fallback unsaved prompt explains downloading a copy before explicitly switching documents', async () => {
    const choices = [], f = await fixture('DocumentPrompt', { name: 'scene.json' }, { choose: choice => choices.push(choice) }, () => {}, 'view', { native: false });
    try {
        const buttons = [...f.host.querySelectorAll('button')]; assert.equal(buttons.some(button => button.textContent === 'Save'), false);
        assert.match(f.host.textContent, /browser.*repeat the action.*Don't Save/s);
        await click(buttons.find(button => button.textContent === 'Download JSON')); assert.deepEqual(choices, ['save']);
    } finally { await f.close(); }
});

test('hovering then clicking a submenu retains it and supports returning focus with Escape', async () => {
    const f = await fixture('WorkspaceMenus', state({ name: 'scene.json', dirty: false, busy: false, native: true, recents: [{ id: 'scene', name: 'scene.json' }], recovery: [] }));
    try {
        await f.open(); const recent = f.item('Open Recent');
        const hover = new dom.window.Event('pointerenter'); Object.defineProperty(hover, 'pointerType', { value: 'mouse' }); recent.dispatchEvent(hover); await settle();
        assert.ok(f.menu('Open Recent')); await click(recent); assert.ok(f.menu('Open Recent')); assert.equal(document.activeElement, f.item('scene.json', 'Open Recent'));
        await key(document.activeElement, 'Escape'); assert.equal(document.activeElement, recent);
        await key(recent, 'Escape'); assert.equal(f.menu('File'), null); assert.equal(document.activeElement, f.host.querySelector('[data-menu="File"]'));
        await f.open(); await click(f.item('Open Recent'));
        document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })); await settle(); assert.equal(f.menu('File'), null);
    } finally { await f.close(); }
});
