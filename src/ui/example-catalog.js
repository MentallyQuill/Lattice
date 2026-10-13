import { listWorkflowExampleResults } from '../workflow/examples.js?v=0.27.2';
import { prepareWorkspaceViews } from './workspace-preparation.js?v=0.27.2';
import { nodeCards } from '../canvas/presentation.js?v=0.27.2';
import { isCommentFrame } from '../canvas/comment-frames.js?v=0.27.2';
import { buildConnectionRoute } from '../canvas/connection-route.js?v=0.27.2';
import { diagnosticText } from './diagnostics.js?v=0.27.2';

const PRESENTATION_REVISION = 3;
let cacheKey = '', cachedTiles;
const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};

/** Native preparation only: no host context, runtime, model binding, or execution. */
export function projectWorkflowExamples() {
    const examples = listWorkflowExampleResults();
    const key = JSON.stringify([PRESENTATION_REVISION, examples]);
    if (key === cacheKey) return cachedTiles;
    const tiles = examples.map(example => {
        const tile = { id: example.id, number: example.number, title: example.title, goal: example.goal, lesson: example.lesson };
        if (!example.result.ok) return { ...tile, thumbnail: null, issue: diagnosticText(example.result.error, { action: 'open this example' }) };
        try { return { ...tile, thumbnail: projectThumbnail(example.result.data), issue: '' }; }
        catch (error) { return { ...tile, thumbnail: null, issue: diagnosticText(error, { action: 'preview this example' }) }; }
    });
    // Theme colors stay live CSS roles in the SVG; cached geometry serves every theme.
    cachedTiles = freeze(tiles); cacheKey = key;
    return cachedTiles;
}

function projectThumbnail(graph) {
    const prepared = prepareWorkspaceViews(graph);
    if (!prepared.ok) throw new Error(`Cannot preview example ${graph.name}: ${prepared.error?.message || 'Invalid workflow'}`);
    const drawing = prepared.data.preparedViews.find(view => view.identity.kind === 'root').drawBase;
    const comments = Object.values(drawing.nodes).filter(isCommentFrame).map(node => ({
        id: node.id, x: node.x, y: node.y, w: node.w, h: node.h,
        title: node.title || 'Comment', content: node.content || '', color: node.color || '#637d89',
    }));
    const cards = nodeCards(Object.values(drawing.nodes).filter(node => !isCommentFrame(node)), { graph: drawing });
    const nodes = cards.map(card => {
        const rows = Math.max(0, ...card.ports.map(port => port.row));
        const h = 32 + rows * 24 + (card.hostResult ? 28 : 0) + (card.type === 'note' ? 42 : 0);
        return {
            id: card.id, x: card.x, y: card.y, w: card.w, h, title: card.title,
            className: card.className, iconPath: card.iconPath, body: card.body,
            ports: card.ports.map(port => ({ ...port, x: card.x + (port.side === 'left' ? 12 : card.w - 12), y: card.y + 28 + (port.row - 0.5) * 24 })),
        };
    });
    const byId = new Map(nodes.map(node => [node.id, node]));
    const groups = Object.values(drawing.groups ?? {}).map(group => {
        const members = [...nodes, ...comments].filter(node => drawing.nodes[node.id].inGroup === group.id);
        if (!members.length) return { id: group.id, title: group.title || 'Group', ...(group.frame ?? { x: group.x ?? 0, y: group.y ?? 0, w: group.w || 260, h: 140 }) };
        const x = Math.min(...members.map(node => node.x)) - 24, y = Math.min(...members.map(node => node.y)) - 48;
        const right = Math.max(...members.map(node => node.x + node.w)) + 24, bottom = Math.max(...members.map(node => node.y + node.h)) + 24;
        const frame = group.frame;
        const left = frame ? Math.min(frame.x, x) : x, top = frame ? Math.min(frame.y, y) : y;
        return { id: group.id, title: group.title || 'Group', x: left, y: top, w: Math.max(frame ? frame.x + frame.w : right, right) - left, h: Math.max(frame ? frame.y + frame.h : bottom, bottom) - top };
    });
    const points = [...nodes, ...comments, ...groups].flatMap(node => [{ x: node.x, y: node.y }, { x: node.x + node.w, y: node.y + node.h }]);
    const wires = Object.values(drawing.wires).map(wire => {
        const from = byId.get(wire.from)?.ports.find(port => port.dir === 'out' && port.port === wire.fromPort);
        const to = byId.get(wire.to)?.ports.find(port => port.dir === 'in' && port.port === wire.toPort);
        if (!from || !to) throw new Error(`Cannot preview named pins for example wire ${wire.id}`);
        const route = buildConnectionRoute(from, to);
        const coordinates = route.d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) || [];
        for (let index = 0; index < coordinates.length; index += 2) points.push({ x: coordinates[index], y: coordinates[index + 1] });
        return { id: wire.id, d: route.d, kind: from.kind, from: { nodeId: wire.from, portId: wire.fromPort }, to: { nodeId: wire.to, portId: wire.toPort } };
    });
    const left = Math.min(...points.map(point => point.x)), top = Math.min(...points.map(point => point.y));
    const right = Math.max(...points.map(point => point.x)), bottom = Math.max(...points.map(point => point.y));
    return { bounds: { x: left - 24, y: top - 24, w: right - left + 48, h: bottom - top + 48 }, nodes, wires, comments, groups };
}
