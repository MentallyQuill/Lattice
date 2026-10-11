import { phaseForNode, portsForNode } from '../../src/workflow/catalog.js';

const lifecycle = new Set(['on-send', 'generate-reply', 'review-publish']);
const intersects = (operations, choices) => choices.some(operation => operations.has(operation));

const atX = (line, x) => line.y1 + line.slope * (x - line.x1);
const textWidth = text => [...String(text)].reduce((sum, character) => sum +
    (/[ilI.,'`:;!| ]/.test(character) ? 3 : /[mwMW@%]/.test(character) ? 9.5 : /[A-Z]/.test(character) ? 7.5 : 6), 0);
function intrinsicWidth(node, ports) {
    const labelWidth = direction => Math.max(0, ...ports.filter(port => port.direction === direction).map(port => textWidth(port.label)));
    return Math.min(300, Math.max(38 + textWidth(node.alias || node.title || node.type),
        66 + labelWidth('input') + labelWidth('output')));
}
function sharedSpan(a, b) {
    const left = Math.max(a.x1, b.x1), right = Math.min(a.x2, b.x2);
    if (right <= left) return 0;
    // A crossing is fine. Penalize only the length for which two middle spans
    // run close enough to look like one wire, including shallow fan-outs.
    const factor = Math.min(Math.hypot(1, a.slope), Math.hypot(1, b.slope));
    const tolerance = 8 * factor;
    const difference = atX(a, left) - atX(b, left), slope = a.slope - b.slope;
    if (Math.abs(slope) < .000001) return Math.abs(difference) < tolerance ? (right - left) * factor : 0;
    const roots = [(-tolerance - difference) / slope, (tolerance - difference) / slope].sort((a, b) => a - b);
    return Math.max(0, Math.min(right - left, roots[1]) - Math.max(0, roots[0])) * factor;
}

function arrangeBands(nodes, edges, bands, pins, top) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    let bandTop = top;
    for (const band of bands) {
        const columns = new Map();
        for (const node of band.nodes) {
            if (!columns.has(node.x)) columns.set(node.x, []);
            columns.get(node.x).push(node);
        }
        const height = Math.max(...[...columns.values()].map(column => column.reduce((sum, node) => sum + node.h + 64, -64))) + 288;
        band.top = bandTop;
        band.bottom = bandTop + height;
        for (const [columnIndex, column] of [...columns.values()].entries()) {
            let y = bandTop + columnIndex % 4 * 24;
            for (const node of column) { node.y = y; y += node.h + 64; }
        }
        bandTop += height + 155;
    }
    const lines = widthAdjustment => edges.map(edge => {
        const from = byId.get(edge.from), to = byId.get(edge.to);
        const width = widthAdjustment === null ? from.w : Math.min(from.w, Math.max(54, pins.get(from.id).width + widthAdjustment));
        const x1 = from.x + width + 19, x2 = to.x - 19;
        const y1 = from.y + (pins.get(from.id).offsets.get('output:' + edge.fromPort) ?? 40);
        const y2 = to.y + (pins.get(to.id).offsets.get('input:' + edge.toPort) ?? 40);
        return { ...edge, x1, x2, y1, y2, slope: (y2 - y1) / (x2 - x1) };
    });
    const score = () => {
        let cost = nodes.reduce((sum, node) => sum + node.y * .01, 0);
        // Native cards fit their title and named pins, up to the saved 300px
        // envelope. Check both that envelope (also used by thumbnails) and an
        // intrinsic text-width estimate so shorter live cards remain readable.
        for (const widthAdjustment of [null, -20, 0, 20]) {
            const spans = lines(widthAdjustment);
            for (let index = 0; index < spans.length; index++) {
                const line = spans[index];
                cost += Math.hypot(line.x2 - line.x1, line.y2 - line.y1) * .02;
                for (const other of spans.slice(index + 1)) {
                    const merged = sharedSpan(line, other);
                    if (merged > 96) cost += 10000 + merged * 100;
                }
                for (const node of nodes) {
                    if (node.id === line.from || node.id === line.to) continue;
                    const left = Math.max(line.x1, node.x - 12), right = Math.min(line.x2, node.x + node.w + 12);
                    if (right <= left) continue;
                    const ys = [atX(line, left), atX(line, right)];
                    if (Math.min(...ys) < node.y + node.h && Math.max(...ys) > node.y - 12) cost += 20000 + (right - left) * 100;
                }
            }
        }
        return cost;
    };
    // This runs only while authoring portable examples, never in the editor.
    // Fixed band bounds keep groups separate while the local search clears
    // card obstructions and merged wires. Stable traversal makes regeneration
    // deterministic and leaves deliberate short crossings alone.
    const improve = passes => {
        let bestScore = score();
        for (let pass = 0; pass < passes; pass++) {
            let changed = false;
            for (const band of bands) for (const node of (pass % 2 ? [...band.nodes].reverse() : band.nodes)) {
                const original = node.y;
                let bestY = original;
                for (let y = band.top; y <= band.bottom - node.h; y += 24) {
                    if (band.nodes.some(other => other !== node && other.x === node.x && y < other.y + other.h + 56 && y + node.h + 56 > other.y)) continue;
                    node.y = y;
                    const candidate = score();
                    if (candidate < bestScore - .001) { bestScore = candidate; bestY = y; }
                }
                node.y = bestY;
                changed ||= bestY !== original;
            }
            if (!changed) break;
        }
    };
    improve(6);
    // The search needs spare lanes to reorder boxes. Remove unused space once
    // the lanes are chosen, then recheck cross-band wires at the compact spacing.
    bandTop = top;
    for (const band of bands) {
        const minY = Math.min(...band.nodes.map(node => node.y));
        const bottom = Math.max(...band.nodes.map(node => node.y + node.h));
        for (const node of band.nodes) node.y += bandTop - minY;
        band.top = bandTop;
        band.bottom = bandTop + bottom - minY + 48;
        bandTop = band.bottom + 155;
    }
    improve(2);
}

function purpose(nodes, phase, actorName) {
    if (actorName) return `Prepare ${actorName}'s private reflection`;
    const operations = new Set(nodes.map(node => node.operation));
    if (intersects(operations, ['write-file', 'commit-clock', 'commit-outcomes']) || nodes.some(node => node.operation === 'memory' && node.mode === 'commit')) return 'Update saved story data';
    if (intersects(operations, ['time-trigger', 'advance-time'])) return 'Plan scheduled story events';
    if (intersects(operations, ['random-pick', 'saved-outcome', 'effect-author', 'stage-outcome'])) return 'Choose an item effect';
    if (intersects(operations, ['prompted-memory', 'recall', 'reflect', 'memory'])) return 'Recall character memories';
    if (intersects(operations, ['event-normalize', 'confirm-events', 'item-use-trigger', 'draft-event-source', 'player-event-source'])) return 'Check story event evidence';
    if (operations.has('revise-draft')) return intersects(operations, ['render-notes', 'append']) ? 'Polish and annotate the reply' : 'Polish the reply';
    if (intersects(operations, ['render-notes', 'append'])) return 'Annotate the reply';
    if (operations.has('response-plan')) return 'Plan the scene';
    if (intersects(operations, ['character-direction', 'actor-context', 'scene-presence'])) return 'Prepare character reactions';
    if (intersects(operations, ['scene-context', 'context-join', 'smart-compactor', 'read-file'])) return 'Prepare scene context';
    return phase === 'post' ? 'Process reply details' : 'Prepare reply guidance';
}

/** Lay out authored examples without changing their connections or operation settings. */
export function layout(graph) {
    const nodes = Object.values(graph.nodes).filter(node => node.type !== 'note');
    const byId = new Map(nodes.map(node => [node.id, node]));
    const edges = Object.values(graph.wires).map(wire => ({
        from: wire.route === 'portal' ? graph.portals?.[wire.portalId]?.source?.nodeId : wire.from,
        fromPort: wire.route === 'portal' ? graph.portals?.[wire.portalId]?.source?.portId : wire.fromPort,
        to: wire.to, toPort: wire.toPort,
    }));
    const parents = new Map(nodes.map(node => [node.id, []]));
    for (const edge of edges) {
        if (!byId.has(edge.from) || !byId.has(edge.to)) throw new Error('Cannot lay out a wire with a missing box');
        parents.get(edge.to).push(edge.from);
    }
    const pending = new Set(byId.keys()), levels = new Map(), stages = new Map();
    while (pending.size) {
        let progressed = false;
        for (const id of [...pending]) {
            const inputs = parents.get(id);
            if (!inputs.every(parent => levels.has(parent))) continue;
            levels.set(id, Math.max(0, ...inputs.map(parent => levels.get(parent) + 1)));
            const node = byId.get(id);
            // Some operations support both phases. Their incoming generation
            // dependencies determine where they belong in the reading order.
            stages.set(id, node.operation === 'generate-reply' || phaseForNode(graph, node) === 'post' || node.phase === 'post' || inputs.some(parent => stages.get(parent) === 'post') ? 'post' : 'pre');
            pending.delete(id);
            progressed = true;
        }
        if (!progressed) throw new Error('Cannot lay out cyclic graph');
    }
    // Delay shorter input chains until immediately before their first consumer.
    // Longest-path ranking alone strands every independent source on the left.
    const children = new Map(nodes.map(node => [node.id, []]));
    for (const edge of edges) children.get(edge.from).push(edge.to);
    for (const id of [...levels.keys()].reverse()) {
        const outputs = children.get(id);
        if (outputs.length) levels.set(id, Math.min(...outputs.map(child => levels.get(child))) - 1);
    }
    const pins = new Map();
    for (const node of nodes) {
        delete node.inGroup;
        node.x = 100 + levels.get(node.id) * 400;
        node.w = 300;
        const ports = portsForNode(graph, node), rows = { input: 0, output: 0 };
        pins.set(node.id, { width: intrinsicWidth(node, ports), offsets: new Map(ports.map(port => [port.direction + ':' + port.id, 40 + rows[port.direction]++ * 24])) });
        // Reserve named-pin rows, heading, actions and compact aliases without
        // leaving a large empty rectangle under every ordinary card.
        node.h = Math.max(140, 84 + Math.max(rows.input, rows.output) * 28);
    }
    graph.groups = {};
    const helper = nodes.some(node => ['subgraph-input', 'subgraph-output'].includes(node.type));
    const components = [];
    if (!helper && nodes.length > 8) {
        // Paired actor perspectives share evidence, but each actor's private
        // reflection is a separate system worth inspecting on its own.
        const actorContexts = nodes.filter(node => node.operation === 'actor-context' && node.id.endsWith('-context'));
        const actorBranches = actorContexts.length > 1 ? actorContexts.map(node => {
            const prefix = node.id.slice(0, -'-context'.length);
            return { prefix, name: prefix.replace(/(^|-)([a-z])/g, (_, separator, letter) => (separator ? ' ' : '') + letter.toUpperCase()) };
        }) : [];
        const branchFor = id => actorBranches.find(branch => id.startsWith(branch.prefix + '-'));
        const eligible = new Set(nodes.filter(node => !lifecycle.has(node.operation)).map(node => node.id));
        const neighbors = new Map([...eligible].map(id => [id, []]));
        for (const { from, to } of edges) if (eligible.has(from) && eligible.has(to) && stages.get(from) === stages.get(to) && branchFor(from) === branchFor(to)) {
            neighbors.get(from).push(to);
            neighbors.get(to).push(from);
        }
        const pieces = [];
        while (eligible.size) {
            const first = eligible.values().next().value, ids = [], queue = [first];
            eligible.delete(first);
            while (queue.length) {
                const id = queue.shift();
                ids.push(id);
                for (const neighbor of neighbors.get(id)) if (eligible.delete(neighbor)) queue.push(neighbor);
            }
            pieces.push({ nodes: ids.map(id => byId.get(id)), phase: stages.get(first), actorName: branchFor(first)?.name });
        }
        components.push(...pieces.filter(piece => piece.nodes.length >= 2));
        // A lone settlement box belongs beside the projection it consumes.
        // Keeping it in the lifecycle band creates long, nearly vertical
        // parallel wires back across the entire processing group.
        for (const piece of pieces.filter(piece => piece.nodes.length === 1)) {
            const node = piece.nodes[0];
            const adjacent = components.find(component => component.actorName === piece.actorName &&
                edges.some(edge => component.nodes.some(member =>
                    edge.from === member.id && edge.to === node.id || edge.to === member.id && edge.from === node.id)));
            if (adjacent) adjacent.nodes.push(node);
        }
    }
    const grouped = new Set(components.flatMap(component => component.nodes.map(node => node.id)));
    const free = nodes.filter(node => !grouped.has(node.id));
    // Each complete processing group has its own band. Ungrouped lifecycle
    // boxes stay together above them, so no frame surrounds unrelated work.
    const bands = [...(free.length ? [{ nodes: free }] : []), ...components.sort((a, b) => (a.phase === 'pre' ? 0 : 1) - (b.phase === 'pre' ? 0 : 1))];
    const commentBottom = Math.max(0, ...Object.values(graph.nodes).filter(node => node.type === 'note').map(node => node.y + node.h));
    arrangeBands(nodes, edges, bands, pins, Math.max(240, commentBottom + 80));
    for (const band of bands) {
        const bottom = Math.max(...band.nodes.map(node => node.y + node.h));
        if (band.phase) {
            const id = 'processing-' + band.nodes[0].id;
            const x = Math.min(...band.nodes.map(node => node.x)) - 25;
            const y = Math.min(...band.nodes.map(node => node.y)) - 50;
            const right = Math.max(...band.nodes.map(node => node.x + node.w)) + 25;
            const title = purpose(band.nodes, band.phase, band.actorName);
            graph.groups[id] = {
                id, title, description: 'These connected boxes work together. Follow their wires to see how each result is used.',
                x, y, w: right - x, h: bottom + 25 - y, collapsed: false,
                members: band.nodes.map(node => node.id), color: band.phase === 'pre' ? '#284e67' : '#57416e',
            };
            for (const node of band.nodes) node.inGroup = id;
        }
    }
}
