<script lang="ts">
    import { tick } from 'svelte';
    import type { PinMenuActions, PinMenuEntry, PinMenuView } from './native-wire-types';
    let { view = null, actions = {} }: { view?: PinMenuView | null; actions?: PinMenuActions } = $props();
    const uid = $props.id();
    let popup = $state<HTMLDivElement>();
    let left = $state(8), top = $state(8);
    let opened: string | number | undefined;
    const blocked = (entry: PinMenuEntry) => !!entry.disabled || !!view?.readOnly && entry.capability !== 'navigation';
    function clamp() {
        if (!view || !popup) return;
        const rect = popup.getBoundingClientRect();
        const width = document.documentElement.clientWidth || window.innerWidth;
        const height = document.documentElement.clientHeight || window.innerHeight;
        left = Math.max(8, Math.min(view.screenAnchor.x, width - rect.width - 8));
        top = Math.max(8, Math.min(view.screenAnchor.y, height - rect.height - 8));
    }
    $effect(() => {
        const key = view?.key, anchor = view?.screenAnchor;
        if (key === undefined || !anchor) return;
        const focus = opened !== key; opened = key;
        void tick().then(() => { if (view?.key !== key) return; clamp(); if (focus) (popup?.querySelector<HTMLButtonElement>('[data-entry]:not(:disabled)') ?? popup)?.focus(); });
    });
    function pick(entry: PinMenuEntry) { if (view && !blocked(entry)) actions.pick?.(entry.id); }
    function keydown(event: KeyboardEvent) {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); actions.dismiss?.(); return; }
        const buttons = [...(popup?.querySelectorAll<HTMLButtonElement>('[data-entry]:not(:disabled)') ?? [])];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
        } else if (event.key === 'Enter') {
            const entry = view?.entries.find(entry => entry.id === (document.activeElement as HTMLElement)?.dataset.entry);
            if (entry) { event.preventDefault(); pick(entry); }
        }
    }
</script>

<svelte:window onresize={clamp} />
{#if view}
<div class="pc-pin-menu" role="dialog" aria-label="Pin actions" aria-modal="false" tabindex="-1" bind:this={popup} onkeydown={keydown} style:left="{left}px" style:top="{top}px">
    <div class="pc-menu-head"><h2>{view.title}</h2><button type="button" aria-label="Close pin actions" onclick={() => actions.dismiss?.()}>Close</button></div>
    <p class="pc-kind">{view.kind}{view.readOnly ? ' · Read only' : ''}</p>
    {#each view.entries as entry (entry.id)}<button type="button" class="pc-pin-action" data-entry={entry.id} disabled={blocked(entry)} aria-describedby={entry.reason ? uid + '-reason-' + entry.id : undefined} onclick={() => pick(entry)}>{entry.label}</button>{#if entry.reason}<p class="pc-kind" id={uid + '-reason-' + entry.id}>{entry.reason}</p>{/if}{:else}<p class="pc-empty">No attached links.</p>{/each}
</div>
{/if}

<style>
    .pc-pin-menu { position: fixed; z-index: 12; width: 284px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow: auto; box-sizing: border-box; padding: 6px; background: var(--pc-panel-solid); color: var(--pc-text); border: 1px solid var(--pc-border); border-radius: var(--pc-r); box-shadow: 0 8px 20px #0002; font: 400 14px/1.4 var(--pc-font, system-ui, sans-serif); }
    .pc-menu-head { display: flex; align-items: center; gap: 8px; padding: 5px 8px; }
    h2 { min-width: 0; margin: 0 auto 0 0; font-size: 12px; font-weight: 400; overflow-wrap: anywhere; color: var(--pc-muted); }
    button { box-sizing: border-box; padding: 6px 9px; border: 0; border-radius: 2px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
    button:hover:enabled { background: var(--pc-control); }
    button:disabled { opacity: .55; cursor: default; }
    button:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
    .pc-menu-head button { flex: none; box-shadow: none; }
    .pc-pin-action { display: block; width: 100%; text-align: left; min-height: 31px; overflow-wrap: anywhere; }
    .pc-kind, .pc-empty { padding: 0 8px; margin: 4px 0 6px; color: var(--pc-muted); font-size: 12px; }
</style>
