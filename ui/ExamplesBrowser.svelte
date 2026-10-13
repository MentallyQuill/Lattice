<script lang="ts">
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import { onDestroy, onMount, tick } from 'svelte';
    import type { WorkflowExampleTile } from './types';
    import ArtifactPin from './ArtifactPin.svelte';
    let { examples = [], issue = '', loading = false, retry, scrollTop = 0, scroll, open }: { examples?: readonly WorkflowExampleTile[]; issue?: string; loading?: boolean; retry?: () => boolean | void | Promise<boolean | void>; scrollTop?: number; scroll: (top: number) => void; open: (id: string) => boolean | Promise<boolean> } = $props();
    let grid: HTMLDivElement;
    let detailHeading = $state<HTMLHeadingElement>();
    let searchInput = $state<HTMLInputElement>();
    let opening = $state('');
    let query = $state('');
    let difficulty = $state('');
    let selectedId = $state('');
    let visiblePreviews = $state(new Set<string>());
    let previewObserver: IntersectionObserver | null = null;
    const previewIds = new WeakMap<Element, string>();
    const difficulties = ['Foundations', 'Composition', 'Advanced', 'Capstone'];
    let filtered = $derived(examples.filter(example => {
        if (difficulty && example.lesson?.difficulty !== difficulty) return false;
        const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
        return terms.every(term => example.searchText.includes(term));
    }));
    let selected = $derived(examples.find(example => example.id === selectedId));
    onMount(() => { grid.scrollTop = scrollTop; });
    onDestroy(() => previewObserver?.disconnect());
    function setPreviewVisible(id: string, visible: boolean) {
        if (visiblePreviews.has(id) === visible) return;
        const next = new Set(visiblePreviews);
        if (visible) next.add(id); else next.delete(id);
        visiblePreviews = next;
    }
    function previewVisibility(node: SVGSVGElement, id: string) {
        if (!globalThis.IntersectionObserver) { setPreviewVisible(id, true); return; }
        previewIds.set(node, id);
        previewObserver ??= new IntersectionObserver(entries => {
            for (const entry of entries) {
                const previewId = previewIds.get(entry.target);
                if (previewId) setPreviewVisible(previewId, entry.isIntersecting);
            }
        }, { root: grid, rootMargin: '144px 0px' });
        previewObserver.observe(node);
        return { destroy() { previewObserver?.unobserve(node); previewIds.delete(node); setPreviewVisible(id, false); } };
    }
    async function details(id: string) {
        selectedId = selectedId === id ? '' : id;
        if (selectedId) {
            await tick();
            grid.scrollTop = 0;
            detailHeading?.focus();
        }
    }
    async function closeDetails(id: string) {
        selectedId = '';
        await tick();
        const trigger = Array.from(grid.querySelectorAll<HTMLButtonElement>('.pc-example-details-button')).find(button => button.dataset.exampleId === id);
        (trigger ?? searchInput)?.focus();
    }
    async function choose(id: string) {
        if (opening) return;
        opening = id;
        try { await open(id); } finally { opening = ''; }
    }
</script>

{#if issue}<div class="pc-examples-issue"><DiagnosticMessage {issue} />{#if retry}<button type="button" class="pc-btn menu_button" onclick={() => retry?.()}>Reload examples</button>{/if}</div>{/if}
<div class="pc-examples-filters">
    <label>Search lessons<input bind:this={searchInput} aria-label="Search lessons" type="search" placeholder="Goal, node or technique" bind:value={query} /></label>
    <label>Difficulty<select aria-label="Difficulty" bind:value={difficulty}><option value="">All difficulties</option>{#each difficulties as band}<option value={band}>{band}</option>{/each}</select></label>
    <span class="pc-examples-count" role="status">{filtered.length} of {examples.length} lessons</span>
</div>
<div class="pc-examples-grid" bind:this={grid} onscroll={(event) => scroll(event.currentTarget.scrollTop)} aria-busy={loading || !!opening}>
    {#if selected}
        <section class="pc-example-details" aria-label={`Lesson ${selected.number} details`}>
            <header><h3 bind:this={detailHeading} tabindex="-1">{selected.number}. {selected.title}</h3><button type="button" class="pc-btn menu_button" aria-label="Close lesson details" onclick={() => closeDetails(selected.id)}>Close</button></header>
            <p>{selected.goal}</p>
            {#if selected.lesson}
                <p class="pc-example-focus"><strong>{selected.lesson.difficulty}</strong> · {selected.lesson.focus}</p>
                <h4>Learn</h4><ul>{#each selected.lesson.learn as item}<li>{item}</li>{/each}</ul>
                <h4>Setup</h4><ul>{#each selected.lesson.requirements as item}<li>{item}</li>{/each}</ul>
                <h4>Try the lesson</h4><ol>{#each selected.lesson.steps as item}<li>{item}</li>{/each}</ol>
                <h4>Checkpoints</h4><ul>{#each selected.lesson.checkpoints as item}<li data-checkpoint><strong>{item.node} → {item.port}</strong><span>{item.expect}</span></li>{/each}</ul>
                <h4>Experiments</h4><ul>{#each selected.lesson.experiments as item}<li><strong>{item.change}</strong><span>{item.expect}</span></li>{/each}</ul>
                <h4>Expected cases</h4><ul>{#each selected.lesson.cases as item}<li><strong>{item.when}</strong><span>{item.expect}</span></li>{/each}</ul>
                <p><strong>Auxiliary call budget:</strong> {selected.lesson.callBudget}</p>
            {/if}
            {#if selected.issue}<div id={`pc-example-issue-${selected.number}`}><DiagnosticMessage issue={selected.issue} /></div>{/if}
            <button type="button" class="pc-btn menu_button" disabled={!!opening || !selected.thumbnail} onclick={() => choose(selected.id)}>Open independent copy</button>
        </section>
    {/if}
    {#if loading && !examples.length}<p class="pc-examples-empty" role="status">Loading examples…</p>{/if}
    {#if !filtered.length && !issue && !loading}<p class="pc-examples-empty">{query.trim() || difficulty ? 'No lessons match your search and difficulty. Clear a filter to see more lessons.' : 'No lessons are available yet. Reload examples to check again.'}</p>{/if}
    {#each filtered as example (example.id)}
        {@const preview = example.thumbnail}
        <article class="pc-example-entry">
        <button type="button" class="pc-example-tile" class:pc-example-unavailable={!preview} aria-label={example.title} aria-describedby={example.issue ? `pc-example-issue-${example.number}` : undefined} title={example.goal} disabled={!!opening || !preview} onclick={() => choose(example.id)}>
            {#if preview}
            <svg class="pc-example-preview" use:previewVisibility={example.id} viewBox={`${preview.bounds.x} ${preview.bounds.y} ${preview.bounds.w} ${preview.bounds.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
                {#if visiblePreviews.has(example.id)}
                {#each preview.groups as group (group.id)}
                    <g class="pc-example-group" data-id={group.id}>
                        <rect x={group.x} y={group.y} width={group.w} height={group.h} rx="6" />
                        <text x={group.x + 12} y={group.y + 24}>{group.title}</text>
                    </g>
                {/each}
                {#each preview.comments as comment (comment.id)}
                    <g class="pc-example-comment" data-id={comment.id}>
                        <rect x={comment.x} y={comment.y} width={comment.w} height={comment.h} rx="4" style:stroke={comment.color} />
                        <text x={comment.x + 12} y={comment.y + 24}>{comment.title}</text>
                    </g>
                {/each}
                {#each preview.wires as wire (wire.id)}<path class="pc-wire pc-wire-native" data-kind={wire.kind} data-id={wire.id} d={wire.d} />{/each}
                {#each preview.nodes as node (node.id)}
                    <g class={node.className} data-id={node.id}>
                        <rect class="pc-example-card" x={node.x} y={node.y} width={node.w} height={node.h} rx="4" />
                        {#if node.compact}<svg x={node.x + 8} y={node.y + 7} width="16" height="16" viewBox="0 0 24 24"><path class="pc-example-icon" d={node.iconPath} /></svg>{/if}
                        <text class="pc-example-node-title" x={node.x + (node.compact ? 28 : 8)} y={node.y + 20} textLength={node.title.length * 6 > node.w - (node.compact ? 36 : 16) ? node.w - (node.compact ? 36 : 16) : undefined} lengthAdjust="spacingAndGlyphs">{node.title}</text>
                        {#each node.ports as pin (pin.id)}
                            <ArtifactPin kind={pin.kind} className="pc-example-pin-cue" x={pin.x - 9} y={pin.y - 9} />
                        {/each}
                    </g>
                {/each}
                {/if}
            </svg>
            {:else}<span class="pc-example-unavailable-preview"><strong>Unavailable</strong><span>Open Lesson details for this example.</span></span>{/if}
            <span class="pc-example-title">{example.number}. {example.title}</span>
            {#if example.lesson}<span class="pc-example-band">{example.lesson.difficulty} · {example.lesson.focus}</span>{/if}
            <span class="pc-example-goal">{example.goal}</span>
        </button>
        {#if example.issue && selectedId !== example.id}<div id={`pc-example-issue-${example.number}`}><DiagnosticMessage issue={example.issue} /></div>{/if}
        <button type="button" class="pc-example-details-button" data-example-id={example.id} aria-label={`Details for ${example.title}`} aria-expanded={selectedId === example.id} onclick={() => details(example.id)}>Lesson details</button>
        </article>
    {/each}
</div>

<style>
    .pc-examples-filters { display: flex; flex: none; align-items: end; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--pc-border); color: var(--pc-muted); font-size: 12px; }
    .pc-examples-filters label { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .pc-examples-filters label:first-child { flex: 1; }
    .pc-examples-filters input, .pc-examples-filters select { box-sizing: border-box; width: 100%; min-width: 0; padding: 5px 6px; color: var(--pc-text); background: var(--pc-canvas); border: 1px solid var(--pc-border); border-radius: 3px; }
    .pc-examples-count { flex: none; padding-bottom: 5px; font-size: 11px; }
    .pc-example-entry { display: flex; flex-direction: column; min-width: 0; }
    .pc-example-details-button { padding: 5px 8px; text-align: left; color: var(--pc-muted); background: var(--pc-block); border: 1px solid var(--pc-border); border-top: 0; border-radius: 0 0 4px 4px; font: 11px system-ui, 'Segoe UI', sans-serif; cursor: pointer; }
    .pc-example-details-button:hover, .pc-example-details-button:focus-visible { color: var(--pc-text); outline-color: var(--pc-accent, var(--pc-flow)); }
    .pc-example-band, .pc-example-goal { padding: 4px 3px 0; color: var(--pc-muted); font: 11px/15px system-ui, 'Segoe UI', sans-serif; }
    .pc-example-band { color: var(--pc-text); }
    .pc-example-goal { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; }
    .pc-example-details, .pc-examples-empty { grid-column: 1 / -1; }
    .pc-example-details { min-width: 0; padding: 12px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-block); color: var(--pc-text); font: 12px/1.5 system-ui, 'Segoe UI', sans-serif; overflow-wrap: anywhere; }
    .pc-example-details header { display: flex; align-items: start; gap: 8px; }
    .pc-example-details h3 { flex: 1; margin: 0; font-size: 14px; }
    .pc-example-details h4 { margin: 14px 0 4px; font-size: 12px; }
    .pc-example-details p { margin: 8px 0; }
    .pc-example-details ul, .pc-example-details ol { margin: 4px 0; padding-left: 22px; }
    .pc-example-details li { margin: 5px 0; }
    .pc-example-details li span { display: block; color: var(--pc-muted); }
    .pc-example-detail-issue { color: var(--pc-warn); }
    .pc-examples-empty { color: var(--pc-muted); font-size: 12px; }
    @media (max-width: 620px) { .pc-examples-filters { flex-wrap: wrap; } .pc-examples-count { width: 100%; } }

    .pc-examples-issue { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--pc-border); color: var(--pc-warn); font-size: 12px; }
    .pc-examples-issue :global(.pc-diagnostic) { flex: 1; }
    .pc-examples-issue button { flex: none; padding: 3px 8px; }
    .pc-examples-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-content: start; gap: 8px; overflow: auto; min-height: 0; flex: 1; padding: 10px; scrollbar-gutter: stable; }
    .pc-example-tile { box-sizing: border-box; display: flex; flex-direction: column; min-width: 0; min-height: 190px; padding: 4px; border: 1px solid var(--pc-border); border-radius: 4px; color: var(--pc-text); background: var(--pc-block); text-align: left; cursor: pointer; }
    .pc-example-tile:hover, .pc-example-tile:focus-visible { border-color: var(--pc-accent, var(--pc-flow)); }
    .pc-example-tile:focus-visible { outline: 2px solid var(--pc-accent, var(--pc-flow)); outline-offset: -2px; }
    .pc-example-tile:disabled { cursor: progress; opacity: .7; }
    .pc-example-tile.pc-example-unavailable { cursor: default; opacity: .8; }
    .pc-example-unavailable-preview { box-sizing: border-box; display: flex; flex-direction: column; flex: none; gap: 4px; width: 100%; height: 72px; padding: 7px; border: 1px solid var(--pc-border); border-radius: 2px; background: var(--pc-canvas); color: var(--pc-muted); font: 11px/14px system-ui, 'Segoe UI', sans-serif; overflow: hidden; }
    .pc-example-unavailable-preview strong { color: var(--pc-warn); font-weight: 500; }
    .pc-example-unavailable-preview > span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
    .pc-example-preview { box-sizing: border-box; display: block; flex: none; width: 100%; height: 72px; border: 1px solid var(--pc-border); border-radius: 2px; background-color: var(--pc-canvas); background-image: radial-gradient(var(--pc-border) .6px, transparent .7px); background-size: 7px 7px; pointer-events: none; }
    .pc-example-title { box-sizing: border-box; display: block; min-height: 30px; line-height: 15px; padding: 4px 3px 0; font: 12px/15px system-ui, 'Segoe UI', sans-serif; }
    .pc-example-card { fill: var(--pc-block); stroke: var(--pc-border); stroke-width: 1.5; }
    .pc-example-preview text { fill: var(--pc-text); font: 12px system-ui, 'Segoe UI', sans-serif; }
    .pc-example-preview .pc-example-node-title { font-weight: 500; }
    .pc-example-icon { fill: none; stroke: var(--pc-muted); stroke-width: 1.5; }
    .pc-example-group rect { fill: color-mix(in srgb, var(--pc-block) 20%, transparent); stroke: var(--pc-muted); stroke-width: 2; stroke-dasharray: 8 5; }
    .pc-example-group text { fill: var(--pc-muted); }
    .pc-example-comment rect { fill: color-mix(in srgb, var(--pc-panel-solid) 45%, transparent); stroke-width: 2; }
    .pc-example-comment text { fill: var(--pc-muted); }
    @media (max-width: 620px) { .pc-examples-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
