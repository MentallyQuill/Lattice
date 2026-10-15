<script lang="ts">
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import type { DetailModifier, DetailModifierOption } from './detail-types';
    type ModifierDraft = { settings: Record<string, unknown>; error: string; pending: boolean; dirty: boolean };
    let { items, options, disabled, busy, drafts, error, idPrefix, onquick, onadd, onenable, onremove, onmove, ondraft, onsave }: {
        items: DetailModifier[]; options: DetailModifierOption[]; disabled: boolean; busy: boolean; drafts: Record<string, ModifierDraft>; error: string; idPrefix: string;
        onquick: (type: string, enabled: boolean) => void; onadd: (type: string) => void; onenable: (id: string, enabled: boolean) => void; onremove: (id: string) => void;
        onmove: (id: string, direction: -1 | 1) => void; ondraft: (id: string, field: string, value: unknown) => void; onsave: (id: string) => void;
    } = $props();
    const optionFor = (item: DetailModifier) => options.find(option => option.type === item.type);
    const labelFor = (item: DetailModifier) => optionFor(item)?.label ?? item.type;
    const settingsFor = (item: DetailModifier) => drafts[item.id]?.settings ?? item.settings;
    const quickDisabled = (type: string) => disabled || busy || !options.some(option => option.type === type) || items.length >= 16 && !items.some(item => item.type === type);
</script>

<section class="pc-modifiers" data-modifier-controls aria-label="Text modifiers">
    <div class="pc-modifier-quick">
        {#each ['trim', 'wrap'] as type}
            <label><input type="checkbox" aria-label={(type === 'trim' ? 'Trim' : 'Wrap') + ' output'} checked={items.some(item => item.type === type && item.enabled)} disabled={quickDisabled(type)} onchange={event => { if (!quickDisabled(type)) onquick(type, event.currentTarget.checked); }} />{type === 'trim' ? 'Trim' : 'Wrap'}</label>
        {/each}
        <select aria-label="Add text modifier" value="" disabled={disabled || busy || items.length >= 16} onchange={event => { const type = event.currentTarget.value; event.currentTarget.value = ''; if (!disabled && !busy && items.length < 16 && type) onadd(type); }}>
            <option value="">Add modifier…</option>{#each options.filter(option => !['trim', 'wrap'].includes(option.type)) as option (option.type)}<option value={option.type}>{option.label}</option>{/each}
        </select>
    </div>
    {#if items.length}<div class="pc-modifier-stack">
        <small>{items.filter(item => item.enabled).length} active · {items.length} total · Applied in order</small>
        {#each items as item, index (item.id)}
            {@const option = optionFor(item)}{@const label = labelFor(item)}{@const local = drafts[item.id]}
            <div class="pc-modifier-entry" data-modifier-id={item.id} data-modifier-state={item.enabled ? 'active' : 'disabled'}>
                <div class="pc-modifier-heading">
                    <label><input type="checkbox" aria-label={'Enable ' + label + ' modifier'} checked={item.enabled} disabled={disabled || busy} onchange={event => { if (!disabled && !busy) onenable(item.id, event.currentTarget.checked); }} /><span>{index + 1}. {label}<small>{item.enabled ? 'Active' : 'Disabled'}</small></span></label>
                    <div class="pc-modifier-order">
                        <button type="button" aria-label={'Move ' + label + ' up'} title="Move up" disabled={disabled || busy || index === 0} onclick={() => { if (!disabled && !busy && index > 0) onmove(item.id, -1); }}>↑</button>
                        <button type="button" aria-label={'Move ' + label + ' down'} title="Move down" disabled={disabled || busy || index === items.length - 1} onclick={() => { if (!disabled && !busy && index < items.length - 1) onmove(item.id, 1); }}>↓</button>
                        <button type="button" aria-label={'Remove ' + label + ' modifier'} title="Remove" disabled={disabled || busy} onclick={() => { if (!disabled && !busy) onremove(item.id); }}>×</button>
                    </div>
                </div>
                {#if option?.fields.length}<details open={!!local?.dirty || !!local?.error}><summary>{label} settings{#if local?.dirty} · Unsaved{/if}</summary>
                    {#each option.fields as control (control.key)}
                        {@const controlId = idPrefix + '-modifier-' + item.id + '-' + control.key}
                        {#if control.editor === 'boolean'}
                            <label class="pc-modifier-check"><input id={controlId} type="checkbox" aria-label={label + ' ' + control.label} checked={Boolean(settingsFor(item)[control.key])} {disabled} onchange={event => { if (!disabled) ondraft(item.id, control.key, event.currentTarget.checked); }} />{control.label}</label>
                        {:else}
                            <label for={controlId}>{control.label}</label>
                            {#if control.editor === 'enum'}
                                <select id={controlId} aria-label={label + ' ' + control.label} value={String(settingsFor(item)[control.key] ?? '')} {disabled} onchange={event => { if (!disabled) ondraft(item.id, control.key, event.currentTarget.value); }}>{#each control.options ?? [] as choice (choice.value)}<option value={choice.value}>{choice.label}</option>{/each}</select>
                            {:else if control.editor === 'number'}
                                <input id={controlId} type="number" aria-label={label + ' ' + control.label} min={control.min} max={control.max} step={control.step ?? 1} value={String(settingsFor(item)[control.key] ?? '')} {disabled} oninput={event => { if (!disabled) ondraft(item.id, control.key, event.currentTarget.value ? Number(event.currentTarget.value) : null); }} />
                            {:else}
                                <textarea id={controlId} aria-label={label + ' ' + control.label} value={String(settingsFor(item)[control.key] ?? '')} {disabled} oninput={event => { if (!disabled) ondraft(item.id, control.key, event.currentTarget.value); }}></textarea>
                            {/if}
                        {/if}
                        {#if control.help}<small>{control.help}</small>{/if}
                    {/each}
                    <button type="button" aria-label={'Save ' + label + ' settings'} disabled={disabled || !!local?.pending || !local?.dirty} onclick={() => { if (!disabled && !local?.pending && local?.dirty) onsave(item.id); }}>{local?.pending ? 'Validating…' : 'Save settings'}</button>
                </details>{/if}
                {#if local?.error}<div class="pc-modifier-error"><DiagnosticMessage issue={local.error} /></div>{/if}
            </div>
        {/each}
    </div>{/if}
    {#if busy}<small role="status">Validating modifiers…</small>{/if}
    {#if error}<div class="pc-modifier-error"><DiagnosticMessage issue={error} /></div>{/if}
</section>

<style>
    .pc-modifiers { min-width: 0; margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--pc-border); color: var(--pc-text); }
    .pc-modifier-quick { display: flex; align-items: center; gap: 5px 8px; flex-wrap: wrap; } .pc-modifier-quick label { display: flex; align-items: center; gap: 4px; font-size: 11px; }
    .pc-modifier-quick select { flex: 1; min-width: 92px; width: auto; margin: 0; }
    .pc-modifier-stack { margin-top: 7px; } small { display: block; color: var(--pc-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .pc-modifier-entry { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--pc-border); min-width: 0; }
    .pc-modifier-heading { display: flex; gap: 4px; align-items: center; justify-content: space-between; } .pc-modifier-heading label { display: flex; gap: 5px; align-items: center; min-width: 0; font-size: 11px; overflow-wrap: anywhere; }
    .pc-modifier-order { display: flex; gap: 2px; flex: none; } .pc-modifier-order button { min-height: 23px; width: 22px; padding: 0; margin: 0; background: transparent; }
    details { margin: 5px 0 0; } summary { color: var(--pc-muted); font-size: 10px; cursor: pointer; overflow-wrap: anywhere; }
    label { display: block; margin-top: 6px; font-size: 11px; } .pc-modifier-check { display: flex; gap: 5px; align-items: center; } input[type='checkbox'] { margin: 0; flex: none; accent-color: var(--pc-accent); }
    input:not([type='checkbox']), select, textarea { display: block; width: 100%; min-width: 0; box-sizing: border-box; margin-top: 3px; min-height: 27px; padding: 4px 6px; border: 1px solid var(--pc-border); border-radius: 2px; background: var(--pc-field); color: var(--pc-text); font: inherit; font-size: 11px; }
    textarea { min-height: 48px; resize: vertical; line-height: 1.4; }
    button { margin-top: 6px; min-height: 26px; padding: 4px 8px; border: 1px solid var(--pc-border); border-radius: 2px; background: var(--pc-control); color: var(--pc-text); font: inherit; font-size: 11px; cursor: pointer; }
    button:hover:global(:where(:not(body.pc-node-held *))):not(:disabled) { background: color-mix(in srgb, var(--pc-text) 10%, var(--pc-control)); } :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
    :disabled { opacity: .55; cursor: default; } .pc-modifier-error { color: var(--pc-error); font-size: 11px; overflow-wrap: anywhere; margin: 6px 0; }
</style>
