import assert from 'node:assert/strict';
import test from 'node:test';
import { installMock } from './mock.js';
import * as state from '../src/state.js';

test('missing failure preferences default to native fallback without saving or adding a preference', () => {
    const host = installMock(); let saves = 0;
    host.saveSettingsDebounced = () => saves++;
    assert.equal(typeof state.getWorkflowFailurePolicy, 'function');
    assert.equal(state.getWorkflowFailurePolicy(), 'native-fallback');
    assert.equal(Object.hasOwn(state.settings(), 'workflowFailurePolicy'), false);
    assert.equal(saves, 0);
    delete host.extensionSettings.lattice;
    assert.equal(state.settings().workflowFailurePolicy, 'native-fallback');
    assert.equal(state.getWorkflowFailurePolicy(), 'native-fallback');
});

test('saved failure policy admits exactly the three policies and rejects explicit malformed preferences', () => {
    for (const workflowFailurePolicy of ['native-fallback', 'stop', 'continue-available']) {
        installMock({ settings: { workflowFailurePolicy } });
        assert.equal(state.getWorkflowFailurePolicy(), workflowFailurePolicy);
    }
    for (const workflowFailurePolicy of ['continue', '', 'STOP', true, 1, null, {}, undefined]) {
        installMock({ settings: { workflowFailurePolicy } });
        assert.throws(() => state.settings(), /failure policy/i);
    }
});

test('changing failure policy saves only preferences, emits pc-state and preserves document authority', () => {
    const host = installMock(); let saves = 0, updates = 0;
    host.saveSettingsDebounced = () => saves++; state.settings();
    const token = state.documentSession.capture(), workflow = state.activeWorkflow();
    const recoveryDraft = host.extensionSettings.lattice.recoveryDraft;
    const before = JSON.stringify(workflow);
    const previousDocument = globalThis.document, previousCustomEvent = globalThis.CustomEvent;
    globalThis.document = new EventTarget(); globalThis.CustomEvent = Event;
    document.addEventListener('pc-state', () => updates++);
    try {
        assert.equal(typeof state.setWorkflowFailurePolicy, 'function');
        for (const policy of ['stop', 'continue-available', 'native-fallback']) {
            state.setWorkflowFailurePolicy(policy);
            assert.equal(state.getWorkflowFailurePolicy(), policy);
        }
        assert.equal(saves, 3); assert.equal(updates, 3);
        assert.equal(host.extensionSettings.lattice.recoveryDraft, recoveryDraft);
        assert.equal(state.documentSession.capture(), token);
        assert.equal(JSON.stringify(workflow), before);
        assert.throws(() => state.setWorkflowFailurePolicy('continue'), /failure policy/i);
        assert.equal(saves, 3); assert.equal(updates, 3);
        assert.equal(state.getWorkflowFailurePolicy(), 'native-fallback');
    } finally { globalThis.document = previousDocument; globalThis.CustomEvent = previousCustomEvent; }
});

test('workflow export and import keep the global failure preference outside workflow documents', () => {
    installMock({ settings: { workflowFailurePolicy: 'stop' } });
    const original = state.activeWorkflow(), exported = state.exportGraph();
    assert.equal(exported.includes('workflowFailurePolicy'), false);
    const imported = state.importGraph(exported);
    assert.equal(imported.ok, true, imported.reason);
    state.activateWorkflow(imported.graph);
    assert.equal(state.activeWorkflow(), imported.graph);
    assert.equal(state.getWorkflowFailurePolicy(), 'stop');
    assert.notEqual(state.activeWorkflow(), original);
    assert.equal(state.exportGraph().includes('workflowFailurePolicy'), false);
});

test('a rejected preference save restores its prior presence and value without announcing a state change', () => {
    for (const previous of [undefined, 'stop']) {
        const host = installMock({ settings: previous === undefined ? {} : { workflowFailurePolicy: previous } });
        let rejectSave = false;
        host.saveSettingsDebounced = () => { if (rejectSave) throw new Error('private host failure'); };
        const saved = state.settings(); rejectSave = true;
        let updates = 0;
        const previousDocument = globalThis.document, previousCustomEvent = globalThis.CustomEvent;
        globalThis.document = new EventTarget(); globalThis.CustomEvent = Event;
        document.addEventListener('pc-state', () => updates++);
        try {
            const result = state.setWorkflowFailurePolicy('continue-available');
            assert.equal(result.ok, false);
            assert.equal(Object.hasOwn(saved, 'workflowFailurePolicy'), previous !== undefined);
            assert.equal(saved.workflowFailurePolicy, previous);
            assert.equal(state.getWorkflowFailurePolicy(), previous ?? 'native-fallback');
            assert.equal(updates, 0);
            assert.equal(JSON.stringify(result).includes('private host failure'), false);
        } finally { rejectSave = false; globalThis.document = previousDocument; globalThis.CustomEvent = previousCustomEvent; }
    }
});

test('a thrown save boundary restores the preference and returns a safe actionable failure', () => {
    const host = installMock({ settings: { workflowFailurePolicy: 'stop' } });
    const saved = state.settings(); let reads = 0;
    globalThis.SillyTavern.getContext = () => { if (++reads === 2) throw new Error('secret context details'); return host; };
    try {
        const result = state.setWorkflowFailurePolicy('continue-available');
        assert.equal(result.ok, false);
        assert.equal(saved.workflowFailurePolicy, 'stop');
        assert.match(result.error.message, /could not be saved.*try again/i);
        assert.equal(JSON.stringify(result).includes('secret context details'), false);
    } finally { globalThis.SillyTavern.getContext = () => host; }
});
