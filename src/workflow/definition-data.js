import { ACTIVE_PROFILE_ID } from './model-profiles.js?v=0.27.0';
import { validateNodeModifiers } from './modifiers.js?v=0.27.0';
import { ARTIFACT_KINDS, operationFor, portsForNode, semanticControlsForNode, phaseForNode } from './catalog.js?v=0.27.0';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const idText = value => typeof value === 'string' && value.length > 0;
const forbiddenKey = key => /^(api[_-]?key|api[_-]?token|access[_-]?token|token|password|secret|credentials?|authorization|headers?|provider|endpoint|base[_-]?url|recordings?|chats?)$/i.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key);

/** Bound and detach untrusted metadata before property reads. Does not validate any graph.
 * Reject accessors, cycles, sparse/extended arrays and data outside plain JSON.
 * @param {unknown} value
 * @returns {import('./types').Result<any>}
 */
export function cloneDefinitionData(value) {
    let entries = 0, characters = 0;
    const ancestors = new Set();
    const visit = (item, depth) => {
        if (++entries > 20000 || depth > 40) throw new Error('bounds');
        if (typeof item === 'string') {
            characters += item.length;
            if (characters > 2000000) throw new Error('bounds');
            return item;
        }
        if (item === null || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) return item;
        if (typeof item !== 'object' || ancestors.has(item)) throw new Error('plain data');
        const prototype = Object.getPrototypeOf(item), array = Array.isArray(item);
        if (prototype !== Object.prototype && prototype !== null && !(array && prototype === Array.prototype)) throw new Error('prototype');
        const descriptors = Object.getOwnPropertyDescriptors(item);
        if (Reflect.ownKeys(item).some(key => typeof key !== 'string')) throw new Error('symbol');
        const keys = Object.keys(descriptors);
        if (array && (item.length > 20000 || keys.length !== item.length + 1 || keys.some(key => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key)))) throw new Error('array');
        ancestors.add(item);
        const copy = array ? [] : {};
        for (const key of keys) {
            if (array && key === 'length') continue;
            const descriptor = descriptors[key];
            characters += key.length;
            if (characters > 2000000 || forbiddenKey(key) || !descriptor.enumerable || !('value' in descriptor)) throw new Error('property');
            copy[key] = visit(descriptor.value, depth + 1);
        }
        ancestors.delete(item);
        return Object.freeze(copy);
    };
    try {
        const data = visit(value, 0);
        if (new TextEncoder().encode(JSON.stringify(data)).length > 2000000) return fail('DEFINITION_DATA', 'Definition data exceeds the UTF-8 byte limit.');
        return { ok: true, data };
    } catch { return fail('DEFINITION_DATA', 'Expected bounded plain definition data without secrets or runtime records.'); }
}

/** Leaf identities consume checked DTOs; separators inside saved IDs are never syntax. */
export const definitionRefKey = ({ id, version, semanticHash }) => JSON.stringify([id, version, semanticHash]);
export const nodeBindingOverrideKey = (relativeInstancePath, nodeId) => JSON.stringify([relativeInstancePath, nodeId]);
export const artifactAddressKey = ({ workflowId, instancePath, nodeId, portId }) => JSON.stringify([workflowId, instancePath, nodeId, portId]);

/** Metadata diagnostics only. Success NEVER authorizes installation, resolution or execution.
 * Topology, phase/operation compatibility, nested refs, parameter target resolution, recursion,
 * expanded limits and required-input completeness belong to the full definition validator.
 * @param {unknown} value
 * @returns {import('./types').Result<any>}
 */
export function inspectDefinitionMetadata(value) {
    const copied = cloneDefinitionData(value);
    if (!copied.ok) return copied;
    const definition = copied.data;
    if (!record(definition) || !idText(definition.id) || !Number.isSafeInteger(definition.version) || definition.version < 1 || typeof definition.name !== 'string' || (definition.description !== undefined && typeof definition.description !== 'string')) return fail('DEFINITION_METADATA', 'A definition requires an ID, positive exact version and display name.');
    if (definition.semanticHash !== undefined && !/^sha256:[0-9a-f]{64}$/.test(definition.semanticHash)) return fail('DEFINITION_HASH', 'Expected a sha256 hash.');
    const body = definition.body;
    if (!record(body) || body.schema !== 3 || body.runtime !== 2 || !['native-pre', 'native-post', 'native-unified'].includes(body.mode) || !record(body.nodes) || !record(body.wires)) return fail('DEFINITION_BODY', 'Expected a schema-3/runtime-2 body with an explicit phase.');
    if (!Array.isArray(definition.interface) || !Array.isArray(definition.parameters)) return fail('DEFINITION_INTERFACE', 'Expected interface and exposed-parameter lists.');
    if (Object.keys(body.nodes).length > 1000 || Object.keys(body.wires).length > 2000) return fail('DEFINITION_LIMIT', 'Definition body exceeds local traversal limits.');
    const portIds = new Set(), boundaries = new Set(), boundaryPorts = {};
    for (const port of definition.interface) {
        if (!record(port) || !idText(port.id) || typeof port.label !== 'string' || !['input', 'output'].includes(port.direction) || !ARTIFACT_KINDS.includes(port.kind) || typeof port.required !== 'boolean' || port.cardinality !== 'one' || !idText(port.boundaryNodeId)) return fail('DEFINITION_INTERFACE', 'Invalid interface port metadata.');
        if (portIds.has(port.id) || boundaries.has(port.boundaryNodeId)) return fail('DEFINITION_INTERFACE', 'Interface and boundary mappings must be unique.');
        const node = body.nodes[port.boundaryNodeId];
        if (!Object.hasOwn(body.nodes, port.boundaryNodeId) || !record(node) || node.id !== port.boundaryNodeId || node.interfacePortId !== port.id || node.type !== `subgraph-${port.direction}`) return fail('DEFINITION_INTERFACE', 'Each interface port requires exactly one matching boundary.');
        portIds.add(port.id); boundaries.add(port.boundaryNodeId);
        boundaryPorts[node.id] = Object.freeze({ id: port.direction === 'input' ? 'out' : 'in', kind: port.kind, direction: port.direction === 'input' ? 'output' : 'input', required: port.direction === 'output', cardinality: 'one' });
    }
    for (const [id, node] of Object.entries(body.nodes)) {
        if (record(node) && ['subgraph-input', 'subgraph-output'].includes(node.type) && (!boundaries.has(id) || node.id !== id)) return fail('DEFINITION_INTERFACE', 'A boundary node has no matching interface port.');
    }
    const parameterIds = new Set(), targets = new Set();
    for (const parameter of definition.parameters) {
        const target = parameter?.target;
        if (!record(parameter) || !idText(parameter.id) || typeof parameter.label !== 'string' || !record(target) || !Array.isArray(target.instancePath) || target.instancePath.length > 8 || !target.instancePath.every(idText) || !idText(target.nodeId) || !idText(target.controlId)) return fail('DEFINITION_PARAMETER', 'Invalid exposed-parameter target metadata.');
        const key = JSON.stringify([target.instancePath, target.nodeId, target.controlId]);
        if (parameterIds.has(parameter.id) || targets.has(key)) return fail('DEFINITION_PARAMETER', 'Exposed parameter IDs and targets must be unique.');
        parameterIds.add(parameter.id); targets.add(key);
    }
    return { ok: true, data: { definition, boundaryPorts: Object.freeze(boundaryPorts), topologyValidated: false } };
}

/** Derive one control's schema/default from a primitive already selected by a caller.
 * Does not resolve exposed paths or validate instance overrides.
 * @returns {import('./types').Result<import('./types').ControlDescriptor>}
 */
export function describeExposedControl(value, controlId) {
    const copied = cloneDefinitionData(value);
    if (!copied.ok) return copied;
    const node = copied.data, operation = operationFor(node);
    if (!operation || typeof controlId !== 'string' || !Object.hasOwn(operation.controlDescriptors, controlId)) return fail('DEFINITION_PARAMETER', 'Parameter must target a catalog operation control.');
    const descriptor = operation.controlDescriptors[controlId];
    const current = node[controlId] === undefined ? descriptor.default : node[controlId];
    const valid = descriptor.type === 'integer' ? Number.isSafeInteger(current) && current >= descriptor.min && current <= descriptor.max
        : descriptor.type === 'number' ? Number.isFinite(current) && current >= descriptor.min && current <= descriptor.max
        : descriptor.type === 'enum' ? descriptor.values.includes(current)
        : descriptor.type === 'object' ? record(current) && [Object.prototype, null].includes(Object.getPrototypeOf(current)) && (descriptor.max === undefined || Object.keys(current).length <= descriptor.max)
        : descriptor.type === 'array' ? Array.isArray(current) && (descriptor.items === 'json' ? cloneDefinitionData(current).ok : current.every(item => typeof item === 'string' || ['string-or-record', 'record', 'context-slot'].includes(descriptor.items) && record(item)))
        : typeof current === descriptor.type;
    if (!valid) return fail('DEFINITION_PARAMETER', 'Saved control default does not match its catalog descriptor.');
    return cloneDefinitionData({ ...descriptor, default: current });
}

/** Parameter eligibility is separate from control materialization and identity hashing. */
export function describeExposedParameter(value, controlId) {
    const result = describeExposedControl(value, controlId);
    if (!result.ok) return result;
    return result.data.exposable === false ? fail('DEFINITION_PARAMETER', 'Context Join input slots define pin layout. Edit inputs inside the graph body instead of exposing them as a parameter.') : result;
}

const canonical = value => Array.isArray(value) ? value.map(canonical) : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const mapRecords = (value, project) => Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, project(item)]));
const portableBinding = (binding, primitiveFallback = false) => {
    if (!record(binding) || binding.model !== undefined && binding.model !== null && typeof binding.model !== 'string' || binding.profileId !== undefined && binding.profileId !== null && typeof binding.profileId !== 'string') throw new Error('binding');
    // Roles/overrides inherit absent fields, while explicit null blocks inheritance.
    // Saved primitive null and absence both use the existing role fallback behavior.
    return { ...(primitiveFallback || Object.hasOwn(binding, 'model') ? { model: binding.model ?? null } : {}), ...(binding.profileId === ACTIVE_PROFILE_ID ? { profileId: ACTIVE_PROFILE_ID } : {}) };
};

/** Compute portable semantic identity and a detached draft with explicit catalog defaults.
 * This is NOT definition validation: callers must structurally validate every snapshot and
 * nested ref before installing the materialized draft. In particular, matching hashes alone
 * do not establish validity or equality; compare canonicalContent for collision/conflict checks.
 * Hash excludes own ID/version/hash and presentation. Nested refs retain their exact hashes;
 * bundled snapshot tables are storage, checked separately by the full validator.
 * @param {unknown} value
 * @returns {import('./types').Result<any>}
 */
export function computeDefinitionIdentity(value) {
    const metadata = inspectDefinitionMetadata(value);
    if (!metadata.ok) return metadata;
    const draft = structuredClone(metadata.data.definition);
    try {
        const nodes = {};
        for (const [id, node] of Object.entries(draft.body.nodes)) {
            if (!record(node) || node.id !== id) return fail('DEFINITION_BODY', 'Invalid body node identity.');
            const modifiers=validateNodeModifiers(node,node.type==='workflow'?portsForNode(draft.body,node).filter(port=>port.direction==='output'):[]);
            if(!modifiers.ok)return modifiers;
            if (node.type === 'note') continue;
            const common = { id: node.id, type: node.type, enabled: node.enabled !== false, ...(node.modifiers === undefined ? {} : { modifiers: node.modifiers }) };
            if (node.type === 'workflow') {
                const operation = operationFor(node, { phase: draft.body.mode === 'native-unified' ? phaseForNode(draft.body, node) : draft.body.mode.slice(7), mode: draft.body.mode });
                if (!operation) return fail('UNKNOWN_OPERATION', 'Cannot hash an unknown operation.');
                const controls = {};
                for (const controlId of operation.controls) {
                    if (operation.family === 'Introspection' && node[controlId] === undefined && !Object.hasOwn(operation.defaults, controlId)) continue;
                    const control = describeExposedControl({ ...node, phase: operation.phase }, controlId);
                    if (!control.ok) return control;
                    // Draft is the pre-existing Transpose behavior. Its newly declared
                    // editor field must neither change old pins nor enter old bodies.
                    if (operation.family === 'Transpose' && controlId === 'inputKind' && control.data.default === 'draft') {
                        delete node.inputKind;
                        continue;
                    }
                    // Additive defaults preserve both prior version-1 pins and old saved bodies.
                    if ((node.operation === 'compose' && controlId === 'budgetTokens' && control.data.default === 0) || (node.operation === 'for-each' && controlId === 'roleOverrides' && !Object.keys(control.data.default ?? {}).length) || (node.operation === 'scene-context' && controlId === 'visibilityMode' && control.data.default === 'actor') || (node.operation === 'format' && controlId === 'jsonShape' && control.data.default === 'records') || (['read-file','write-file'].includes(node.operation) && ((controlId === 'actorScope' && control.data.default === 'selected') || (controlId === 'actorId' && control.data.default === '')))) {
                        delete node[controlId];
                        continue;
                    }
                    node[controlId] = structuredClone(control.data.default);
                    if (node.operation !== 'reroute' || controlId !== 'artifactKind') controls[controlId] = node[controlId];
                }
                // Existing patch validation consumes these literals outside its catalog controls.
                if (node.operation === 'validate-patches') {
                    node.protectedLiterals ??= [];
                    controls.protectedLiterals = node.protectedLiterals;
                }
                node.operationVersion ??= 1;
                node.modelRole ??= operation.modelRole;
                Object.assign(controls, semanticControlsForNode(node, operation));
                nodes[id] = { ...common, operation: node.operation, operationVersion: node.operationVersion, modelRole: node.modelRole, binding: portableBinding(node, true), controls,
                    ...(node.operation === 'reroute' ? pick(node, ['artifactKind', 'phase']) : {}),
                    ...(draft.body.mode === 'native-unified' ? { phase: operation.phase } : {}) };
            } else if (node.type === 'subgraph') {
                if (!record(node.definition)) return fail('DEFINITION_REF', 'An instance requires an exact definition reference.');
                nodes[id] = { ...common, definition: pick(node.definition, ['id', 'version', 'semanticHash']), parameterOverrides: node.parameterOverrides ?? {}, roleOverrides: mapRecords(node.roleOverrides, portableBinding), nodeBindingOverrides: mapRecords(node.nodeBindingOverrides, portableBinding) };
            } else if (node.type === 'subgraph-input' || node.type === 'subgraph-output') nodes[id] = { ...common, interfacePortId: node.interfacePortId };
            else return fail('UNKNOWN_OPERATION', 'Cannot hash an unknown node type.');
        }
        const semantic = {
            interface: draft.interface.map(port => pick(port, ['id', 'kind', 'direction', 'required', 'cardinality', 'boundaryNodeId'])),
            parameters: draft.parameters.map(parameter => ({ id: parameter.id, target: pick(parameter.target, ['instancePath', 'nodeId', 'controlId']) })),
            body: {
                schema: draft.body.schema, runtime: draft.body.runtime, mode: draft.body.mode, nodes,
                wires: mapRecords(draft.body.wires, wire => pick(wire, ['id', 'route', 'from', 'fromPort', 'to', 'toPort', 'portalId'])),
                portals: mapRecords(draft.body.portals, portal => ({ id: portal.id, kind: portal.kind, source: pick(portal.source, ['nodeId', 'portId']) })),
                roles: mapRecords(draft.body.roles, portableBinding),
            },
        };
        const canonicalContent = JSON.stringify(canonical(semantic));
        const materialized = cloneDefinitionData(draft);
        if (!materialized.ok) return materialized;
        return { ok: true, data: { canonicalContent, semanticHash: sha256Text(canonicalContent), materializedDefinition: materialized.data, topologyValidated: false } };
    } catch { return fail('DEFINITION_BODY', 'Cannot derive identity from malformed body metadata.'); }
}

/** Check one exact pin and same-ID/version identity conflicts in a bounded local table.
 * Never fetches missing definitions. This does not validate nested refs or executable topology.
 * @param {unknown} reference
 * @param {unknown} snapshots
 * @returns {import('./types').Result<any>}
 */
export function inspectPinnedDefinitionIdentity(reference, snapshots) {
    const checkedRef = cloneDefinitionData(reference), checkedTable = cloneDefinitionData(snapshots);
    if (!checkedRef.ok) return checkedRef;
    if (!checkedTable.ok) return checkedTable;
    const ref = checkedRef.data, table = checkedTable.data;
    if (!record(ref) || !idText(ref.id) || !Number.isSafeInteger(ref.version) || ref.version < 1 || typeof ref.semanticHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(ref.semanticHash)) return fail('DEFINITION_REF', 'Expected an exact definition ID, version and SHA-256 hash.');
    if (!record(table)) return fail('DEFINITION_REF', 'Expected a local snapshot table.');
    const key = definitionRefKey(ref);
    if (!Object.hasOwn(table, key)) return fail('MISSING_DEFINITION', 'The exact pinned definition is not bundled.');
    const snapshot = table[key];
    if (!record(snapshot) || snapshot.id !== ref.id || snapshot.version !== ref.version || snapshot.semanticHash !== ref.semanticHash) return fail('DEFINITION_REF', 'Snapshot metadata does not match its exact pin.');
    const identity = computeDefinitionIdentity(snapshot);
    if (!identity.ok) return identity;
    if (identity.data.semanticHash !== ref.semanticHash) return fail('DEFINITION_HASH', 'Pinned hash does not match canonical semantic content.');
    for (const [otherKey, other] of Object.entries(table)) {
        if (otherKey === key || !record(other) || other.id !== ref.id || other.version !== ref.version) continue;
        const otherIdentity = computeDefinitionIdentity(other);
        if (!otherIdentity.ok) return otherIdentity;
        if (otherIdentity.data.canonicalContent !== identity.data.canonicalContent) return fail('DEFINITION_CONFLICT', 'The same definition ID and version has different canonical content.');
        if (other.semanticHash !== otherIdentity.data.semanticHash || otherKey !== definitionRefKey(other)) return fail('DEFINITION_REF', 'A duplicate snapshot has inconsistent identity metadata.');
    }
    return { ok: true, data: { ...identity.data, ref: Object.freeze({ id: ref.id, version: ref.version, semanticHash: ref.semanticHash }), topologyValidated: false } };
}

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotate = (value, count) => (value >>> count) | (value << (32 - count));
/** SHA-256 of TextEncoder UTF-8 bytes, formatted as sha256:<64 lowercase hex digits>.
 * Synchronous and browser-only; callers bound untrusted input before hashing.
 * @param {string} text
 * @returns {string}
 */
export function sha256Text(text) {
    const input = new TextEncoder().encode(text);
    const bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
    bytes.set(input); bytes[input.length] = 0x80;
    const view = new DataView(bytes.buffer);
    view.setUint32(bytes.length - 8, Math.floor(input.length / 0x20000000));
    view.setUint32(bytes.length - 4, (input.length * 8) >>> 0);
    const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const words = new Uint32Array(64);
    for (let offset = 0; offset < bytes.length; offset += 64) {
        for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const a = words[i - 15], b = words[i - 2];
            words[i] = words[i - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) + words[i - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10));
        }
        let [a, b, c, d, e, f, g, h] = hash;
        for (let i = 0; i < 64; i++) {
            const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i] + words[i]) >>> 0;
            const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            h = g; g = f; f = e; e = (d + first) >>> 0; d = c; c = b; b = a; a = (first + second) >>> 0;
        }
        [a, b, c, d, e, f, g, h].forEach((value, i) => { hash[i] = (hash[i] + value) >>> 0; });
    }
    return `sha256:${hash.map(value => value.toString(16).padStart(8, '0')).join('')}`;
}
