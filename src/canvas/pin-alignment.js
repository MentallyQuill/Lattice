/**
 * Align the interactive wrapper, glyph and measured wire anchor with label ink.
 * Called synchronously before Canvas caches card geometry. Screen measurements
 * are converted back to graph pixels so alignment is independent of zoom.
 */
const contexts = new WeakMap();

/** Read only the first or last rendered line; ordinary single-line pins skip this. */
function edgeLineText(label, fromEnd) {
    const doc = label.ownerDocument, walker = doc.createTreeWalker(label, 4);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    if (fromEnd) nodes.reverse();
    const range = doc.createRange();
    let lineTop, text = '';
    for (const node of nodes) {
        const value = node.textContent ?? '';
        for (let step = 0; step < value.length; step++) {
            const index = fromEnd ? value.length - 1 - step : step;
            range.setStart(node, index); range.setEnd(node, index + 1);
            const bounds = range.getBoundingClientRect();
            if (!bounds.height) continue;
            if (lineTop === undefined) lineTop = bounds.top;
            else if (Math.abs(bounds.top - lineTop) > .01) return text;
            text = fromEnd ? value[index] + text : text + value[index];
        }
    }
    return text;
}

/** Batch every probe write before baseline reads, then clean up before pin writes. */
export function alignCardsPins(cards, zoom = 1) {
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const rows = [];
    for (const card of cards) {
        const doc = card.ownerDocument, view = doc.defaultView;
        for (const row of card.querySelectorAll('.pc-native-row')) {
            const label = row.querySelector('.pc-native-pin-label'), pin = row.querySelector('.pc-port');
            if (!label || !pin) continue;
            const bounds = row.getBoundingClientRect(), labelBox = label.getBoundingClientRect();
            const style = view.getComputedStyle(label);
            const item = { label, pin, bounds, style, offset: '0px' };
            rows.push(item);
            if (!bounds.height || !labelBox.height || style.display === 'none') continue;
            if (!contexts.has(doc)) {
                let context = null;
                try { context = doc.createElement('canvas').getContext('2d'); } catch { /* Retain the line-box center without Canvas. */ }
                contexts.set(doc, context);
            }
            item.context = contexts.get(doc);
            if (!item.context) continue;
            item.first = doc.createElement('span'); item.last = doc.createElement('span');
            for (const probe of [item.first, item.last]) {
                probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
                probe.setAttribute('aria-hidden', 'true');
            }
        }
    }
    try {
        for (const item of rows) if (item.first) { item.label.prepend(item.first); item.label.append(item.last); }
        for (const item of rows) if (item.first) {
            const firstBaseline = item.first.getBoundingClientRect().top, lastBaseline = item.last.getBoundingClientRect().top;
            const wrapped = Math.abs(lastBaseline - firstBaseline) > .01;
            const { context, style, label, bounds } = item;
            context.font = style.font || `${style.fontSize} ${style.fontFamily}`;
            const firstMetrics = context.measureText(wrapped ? edgeLineText(label, false) : label.textContent ?? '');
            const lastMetrics = wrapped ? context.measureText(edgeLineText(label, true)) : firstMetrics;
            const ascent = firstMetrics.actualBoundingBoxAscent, descent = lastMetrics.actualBoundingBoxDescent;
            if (!Number.isFinite(ascent) || !Number.isFinite(descent)) { item.offset = null; continue; }
            // Only the top and bottom rendered lines define the visible ink edges.
            const center = (firstBaseline + lastBaseline + (descent - ascent) * scale) / 2;
            item.offset = `${(center - bounds.top - bounds.height / 2) / scale}px`;
        }
    } finally {
        for (const item of rows) if (item.first) { item.first.remove(); item.last.remove(); }
    }
    for (const item of rows) if (item.offset !== null && item.pin.style.getPropertyValue('--pc-pin-y') !== item.offset) {
        item.pin.style.setProperty('--pc-pin-y', item.offset);
    }
}

export function alignCardPins(card, zoom = 1) { alignCardsPins([card], zoom); }
