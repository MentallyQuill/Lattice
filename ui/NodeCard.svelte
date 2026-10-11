<script lang="ts">
    import type { RecallBadgeView } from './recall-types';
    import type { NodeCardData, CanvasActions } from './types';
    import ArtifactPin from './ArtifactPin.svelte';
    let { card, actions, recall, status, targeted = false }: { card: NodeCardData; actions: CanvasActions; recall?: RecallBadgeView; status?: string; targeted?: boolean } = $props();
    let element: HTMLDivElement;
    $effect(() => {
        const next = status;
        card.className; // Reapply independent runtime paint after a structural class publication.
        if (!element) return;
        for (const name of [...element.classList]) if (name.startsWith('pc-trace-')) element.classList.remove(name);
        if (next && /^[a-z0-9_-]+$/i.test(next)) element.classList.add('pc-trace-' + next);
    });
    const stop = (event: Event) => event.stopPropagation();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Cards are keyboard focus stops that reveal named pins and actions in overview.) -->
<div bind:this={element} class={card.className} class:pc-recall-capable={card.label==='Recall'||card.label==='Recall Shortcut'} data-id={card.id} data-preview-target={targeted ? 'true' : undefined} title={card.offHint} role="group" tabindex="0" aria-label={`${card.label}: ${card.title}`} style:left={`${card.x}px`} style:top={`${card.y}px`}>
    {#if targeted}<span class="pc-node-target" title="Preview target" role="img" aria-label="Targeted node"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" /><path d="M12 2v5m0 10v5M2 12h5m10 0h5" /></svg></span>{/if}
    <div class="pc-native-heading"><svg class="pc-native-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={card.iconPath} /></svg><span class="pc-node-title" title={card.titleHint}>{card.title}</span>{#if card.modifierSummary}<span class="pc-modifier-badge" title={card.modifierSummary.text} aria-label={card.modifierSummary.text}>+{card.modifierSummary.count}</span>{/if}</div>
    <div class="pc-native-pins">
        {#each card.ports as port (port.id)}
            <div class={`pc-native-row pc-native-row-${port.dir}`} style:grid-row={port.row}>
                <span class="pc-native-pin-label">{port.label}</span>
                <div class={port.className} data-node={card.id} data-dir={port.dir} data-port={port.port} data-side={port.side} data-kind={port.kind} title={port.title} role="img" aria-label={port.title} onmouseenter={() => actions.hoverPin({ nodeId: card.id, dir: port.dir, port: port.port })} onmouseleave={() => actions.hoverPin(null)}><ArtifactPin kind={port.kind} /></div>
            </div>
        {/each}
    </div>
    {#if card.type === 'note'}<div class="pc-node-body">{card.body}</div>{/if}
    {#if card.compact}<span class="pc-native-alias" title={card.titleHint}>{card.title}</span>{/if}
    {#if card.label==='Recall'||card.label==='Recall Shortcut'}<div class="pc-recall-status-space" aria-hidden="true"></div>{/if}
    {#if recall}<button type="button" class="pc-node-recall-status" data-recall-state={recall.state} title={recall.tooltip} aria-label={recall.ariaLabel} onpointerdown={stop} onmousedown={stop} oncontextmenu={stop} onkeydown={stop} onclick={(event)=>{stop(event);actions.openRecallDetails?.(card.id);}}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5a8 8 0 1 1-3 6M3 4v6h6M12 7v5l3 2" />{#if recall.state==='generation'}<path class="pc-recall-marker" d="M17 18h5M19.5 15.5v5" />{:else if recall.state==='acceptance'}<path class="pc-recall-marker" d="m16 18 3 3 4-6" />{/if}</svg>
    </button>{/if}
    {#if card.hostResult}<button type="button" class="pc-node-action pc-host-result" aria-label="Preview host result" onmousedown={stop} onclick={(event) => { stop(event); actions.hostResult(card.id); }}><i class="fa-solid fa-eye" aria-hidden="true"></i> Host result</button>{/if}
</div>

<style>
    .pc-modifier-badge { flex: none; margin-left: auto; padding: 1px 4px; border: 1px solid var(--pc-border); border-radius: 3px; font-size: 9px; line-height: 13px; color: var(--pc-text); background: var(--pc-panel); }
    :global(.pc-node-compact) .pc-modifier-badge { position: absolute; right: -7px; top: -7px; padding: 0 3px; }
    :global(.pc-node-compact[data-preview-target]) .pc-modifier-badge { right: 16px; }
    .pc-node-target { position: absolute; top: -9px; right: -9px; z-index: 3; display: grid; place-items: center; box-sizing: border-box; width: 18px; height: 18px; border: 1px solid var(--pc-accent); border-radius: 50%; color: var(--pc-accent); background: var(--pc-panel-solid, var(--pc-panel)); }
    .pc-node-target svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
</style>
