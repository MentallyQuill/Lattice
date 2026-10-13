import test from 'node:test';
import assert from 'node:assert/strict';
import { readNodeProfileMetadata, prepareNodeProfileOptions } from '../src/ui/node-profile-preparation.js?v=0.27.2';
test('fixed text-completion metadata detects its host model even when execution evidence is unsupported', () => {
    const context = { mainApi: 'textgenerationwebui', textCompletionSettings: { type: 'infermaticai', infermaticai_model: 'detectable-text-model' }, CONNECT_API_MAP: { infermaticai: { selected: 'textgenerationwebui', type: 'infermaticai', label: 'Infermatic' } } };
    const metadata = readNodeProfileMetadata(context, [{ id: 'text', name: 'Text model', api: 'infermaticai', model: '', 'api-url': 'private-url' }]);
    assert.deepEqual(metadata, [{ id: 'text', name: 'Text model', api: 'infermaticai', apiLabel: 'Infermatic', model: 'detectable-text-model' }]);
    context.textCompletionSettings.type = 'ollama';
    assert.equal(readNodeProfileMetadata(context, [{ id: 'text', api: 'infermaticai' }])[0].model, '', 'A different provider cannot borrow the active model');
});
test('display metadata retains full profile names for wrapped rows and tooltips', () => {
    const name = 'Very long connection name '.repeat(20);
    const context = { CONNECT_API_MAP: {} };
    const metadata = readNodeProfileMetadata(context, [{ id: 'long-name', name, api: 'openai', model: 'model' }]);
    assert.equal(metadata[0].name, name); assert.equal(prepareNodeProfileOptions(metadata)[1].label, name);
});
