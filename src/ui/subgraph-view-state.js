import { viewIdentityKey } from './view-state.js?v=0.27.1';

const fail = (code, message) => ({ ok: false, error: { code, message } });

/** Capture detached retained instance views from trusted serialize().data. */
export function captureRelocatedSubgraphViews(serialized, parentPath, selectedIds, newInstanceId) {
    const selected = new Set(selectedIds);
    const before = serialized.views.filter(view => view.identity.kind === 'instance'
        && view.identity.instancePath.length > parentPath.length
        && parentPath.every((id, index) => view.identity.instancePath[index] === id)
        && selected.has(view.identity.instancePath[parentPath.length])).map(view => structuredClone(view));
    const after = before.map(snapshot => {
        const view = structuredClone(snapshot);
        view.identity.instancePath.splice(parentPath.length, 0, newInstanceId);
        for (const alias of Object.values(view.portalPresentation ?? {})) alias.identity = structuredClone(view.identity);
        return view;
    });
    return { before, after };
}

/** Refresh paired snapshots from trusted outgoing serialized views before pruning.
 * Undo reads the after identities; redo reads the before identities. Missing views
 * retain their previous pair, while live presentation is rebased to both identities.
 * Optional relocation metadata also discovers descendant tabs opened after capture.
 */
export function refreshRelocatedSubgraphViews(effect, serialized, direction) {
    const refreshed = structuredClone({ before: effect.before, after: effect.after });
    if (!['undo', 'redo'].includes(direction)) return refreshed;
    const source = direction === 'undo' ? 'after' : 'before', inverse = direction === 'undo' ? 'before' : 'after';
    const current = new Map(serialized.views.map(view => [viewIdentityKey(view.identity), view]));
    for (let index = 0; index < effect[source].length; index++) {
        const live = current.get(viewIdentityKey(effect[source][index].identity)); if (!live) continue;
        refreshed[source][index] = structuredClone(live);
        const rebased = structuredClone(live); rebased.identity = structuredClone(effect[inverse][index].identity);
        for (const alias of Object.values(rebased.portalPresentation ?? {})) alias.identity = structuredClone(rebased.identity);
        refreshed[inverse][index] = rebased;
    }
    if (effect.relocation) {
        const { parentPath, selectedIds, instanceId } = effect.relocation, depth = parentPath.length;
        const selected = new Set(selectedIds), paired = new Set(refreshed[source].map(view => viewIdentityKey(view.identity)));
        for (const [key, live] of current) {
            const path = live.identity.instancePath, selectedIndex = depth + (direction === 'undo' ? 1 : 0);
            if (live.identity.kind !== 'instance' || paired.has(key) || path.length <= selectedIndex
                || !parentPath.every((id, index) => path[index] === id) || !selected.has(path[selectedIndex])
                || direction === 'undo' && path[depth] !== instanceId) continue;
            const rebased = structuredClone(live);
            if (direction === 'undo') rebased.identity.instancePath.splice(depth, 1);
            else rebased.identity.instancePath.splice(depth, 0, instanceId);
            for (const alias of Object.values(rebased.portalPresentation ?? {})) alias.identity = structuredClone(rebased.identity);
            refreshed[source].push(structuredClone(live)); refreshed[inverse].push(rebased); paired.add(key);
        }
    }
    return refreshed;
}

/** Restore captured instance snapshots through presentation-only session actions.
 * Reports the first action failure and returns focus to the previously active tab.
 */
export function restoreSubgraphViews(session, snapshots) {
    const serialized = session.serialize(); if (!serialized.ok) return serialized;
    const { activeKey, workflowId } = serialized.data;
    if (!Array.isArray(snapshots) || snapshots.some(snapshot => snapshot?.identity?.kind !== 'instance'
        || snapshot.identity.workflowId !== workflowId || !viewIdentityKey(snapshot.identity) || typeof snapshot.open !== 'boolean')) return fail('VIEW_DATA', 'Expected captured instance view presentation for this workflow.');
    let outcome = { ok: true, data: { restoredCount: 0 } };
    for (const snapshot of snapshots) {
        const { identity, open, ...presentation } = snapshot;
        outcome = session.openInstance(identity.instancePath); if (!outcome.ok) break;
        const key = viewIdentityKey(identity);
        outcome = session.updateView({ ...presentation, groupPresentation: presentation.groupPresentation ?? {}, portalPresentation: presentation.portalPresentation ?? {} }, key);
        if (!outcome.ok) break;
        if (!open) { outcome = session.closeView(key); if (!outcome.ok) break; }
    }
    const focused = session.focusView(activeKey);
    return !outcome.ok ? outcome : !focused.ok ? focused : { ok: true, data: { restoredCount: snapshots.length } };
}
