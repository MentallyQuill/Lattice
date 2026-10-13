import { workflowDocumentSnapshot } from '../workflow/document-file.js?v=0.27.2';

/** One active document, exact activation identity and successful save checkpoint. */
export function createWorkflowDocumentSession() {
    let graph = null, source = null, workspaceViews = null, checkpoint = null, token = null;
    const listeners = new Set(), draftNamespaces = new WeakMap();
    let namespaceSequence = 0;
    const draftNamespace = () => {
        if (!graph || typeof graph !== 'object') return null;
        if (!draftNamespaces.has(graph)) draftNamespaces.set(graph, 'document-' + ++namespaceSequence);
        return draftNamespaces.get(graph);
    };
    const notify = type => { for (const listener of listeners) { try { listener({ type, graph, source }); } catch { /* A UI listener cannot invalidate document ownership. */ } } };
    const snapshot = (value = graph) => workflowDocumentSnapshot(value, value === graph ? workspaceViews : null);
    const session = {
        activate(value, { source: nextSource = null, workspaceViews: nextViews = null, clean = false } = {}) {
            graph = value; source = nextSource; workspaceViews = nextViews;
            token = Object.freeze({ graph, get workspaceViews() { return workspaceViews; } });
            checkpoint = clean ? snapshot() : null;
            notify('activate');
            return token;
        },
        current: () => graph,
        source(next) { if (arguments.length) { source = next; notify('source'); } return source; },
        workspaceViews(next) { if (arguments.length) { workspaceViews = next; notify('views'); } return workspaceViews; },
        capture: () => token,
        draftNamespace,
        stillCurrent: captured => !!captured && captured === token,
        snapshot,
        dirty: () => !!graph && (checkpoint === null || snapshot() !== checkpoint),
        markSaved(captured, savedSnapshot, nextSource) {
            if (!session.stillCurrent(captured) || typeof savedSnapshot !== 'string') return false;
            checkpoint = savedSnapshot; source = nextSource;
            notify('saved');
            return true;
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    };
    return Object.freeze(session);
}
