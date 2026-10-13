import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
function actual(name, env) {
    const start = source.indexOf('function ' + name + '('), end = source.indexOf('\nfunction ', start + 1);
    assert.ok(start >= 0);
    return Function('env', 'with(env){' + source.slice(start, end < 0 ? undefined : end) + ';return ' + name + ';}')(env);
}
function fixture(left = true, automatic = false) {
    const dom = new JSDOM('<form id="send_form">' + (left ? '<div id="leftSendForm"><div id="options_button"></div></div>' : '') + '<textarea id="send_textarea"></textarea><div id="rightSendForm"><div id="send_but"></div></div></form>');
    const saved = { enabled: false, ui: {} }; let opens = 0, updates = 0;
    const env = { document: dom.window.document, settings: () => saved, isEnabled: () => saved.enabled,
        UI: { open() { opens++; } }, updateState() { updates++; env.paintSendbar(); }, safe: fn => fn(),
        logoUrl: new URL('../assets/lattice-logo.svg', import.meta.url).href,
        sendWorkflowState: () => ({ automatic, offText: 'Workflows off', enabledText: 'Lattice enabled', enableLabel: 'Enable Lattice' }) };
    env.paintSendbar = actual('paintSendbar', env);
    return { dom, saved, env, mount: actual('addSendbarButton', env), opens: () => opens, updates: () => updates };
}

test('chat launcher uses the Lattice logo on the left without submitting or generating', () => {
    const f = fixture(); assert.equal(f.mount(), true);
    const button = f.env.document.getElementById('pc-sendbar');
    assert.equal(button.parentElement.id, 'leftSendForm');
    assert.equal(button.tagName, 'BUTTON'); assert.equal(button.type, 'button');
    assert.equal(button.getAttribute('aria-label'), 'Open Lattice');
    assert.equal(button.classList.contains('fa-diagram-project'), false);
    const icon = button.querySelector('.pc-chat-launcher-icon');
    assert.match(icon.style.getPropertyValue('--pc-launcher-logo'), /\/assets\/lattice-logo\.svg"\)$/);
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    let submits = 0; f.env.document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submits++; });
    button.click(); assert.equal(f.opens(), 1); assert.equal(submits, 0);
    button.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert.equal(f.opens(), 2); assert.equal(f.saved.enabled, false);
    button.dispatchEvent(new f.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    assert.equal(f.saved.enabled, true); assert.equal(f.updates(), 1); assert.equal(submits, 0);
});

for (const automatic of [true, false]) {
    const workflow = automatic ? 'an automatic workflow' : 'no automatic workflow';
    test(`launcher reflects shared enabled state with ${workflow}`, () => {
        const f = fixture(true, automatic); f.mount();
        const button = f.env.document.getElementById('pc-sendbar');
        assert.equal(button.classList.contains('pc-sendbar-on'), false);
        f.saved.enabled = true; f.env.paintSendbar();
        assert.equal(button.classList.contains('pc-sendbar-on'), true);
        assert.equal(button.classList.contains('pc-sendbar-nograph'), !automatic);
        assert.match(button.title, /^Lattice enabled\n/);
        f.saved.enabled = false; f.env.paintSendbar();
        assert.equal(button.classList.contains('pc-sendbar-on'), false);
        assert.equal(button.classList.contains('pc-sendbar-nograph'), false);
        assert.match(button.title, /^Workflows off\n/);
    });

    test(`right-click toggles launcher enabled feedback with ${workflow}`, () => {
        const f = fixture(true, automatic); f.mount();
        const button = f.env.document.getElementById('pc-sendbar');
        const contextmenu = () => button.dispatchEvent(new f.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        assert.equal(contextmenu(), false);
        assert.equal(f.saved.enabled, true);
        assert.equal(button.classList.contains('pc-sendbar-on'), true);
        assert.equal(button.classList.contains('pc-sendbar-nograph'), !automatic);
        assert.equal(contextmenu(), false);
        assert.equal(f.saved.enabled, false);
        assert.equal(button.classList.contains('pc-sendbar-on'), false);
        assert.equal(button.classList.contains('pc-sendbar-nograph'), false);
        assert.equal(f.updates(), 2);
        assert.equal(f.opens(), 0);
    });
}

test('launcher waits for the left control group and remounts without duplicating buttons', () => {
    const f = fixture(false); assert.equal(f.mount(), false);
    assert.equal(f.env.document.querySelector('#rightSendForm #pc-sendbar'), null);
    const left = f.env.document.createElement('div'); left.id = 'leftSendForm'; f.env.document.querySelector('form').prepend(left);
    assert.equal(f.mount(), true); const button = f.env.document.getElementById('pc-sendbar');
    f.env.document.getElementById('rightSendForm').append(button);
    assert.equal(f.mount(), true); assert.equal(button.parentElement, left);
    assert.equal(f.env.document.querySelectorAll('#pc-sendbar').length, 1);
    f.saved.ui.sendbarButton = false; assert.equal(f.mount(), true); assert.equal(f.env.document.getElementById('pc-sendbar'), null);
    f.saved.ui.sendbarButton = true; assert.equal(f.mount(), true); assert.equal(f.env.document.querySelectorAll('#pc-sendbar').length, 1);
});


test('current document edits cancel native authority and obsolete assignments cannot redirect it', () => {
    const dom = new JSDOM('<body></body>');
    const graph = id => ({ id, schema: 3, runtime: 2, mode: 'native-unified', nodes: { text: { id: 'text', type: 'workflow', operation: 'compose', sections: [{ name: 'Text', text: id }] } }, wires: {} });
    const open=graph('open'),unrelated=graph('unrelated'),saved={enabled:true,nativeBindings:{workflowGraphId:unrelated.id}},token={};
    const cancellations=[],runtime={cancel:reason=>cancellations.push(reason),dispose(){}};
    const env={document:dom.window.document,ctx:()=>({eventTypes:{}}),settings:()=>saved,activeWorkflow:()=>open,
        documentSession:{capture:()=>token,stillCurrent:actual=>actual===token},onWorkflowActivated(){},
        initializeNativeWorkflowController:async()=>{},getNativeWorkflowController:()=>runtime,
        workflowSignature:value=>JSON.stringify(value.nodes),paintSendbar(){},applyTheme(){},mountLauncher(){},addSlashCommand(){},MODULE:'lattice',UI:{refreshIfOpen(){}},safe:fn=>fn(),globalThis:{addEventListener(){}}};
    const start=source.indexOf('function boot()'),end=source.indexOf('\n}',start)+2;
    Function('env','with(env){'+source.slice(start,end)+';boot();}')(env);
    unrelated.nodes.text.sections[0].text='Unrelated graph changed';dom.window.document.dispatchEvent(new dom.window.Event('pc-state'));
    assert.deepEqual(cancellations,[]);
    open.nodes.text.sections[0].text='Open document changed';dom.window.document.dispatchEvent(new dom.window.Event('pc-state'));
    assert.deepEqual(cancellations,['Workflow settings changed']);assert.equal(env.activeWorkflow(),open);
});
