<script lang="ts">
    import type { GraphViewInfo, GraphViewActions, GraphDefinitionRef, GraphBreadcrumb } from './view-types';
    let { view, definitionRef, actions = {} }: { view?: GraphViewInfo; definitionRef?: GraphDefinitionRef; actions?: GraphViewActions } = $props();
    const ref = $derived(view?.identity.kind === 'library' ? view.identity.definitionRef : definitionRef ?? view?.definitionRef);
    function canNavigate(crumb: GraphBreadcrumb) { return crumb.identity.kind === 'instance' ? !!actions.openInstance : !!actions.focusView; }
    function navigate(crumb: GraphBreadcrumb) {
        if (crumb.identity.kind === 'instance') actions.openInstance?.(crumb.identity.instancePath);
        else actions.focusView?.(crumb.key);
    }
</script>
{#if view && view.identity.kind !== 'root'}
    <div class="pc-graph-location">
        <nav aria-label="Graph location">
            <ol>
                {#each view.breadcrumbs as crumb, index (crumb.key)}
                    <li>{#if index === view.breadcrumbs.length - 1}<span aria-current="page">{crumb.label}</span>{:else}<button type="button" onclick={() => navigate(crumb)} disabled={!canNavigate(crumb)}>{crumb.label}</button>{/if}</li>
                {/each}
            </ol>
        </nav>
        <span class="pc-graph-scope" title={ref ? `${ref.id} · v${ref.version} · ${ref.semanticHash}` : undefined}>{view.identity.kind === 'library' ? 'Library inspection' : 'Instance graph'}{#if ref} · v{ref.version}{/if}{#if view.readOnly || view.identity.kind === 'library'} · Read only{/if}</span>
    </div>
{/if}
<style>
    .pc-graph-location { display: flex; align-items: center; flex-wrap: wrap; gap: 3px 12px; min-width: 0; padding: 5px 8px; border: 1px solid var(--pc-border); border-bottom: 0; border-radius: 4px 4px 0 0; background: var(--pc-panel-solid); color: var(--pc-muted); font-size: 11px; }
    nav { min-width: 0; flex: 1 1 auto; }
    ol { display: flex; align-items: center; flex-wrap: wrap; gap: 0; padding: 0; margin: 0; list-style: none; }
    li { display: flex; align-items: center; min-width: 0; overflow-wrap: anywhere; }
    li + li::before { content: '›'; margin: 0 6px; color: var(--pc-muted); }
    button { padding: 2px 3px; border: 0; border-radius: 2px; color: var(--pc-text); background: transparent; font: inherit; overflow-wrap: anywhere; text-align: left; }
    button:hover:global(:where(:not(body.pc-node-held *))):not(:disabled) { color: var(--pc-accent); background: var(--pc-panel); }
    button:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: -2px; }
    button:disabled { color: var(--pc-muted); }
    [aria-current="page"] { color: var(--pc-text); padding: 2px 3px; }
    .pc-graph-scope { flex: 0 1 auto; overflow-wrap: anywhere; }
</style>
