import { isScopedSystemOperation } from '../workflow/system-capabilities.js?v=0.27.1';
import { deferredNodeDescription, nodeNeedsConfiguration } from './configured-node-creation.js?v=0.27.1';
import { ARTIFACT_KINDS, FAMILIES, OPERATIONS, describeOperation, operationDefaults } from '../workflow/catalog.js?v=0.27.1';
import { cloneDefinitionData, definitionRefKey } from '../workflow/definitions.js?v=0.27.1';
import { selectSubgraphClosure } from '../workflow/packages.js?v=0.27.1';

const registries = new WeakMap();
const choiceViews = new WeakMap();
const choiceVariants = new WeakMap();
const fail = message => ({ ok: false, error: { code: 'INVALID_SEARCH_CATALOG', message } });
const text = value => typeof value === 'string' && value.length > 0;
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
const presets = [
    ['text-rules', 'draft', 'Text Rules · Draft', { inputKind: 'draft', mode: 'replace', scope: 'whole' }],
    ['json-decode', 'check', 'JSON Decode · Check', { mode: 'check' }],
    ['compose', 'input', 'Compose · Input', { sections: [{ name: 'Input', text: '' }] }],
    ['compose', 'guidance', 'Compose · Guidance', { outputKind: 'guidance' }],
    ['style-transfer', 'character-voice', 'Style Transfer · Character Voice', { mode: 'character-voice', scope: 'dialogue' }],
    ['style-transfer', 'rhythm', 'Style Transfer · Rhythm', { mode: 'rhythm', scope: 'narration' }],
    ['style-transfer', 'register', 'Style Transfer · Register', { mode: 'register', scope: 'narration' }],
    ['format-transfer', 'data', 'Format Transfer · Data Template', { referenceKind: 'data' }],
    ['repair', 'inspect', 'Repair · Slop Inspect', { mode: 'inspect', scope: 'narration' }],
    ['repair', 'contextual', 'Repair · Contextual Cleanup', { mode: 'contextual', scope: 'narration' }],
    ['repair', 'strict', 'Repair · Strict Avoidance', { mode: 'strict', scope: 'narration' }],
    ['reflect', 'recall', 'Reflect · Recall', { mode: 'recall' }],
    ['reflect', 'scene', 'Reflect · Scene', { mode: 'scene' }],
    ['internalize', 'pattern', 'Internalize · Pattern', { mode: 'pattern' }],
    ['internalize', 'recovery', 'Internalize · Recovery', { mode: 'recovery' }],
    ['express', 'attention', 'Express · Attention', { mode: 'attention' }],
    ['express', 'inner-voice', 'Express · Inner Voice', { mode: 'inner-voice' }],
    ['context', 'perspective', 'Context · Perspective', { mode: 'perspective' }],
    ['context', 'focus', 'Context · Focus', { mode: 'focus' }],
    ['memory', 'recall', 'Memory · Recall', { mode: 'recall' }],
    ['memory', 'commit', 'Memory · Commit', { mode: 'commit' }],
    ['state', 'curve', 'State · Curve', { mode: 'curve' }],
    ['state', 'track', 'State · Track', { mode: 'track' }],
];
const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
};
const portProjection = port => ({ portId: port.id, dir: port.direction === 'input' ? 'in' : 'out', kind: port.kind, label: port.label, required: port.required });
const validOrigin = origin => record(origin) && ['in', 'out'].includes(origin.dir) && ARTIFACT_KINDS.includes(origin.kind);
const matchingPorts = (choice, origin) => choice?.ports.filter(port => port.dir !== origin.dir && port.kind === origin.kind) ?? [];
// Static discovery metadata, separate from placed-node aliases and saved operation controls.
// Existing shortcodes follow the approved shelf; new tools use the same quiet mnemonic convention.
const searchMetadata = cloneDefinitionData({
    text: { purpose: 'Supply editable literal text without a model call.', shortcode: 'tx', searchAliases: ['raw text', 'literal', 'constant', 'custom prompt'] },
    'file-input': { purpose: 'Read an imported text file snapshot saved with the workflow.', shortcode: 'fi', searchAliases: ['file', 'json file', 'load file', 'import text', 'markdown'] },
    'prompt-source': { purpose: 'Read a configured host system prompt or selected prompt entry.', shortcode: 'pr', searchAliases: ['active system prompt', 'host prompt', 'prompt manager', 'prompt block'] },
    'scene-context': { purpose: 'Capture recent messages and character information.', shortcode: 'sc', searchAliases: ['scene-context', 'chat history'] },
    'reply-snapshot': { purpose: 'Capture the assistant response before cleanup.', shortcode: 'rs', searchAliases: ['reply-snapshot', 'original reply'] },
    'smart-compactor': { purpose: 'Reduce token usage while preserving protected facts.', shortcode: 'cp', searchAliases: ['smart-compactor', 'compaction'] },
    'response-plan': { purpose: 'Plan the next response with user agency and scene continuity.', shortcode: 'rp', searchAliases: ['response-plan', 'planner'] },
    'filter-text': { purpose: 'Remove or keep matching lines or paragraphs using a fresh Pattern report and Draft permissions.', shortcode: 'ft', searchAliases: ['filter text', 'remove paragraph', 'keep matches', 'delete line'] },
    pattern: { purpose: 'Detect patterns and count occurrences to route a Draft.', shortcode: 'ps', searchAliases: ['pattern', 'literal search', 'whole word', 'regex', 'keyword'] },
    repair: { purpose: 'Revise prose into guarded patches.', shortcode: 'rr', searchAliases: ['prose repair', 'cleanup'] },
    'validate-patches': { purpose: 'Check patch candidates and protected literals.', shortcode: 'vp', searchAliases: ['validate-patches', 'patch validation'] },
    guidance: { purpose: 'Publish a bounded host instruction.', shortcode: 'gd', searchAliases: ['prompt guidance'] },
    'review-gate': { purpose: 'Approve a candidate before delivery.', shortcode: 'rg', searchAliases: ['review-gate', 'approval'] },
    'apply-reply': { purpose: 'Replace the accepted host response.', shortcode: 'ar', searchAliases: ['apply-reply', 'delivery'] },
    'context-join': { purpose: 'Merge structured contexts through named slots.', shortcode: 'cj', searchAliases: ['context-join', 'combine context'] },
    reroute: { purpose: 'Route one typed artifact through a compact junction.', shortcode: 'rt', searchAliases: ['typed routing'] },
    compose: { purpose: 'Format text from data and named sections.', shortcode: 'co', searchAliases: ['text assembly'] },
    'text-rules': { purpose: 'Replace or extract literal text matches.', shortcode: 'tr', searchAliases: ['text-rules', 'text replacement'] },
    'json-decode': { purpose: 'Decode JSON text or check structured values.', shortcode: 'jd', searchAliases: ['json-decode', 'JSON parser'] },
    'select-fields': { purpose: 'Project selected paths from structured data.', shortcode: 'sf', searchAliases: ['select-fields', 'field projection'] },
    'style-transfer': { purpose: 'Apply reference voice, rhythm or diction to permitted draft text.', shortcode: 'st', searchAliases: ['style-transfer', 'character voice', 'recast'] },
    'format-transfer': { purpose: 'Reorganize permitted draft text using an example or template.', shortcode: 'ft', searchAliases: ['format-transfer', 'screenplay', 'recap template'] },
    'terminology-map': { purpose: 'Apply a canonical glossary without a model call.', shortcode: 'tm', searchAliases: ['terminology-map', 'glossary', 'spelling', 'titles'] },
    reflect: { purpose: 'Assess a character, recalled experience or scene from grounded evidence.', shortcode: 'rf', searchAliases: ['introspection', 'character assessment', 'scene reflection'] },
    internalize: { purpose: 'Propose state changes from settled experience, patterns or recovery.', shortcode: 'in', searchAliases: ['introspection', 'state proposal', 'experience', 'recovery'] },
    express: { purpose: 'Turn an assessment into behavior, attention guidance or inner voice.', shortcode: 'ex', searchAliases: ['introspection', 'behavior', 'attention', 'inner voice'] },
    context: { purpose: 'Assemble, filter perspective or focus bounded context.', shortcode: 'cx', searchAliases: ['introspection', 'perspective', 'focus context'] },
    memory: { purpose: 'Read, recall or explicitly commit scoped actor memory.', shortcode: 'mm', searchAliases: ['introspection', 'actor memory', 'episodes', 'commit'] },
    state: { purpose: 'Inspect numeric values, advance a curve or track settled events.', shortcode: 'sv', searchAliases: ['introspection', 'state values', 'curve', 'consequence track'] },
}).data;
const variantSearchMetadata = cloneDefinitionData({
    'text-rules:draft': { purpose: 'Produce guarded patches from literal draft rules.', shortcode: 'trd', searchAliases: ['draft replacement'] },
    'json-decode:check': { purpose: 'Check structured values against a JSON schema.', shortcode: 'jdc', searchAliases: ['JSON validation'] },
    'compose:input': { purpose: 'Format a named text section alongside data.', shortcode: 'coi', searchAliases: ['text section'] },
    'compose:guidance': { purpose: 'Format a host instruction from data and sections.', shortcode: 'cog', searchAliases: ['guidance template'] },
}).data;
const queryText = choice => [choice.label, choice.family, choice.purpose, choice.shortcode, ...choice.searchAliases].join(' ').toLocaleLowerCase();

/** Explicit content preparation only. Scope/choices are presentation metadata;
 * the captured adapter and full-root producer still authorize every edit.
 * checkedLibraryEntries are disabled metadata projections. checkedLibraryClosures
 * are admitted exact snapshots, validated here once and retained only in the private registry.
 */
export function prepareNativeSearchCatalog(scope, options = {}) {
    const admitted = cloneDefinitionData({ scope, options });
    if (!admitted.ok) return admitted;
    const input = admitted.data.scope, settings = admitted.data.options;
    if (!exact(input, ['schema', 'runtime', 'mode', 'workflowId', 'viewPath', 'inDefinition'])
        || input.schema !== 3 || input.runtime !== 2 || !(input.mode === 'native-unified' || input.inDefinition && ['native-pre', 'native-post'].includes(input.mode))
        || !text(input.workflowId) || !Array.isArray(input.viewPath) || input.viewPath.length > 8 || !input.viewPath.every(text)
        || typeof input.inDefinition !== 'boolean' || input.inDefinition !== (input.viewPath.length > 0)
        || !exact(settings, ['checkedLibraryEntries', 'checkedLibraryClosures'])
        || ['checkedLibraryEntries', 'checkedLibraryClosures'].some(key => settings[key] !== undefined && !Array.isArray(settings[key]))) return fail('Expected the checked schema-3 scope and local shelf metadata.');
    const phase = input.mode.slice(7), choices = [], commands = new Map();
    const addOperation = (operation, variant, label, controls, artifactKind) => {
        if (input.inDefinition && OPERATIONS[operation].rootOnly && !isScopedSystemOperation({type:'workflow',operation})) return;
        if (operation === 'reroute' && !artifactKind) artifactKind = 'text';
        if (OPERATIONS[operation].family === 'Transpose' && !variant) controls = { inputKind: 'text', ...controls };
        let description = describeOperation(input, { type: 'workflow', ...operationDefaults(operation, { mode: controls?.mode }), ...controls,
            ...(artifactKind ? { artifactKind, phase: phase === 'unified' ? 'pre' : phase } : {}) });
        const deferred = !description.ok && deferredNodeDescription(operation, controls);
        if (deferred) description = { ok: true, data: { ...deferred, descriptor: { ...deferred.descriptor, phase: ['pre', 'post'].includes(deferred.descriptor.phase) ? deferred.descriptor.phase : phase === 'unified' ? 'pre' : phase } } };
        if (!description.ok || phase !== 'unified' && description.data.descriptor.phase !== phase) return;
        const requiresConfiguration = !!deferred || nodeNeedsConfiguration(operation, controls);
        const id = 'operation:' + operation + (variant ? ':' + variant : '');
        const baseSearch = searchMetadata[operation] ?? { purpose: '', shortcode: '', searchAliases: [operation] }, variantSearch = variantSearchMetadata[operation + ':' + (variant?.startsWith('text-') ? variant.slice(5) : variant)];
        const metadata = variantSearch ? { ...variantSearch, searchAliases: [...baseSearch.searchAliases, ...variantSearch.searchAliases] } : baseSearch;
        choices.push({ id, label: label ?? description.data.descriptor.title, family: description.data.descriptor.family, phase: description.data.descriptor.phase, ...metadata,
            ports: description.data.ports.map(portProjection), ...(requiresConfiguration ? { requiresConfiguration: true } : {}) });
        commands.set(id, freeze({ operation, ...(requiresConfiguration ? { requiresConfiguration: true } : {}), ...(controls ? { controls: structuredClone(controls) } : {}), ...(artifactKind ? { artifactKind } : {}) }));
    };
    for (const operation of Object.keys(OPERATIONS)) addOperation(operation);
    for (const operation of Object.keys(OPERATIONS).filter(id => OPERATIONS[id].family === 'Transpose')) {
        addOperation(operation, 'reply-draft', OPERATIONS[operation].title + ' · Reply edits', { inputKind: 'draft' });
    }
    for (const [operation, variant, label, controls] of presets) {
        if (OPERATIONS[operation].family === 'Transpose') addOperation(operation, 'text-' + variant, label, { ...controls, inputKind: 'text' });
    }
    for (const [operation, variant, label, controls] of presets) addOperation(operation, variant, label, controls);
    for (const kind of ARTIFACT_KINDS) addOperation('reroute', kind, 'Reroute · ' + kind[0].toUpperCase() + kind.slice(1), undefined, kind);
    for (const direction of ['input', 'output']) {
        const id = 'boundary:' + direction, label = direction === 'input' ? 'Input' : 'Output';
        choices.push({ id, label, family: 'Subgraphs', phase, purpose: `Expose a named subgraph ${direction} connection.`, shortcode: direction === 'input' ? 'si' : 'so', searchAliases: ['subgraph ' + direction, 'boundary'],
            ports: [{ portId: direction === 'input' ? 'out' : 'in', dir: direction === 'input' ? 'out' : 'in', kind: 'text', label, required: false }],
            ...(!input.inDefinition ? { disabledReason: 'Available inside a subgraph.' } : {}) });
        if (input.inDefinition) commands.set(id, freeze({ kind: 'create-boundary', direction, artifactKind: 'text' }));
    }
    const shelfIds = new Set();
    for (const entry of settings.checkedLibraryEntries ?? []) {
        const ref = entry?.definitionRef;
        if (!exact(entry, ['definitionRef', 'name', 'phase', 'ports', 'purpose', 'shortcode', 'searchAliases']) || !text(entry.name) || !['pre', 'post', 'unified'].includes(entry.phase)
            || !exact(ref, ['id', 'version', 'semanticHash']) || !text(ref.id) || !Number.isSafeInteger(ref.version) || ref.version < 1 || !/^sha256:[0-9a-f]{64}$/.test(ref.semanticHash)
            || !Array.isArray(entry.ports) || entry.ports.length > 1000
            || ['purpose', 'shortcode'].some(key => entry[key] !== undefined && typeof entry[key] !== 'string')
            || entry.searchAliases !== undefined && (!Array.isArray(entry.searchAliases) || entry.searchAliases.some(alias => typeof alias !== 'string'))) return fail('Expected exact checked shelf references and interface descriptors.');
        const portIds = new Set();
        for (const port of entry.ports) {
            if (!exact(port, ['id', 'label', 'direction', 'kind', 'required', 'cardinality']) || !text(port.id) || typeof port.label !== 'string'
                || !['input', 'output'].includes(port.direction) || !ARTIFACT_KINDS.includes(port.kind) || typeof port.required !== 'boolean' || port.cardinality !== 'one' || portIds.has(port.id)) return fail('Expected distinct actual interface ports.');
            portIds.add(port.id);
        }
        const id = 'definition:' + definitionRefKey(ref);
        if (shelfIds.has(id)) return fail('A shelf revision must be unique.');
        shelfIds.add(id);
        if (phase !== 'unified' && entry.phase !== phase) continue;
        choices.push({ id, label: entry.name, family: 'Subgraphs', phase, definitionRef: { ...ref }, ports: entry.ports.map(portProjection),
            purpose: entry.purpose ?? 'Reusable saved definition with named interface ports.', shortcode: entry.shortcode ?? 'sg', searchAliases: entry.searchAliases ?? [],
            disabledReason: 'Checked definition content is required for atomic insertion.' });
    }
    for (const entry of settings.checkedLibraryClosures ?? []) {
        if (!exact(entry, ['definition', 'snapshots']) || entry.definition === undefined) return fail('Expected an exact definition and its optional pinned snapshot table.');
        const selected = selectSubgraphClosure(entry.definition, entry.snapshots === undefined ? {} : entry.snapshots);
        if (!selected.ok) return selected;
        const { definition, definitions } = selected.data;
        const ref = { id: definition.id, version: definition.version, semanticHash: definition.semanticHash };
        const id = 'definition:' + definitionRefKey(ref);
        if (shelfIds.has(id)) return fail('A shelf revision must be unique.');
        shelfIds.add(id);
        if (phase !== 'unified' && definition.body.mode.slice(7) !== phase) continue;
        choices.push({ id, label: definition.name, family: 'Subgraphs', phase, definitionRef: ref, ports: definition.interface.map(portProjection),
            purpose: 'Reusable saved definition with named interface ports.', shortcode: 'sg', searchAliases: [] });
        commands.set(id, freeze({ kind: 'create-instance', definition, snapshots: definitions }));
    }
    freeze(choices);
    const variants = new Map(), views = new Map(choices.map(choice => [choice.id, choice]));
    for (const item of choices) {
        const id = item.id.startsWith('operation:') ? item.id.split(':').slice(0, 2).join(':') : item.id;
        const entries = variants.get(id) ?? []; entries.push(item); variants.set(id, entries);
    }
    const canonical = [...variants].map(([id, entries]) => {
        const selected = entries.find(item => item.id === id) ?? entries[0];
        if (!id.startsWith('operation:')) return selected;
        const operation = id.split(':')[1], metadata = searchMetadata[operation];
        const aliases = [...new Set(entries.flatMap(item => [
            ...item.searchAliases, ...(item.id === id ? [] : [item.label, item.shortcode]),
        ]).filter(Boolean))];
        const result = { ...selected, id, label: OPERATIONS[operation].title,
            ...(metadata ? { purpose: metadata.purpose, shortcode: metadata.shortcode } : {}), searchAliases: aliases };
        commands.set(id, commands.get(selected.id)); views.set(id, result);
        return result;
    });
    const data = freeze({ scope: input, families: [...FAMILIES, 'Subgraphs'], choices: canonical });
    registries.set(data, commands);
    choiceViews.set(data, views);
    choiceVariants.set(data, variants);
    return { ok: true, data };
}

export const isNativeSearchCatalog = catalog => registries.has(catalog);

/** Returns an immutable checked creation packet; unknown/disabled/foreign choices fail closed. */
export function resolveNativeSearchChoice(catalog, id) {
    return registries.get(catalog)?.get(id) ?? null;
}

export function matchNativeSearchPorts(catalog, id, origin) {
    if (!registries.has(catalog)) return [];
    if (typeof id === 'string' && id.startsWith('boundary:')) return [];
    const copied = cloneDefinitionData(origin);
    if (!copied.ok || !validOrigin(copied.data)) return [];
    const choice = choiceViews.get(catalog)?.get(id);
    return matchingPorts(choice, copied.data);
}

/** Query and compatibility filtering use only cached descriptors, never describe/validate a graph. */
export function filterNativeSearchChoices(catalog, options = {}) {
    if (!registries.has(catalog)) return [];
    const copied = cloneDefinitionData(options);
    if (!copied.ok || !exact(copied.data, ['query', 'origin', 'contextSensitive'])) return [];
    const { query = '', origin = null, contextSensitive = true } = copied.data;
    if (typeof query !== 'string' || typeof contextSensitive !== 'boolean' || origin !== null && !validOrigin(origin)) return [];
    const needle = query.toLocaleLowerCase().trim();
    return catalog.choices.flatMap(choice => {
        if (origin && choice.id.startsWith('boundary:')) return [];
        if (needle && !queryText(choice).includes(needle)) return [];
        if (!origin || !contextSensitive || matchingPorts(choice, origin).length) return [choice];
        const alternate = choiceVariants.get(catalog)?.get(choice.id)?.find(item =>
            matchingPorts(item, origin).length && !(item.id.startsWith('operation:memory:')
                && resolveNativeSearchChoice(catalog, item.id)?.controls?.mode === 'commit'));
        return alternate ? [freeze({ ...choice, id: alternate.id, ports: alternate.ports })] : [];
    });
}
