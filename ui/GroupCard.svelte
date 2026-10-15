<script lang="ts">
    import type { GroupCardData, CanvasActions } from './types';
    let { group, actions }: { group: GroupCardData; actions: CanvasActions } = $props();
    function down(event: MouseEvent, action: 'open' | 'collapse') { event.stopPropagation(); event.preventDefault(); actions.group(group.id, action); }
    function keyboardClick(event: MouseEvent, action: 'open' | 'collapse') { event.stopPropagation(); if (event.detail === 0) actions.group(group.id, action); }
</script>
<div class={group.className} data-group={group.id} role="group" aria-label={`Group: ${group.title}`} style:left={`${group.x}px`} style:top={`${group.y}px`} style:width={`${group.w}px`} style:height={group.collapsed ? undefined : `${group.h}px`}>
    <div class={group.collapsed ? 'pc-node-head' : 'pc-group-frame-head'}>
        <i class="fa-solid fa-object-group" aria-hidden="true"></i>
        <span class={group.collapsed ? 'pc-node-title' : 'pc-group-frame-title'}>{group.title}</span>
        {#if group.readiness?.state && group.readiness.state!=='ready'}
        <button type="button" class="pc-group-readiness pc-node-action" data-readiness={group.readiness.state} title={group.readiness.description} aria-label={`${group.readiness.label}: ${group.readiness.description}`} onpointerdown={event=>event.stopPropagation()} onmousedown={event=>event.stopPropagation()} oncontextmenu={event=>event.stopPropagation()} onkeydown={event=>event.stopPropagation()} onclick={event=>{event.stopPropagation();actions.openGroupReadiness?.(group.id);}}>{group.readiness.label}</button>
        {/if}
        <span class="pc-group-frame-count">{group.count}</span>
        <button type="button" class={`pc-node-action fa-solid pc-group-btn ${group.collapsed ? 'fa-up-right-and-down-left-from-center' : 'fa-down-left-and-up-right-to-center'}`} data-action={group.collapsed ? 'open' : 'collapse'} title={group.collapsed ? 'Open group' : 'Fold group'} aria-label={group.collapsed ? 'Open group' : 'Fold group'} onmousedown={(e) => down(e, group.collapsed ? 'open' : 'collapse')} onclick={(e) => keyboardClick(e, group.collapsed ? 'open' : 'collapse')}></button>
    </div>
    {#if group.collapsed}<div class="pc-node-body">{group.body}</div>{/if}
</div>

<style>
.pc-group-readiness { pointer-events:auto; margin:0; padding:2px 6px; max-width:55%; min-width:0; flex-shrink:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; background:var(--pc-panel-solid); color:var(--pc-error); border:1px solid currentColor; border-radius:4px; font:inherit; font-size:11px; cursor:pointer; appearance:none; filter:none; text-shadow:none; box-shadow:none; }
.pc-group-readiness[data-readiness="input"] { color:var(--pc-warning,#e9b450); }
.pc-group-readiness:focus-visible { outline:2px solid var(--pc-accent); outline-offset:2px; }
</style>
