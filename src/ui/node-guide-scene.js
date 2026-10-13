import { prepareWorkspaceViews, prepareLibraryViews } from './workspace-preparation.js?v=0.27.2';
import { definitionRefKey } from '../workflow/definition-data.js?v=0.27.2';
import { nodeCards } from '../canvas/presentation.js?v=0.27.2';
import { isCommentFrame } from '../canvas/comment-frames.js?v=0.27.2';

/** Prepare only detached display data; opening a guide never executes a graph. */
export function prepareNodeGuideScene(graph, { instancePath = [], definitionKey } = {}) {
    const prepared = prepareWorkspaceViews(graph);
    if (!prepared.ok) return prepared;
    const views = prepared.data.preparedViews, root = views.find(view => view.identity.kind === 'root');
    let view = instancePath.length ? views.find(view => view.identity.kind === 'instance' && JSON.stringify(view.identity.instancePath) === JSON.stringify(instancePath)) : root;
    if (definitionKey) {
        const library = prepareLibraryViews(graph.id, graph.definitions ?? {});
        if (!library.ok) return library;
        view = library.data.preparedViews.find(view => definitionRefKey(view.definitionRef) === definitionKey);
    }
    const draw = (view ?? root)?.drawBase;
    if (!draw) return { ok: false, error: { code: 'guide-view-unavailable', message: 'This example has no root canvas to display.' } };
    const cards = nodeCards(Object.values(draw.nodes).filter(node => !isCommentFrame(node)), { graph: draw });
    const connections = Object.values(draw.wires).flatMap(wire => {
        const publisher = wire.route === 'portal' ? draw.portals?.[wire.portalId]?.source : null;
        const from = publisher?.nodeId ?? wire.from, fromPort = publisher?.portId ?? wire.fromPort;
        const source = cards.find(card => card.id === from)?.ports.find(port => port.dir === 'out' && port.port === fromPort);
        if (!source || !wire.to || !wire.toPort) return [];
        return [{ id: wire.id, from, fromPort, to: wire.to, toPort: wire.toPort, kind: source.kind,
            off: draw.nodes[from]?.enabled === false || draw.nodes[wire.to]?.enabled === false }];
    });
    const comments = Object.values(draw.nodes).filter(isCommentFrame).map(node => ({
        id: node.id, x: node.x ?? 0, y: node.y ?? 0, w: node.w > 0 ? node.w : 360, h: node.h > 0 ? node.h : 220,
        title: node.title || 'Comment', content: node.content || '', color: node.color || '#637d89',
        moveContents: node.moveContents !== false, selected: false, readOnly: true,
    }));
    return { ok: true, data: { cards: structuredClone(cards), connections, comments } };
}
