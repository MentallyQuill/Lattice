import { computeDefinitionIdentity, definitionRefKey, validateDefinition } from '../definitions.js?v=0.27.2';
import { exportSubgraph, parseSubgraph } from '../packages.js?v=0.27.2';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const primitive = (id, operation, settings = {}) => ({ id, type: 'workflow', operation, operationVersion: 1, ...settings });
const wire = (id, from, to, fromPort = 'out', toPort = 'in') => ({ id, route: 'wire', from, fromPort, to, toPort });
const parameter = (id, label, nodeId, controlId = id, instancePath = []) => ({ id, label, target: { instancePath, nodeId, controlId } });
const definition = (id, name, phase, inputId, inputKind, outputId, outputKind, nodes, wires, parameters, roles = {}, optionalPorts = []) => ({
    id: `lattice.library.${id}`, version: 1, name,
    interface: [
        { id: inputId, label: inputKind === 'context' ? 'Context' : 'Draft', direction: 'input', kind: inputKind, required: true, cardinality: 'one', boundaryNodeId: 'entry' },
        { id: outputId, label: name + ' result', direction: 'output', kind: outputKind, required: false, cardinality: 'one', boundaryNodeId: 'exit' },
        ...optionalPorts,
    ],
    parameters,
    body: { schema: 3, runtime: 2, mode: `native-${phase}`, nodes: {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: inputId },
        ...nodes,
        exit: { id: 'exit', type: 'subgraph-output', interfacePortId: outputId },
    }, wires, roles, groups: {}, portals: {} },
});
const unresolved = role => ({ [role]: { model: null } });
const reference = value => ({ id: value.id, version: value.version, semanticHash: value.semanticHash });
const instance = (id, value) => ({ id, type: 'subgraph', definition: reference(value), parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} });
function contextLens() {
    return definition('context-lens', 'Context Lens', 'pre', 'context', 'context', 'selected-context', 'context', {
        compact: primitive('compact', 'smart-compactor', { method: 'select' }),
    }, { select: wire('select', 'entry', 'compact'), result: wire('result', 'compact', 'exit') }, [
        parameter('targetTokens', 'Target tokens', 'compact'), parameter('keepRecent', 'Keep recent messages', 'compact'),
        parameter('pins', 'Protected literal pins', 'compact'), parameter('method', 'Selection or compression', 'compact'),
        parameter('purpose', 'Selection purpose', 'compact'), parameter('maxTokens', 'Compression completion limit', 'compact'),
    ], unresolved('Analysis'));
}
function sceneCompass(lens) {
    return definition('scene-compass', 'Scene Compass', 'pre', 'context', 'context', 'guidance', 'guidance', {
        lens: instance('lens', lens),
        plan: primitive('plan', 'response-plan', { instructions: 'Suggest optional scene direction, actor intentions, constraints and possible next beats. Preserve user agency; do not establish events or decide the user’s actions.' }),
    }, { select: wire('select', 'entry', 'lens', 'out', 'context'), plan: wire('plan', 'lens', 'plan', 'selected-context'), result: wire('result', 'plan', 'exit') }, [
        parameter('targetTokens', 'Context target tokens', 'compact', 'targetTokens', ['lens']),
        parameter('keepRecent', 'Keep recent messages', 'compact', 'keepRecent', ['lens']),
        parameter('pins', 'Protected context pins', 'compact', 'pins', ['lens']),
        parameter('method', 'Context selection or compression', 'compact', 'method', ['lens']),
        parameter('purpose', 'Context purpose', 'compact', 'purpose', ['lens']),
        parameter('compressionMaxTokens', 'Compression completion limit', 'compact', 'maxTokens', ['lens']),
        parameter('instructions', 'Planning instructions', 'plan'), parameter('maxTokens', 'Planning completion limit', 'plan'),
    ], unresolved('Analysis'));
}
function literalCleanup() {
    return definition('literal-cleanup', 'Literal Cleanup', 'post', 'draft', 'draft', 'filtered-draft', 'draft', {
        scan: primitive('scan', 'pattern', { mode: 'whole-word', scope: 'narration', rules: ['the words hung in the air', 'the tension was palpable', 'something unreadable'].map((pattern, index) => ({ id: `prose-${index}`, pattern })) }),
        branch: primitive('branch', 'branch', { artifactKind: 'draft' }),
        filter: primitive('filter', 'filter-text', { action: 'remove', unit: 'paragraph', scope: 'narration', protectedLiterals: [] }),
        join: primitive('join', 'join', { artifactKind: 'draft', inputs: [{ id: 'filtered', label: 'Filtered', required: false }, { id: 'bypass', label: 'No match', required: false }] }),
    }, {
        scan: wire('scan', 'entry', 'scan'), payload: wire('payload', 'scan', 'branch'), condition: wire('condition', 'scan', 'branch', 'matched', 'condition'),
        selected: wire('selected', 'branch', 'filter', 'yes'), report: wire('report', 'scan', 'filter', 'matches', 'matches'),
        filtered: wire('filtered', 'filter', 'join', 'out', 'filtered'), bypass: wire('bypass', 'branch', 'join', 'no', 'bypass'), result: wire('result', 'join', 'exit'),
    }, [
        parameter('scope', 'Detection scope', 'scan'), parameter('caseSensitive', 'Case-sensitive matching', 'scan'),
        parameter('rules', 'Canonical pattern rules', 'scan'), parameter('exemptions', 'Exemptions', 'scan'), parameter('protectedLiterals', 'Protected wording', 'scan'),
        parameter('action', 'Remove or keep matching units', 'filter'), parameter('unit', 'Line or paragraph', 'filter'), parameter('filterScope', 'Deletion scope', 'filter', 'scope'),
    ]);
}
function formattingCleanup() {
    return definition('formatting-cleanup', 'Formatting Cleanup', 'post', 'draft', 'draft', 'candidate', 'candidate', {
        rules: primitive('rules', 'text-rules', { inputKind: 'draft', scope: 'whole', rules: [{ kind: 'literal', pattern: '\r\n', replacement: '\n', flags: '' }] }),
        validate: primitive('validate', 'validate-patches'),
    }, { rules: wire('rules', 'entry', 'rules'), validate: wire('validate', 'rules', 'validate'), result: wire('result', 'validate', 'exit') }, [
        parameter('rules', 'Formatting rules', 'rules'), parameter('scope', 'Formatting scope', 'rules'), parameter('protectedLiterals', 'Protected wording', 'rules'),
    ]);
}
function proseCleanup() {
    return definition('prose-cleanup', 'Prose Cleanup', 'post', 'draft', 'draft', 'candidate', 'candidate', {
        'context-entry': { id: 'context-entry', type: 'subgraph-input', interfacePortId: 'context' },
        repair: primitive('repair', 'repair', { mode: 'contextual', scope: 'narration', categories: [], caseSensitive: false, strength: 'light' }),
        validate: primitive('validate', 'validate-patches'),
    }, { repair: wire('repair', 'entry', 'repair'), context: wire('context', 'context-entry', 'repair', 'out', 'context'), validate: wire('validate', 'repair', 'validate'), result: wire('result', 'validate', 'exit') }, [
        parameter('mode', 'Cleanup mode', 'repair'), parameter('scope', 'Cleanup scope', 'repair'), parameter('categories', 'Policy categories (empty selects all)', 'repair'),
        parameter('caseSensitive', 'Case-sensitive matching', 'repair'), parameter('protectedLiterals', 'Protected wording', 'repair'),
        parameter('strength', 'Cleanup strength', 'repair'), parameter('instructions', 'Cleanup instructions', 'repair'), parameter('maxTokens', 'Cleanup completion limit', 'repair'),
    ], unresolved('Prose'), [{ id: 'context', label: 'Optional context', direction: 'input', kind: 'context', required: false, cardinality: 'one', boundaryNodeId: 'context-entry' }]);
}
function packageDefinition(draft, snapshots = {}) {
    const identity = computeDefinitionIdentity(draft);
    if (!identity.ok) return identity;
    const pinned = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    const checked = validateDefinition(pinned, snapshots);
    if (!checked.ok) return checked;
    try {
        const json = JSON.stringify(exportSubgraph(pinned, snapshots), null, 2) + '\n';
        const parsed = parseSubgraph(json);
        return parsed.ok ? { ok: true, data: { definition: parsed.data.definition, json } } : parsed;
    } catch { return fail('LIBRARY_PACKAGE', 'The library subgraph could not be packaged.'); }
}

/** Construct a detached portable package. This never installs a definition or resolves a model. */
export function createLibrarySubgraph(id) {
    if (id === 'context-lens') return packageDefinition(contextLens());
    if (id === 'literal-cleanup') return packageDefinition(literalCleanup());
    if (id === 'formatting-cleanup') return packageDefinition(formattingCleanup());
    if (id === 'prose-cleanup') return packageDefinition(proseCleanup());
    if (id === 'scene-compass') {
        const lens = createLibrarySubgraph('context-lens');
        if (!lens.ok) return lens;
        return packageDefinition(sceneCompass(lens.data.definition), { [definitionRefKey(lens.data.definition)]: lens.data.definition });
    }
    return fail('UNKNOWN_LIBRARY_SUBGRAPH', 'Unknown library subgraph ID.');
}
