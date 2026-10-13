import test from 'node:test';
import assert from 'node:assert/strict';
import { installMock } from './mock.js';
const lifecycle = new EventTarget();
globalThis.addEventListener = lifecycle.addEventListener.bind(lifecycle);
const S = await import('../src/state.js?v=0.27.1');
const { starterGraph } = await import('../src/workflow/starters.js?v=0.27.1');

function setup(save = () => {}) {
    const host = installMock(); host.saveSettingsDebounced = save;
    const owner = S.settings(), graph = starterGraph('unified-basic');
    S.activateWorkflow(graph); return { host, owner, graph };
}

test('owner replacement submits outgoing recovery through its admitted host before replacement', () => {
    const submissions = [];
    let ownerA;
    const first = setup(function () { submissions.push({ host: this, name: ownerA.recoveryDraft.graph.name, current: S.documentSession.current() }); });
    ownerA = first.owner; first.graph.name = 'Outgoing latest';
    const secondHost = installMock(); let replacementSaves = 0;
    secondHost.saveSettingsDebounced = () => replacementSaves++;
    S.settings();
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].host, first.host);
    assert.equal(submissions[0].name, 'Outgoing latest');
    assert.equal(submissions[0].current, first.graph);
    assert.equal(replacementSaves, 0);
});

test('document replacement synchronously submits the outgoing snapshot before activation', () => {
    let activeAtSubmit, recoveredAtSubmit;
    const f = setup(() => { activeAtSubmit = S.documentSession.current(); recoveredAtSubmit = f.owner.recoveryDraft.graph.name; });
    f.graph.name = 'Before replacement';
    S.activateWorkflow(starterGraph('unified-basic'));
    assert.equal(activeAtSubmit, f.graph);
    assert.equal(recoveredAtSubmit, 'Before replacement');
});

test('failed captured host submission returns a failure and retains outgoing work for retry', () => {
    let fail = true, submissions = 0;
    const f = setup(() => { if (fail) throw new Error('host unavailable'); submissions++; });
    f.graph.name = 'Retained outgoing';
    const result = S.save();
    assert.equal(result.ok, false); assert.equal(result.error.code, 'HOST_SAVE');
    const next = installMock(); let wrongHost = 0; next.saveSettingsDebounced = () => wrongHost++;
    S.settings(); fail = false;
    const retry = S.retryPendingRecovery();
    assert.equal(retry.ok, true); assert.equal(submissions, 1); assert.equal(wrongHost, 0);
    assert.equal(f.owner.recoveryDraft.graph.name, 'Retained outgoing');
});

test('a stale flush cannot serialize or save the replacement document', () => {
    let submissions = 0;
    const f = setup(() => submissions++), captured = S.documentSession.capture();
    S.activateWorkflow(starterGraph('unified-basic')); const before = submissions, recovery = f.owner.recoveryDraft;
    const result = S.flushRecovery({ owner: f.owner, captured });
    assert.equal(result.ok, false); assert.equal(result.error.code, 'STALE_RECOVERY');
    assert.equal(submissions, before); assert.equal(f.owner.recoveryDraft, recovery);
});

test('pagehide synchronously finalizes the current recovery and submits its captured host', () => {
    let name;
    const f = setup(() => { name = f.owner.recoveryDraft.graph.name; });
    f.graph.name = 'Pagehide edit'; lifecycle.dispatchEvent(new Event('pagehide'));
    assert.equal(name, 'Pagehide edit'); assert.equal(f.owner.recoveryDraft.graph.name, 'Pagehide edit');
});

test('lifecycle failures are reported independently of the native document checkpoint', () => {
    const errors = []; let fail = true;
    const f = setup(() => { if (fail) throw new Error('host failed'); });
    S.activateWorkflow(f.graph, { clean: true }); const captured = S.documentSession.capture();
    const unsubscribe = S.onRecoveryIssue(error => errors.push(error));
    lifecycle.dispatchEvent(new Event('pagehide'));
    assert.equal(errors.at(-1).code, 'HOST_SAVE');
    assert.equal(S.documentSession.stillCurrent(captured), true);
    assert.equal(S.documentSession.dirty(), false); unsubscribe();
    fail = false; assert.equal(S.retryPendingRecovery().ok, true);
});

test('failed publication retries its detached payload and submits it after the write succeeds', () => {
    const names = []; let owner;
    const f = setup(() => { if (owner) names.push(owner.recoveryDraft.graph.name); }); owner = f.owner;
    let recovery = owner.recoveryDraft, fail = true;
    Object.defineProperty(owner, 'recoveryDraft', { configurable: true, enumerable: true, get: () => recovery, set(value) { if (fail) throw new Error('storage unavailable'); recovery = value; } });
    f.graph.name = 'Failed detached publication';
    const result = S.save(); assert.equal(result.ok, false); assert.equal(result.error.code, 'RECOVERY_WRITE');
    const beforeRetry = names.length; f.graph.name = 'Later raw mutation'; fail = false;
    assert.equal(S.retryPendingRecovery().ok, true);
    assert.equal(names.length, beforeRetry + 1);
    assert.equal(names.at(-1), 'Failed detached publication');
    assert.equal(owner.recoveryDraft.graph.name, 'Failed detached publication');
});

test('same host object owner replacement uses the outgoing admitted callable', () => {
    let outgoing = 0, incoming = 0;
    const f = setup(() => outgoing++), before = outgoing;
    f.graph.name = 'Outgoing on reused host';
    f.host.extensionSettings.lattice = { schema: 2, enabled: false, recoveryDraft: null, migrationRecovery: [], subgraphLibrary: { definitions: {} }, ui: {} };
    f.host.saveSettingsDebounced = () => incoming++;
    S.settings();
    assert.equal(outgoing, before + 1); assert.equal(incoming, 0);
    assert.equal(f.owner.recoveryDraft.graph.name, 'Outgoing on reused host');
});

test('view recovery failure reaches the shared reporting adapter without a caller callback', () => {
    const f = setup(), errors = [];
    const unsubscribe = S.onRecoveryIssue(error => errors.push(error));
    S.setActiveWorkspaceViews({ version: 999, workflowId: f.graph.id, views: [] });
    assert.equal(errors.length, 1); assert.equal(typeof errors[0].code, 'string');
    unsubscribe(); S.setActiveWorkspaceViews(null); S.save();
});

test('pre-admission preference retry retains the callable from its original request', () => {
    const host = installMock(); let fail = true, originalSaves = 0, replacementSaves = 0;
    host.saveSettingsDebounced = () => { if (fail) throw new Error('preferences unavailable'); originalSaves++; };
    assert.equal(S.save({ recovery: false }).ok, false);
    host.saveSettingsDebounced = () => replacementSaves++;
    host.extensionSettings.lattice = { schema: 2, enabled: false, recoveryDraft: null, migrationRecovery: [], subgraphLibrary: { definitions: {} }, ui: {} };
    fail = false; assert.equal(S.retryPendingRecovery().ok, true);
    assert.equal(originalSaves, 1); assert.equal(replacementSaves, 0);
});
