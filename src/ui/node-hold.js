// Canvas gestures and the bundled shelf share this DOM state even though their
// modules are loaded separately. Keep normal hit testing intact for clicks,
// double-clicks, pointer capture, and shelf drop placement.
export function beginNodeHold(document, event) {
    const body = document.body, view = document.defaultView;
    const controller = new view.AbortController();
    const inLattice = target => !!target?.closest?.('.pc-root, .pc-canvas, .pc-node-shelf, .pc-shelf-menu, #pc-sendbar');
    let point = { x: event.clientX, y: event.clientY };
    const remember = event => { point = { x: event.clientX, y: event.clientY }; };
    for (const type of ['pointermove', 'mousemove', 'pointerup', 'mouseup']) {
        view.addEventListener(type, remember, { capture: true, signal: controller.signal });
    }
    for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter']) {
        view.addEventListener(type, event => { if (inLattice(event.target)) event.stopImmediatePropagation(); }, { capture: true, signal: controller.signal });
    }
    body.dataset.pcNodeHolds = String(Number(body.dataset.pcNodeHolds ?? 0) + 1);
    body.classList.add('pc-node-held');
    document.dispatchEvent(new view.Event('pc-node-hold'));
    let released = false;
    return (restore = true) => {
        if (released) return;
        released = true;
        controller.abort();
        const remaining = Number(body.dataset.pcNodeHolds) - 1;
        if (remaining > 0) { body.dataset.pcNodeHolds = String(remaining); return; }
        delete body.dataset.pcNodeHolds;
        body.classList.remove('pc-node-held');
        // CSS hover resumes automatically. Replay enter events after the owning
        // gesture finishes so JS menus and pin feedback follow the current hit.
        if (restore) queueMicrotask(() => {
            if (body.classList.contains('pc-node-held')) return;
            const target = document.elementFromPoint?.(point.x, point.y);
            if (!inLattice(target)) return;
            const init = { clientX: point.x, clientY: point.y, pointerType: event.pointerType || 'mouse' };
            const Pointer = view.PointerEvent ?? view.MouseEvent;
            target.dispatchEvent(new Pointer('pointerover', { ...init, bubbles: true }));
            target.dispatchEvent(new view.MouseEvent('mouseover', { ...init, bubbles: true }));
            for (let element = target; inLattice(element); element = element.parentElement) {
                element.dispatchEvent(new Pointer('pointerenter', init));
                element.dispatchEvent(new view.MouseEvent('mouseenter', init));
            }
        });
    };
}
