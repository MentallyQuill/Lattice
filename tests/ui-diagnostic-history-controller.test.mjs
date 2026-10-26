import assert from 'node:assert/strict';
import { test } from 'node:test';
const module = await import('../src/ui/diagnostic-history-controller.js').catch(() => ({}));
const scope = chatId => ({ userId: 'user', chatId, characterId: 1, groupId: null });

test('late history reads cannot populate a replacement chat', async () => {
    assert.equal(typeof module.createDiagnosticHistoryController, 'function');
    let current = scope('first');
    const pending = [];
    const controller = module.createDiagnosticHistoryController({
        scope: () => current, enabled: () => false, changed() {},
        history: { subscribe: () => () => {}, list: () => new Promise(resolve => pending.push(resolve)) },
    });
    const first = controller.refresh();
    current = scope('second');
    const second = controller.refresh();
    pending[1]({ ok: true, data: { entries: [{ id: 'second-run' }] } }); await second;
    pending[0]({ ok: true, data: { entries: [{ id: 'first-run' }] } }); await first;
    assert.deepEqual(controller.snapshot().entries.map(entry => entry.id), ['second-run']);
    assert.equal(controller.snapshot().selectedId, null);
});

test('successful history reads retain a visible diagnostic write failure', async () => {
    const controller = module.createDiagnosticHistoryController({
        scope: () => scope('chat'), enabled: () => true, changed() {},
        history: { list: async () => ({ ok: true, data: { entries: [] } }), status: () => ({ persistent: false, issue: 'Diagnostic logs could not be saved: storage quota.' }) },
    });
    await controller.refresh();
    assert.match(controller.snapshot().issue, /could not be saved/);
});

test('history selection and the logging toggle remain separate from live run authority', async () => {
    let enabled = false, notifications = 0;
    const controller = module.createDiagnosticHistoryController({
        scope: () => scope('chat'), enabled: () => enabled, setEnabled: value => { enabled = value; }, changed: () => notifications++,
        history: { subscribe: () => () => {}, list: async () => ({ ok: true, data: { entries: [{ id: 'saved' }] } }) },
    });
    await controller.refresh();
    controller.actions.select('saved');
    assert.equal(controller.snapshot().selectedId, 'saved');
    controller.actions.select('foreign');
    assert.equal(controller.snapshot().selectedId, 'saved');
    await controller.actions.setEnabled(true);
    assert.equal(controller.snapshot().enabled, true);
    assert.equal(controller.snapshot().selectedId, 'saved');
    assert.ok(notifications > 0);
});

test('exports recheck user/chat after asynchronous storage and reject stale clear actions', async () => {
    let current = scope('first'), finish, clears = 0, downloads = 0;
    const controller = module.createDiagnosticHistoryController({
        scope: () => current, enabled: () => true, changed() {}, download: () => downloads++,
        history: { list: async () => ({ ok: true, data: { entries: [] } }), export: () => new Promise(resolve => finish = resolve), clear: async () => { clears++; return { ok: true }; } },
    });
    await controller.refresh();
    const capturedKey = controller.snapshot().scopeKey;
    const exporting = controller.actions.export(capturedKey);
    current = scope('second');
    finish({ ok: true, data: { text: '{}', fileName: 'logs.json' } }); await exporting;
    await controller.actions.clear(capturedKey);
    assert.equal(downloads, 0);
    assert.equal(clears, 0);
    assert.deepEqual(controller.snapshot().entries, []);
});
