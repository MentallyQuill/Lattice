// Context identifies declared JSON payload slots, never arbitrary nested lookalikes.
const operations = new Set(['condition', 'select-fields', 'format']);
export const prototypeJsonKey = key => ['__proto__', 'prototype', 'constructor'].includes(key);
export const ownJsonData = (value, key) => value !== null && typeof value === 'object' && ['string','number','symbol'].includes(typeof key) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const graph = value => record(value) && ownJsonData(value,'schema') === 3 && ownJsonData(value,'runtime') === 2 && record(ownJsonData(value,'nodes')) && record(ownJsonData(value,'wires'));
const definition = value => record(value) && typeof ownJsonData(value,'id') === 'string' && Number.isSafeInteger(ownJsonData(value,'version')) && graph(ownJsonData(value,'body')) && Array.isArray(ownJsonData(value,'interface')) && Array.isArray(ownJsonData(value,'parameters'));
const generic = () => ({ kind: 'metadata' });
const node = value => ({ kind: 'node', operation: ownJsonData(value,'type') === 'workflow' && operations.has(ownJsonData(value,'operation')) ? ownJsonData(value,'operation') : undefined });
const controls = operation => ({ kind: 'controls', operation: operations.has(operation) ? operation : undefined });
const table = value => record(value) && Reflect.ownKeys(value).length > 0 && Reflect.ownKeys(value).every(key => {
    const entry = ownJsonData(value,key);
    return typeof key === 'string' && definition(entry) && key === JSON.stringify([ownJsonData(entry,'id'),ownJsonData(entry,'version'),ownJsonData(entry,'semanticHash')]);
});

/** Internal callers explicitly identify detached controls, commands or descriptors. */
function rootContext(value, options) {
    if (options.operation !== undefined) return controls(options.operation);
    if (options.node) return node(value);
    if (options.descriptor) return { kind: 'descriptor', operation: operations.has(options.descriptorOperation) ? options.descriptorOperation : undefined, controlId: options.controlId };
    if (options.command || options.snapshotEnvelope) return { kind: 'command', operation: options.controlsOperation, valueKind: options.commandValueKind, definitionDraft: options.definitionDraft };
    if (graph(value)) return { kind: 'graph' };
    if (definition(value)) return { kind: 'definition' };
    if (table(value)) return { kind: 'definitions' };
    const names = record(value) ? Reflect.ownKeys(value) : [];
    if (record(ownJsonData(value,'definitions')) && names.every(key => ['definitions','entries'].includes(key))) return { kind: 'library' };
    const kind = ownJsonData(value,'kind');
    if (['lattice-document','lattice-workflow','lattice-subgraph'].includes(kind)) return { kind: 'envelope' };
    if (graph(ownJsonData(value,'graph')) && names.every(key => ['graph','workspaceViews'].includes(key))) return { kind: 'envelope' };
    if (definition(ownJsonData(value,'definition')) && names.every(key => ['definition','definitions'].includes(key))) return { kind: 'envelope' };
    return generic();
}

export function semanticJsonRootContext(value, options = {}) {
    const context = rootContext(value, options);
    return { ...context, snapshots: options.snapshots ?? (context.kind === 'definitions' ? value : ownJsonData(value,'definitions') ?? (context.kind === 'command' ? ownJsonData(value,'snapshots') : undefined) ?? ownJsonData(ownJsonData(value,'graph'),'definitions')) };
}
function exactDefinition(reference, snapshots) {
    if (!record(reference) || !record(snapshots)) return undefined;
    const id = ownJsonData(reference,'id'), version = ownJsonData(reference,'version'), hash = ownJsonData(reference,'semanticHash');
    if (typeof id !== 'string' || !Number.isSafeInteger(version) || typeof hash !== 'string') return undefined;
    const found = ownJsonData(snapshots, JSON.stringify([id,version,hash]));
    return definition(found) ? found : undefined;
}
function exposedSlots(instance, snapshots) {
    let pinned = exactDefinition(ownJsonData(instance,'definition'), snapshots);
    if (!pinned) return new Map();
    const declared = ownJsonData(pinned,'parameters'), slots = new Map();
    for (let index = 0; index < declared.length; index++) {
        const parameter = ownJsonData(declared,String(index)), target = ownJsonData(parameter,'target'), path = ownJsonData(target,'instancePath');
        if (!Array.isArray(path) || path.length > 8) continue;
        let scope = pinned;
        for (let step = 0; step < path.length && scope; step++) {
            const pathKey = ownJsonData(path,String(step));
            if (typeof pathKey !== 'string') { scope = undefined; break; }
            const nested = ownJsonData(ownJsonData(ownJsonData(scope,'body'),'nodes'), pathKey);
            scope = ownJsonData(nested,'type') === 'subgraph' ? exactDefinition(ownJsonData(nested,'definition'),snapshots) : undefined;
        }
        const targetId = ownJsonData(target,'nodeId');
        if (typeof targetId !== 'string') continue;
        const primitive = ownJsonData(ownJsonData(ownJsonData(scope,'body'),'nodes'),targetId);
        if (ownJsonData(primitive,'type') !== 'workflow') continue;
        const operation = ownJsonData(primitive,'operation'), controlId = ownJsonData(target,'controlId'), id = ownJsonData(parameter,'id');
        if (typeof id !== 'string') continue;
        if (operation === 'condition' && controlId === 'value') slots.set(id,'payload');
        if (['select-fields','format'].includes(operation) && controlId === 'fields') slots.set(id,'mapping-list');
    }
    return slots;
}

function childContext(parent, key, context) {
    if (context.kind === 'payload') return { kind: 'payload' };
    if (context.kind === 'graph' && key === 'nodes') return { kind: 'nodes' };
    if (['graph','library','envelope'].includes(context.kind) && key === 'definitions') return { kind: 'definitions' };
    if (context.kind === 'definitions') return definition(ownJsonData(parent,key)) ? { kind: 'definition' } : generic();
    if (context.kind === 'nodes') return node(ownJsonData(parent,key));
    if (context.kind === 'node' && key === 'parameterOverrides' && ownJsonData(parent,'type') === 'subgraph') return { kind: 'parameters', slots: exposedSlots(parent,context.snapshots) };
    if (context.kind === 'parameters' && context.slots.has(key)) return { kind: context.slots.get(key), ...(context.slots.get(key) === 'payload' ? { root: true } : {}) };
    if (context.kind === 'definition' && key === 'body') return { kind: 'graph' };
    if (context.kind === 'envelope' && key === 'graph' && graph(ownJsonData(parent,key))) return { kind: 'graph' };
    if (context.kind === 'envelope' && key === 'definition' && definition(ownJsonData(parent,key))) return { kind: 'definition' };
    if (context.kind === 'command' && key === 'controls') return controls(context.operation);
    if (context.kind === 'command' && key === 'value' && ['payload','mapping-list'].includes(context.valueKind)) return { kind: context.valueKind, ...(context.valueKind === 'payload' ? { root: true } : {}) };
    if (context.kind === 'command' && key === 'draft' && context.definitionDraft && definition(ownJsonData(parent,key))) return { kind: 'definition' };
    if (context.kind === 'command' && key === 'definition' && ownJsonData(parent,'kind') === 'create-instance' && definition(ownJsonData(parent,key))) return { kind: 'definition' };
    if (context.kind === 'command' && key === 'snapshots') return { kind: 'definitions' };
    if (context.kind === 'descriptor' && key === 'default') {
        if (ownJsonData(parent,'type') === 'json-value') return { kind: 'payload', root: true };
        if (['select-fields','format'].includes(context.operation) && context.controlId === 'fields') return { kind: 'mapping-list' };
    }
    if (['node','controls'].includes(context.kind)) {
        if (context.operation === 'condition' && key === 'value') return { kind: 'payload', root: true };
        if (['select-fields','format'].includes(context.operation) && key === 'fields') return { kind: 'mapping-list' };
    }
    if (context.kind === 'mapping-list' && Array.isArray(parent) && /^(0|[1-9]\d*)$/.test(key)) return { kind: 'mapping' };
    if (context.kind === 'mapping' && key === 'default') return { kind: 'payload', root: true };
    return generic();
}

export function semanticJsonChildContext(parent, key, context) {
    return { ...childContext(parent,key,context), snapshots: context.snapshots };
}


/** Callers pass an admitted actual root; detached commands never infer payload authority. */
export function semanticJsonCommandOptions(root, command) {
    const snapshots = ownJsonData(root,'definitions'), path = ownJsonData(command,'viewPath');
    const options = { command: true, snapshots };
    if (!Array.isArray(path) || path.length > 8) return options;
    let scope = root;
    for (let index = 0; index < path.length; index++) {
        const key = ownJsonData(path,String(index));
        if (typeof key !== 'string') return options;
        const instance = ownJsonData(ownJsonData(scope,'nodes'),key);
        const pinned = ownJsonData(instance,'type') === 'subgraph' ? exactDefinition(ownJsonData(instance,'definition'),snapshots) : undefined;
        if (!pinned) return options;
        scope = ownJsonData(pinned,'body');
    }
    const key = ownJsonData(command,'nodeId');
    if (typeof key !== 'string') return options;
    const selected = ownJsonData(ownJsonData(scope,'nodes'),key), kind = ownJsonData(command,'kind');
    if (kind === 'controls' && ownJsonData(selected,'type') === 'workflow') return {...options, controlsOperation: ownJsonData(selected,'operation')};
    const parameterId = ownJsonData(command,'parameterId');
    if (kind === 'parameter-override' && ownJsonData(command,'mode') === 'set' && ownJsonData(selected,'type') === 'subgraph' && typeof parameterId === 'string') return {...options, commandValueKind: exposedSlots(selected,snapshots).get(parameterId)};
    return options;
}
