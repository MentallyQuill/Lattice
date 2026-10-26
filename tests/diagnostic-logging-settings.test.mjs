import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installMock } from './mock.js';
import { settings } from '../src/state.js';
import * as runtime from '../src/run.js';

test('existing settings default diagnostic logging off and preserve a saved opt-in', () => {
    installMock();
    assert.equal(runtime.workflowDiagnosticLoggingEnabled(), false);
    assert.equal(Object.hasOwn(settings(), 'diagnosticLogging'), false, 'default-off reads must not migrate or save existing settings');
    const c = installMock({ settings: { diagnosticLogging: true } });
    assert.equal(settings().diagnosticLogging, true);
    assert.equal(c.extensionSettings.lattice.diagnosticLogging, true);
    assert.equal(c.extensionSettings.lattice.enabled, false);
});

test('the opt-in control saves a boolean preference without serializing diagnostic history', () => {
    let saves = 0;
    const c = installMock(); c.saveSettingsDebounced = () => saves++;
    assert.equal(typeof runtime.setWorkflowDiagnosticLogging, 'function');
    runtime.setWorkflowDiagnosticLogging(true);
    assert.equal(settings().diagnosticLogging, true);
    runtime.setWorkflowDiagnosticLogging(false);
    assert.equal(settings().diagnosticLogging, false);
    assert.ok(saves >= 2);
    assert.equal(Object.hasOwn(settings(), 'diagnosticHistory'), false);
    assert.throws(() => runtime.setWorkflowDiagnosticLogging('true'), /boolean/);
});

test('diagnostic logging settings reject non-boolean saved values', () => {
    for (const diagnosticLogging of ['true', 1, null, {}, undefined]) {
        installMock({ settings: { diagnosticLogging } });
        assert.throws(() => settings(), /diagnostic logging/i);
    }
});
