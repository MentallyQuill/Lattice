import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { installMock } from './mock.js';

const approved = JSON.parse(await readFile(new URL('../docs/superpowers/handoffs/2026-10-09-ember-theme-tokens.json', import.meta.url), 'utf8'));
const dom = new JSDOM('<!doctype html><body><div id="chat"></div></body>');
Object.assign(globalThis, { document: dom.window.document, window: dom.window, getComputedStyle: dom.window.getComputedStyle, CustomEvent: dom.window.CustomEvent });
const context = installMock({ settings: { graphs: {} } });
const version = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8')).version;
const T = await import(`../src/theme.js?v=${version}`);
const S = await import(`../src/state.js?v=${version}`);
const root = document.documentElement;
const hostTokens = approved.settings.tokens;
for (const [key, value] of Object.entries(hostTokens)) root.style.setProperty('--' + key, value);
const value = key => root.style.getPropertyValue('--pc-' + key);
const hostSnapshot = () => Object.fromEntries(Object.keys(hostTokens).map(key => [key, root.style.getPropertyValue('--' + key)]));

test('fresh Ember uses the approved fixed card fill and canvas with inherited host roles', () => {
    assert.equal(T.DEFAULT_PRESET, 'ember');
    assert.equal(T.currentTheme().preset, 'ember');
    const before = hostSnapshot(), graph = S.activeWorkflow(), saved = structuredClone(graph);
    T.applyTheme();
    assert.equal(root.dataset.pcPreset, 'ember');
    assert.equal(value('canvas'), approved.settings.canvasOverride);
    assert.equal(value('block'), approved.settings.nodeOverride);
    const roleTokens = {panel:'SmartThemeBlurTintColor',text:'SmartThemeBodyColor',muted:'SmartThemeEmColor',border:'SmartThemeBorderColor',flow:'SmartThemeQuoteColor'};
    for (const [role, token] of Object.entries(roleTokens)) {
        assert.equal(T.currentTheme().colors[role], hostTokens[token]);
        assert.match(value(role), new RegExp(`^var\\(--${token},`));
    }
    assert.match(value('field'), /^var\(--SmartThemeUserMesBlurTintColor,/);
    assert.match(value('control'), /^var\(--SmartThemeBotMesBlurTintColor,/);
    assert.match(value('accent'), /^var\(--SmartThemeQuoteColor,/);
    assert.deepEqual(hostSnapshot(), before);
    assert.deepEqual(graph, saved, 'Theme changes do not author or run the activated workflow');
});

test('host changes resolve from their original tokens and custom overrides remain explicit', () => {
    root.style.setProperty('--SmartThemeBodyColor', '#c8d8f0');
    root.style.setProperty('--SmartThemeBlurTintColor', '#18232c');
    const before = hostSnapshot(); T.applyTheme(); T.applyTheme();
    assert.equal(T.currentTheme().colors.text, '#c8d8f0');
    assert.equal(T.currentTheme().colors.panel, '#18232c');
    assert.deepEqual(hostSnapshot(), before, 'Ember never overwrites the host tokens');
    T.setColor('panel', '#123456'); T.setColor('block', '#304050'); T.setColor('flow', '#f0a060');
    assert.equal(value('panel'), '#123456'); assert.equal(value('block'), '#304050'); assert.equal(value('flow'), '#f0a060'); assert.equal(value('accent'), '#f0a060');
    T.setStyle('grid', 'lines'); assert.equal(root.dataset.pcGrid, 'lines');
    const exported = T.exportTheme('Custom Ember'); T.setPreset('ash');
    assert.equal(root.dataset.pcPreset, 'ash'); assert.equal(value('panel'), T.PRESETS.ash.colors.panel);
    assert.equal(T.importTheme(exported).ok, true); assert.equal(T.currentTheme().preset, 'ember'); assert.equal(value('panel'), '#123456'); assert.equal(root.dataset.pcGrid, 'lines');
    T.setColor('panel', null); assert.equal(T.currentTheme().colors.panel, '#18232c'); assert.match(value('panel'), /^var\(--SmartThemeBlurTintColor,/);
    T.setPreset('ember'); assert.equal(value('block'), approved.settings.nodeOverride); assert.equal(root.dataset.pcGrid, 'none');
});
