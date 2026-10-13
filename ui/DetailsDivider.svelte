<script lang="ts">
    import { onDestroy } from 'svelte';
    let { width, min = 220, max = 520, preview, change, start }: { width: number; min?: number; max?: number; preview: (width: number | null) => void; change: (width: number) => void; start: () => void } = $props();
    let handle: HTMLDivElement;
    let drag: { id: number; x: number; width: number; current: number } | null = null;
    const clamp = (value: number) => Math.max(min, Math.min(max, value));
    function finish(rollback = false, pointerId = drag?.id) {
        if (!drag || drag.id !== pointerId) return;
        const completed = drag; drag = null;
        preview(null);
        if (handle.hasPointerCapture(completed.id)) handle.releasePointerCapture(completed.id);
        if (!rollback) change(clamp(completed.current));
    }
    function cancel() { finish(true); }
    function down(event: PointerEvent) {
        if (event.button !== 0 || event.isPrimary === false) return;
        cancel(); event.preventDefault(); event.stopPropagation(); start();
        drag = { id: event.pointerId, x: event.clientX, width, current: width };
        handle.setPointerCapture(event.pointerId); handle.focus({ preventScroll: true });
    }
    function move(event: PointerEvent) {
        if (drag?.id !== event.pointerId) return;
        drag.current = clamp(drag.width + drag.x - event.clientX); preview(drag.current);
    }
    function key(event: KeyboardEvent) {
        if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); cancel(); return; }
        const delta = event.shiftKey ? 40 : 12;
        const value = event.key === 'ArrowLeft' ? width + delta : event.key === 'ArrowRight' ? width - delta : event.key === 'Home' ? min : event.key === 'End' ? max : null;
        if (value === null) return;
        event.preventDefault(); event.stopPropagation(); cancel(); start(); change(clamp(value));
    }
    onDestroy(cancel);
</script>
<svelte:window onblur={cancel} />
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (A pane separator needs keyboard resizing.) -->
<div class="pc-details-divider" role="separator" aria-label="Resize Details" aria-orientation="vertical" aria-valuemin={min} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(width)} tabindex="0" bind:this={handle} onpointerdown={down} onpointermove={move} onpointerup={(event) => finish(false, event.pointerId)} onpointercancel={(event) => finish(true, event.pointerId)} onlostpointercapture={(event) => finish(true, event.pointerId)} onkeydown={key}></div>
<style>
    .pc-details-divider { position: relative; flex: 0 0 8px; width: 8px; align-self: stretch; cursor: ew-resize; touch-action: none; }
    .pc-details-divider::after { content: ''; position: absolute; top: 50%; left: 3px; width: 2px; height: 38px; transform: translateY(-50%); background: var(--pc-muted); }
    .pc-details-divider:hover::after, .pc-details-divider:focus-visible::after { background: var(--pc-accent); }
    .pc-details-divider:focus-visible { outline: 1px solid var(--pc-accent); outline-offset: -1px; }
    @media (max-width: 860px) { .pc-details-divider { display: none; } }
</style>
