import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { installMock } from './mock.js';
import * as S from '../src/state.js?v=0.26.0';
import { starterGraph } from '../src/workflow/starters.js?v=0.26.0';
const moduleUrl = source => 'data:text/javascript,' + encodeURIComponent(source);
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '/script.js') return { url: moduleUrl('export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'), shortCircuit: true };
    if (specifier === '/scripts/user.js') return { url: moduleUrl('export const getCurrentUserHandle=()=>"default-user";'), shortCircuit: true };
    return next(specifier, context);
} });

test('the production Send facade executes current pre guidance and skips current post or disarmed documents', async () => {
    const c = installMock({ chat: [{ mes: 'Continue the scene.', is_user: true }] });
    c.chatId = 'current-file-send'; c.setExtensionPrompt = (key, value) => { c.extensionPrompts[key] = { value }; };
    const facade = await import('../src/run.js?v=0.26.0');
    await facade.initializeNativeWorkflowController();
    const controller = facade.getNativeWorkflowController();
    try {
        const first = starterGraph('structured-guidance');
        S.activateWorkflow(first); S.settings().enabled = true;
        const sent = await controller.beforeGenerate(c.chat, 8192, () => {}, 'normal');
        assert.equal(sent.ok, true, JSON.stringify(sent.error)); assert.equal(sent.skipped, undefined);
        assert.ok(Object.values(c.extensionPrompts).some(prompt => prompt.value.includes('A quiet conversation.')));
        const second = starterGraph('structured-guidance'); second.nodes['compose-json'].sections[0].text = JSON.stringify({ direction: 'Current second file.', constraint: 'Wait for the user.' });
        S.activateWorkflow(second);
        assert.equal((await controller.beforeGenerate(c.chat, 8192, () => {}, 'normal')).ok, true);
        assert.ok(Object.values(c.extensionPrompts).some(prompt => prompt.value.includes('Current second file.')));
        S.activateWorkflow(starterGraph('literal-cleanup'));
        assert.equal((await controller.beforeGenerate(c.chat, 8192, () => {}, 'normal')).skipped, true);
        assert.ok(Object.values(c.extensionPrompts).every(prompt => !prompt.value));
        S.activateWorkflow(first); S.settings().enabled = false;
        assert.equal((await controller.beforeGenerate(c.chat, 8192, () => {}, 'normal')).skipped, true);
    } finally { controller.dispose(); hooks.deregister(); }
});
