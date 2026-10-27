import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { installMock } from './mock.js';
import * as state from '../src/state.js';
import * as failurePolicy from '../src/workflow/failure-policy.js';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
function actual(name, env) {
    const start = source.indexOf('function ' + name + '('), end = source.indexOf('\nfunction ', start + 1);
    assert.ok(start >= 0);
    return Function('env', 'with(env){' + source.slice(start, end < 0 ? undefined : end) + ';return ' + name + ';}')(env);
}
function fixture(left = true, automatic = false) {
    const dom = new JSDOM('<form id="send_form">' + (left ? '<div id="leftSendForm"><div id="options_button"></div></div>' : '') + '<textarea id="send_textarea"></textarea><div id="rightSendForm"><div id="send_but"></div></div></form>');
    const saved = { enabled: false, ui: {} }; let opens = 0, updates = 0;
    const progressMounts = [];
    const env = { document: dom.window.document, settings: () => saved, isEnabled: () => saved.enabled,
        UI: { open() { opens++; }, refreshIfOpen() {} }, updateState() { updates++; env.paintSendbar(); }, safe: fn => fn(),
        logoUrl: new URL('../assets/lattice-logo.svg', import.meta.url).href,
        chatProgress: { mount(button) { progressMounts.push(button); } },
        sendWorkflowState: () => ({ automatic, offText: 'Workflows off', enabledText: 'Lattice enabled', enableLabel: 'Enable Lattice' }) };
    env.paintSendbar = actual('paintSendbar', env);
    return { dom, saved, env, progressMounts, mount: actual('addSendbarButton', env), opens: () => opens, updates: () => updates };
}

test('chat progress follows launcher mounting, hiding and re-enabling', () => {
    const f = fixture();
    f.mount();
    const button = f.env.document.getElementById('pc-sendbar');
    assert.equal(f.progressMounts.at(-1), button);
    f.saved.ui.sendbarButton = false;
    f.mount();
    assert.equal(f.progressMounts.at(-1), null);
    assert.equal(button.isConnected, false);
    f.saved.ui.sendbarButton = true;
    f.mount();
    assert.equal(f.progressMounts.at(-1), f.env.document.getElementById('pc-sendbar'));
    assert.notEqual(f.progressMounts.at(-1), button);
});

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
    saved.workflowFailurePolicy='stop';dom.window.document.dispatchEvent(new dom.window.Event('pc-state'));
    assert.deepEqual(cancellations,[]);
    unrelated.nodes.text.sections[0].text='Unrelated graph changed';dom.window.document.dispatchEvent(new dom.window.Event('pc-state'));
    assert.deepEqual(cancellations,[]);
    open.nodes.text.sections[0].text='Open document changed';dom.window.document.dispatchEvent(new dom.window.Event('pc-state'));
    assert.deepEqual(cancellations,['Workflow settings changed']);assert.equal(env.activeWorkflow(),open);
});

test('global failure select exposes the approved choices and saves the next-run preference with its help', () => {
    const host = installMock({ settings: { workflowFailurePolicy: 'stop' } }); let saves = 0;
    host.saveSettingsDebounced = () => saves++;
    const saved = state.settings(), token = state.documentSession.capture();
    const f = fixture();
    f.env.document.body.insertAdjacentHTML('beforeend', '<div id="extensions_settings2"></div>');
    Object.assign(f.env, { settings: state.settings, getWorkflowFailurePolicy: state.getWorkflowFailurePolicy,
        setWorkflowFailurePolicy: state.setWorkflowFailurePolicy, WORKFLOW_FAILURE_OPTIONS: failurePolicy.WORKFLOW_FAILURE_OPTIONS,
        activeWorkflow: state.activeWorkflow });
    const previousDocument = globalThis.document, previousCustomEvent = globalThis.CustomEvent;
    globalThis.document = f.env.document; globalThis.CustomEvent = f.dom.window.CustomEvent;
    document.addEventListener('pc-state', f.env.paintSendbar);
    try {
        actual('addLauncher', f.env)();
        const select = document.querySelector('#pc-failure-policy');
        assert.ok(select, 'global drawer must offer a native failure select');
        assert.equal(select.tagName, 'SELECT');
        assert.equal(document.querySelector('label[for="pc-failure-policy"]').textContent, 'When a node fails');
        assert.equal(select.closest('.pc-settings-controls').children[0].querySelector('input').id, 'pc-enabled');
        assert.equal(select.closest('.pc-settings-controls').children[1].contains(select), true);
        assert.deepEqual([...select.options].map(option => [option.value, option.textContent]), [
            ['native-fallback', 'Fall back to SillyTavern'], ['stop', 'Stop all generation'], ['continue-available', 'Continue where possible'],
        ]);
        const help = document.getElementById(select.getAttribute('aria-describedby'));
        assert.equal(select.value, 'stop');
        assert.equal(help.textContent, 'Stop the workflow and all generation for this Send.');
        for (const [value, description] of [
            ['native-fallback', 'End the workflow and allow normal SillyTavern generation.'],
            ['continue-available', 'Keep successful results and continue branches whose required inputs are available.'],
        ]) {
            select.value = value; select.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
            assert.equal(saved.workflowFailurePolicy, value);
            assert.equal(help.textContent, description);
        }
        assert.equal(saves, 2);
        assert.equal(state.documentSession.capture(), token);
        saved.workflowFailurePolicy = 'stop'; f.env.paintSendbar();
        assert.equal(select.value, 'stop');
        assert.equal(help.textContent, 'Stop the workflow and all generation for this Send.');
        actual('addLauncher', f.env)();
        assert.equal(document.querySelectorAll('#pc-failure-policy').length, 1);
    } finally { globalThis.document = previousDocument; globalThis.CustomEvent = previousCustomEvent; }
});

test('a failed drawer preference save restores the visible choice and reports safe retry guidance', () => {
    const host = installMock({ settings: { workflowFailurePolicy: 'stop' } });
    let rejectSave = false;
    host.saveSettingsDebounced = () => { if (rejectSave) throw new Error('private host save detail'); };
    state.settings(); rejectSave = true;
    const f = fixture(), errors = [];
    f.env.document.body.insertAdjacentHTML('beforeend', '<div id="extensions_settings2"></div>');
    Object.assign(f.env, { settings: state.settings, getWorkflowFailurePolicy: state.getWorkflowFailurePolicy,
        setWorkflowFailurePolicy: state.setWorkflowFailurePolicy, WORKFLOW_FAILURE_OPTIONS: failurePolicy.WORKFLOW_FAILURE_OPTIONS,
        activeWorkflow: state.activeWorkflow });
    const previousDocument = globalThis.document, previousCustomEvent = globalThis.CustomEvent, previousToastr = globalThis.toastr;
    globalThis.document = f.env.document; globalThis.CustomEvent = f.dom.window.CustomEvent;
    globalThis.toastr = { error: (...args) => errors.push(args) };
    try {
        actual('addLauncher', f.env)();
        const select = document.querySelector('#pc-failure-policy');
        select.value = 'continue-available'; select.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
        assert.equal(select.value, 'stop');
        assert.equal(document.querySelector('#pc-failure-policy-hint').textContent, 'Stop the workflow and all generation for this Send.');
        assert.equal(errors.length, 1);
        assert.match(errors[0][0], /could not be saved.*previous choice.*try again/i);
        assert.equal(errors[0][2].escapeHtml, true);
        assert.equal(JSON.stringify(errors).includes('private host save detail'), false);
    } finally { rejectSave = false; globalThis.document = previousDocument; globalThis.CustomEvent = previousCustomEvent; globalThis.toastr = previousToastr; }
});
