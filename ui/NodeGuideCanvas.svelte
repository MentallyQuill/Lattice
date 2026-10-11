<script lang="ts">
    import { flushSync, tick, type Snippet } from 'svelte';
    import type { NodeGuideScene } from '../src/ui/node-guide-scene';
    import CanvasLayer from './CanvasLayer.svelte';
    import { nodeGuideWires, layoutNodeGuideCards, layoutNodeGuideComment } from '../src/ui/node-guide-preview.js';
    import { alignCardPins } from '../src/canvas/pin-alignment.js';
    import { zoomShortcutFactor } from '../src/canvas/camera.js';
    let { scene: providedScene, focusNodeIds = [], footer }: { scene: NodeGuideScene; focusNodeIds?: string[]; footer?: Snippet } = $props();
    let host: HTMLDivElement, layer: ReturnType<typeof CanvasLayer>;
    const actions = { hoverPin() {}, hostResult() {}, group() {} };
    const commentActions = { select() {}, update() {}, command() {} };

    $effect(() => {
        const scene = providedScene, surface = host, renderer = layer;
        if (!surface || !renderer) return;
        const doc = surface.ownerDocument;
        const focus = scene.cards.length > 8 && focusNodeIds.length ? new Set(focusNodeIds) : null;
        if (focus) for (const wire of scene.connections) if (focusNodeIds.includes(wire.from) || focusNodeIds.includes(wire.to)) { focus.add(wire.from); focus.add(wire.to); }
        const events = new AbortController();
        const camera = { x: 0, y: 0, scale: 1 };
        let disposed = false, fitted = false, autoFit = true;
        let drag: { x: number; y: number; originX: number; originY: number } | null = null;
        let pinchDistance = 0;
        const pointers = new Map<number, { x: number; y: number }>();
        let layoutSignature = '';
        const parts = () => renderer.getLayers();

        function apply() {
            const { viewport } = parts();
            viewport.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
            // Keep the production theme's grid layers anchored to the local camera.
            const size = 24 * camera.scale, at = `${camera.x}px ${camera.y}px`, grid = doc.documentElement.dataset.pcGrid;
            if (grid === 'lines') {
                surface.style.backgroundSize = `${size}px ${size}px, ${size}px ${size}px, ${size * 5}px ${size * 5}px, ${size * 5}px ${size * 5}px`;
                surface.style.backgroundPosition = `${at}, ${at}, ${at}, ${at}`;
            } else if (grid === 'paper') {
                surface.style.backgroundSize = `${size * 1.5}px ${size * 1.5}px, 100% 100%`;
                surface.style.backgroundPosition = `${at}, 0 0`;
            } else if (grid === 'scan') {
                surface.style.backgroundSize = 'auto, 100% 100%';
                surface.style.backgroundPosition = '0 0, 0 0';
            } else {
                surface.style.backgroundSize = `${size}px ${size}px`;
                surface.style.backgroundPosition = at;
            }
        }

        function measure() {
            if (disposed || !surface.getClientRects().length || !surface.clientWidth) return null;
            const elements = [...surface.querySelectorAll<HTMLElement>('.pc-node-native, .pc-comment-frame')];
            for (const card of elements) if (card.classList.contains('pc-node-native')) alignCardPins(card, camera.scale);
            const origin = parts().viewport.getBoundingClientRect();
            const anchors = new Map<string, { x: number; y: number; side?: string }>();
            for (const pin of surface.querySelectorAll<HTMLElement>('.pc-port')) {
                const box = pin.getBoundingClientRect();
                anchors.set(`${pin.dataset.node}\0${pin.dataset.port}`, {
                    x: (box.left + box.width / 2 - origin.left) / camera.scale,
                    y: (box.top + box.height / 2 - origin.top) / camera.scale,
                    side: pin.dataset.side,
                });
            }
            const wires = nodeGuideWires(scene.connections, (node, port) => anchors.get(`${node}\0${port}`));
            const surrounding = focus ? elements.filter(card => focus.has(card.dataset.id ?? '')) : elements;
            const bounds = (surrounding.length ? surrounding : elements).reduce((bounds, card) => {
                const x = parseFloat(card.style.left), y = parseFloat(card.style.top);
                return { left: Math.min(bounds.left, x), top: Math.min(bounds.top, y),
                    right: Math.max(bounds.right, x + card.offsetWidth), bottom: Math.max(bounds.bottom, y + card.offsetHeight) };
            }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
            flushSync(() => renderer.setWires(wires, { w: Math.max(2000, bounds.right + 200), h: Math.max(1500, bounds.bottom + 200) }, null));
            return elements.length ? bounds : null;
        }

        function layout() {
            if (scene.cards.length > 8 || !surface.clientWidth) return;
            const elements = [...surface.querySelectorAll<HTMLElement>('.pc-node-native')];
            if (!elements.length) return;
            const comment = surface.querySelector<HTMLElement>('.pc-comment-notes');
            const key = () => surface.clientWidth + ':' + elements.map(card => `${card.dataset.id}:${card.offsetWidth}:${card.offsetHeight}`).join('|') + ':' + (comment?.offsetHeight ?? 0);
            const signature = key();
            if (signature === layoutSignature) return;
            const dimensions = new Map(elements.map(card => [card.dataset.id!, { w: card.offsetWidth, h: card.offsetHeight }]));
            let height;
            if (scene.comments.length) {
                const framed = layoutNodeGuideComment(scene.cards, scene.comments, scene.connections, dimensions, surface.clientWidth, comment?.offsetHeight ?? 0);
                if (!framed) return;
                flushSync(() => { renderer.setPositions(framed.nodes, []); renderer.setComments(framed.comments, commentActions); });
                // Narrowing the real frame wraps its notes. Remeasure that text
                // before settling the contained nodes beneath it.
                const wrapped = layoutNodeGuideComment(scene.cards, scene.comments, scene.connections, dimensions, surface.clientWidth, comment?.offsetHeight ?? 0)!;
                flushSync(() => { renderer.setPositions(wrapped.nodes, []); renderer.setComments(wrapped.comments, commentActions); });
                height = wrapped.comments[0].h;
            } else {
                const positions = layoutNodeGuideCards(scene.cards, scene.connections, dimensions, surface.clientWidth);
                flushSync(() => renderer.setPositions(positions, []));
                height = Math.max(...positions.map(position => position.y + dimensions.get(position.id)!.h));
            }
            layoutSignature = key();
            surface.style.height = surface.clientWidth < 500 ? `${Math.min(650, Math.max(320, height * .92 + 40))}px` : '';
        }

        function fit() {
            layout();
            const bounds = measure();
            if (!bounds) return;
            const padding = 20, width = Math.max(1, bounds.right - bounds.left), height = Math.max(1, bounds.bottom - bounds.top);
            camera.scale = Math.max(.92, Math.min(1.08, (surface.clientWidth - 2 * padding) / width, (surface.clientHeight - 2 * padding) / height));
            camera.x = (surface.clientWidth - width * camera.scale) / 2 - bounds.left * camera.scale;
            camera.y = (surface.clientHeight - height * camera.scale) / 2 - bounds.top * camera.scale;
            autoFit = true;
            apply(); measure();
        }

        function zoom(factor: number, x: number, y: number) {
            const next = Math.max(.1, Math.min(3, camera.scale * factor));
            camera.x = x - (x - camera.x) * next / camera.scale;
            camera.y = y - (y - camera.y) * next / camera.scale;
            camera.scale = next;
            autoFit = false;
            apply(); measure();
        }

        const on = (type: string, handler: EventListener, options: AddEventListenerOptions = {}) =>
            surface.addEventListener(type, handler, { ...options, signal: events.signal });
        on('wheel', raw => {
            const event = raw as WheelEvent;
            event.preventDefault(); event.stopPropagation();
            const box = surface.getBoundingClientRect();
            zoom(Math.exp(-event.deltaY * .002), event.clientX - box.left, event.clientY - box.top);
        }, { passive: false });
        on('pointerdown', raw => {
            const event = raw as PointerEvent;
            if (event.button !== 0 && event.button !== 1) return;
            event.preventDefault(); event.stopPropagation();
            surface.focus({ preventScroll: true });
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            surface.setPointerCapture(event.pointerId);
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); drag = null;
            } else drag = { x: event.clientX, y: event.clientY, originX: camera.x, originY: camera.y };
            surface.classList.add('pc-panning');
        });
        on('pointermove', raw => {
            const event = raw as PointerEvent;
            if (!pointers.has(event.pointerId)) return;
            event.preventDefault(); event.stopPropagation();
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y), box = surface.getBoundingClientRect();
                if (pinchDistance) zoom(distance / pinchDistance, (a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top);
                pinchDistance = distance;
            } else if (drag) {
                camera.x = drag.originX + event.clientX - drag.x;
                camera.y = drag.originY + event.clientY - drag.y;
                autoFit = false; apply();
            }
        });
        const stop = (event: Event) => {
            event.stopPropagation();
            const id = (event as PointerEvent).pointerId;
            // A released capture may immediately emit lostpointercapture again.
            if (!pointers.delete(id)) return;
            if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
            drag = null; pinchDistance = 0;
            if (pointers.size === 1) {
                const [remaining] = pointers.values();
                drag = { x: remaining.x, y: remaining.y, originX: camera.x, originY: camera.y };
            } else if (pointers.size >= 2) {
                const [a, b] = [...pointers.values()];
                pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
            }
            surface.classList.toggle('pc-panning', pointers.size > 0);
        };
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) on(name, stop);
        for (const name of ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) on(name, event => { event.preventDefault(); event.stopPropagation(); });
        on('keydown', raw => {
            const event = raw as KeyboardEvent;
            if (event.key === 'Escape' || event.key === 'Tab') return;
            event.stopPropagation();
            const target = event.target as Element | null;
            if (doc.activeElement !== surface || target?.closest('input, textarea, select, button, summary, a, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"]')) return;
            const factor = pointers.size ? null : zoomShortcutFactor(event);
            if (event.key === 'Home') { event.preventDefault(); fit(); }
            else if (factor !== null) { event.preventDefault(); zoom(factor, surface.clientWidth / 2, surface.clientHeight / 2); }
            else if (event.key.startsWith('Arrow')) {
                event.preventDefault();
                camera.x += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0;
                camera.y += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0;
                autoFit = false; apply();
            }
        });
        const refresh = () => { if (disposed || !fitted) return; if (autoFit) fit(); else { layout(); apply(); measure(); } };
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
        observer?.observe(surface);
        doc.addEventListener('pc-theme', refresh);
        doc.fonts?.addEventListener('loadingdone', refresh);
        void tick().then(() => {
            if (disposed) return;
            flushSync(() => { renderer.setNodes(scene.cards); renderer.setComments(scene.comments, commentActions); });
            const { nodeLayer, commentLayer, svg } = parts();
            nodeLayer.inert = true; commentLayer.inert = true; svg.style.pointerEvents = 'none';
            for (const card of surface.querySelectorAll('.pc-node-native, .pc-comment-frame')) observer?.observe(card);
            fitted = true;
            apply(); fit();
            void doc.fonts?.ready.then(refresh);
        });
        return () => {
            disposed = true; events.abort(); observer?.disconnect();
            doc.removeEventListener('pc-theme', refresh);
            doc.fonts?.removeEventListener('loadingdone', refresh);
            for (const id of pointers.keys()) if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
            pointers.clear(); surface.classList.remove('pc-panning');
        };
    });
</script>
<div class="pc-node-guide-canvas">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (The local canvas supports arrow pan, bracket zoom and Home to fit.) -->
    <div class="pc-canvas-host pc-node-guide-viewport" aria-label="Example node graph" role="region" tabindex="0" bind:this={host}>
        <CanvasLayer {actions} bind:this={layer} />
    </div>
    {#if footer}<div class="pc-node-guide-canvas-footer">{@render footer()}</div>{/if}
</div>
<style>
    .pc-node-guide-canvas { width: 100%; min-width: 0; overflow: hidden; border: 1px solid var(--pc-border); border-radius: var(--pc-r, 4px); }
    .pc-node-guide-canvas :global(.pc-canvas-host.pc-node-guide-viewport) { width: 100%; height: clamp(320px, 55vw, 560px); touch-action: none; user-select: none; }
    .pc-node-guide-canvas-footer { padding: 10px 12px; background: var(--pc-panel); border-top: 1px solid var(--pc-border); }
</style>
