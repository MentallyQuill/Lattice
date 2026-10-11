// Public SillyTavern context fixture for current Lattice workflows.
export function installMock({ prompts = [], chat = [], settings = {} } = {}) {
    const legacy = ['graphs', 'activeGraphId', 'nativeBindings', 'workspaceViews'].some(key => Object.hasOwn(settings, key));
    const workflowSettings = legacy
        ? { schema: 1, enabled: false, graphs: {}, activeGraphId: null, nativeBindings: { preGraphId: null, postGraphId: null }, subgraphLibrary: { definitions: {} }, ui: {}, ...settings }
        : { schema: 2, enabled: false, recoveryDraft: null, migrationRecovery: [], subgraphLibrary: { definitions: {} }, ui: {}, ...settings };
    const c = {
        extensionSettings: { lattice: workflowSettings },
        chatMetadata: {},
        chatCompletionSettings: { prompts, prompt_order: [] },
        chat,
        name1: 'User', name2: 'Char',
        maxContext: 32000,
        getCharacterCardFields: () => ({ description: 'desc', personality: '', scenario: '' }),
        getWorldInfoPrompt: async () => ({ worldInfoBefore: '', worldInfoAfter: '' }),
        extensionPrompts: {},
        getChatCompletionModel: () => 'test-model',
        substituteParams: (t) => t,
        getTokenCountAsync: async (t) => Math.ceil(t.length / 4),
        saveSettingsDebounced() {}, saveMetadataDebounced() {}, writeExtensionField() {},
        eventSource: { on() {}, emit() {} }, eventTypes: {},
    };
    globalThis.SillyTavern = { getContext: () => c };
    return c;
}
