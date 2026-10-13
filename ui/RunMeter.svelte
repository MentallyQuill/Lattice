<script lang="ts">
    import type { RunMeterView } from './run-meter-types';
    let { view, open }: { view: RunMeterView | null; open?: () => void } = $props();
    const label = (status: string) => status === 'empty' ? 'Ready' : status === 'not-run' ? 'Not run' : status.charAt(0).toUpperCase() + status.slice(1);
    const priority = ['cancelling', 'running', 'failed', 'blocked', 'cancelled', 'invalid', 'stale', 'queued', 'waiting', 'not-run'];
    let pixels = $derived.by(() => {
        if (!view) return [];
        const visible = view.rows.slice(0, view.rows.length > 36 ? 35 : 36).map(row => ({ key: 'row:' + row.id, status: row.status, title: row.title + ' · ' + label(row.status) }));
        if (view.rows.length > 36) {
            const remaining = view.rows.slice(35);
            const status = priority.find(value => remaining.some(row => row.status === value)) ?? (remaining.every(row => row.status === 'completed') ? 'completed' : 'not-run');
            visible.push({ key: 'aggregate', status, title: remaining.length + ' remaining rows · ' + label(status) + '. Open run details to inspect every stage.' });
        }
        return visible;
    });
    let description = $derived(view ? 'Open run details. ' + label(view.status) + '. ' + view.completedCount + ' of ' + view.executableCount + ' stages complete. ' + view.actualCalls + ' of ' + view.callBound + ' requests.' : 'Open run details');
</script>

{#if view}
<button class="pc-run-meter" aria-label={description} title={description} disabled={!open} onclick={() => open?.()}>
    <span class="pc-run-meter-label">{label(view.status)}</span>
    {#if view.elapsedMs !== null && Number.isFinite(view.elapsedMs) && view.elapsedMs >= 0}
        <span class="pc-run-meter-elapsed" data-run-elapsed>{(view.elapsedMs / 1000).toFixed(1)}s</span>
    {/if}
    <span class="pc-run-meter-pixels" aria-hidden="true">
        {#each pixels as pixel (pixel.key)}
            <span class="pc-run-pixel" data-run-pixel data-status={pixel.status} title={pixel.title}></span>
        {/each}
    </span>
</button>
{/if}

<style>
    .pc-run-meter { display: flex; align-items: center; gap: 8px; max-width: 100%; min-height: 25px; padding: 4px 8px; border: 1px solid var(--pc-border); border-radius: 2px; background: var(--pc-control); color: var(--pc-text); font: inherit; font-size: 10px; cursor: pointer; box-shadow: none; }
    .pc-run-meter:hover { color: var(--pc-text); background: color-mix(in srgb, var(--pc-text) 7%, var(--pc-control)); }
    .pc-run-meter:focus-visible { outline: 2px solid var(--SmartThemeQuoteColor, #e18a24); outline-offset: 2px; }
    .pc-run-meter:disabled { cursor: default; }
    .pc-run-meter-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pc-run-meter-elapsed { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--pc-muted); }
    .pc-run-meter-pixels { display: grid; grid-template-rows: repeat(3, 4px); grid-auto-columns: 4px; grid-auto-flow: column; gap: 2px; flex: none; }
    .pc-run-pixel { width: 4px; height: 4px; border-radius: 1px; background: #576069; }
    .pc-run-pixel[data-status="completed"] { background: #8aad96; }
    .pc-run-pixel[data-status="queued"] { background: #8b959d; }
    .pc-run-pixel[data-status="running"], .pc-run-pixel[data-status="cancelling"] { background: var(--SmartThemeQuoteColor, #e18a24); box-shadow: 0 0 3px var(--SmartThemeQuoteColor, #e18a24); }
    .pc-run-pixel[data-status="failed"], .pc-run-pixel[data-status="invalid"] { background: #d76a74; }
    .pc-run-pixel[data-status="blocked"] { background: #9a727c; }
    .pc-run-pixel[data-status="stale"] { background: #b19b67; }
    .pc-run-pixel[data-status="cancelled"] { background: #8e8296; }
    .pc-run-pixel[data-status="not-run"] { background: #434a50; }
    @media (prefers-reduced-motion: no-preference) {
        .pc-run-pixel[data-status="running"] { animation: pc-meter-pulse 1.2s ease-in-out infinite; }
        @keyframes pc-meter-pulse { 50% { opacity: .65; } }
    }
</style>
