<script lang="ts">
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import { onDestroy, untrack } from 'svelte';
    import type { DetailSelection, NodeDetailsActions, WorkflowDataCreate, WorkflowDataDefinition, WorkflowDataFormat, WorkflowDataResponse, WorkflowDataView, WorkflowDataVisibility } from './detail-types';
    let { model, selection, actions = {}, disabled = false, idPrefix = 'pc-workflow-data' }: { model: WorkflowDataView; selection: DetailSelection; actions?: NodeDetailsActions; disabled?: boolean; idPrefix?: string } = $props();
    let definition = $state<WorkflowDataDefinition | null>(null);
    let startingDay = $state('1'), startingTime = $state('00:00'), hoursPerDay = $state('24'), calendarId = $state('story-calendar');
    let content = $state(''), format = $state<WorkflowDataFormat>('text'), visibility = $state<WorkflowDataVisibility['kind']>('public'), actorId = $state(''), columns = $state('');
    let createOpen = $state(false), newName = $state(''), pending = $state(''), failure = $state(''), notice = $state(''), dirty = $state(false);
    let identity = '', generation = 0, alive = true;
    const label = $derived(model.kind === 'clock' ? 'Clock' : model.kind === 'outcomes' ? 'Outcomes' : 'Document');
    const noun = $derived(model.kind === 'clock' ? 'clock' : model.kind === 'outcomes' ? 'outcomes' : 'document');
    const canDraft = $derived(!disabled && model.editable && !!definition && !pending);
    const canMetadata = $derived(!disabled && model.editable && model.available && !pending);
    const visibilityOptions = [{ value: 'public', label: 'Public' }, { value: 'hidden', label: 'Hidden' }, { value: 'actor-private', label: 'Actor private' }] as const;
    const formats = [{ value: 'text', label: 'Plain text' }, { value: 'json', label: 'JSON' }, { value: 'jsonl', label: 'JSON Lines' }, { value: 'csv', label: 'CSV' }, { value: 'markdown', label: 'Markdown' }] as const;
    const formatLabel = (value: WorkflowDataFormat) => formats.find(option => option.value === value)?.label ?? value;
    const visibilityLabel = (value: WorkflowDataVisibility['kind']) => visibilityOptions.find(option => option.value === value)?.label ?? value;
    const identityFor = () => JSON.stringify([selection.selectionKey, selection.address, model.targetId, model.key]);
    function install(next: WorkflowDataDefinition | undefined) {
        definition = next ? structuredClone(next) : null;
        content = next?.content ?? ''; format = next?.format ?? model.format; visibility = next?.visibility.kind ?? model.visibility.kind;
        const currentVisibility = next?.visibility ?? model.visibility;
        actorId = currentVisibility.kind === 'actor-private' ? currentVisibility.actorId : ''; columns = next?.columns?.join(', ') ?? '';
        startingDay = '1'; startingTime = '00:00'; hoursPerDay = '24'; calendarId = 'story-calendar';
        if (model.kind === 'clock' && next) {
            try {
                const value = JSON.parse(next.content), length = value.dayLengthMinutes;
                startingDay = String(Math.floor(value.absoluteMinute / length) + 1);
                const minute = value.absoluteMinute % length;
                startingTime = String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
                hoursPerDay = String(length / 60); calendarId = value.calendarId;
            } catch { definition = null; failure = 'Load a valid clock template before changing its starting values.'; }
        }
        dirty = false;
    }
    $effect(() => {
        const next = identityFor();
        if (next === identity) return;
        identity = next; generation++; pending = ''; failure = ''; notice = ''; createOpen = false; newName = '';
        untrack(() => install(model.definition));
    });
    onDestroy(() => { alive = false; generation++; });
    function edit(field: 'day' | 'time' | 'hours' | 'calendar' | 'content' | 'actor' | 'columns', value: string) {
        if (field === 'actor' ? !canMetadata : !canDraft) return;
        if (field === 'day') startingDay = value; else if (field === 'time') startingTime = value; else if (field === 'hours') hoursPerDay = value;
        else if (field === 'calendar') calendarId = value; else if (field === 'content') content = value; else if (field === 'actor') actorId = value; else columns = value;
        generation++; dirty = true; failure = ''; notice = '';
    }
    function chooseFormat(value: WorkflowDataFormat) {
        if (!canDraft || model.kind !== 'notes') return;
        format = value;
        if (!content.trim()) content = value === 'json' ? '[]' : '';
        generation++; dirty = true; failure = ''; notice = '';
    }
    function chooseVisibility(value: WorkflowDataVisibility['kind']) {
        if (!canMetadata) return;
        visibility = value; generation++; dirty = true; failure = ''; notice = '';
    }
    function privateVisibility(): WorkflowDataVisibility {
        return visibility === 'actor-private' ? { kind: visibility, actorId: actorId.trim() } : { kind: visibility };
    }
    function clockValues() {
        const day = Number(startingDay), dayLengthMinutes = Number(hoursPerDay) * 60;
        const match = /^(\d+):([0-5]\d)$/.exec(startingTime), minuteOfDay = match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
        const absoluteMinute = (day - 1) * dayLengthMinutes + minuteOfDay;
        if (!Number.isSafeInteger(day) || day < 1 || !Number.isSafeInteger(dayLengthMinutes) || dayLengthMinutes < 1 || !Number.isSafeInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= dayLengthMinutes || !Number.isSafeInteger(absoluteMinute) || !calendarId.trim()) throw new Error('Use a positive starting day, a time within the day, and a day length in whole minutes.');
        return { calendarId: calendarId.trim(), absoluteMinute, dayLengthMinutes };
    }
    function preparedDefinition(): WorkflowDataDefinition {
        if (!definition) throw new Error('Load the initial template before saving.');
        const next: WorkflowDataDefinition = { targetId: model.targetId, name: definition.name, format, content, visibility: privateVisibility() };
        if (visibility === 'actor-private' && !actorId.trim()) throw new Error('Choose an actor for private data.');
        if (model.kind === 'clock') next.content = JSON.stringify({ ...JSON.parse(definition.content), ...clockValues() }, null, 2);
        if (format === 'csv') next.columns = columns.split(',').map(column => column.trim()).filter(Boolean);
        return next;
    }
    const saveAllowed = $derived(canMetadata && (definition ? !!actions.saveWorkflowData : !!actions.saveWorkflowDataVisibility) && dirty && (visibility !== 'actor-private' || !!actorId.trim()));
    async function perform(kind: string, action: (captured: DetailSelection, key: string) => WorkflowDataResponse | Promise<WorkflowDataResponse>) {
        if (disabled || !model.editable || pending) return;
        const captured = structuredClone(selection), key = model.key, source = identityFor(), request = ++generation;
        const metadataDraft = kind === 'load' && dirty ? { visibility, actorId } : null;
        pending = kind; failure = ''; notice = '';
        try {
            const result = await action(captured, key);
            if (!alive || request !== generation || source !== identityFor() || selection.revision !== captured.revision) return;
            if (!result.ok) { failure = result.error.code + ': ' + result.error.message; return; }
            if (kind === 'load') {
                if (!result.data?.definition) { failure = 'The initial template could not be loaded.'; return; }
                install(result.data.definition);
                if (metadataDraft) { visibility = metadataDraft.visibility; actorId = metadataDraft.actorId; dirty = true; }
            } else { dirty = false; createOpen = false; notice = result.data?.message ?? (kind === 'save' ? 'Initial settings saved.' : 'Workflow data updated.'); }
        } catch (error) {
            if (alive && request === generation && source === identityFor() && selection.revision === captured.revision) failure = error instanceof Error ? error.message : 'Workflow data could not be updated.';
        } finally { if (alive && request === generation && source === identityFor()) pending = ''; }
    }
    function save() {
        if (!saveAllowed) return;
        if (!definition && actions.saveWorkflowDataVisibility) { void perform('save', (captured, key) => actions.saveWorkflowDataVisibility!(captured, key, privateVisibility())); return; }
        if (!actions.saveWorkflowData) return;
        let next: WorkflowDataDefinition;
        try { next = preparedDefinition(); } catch (error) { failure = error instanceof Error ? error.message : 'Check the initial settings.'; return; }
        void perform('save', (captured, key) => actions.saveWorkflowData!(captured, key, next));
    }
    function bind(targetId: string) {
        if (disabled || !model.editable || pending || !actions.bindWorkflowData || targetId === model.targetId || !model.sources.some(source => source.value === targetId)) return;
        void perform('bind', (captured, key) => actions.bindWorkflowData!(captured, key, targetId));
    }
    function create() {
        if (disabled || !model.editable || !model.available || pending || !actions.createWorkflowData || !newName.trim()) return;
        let options: WorkflowDataCreate = { name: newName.trim(), kind: model.kind, format: model.kind === 'notes' ? format : 'json', visibility: privateVisibility() };
        try {
            if (visibility === 'actor-private' && !actorId.trim()) throw new Error('Choose an actor for private data.');
            if (model.kind === 'clock') options = { ...options, ...clockValues() };
        } catch (error) { failure = error instanceof Error ? error.message : 'Check the new data settings.'; return; }
        void perform('create', (captured, key) => actions.createWorkflowData!(captured, key, options));
    }
    function expectedCalendar(value: string) {
        if (disabled || !model.editable || pending || !actions.editControl) return;
        void perform('calendar', captured => actions.editControl!(captured, 'calendarId', value));
    }
</script>

<div class="pc-workflow-data" data-workflow-data={model.kind}>
    <p class="pc-wd-binding">Uses {model.name || model.targetId}</p>
    <details class="pc-wd-group" data-workflow-initial open={model.kind === 'clock'}>
        <summary>{model.kind === 'clock' ? 'Starting values' : model.kind === 'outcomes' ? 'Initial outcomes' : 'Initial content'}
            <span>{model.kind === 'clock' && definition ? 'Day ' + startingDay + ' · ' + startingTime : definition && !content.trim() ? 'Empty by default' : !definition ? 'Load initial values to edit' : model.kind === 'outcomes' && content.trim() === '[]' ? 'None' : 'Initial template'}</span>
        </summary>
        <div class="pc-wd-body">
            {#if !definition}<button type="button" data-load-workflow-data disabled={disabled || !model.editable || !model.available || !actions.loadWorkflowData || !!pending} onclick={() => { if (model.available && actions.loadWorkflowData) void perform('load', (captured, key) => actions.loadWorkflowData!(captured, key)); }}>{pending === 'load' ? 'Loading…' : 'Load initial values'}</button>{/if}
            {#if model.kind === 'clock'}
                <label class="pc-wd-number"><span>Starting day</span><input aria-label="Starting day" type="number" min="1" step="1" value={startingDay} disabled={!canDraft} oninput={event => edit('day', event.currentTarget.value)} /></label>
                <label class="pc-wd-number"><span>Starting time</span><input aria-label="Starting time" type="text" inputmode="numeric" placeholder="00:00" value={startingTime} disabled={!canDraft} oninput={event => edit('time', event.currentTarget.value)} /></label>
                <label class="pc-wd-number"><span>Hours per day</span><input aria-label="Hours per day" type="number" min={1 / 60} step="any" value={hoursPerDay} disabled={!canDraft} oninput={event => edit('hours', event.currentTarget.value)} /></label>
                <p class="pc-wd-help">Initial values only. Saved time stays unchanged.</p>
            {:else}
                <label class="pc-wd-block">{model.kind === 'outcomes' ? 'Starting records' : 'Content'}<textarea aria-label={model.kind === 'outcomes' ? 'Initial outcomes' : 'Initial document content'} rows="4" maxlength="100000" value={content} disabled={!canDraft} placeholder={model.kind === 'outcomes' ? '[]' : 'Empty by default'} oninput={event => edit('content', event.currentTarget.value)}></textarea></label>
                <p class="pc-wd-help">Initial content only. Saved {model.kind === 'outcomes' ? 'outcomes' : 'notes'} stay unchanged.</p>
            {/if}
        </div>
    </details>
    <details class="pc-wd-group" data-workflow-advanced>
        <summary>Advanced <span>{formatLabel(format)} · {visibilityLabel(visibility)}</span></summary>
        <div class="pc-wd-body">
            <div class="pc-wd-source-row">
                <span class="pc-wd-row-label">{label}</span>
                {#if model.sources.length <= 1}<output class="pc-wd-source-value" aria-label={label + ' source'}>{model.sources.find(source => source.value === model.targetId)?.label ?? model.name ?? model.targetId}</output>
                {:else if model.sources.length <= 3}<div class="pc-wd-choices" role="group" aria-label={label + ' source'}>{#each model.sources as source (source.value)}<button type="button" data-workflow-source={source.value} aria-pressed={source.value === model.targetId} disabled={disabled || !model.editable || !actions.bindWorkflowData || !!pending} onclick={() => bind(source.value)}>{source.label}</button>{/each}</div>
                {:else}<select aria-label={label + ' source'} value={model.targetId} disabled={disabled || !model.editable || !actions.bindWorkflowData || !!pending} onchange={event => bind(event.currentTarget.value)}>{#if !model.sources.some(source => source.value === model.targetId)}<option value={model.targetId}>{model.name || model.targetId}</option>{/if}{#each model.sources as source (source.value)}<option value={source.value}>{source.label}</option>{/each}</select>{/if}
                <button type="button" class="pc-wd-add" aria-label={'Create separate ' + noun} title={'Create separate ' + noun} disabled={disabled || !model.editable || !model.available || !actions.createWorkflowData || !!pending} onclick={() => { if (disabled || !model.editable || !model.available || pending) return; createOpen = !createOpen; newName = ''; failure = ''; }}>+</button>
            </div>
            {#if createOpen}<div class="pc-wd-create">
                <label class="pc-wd-field">Name<input aria-label={'New ' + noun + ' name'} maxlength="256" value={newName} disabled={!!pending} oninput={event => { newName = event.currentTarget.value; }} /></label>
                <div class="pc-wd-actions"><button type="button" data-create-workflow-data disabled={!newName.trim() || !!pending || visibility === 'actor-private' && !actorId.trim()} onclick={create}>{pending === 'create' ? 'Creating…' : 'Create ' + noun}</button><button type="button" disabled={!!pending} onclick={() => { createOpen = false; failure = ''; }}>Cancel</button></div>
            </div>{/if}
            <p class="pc-wd-help">{model.kind === 'clock' ? 'Same clock: shared time. Different clocks: independent time.' : model.kind === 'outcomes' ? 'Shared by nodes using these outcomes.' : 'Shared by nodes using this document.'}</p>
            <hr />
            {#if model.kind === 'notes'}<label class="pc-wd-field">Format<select aria-label="Document format" value={format} disabled={!canDraft} onchange={event => chooseFormat(event.currentTarget.value as WorkflowDataFormat)}>{#each formats as option}<option value={option.value}>{option.label}</option>{/each}</select></label><p class="pc-wd-help">A saved document keeps its format.</p>
            {:else}<div class="pc-wd-field"><span>Format</span><output aria-label={label + ' format'}>JSON</output></div><p class="pc-wd-help">{model.kind === 'clock' ? 'Required for clock data.' : 'Outcomes use a JSON list.'}</p>{/if}
            <span class="pc-wd-label" id={idPrefix + '-visibility'}>Visibility</span>
            <div class="pc-wd-choices" role="group" aria-labelledby={idPrefix + '-visibility'}>{#each visibilityOptions as option}<button type="button" data-workflow-visibility={option.value} aria-pressed={visibility === option.value} disabled={!canMetadata} onclick={() => chooseVisibility(option.value)}>{option.label}</button>{/each}</div>
            {#if visibility === 'actor-private'}<label class="pc-wd-field">Actor ID<input aria-label="Private actor ID" maxlength="128" value={actorId} disabled={!canMetadata} oninput={event => edit('actor', event.currentTarget.value)} /></label>{/if}
            {#if format === 'csv'}<label class="pc-wd-field">Columns<input aria-label="CSV columns" value={columns} disabled={!canDraft} placeholder="id, text" oninput={event => edit('columns', event.currentTarget.value)} /></label>{/if}
            <label class="pc-wd-field">Document ID<input aria-label={label + ' document ID'} readonly value={model.targetId} /></label>
            {#if model.kind === 'clock'}<label class="pc-wd-field">Calendar<input aria-label="Initial calendar name" value={calendarId} disabled={!canDraft} oninput={event => edit('calendar', event.currentTarget.value)} /></label><label class="pc-wd-field">Expected calendar<input aria-label="Expected calendar" placeholder="Any calendar" value={model.expectedCalendar ?? ''} disabled={disabled || !model.editable || !actions.editControl || !!pending} onchange={event => expectedCalendar(event.currentTarget.value)} /></label><p class="pc-wd-help">Expected calendar validates saved data.</p>{/if}
        </div>
    </details>
    <div class="pc-wd-actions pc-wd-save"><button type="button" data-save-workflow-data disabled={!saveAllowed} onclick={save}>{pending === 'save' ? 'Saving…' : 'Save settings'}</button></div>
    {#if !model.available}<p class="pc-wd-help">Open an active chat to save initial settings.</p>{/if}
    {#if model.issue}<div class="pc-wd-help"><DiagnosticMessage issue={model.issue} /></div>{/if}
    {#if failure}<div class="pc-wd-error"><DiagnosticMessage issue={failure} /></div>{/if}
    {#if notice || !dirty && model.notice}<p class="pc-wd-help" role="status">{notice || model.notice}</p>{/if}
</div>

<style>
    .pc-workflow-data { --pc-wd-edge: 4px; --pc-r-sm: 4px; color: var(--pc-text); margin-top: 8px; min-width: 0; font-size: 12px; line-height: 1.45; }
    .pc-workflow-data * { box-sizing: border-box; }
    .pc-wd-binding { margin: 8px 9px 12px; color: var(--pc-muted); font-size: 11px; overflow-wrap: anywhere; }
    .pc-wd-group { margin: 0 0 12px; border: 0; border-radius: 0; background: color-mix(in srgb, var(--pc-text) 4%, var(--pc-panel-solid)); }
    summary { padding: 11px 10px; color: var(--pc-muted); font-weight: 500; cursor: pointer; overflow-wrap: anywhere; }
    summary span { display: block; margin-left: 17px; margin-top: 2px; font-size: 10px; font-weight: 400; }
    .pc-wd-body { padding: 0 10px 11px; }
    label { color: var(--pc-muted); }
    .pc-wd-field { display: grid; grid-template-columns: minmax(60px, 30%) minmax(0, 1fr); align-items: center; gap: 7px; margin: 9px 0; font-size: 11px; }
    :is(input, select, textarea) { display: block; width: 100%; min-width: 0; margin: 0; min-height: 29px; padding: 5px 7px; border: 1px solid var(--pc-border); border-radius: var(--pc-wd-edge); background: var(--pc-field); color: var(--pc-text); font: inherit; }
    select { background: var(--pc-control); }
    input[readonly] { color: var(--pc-muted); }
    .pc-wd-block { display: block; margin: 7px 0; }
    .pc-wd-block textarea { margin-top: 6px; resize: vertical; min-height: 78px; }
    .pc-wd-number { display: grid; grid-template-columns: minmax(0, 1fr) minmax(91px, 42%); align-items: center; min-height: 34px; gap: 4px; margin: 7px 0; border: 1px solid var(--pc-border); border-radius: var(--pc-wd-edge); background: var(--pc-field); color: var(--pc-accent); }
    .pc-wd-number span { padding: 5px 0 5px 7px; }
    .pc-workflow-data.pc-workflow-data .pc-wd-number input[type] { text-align: right; font-variant-numeric: tabular-nums; background: transparent; border: 0; color: inherit; padding: 5px 6px; }
    .pc-wd-help { margin: 7px 0 0; color: var(--pc-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .pc-wd-label { display: block; margin: 10px 0 5px; color: var(--pc-muted); font-size: 11px; }
    .pc-wd-choices { display: flex; align-items: stretch; gap: 0; min-width: 0; padding: 3px; background: var(--pc-field); border: 0; border-radius: var(--pc-wd-edge); }
    button { min-height: 28px; padding: 5px 7px; border: 1px solid var(--pc-border); border-radius: var(--pc-wd-edge); background: var(--pc-control); color: var(--pc-text); font: inherit; font-size: 11px; cursor: pointer; }
    .pc-workflow-data.pc-workflow-data .pc-wd-choices button[type] { flex: 1 1 auto; min-width: 0; border: 0; border-radius: var(--pc-wd-edge); padding: 5px 3px; color: var(--pc-muted); background: transparent; font-size: 10px; overflow-wrap: anywhere; }
    .pc-workflow-data.pc-workflow-data .pc-wd-choices button[type][aria-pressed='false']:hover:global(:where(:not(body.pc-node-held *))):not(:disabled) { background: color-mix(in srgb, var(--pc-text) 7%, var(--pc-control)); }
    .pc-workflow-data.pc-workflow-data .pc-wd-choices button[type][aria-pressed='true'],
    .pc-workflow-data.pc-workflow-data .pc-wd-choices button[type][aria-pressed='true']:hover:global(:where(:not(body.pc-node-held *))) { background: color-mix(in srgb, var(--pc-text) 12%, var(--pc-control)); color: var(--pc-text); }
    button:hover:global(:where(:not(body.pc-node-held *))):not(:disabled) { background: color-mix(in srgb, var(--pc-text) 10%, var(--pc-control)); }
    .pc-wd-source-row { display: grid; grid-template-columns: minmax(48px, 22%) minmax(0, 1fr) 27px; align-items: center; gap: 5px; margin: 6px 0; }
    .pc-wd-row-label { color: var(--pc-muted); font-size: 11px; overflow-wrap: anywhere; }
    .pc-wd-source-value { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .pc-wd-add { font-size: 18px; line-height: 19px; padding: 2px; color: var(--pc-text); background: transparent; border-color: transparent; }
    .pc-wd-add:hover:global(:where(:not(body.pc-node-held *))):not(:disabled) { border-color: var(--pc-border); }
    .pc-wd-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }
    .pc-wd-save { margin: 0 0 9px; padding: 0 10px; }
    .pc-wd-create { margin: 8px 0; }
    hr { margin: 12px 0; border: 0; border-top: 1px solid var(--pc-border); opacity: .6; }
    :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
    :disabled { opacity: .55; cursor: default; }
    .pc-wd-error { color: var(--pc-error); font-size: 11px; overflow-wrap: anywhere; }
</style>
