<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import type { DetailEditResponse, DetailSelection } from './detail-types';
    import type { NodeFileActions, NodeFileSettings, NodeFileView } from './node-file-types';

    let { model, selection, actions, disabled = false, idPrefix = 'pc-node-details' }: { model: NodeFileView; selection: DetailSelection; actions: NodeFileActions; disabled?: boolean; idPrefix?: string } = $props();
    let name = $state(''), path = $state(''), format = $state<NodeFileSettings['format']>('text'), missing = $state<NodeFileSettings['missing']>('create'), content = $state('');
    let visibility = $state<NodeFileSettings['visibility']['kind']>('public'), actorId = $state('');
    let dirty = $state(false), pending = $state(''), failure = $state(''), notice = $state('');
    let identity = '', draftIdentity = '', generation = 0, alive = true;
    const formats = [{ value: 'text', label: 'Plain text' }, { value: 'json', label: 'JSON' }, { value: 'jsonl', label: 'JSON Lines' }, { value: 'csv', label: 'CSV' }, { value: 'markdown', label: 'Markdown' }] as const;
    const requiresJson = $derived(['story-clock', 'commit-outcomes', 'random-pick'].includes(model.operation));
    const server = $derived(model.storage === 'server');
    const canAct = $derived(!disabled && model.available && !pending);
    const canEdit = $derived(canAct && model.mode !== 'inherited');
    const valid = $derived(!!name.trim() && (visibility !== 'actor-private' || !!actorId.trim()));
    const canChoose = $derived(canEdit && model.supported && valid && !!actions.chooseNodeFile);
    const canSave = $derived(canEdit && valid && !!actions.saveNodeFile && (server ? model.supported && (dirty || !model.settings.bindingId || !!model.issue) : dirty));
    const renamed = $derived(name.trim() !== model.settings.name || server && path.trim() !== (model.settings.path ?? ''));
    const bindingStatus = $derived(model.mode === 'inherited' ? 'Inherited destination' : !model.supported ? server ? 'Server file service unavailable' : 'Browser setup required' : renamed ? server ? 'Save settings for this file path.' : 'Choose a location for this filename.' : model.settings.bindingId ? model.issue ? 'File access needs attention.' : server ? 'File configured' : 'File selected' : server ? 'Enter a file path or filename, then save the settings.' : 'Choose a file to finish setup.');
    const contextKey = () => JSON.stringify([selection, model, disabled]);
    const draftKey = () => JSON.stringify([selection.documentNamespace, selection.selectionKey, selection.address, model.operation, model.mode, model.destinationMode, model.settings]);
    $effect.pre(() => {
        const next = contextKey(), nextDraft = draftKey();
        if (next === identity) return;
        identity = next; generation++;
        const replaceDraft = nextDraft !== draftIdentity;
        draftIdentity = nextDraft;
        untrack(() => {
            if (replaceDraft) {
                name = model.settings.name; path = model.settings.path ?? ''; format = model.settings.format; missing = model.settings.missing; content = model.settings.content;
                visibility = model.settings.visibility.kind; actorId = model.settings.visibility.kind === 'actor-private' ? model.settings.visibility.actorId : '';
                dirty = false;
            }
            pending = ''; failure = ''; notice = '';
        });
    });
    onDestroy(() => { alive = false; generation++; });
    function edit(field: 'name' | 'path' | 'format' | 'missing' | 'content' | 'visibility' | 'actor', value: string) {
        if (!canEdit) return;
        if (field === 'name') { name = value; if (server && path.trim()) path = path.replace(/[^\\/]*$/, value); }
        else if (field === 'path') { path = value; if (value.trim()) name = value.split(/[\\/]/).at(-1) ?? ''; }
        else if (field === 'format') { if (!formats.some(option => option.value === value)) return; format = value as NodeFileSettings['format']; }
        else if (field === 'missing') { if (value !== 'create' && value !== 'error') return; missing = value; }
        else if (field === 'content') content = value;
        else if (field === 'visibility') { if (!['public', 'hidden', 'actor-private'].includes(value)) return; visibility = value as NodeFileSettings['visibility']['kind']; }
        else actorId = value;
        generation++; dirty = true; failure = ''; notice = '';
    }
    function preparedSettings(): NodeFileSettings {
        return { bindingId: model.settings.bindingId, name: name.trim(), ...(server ? { path: path.trim() } : {}), format: requiresJson ? 'json' : format, missing, content, visibility: visibility === 'actor-private' ? { kind: visibility, actorId: actorId.trim() } : { kind: visibility } };
    }
    async function perform(kind: string, action: (captured: DetailSelection) => DetailEditResponse) {
        if (!canAct) return;
        const captured: DetailSelection = JSON.parse(JSON.stringify(selection)), source = contextKey(), request = ++generation;
        pending = kind; failure = ''; notice = '';
        const current = () => alive && request === generation && source === contextKey();
        try {
            // The action runs before the first await so native pickers retain the click gesture.
            const result = await action(captured);
            if (!current()) return;
            if (!result.ok) { failure = result.error.message; return; }
            if (kind === 'save') { dirty = false; notice = server ? 'File settings saved. File contents are written on Apply.' : renamed ? 'Settings saved. Choose a location for this filename.' : 'File settings saved.'; }
        } catch (error) {
            if (current()) failure = error instanceof Error ? error.message : 'The file settings could not be updated.';
        } finally { if (current()) pending = ''; }
    }
    function choose(mode: 'open' | 'save') {
        if (!canChoose || !actions.chooseNodeFile) return;
        const settings = preparedSettings();
        void perform('choose-' + mode, captured => actions.chooseNodeFile!(captured, { mode, settings }));
    }
    function save() {
        if (!canSave || !actions.saveNodeFile) return;
        const settings = preparedSettings();
        void perform('save', captured => actions.saveNodeFile!(captured, settings));
    }
    function refreshService() {
        if (!canAct || !server || model.supported || !actions.refreshNodeFiles) return;
        void perform('refresh', () => actions.refreshNodeFiles!());
    }
    function destination(value: string) {
        if (!canAct || model.operation !== 'write-file' || !actions.editControls || !['connected', 'own'].includes(value) || value === model.destinationMode) return;
        void perform('destination', captured => actions.editControls!(captured, { destinationMode: value }));
    }
</script>

<section class="pc-node-file" data-node-file aria-labelledby={idPrefix + '-fileTarget-heading'}>
    <h3 id={idPrefix + '-fileTarget-heading'}>File</h3>
    {#if model.operation === 'write-file'}
        <label class="pc-nf-field">Destination<select aria-label="File destination" value={model.destinationMode} disabled={!canAct || !actions.editControls} onchange={event => destination(event.currentTarget.value)}><option value="connected">Connected document</option><option value="own">Own file</option></select></label>
    {/if}
    <p class="pc-nf-status" data-file-status>{bindingStatus}</p>
    {#if model.summary}<p class="pc-nf-help pc-nf-summary">{model.summary}</p>{/if}
    {#if !model.supported && (model.mode !== 'inherited' || model.accessIssue)}<p class="pc-nf-help" data-file-access-issue>{model.accessIssue?.message ?? (server ? 'Install the Lattice file service on the SillyTavern server to use file paths.' : 'This browser does not provide direct file saving. Open this workflow in desktop Chrome or Edge. File uploads and downloads do not grant this access.')}</p>{/if}
    {#if server && !model.supported}
        <p class="pc-nf-help"><a data-server-file-guide href="https://github.com/MentallyQuill/Lattice/blob/main/docs/server-files.md" target="_blank" rel="noreferrer">Server file setup guide</a></p>
        {#if actions.refreshNodeFiles}<div class="pc-nf-actions"><button type="button" data-refresh-node-files disabled={!canAct} onclick={refreshService}>{pending === 'refresh' ? 'Checking…' : 'Retry file service'}</button></div>{/if}
    {/if}
    {#if model.mode === 'inherited'}
        <p class="pc-nf-help">{model.operation === 'commit-clock' ? 'Uses the file captured by Story Clock.' : 'Uses the connected document’s file and settings.'}</p>
    {:else}
        <p class="pc-nf-role">{model.mode === 'source' ? 'Source file' : 'Destination file'}</p>
        {#if server}
            <label class="pc-nf-field">File path<input id={idPrefix + '-fileTarget-path'} aria-label="File path" maxlength="4096" value={path} disabled={!canEdit} placeholder="Stories/SceneContext.txt" spellcheck="false" oninput={event => edit('path', event.currentTarget.value)} /></label>
            <p class="pc-nf-help">Files are saved by the SillyTavern server. Relative paths use {model.location?.basePath || 'your user files/lattice folder'}. Absolute paths refer to that machine.{model.location?.canUseAbsolutePaths === false ? ' Other folders require a SillyTavern administrator account.' : ''}</p>
        {/if}
        <label class="pc-nf-field">Filename<input id={idPrefix + '-fileTarget-name'} aria-label="Filename" maxlength="256" value={name} disabled={!canEdit} placeholder="notes.txt" oninput={event => edit('name', event.currentTarget.value)} /></label>
        {#if !server}
        <div class="pc-nf-actions pc-nf-choose">
            <button id={idPrefix + '-fileTarget-choose'} type="button" data-choose-node-file="save" disabled={!canChoose} onclick={() => choose('save')}>{pending === 'choose-save' ? 'Choosing…' : 'Choose location…'}</button>
            <button type="button" data-choose-node-file="open" disabled={!canChoose} onclick={() => choose('open')}>{pending === 'choose-open' ? 'Choosing…' : 'Open existing…'}</button>
        </div>
        {/if}
        {#if requiresJson}<div class="pc-nf-field"><span>Format</span><output aria-label="File format">JSON</output></div>{:else}<label class="pc-nf-field">Format<select aria-label="File format" value={format} disabled={!canEdit} onchange={event => edit('format', event.currentTarget.value)}>{#each formats as option}<option value={option.value}>{option.label}</option>{/each}</select></label>{/if}
        <label class="pc-nf-field">Missing file<select aria-label="Missing file" value={missing} disabled={!canEdit} onchange={event => edit('missing', event.currentTarget.value)}><option value="create">Create if missing</option><option value="error">Report an error</option></select></label>
        <label class="pc-nf-block">Initial content<textarea aria-label="Initial file content" rows="4" maxlength="100000" value={content} disabled={!canEdit} placeholder="Empty by default" oninput={event => edit('content', event.currentTarget.value)}></textarea></label>
        <p class="pc-nf-help">Used when creating a missing file. Existing file contents stay unchanged until Apply.</p>
        <label class="pc-nf-field">Visibility<select aria-label="File visibility" value={visibility} disabled={!canEdit} onchange={event => edit('visibility', event.currentTarget.value)}><option value="public">Public</option><option value="hidden">Hidden</option><option value="actor-private">Actor private</option></select></label>
        {#if visibility === 'actor-private'}<label class="pc-nf-field">Actor ID<input aria-label="File actor ID" maxlength="128" value={actorId} disabled={!canEdit} oninput={event => edit('actor', event.currentTarget.value)} /></label>{/if}
        <div class="pc-nf-actions"><button type="button" data-save-node-file disabled={!canSave} onclick={save}>{pending === 'save' ? 'Saving…' : 'Save file settings'}</button></div>
    {/if}
    {#if model.legacy}<p class="pc-nf-help pc-nf-migration">Existing chat data is preserved. Choose a file to migrate its saved content on Apply.</p>{/if}
    {#if !model.available}<p class="pc-nf-help">Open an active chat to configure this file.</p>{/if}
    {#if model.issue && (model.supported || model.mode === 'inherited' && !model.accessIssue)}<p class="pc-nf-error">{model.issue}</p>{/if}
    {#if failure}<p class="pc-nf-error" role="alert">{failure}</p>{/if}
    {#if notice}<p class="pc-nf-help" role="status">{notice}</p>{/if}
</section>

<style>
    .pc-node-file { color: var(--pc-text); min-width: 0; margin: 8px 0 12px; padding: 11px 10px; background: color-mix(in srgb, var(--pc-text) 4%, var(--pc-panel-solid)); font-size: 12px; line-height: 1.45; }
    .pc-node-file * { box-sizing: border-box; }
    h3 { margin: 0 0 8px; color: var(--pc-text); font-size: 12px; font-weight: 600; }
    .pc-nf-field { display: grid; grid-template-columns: minmax(60px, 30%) minmax(0, 1fr); align-items: center; gap: 7px; margin: 9px 0; color: var(--pc-muted); font-size: 11px; }
    :is(input, select, textarea) { display: block; width: 100%; min-width: 0; margin: 0; min-height: 29px; padding: 5px 7px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-field); color: var(--pc-text); font: inherit; }
    select { background: var(--pc-control); }
    .pc-nf-block { display: block; margin: 10px 0 0; color: var(--pc-muted); font-size: 11px; }
    textarea { margin-top: 6px; min-height: 78px; resize: vertical; }
    .pc-nf-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
    .pc-nf-choose { margin: 6px 0 12px; }
    button { min-width: 0; min-height: 28px; padding: 5px 7px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-control); color: var(--pc-text); font: inherit; font-size: 11px; cursor: pointer; overflow-wrap: anywhere; }
    button:hover:global(:where(:not(body.pc-node-held *))):not(:disabled) { background: color-mix(in srgb, var(--pc-text) 10%, var(--pc-control)); }
    .pc-nf-status { margin: 0 0 4px; color: var(--pc-text); font-size: 11px; overflow-wrap: anywhere; }
    .pc-nf-role { margin: 12px 0 5px; color: var(--pc-muted); font-size: 10px; }
    .pc-nf-help { margin: 7px 0 0; color: var(--pc-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .pc-nf-summary { margin: 4px 0 0; }
    a { color: var(--pc-accent); }
    .pc-nf-migration { padding-top: 8px; border-top: 1px solid var(--pc-border); }
    .pc-nf-error { margin: 7px 0 0; color: var(--pc-error); font-size: 11px; overflow-wrap: anywhere; }
    :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
    :disabled { opacity: .55; cursor: default; }
</style>
