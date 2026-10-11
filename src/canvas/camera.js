/** Normalize WheelEvent units before applying continuous cursor-centered zoom. */
export function wheelFactor(delta, mode = 0, height = 800) {
    if (!Number.isFinite(delta)) return 1;
    const pixels = delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
    return Math.exp(-Math.max(-240, Math.min(240, pixels)) * 0.002);
}

/** Both graph cameras use unmodified brackets for keyboard zoom. */
export function zoomShortcutFactor(event) {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
    return event.key === ']' ? 1.15 : event.key === '[' ? 1 / 1.15 : null;
}

export function graphPoint(view, point) {
    return { x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom };
}

export function zoomAt(view, factor, point) {
    if (!Number.isFinite(factor) || factor <= 0) return false;
    return zoomTo(view, view.zoom * factor, point);
}

/** Set an absolute scale so an animated endpoint does not accumulate rounding. */
export function zoomTo(view, zoom, point) {
    if (!Number.isFinite(zoom) || zoom <= 0) return false;
    const next = Math.max(0.25, Math.min(2.5, zoom));
    if (next === view.zoom) return false;
    const ratio = next / view.zoom;
    view.x = point.x - (point.x - view.x) * ratio;
    view.y = point.y - (point.y - view.y) * ratio;
    view.zoom = next;
    return true;
}
