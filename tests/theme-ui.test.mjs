// The theme picker in the page: choosing a preset sets the colours, picking a
// colour changes it live, look-alike warnings appear, reset works, and the
// palette button opens the same editor over the canvas.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM(`<body><div id="chat"></div><div id="drawer"></div></body>`, { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, CSS: { escape: s => s }, CustomEvent: dom.window.CustomEvent, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent });
for (const key of ['Node','Element','Text','Comment','Document','HTMLMediaElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','MutationObserver']) Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
globalThis.requestAnimationFrame = f => setTimeout(f, 0);
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.toastr = { info() {}, warning() {}, success() {}, error() {} };
const { installMock } = await import('./mock.js');
const c = installMock({ settings: { graphs: {} } });
c.eventSource = { on() {}, emit() {} }; c.eventTypes = {};
const v = JSON.parse((await import('node:fs')).readFileSync(new URL('../manifest.json', import.meta.url))).version;
const T = await import(`../src/theme.js?v=${v}`);
const E = await import(`../src/theme-editor.js?v=${v}`);
const UI = await import(`../src/ui.js?v=${v}`);
const root = document.documentElement;
const prop = (k) => root.style.getPropertyValue(`--pc-${k}`);

const box = document.getElementById('drawer');
E.renderThemeEditor(box);
const names = [...box.querySelectorAll('.pc-th-preset .pc-th-name')].map(n => n.textContent);
assert.deepEqual(names, ['Ember', 'Lattice', 'Ash', 'Graphite', 'Slate', 'Obsidian', 'Harbor', 'Signal'], 'The picker exposes exactly the eight approved presets');
assert.ok(box.querySelector('.pc-th-preset.pc-on').textContent.includes('Ember'), 'Fresh settings select the approved Ember preset');
assert.equal(box.querySelectorAll('.pc-th-preset')[0].querySelectorAll('.pc-th-swatch').length, T.ROLES.filter(role => role.group === 'meaning').length, 'swatches preview current selection and feedback colors');

// Every approved preset is selectable and stored by the existing editor.
for (const [key, name] of [['ember', 'Ember'], ['lattice', 'Lattice'], ['ash', 'Ash'], ['graphite', 'Graphite'], ['slate', 'Slate'], ['obsidian', 'Obsidian'], ['harbor', 'Harbor'], ['signal', 'Signal']]) {
    [...box.querySelectorAll('.pc-th-preset')].find(b => b.querySelector('.pc-th-name').textContent === name).click();
    assert.equal(T.currentTheme().preset, key);
    assert.equal(c.extensionSettings.lattice.ui.theme.preset, key, `${name} selection is persisted`);
}
[...box.querySelectorAll('.pc-th-preset')].find(b => b.textContent.includes('Ash')).click();
assert.equal(T.currentTheme().preset, 'ash');
assert.equal(prop('panel'), T.PRESETS.ash.colors.panel);
assert.equal(prop('warn'), T.PRESETS.ash.colors.warn);
assert.ok([...box.querySelectorAll('.pc-th-preset.pc-on')].length === 1);

// Intentional look choices still apply independently of the preset palette.
for (const [part, value] of [['shape', 'sharp'], ['font', 'mono'], ['grid', 'lines'], ['wires', 'angled']]) T.setStyle(part, value);
E.renderThemeEditor(box);
assert.equal(root.dataset.pcShape, 'sharp');
assert.equal(root.dataset.pcWires, 'angled');
assert.equal(root.dataset.pcGrid, 'lines');
assert.match(prop('font'), /monospace/);
assert.equal(root.dataset.pcOwn, '1', 'styles SillyTavern\u2019s controls in the panel');
// change the look in the editor
box.querySelector('.pc-th-look').open = true;
const shapeSel = [...box.querySelectorAll('.pc-th-look-select')].find(s => [...s.options].some(o => o.value === 'soft'));
shapeSel.value = 'soft'; shapeSel.dispatchEvent(new dom.window.Event('change'));
assert.equal(root.dataset.pcShape, 'soft');
assert.match(box.querySelector('.pc-th-look summary').textContent, /4 changed/);
T.setStyle('shape', null);

// A custom light surface keeps colour-pill text readable over the accent.
T.setColor('panel', '#fff4f8');
T.setColor('block', '#ffffff');
T.setColor('text', '#3d2230');
T.setColor('muted', '#70505d');
E.renderThemeEditor(box);
assert.equal(root.dataset.pcLight, '1');
assert.ok(T.contrast(T.parseColor(prop('on-accent')), T.parseColor(prop('flow'))) >= 4.5);

// customise: pick a colour, see it live, get a look-alike warning, reset it
[...box.querySelectorAll('.pc-th-preset')].find(b => b.textContent.includes('Lattice')).click();
box.querySelector('.pc-th-custom').open = true;
const row = [...box.querySelectorAll('.pc-th-row')].find(r => r.textContent.includes('Warnings'));
const input = row.querySelector('input[type=color]');
input.value = T.PRESETS.lattice.colors.flow;               // same as Selection accent
input.dispatchEvent(new dom.window.Event('input'));
input.dispatchEvent(new dom.window.Event('change'));
assert.equal(T.currentTheme().custom.warn, T.PRESETS.lattice.colors.flow);
assert.ok(box.querySelector('.pc-th-custom').open, 'stays open while editing');
assert.match(box.querySelector('.pc-th-warnings').textContent, /very close/);
assert.match(box.querySelector('.pc-th-custom summary').textContent, /1 changed/);
[...box.querySelectorAll('.pc-th-row')].find(r => r.textContent.includes('Warnings')).querySelector('.pc-th-reset').click();
assert.equal(T.currentTheme().custom.warn, undefined);
assert.equal(box.querySelector('.pc-th-warnings'), null);

// export / import through the editor
T.setColor('error', '#123456');
E.renderThemeEditor(box);
box.querySelector('.pc-th-share').open = true;
[...box.querySelectorAll('.pc-th-btn')].find(b => b.textContent === 'Copy my theme').click();
await new Promise(r => setTimeout(r, 10));
const shared = box.querySelector('.pc-th-text').value;
assert.match(shared, /latticeTheme/);
T.setPreset('obsidian');
E.renderThemeEditor(box);
box.querySelector('.pc-th-text').value = shared;
[...box.querySelectorAll('.pc-th-btn')].find(b => b.textContent === 'Use pasted theme').click();
assert.equal(T.currentTheme().preset, 'lattice');
assert.equal(T.currentTheme().custom.error, '#123456');
assert.match(box.querySelector('.pc-th-msg').textContent, /Now using/);

// the workspace View menu opens the same editor
UI.open();
await new Promise(r => setTimeout(r, 30));
document.querySelector('[data-menu="View"]').click();
await new Promise(r => setTimeout(r, 10));
[...document.querySelectorAll('.pc-workspace-menu-panel button')].find(button => button.textContent.includes('Theme and colours')).click();
const pop = document.querySelector('.pc-theme-pop');
assert.ok(pop?.querySelector('.pc-th-preset'), 'popover shows the editor');
[...pop.querySelectorAll('.pc-th-preset')].find(b => b.textContent.includes('Slate')).click();
assert.equal(T.currentTheme().preset, 'slate');
assert.ok(box.querySelector('.pc-th-preset.pc-on').textContent.includes('Slate'), 'the drawer editor follows');
document.body.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
assert.equal(document.querySelector('.pc-theme-pop'), null, 'closes on a click outside');
console.log('theme-ui: ok');
