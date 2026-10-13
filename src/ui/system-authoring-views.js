import { portsForNode } from '../workflow/catalog.js?v=0.27.3';
import { createGraphViewSession } from './graph-view-session.js?v=0.27.3';
import { viewIdentityKey } from './view-state.js?v=0.27.3';
const fail = message => ({ ok: false, error: { code: 'VIEW_DATA', message } });
const subtree = (view, id) => view.identity.kind === 'instance' && view.identity.instancePath[0] === id;
const touched = (serialized, id) => serialized.views.filter(v => v.identity.kind === 'root' || subtree(v, id)).map(v => structuredClone(v));
/** Exercise the exact view operations in a disposable bounded session before editing Main. */
export function preflightSystemViews(root, prepared, persisted, instanceId) {
    const created = createGraphViewSession({ root, activationId: 'system-preflight', ...prepared, persisted });
    if (!created.ok)
        return created;
    const session = created.data;
    if (session.project().warnings.length)
        return fail('The retained graph views cannot be restored.');
    const key = viewIdentityKey({ kind: 'root', workflowId: root.id });
    const selected = session.updateView({ selection: { primary: { kind: 'node', id: instanceId }, multi: [] } }, key);
    if (!selected.ok)
        return selected;
    const opened = session.openInstance([instanceId]);
    if (!opened.ok)
        return opened;
    const serialized = session.serialize();
    return serialized.ok ? { ok: true, data: { after: serialized.data } } : serialized;
}
export function captureSystemPresentation(before, after, instanceId) { return { instanceId, before: { activeKey: before.activeKey, views: touched(before, instanceId) }, after: { activeKey: after.activeKey, views: touched(after, instanceId) } }; }
/** Capture newly opened descendants immediately before history refresh prunes them. */
export function refreshSystemPresentation(effect, serialized, direction) {
    if (direction === 'undo')
        effect.after.views = touched(serialized, effect.instanceId);
    // Preserve the action's focus: later tabs/cameras outside the inserted subtree are independent.
    return effect;
}
export function restoreSystemViews(session, snapshots, activeKey) {
    for (const snapshot of snapshots) {
        const key = viewIdentityKey(snapshot.identity);
        if (snapshot.identity.kind === 'instance') {
            const opened = session.openInstance(snapshot.identity.instancePath);
            if (!opened.ok)
                return opened;
        }
        const patch = Object.fromEntries(['camera', 'selection', 'inspector', 'nodePresentation', 'portalPresentation', 'groupPresentation'].filter(k => snapshot[k] !== undefined).map(k => [k, structuredClone(snapshot[k])]));
        const updated = session.updateView(patch, key);
        if (!updated.ok)
            return updated;
        if (snapshot.identity.kind === 'instance' && !snapshot.open) {
            const closed = session.closeView(key);
            if (!closed.ok)
                return closed;
        }
    }
    return session.focusView(activeKey);
}

/** Reserve a wrapper and optional adjacent Compose in deterministic vacant Main space. */
export function vacantSystemPoint(root) {
    // Main may be hidden behind a child tab, so its geometry cannot use the
    // active canvas cache. Reserve conservative named-pin height from root DTOs.
    const bottom = Object.values(root.nodes ?? {}).map(node => {
        const ports = portsForNode(root, node), rows = Math.max(ports.filter(p => p.direction === 'input').length, ports.filter(p => p.direction === 'output').length);
        return (node.y ?? 0) + Math.max(node.h ?? 180, 120 + rows * 32) + 24;
    });
    return { x: 120, y: Math.max(100, ...bottom) };
}
