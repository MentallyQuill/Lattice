import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInstalledHostBoundary, productionModules } from '../tools/smoke-unified-host.mjs';

test('installed host smoke accepts only a plain loopback origin', () => {
    for (const host of ['https://127.0.0.1:8000', 'http://localhost:8000', 'http://127.0.0.1:8000/story', 'http://127.0.0.1:8000/?token=value', 'http://user:secret@127.0.0.1:8000']) assert.throws(() => createInstalledHostBoundary(host));
    assert.equal(createInstalledHostBoundary().allow('http://127.0.0.1:8000/script.js', 'GET'), true);
});
test('installed host smoke refuses every backend, persistence write and external request', () => {
    const boundary = createInstalledHostBoundary();
    const local = path => 'http://127.0.0.1:8000' + path;
    for (const path of ['/api/backends/chat-completions/generate', '/api/backends/text-completions/generate', '/api/openai/generate', '/api/novelai/generate']) {
        assert.equal(boundary.allow(local(path), 'POST'), false);
        assert.equal(boundary.allow(local(path), 'GET'), false);
    }
    for (const path of ['/api/chats/save', '/api/settings/save', '/api/secrets/write', '/api/users/login', '/anything']) assert.equal(boundary.allow(local(path), 'POST'), false);
    for (const url of ['https://api.example.test/generate', 'http://127.0.0.1:8001/script.js', 'http://user:secret@127.0.0.1:8000/script.js']) assert.equal(boundary.allow(url, 'GET'), false);
    assert.deepEqual(boundary.counts(), { modelBlocked: 8, writeBlocked: 5, externalBlocked: 3, otherBlocked: 0, permittedReads: 0 });
});
test('installed host smoke permits necessary host reads and excludes real story sources', () => {
    const boundary = createInstalledHostBoundary();
    assert.equal(boundary.allow('http://127.0.0.1:8000/api/users/me', 'GET'), true);
    assert.equal(boundary.allow('http://127.0.0.1:8000/api/settings/get', 'POST'), true);
    for (const path of ['/api/chats/get', '/api/secrets/read', '/api/settings/get?token=value', '/chats/Story-2.json', '/characters/Mara.png', '/worlds/world.json', '/proxy/api']) assert.equal(boundary.allow('http://127.0.0.1:8000' + path, path.includes('settings') ? 'POST' : 'GET'), false);
});
test('served production modules are limited to the verified dependency closure', async () => {
    const modules = await productionModules();
    assert.ok(modules.size > 1 && modules.size < 200);
    assert.match(modules.get('http://127.0.0.1:8000/__lattice-unified-host-test/src/workflow/host.js?v=0.27.0'), /export function createNativeWorkflowController/);
    assert.match(modules.get('http://127.0.0.1:8000/__lattice-unified-host-test/src/random-id.js'), /export function randomUuid/);
    for (const path of ['src/random-id-other.js', 'src/random-id.js?secret=value', 'src/state.js', 'tools/smoke-unified-host.mjs', 'src/workflow/not-real.js', 'src/workflow/host.js?secret=value', 'src/workflow/host.js#fragment', '../script.js', 'src/workflow/%68ost.js']) assert.throws(() => modules.get('http://127.0.0.1:8000/__lattice-unified-host-test/' + path));
});
