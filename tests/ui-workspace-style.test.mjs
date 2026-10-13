import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { compile } from 'svelte/compiler';
const css = (await readFile(new URL('../style.css', import.meta.url), 'utf8')).replace(/^@import[^;]*;/m, '');
const dom = new JSDOM(`<style>button { border: 2px solid red; background: black; padding: 2px; font-size: 20px; }</style><style>${css}</style><div class="pc-root pc-open"><button class="pc-flat-menu">File</button><div class="pc-workspace-menu-panel"><button>Open</button></div><div class="pc-node-native"><div class="pc-native-row pc-native-row-in"><span class="pc-native-pin-label">Data</span><div class="pc-port pc-port-in"></div></div></div></div>`);
dom.window.document.documentElement.dataset.pcOwn = '1';
const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
test('host buttons cannot box or fill idle flat workspace menus', () => {
    assert.doesNotMatch(css, /:root\[data-pc-own="1"\] \.pc-root button\s*[{,]/, 'Theme rules must target boxed controls rather than every component button.');
    assert.equal(style('.pc-flat-menu').borderTopWidth, '0px');
    assert.equal(style('.pc-flat-menu').backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.equal(style('.pc-workspace-menu-panel button').borderTopWidth, '0px');
    assert.equal(style('.pc-workspace-menu-panel button').backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.equal(style('.pc-workspace-menu-panel button').paddingLeft, '7px');
});
test('named pin hit areas anchor to their label rows at the side of the card', () => {
    assert.equal(style('.pc-native-row').position, 'relative');
    assert.equal(style('.pc-port').position, 'absolute');
    assert.equal(style('.pc-port').top, 'calc(50% + var(--pc-pin-y, 0px))', 'Measured label ink can offset the pin within its row');
    assert.equal(style('.pc-port').left, '12px');
    assert.equal(style('.pc-port').width, '24px', 'Small glyphs retain the full connection hit target');
    assert.equal(style('.pc-port').height, '24px');
});

test('the vertical shelf reserves the run meter strip and remains scrollable', () => {
    const host = dom.window.document.querySelector('.pc-root'), shelf = dom.window.document.createElement('nav');
    shelf.className = 'pc-node-shelf'; host.append(shelf);
    assert.equal(style('.pc-node-shelf').maxHeight, 'calc(100% - 62px)');
    assert.equal(style('.pc-node-shelf').overflowY, 'auto');
});

test('Ember ordinary cards keep opaque content, soft depth and no border or bevel', () => {
    const node = dom.window.document.querySelector('.pc-node-native'); node.classList.add('pc-node', 'pc-family-shaping');
    dom.window.document.documentElement.dataset.pcPreset = 'ember';
    const paint = style('.pc-node-native');
    assert.equal(paint.background, 'var(--pc-block)', 'An explicit block color remains the node fill');
    assert.equal(paint.borderTopWidth, '0px'); assert.equal(paint.borderRadius, '6px');
    assert.equal(paint.boxShadow, '0 1px 2px #00000050'); assert.equal(Number(paint.opacity || 1), 1);
    assert.equal(Number(style('.pc-native-pin-label').opacity || 1), 1);
});

test('intentional Ember shape and depth choices replace only its untouched defaults', () => {
    const root = dom.window.document.documentElement; root.dataset.pcPreset = 'ember';
    root.dataset.pcShape = 'soft'; root.dataset.pcDepth = 'flat';
    assert.equal(style('.pc-node-native').borderRadius, '16px'); assert.equal(style('.pc-node-native').boxShadow, 'none');
    root.dataset.pcShape = 'sharp'; root.dataset.pcDepth = 'deep';
    assert.equal(style('.pc-node-native').borderRadius, '2px'); assert.equal(style('.pc-node-native').boxShadow, '0 6px 18px #00000059');
    root.dataset.pcShape = 'rounded'; root.dataset.pcDepth = 'soft';
    assert.equal(style('.pc-node-native').borderRadius, '6px'); assert.equal(style('.pc-node-native').boxShadow, '0 1px 2px #00000050');
});

test('Ember execution rings retain priority over selection without bringing back a bevel', () => {
    const node = dom.window.document.querySelector('.pc-node-native'), root = dom.window.document.documentElement;
    root.dataset.pcPreset = 'ember'; node.classList.add('pc-node', 'pc-selected');
    assert.match(style('.pc-node-native').boxShadow, /0 0 0 2px var\(--pc-flow\)/);
    node.classList.add('pc-trace-running'); assert.match(style('.pc-node-native').boxShadow, /var\(--pc-flow\)/);
    node.classList.remove('pc-trace-running'); node.classList.add('pc-trace-failed');
    const failed = style('.pc-node-native'); assert.match(failed.boxShadow, /0 0 0 2px var\(--pc-error\)/);
    assert.doesNotMatch(failed.boxShadow, /inset/); assert.equal(failed.borderTopWidth, '0px'); assert.equal(failed.borderRadius, '6px');
    assert.equal(Number(style('.pc-native-pin-label').opacity || 1), 1, 'Execution dimming stays on the existing interior wrappers');
});

test('Ember Details, portal manager and subgraph saves consume host surfaces without boxing preview buttons', async () => {
    const components = [['NodeDetails', 'pc-node-details'], ['PortalManager', 'pc-manager'], ['SubgraphSave', 'pc-subgraph-save'], ['OutputPreview', 'pc-output-preview']];
    for (const [name, className] of components) {
        const source = await readFile(new URL('../ui/' + name + '.svelte', import.meta.url), 'utf8');
        const componentCss = compile(source, { filename: name + '.svelte', generate: 'client', css: 'external' }).css.code;
        const scopedClass = componentCss.match(/\.svelte-[a-z0-9]+/)[0].slice(1);
        // Production imports the compiled component sheet before workspace overrides.
        const fixture = new JSDOM(`<style>${componentCss}</style><style>${css}</style><div class="pc-root"><section class="${className}"><header><button>Action</button></header><label>Field<input></label><small>Quiet text</small><p class="pc-save-error">Save failed</p><footer>Result</footer></section></div>`);
        const root = fixture.window.document.documentElement; root.dataset.pcOwn = '1'; root.dataset.pcPreset = 'ember';
        for (const element of fixture.window.document.querySelectorAll('section, section *')) element.classList.add(scopedClass);
        const computed = selector => fixture.window.getComputedStyle(fixture.window.document.querySelector(selector));
        if (name === 'OutputPreview') {
            assert.equal(computed('button').borderTopWidth, '0px');
            assert.equal(computed('button').backgroundColor, 'rgba(0, 0, 0, 0)');
            assert.equal(computed('.pc-root').getPropertyValue('--pc-raised'), 'var(--pc-control)');
        } else {
            assert.equal(computed('section').color, 'var(--pc-text)', name + ' inherits main text');
            assert.equal(computed('button').background, 'var(--pc-control)', name + ' inherits raised control surface');
            assert.equal(computed('small').color, 'var(--pc-muted)', name + ' inherits quiet text');
            assert.equal(computed('input').background, 'var(--pc-field)', name + ' inherits field surface');
            if (name === 'SubgraphSave') assert.equal(computed('.pc-save-error').color, 'var(--pc-error)', 'save rejection keeps the semantic error color');
        }
    }
});

test('ordinary run panels inherit theme tokens while semantic feedback retains its colors', async () => {
    for (const name of ['RunDetails', 'RunMeter']) {
        const source = await readFile(new URL('../ui/' + name + '.svelte', import.meta.url), 'utf8');
        const componentCss = compile(source, { filename: name + '.svelte', generate: 'client', css: 'external' }).css.code;
        const scopedClass = componentCss.match(/\.svelte-[a-z0-9]+/)[0].slice(1);
        const markup = name === 'RunDetails'
            ? '<section class="pc-run-details"><header><span class="pc-run-status" data-status="empty">Ready</span><span class="pc-run-status" data-status="failed">Failed</span><span class="pc-run-status" data-status="completed">Completed</span></header><div class="pc-run-summary">Summary</div><ol><li data-status="completed"><button><span>▱</span>Stage</button><small>Elapsed</small><details><summary>Reported usage</summary></details></li><li data-status="failed">Issue</li></ol></section>'
            : '<button class="pc-run-meter"><span class="pc-run-meter-label">Ready</span><span class="pc-run-meter-elapsed">1.0s</span><span class="pc-run-pixel" data-status="completed"></span><span class="pc-run-pixel" data-status="failed"></span></button>';
        const fixture = new JSDOM(`<style>${componentCss}</style><style>${css}</style><div class="pc-root">${markup}</div>`);
        const root = fixture.window.document.documentElement; root.dataset.pcOwn = '1'; root.dataset.pcPreset = 'ember';
        for (const element of fixture.window.document.querySelectorAll('.pc-root *')) element.classList.add(scopedClass);
        const computed = selector => fixture.window.getComputedStyle(fixture.window.document.querySelector(selector));
        const borderRule = (selector, property) => [...fixture.window.document.styleSheets[0].cssRules].find(rule => rule.selectorText?.includes(selector) && rule.style.getPropertyValue(property))?.style.getPropertyValue(property);
        if (name === 'RunDetails') {
            assert.equal(computed('section').color, 'var(--pc-text)');
            assert.equal(computed('button').color, 'var(--pc-text)');
            assert.equal(computed('small').color, 'var(--pc-muted)');
            assert.equal(computed('.pc-run-summary').color, 'var(--pc-muted)');
            assert.equal(computed('summary').color, 'var(--pc-muted)', 'Usage heading stays quiet under the workspace control rule');
            assert.equal(computed('[data-status="empty"]').color, 'var(--pc-muted)');
            assert.equal(computed('li[data-status="completed"]').background, 'var(--pc-control)');
            assert.equal(borderRule('header', 'border-bottom'), '1px solid var(--pc-border)', 'Compiled header keeps its 1px border and inherited color');
            assert.equal(computed('.pc-run-status[data-status="failed"]').color, 'rgb(229, 141, 148)');
            assert.equal(computed('.pc-run-status[data-status="completed"]').color, 'rgb(164, 194, 173)');
            assert.equal(computed('li[data-status="failed"]').backgroundColor, 'rgb(26, 27, 28)');
        } else {
            assert.equal(computed('.pc-run-meter').color, 'var(--pc-text)');
            assert.equal(computed('.pc-run-meter-elapsed').color, 'var(--pc-muted)');
            assert.equal(computed('.pc-run-meter').background, 'var(--pc-control)');
            assert.equal(borderRule('.pc-run-meter', 'border'), '1px solid var(--pc-border)', 'Compiled meter keeps its 1px border and inherited color');
            assert.equal(computed('[data-status="completed"]').backgroundColor, 'rgb(138, 173, 150)');
            assert.equal(computed('[data-status="failed"]').backgroundColor, 'rgb(215, 106, 116)');
            assert.equal(computed('.pc-run-pixel').width, '4px');
        }
    }
});

test('shelf rows leave room for a thin vertical scrollbar without shrinking their icons or enabling horizontal scroll', () => {
    const shelf = dom.window.document.querySelector('.pc-node-shelf'), row = dom.window.document.createElement('button');
    row.className = 'pc-family-row'; row.innerHTML = '<svg></svg><span>Subgraphs</span>'; shelf.append(row);
    const shelfPaint = style('.pc-node-shelf'), rowPaint = style('.pc-family-row');
    assert.equal(shelfPaint.overflowX, 'hidden');
    assert.equal(shelfPaint.scrollbarWidth, 'thin'); assert.equal(shelfPaint.scrollbarColor, 'var(--pc-scrollbar-thumb) var(--pc-scrollbar-track)');
    assert.ok(parseFloat(shelfPaint.width) >= parseFloat(rowPaint.width) + 6, 'the shelf reserves room for its vertical scrollbar beside the full-width rows');
    assert.equal(shelfPaint.gap, '2.4px');
    assert.equal(rowPaint.height, '33.6px'); assert.equal(rowPaint.flexBasis, '33.6px');
    // JSDOM resolves font: inherit after font-size; the browser check covers text sizing.
    assert.equal(rowPaint.alignItems, 'center');
    const iconPaint = style('.pc-family-row svg');
    assert.equal(iconPaint.width, '19.2px'); assert.equal(iconPaint.height, '19.2px'); assert.equal(iconPaint.flexShrink, '0');
});

test('selected graph tab masks only its own canvas border without an extra right corner', () => {
    const selected = [...dom.window.document.styleSheets[1].cssRules].find(rule => rule.selectorText === '.pc-graph-tab::after');
    const foot = [...dom.window.document.styleSheets[1].cssRules].find(rule => rule.selectorText === '.pc-graph-tab::before');
    assert.ok(selected); assert.equal(selected.style.left, '0px'); assert.equal(selected.style.right, '0px'); assert.equal(selected.style.bottom, '0px');
    assert.equal(selected.style.height, '1px'); assert.equal(selected.style.border, '0px', 'the mask must not extend the tab side borders');
    assert.equal(foot, undefined, 'the surplus corner painting must not remain');
});
