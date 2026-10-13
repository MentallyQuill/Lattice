import { transitionNativeGesture } from '../canvas/native-gestures.js?v=0.27.1';
import { cloneDefinitionData } from '../workflow/definitions.js?v=0.27.1';
import { isNativeSearchCatalog, filterNativeSearchChoices, matchNativeSearchPorts, resolveNativeSearchChoice } from './native-search-catalog.js?v=0.27.1';
import { diagnosticText } from './diagnostics.js?v=0.27.1';

const freshCancellation = new Set(['escape', 'pointercancel', 'blur', 'view-change', 'dismiss-search', 'cancel']);
const endpoint = pin => ({ nodeId: pin.nodeId, portId: pin.portId });
const message = result => diagnosticText(result?.error, { action: 'edit this connection' });
const rejected = reason => ({ ok: false, error: { code: 'INVALID_GESTURE', message: reason } });
const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
    return value;
};
function eventRecord(value) {
    try {
        if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
        const copy = {};
        for (const key of Reflect.ownKeys(value)) {
            const property = Object.getOwnPropertyDescriptor(value, key);
            if (typeof key !== 'string' || key === 'capture' || key === 'current' || !property?.enumerable || !Object.hasOwn(property, 'value')) return null;
            Object.defineProperty(copy, key, { value: property.value, enumerable: true });
        }
        return copy;
    } catch { return null; }
}
function point(value) {
    const copied = cloneDefinitionData(value);
    return copied.ok && Object.keys(copied.data ?? {}).length === 2 && Number.isFinite(copied.data?.x) && Number.isFinite(copied.data?.y) ? copied.data : null;
}
function admittedBindings(value) {
    try {
        if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
        const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
        if (!Number.isSafeInteger(length) || length > 20000 || Reflect.ownKeys(value).length !== length + 1) return null;
        const result = []; let bytes = 2;
        for (let i = 0; i < length; i++) {
            const property = Object.getOwnPropertyDescriptor(value, String(i));
            if (!property || !Object.hasOwn(property, 'value')) return null;
            const copied = cloneDefinitionData(property.value);
            if (!copied.ok) return null;
            const binding = copied.data;
            if (!binding || Object.keys(binding).some(key => !['kind', 'id', 'portalId'].includes(key))
                || !['direct', 'portal', 'portal-publisher'].includes(binding.kind)
                || binding.kind !== 'portal-publisher' && !(typeof binding.id === 'string' && binding.id)
                || binding.kind === 'portal-publisher' && !(binding.id || binding.portalId)
                || ['id', 'portalId'].some(key => binding[key] !== undefined && !(typeof binding[key] === 'string' && binding[key]))) return null;
            bytes += new TextEncoder().encode(JSON.stringify(binding)).length + 1;
            if (bytes > 8 * 1024 * 1024) return null;
            result.push(binding);
        }
        return Object.freeze(result);
    } catch { return null; }
}

/** One accepted reducer, with an injected captured full-root prepare/commit adapter.
 * No DOM, graph scans, host calls, transaction bypass, or independent pointer machine.
 * capture and captureNavigation capabilities are kept by identity, never inspected.
 */
export function createNativeWireBridge({ adapter, catalog, onUpdate } = {}) {
    let state = transitionNativeGesture(null, { type: 'cancel' }).state;
    let epoch = 0, nonce = 0, standalone = null, searchOpen = null, menu = null, feedback = '', lastCapture = null;
    let finalPreparation = null;
    const advanceEpoch = () => { epoch++; finalPreparation = null; };
    const captures = new WeakMap();
    const current = capture => {
        const record = captures.get(capture);
        if (!record || record.epoch !== epoch) return false;
        try { return adapter.isCurrent(capture) === true; } catch { return false; }
    };
    const pinInScope = (pin, capturedCatalog) => {
        const copied = cloneDefinitionData(pin);
        if (!copied.ok || !isNativeSearchCatalog(capturedCatalog)) return false;
        const p = copied.data, a = p?.address, scope = capturedCatalog.scope;
        return !!p && Object.keys(p).every(key => ['nodeId', 'portId', 'dir', 'kind', 'center', 'address'].includes(key))
            && ['nodeId', 'portId', 'kind'].every(key => typeof p[key] === 'string' && p[key]) && ['in', 'out'].includes(p.dir) && !!point(p.center)
            && !!a && Object.keys(a).every(key => ['workflowId', 'instancePath', 'nodeId', 'portId'].includes(key))
            && a.workflowId === scope.workflowId && a.nodeId === p.nodeId && a.portId === p.portId
            && Array.isArray(a.instancePath) && a.instancePath.length === scope.viewPath.length && a.instancePath.every((id, i) => id === scope.viewPath[i]);
    };
    const acquire = navigation => {
        if (!isNativeSearchCatalog(catalog)) return null;
        let result;
        try { result = navigation ? adapter.captureNavigation?.() : adapter.capture(); } catch { result = rejected('The graph context is unavailable.'); }
        if (!result?.ok || !result.data || typeof result.data !== 'object') { feedback = message(result); return null; }
        captures.set(result.data, { epoch, catalog, navigation });
        lastCapture = result.data;
        return result.data;
    };
    const searchProjection = () => {
        const owner = standalone ?? searchOpen;
        if (!owner) return null;
        const origin = standalone ? null : state.origin;
        return { key: owner.nonce, mode: state.kind === 'port-choice' && !standalone ? 'ports' : 'nodes',
            screenAnchor: standalone ? standalone.screenAnchor : state.screenAnchor, origin: origin ? { dir: origin.dir, kind: origin.kind } : null,
            contextSensitive: owner.contextSensitive, readOnly: false,
            choices: filterNativeSearchChoices(owner.catalog, { origin, contextSensitive: owner.contextSensitive }),
            ports: state.kind === 'port-choice' && !standalone ? state.ports : [], feedback };
    };
    const project = () => freeze({ gesture: state.kind === 'idle' ? { kind: 'idle' } : {
        kind: state.kind, mode: state.mode, origin: state.origin, ghost: state.ghost, target: state.target, feedback: state.feedback, released: state.released,
    }, search: searchProjection(), menu: menu?.view ?? null, feedback });
    const notify = requests => { const view = project(); onUpdate?.(view, requests); return { view, requests }; };

    const translate = (capture, command) => {
        const record = captures.get(capture);
        if (!record || record.navigation) return null;
        const pinKeys = command.kind === 'connect' ? ['from', 'to'] : ['move-input', 'move-output'].includes(command.kind) ? ['origin', 'target']
            : command.kind === 'disconnect-pin' ? ['pin'] : command.kind === 'create-connect' ? ['origin'] : [];
        if (pinKeys.some(key => !pinInScope(command[key], record.catalog))) return null;
        if (command.kind === 'connect') return { kind: 'connect', origin: endpoint(command.from), target: endpoint(command.to), replace: true };
        if (['move-input', 'move-output'].includes(command.kind)) return { kind: command.kind, origin: endpoint(command.origin), target: endpoint(command.target), replace: true };
        if (command.kind === 'disconnect-wire') return { kind: 'disconnect', edgeIds: [command.wireId] };
        if (command.kind === 'disconnect-pin') return { kind: 'disconnect-pin', pin: endpoint(command.pin), ...(command.publisherPolicy ? { publisherPolicy: command.publisherPolicy } : {}) };
        if (command.kind === 'reroute') return { kind: 'reroute', edgeId: command.wireId, graphPoint: command.graphPoint };
        if (['create-connect', 'create-unconnected'].includes(command.kind)) {
            const choice = resolveNativeSearchChoice(record.catalog, command.choice);
            if (!choice) return null;
            if (command.kind === 'create-connect' && !matchNativeSearchPorts(record.catalog, command.choice, command.origin).some(port => port.portId === command.portId)) return null;
            return { kind: 'create', ...choice, graphPoint: command.graphPoint,
                ...(command.kind === 'create-connect' ? { connection: { origin: endpoint(command.origin), portId: command.portId, replace: true } } : {}) };
        }
        return null;
    };
    const prepare = (capture, command) => {
        try { return adapter.prepare(capture, command); } catch { return rejected('Could not prepare the graph edit.'); }
    };
    const applyCommand = (capture, command, alreadyTranslated = false) => {
        if (!current(capture) || captures.get(capture)?.navigation) return;
        const local = alreadyTranslated ? command : translate(capture, command);
        if (!local) { feedback = 'The captured pin or choice is unavailable.'; return; }
        // Own final work before calling the adapter, even after its visual gesture has closed.
        // Identity guards prevent an obsolete settlement from clearing newer pending work.
        const owner = { epoch };
        finalPreparation = owner;
        const finish = () => { if (finalPreparation === owner) { finalPreparation = null; notify([]); } };
        const result = prepare(capture, local);
        Promise.resolve(result).then(prepared => {
            if (finalPreparation !== owner) return;
            try {
                if (!current(capture)) return;
                if (!prepared?.ok) { feedback = message(prepared); return; }
                if (!prepared.data?.changed) return; // No persistence/history/run cancellation for a no-op.
                let committed;
                try { committed = adapter.commit(capture, prepared.data); } catch { committed = rejected('Could not commit the graph edit.'); }
                if (!committed?.ok) feedback = message(committed);
            } finally { finish(); }
        }, () => {
            if (finalPreparation !== owner) return;
            try { if (current(capture)) feedback = 'Could not prepare the graph edit.'; }
            finally { finish(); }
        });
    };
    const validate = effect => {
        const record = captures.get(effect.capture);
        const local = translate(effect.capture, effect.mode === 'connect' ? { kind: 'connect', from: effect.origin, to: effect.target }
            : { kind: effect.mode, origin: effect.origin, target: effect.target });
        if (!local || !record) {
            transition({ type: 'target-result', capture: effect.capture, requestId: effect.requestId, compatible: false, current: true, reason: 'The pin belongs to a different graph view.' });
            return;
        }
        if (!current(effect.capture)) { transition({ type: 'target-result', capture: effect.capture, requestId: effect.requestId, compatible: false, current: false }); return; }
        Promise.resolve(prepare(effect.capture, local)).then(result => {
            // The preview candidate is discarded. Final release prepares a fresh complete candidate.
            transition({ type: 'target-result', capture: effect.capture, requestId: effect.requestId, compatible: !!result?.ok, current: current(effect.capture), ...(!result?.ok ? { reason: message(result) } : {}) });
        }, () => transition({ type: 'target-result', capture: effect.capture, requestId: effect.requestId, compatible: false, current: current(effect.capture), reason: 'Could not validate this connection.' }));
    };
    const transition = event => {
        const result = transitionNativeGesture(state, event);
        state = result.state; // Install released/search state before requesting DOM capture release.
        const requests = [];
        for (const effect of result.effects) {
            if (['capture-pointer', 'release-pointer', 'consume'].includes(effect.type)) requests.push(effect);
            else if (effect.type === 'validate-target') validate(effect);
            else if (effect.type === 'prepare-command') applyCommand(effect.capture, effect.command);
            else if (effect.type === 'open-search') searchOpen = { capture: effect.capture, catalog: captures.get(effect.capture).catalog, nonce: ++nonce, contextSensitive: true };
            else if (effect.type === 'close-search' || effect.type === 'clear-draft') searchOpen = null;
            else if (effect.type === 'feedback') feedback = effect.reason;
        }
        return notify(requests);
    };
    const cancel = reason => {
        advanceEpoch(); standalone = null; searchOpen = null; menu = null; feedback = '';
        return transition({ type: freshCancellation.has(reason) ? reason : 'cancel' });
    };
    const dispatch = value => {
        let event = eventRecord(value);
        if (!event || typeof event.type !== 'string') return notify([]);
        if (freshCancellation.has(event.type)) return cancel(event.type);
        if (['target-result', 'choose-node', 'choose-port'].includes(event.type)) return notify([]);
        if (event.type === 'begin-pin') {
            if (state.kind !== 'idle' || standalone || menu || !pinInScope(event.pin, catalog)) return notify([]);
            advanceEpoch(); feedback = '';
            const capture = acquire(false);
            return capture ? transition({ ...event, capture, current: true }) : notify([]);
        }
        if (['activate-target', 'wire-double-click'].includes(event.type)) {
            if (state.kind !== 'idle' || standalone || menu) return notify([]);
            if (event.type === 'activate-target') {
                const target = cloneDefinitionData(event.target);
                if (!target.ok) return notify([]);
                event = { ...event, target: target.data };
            }
            const probe = transitionNativeGesture(state, { ...event, capture: lastCapture, current: false });
            if (probe.effects.some(effect => effect.type === 'consume')) { state = probe.state; return notify(probe.effects); }
            if (event.type === 'activate-target' && !event.alt || event.type === 'wire-double-click' && (!event.direct || event.alt || event.ctrl || event.shift || event.meta)
                || event.target?.kind === 'pin' && !pinInScope(event.target.pin, catalog)) return notify([]);
            advanceEpoch(); feedback = ''; const capture = acquire(false);
            return capture ? transition({ ...event, capture, current: true }) : notify([]);
        }
        if (event.type === 'release') return state.kind === 'drag' ? transition({ ...event, capture: state.capture, current: current(state.capture) }) : notify([]);
        return transition(event);
    };
    const actions = () => {
        const owner = standalone ?? searchOpen;
        const menuOwner = menu;
        const live = () => owner && (standalone === owner || searchOpen === owner) && current(owner.capture);
        return { search: owner ? {
            choose(id) {
                if (!live() || !resolveNativeSearchChoice(owner.catalog, id)) return;
                if (standalone === owner) {
                    standalone = null;
                    applyCommand(owner.capture, { kind: 'create-unconnected', choice: id, graphPoint: owner.graphPoint }); notify([]);
                } else if (state.kind === 'search') {
                    const ports = matchNativeSearchPorts(owner.catalog, id, state.origin).map(({ required, ...port }) => port);
                    transition({ type: 'choose-node', capture: owner.capture, choice: id, matchingPorts: ports, contextSensitive: owner.contextSensitive, current: true });
                }
            },
            choosePort(portId) { if (live() && state.kind === 'port-choice') transition({ type: 'choose-port', capture: owner.capture, portId, current: true }); },
            setContextSensitive(enabled) { if (live() && !standalone && state.kind === 'search' && typeof enabled === 'boolean') { owner.contextSensitive = enabled; notify([]); } },
            dismiss() { if (standalone === owner || searchOpen === owner) cancel('dismiss-search'); },
        } : null, menu: menuOwner ? {
            pick(id) {
                if (menu !== menuOwner || !current(menuOwner.capture)) return;
                const action = menuOwner.commands.get(id);
                if (!action || menuOwner.view.entries.find(entry => entry.id === id)?.disabled) return;
                if (action.kind === 'jump') {
                    try { adapter.jump?.(menuOwner.capture, action.target); } catch { feedback = 'The navigation target is unavailable.'; }
                } else {
                    if (menuOwner.view.readOnly || captures.get(menuOwner.capture)?.navigation || !pinInScope(menuOwner.pin, menuOwner.catalog)) return;
                    applyCommand(menuOwner.capture, action, true);
                }
                menu = null; notify([]);
            },
            dismiss() { if (menu === menuOwner) cancel('dismiss-search'); },
        } : null };
    };
    return {
        dispatch, project, actions, cancel,
        hasContentGesture: () => state.kind !== 'idle' || !!standalone || !!menu || finalPreparation?.epoch === epoch,
        disconnectWires(edgeIds) {
            const copied = cloneDefinitionData(edgeIds);
            if (!copied.ok || !Array.isArray(copied.data) || !copied.data.length || copied.data.length > 2000
                || copied.data.some(id => typeof id !== 'string' || !id) || !isNativeSearchCatalog(catalog)) return notify([]);
            cancel('cancel'); const capture = acquire(false);
            if (capture) applyCommand(capture, { kind: 'disconnect', edgeIds: [...new Set(copied.data)] }, true);
            return notify([]);
        },
        openUnconnectedSearch(value) {
            const input = eventRecord(value);
            if (!input || Object.keys(input).some(key => !['graphPoint', 'screenAnchor'].includes(key))) return notify([]);
            const graph = point(input.graphPoint), screen = point(input.screenAnchor);
            if (!graph || !screen || !isNativeSearchCatalog(catalog)) return notify([]);
            cancel('cancel'); const capture = acquire(false);
            if (capture) standalone = { capture, catalog, nonce: ++nonce, contextSensitive: false, graphPoint: graph, screenAnchor: screen };
            return notify([]);
        },
        openPinMenu(value) {
            const input = eventRecord(value);
            if (!input || Object.keys(input).some(key => !['pin', 'screenAnchor', 'originalBindings', 'readOnly', 'jumps'].includes(key))) return notify([]);
            const copied = cloneDefinitionData({ pin: input.pin, screenAnchor: input.screenAnchor, readOnly: input.readOnly ?? false, jumps: input.jumps ?? [] });
            const bindings = admittedBindings(input.originalBindings ?? []);
            if (!copied.ok || !bindings || !pinInScope(copied.data.pin, catalog) || !point(copied.data.screenAnchor) || typeof copied.data.readOnly !== 'boolean' || !Array.isArray(copied.data.jumps)) return notify([]);
            const data = copied.data, p = data.pin;
            if (!['in', 'out'].includes(p.dir) || typeof p.kind !== 'string' || !point(p.center)
                || data.jumps.some(jump => !jump || Object.keys(jump).some(key => !['id', 'label', 'target'].includes(key)) || typeof jump.id !== 'string' || !jump.id || typeof jump.label !== 'string' || !jump.target || typeof jump.target !== 'object')
                || new Set(data.jumps.map(jump => jump.id)).size !== data.jumps.length) return notify([]);
            cancel('cancel'); const capture = acquire(data.readOnly);
            if (!capture) return notify([]);
            const entries = [], commands = new Map();
            const add = (id, label, command, disabled = false, reason) => {
                const navigation = command.kind === 'jump';
                entries.push({ id, label, capability: navigation ? 'navigation' : 'edit', disabled: disabled || !navigation && data.readOnly,
                    ...(!navigation && data.readOnly ? { reason: 'This graph view is read-only.' } : reason ? { reason } : {}) });
                commands.set(id, command);
            };
            add('break-all', 'Break all links', { kind: 'disconnect-pin', pin: endpoint(p) }, !bindings.length);
            for (const id of new Set(bindings.filter(binding => binding.kind !== 'portal-publisher').map(binding => binding.id))) add('cut:' + id, 'Break link · ' + id, { kind: 'disconnect', edgeIds: [id] });
            const publishers = [...new Set(bindings.filter(binding => binding.kind === 'portal-publisher').map(binding => binding.portalId ?? binding.id))];
            if (p.dir === 'out' && publishers.length) {
                add('remove-publishers', 'Remove publishers and connections', { kind: 'disconnect-pin', pin: endpoint(p), publisherPolicy: 'disconnect' });
                for (const id of publishers) add('restore-publisher:' + id, 'Restore publisher to wires · ' + id, { kind: 'disconnect', publisherIds: [id], publisherPolicy: 'restore' });
            }
            for (const jump of data.jumps) add('jump:' + jump.id, jump.label, { kind: 'jump', target: jump.target });
            menu = { capture, catalog, pin: p, commands, view: freeze({ key: ++nonce, title: p.nodeId + ' · ' + p.portId, kind: p.kind, readOnly: data.readOnly, screenAnchor: data.screenAnchor, entries }) };
            return notify([]);
        },
        replaceCatalog(next) { cancel('view-change'); catalog = next; return notify([]); },
    };
}
