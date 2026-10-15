import { cloneDefinitionData, definitionRefKey } from './definitions.js?v=0.27.3';
import { prepareNativeConnectionEdit } from './connection-edits.js?v=0.27.3';
import { makeLocalCopy, prepareNativeNodeEdit } from './definition-library.js?v=0.27.3';
import { prepareGraphArtifacts, inspectGraphArtifacts } from './graph-artifacts.js?v=0.27.3';
import { prepareGraphCandidate } from './prepared-graph-edit.js?v=0.27.3';
import { compositionIds, safeId } from './composition-edit.js?v=0.27.3';
import { selectSubgraphClosure } from './packages.js?v=0.27.3';
import { OPERATIONS, portsForNode } from './catalog.js?v=0.27.3';
import { artifactAddressKey } from './definition-data.js?v=0.27.3';
import { inspectExpandedGraph, nodeAddressKey } from './graph-validation.js?v=0.27.3';
const fail = (code, message) => ({ ok: false, error: { code, message } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
const endpoint = value => only(value, ['nodeId', 'portId']) && safeId(value.nodeId) && safeId(value.portId);
function parsed(input, existing = false) {
    const admitted = cloneDefinitionData(input);
    if (!admitted.ok)
        return admitted;
    const c = { inputs: {}, outputs: [], parameterOverrides: {}, ...admitted.data };
    if (!only(c, ['definition', 'snapshots', 'graphPoint', 'inputs', 'outputs', 'parameterOverrides', 'guidance', ...(existing ? ['instanceId', 'expectedInstanceRef'] : [])]) || (existing ? !safeId(c.instanceId) || !only(c.expectedInstanceRef, ['id', 'version', 'semanticHash']) : !record(c.definition) || !record(c.snapshots)) || !only(c.graphPoint, ['x', 'y']) || !Number.isFinite(c.graphPoint.x) || !Number.isFinite(c.graphPoint.y) || !record(c.inputs) || !Object.entries(c.inputs).every(([id, e]) => safeId(id) && endpoint(e)) || !Array.isArray(c.outputs) || !c.outputs.every(o => only(o, ['outputPortId', 'destination']) && safeId(o.outputPortId) && endpoint(o.destination)) || !record(c.parameterOverrides))
        return fail('INVALID_COMMAND', 'Choose a saved system and explicit typed bindings.');
    if (c.guidance !== undefined && (!only(c.guidance, ['outputPortId', 'destination']) || !safeId(c.guidance.outputPortId) || !(only(c.guidance.destination, ['kind']) && c.guidance.destination.kind === 'new-compose' || only(c.guidance.destination, ['kind', 'nodeId']) && c.guidance.destination.kind === 'existing-compose' && safeId(c.guidance.destination.nodeId))))
        return fail('INVALID_COMMAND', 'Choose an explicit Guidance merge.');
    return { ok: true, data: c };
}
/** Pure atomic root producer; continuation authorization and history stay with the controller. */
export function prepareAddSystem(root, input) { return prepareSystemEdit(root, input, false); }
/** Preview explicit settings and connections on a previously placed instance. */
export function prepareSystemAssistance(root, input) { return prepareSystemEdit(root, input, true); }
function prepareSystemEdit(root, input, existing) {
    try {
        const parsedCommand = parsed(input, existing);
        if (!parsedCommand.ok)
            return parsedCommand;
        const admitted = prepareGraphArtifacts(root);
        if (!admitted.ok) return admitted;
        const original = inspectGraphArtifacts(admitted.data).snapshot;
        const c = parsedCommand.data;
        if (original.schema !== 3 || original.runtime !== 2 || original.mode !== 'native-unified')
            return fail('WRONG_PHASE', 'Add systems to a unified Main workflow.');
        const wrapper = existing && original.nodes[c.instanceId];
        if (existing && (wrapper?.type !== 'subgraph' || definitionRefKey(wrapper.definition) !== definitionRefKey(c.expectedInstanceRef)))
            return fail('STALE_DEFINITION', 'The placed system revision changed. Reopen connection assistance.');
        const closure = selectSubgraphClosure(existing ? original.definitions?.[definitionRefKey(wrapper.definition)] : c.definition, existing ? original.definitions ?? {} : c.snapshots);
        if (!closure.ok) return closure;
        const definition = closure.data.definition;
        // Connection gestures accept either direction; explicit authoring commands do not.
        const checkBinding = (portId, rootEndpoint, direction) => {
            const boundary = definition.interface.find(port => port.id === portId && port.direction === direction);
            if (!boundary) return fail('INVALID_BINDING', 'Choose a declared system ' + direction + ' port.');
            const rootNode = original.nodes[rootEndpoint.nodeId];
            const rootPort = rootNode && portsForNode(original, rootNode).find(port => port.id === rootEndpoint.portId);
            const rootDirection = direction === 'input' ? 'output' : 'input';
            if (!rootPort || rootPort.direction !== rootDirection)
                return fail('INVALID_BINDING', 'Choose a Main ' + rootDirection + ' for the system ' + direction + '.');
            if (rootPort.kind !== boundary.kind)
                return fail('ARTIFACT_KIND', 'The Main endpoint must match the declared system port kind.');
            return { ok: true, data: null };
        };
        for (const [portId, source] of Object.entries(c.inputs)) {
            const valid = checkBinding(portId, source, 'input');
            if (!valid.ok) return valid;
        }
        for (const output of c.outputs) {
            const valid = checkBinding(output.outputPortId, output.destination, 'output');
            if (!valid.ok) return valid;
        }
        const inserted = existing ? { ok: true, data: { candidate: structuredClone(original), addedNodeIds: [c.instanceId] } }
            : prepareNativeConnectionEdit(root, { kind: 'create-instance', definition, snapshots: closure.data.definitions, graphPoint: c.graphPoint });
        if (!inserted.ok) return inserted;
        let candidate = inserted.data.candidate;
        const instanceId = inserted.data.addedNodeIds[0];
        for (const [parameterId, value] of Object.entries(c.parameterOverrides)) {
            const changed = prepareNativeNodeEdit(candidate, { kind: 'parameter-override', viewPath: [], nodeId: instanceId, expectedInstanceRef: candidate.nodes[instanceId].definition, parameterId, mode: 'set', value });
            if (!changed.ok)
                return changed;
            candidate = changed.data.candidate;
        }
        if (!existing) {
            const copied = makeLocalCopy(candidate, { instancePath: [instanceId], id: compositionIds(candidate).next('system-definition'), materializeOverrides: true });
            if (!copied.ok) return copied;
            candidate = copied.data.candidate;
        }
        const connect = (from, to) => {
            const edit = prepareNativeConnectionEdit(candidate, { kind: 'connect', origin: from, target: to });
            if (edit.ok) candidate = edit.data.candidate;
            return edit;
        };
        for (const [portId, source] of Object.entries(c.inputs)) {
            const bound = connect(source, { nodeId: instanceId, portId });
            if (!bound.ok)
                return bound;
        }
        for (const output of c.outputs) {
            const bound = connect({ nodeId: instanceId, portId: output.outputPortId }, output.destination);
            if (!bound.ok)
                return bound;
        }
        const preview = [];
        if (c.guidance) {
            const port = definition.interface.find(p => p.id === c.guidance.outputPortId && p.direction === 'output' && p.kind === 'guidance');
            if (!port)
                return fail('ARTIFACT_KIND', 'Choose a declared Guidance output.');
            const merges = projectGuidanceMerges(candidate);
            if (!merges.ok)
                return merges;
            let composeId;
            if (c.guidance.destination.kind === 'new-compose') {
                if (!merges.data.canCreate)
                    return fail('OCCUPIED_GUIDANCE', 'Generate Reply Guidance is occupied; choose an effective existing merge.');
                const created = prepareNativeConnectionEdit(candidate, { kind: 'create', operation: 'compose', controls: { outputKind: 'guidance' }, graphPoint: { x: c.graphPoint.x + 360, y: c.graphPoint.y }, phase: 'pre' });
                if (!created.ok)
                    return created;
                candidate = created.data.candidate;
                composeId = created.data.addedNodeIds[0];
                const connected = connect({ nodeId: composeId, portId: 'out' }, { nodeId: merges.data.generatorId, portId: 'guidance' });
                if (!connected.ok)
                    return connected;
            }
            else {
                composeId = c.guidance.destination.nodeId;
                if (!merges.data.destinations.some(d => d.nodeId === composeId))
                    return fail('INEFFECTIVE_MERGE', 'Choose a Main Guidance Compose whose rendered output reaches Generate Reply.');
            }
            const compose = candidate.nodes[composeId], names = new Set((compose.sections ?? []).map(s => s.name));
            let base = definition.name.replace(/[^A-Za-z0-9_]/g, '_');
            if (!/^[A-Za-z_]/.test(base))
                base = 'System_' + base;
            if (!base)
                base = 'System';
            let sectionName = base, suffix = 2;
            while (names.has(sectionName))
                sectionName = base + '_' + suffix++;
            compose.sections = [...(compose.sections ?? []), { name: sectionName, text: '', kind: 'guidance', required: false, onSkipped: 'omit' }];
            if (compose.mode === 'template') {
                const before = compose.template ?? '';
                compose.template = before + (before ? compose.separator ?? '\n\n' : '') + '{{section:' + sectionName + '}}';
                preview.push({ kind: 'template', nodeId: composeId, before, after: compose.template });
            }
            const connected = connect({ nodeId: instanceId, portId: c.guidance.outputPortId }, { nodeId: composeId, portId: 'section.' + sectionName });
            if (!connected.ok)
                return connected;
            const effective = projectGuidanceMerges(candidate);
            if (!effective.ok)
                return effective;
            if (!effective.data.destinations.some(d => d.nodeId === composeId))
                return fail('INEFFECTIVE_MERGE', 'The proposed Guidance merge no longer reaches Generate Reply.');
            preview.push({ kind: 'guidance', nodeId: composeId, sectionName });
        }
        const addedEdgeIds = Object.keys(candidate.wires).filter(id => !Object.hasOwn(original.wires, id));
        const final = prepareGraphCandidate(root, candidate, addedEdgeIds);
        return final.ok ? { ok: true, data: { ...final.data, viewPath: [], instanceId, addedNodeIds: Object.keys(candidate.nodes).filter(id => !Object.hasOwn(original.nodes, id)), addedDefinitionKeys: Object.keys(candidate.definitions).filter(key => !Object.hasOwn(original.definitions ?? {}, key)), preview } } : final;
    }
    catch {
        return fail('INVALID_COMMAND', 'Could not prepare the system insertion.');
    }
}
function renderedSections(node) {
    if (node.mode !== 'template') return new Set((node.sections ?? []).map(section => section.name));
    const used = new Set(), template = node.template ?? '';
    let position = 0;
    while (position < template.length) {
        const start = template.indexOf('{{', position);
        if (start < 0) break;
        if (template.startsWith('{{{{', start)) { position = start + 4; continue; }
        const end = template.indexOf('}}', start + 2);
        if (end < 0) break;
        const token = template.slice(start + 2, end);
        if (token.startsWith('section:')) used.add(token.slice(8));
        position = end + 2;
    }
    return used;
}
function identifyChoices(choices) {
    const counts = new Map();
    for (const choice of choices) counts.set(choice.label, (counts.get(choice.label) ?? 0) + 1);
    for (const choice of choices) if (counts.get(choice.label) > 1) choice.label += ' (' + choice.nodeId + ')';
}
/** Artifact routes, including expanded portals, never preparation ordering dependencies. */
export function projectGuidanceMerges(root) {
    try {
        const expanded = inspectExpandedGraph(root);
        if (!expanded.ok)
            return expanded;
        const units = new Map(expanded.data.primitives.map(u => [nodeAddressKey(u.address), u]));
        // Follow authored terminal dependencies without requiring executable settings.
        const upstream = new Map(), included = new Set();
        for (const edge of expanded.data.edges) {
            const key = nodeAddressKey(edge.to);
            if (!upstream.has(key)) upstream.set(key, []);
            upstream.get(key).push(nodeAddressKey(edge.from));
        }
        function include(key) { if (included.has(key)) return; included.add(key); for (const source of upstream.get(key) ?? []) include(source); }
        for (const unit of expanded.data.primitives) if (unit.terminal) include(nodeAddressKey(unit.address));
        const generators = expanded.data.primitives.filter(u => u.node.operation === 'generate-reply' && included.has(nodeAddressKey(u.address)) && !u.address.instancePath.length && u.node.enabled !== false);
        if (generators.length !== 1)
            return fail('NATIVE_BOUNDARY', 'Main needs exactly one enabled Generate Reply.');
        const generator = generators[0];
        const incoming = new Map(expanded.data.edges.filter(e => !e.disabled).map(e => [artifactAddressKey(e.to), e]));
        const start = { ...generator.address, portId: 'guidance' }, seen = new Set(), destinations = [];
        function visit(input, route) {
            const edge = incoming.get(artifactAddressKey(input));
            if (!edge)
                return;
            const key = artifactAddressKey(edge.from);
            if (seen.has(key))
                return;
            seen.add(key);
            const unit = units.get(nodeAddressKey(edge.from));
            if (!unit || unit.node.enabled === false || unit.systemDisabled)
                return;
            const node = unit.node, next = [edge.from, ...route];
            if (node.operation === 'compose' && node.outputKind === 'guidance' && edge.from.portId === 'out') {
                if (!unit.address.instancePath.length && unit.phase === 'pre')
                    destinations.push({ nodeId: node.id, label: node.alias ?? node.title ?? 'Compose Guidance', route: next });
                const used = renderedSections(node);
                for (const section of node.sections ?? [])
                    if ((section.kind ?? 'text') === 'guidance' && used.has(section.name))
                        visit({ ...unit.address, portId: 'section.' + section.name }, next);
            }
            else if ((node.operation === 'reroute' && node.artifactKind === 'guidance' || node.operation === 'guidance') && edge.from.portId === 'out')
                visit({ ...unit.address, portId: 'in' }, next);
        }
        visit(start, [start]);
        identifyChoices(destinations);
        return { ok: true, data: { generatorId: generator.node.id, canCreate: !incoming.has(artifactAddressKey(start)), destinations } };
    }
    catch {
        return fail('INVALID_WORKFLOW', 'Could not inspect the Main Guidance route.');
    }
}
/** Checked saved choices and small root-local binding DTOs. */
export function projectSystemAuthoring(root, library) {
    try {
        const merges = projectGuidanceMerges(root);
        if (!merges.ok)
            return merges;
        const choices = [];
        for (const entry of library) {
            const selected = selectSubgraphClosure(entry.definition, entry.snapshots ?? {});
            if (!selected.ok)
                continue;
            const d = selected.data.definition;
            if (d.body.mode !== 'native-unified' && !['native-pre', 'native-post'].includes(d.body.mode))
                continue;
            choices.push({ key: definitionRefKey(d), name: d.name, definition: d, snapshots: selected.data.definitions, inputs: d.interface.filter(p => p.direction === 'input'), outputs: d.interface.filter(p => p.direction === 'output'), parameters: d.parameters });
        }
        const pins = Object.values(root.nodes).flatMap(node => portsForNode(root, node).map(port => ({ nodeId: node.id, portId: port.id, label: (node.alias ?? node.title ?? (node.type === 'subgraph' ? root.definitions?.[definitionRefKey(node.definition)]?.name : OPERATIONS[node.operation]?.title) ?? node.id) + ' · ' + port.label, kind: port.kind, direction: port.direction, occupied: port.direction === 'input' && Object.values(root.wires).some(w => w.to === node.id && w.toPort === port.id) })));
        identifyChoices(pins);
        return { ok: true, data: { choices, pins, ...merges.data } };
    }
    catch {
        return fail('INVALID_WORKFLOW', 'Could not project system authoring choices.');
    }
}
