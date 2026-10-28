import assert from 'node:assert/strict';
import test from 'node:test';
import { reasoningOptions, reasoningRequestOverrides } from '../src/workflow/reasoning.js';

test('OpenRouter null supported efforts means every gateway effort is accepted', () => {
    const target = { source: 'openrouter', model: 'future-model', metadata: { reasoning: { supported_efforts: null } } };
    assert.deepEqual(reasoningOptions(target).options.map(option => option.value), ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'custom']);
    assert.equal(reasoningRequestOverrides(target, { reasoningEffort: 'xhigh' }).data.reasoning_effort, 'xhigh');
});

test('GLM 5.2 gateway choices preserve native effort names within NanoGPT adapter limits', () => {
    assert.deepEqual(reasoningOptions({source:'openrouter',model:'z-ai/glm-5.2'}).options.map(option=>option.value), ['none','high','max','custom']);
    const target={source:'nanogpt',model:'z-ai/glm-5.2:thinking'};
    assert.deepEqual(reasoningOptions(target).options.map(option=>option.value), ['none','high','custom']);
    assert.equal(reasoningRequestOverrides(target).data.reasoning_effort,'max', 'host max translates to native high on the mandatory thinking variant');
});

test('unknown providers offer an explicit custom value and default safely without an upstream effort', () => {
    assert.deepEqual(reasoningOptions({ api: 'openai', source: 'unknown' }).options.map(option => option.value), ['none', 'custom']);
    assert.deepEqual(reasoningRequestOverrides({ api: 'openai', source: 'unknown' }), {
        ok: true, data: { include_reasoning: false, reasoning_effort: '' },
    });
});

test('custom gateway help follows authoritative supplied model reasoning metadata', () => {
    const target = { source: 'custom', endpoint: 'https://openrouter.ai/api/v1', model: 'unknown', metadata: { reasoning: { mandatory: true, supported_efforts: ['medium', 'high'] } } };
    assert.equal(JSON.parse(reasoningRequestOverrides(target).data.custom_include_body).reasoning.effort, 'medium');
    assert.match(reasoningOptions(target).help, /always reasons.*medium/i);
    assert.doesNotMatch(reasoningOptions({ ...target, model: 'openai/gpt-6-astra', metadata: { reasoning: { mandatory: false, supported_efforts: ['none', 'high'] } } }).help, /always reasons/i);
});

test('newer mandatory Gemini models use their known floor even when the native host adapter predates them', () => {
    for (const [model, levels] of [['gemini-3.8-flash', ['low', 'medium', 'high']], ['gemini-4-flash', ['low', 'medium', 'high']]]) {
        for (const source of ['openrouter', 'custom']) {
            const target = { source, model: `google/${model}` };
            assert.deepEqual(reasoningOptions(target).options.map(option => option.value).filter(value => !['none', 'custom', 'adaptive'].includes(value)), levels);
            const data = reasoningRequestOverrides(target).data;
            assert.equal(source === 'openrouter' ? data.reasoning_effort : JSON.parse(data.custom_include_body).reasoning_effort, 'low');
        }
    }
    assert.equal(reasoningRequestOverrides({ source: 'makersuite', model: 'gemini-3.8-flash' }).data.reasoning_effort, 'low');
    assert.deepEqual(reasoningOptions({ source: 'makersuite', model: 'gemini-4-flash' }).options.map(option => option.value), ['none', 'custom']);
});

test('known mandatory models on custom endpoints receive their minimum effort for None with an explicit explanation', () => {
    for (const [model, native] of [['gemini-3-flash-preview', 'minimal'], ['gemini-3.1-pro-preview', 'low'], ['claude-opus-4-7', 'low'], ['gpt-6.1-sol', 'low']]) {
        const target = { api: 'openai', source: 'custom', model };
        assert.equal(JSON.parse(reasoningRequestOverrides(target).data.custom_include_body).reasoning_effort, native, model);
        assert.match(reasoningOptions(target).help, /always reasons|mandatory/i, model);
    }
    const zai = { source: 'custom', model: 'glm-5.3' };
    assert.deepEqual(JSON.parse(reasoningRequestOverrides(zai).data.custom_include_body), { thinking: { type: 'enabled' }, reasoning_effort: 'low' });
    assert.match(reasoningOptions(zai).help, /always reasons.*low/i);
});

test('native adapter omissions are visible and do not silently accept reasoning controls', () => {
    for (const target of [
        { source: 'makersuite', model: 'gemini-2.5-flash-image-preview' },
        { source: 'openai', model: 'gpt-6.1-sol' },
    ]) {
        assert.deepEqual(reasoningOptions(target).options.map(option => option.value), ['none', 'custom']);
        assert.match(reasoningOptions(target).help, /adapter/i);
        assert.equal(reasoningRequestOverrides(target).ok, true);
        assert.equal(reasoningRequestOverrides(target, { reasoningEffort: 'high' }).error?.code, 'REASONING_UNSUPPORTED');
    }
    assert.match(reasoningOptions({ source: 'openai', model: 'gpt-6.1-sol' }).help, /always reasons|cannot.*disable/i);
    const customGroq = { source: 'custom', endpoint: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' };
    assert.ok(reasoningOptions(customGroq).options.some(option => option.value === 'medium'));
});

test('custom effort values are rejected when a native adapter would rewrite their spelling or meaning', () => {
    for (const source of ['openai', 'azure_openai']) {
        assert.equal(reasoningRequestOverrides({ source, model: 'gpt-5.1' }, { reasoningEffort: 'custom', reasoningCustom: 'min' }).error?.code, 'REASONING_UNSUPPORTED');
        assert.equal(reasoningRequestOverrides({ source, model: 'gpt-5' }, { reasoningEffort: 'custom', reasoningCustom: 'none' }).error?.code, 'REASONING_UNSUPPORTED');
    }
    assert.deepEqual(reasoningRequestOverrides({ source: 'deepseek', model: 'deepseek-v4-flash' }, { reasoningEffort: 'custom', reasoningCustom: 'enabled' }), { ok: true, data: { include_reasoning: true, reasoning_effort: 'enabled' } });
    assert.equal(reasoningRequestOverrides({ source: 'zai', model: 'glm-5.3' }, { reasoningEffort: 'custom', reasoningCustom: 'disabled' }).error?.code, 'REASONING_UNSUPPORTED');
});

test('xAI and Groq expose only effort values the installed adapter can preserve', () => {
    const xai = { source: 'xai', model: 'grok-4.6' };
    assert.deepEqual(reasoningOptions(xai).options.map(option => option.value), ['none', 'low', 'high', 'custom']);
    assert.equal(reasoningRequestOverrides(xai).data?.reasoning_effort, 'low');
    assert.equal(reasoningRequestOverrides(xai, { reasoningEffort: 'custom', reasoningCustom: 'medium' }).error?.code, 'REASONING_UNSUPPORTED');
    const groq = { source: 'groq', model: 'openai/gpt-oss-120b' };
    assert.deepEqual(reasoningOptions(groq).options.map(option => option.value), ['none', 'custom']);
    assert.equal(reasoningRequestOverrides(groq, { reasoningEffort: 'high' }).error?.code, 'REASONING_UNSUPPORTED');
    assert.match(reasoningOptions(groq).help, /adapter.*effort/i);
    const custom = { ...groq, source: 'custom', endpoint: 'https://api.groq.com/openai/v1' };
    assert.equal(JSON.parse(reasoningRequestOverrides(custom).data.custom_include_body).reasoning_effort, 'low');
    assert.equal(JSON.parse(reasoningRequestOverrides(custom, { reasoningEffort: 'medium' }).data.custom_include_body).reasoning_effort, 'medium');
});

test('Gemini native levels account for mandatory models and the installed budget adapter', () => {
    for (const source of ['makersuite', 'vertexai']) {
        for (const [model, options, none] of [
            ['gemini-3-flash-preview', ['none', 'minimal', 'low', 'medium', 'high', 'adaptive', 'custom'], 'min'],
            ['gemini-3.7-flash', ['none', 'low', 'medium', 'high', 'adaptive', 'custom'], 'low'],
            ['gemini-3.1-pro-preview', ['none', 'low', 'high', 'adaptive', 'custom'], 'low'],
            ['gemini-2.5-flash', ['none', 'enabled', 'adaptive', 'low', 'medium', 'high', 'max', 'custom'], 'min'],
        ]) {
            const target = { api: 'openai', source, model };
            assert.deepEqual(reasoningOptions(target).options.map(option => option.value), options, model);
            assert.deepEqual(reasoningRequestOverrides(target), { ok: true, data: { include_reasoning: false, reasoning_effort: none } }, model);
        }
    }
    assert.equal(reasoningRequestOverrides({ source: 'makersuite', model: 'gemini-3-flash' }, { reasoningEffort: 'minimal' }).data?.reasoning_effort, 'min');
    assert.equal(reasoningRequestOverrides({ source: 'makersuite', model: 'gemini-3-flash' }, { reasoningEffort: 'custom', reasoningCustom: '8192' }).error?.code, 'REASONING_UNSUPPORTED');
    assert.match(reasoningOptions({ source: 'makersuite', model: 'gemini-2.5-pro' }).help, /128/);
    assert.match(reasoningOptions({ source: 'makersuite', model: 'gemini-2.5-flash-lite' }).help, /512/);
});

test('custom chat endpoints preserve arbitrary reasoning strings as request body data', () => {
    const target = { api: 'openai', source: 'custom', model: 'provider-model' };
    const result = reasoningRequestOverrides(target, { reasoningEffort: 'custom', reasoningCustom: '3210' });
    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(result.data.custom_include_body), { reasoning_effort: '3210' });
    assert.equal(result.data.reasoning_effort, '');
    assert.deepEqual(reasoningOptions(target).options.map(option => option.value), ['none', 'custom']);
    assert.deepEqual(reasoningRequestOverrides(target), { ok: true, data: { include_reasoning: false, reasoning_effort: '', custom_include_body: '' } });
});

test('custom endpoint detection uses safe known hosts or known model families and preserves native values', () => {
    const nano = { api: 'openai', source: 'custom', model: 'openai/gpt-5.6-sol', endpoint: 'https://nano-gpt.com/api/v1' };
    assert.ok(reasoningOptions(nano).options.some(option => option.value === 'xhigh'));
    assert.deepEqual(JSON.parse(reasoningRequestOverrides(nano, { reasoningEffort: 'custom', reasoningCustom: 'max' }).data.custom_include_body), { reasoning: { effort: 'max' } });
    const openai = { api: 'openai', source: 'custom', model: 'gpt-6.1-sol' };
    assert.deepEqual(JSON.parse(reasoningRequestOverrides(openai).data.custom_include_body), { reasoning_effort: 'low' });
    assert.ok(reasoningOptions(openai).options.some(option => option.value === 'max'));
    for (const endpoint of ['https://nano-gpt.com.evil.test/api', 'https://user:secret@nano-gpt.com/api', 'https://nano-gpt.com/api?key=private', 'file:///nano-gpt.com/api']) {
        assert.deepEqual(reasoningOptions({ source: 'custom', model: 'unknown', endpoint }).options.map(option => option.value), ['none', 'custom']);
    }
});

test('Claude disables optional thinking through auto and explicitly enables budget or adaptive thinking', () => {
    const optional = { api: 'openai', source: 'claude', model: 'claude-sonnet-4-6' };
    assert.ok(reasoningOptions(optional).options.some(option => option.value === 'enabled'));
    assert.deepEqual(reasoningRequestOverrides(optional), { ok: true, data: { include_reasoning: false, reasoning_effort: 'auto' } });
    assert.deepEqual(reasoningRequestOverrides(optional, { reasoningEffort: 'enabled' }), { ok: true, data: { include_reasoning: true, reasoning_effort: 'min' } });
    assert.equal(reasoningRequestOverrides(optional, { reasoningEffort: 'custom', reasoningCustom: '8192' }).error?.code, 'REASONING_UNSUPPORTED');
    const adaptive = { source: 'claude', model: 'claude-opus-4-7' };
    assert.deepEqual(reasoningRequestOverrides(adaptive), { ok: true, data: { include_reasoning: false, reasoning_effort: 'low' } });
    assert.deepEqual(reasoningRequestOverrides(adaptive, { reasoningEffort: 'adaptive' }), { ok: true, data: { include_reasoning: true, reasoning_effort: 'high' } });
    assert.deepEqual(reasoningRequestOverrides(adaptive, { reasoningEffort: 'custom', reasoningCustom: 'max' }), { ok: true, data: { include_reasoning: true, reasoning_effort: 'max' } });
});

test('DeepSeek models expose their native supported levels or their legacy thinking switch', () => {
    const current = { source: 'deepseek', model: 'deepseek-v4-flash' };
    assert.deepEqual(reasoningOptions(current).options.map(option => option.value), ['none', 'low', 'high', 'max', 'enabled', 'custom']);
    assert.deepEqual(reasoningRequestOverrides(current, { reasoningEffort: 'high' }), { ok: true, data: { include_reasoning: true, reasoning_effort: 'high' } });
    assert.deepEqual(reasoningRequestOverrides(current, { reasoningEffort: 'custom', reasoningCustom: 'future-high' }), { ok: true, data: { include_reasoning: true, reasoning_effort: 'future-high' } });
    assert.deepEqual(reasoningRequestOverrides(current), { ok: true, data: { include_reasoning: false, reasoning_effort: '' } });
    assert.deepEqual(reasoningOptions({ source: 'deepseek', model: 'deepseek-chat' }).options.map(option => option.value), ['none', 'enabled', 'custom']);
    assert.equal(reasoningRequestOverrides({ source: 'deepseek', model: 'deepseek-reasoner' }).data?.include_reasoning, true);
});

test('Z.ai and Moonshot expose the installed thinking toggle without pretending to forward effort strings', () => {
    for (const [source, model] of [['zai', 'glm-4.7'], ['moonshot', 'kimi-k2.5']]) {
        const target = { api: 'openai', source, model };
        assert.deepEqual(reasoningOptions(target).options.map(option => option.value), ['none', 'enabled', 'custom']);
        assert.deepEqual(reasoningRequestOverrides(target), { ok: true, data: { include_reasoning: false, reasoning_effort: '' } });
        assert.deepEqual(reasoningRequestOverrides(target, { reasoningEffort: 'enabled' }), { ok: true, data: { include_reasoning: true, reasoning_effort: '' } });
        assert.equal(reasoningRequestOverrides(target, { reasoningEffort: 'custom', reasoningCustom: 'high' }).error?.code, 'REASONING_UNSUPPORTED');
    }
    const mandatory = { source: 'zai', model: 'glm-5.3' };
    assert.equal(reasoningRequestOverrides(mandatory).data?.include_reasoning, true);
    assert.match(reasoningOptions(mandatory).help, /always reasons|cannot.*disable/i);
});

test('OpenAI and Azure use model-specific efforts and a mandatory model accepts None as its minimum', () => {
    const fixtures = [
        ['gpt-5', ['none', 'minimal', 'low', 'medium', 'high', 'custom'], 'minimal'],
        ['gpt-5.1', ['none', 'low', 'medium', 'high', 'custom'], 'none'],
        ['o3-mini', ['none', 'low', 'medium', 'high', 'custom'], 'low'],
        ['gpt-5.3-chat-latest', ['none', 'medium', 'custom'], 'medium'],
        ['gpt-6-astra', ['none', 'low', 'medium', 'high', 'xhigh', 'max', 'custom'], 'low'],
    ];
    for (const source of ['openai', 'azure_openai']) for (const [model, options, lowest] of fixtures) {
        const target = { api: 'openai', source, model };
        assert.deepEqual(reasoningOptions(target).options.map(option => option.value), options, model);
        assert.deepEqual(reasoningRequestOverrides(target), { ok: true, data: { include_reasoning: false, reasoning_effort: lowest } }, model);
    }
    assert.match(reasoningOptions({ source: 'openai', model: 'gpt-5' }).help, /always reasons|cannot.*disable/i);
});

test('NanoGPT native levels survive the installed inverse adapter mapping', () => {
    const target = { api: 'nanogpt', model: 'vendor/model', metadata: { reasoning: { mandatory: false, supported_efforts: ['none', 'minimal', 'low', 'medium', 'high'] } } };
    for (const [native, host] of [['none', 'min'], ['minimal', 'low'], ['low', 'medium'], ['medium', 'high'], ['high', 'max']]) {
        assert.deepEqual(reasoningRequestOverrides(target, { reasoningEffort: native }), { ok: true, data: { include_reasoning: native !== 'none', reasoning_effort: host } });
    }
    assert.deepEqual(reasoningOptions(target).options.map(option => option.value), ['none', 'minimal', 'low', 'medium', 'high', 'custom']);
    assert.match(reasoningOptions(target).help, /xhigh.*max|five/i);
    for (const value of ['xhigh', 'max', 'future']) assert.equal(reasoningRequestOverrides(target, { reasoningEffort: 'custom', reasoningCustom: value }).error?.code, 'REASONING_UNSUPPORTED');
    assert.equal(reasoningRequestOverrides(target, { reasoningEffort: 'custom', reasoningCustom: 'high' }).data?.reasoning_effort, 'max');
});

test('OpenRouter metadata restricts choices and mandatory reasoning uses the lowest supported effort for None', () => {
    const target = { source: 'openrouter', model: 'vendor/reasoner', metadata: { reasoning: { supported_efforts: ['medium', 'high'], mandatory: true } } };
    assert.deepEqual(reasoningOptions(target).options.map(option => option.value), ['none', 'medium', 'high', 'custom']);
    assert.match(reasoningOptions(target).help, /always reasons|mandatory/i);
    assert.deepEqual(reasoningRequestOverrides(target), { ok: true, data: { include_reasoning: false, reasoning_effort: 'medium' } });
    assert.equal(reasoningRequestOverrides(target, { reasoningEffort: 'low' }).error?.code, 'REASONING_UNSUPPORTED');
});

test('OpenRouter forwards a custom effort byte for byte and exposes gateway effort levels', () => {
    const target = { api: 'openai', source: 'openrouter', model: 'new/provider-model' };
    assert.deepEqual(reasoningRequestOverrides(target, { reasoningEffort: 'custom', reasoningCustom: 'Future Level ' }), {
        ok: true, data: { include_reasoning: true, reasoning_effort: 'Future Level ' },
    });
    assert.deepEqual(reasoningRequestOverrides(target), { ok: true, data: { include_reasoning: false, reasoning_effort: 'none' } });
    assert.deepEqual(reasoningOptions(target).options.map(option => option.value), ['none', 'custom']);
});

test('gateway model inference avoids requesting disabled reasoning from mandatory models without discovery metadata', () => {
    for (const [model, native] of [
        ['openai/gpt-6-astra', 'low'], ['openai/gpt-6.1-sol', 'low'], ['google/gemini-3-pro-preview', 'low'],
        ['google/gemini-2.5-pro', 'low'], ['z-ai/glm-5.3', 'low'], ['deepseek/deepseek-r1', ''], ['openai/o3-mini', 'low'],
    ]) {
        const router = { source: 'openrouter', model };
        assert.equal(reasoningRequestOverrides(router).data?.reasoning_effort, native, model);
        assert.match(reasoningOptions(router).help, /always reasons|mandatory/i, model);
        const nano = { source: 'nanogpt', model };
        assert.equal(reasoningRequestOverrides(nano).data?.reasoning_effort, native === 'low' ? 'medium' : '', model);
    }
    assert.deepEqual(reasoningOptions({ source: 'nanogpt', model: 'unknown-model' }).options.map(option => option.value), ['none', 'custom']);
    const override = { source: 'openrouter', model: 'openai/gpt-6-astra', metadata: { reasoning: { mandatory: false, supported_efforts: ['none', 'high'] } } };
    assert.equal(reasoningRequestOverrides(override).data?.reasoning_effort, 'none');
});

test('custom effort validation rejects missing, blank, oversized, or non-string values', () => {
    for (const reasoningCustom of [undefined, '', '   ', 'x'.repeat(129), 123]) {
        assert.equal(reasoningRequestOverrides({ source: 'openrouter' }, { reasoningEffort: 'custom', reasoningCustom }).error?.code, 'INVALID_REASONING_CUSTOM');
    }
    assert.equal(reasoningRequestOverrides({ source: 'unknown' }, { reasoningEffort: 'future-level' }).error?.code, 'REASONING_UNSUPPORTED');
});

test('text completion routes receive no reasoning fields and reject enabled controls', () => {
    const target = { api: 'textgenerationwebui', source: 'openrouter', model: 'openai/gpt-5' };
    assert.deepEqual(reasoningRequestOverrides(target), { ok: true, data: {} });
    assert.equal(reasoningRequestOverrides(target, { reasoningEffort: 'high' }).error?.code, 'REASONING_UNSUPPORTED');
    assert.deepEqual(reasoningOptions(target).options.map(option => option.value), ['none', 'custom']);
});
