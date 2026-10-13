import { buildConnectionRoute } from '../canvas/connection-route.js?v=0.27.1';
import { COMMENT_PADDING, COMMENT_HEADER_HEIGHT } from '../canvas/comment-frames.js?v=0.27.1';

/** Routes are measured at the actual named pins, just as in the main canvas. */
export function nodeGuideWires(connections, anchor) {
    return connections.flatMap(connection => {
        const from = anchor(connection.from, connection.fromPort), to = anchor(connection.to, connection.toPort);
        if (!from || !to) return [];
        const route = buildConnectionRoute(from, to);
        return [{ id: connection.id, kind: connection.kind, d: route.d,
            className: 'pc-wire pc-wire-native' + (connection.off ? ' pc-wire-off' : ''),
            label: { ...route.label, text: connection.kind, className: 'pc-wire-label' } }];
    });
}

/** Compact small teaching graphs using measured native card sizes, without editing authored positions. */
export function layoutNodeGuideCards(cards, connections, dimensions, width) {
    const remaining = new Map(cards.map(card => [card.id, card])), ordered = [];
    while (remaining.size) {
        const ready = [...remaining.values()].filter(card => !connections.some(wire => wire.to === card.id && remaining.has(wire.from) && wire.from !== card.id));
        const next = (ready.length ? ready : [...remaining.values()]).sort((a, b) => (a.y - b.y) || (a.x - b.x))[0];
        remaining.delete(next.id); ordered.push(next);
    }
    const narrow = width < 500, available = Math.max(1, (width - 40) / .92), gap = 32;
    let x = 0, y = 0, rowHeight = 0;
    return ordered.map(card => {
        const size = dimensions.get(card.id) ?? { w: 200, h: 100 };
        if (x && (narrow || x + size.w > available)) { x = 0; y += rowHeight + gap; rowHeight = 0; }
        const position = { id: card.id, x, y };
        x += size.w + gap; rowHeight = Math.max(rowHeight, size.h);
        return position;
    });
}

/** Compact one complete teaching frame; preserve unrelated and overlapping comment arrangements. */
export function layoutNodeGuideComment(cards, comments, connections, dimensions, width, textHeight) {
    if (comments.length !== 1 || !cards.length) return null;
    const frame = comments[0];
    const contained = cards.every(card => {
        const size = dimensions.get(card.id);
        return size && card.x >= frame.x && card.y >= frame.y + COMMENT_HEADER_HEIGHT
            && card.x + size.w <= frame.x + frame.w && card.y + size.h <= frame.y + frame.h;
    });
    if (!contained) return null;
    const positions = layoutNodeGuideCards(cards, connections, dimensions, width - 2 * COMMENT_PADDING * .92);
    const contentTop = COMMENT_HEADER_HEIGHT + Math.max(0, textHeight) + COMMENT_PADDING;
    const nodes = positions.map(position => ({ ...position, x: position.x + COMMENT_PADDING, y: position.y + contentTop }));
    const w = Math.max(...nodes.map(node => node.x + dimensions.get(node.id).w)) + COMMENT_PADDING;
    const h = Math.max(...nodes.map(node => node.y + dimensions.get(node.id).h)) + COMMENT_PADDING;
    return { nodes, comments: [{ ...frame, x: 0, y: 0, w, h }] };
}
