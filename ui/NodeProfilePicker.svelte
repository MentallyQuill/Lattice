<script lang="ts">
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import { tick } from 'svelte';
    import type { NodeProfileData, NodeProfileOption, EditNodeProfile } from './node-profile-types';
    let { row, editProfile, refreshProfiles }: { row: NodeProfileData; editProfile?: EditNodeProfile; refreshProfiles?: (selection: NodeProfileData['selection']) => unknown } = $props();
    let opened = $state(false), query = $state(''), active = $state(0), error = $state(''), pending = $state(false);
    let capturedVersion = -1;
    let focusVersion = 0, editFocusPending = false;
    let barHeight = $state(35);
    let root: HTMLDivElement, bar: HTMLButtonElement;
    let input = $state<HTMLInputElement>(), list = $state<HTMLDivElement>();
    const stop = (event: Event) => event.stopPropagation();
    function isolate(element: HTMLDivElement) {
        // Native listeners stop shortcuts before host/window handlers; delegated
        // Svelte keyboard listeners run after those handlers have already fired.
        const keyboard = (event: KeyboardEvent) => { void keydown(event); };
        const otherOpened = (event: Event) => { if ((event as CustomEvent).detail !== element) close(); };
        const focusMoved = (event: FocusEvent) => {
            if (editFocusPending && !element.contains(event.target as Node)) { focusVersion++; editFocusPending = false; }
        };
        const events = ['keyup', 'pointerdown', 'mousedown', 'mouseup', 'mousemove', 'dblclick', 'contextmenu'];
        element.addEventListener('keydown', keyboard);
        window.addEventListener('pc-node-profile-open', otherOpened);
        document.addEventListener('focusin', focusMoved);
        for (const type of events) element.addEventListener(type, stop);
        return { destroy() { element.removeEventListener('keydown', keyboard); window.removeEventListener('pc-node-profile-open', otherOpened); document.removeEventListener('focusin', focusMoved); for (const type of events) element.removeEventListener(type, stop); } };
    }
    const keywords = $derived(query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean));
    const results = $derived([...row.options.filter(option => option.active), ...row.options.filter(option => !option.active && keywords.every(word => `${option.label} ${option.apiLabel} ${option.model}`.toLocaleLowerCase().includes(word)))]);
    const menuWidth = $derived(Math.max(1, Math.min(330, row.visibleBounds.w - 16)));
    const menuLeft = $derived(Math.max(row.visibleBounds.x + 8, Math.min(row.x, row.visibleBounds.x + row.visibleBounds.w - menuWidth - 8)) - row.x);
    const barTop = $derived(row.h + row.clearance + 7);
    // Reserve the search field and border before assigning remaining room to results.
    const below = $derived(row.visibleBounds.y + row.visibleBounds.h - (row.y + barTop + barHeight + 6) - 8);
    const above = $derived(row.y + barTop - row.visibleBounds.y - 14);
    const upwards = $derived(below < 130 && above > below);
    const floating = $derived(Math.max(above, below) < 78);
    const menuHeight = $derived(Math.max(0, floating ? row.visibleBounds.h - 16 : upwards ? above : below));
    const listHeight = $derived(Math.max(0, Math.min(244, menuHeight - 54)));
    const floatingTop = $derived(row.visibleBounds.y + 8 - row.y - barTop);
    const optionId = (index: number) => `${row.id}-profile-option-${index}`;
    function close(focus = false, preserveEditFocus = false) {
        if (!preserveEditFocus) { focusVersion++; editFocusPending = false; }
        opened = false; query = ''; error = ''; pending = false; if (focus) bar?.focus({ preventScroll: true });
    }
    async function show() {
        if (!row.editable) return;
        const key = row.selection.selectionKey;
        await refreshProfiles?.(row.selection);
        if (!row.editable || !root?.isConnected || row.selection.selectionKey !== key) return;
        const measured = bar.getBoundingClientRect(), scale = measured.width > 0 && row.w > 0 ? measured.width / row.w : 1;
        barHeight = measured.height > 0 ? measured.height / scale : 35;
        window.dispatchEvent(new CustomEvent('pc-node-profile-open', { detail: root }));
        capturedVersion = row.authorityVersion; query = ''; error = ''; pending = false;
        active = Math.max(0, results.findIndex(option => option.value === row.value)); opened = true;
        await tick(); if (opened) { input?.focus({ preventScroll: true }); if (list) list.scrollTop = 0; }
    }
    function search() {
        const reserved = results.find(option => option.active);
        active = !keywords.length || reserved && keywords.every(word => reserved.label.toLocaleLowerCase().includes(word)) ? 0 : results.length > 1 ? 1 : -1;
        if (list) list.scrollTop = 0;
    }
    async function commit(option: NodeProfileOption) {
        if (!opened || !row.editable || pending || row.authorityVersion !== capturedVersion || !editProfile) return;
        const version = capturedVersion, selection = row.selection, ownedFocus = focusVersion; pending = true; error = ''; editFocusPending = true;
        try {
            const result = await editProfile(selection, option.value);
            if (result.ok) {
                // An accepted edit can synchronously publish a newer revision
                // and remove the search field before this promise resumes.
                if (focusVersion === ownedFocus && root?.isConnected && row.selection.selectionKey === selection.selectionKey
                    && JSON.stringify(row.selection.address) === JSON.stringify(selection.address)
                    && (!opened || capturedVersion === version)) close(true);
                return;
            }
            if (!opened || row.authorityVersion !== version) return;
            error = result.error.code + ': ' + result.error.message;
        } catch (failure) {
            if (opened && row.authorityVersion === version) error = failure instanceof Error ? failure.message : 'Could not change connection profile';
        } finally { if (row.authorityVersion === version) pending = false; if (focusVersion === ownedFocus) editFocusPending = false; }
    }
    async function keydown(event: KeyboardEvent) {
        stop(event);
        if (!opened) {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); await show(); }
            return;
        }
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); active = Math.max(0, Math.min(results.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
            await tick(); list?.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest' }); input?.focus({ preventScroll: true });
        } else if (event.key === 'Enter' && event.target === input) { event.preventDefault(); if (results[active]) await commit(results[active]); }
    }
    function wheel(event: WheelEvent) {
        event.preventDefault(); stop(event);
        if (list) list.scrollTop += event.deltaY * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? list.clientHeight : 1);
    }
    $effect(() => { if (opened && (row.authorityVersion !== capturedVersion || !row.editable)) close(false, true); });
</script>

<svelte:document onpointerdown={(event) => { if ((opened || editFocusPending) && !root.contains(event.target as Node)) close(); }} />
<!-- svelte-ignore a11y_no_noninteractive_element_interactions (Decoration contains its own keyboard controls and isolates canvas gestures.) -->
<div class="pc-node-profile" data-id={row.id} role="group" aria-label="Node connection profile" bind:this={root} use:isolate style:left={`${row.x}px`} style:top={`${row.y}px`} style:width={`${row.w}px`} style:z-index={opened ? 20 : 2} onwheel={stop}>
    {#if row.model}<div class="node-model-meta" title={row.model}>{row.model}</div>{/if}
    <div class="profile-picker" style:top={`${barTop}px`}>
        <button type="button" class="profile-bar" title={row.label} aria-label={`Connection profile: ${row.label}`} aria-haspopup="listbox" aria-expanded={opened} disabled={!row.editable} bind:this={bar} onclick={() => opened ? close() : show()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22v-5M15 8V2M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1zM9 8V2" /></svg><span class="profile-value">{row.label}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {#if opened}
            <div class="profile-menu" style:width={`${menuWidth}px`} style:max-height={`${menuHeight}px`} style:left={`${menuLeft}px`} style:top={floating ? `${floatingTop}px` : upwards ? 'auto' : `${barHeight + 6}px`} style:bottom={!floating && upwards ? `${barHeight + 6}px` : 'auto'}>
                <div class="profile-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5" /></svg><input bind:this={input} bind:value={query} oninput={search} role="combobox" aria-label="Search connection profiles" aria-autocomplete="list" aria-expanded="true" aria-controls={`${row.id}-profile-list`} aria-activedescendant={active >= 0 && results.length ? optionId(active) : undefined} placeholder="Search connection profiles…" autocomplete="off" spellcheck="false" maxlength="200" /></div>
                <div class="profile-options" id={`${row.id}-profile-list`} role="listbox" aria-label="Connection profiles" bind:this={list} style:max-height={`${listHeight}px`} onwheel={wheel}>
                    {#each results as option, index (option.value)}
                        <button type="button" role="option" id={optionId(index)} class="profile-option" class:is-active={index === active} aria-selected={option.value === row.value} disabled={pending} onclick={() => commit(option)}>
                            <span class="profile-option-copy"><span class="profile-name" title={option.label}>{option.label}</span><span class="profile-meta">{option.active ? 'Follows SillyTavern’s current model' : [option.apiLabel, option.model].filter(Boolean).join(' · ')}</span></span><span class="profile-check">{#if option.value === row.value}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>{/if}</span>
                        </button>
                    {:else}<p class="profile-empty">{query.trim() ? 'No connection profiles match. Clear the search to see available profiles.' : 'No connection profiles are available. Add one in SillyTavern’s Connection Manager.'}</p>
                    {/each}
                </div>
                {#if error}<div class="profile-error"><DiagnosticMessage issue={error} /></div>{/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .pc-node-profile { position:absolute; pointer-events:none; color:var(--pc-text); font-family:var(--pc-font,inherit); font-size:14px; line-height:1.4; color-scheme:dark; }
    :global(:root[data-pc-light="1"]) .pc-node-profile { color-scheme:light; }
    .pc-node-profile * { box-sizing:border-box; }
    .node-model-meta { position:absolute; bottom:8px; left:0; width:100%; color:var(--pc-muted); font-size:11px; overflow-wrap:anywhere; }
    .profile-picker { position:absolute; width:100%; pointer-events:auto; }
    .profile-bar { display:flex; align-items:center; gap:7px; width:100%; padding:8px; margin:0; border:1px solid var(--pc-border); border-radius:var(--pc-r); background:var(--pc-control); color:var(--pc-text); font:inherit; font-size:12px; min-height:35px; text-align:left; cursor:pointer; appearance:none; filter:none; text-shadow:none; box-shadow:none; }
    .profile-bar:hover:enabled { background:color-mix(in srgb,var(--pc-text) 7%,var(--pc-control)); } .profile-bar:disabled { cursor:default; }
    .profile-bar:focus-visible { outline:2px solid var(--pc-accent); outline-offset:2px; }
    svg { fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    .profile-bar svg { width:14px; height:14px; flex:0 0 14px; }
    .profile-value { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
    /* Popovers obscure the canvas even when SillyTavern's panel token is translucent. */
    .profile-menu { --profile-panel:rgb(from var(--pc-panel-solid) r g b / 1); position:absolute; display:flex; flex-direction:column; background:var(--pc-panel-solid); background:var(--profile-panel); border:1px solid var(--pc-border); border-radius:var(--pc-r); box-shadow:0 12px 32px #0006; overflow:hidden; z-index:3; }
    .profile-search { display:flex; flex-shrink:0; align-items:center; gap:8px; padding:11px 12px; border-bottom:1px solid var(--pc-border); background:var(--pc-field); }
    .profile-search:focus-within { box-shadow:inset 0 -2px 0 var(--pc-accent); }
    .profile-search svg { width:16px; height:16px; flex:0 0 16px; color:var(--pc-muted); }
    .profile-search input, :global(:root[data-pc-own="1"] .pc-root) .profile-search input { width:100%; min-width:0; padding:3px 0; margin:0; border:0; border-radius:0; background:transparent; color:var(--pc-text); font:inherit; appearance:none; filter:none; text-shadow:none; box-shadow:none; }
    .profile-search input::placeholder { color:var(--pc-muted); opacity:1; }
    .profile-search input:focus, :global(:root[data-pc-own="1"] .pc-root) .profile-search input:focus { outline:none; box-shadow:none; }
    .profile-options { min-height:0; flex:1 1 auto; max-height:244px; overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter:stable; scrollbar-width:auto; scrollbar-color:var(--pc-scrollbar-thumb) var(--pc-scrollbar-track); padding:4px; }
    .profile-options::-webkit-scrollbar { width:10px; } .profile-options::-webkit-scrollbar-track { background:var(--pc-scrollbar-track); } .profile-options::-webkit-scrollbar-thumb { background:var(--pc-scrollbar-thumb); border:2px solid var(--pc-scrollbar-track); border-radius:var(--pc-r); }
    .profile-option { display:flex; align-items:flex-start; gap:7px; padding:9px 8px; margin:0; width:100%; border:0; border-radius:var(--pc-r); background:transparent; color:var(--pc-text); text-align:left; font:inherit; font-size:13px; line-height:1.35; cursor:pointer; appearance:none; filter:none; text-shadow:none; box-shadow:none; }
    .profile-option:hover:enabled,.profile-option.is-active { background:color-mix(in srgb,var(--pc-text) 7%,var(--profile-panel)); } .profile-option[aria-selected="true"] { background:color-mix(in srgb,var(--pc-accent) 14%,var(--profile-panel)); }
    .profile-option.is-active,.profile-option:focus-visible { outline:2px solid var(--pc-accent); outline-offset:-2px; }
    .profile-option:disabled { cursor:default; }
    .profile-option-copy { min-width:0; flex:1; } .profile-name { display:block; overflow-wrap:anywhere; } .profile-meta { display:block; margin-top:3px; color:var(--pc-muted); font-size:11px; overflow-wrap:anywhere; }
    .profile-check { width:14px; min-height:17px; flex:0 0 14px; margin-top:2px; } .profile-check svg { width:14px; height:14px; }
    .profile-error { flex:0 1 auto; min-height:0; max-height:84px; overflow-y:auto; overflow-wrap:anywhere; padding:8px 12px; color:var(--pc-error); font-size:12px; }
    .profile-empty { padding: 8px 12px; color: var(--pc-muted); font-size: 12px; line-height: 1.5; }
    @media(pointer:coarse) { .profile-bar,.profile-option { min-height:44px; } }
</style>
