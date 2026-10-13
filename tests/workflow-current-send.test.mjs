import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { installMock } from './mock.js';
import * as S from '../src/state.js?v=0.27.3';
import { starterGraph } from '../src/workflow/starters.js?v=0.27.3';
const moduleUrl = source => 'data:text/javascript,' + encodeURIComponent(source);
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '/script.js') return { url: moduleUrl('export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'), shortCircuit: true };
    if (specifier === '/scripts/user.js') return { url: moduleUrl('export const getCurrentUserHandle=()=>"default-user";'), shortCircuit: true };
    return next(specifier, context);
} });
function currentGraph(text) {
    const graph = starterGraph('unified-basic');
    graph.nodes.guide = { id: 'guide', type: 'workflow', operation: 'compose', outputKind: 'guidance', sections: [{ name: 'Direction', text }] };
    graph.wires.guide = { id: 'guide', route: 'wire', from: 'guide', fromPort: 'out', to: 'generate-reply', toPort: 'guidance' };
    return graph;
}

test('production Send follows the current unified document and Enable Lattice', async () => {
    const c = installMock({ chat: [{ mes: 'Continue the scene.', is_user: true }] });
    const listeners = new Map();
    c.eventTypes = { GENERATION_STARTED: 'GENERATION_STARTED' };
    c.eventSource = { on(name, fn) { listeners.set(name, [...listeners.get(name) ?? [], fn]); }, removeListener(name, fn) { listeners.set(name, (listeners.get(name) ?? []).filter(value => value !== fn)); }, async emit(name, ...args) { for (const fn of listeners.get(name) ?? []) await fn(...args); } };
    c.chatId = 'current-file-send'; c.setExtensionPrompt = (key, value) => { c.extensionPrompts[key] = { value }; };
    const facade = await import('../src/run.js?v=0.27.3');
    await facade.initializeNativeWorkflowController();
    const controller = facade.getNativeWorkflowController();
    try {
        S.activateWorkflow(currentGraph('Current first file.')); S.settings().enabled = true;
        await c.eventSource.emit('GENERATION_STARTED', 'normal', {}, false);
        const sent = await controller.beforeGenerate(c.chat, 8192, () => {}, 'normal');
        assert.equal(sent.ok, true, JSON.stringify(sent.error)); assert.equal(sent.skipped, undefined);
        assert.ok(Object.values(c.extensionPrompts).some(prompt => prompt.value.includes('Current first file.')));
        S.activateWorkflow(currentGraph('Current second file.'));
        await c.eventSource.emit('GENERATION_STARTED', 'normal', {}, false);
        assert.equal((await controller.beforeGenerate(c.chat, 8192, () => {}, 'normal')).ok, true);
        assert.ok(Object.values(c.extensionPrompts).some(prompt => prompt.value.includes('Current second file.')));
        assert.ok(Object.values(c.extensionPrompts).every(prompt => !prompt.value.includes('Current first file.')));
        assert.equal(facade.sendWorkflowState().enableLabel, 'Enable Lattice');
        S.settings().enabled = false;
        assert.equal((await controller.beforeGenerate(c.chat, 8192, () => {}, 'normal')).skipped, true);
        assert.ok(Object.values(c.extensionPrompts).every(prompt => !prompt.value));
    } finally { controller.dispose(); hooks.deregister(); }
});
