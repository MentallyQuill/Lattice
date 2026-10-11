<script lang="ts">
    import { onMount } from 'svelte';
    import type { DocumentPromptView, DocumentPromptActions } from './types';
    let { view, actions, native = true }: { view: DocumentPromptView; actions?: DocumentPromptActions; native?: boolean } = $props();
    let dialog: HTMLDivElement, cancelButton: HTMLButtonElement;
    onMount(() => {
        const anchor = document.activeElement as HTMLElement;
        cancelButton.focus({ preventScroll: true });
        return () => anchor?.focus({ preventScroll: true });
    });
    function keys(event: KeyboardEvent) {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); actions?.choose('cancel'); }
        if (event.key === 'Tab') {
            const buttons = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled)')];
            const focused = buttons.indexOf(document.activeElement as HTMLElement);
            if (event.shiftKey && focused <= 0) { event.preventDefault(); buttons.at(-1)?.focus(); }
            if (!event.shiftKey && (focused < 0 || focused === buttons.length - 1)) { event.preventDefault(); buttons[0]?.focus(); }
        }
    }
</script>
<div class="pc-workspace-overlay">
    <div class="pc-workspace-dialog pc-document-prompt" role="dialog" aria-modal="true" aria-label="Save workflow changes?" tabindex="-1" bind:this={dialog} onkeydowncapture={keys} onpastecapture={event => event.stopPropagation()}>
        <h2>Save workflow changes?</h2>
        <p><strong>{view.name}</strong> has unsaved changes.</p>
        {#if native}<p>Save your changes before continuing, or continue without saving.</p>{:else}<p>Download a JSON copy and save it using your browser. To switch documents after downloading, repeat the action and choose Don't Save.</p>{/if}
        <footer><button type="button" onclick={() => actions?.choose('save')}>{native ? 'Save' : 'Download JSON'}</button><button type="button" onclick={() => actions?.choose('discard')}>Don't Save</button><button type="button" bind:this={cancelButton} onclick={() => actions?.choose('cancel')}>Cancel</button></footer>
    </div>
</div>
<style>
    .pc-document-prompt { width: min(400px, calc(100% - 28px)); box-sizing: border-box; padding: 16px; color: var(--pc-text); font-size: 12px; }
    h2 { margin: 0; font-size: 16px; }
    p { color: var(--pc-muted); line-height: 1.5; } strong { color: var(--pc-text); }
    footer { display: flex; justify-content: flex-end; gap: 7px; margin-top: 16px; }
    button { padding: 5px 10px; border: 1px solid var(--pc-border); border-radius: var(--pc-r-sm); background: var(--pc-control); color: var(--pc-text); font: inherit; cursor: pointer; }
    button:hover { border-color: var(--pc-flow); } button:focus-visible { outline: 2px solid var(--pc-flow); outline-offset: 1px; }
</style>
