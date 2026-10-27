<script lang="ts">
    import { untrack } from 'svelte';
    import { formatJsonValueDraftAtPath } from '../src/ui/json-value-authoring.js';
    import { validateJsonSchema, updateSchemaAtPath, removeSchemaKeyword } from '../src/ui/schema-authoring.js';
    import type { JsonValue, JsonPath } from '../src/workflow/operations/json-data';
    import type { SchemaDraftState } from '../src/ui/schema-authoring';
    import JsonValueControl from './JsonValueControl.svelte';

    // One authority owns every nested schema draft; navigation never rewrites saved data.
    type SchemaNode = Record<string, JsonValue>;
    let { text, ontext, oninvalid, draftState, onDraftState, label = 'Schema', idPrefix, optional = true, disabled = false, error = '' }: {
        draftState?: SchemaDraftState;
        onDraftState?: (state: SchemaDraftState) => void;
        text: string;
        ontext: (text: string) => void;
        oninvalid?: (text: string, path?: readonly (string | number)[]) => void;
        label?: string;
        idPrefix: string;
        optional?: boolean;
        disabled?: boolean;
        error?: string;
    } = $props();

    function initial() { return draftState; }
    let path = $state<string[]>([...(initial()?.path ?? [])]);
    let raw = $state(initial()?.raw || Boolean(initial()?.invalid && !initial()?.invalidKeyword));
    let rawText = $state(initial()?.invalid && !initial()?.invalidKeyword ? initial()?.invalidText ?? '' : initial()?.rawText ?? '');
    let feedback = $state(initial()?.feedback ?? '');
    let invalid = $state(initial()?.invalid ?? false);
    let inactiveText = $state(initial()?.inactiveText ?? '');
    let invalidText = $state(initial()?.invalidText ?? '');
    let invalidPath = $state<(string | number)[]>([...(initial()?.invalidPath ?? [])]);
    let invalidKeyword = $state(initial()?.invalidKeyword ?? '');
    let numberDrafts = $state<Record<string, string>>({ ...initial()?.numberDrafts });
    let typedDrafts = $state.raw<Record<string, JsonValue>>({ ...initial()?.typedDrafts });
    let typedTextDrafts = $state<Record<string, string>>({ ...initial()?.typedTextDrafts });
    let expandedPaths = $state<string[][]>(initial()?.expandedPaths?.map(at => [...at]) ?? ancestors(initial()?.path ?? []));
    let advancedPaths = $state<string[][]>(initial()?.advancedPaths?.map(at => [...at]) ?? (initial()?.invalid ? [[...(initial()?.path ?? [])]] : []));
    let selectedPath = $state<string[]>([...(initial()?.selectedPath ?? initial()?.path ?? [])]);
    let addingFieldPaths = $state<string[][]>(initial()?.addingFieldPaths?.map(at => [...at]) ?? []);
    let fieldNameDrafts = $state<Record<string, string>>({ ...initial()?.fieldNameDrafts });

    $effect(() => {
        const authored: SchemaDraftState = {
            path: [...path], raw, rawText, feedback, invalid, inactiveText, invalidText,
            invalidPath: [...invalidPath], invalidKeyword, numberDrafts: { ...numberDrafts },
            typedDrafts: { ...typedDrafts }, typedTextDrafts: { ...typedTextDrafts },
            expandedPaths: expandedPaths.map(at => [...at]), advancedPaths: advancedPaths.map(at => [...at]),
            selectedPath: [...selectedPath], addingFieldPaths: addingFieldPaths.map(at => [...at]), fieldNameDrafts: { ...fieldNameDrafts }
        };
        untrack(() => onDraftState?.(authored));
    });
    // Merely viewing valid JSON preserves its exact authoritative formatting.
    $effect(() => { if (raw && !invalid) rawText = text; });

    const types = [
        ['object', 'Object'], ['array', 'List'], ['string', 'Text'],
        ['number', 'Number'], ['integer', 'Whole number'], ['boolean', 'Boolean'], ['null', 'Null']
    ];
    const numberKeywords = ['minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum'];
    const annotations = ['title', 'description', '$schema'];
    const keywordLabels: Record<string, string> = {
        minItems: 'Minimum items', maxItems: 'Maximum items', minLength: 'Minimum length', maxLength: 'Maximum length',
        minimum: 'Minimum value', maximum: 'Maximum value', title: 'Title', description: 'Description',
        $schema: 'Schema URI', enum: 'Allowed values', const: 'Exact value'
    };
    function parse(source: string) {
        if (source === '' && optional) return validateJsonSchema({});
        try { return validateJsonSchema(JSON.parse(source)); }
        catch { return { ok: false as const, error: { code: 'INVALID_SCHEMA_JSON', message: 'Finish valid schema JSON.' } }; }
    }
    const checked = $derived(text === '' ? validateJsonSchema({}) : parse(text));
    const schema = $derived(checked.ok ? checked.data.schema as SchemaNode : {});
    const editingRaw = $derived(raw || !checked.ok);

    function token(at: readonly string[]) { return at.map(key => key.length + ':' + key).join('|'); }
    function same(a: readonly string[], b: readonly string[]) { return token(a) === token(b); }
    function draftKey(at: readonly string[], keyword: string) { return token(at) + '|' + keyword; }
    function nodeId(at: readonly string[]) { return idPrefix + '-node-' + encodeURIComponent(token(at) || 'root'); }
    function displayKey(key: string) { return key === '' ? '(empty key)' : key; }
    function ancestors(at: readonly string[]) {
        const paths: string[][] = [];
        for (let index = 0; index < at.length; index++) {
            if (at[index] === 'properties') index++;
            paths.push(at.slice(0, index + 1));
        }
        return paths;
    }
    function nodeAt(root: SchemaNode, at: readonly string[]): SchemaNode {
        let value: JsonValue = root;
        for (const key of at) {
            if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, key)) return {};
            value = value[key];
        }
        return value && typeof value === 'object' && !Array.isArray(value) ? value as SchemaNode : {};
    }
    function nodeType(node: SchemaNode) { return typeof node.type === 'string' ? node.type : ''; }
    function propertiesAt(node: SchemaNode): SchemaNode { return node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties) ? node.properties as SchemaNode : {}; }
    function requiredAt(node: SchemaNode) { return Array.isArray(node.required) ? node.required as string[] : []; }
    function objectView(node: SchemaNode) { return nodeType(node) === 'object' || !nodeType(node) && Object.hasOwn(node, 'properties'); }
    function arrayView(node: SchemaNode) { return nodeType(node) === 'array' || !nodeType(node) && Object.hasOwn(node, 'items'); }
    function visibleNumbers(node: SchemaNode) { return arrayView(node) ? ['minItems', 'maxItems'] : nodeType(node) === 'string' ? ['minLength', 'maxLength'] : ['number', 'integer'].includes(nodeType(node)) ? ['minimum', 'maximum'] : []; }
    function retainedNumbers(node: SchemaNode) { return numberKeywords.filter(key => Object.hasOwn(node, key) && !visibleNumbers(node).includes(key)); }
    function retainedObject(node: SchemaNode) { return !objectView(node) && ['properties', 'required', 'additionalProperties'].some(key => Object.hasOwn(node, key)); }
    function advancedCount(node: SchemaNode) { return [...annotations, 'enum', 'const', ...retainedNumbers(node)].filter(key => Object.hasOwn(node, key)).length + (retainedObject(node) || !arrayView(node) && Object.hasOwn(node, 'items') ? 1 : 0); }
    function humanType(value: JsonValue | undefined) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (value.type === 'array' && value.items && typeof value.items === 'object' && !Array.isArray(value.items)) {
                const item = value.items;
                const itemType = types.find(([key]) => key === item.type)?.[1];
                if (itemType) return 'List of ' + itemType.toLowerCase();
            }
            return types.find(([key]) => key === value.type)?.[1] ?? 'Any JSON';
        }
        return 'Any JSON';
    }
    function includesPath(paths: readonly string[][], at: readonly string[]) { return paths.some(candidate => same(candidate, at)); }
    function togglePath(paths: string[][], at: string[], open: boolean) { return open ? includesPath(paths, at) ? paths : [...paths, [...at]] : paths.filter(candidate => !same(candidate, at)); }
    function toggleExpanded(at: string[]) {
        expandedPaths = togglePath(expandedPaths, at, !includesPath(expandedPaths, at));
        selectedPath = [...at];
        // Closing another row must never move the authority away from an invalid rule.
        if (!invalid) path = [...at];
    }
    function setAdvanced(at: string[], open: boolean) { advancedPaths = togglePath(advancedPaths, at, open); }
    function editable(at: readonly string[], keyword?: string) { return !disabled && (!invalid || keyword !== undefined && invalidKeyword === keyword && same(path, at)); }
    function reject(source: string, message: string, at: readonly string[], keyword = '', detail: readonly (string | number)[] = []) {
        path = [...at]; invalid = true; invalidText = source; invalidKeyword = keyword;
        invalidPath = [...at, ...(keyword ? [keyword] : []), ...detail]; feedback = message;
        oninvalid?.(source, invalidPath);
    }
    function attempted(at: readonly string[], next: Record<string, JsonValue>) {
        function replace(root: SchemaNode, keys: readonly string[]): SchemaNode {
            if (!keys.length) return { ...root, ...next };
            const key = keys[0], output = { ...root };
            Object.defineProperty(output, key, { value: replace(root[key] as SchemaNode, keys.slice(1)), enumerable: true, writable: true, configurable: true });
            return output;
        }
        return JSON.stringify(replace(schema, at));
    }
    function commit(result: ReturnType<typeof updateSchemaAtPath>, at: readonly string[], source = text, keyword = '') {
        if (!result.ok) {
            reject(source, result.error.message, at, keyword);
            if (!keyword) { rawText = source; raw = true; }
            return false;
        }
        path = [...at]; invalid = false; invalidText = ''; invalidPath = []; invalidKeyword = ''; feedback = '';
        ontext(JSON.stringify(result.data.schema));
        return true;
    }
    function patch(at: string[], next: Record<string, JsonValue>, repairKeyword?: string) {
        if (!editable(at, repairKeyword)) return false;
        return commit(updateSchemaAtPath(schema, at, next), at, attempted(at, next), repairKeyword);
    }
    function clearRuleDraft(at: string[], keyword: string) {
        const key = draftKey(at, keyword);
        delete numberDrafts[key]; delete typedTextDrafts[key];
        const drafts = { ...typedDrafts }; delete drafts[key]; typedDrafts = drafts;
    }
    function removeKeyword(at: string[], keyword: string) {
        if (!editable(at, keyword)) return;
        if (commit(removeSchemaKeyword(schema, at, keyword), at)) clearRuleDraft(at, keyword);
    }
    function changeType(at: string[], next: string) {
        if (next) patch(at, { type: next });
        else if (Object.hasOwn(nodeAt(schema, at), 'type')) removeKeyword(at, 'type');
    }
    function addProperty(at: string[]) {
        if (!editable(at)) return;
        const current = nodeAt(schema, at), properties = propertiesAt(current), key = fieldNameDrafts[token(at)] ?? '';
        if (Object.hasOwn(properties, key)) { feedback = 'That exact field key already exists.'; return; }
        const next = { ...properties };
        Object.defineProperty(next, key, { value: {}, enumerable: true, writable: true, configurable: true });
        if (patch(at, { properties: next })) { delete fieldNameDrafts[token(at)]; addingFieldPaths = togglePath(addingFieldPaths, at, false); }
    }
    function setPresence(parent: string[], key: string, next: string) {
        if (!editable(parent)) return;
        const current = nodeAt(schema, parent), required = requiredAt(current);
        const names = next === 'required' ? required.includes(key) ? required : [...required, key] : required.filter(name => name !== key);
        if (names.length) patch(parent, { required: names });
        else if (Object.hasOwn(current, 'required')) removeKeyword(parent, 'required');
    }
    function removeProperty(parent: string[], key: string) {
        if (!editable(parent)) return;
        const current = nodeAt(schema, parent), required = requiredAt(current), next = { ...propertiesAt(current) };
        delete next[key];
        const nextRequired = required.filter(name => name !== key);
        const changed = updateSchemaAtPath(schema, parent, { properties: next, ...(Object.hasOwn(current, 'required') ? { required: nextRequired } : {}) });
        if (commit(changed.ok && required.includes(key) && !nextRequired.length ? removeSchemaKeyword(changed.data.schema, parent, 'required') : changed, parent)) {
            const removed = [...parent, 'properties', key];
            expandedPaths = expandedPaths.filter(at => !removed.every((part, index) => at[index] === part));
            selectedPath = [...parent];
        }
    }
    function extraFields(at: string[], choice: string) {
        patch(at, { additionalProperties: choice === 'allow' });
    }
    function addConstraint(at: string[], keyword: string) {
        if (!keyword || !editable(at)) return;
        patch(at, { [keyword]: numberKeywords.includes(keyword) ? 0 : annotations.includes(keyword) ? '' : keyword === 'enum' ? [null] : null });
    }
    function numeric(at: string[], keyword: string, source: string) {
        if (!editable(at, keyword)) return;
        numberDrafts[draftKey(at, keyword)] = source;
        const count = ['minItems', 'maxItems', 'minLength', 'maxLength'].includes(keyword);
        if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(source) || !Number.isFinite(Number(source)) || count && (!Number.isSafeInteger(Number(source)) || Number(source) < 0)) {
            reject(source, count ? 'Enter a whole number of zero or more.' : 'Finish a finite number.', at, keyword); return;
        }
        if (patch(at, { [keyword]: Number(source) }, keyword)) delete numberDrafts[draftKey(at, keyword)];
    }
    function typed(at: string[], keyword: string, next: JsonValue) {
        if (!editable(at, keyword)) return;
        const result = updateSchemaAtPath(schema, at, { [keyword]: next });
        if (!result.ok) { typedDrafts = { ...typedDrafts, [draftKey(at, keyword)]: next }; reject(attempted(at, { [keyword]: next }), result.error.message, at, keyword); return; }
        clearRuleDraft(at, keyword); commit(result, at);
    }
    function typedInvalid(at: string[], keyword: string, source: string, detail: JsonPath) {
        if (!editable(at, keyword)) return;
        const key = draftKey(at, keyword), value = Object.hasOwn(typedDrafts, key) ? typedDrafts[key] : nodeAt(schema, at)[keyword];
        const formatted = formatJsonValueDraftAtPath(value, detail, source);
        typedTextDrafts[key] = formatted.ok ? formatted.data.text : encodeDraft(value, detail, source);
        reject(source, 'Finish the ' + keywordLabels[keyword].toLowerCase() + ' value.', at, keyword, detail);
    }
    function typedText(at: string[], keyword: string, source: string) {
        if (!editable(at, keyword)) return;
        typedTextDrafts[draftKey(at, keyword)] = source;
        try { typed(at, keyword, JSON.parse(source)); }
        catch { reject(source, 'Finish the ' + keyword + ' JSON.', at, keyword); }
    }
    function encodeDraft(value: JsonValue, keys: readonly (string | number)[], source: string): string {
        if (!keys.length) return source;
        if (!value || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map((entry, index) => index === keys[0] ? encodeDraft(entry, keys.slice(1), source) : JSON.stringify(entry)).join(',') + ']';
        return '{' + Object.keys(value).map(name => JSON.stringify(name) + ':' + (name === keys[0] ? encodeDraft(value[name], keys.slice(1), source) : JSON.stringify(value[name]))).join(',') + '}';
    }
    function draftSchemaSource() {
        if (!invalidKeyword) return invalidText || text;
        const key = draftKey(path, invalidKeyword);
        const source = numberDrafts[key] ?? typedTextDrafts[key] ?? (Object.hasOwn(typedDrafts, key) ? JSON.stringify(typedDrafts[key]) : invalidText);
        return encodeDraft(schema, [...path, invalidKeyword], source);
    }
    function jsonInput(source: string) {
        if (disabled) return;
        raw = true; rawText = source;
        const result = parse(source);
        if (!result.ok) { reject(source, result.error.message, []); return; }
        invalid = false; invalidText = ''; invalidPath = []; feedback = ''; invalidKeyword = '';
        numberDrafts = {}; typedDrafts = {}; typedTextDrafts = {}; path = [];
        ontext(source);
    }
    function mode(next: 'fields' | 'json') {
        if (next === 'fields' && (invalid || !checked.ok)) return;
        if (next === 'json') { rawText = invalid ? draftSchemaSource() : text; raw = true; }
        else raw = false;
    }
</script>

{#snippet typePicker(at: string[], root = false)}
    <div class:node-type-picker={!root} class:type-picker={root}>
        <label class:sr-only={root} for={nodeId(at) + '-schema-type'}>Type</label>
        <select id={nodeId(at) + '-schema-type'} aria-label={label + ' schema type'} value={nodeType(nodeAt(schema, at))} disabled={disabled || invalid || root && editingRaw} onchange={event => changeType(at, event.currentTarget.value)}>
            <option value="">Any JSON type</option>{#each types as [value, title]}<option {value}>{title}</option>{/each}
        </select>
    </div>
{/snippet}

{#snippet constraintInputs(at: string[], keywords: string[])}
    {@const current = nodeAt(schema, at)}
    {#each keywords.filter(key => Object.hasOwn(current, key)) as keyword (keyword)}
        <div class="constraint-row">
            <label for={nodeId(at) + '-' + keyword}>{keywordLabels[keyword]}</label>
            <div class="input-remove">
                <input id={nodeId(at) + '-' + keyword} aria-label={label + ' ' + keywordLabels[keyword].toLowerCase()} inputmode={['minimum', 'maximum'].includes(keyword) ? 'decimal' : 'numeric'} value={numberDrafts[draftKey(at, keyword)] ?? String(current[keyword])} disabled={!editable(at, keyword)} aria-invalid={Object.hasOwn(numberDrafts, draftKey(at, keyword))} oninput={event => numeric(at, keyword, event.currentTarget.value)} />
                <button class="remove" type="button" aria-label={'Remove ' + keywordLabels[keyword].toLowerCase()} disabled={!editable(at, keyword)} onclick={() => removeKeyword(at, keyword)}>×</button>
            </div>
        </div>
    {/each}
{/snippet}

{#snippet addConstraintMenu(at: string[], keywords: string[], name: string)}
    {@const current = nodeAt(schema, at)}
    {#if keywords.some(key => !Object.hasOwn(current, key))}
        <select class="add-choice" aria-label={name} value="" disabled={!editable(at)} onchange={event => { addConstraint(at, event.currentTarget.value); event.currentTarget.value = ''; }}>
            <option value="">+ {name}</option>{#each keywords.filter(key => !Object.hasOwn(current, key)) as keyword}<option value={keyword}>{keywordLabels[keyword]}</option>{/each}
        </select>
    {/if}
{/snippet}

{#snippet nodeEditor(at: string[], parent: string[], fieldKey: string | null)}
    <div class="inline-body" class:deep={ancestors(at).length >= 2} class:selected={same(selectedPath, at)} id={nodeId(at)} data-schema-node data-schema-path={JSON.stringify(at)}>
        <div class="node-options">
            {@render typePicker(at)}
            {#if fieldKey !== null}<div class="presence-picker"><label class="sr-only" for={nodeId(at) + '-presence'}>Presence</label><select id={nodeId(at) + '-presence'} value={requiredAt(nodeAt(schema, parent)).includes(fieldKey) ? 'required' : 'optional'} disabled={!editable(parent)} onchange={event => setPresence(parent, fieldKey, event.currentTarget.value)}><option value="optional">Optional</option><option value="required">Required</option></select></div>{/if}
        </div>
        {@render nodeContents(at)}
        {#if fieldKey !== null}<div class="field-footer"><button class="quiet" type="button" aria-label={'Remove field ' + displayKey(fieldKey)} disabled={!editable(parent)} onclick={() => removeProperty(parent, fieldKey)}>Remove field</button></div>{/if}
    </div>
{/snippet}

{#snippet fieldsSection(at: string[])}
    {@const current = nodeAt(schema, at)}
    {@const properties = propertiesAt(current)}
    {@const required = requiredAt(current)}
    {@const keys = Object.keys(properties)}
    <div class="section-heading"><h4>Fields <span>{keys.length}</span></h4><button class="quiet" type="button" aria-label={'Add ' + label + ' field'} disabled={!editable(at)} onclick={() => addingFieldPaths = togglePath(addingFieldPaths, at, !includesPath(addingFieldPaths, at))}>{includesPath(addingFieldPaths, at) ? 'Cancel' : '+ Add field'}</button></div>
    {#if !keys.length}<p class="empty">No fields defined. Add only the data you need.</p>{/if}
    <div class="field-list">
        {#each keys as key (key)}
            {@const childPath = [...at, 'properties', key]}
            {@const open = includesPath(expandedPaths, childPath)}
            <div class="field-disclosure" data-field-key={key}>
                <button class="field-row field-toggle" type="button" aria-label={'Edit ' + label + ' field ' + displayKey(key)} aria-expanded={open} aria-controls={nodeId(childPath)} onclick={() => toggleExpanded(childPath)}>
                    <span class="field-info"><span class="field-name" title={key}>{displayKey(key)}</span><span class="field-meta">{humanType(properties[key])}<span aria-hidden="true"> · </span>{required.includes(key) ? 'Required' : 'Optional'}</span></span><span class="chevron" aria-hidden="true">{open ? '⌄' : '›'}</span>
                </button>
                {#if open}{@render nodeEditor(childPath, at, key)}{/if}
            </div>
        {/each}
    </div>
    {#if includesPath(addingFieldPaths, at)}
        <form class="add-field" onsubmit={event => { event.preventDefault(); addProperty(at); }}>
            <label for={nodeId(at) + '-new-field'}>Field name <span class="subtle">(exact key)</span></label>
            <div class="name-input"><input id={nodeId(at) + '-new-field'} aria-label={label + ' new field name'} value={fieldNameDrafts[token(at)] ?? ''} disabled={!editable(at)} placeholder="e.g. summary" oninput={event => fieldNameDrafts[token(at)] = event.currentTarget.value} /><button type="submit" aria-label={'Confirm ' + label + ' field'} disabled={!editable(at)}>Add</button></div>
            <p class="hint">Spaces and dots stay literal. A blank name creates an empty key.</p>
        </form>
    {/if}
    <div class="setting-row extra-fields"><label for={nodeId(at) + '-extra-fields'}>Extra fields</label><select id={nodeId(at) + '-extra-fields'} value={current.additionalProperties === false ? 'reject' : 'allow'} disabled={!editable(at)} onchange={event => extraFields(at, event.currentTarget.value)}><option value="allow">Allow</option><option value="reject">Reject</option></select></div>
{/snippet}

{#snippet itemDefinition(at: string[])}
    {@const current = nodeAt(schema, at)}
    {@const childPath = [...at, 'items']}
    {@const open = includesPath(expandedPaths, childPath)}
    {#if Object.hasOwn(current, 'items')}
        <div class="item-disclosure" data-item-definition>
            <button class="field-row field-toggle" type="button" aria-label={'Edit ' + label + ' list item definition'} aria-expanded={open} aria-controls={nodeId(childPath)} onclick={() => toggleExpanded(childPath)}><span class="field-info"><span class="field-name">Item definition</span><span class="field-meta">{humanType(current.items)}</span></span><span class="chevron" aria-hidden="true">{open ? '⌄' : '›'}</span></button>
            {#if open}{@render nodeEditor(childPath, [], null)}{/if}
        </div>
    {:else}<p class="empty">Items may contain any JSON value.</p><button class="quiet" type="button" disabled={!editable(at)} onclick={() => patch(at, { items: {} })}>+ Define items</button>{/if}
{/snippet}

{#snippet advancedSection(at: string[])}
    {@const current = nodeAt(schema, at)}
    {@const count = advancedCount(current)}
    <details class="advanced" open={includesPath(advancedPaths, at)} ontoggle={event => setAdvanced(at, event.currentTarget.open)}>
        <summary>Advanced{#if count}<span>{count} set</span>{/if}</summary>
        <div class="advanced-content">
            {#each annotations.filter(key => Object.hasOwn(current, key)) as keyword (keyword)}
                <div class="annotation"><label for={nodeId(at) + '-' + keyword}>{keywordLabels[keyword]}</label><div class="input-remove">{#if keyword === 'description'}<textarea id={nodeId(at) + '-' + keyword} value={String(current[keyword])} disabled={!editable(at)} oninput={event => patch(at, { [keyword]: event.currentTarget.value })}></textarea>{:else}<input id={nodeId(at) + '-' + keyword} value={String(current[keyword])} disabled={!editable(at)} oninput={event => patch(at, { [keyword]: event.currentTarget.value })} />{/if}<button class="remove" type="button" aria-label={'Remove ' + keywordLabels[keyword].toLowerCase()} disabled={!editable(at)} onclick={() => removeKeyword(at, keyword)}>×</button></div></div>
            {/each}
            {#each ['enum', 'const'].filter(key => Object.hasOwn(current, key)) as keyword (keyword)}
                {@const key = draftKey(at, keyword)}
                <div class="typed-rule"><div class="section-heading"><h4>{keywordLabels[keyword]}</h4><button class="quiet" type="button" aria-label={'Remove ' + keywordLabels[keyword].toLowerCase()} disabled={!editable(at, keyword)} onclick={() => removeKeyword(at, keyword)}>Remove</button></div>
                    {#if disabled}<label for={nodeId(at) + '-' + keyword + '-readonly'}>{keywordLabels[keyword]} JSON</label><textarea id={nodeId(at) + '-' + keyword + '-readonly'} readonly value={typedTextDrafts[key] ?? JSON.stringify(Object.hasOwn(typedDrafts, key) ? typedDrafts[key] : current[keyword], null, 2)}></textarea>
                    {:else if Object.hasOwn(typedTextDrafts, key)}<label for={nodeId(at) + '-' + keyword + '-draft'}>{keywordLabels[keyword]} JSON</label><textarea id={nodeId(at) + '-' + keyword + '-draft'} aria-label={label + ' ' + keyword + ' JSON'} value={typedTextDrafts[key]} aria-invalid="true" disabled={!editable(at, keyword)} oninput={event => typedText(at, keyword, event.currentTarget.value)}></textarea>
                    {:else}<JsonValueControl embedded value={Object.hasOwn(typedDrafts, key) ? typedDrafts[key] : current[keyword]} onchange={next => typed(at, keyword, next)} oninvalid={(source, detail) => typedInvalid(at, keyword, source, detail)} label={label + ' ' + keyword} idPrefix={nodeId(at) + '-' + keyword} disabled={!editable(at, keyword)} />{/if}
                </div>
            {/each}
            {@render addConstraintMenu(at, [...annotations, 'enum', 'const'], 'Add metadata or rule')}
            {#if retainedNumbers(current).length || retainedObject(current) || !arrayView(current) && Object.hasOwn(current, 'items')}
                <div class="retained"><h4>Retained rules</h4><p class="hint">Saved rules for other types stay here.</p>{@render constraintInputs(at, retainedNumbers(current))}{#if retainedObject(current)}{@render fieldsSection(at)}{/if}{#if !arrayView(current) && Object.hasOwn(current, 'items')}{@render itemDefinition(at)}<button class="quiet" type="button" disabled={!editable(at)} onclick={() => removeKeyword(at, 'items')}>Remove item definition</button>{/if}</div>
            {/if}
            {#each requiredAt(current).filter(key => !Object.hasOwn(propertiesAt(current), key)) as key}<div class="orphan-rule"><span>Required key: {displayKey(key)} <span class="subtle">(no field definition)</span></span><button class="quiet" type="button" aria-label={'Remove required key ' + displayKey(key)} disabled={!editable(at)} onclick={() => setPresence(at, key, 'optional')}>Remove</button></div>{/each}
            {#if arrayView(current) && Object.hasOwn(current, 'items')}<button class="quiet" type="button" disabled={!editable(at)} onclick={() => removeKeyword(at, 'items')}>Remove item definition</button>{/if}
        </div>
    </details>
{/snippet}

{#snippet nodeContents(at: string[])}
    {@const current = nodeAt(schema, at)}
    {@const numbers = visibleNumbers(current)}
    {@const appliedNumbers = numbers.filter(key => Object.hasOwn(current, key))}
    {#if objectView(current)}<section class="purpose">{@render fieldsSection(at)}</section>{/if}
    {#if arrayView(current)}<section class="purpose"><div class="section-heading"><h4>List items</h4></div>{@render itemDefinition(at)}</section>{/if}
    {#if numbers.length}<section class="purpose" class:empty-constraints={!appliedNumbers.length}>{#if appliedNumbers.length}<div class="section-heading"><h4>{arrayView(current) ? 'List limits' : nodeType(current) === 'string' ? 'Text length' : 'Value bounds'}</h4></div>{@render constraintInputs(at, numbers)}{/if}{@render addConstraintMenu(at, numbers, 'Add constraint')}</section>{/if}
    {#if !objectView(current) && !arrayView(current) && !numbers.length}<p class="type-note">{nodeType(current) === 'boolean' ? 'A true or false value.' : nodeType(current) === 'null' ? 'An explicit null value.' : 'Any JSON value. Choose a type to define fields, items, or limits.'}</p>{/if}
    {@render advancedSection(at)}
{/snippet}

<div class="schema-editor" data-schema-control data-schema-node data-schema-path="[]">
    <div class="schema-toolbar">
        {@render typePicker([], true)}
        {#if editingRaw}<button class="quiet schema-json-action" type="button" aria-label={'Edit ' + label + ' schema as builder'} disabled={invalid || !checked.ok} onclick={() => mode('fields')}>Use field editor</button>{:else}<button class="quiet schema-json-action" type="button" aria-label={'Edit ' + label + ' schema as JSON'} onclick={() => mode('json')}>Edit schema JSON</button>{/if}
    </div>
    {#if editingRaw}
        <div class="raw-editor"><label for={idPrefix + '-schema-json'}>Schema JSON</label><textarea id={idPrefix + '-schema-json'} spellcheck="false" aria-label={label + ' schema JSON'} value={raw || invalid ? rawText : text} readonly={disabled} aria-invalid={invalid || !checked.ok || !!error} oninput={event => jsonInput(event.currentTarget.value)}></textarea><p class="hint">Valid source keeps its exact formatting.{#if optional} Leave empty to accept any JSON without a schema; {'{}'} keeps an enabled schema with no rules.{/if}</p></div>
    {:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (The native scroll region needs keyboard focus for arrow and page scrolling.) -->
        <div class="schema-scroll" role="region" aria-label={label + ' fields'} tabindex="0">{@render nodeContents([])}</div>
    {/if}
    {#if feedback || error || !checked.ok}<p class="feedback" role="status">{feedback || error || (!checked.ok ? checked.error.message : '')}{#if invalid && !editingRaw}<span> Finish or remove the unfinished rule, or repair it in JSON.</span>{/if}</p>{/if}
</div>

<style>
    .schema-editor { --schema-accent: var(--pc-accent); min-width: 0; color: var(--pc-text); font: inherit; font-size: 12px; line-height: 1.45; container-type: inline-size; }
    .schema-editor, .schema-editor * { box-sizing: border-box; }
    label, input, select, textarea, button, summary, p, h4, span { font-size: 12px; }
    input, select, textarea, button { font-family: inherit; }
    input, select, textarea { width: 100%; min-width: 0; padding: 6px 8px; border: 1px solid var(--pc-border); border-radius: 3px; background: var(--pc-field); color: var(--pc-text); }
    select { padding-right: 20px; }
    button { min-height: 29px; padding: 4px 8px; border: 1px solid var(--pc-border); border-radius: 3px; background: var(--pc-control); color: var(--pc-text); cursor: pointer; }
    button:hover:enabled { border-color: var(--schema-accent); }
    textarea { min-height: 68px; resize: vertical; line-height: 1.5; }
    h4, p { margin: 0; }
    h4 { font-weight: 600; letter-spacing: .01em; }
    h4 span, .subtle, .field-meta, .hint, .empty, .type-note { color: var(--pc-muted); }
    .setting-row { display: grid; grid-template-columns: minmax(65px, .8fr) minmax(95px, 1.2fr); gap: 8px; align-items: center; }
    .schema-toolbar { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; padding: 0 0 12px; }
    .type-picker { flex: 1 1 110px; min-width: 0; }
    .schema-json-action { flex: 0 0 auto; }
    .node-options { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; min-width: 0; }
    .node-type-picker { display: flex; flex: 1 1 140px; align-items: center; gap: 6px; min-width: 0; }
    .node-type-picker > label { flex: 0 0 auto; }
    .node-type-picker > select { flex: 1; }
    .presence-picker { flex: 1 1 92px; min-width: 0; }
    .schema-scroll { max-height: 400px; overflow-y: scroll; overflow-x: hidden; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: var(--pc-border) transparent; overscroll-behavior: contain; padding-right: 5px; }
    .schema-scroll::-webkit-scrollbar { width: 8px; }
    .schema-scroll::-webkit-scrollbar-thumb { background: var(--pc-border); border-radius: 4px; }
    .schema-scroll::-webkit-scrollbar-track { background: transparent; }
    .purpose { padding: 10px 0; border-top: 1px solid var(--pc-border); }
    .purpose.empty-constraints { padding: 2px 0 6px; border-top: 0; }
    .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; min-width: 0; }
    .section-heading h4 { min-width: 0; overflow-wrap: anywhere; }
    h4 span { margin-left: 5px; font-weight: 400; }
    .quiet { border-color: transparent; background: transparent; color: var(--pc-muted); padding: 2px 3px; }
    .section-heading .quiet { white-space: nowrap; }
    .field-list, .field-disclosure, .item-disclosure { min-width: 0; }
    .field-disclosure + .field-disclosure { border-top: 1px solid color-mix(in srgb, var(--pc-border) 65%, transparent); }
    .field-row { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 45px; padding: 8px 3px; }
    .field-toggle { width: 100%; border: 0; border-radius: 0; background: transparent; text-align: left; }
    .field-toggle:hover { background: color-mix(in srgb, var(--pc-control) 45%, transparent); }
    .field-toggle:focus-visible { outline-offset: -2px; }
    .field-info { min-width: 0; flex: 1; }
    .field-name { display: block; color: var(--pc-text); overflow-wrap: anywhere; white-space: pre-wrap; }
    .field-meta { display: block; margin-top: 2px; }
    .field-meta span { margin: 0 3px; }
    .chevron { flex: 0 0 13px; color: var(--schema-accent); font-size: 17px; text-align: center; }
    .inline-body { min-width: 0; margin: 0 0 8px 2px; padding: 9px 0 0 8px; border-left: 1px solid var(--pc-border); }
    .inline-body.selected { border-left-color: var(--schema-accent); }
    .inline-body.deep { margin-left: 0; padding-left: 0; border-left: 0; }
    .inline-body > .purpose { margin-top: 10px; }
    .inline-body > .purpose.empty-constraints { margin-top: 0; }
    .extra-fields { margin-top: 9px; padding-top: 10px; border-top: 1px solid var(--pc-border); }
    .empty, .type-note { padding: 5px 0 9px; }
    .type-note { margin-top: 9px; }
    .add-field { margin: 10px 0; padding: 8px; border: 1px solid var(--pc-border); border-radius: 3px; }
    .add-field label { display: block; margin-bottom: 5px; }
    .name-input { display: flex; align-items: center; gap: 6px; }
    .name-input input { flex: 1; }
    .name-input button { flex: 0 0 auto; }
    .hint { line-height: 1.5; margin: 7px 0 0; overflow-wrap: anywhere; }
    .constraint-row { display: grid; grid-template-columns: minmax(73px, 1fr) minmax(75px, 1fr); align-items: center; gap: 7px; margin: 7px 0; }
    .input-remove { display: flex; align-items: flex-start; gap: 4px; min-width: 0; }
    .input-remove :is(input, textarea) { flex: 1; }
    .remove { flex: 0 0 22px; min-height: 30px; padding: 2px; background: transparent; border-color: transparent; color: var(--pc-muted); font-size: 17px; }
    .add-choice { width: auto; max-width: 100%; margin-top: 6px; color: var(--pc-muted); background: transparent; border-color: transparent; padding-left: 0; }
    .advanced { border-top: 1px solid var(--pc-border); margin-top: 3px; }
    summary { cursor: pointer; padding: 10px 0; color: var(--pc-text); }
    summary > span { color: var(--pc-muted); margin-left: 8px; }
    .advanced-content { padding: 0 0 10px; min-width: 0; }
    .annotation { margin: 10px 0; }
    .annotation > label { display: block; margin-bottom: 4px; }
    .typed-rule, .retained { border-top: 1px solid var(--pc-border); padding-top: 10px; margin-top: 12px; }
    .typed-rule :global(.json-value) { min-width: 0; max-width: 100%; }
    .typed-rule :global(button) { max-width: 100%; white-space: normal; }
    .typed-rule :global(.actions) { flex-wrap: wrap; }
    .retained > .hint { margin-bottom: 9px; }
    .orphan-rule { display: flex; align-items: center; gap: 7px; margin-top: 9px; }
    .orphan-rule > span { flex: 1; min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
    .field-footer { padding-top: 6px; border-top: 1px solid var(--pc-border); }
    .feedback { margin-top: 9px; padding: 8px; border-left: 2px solid var(--schema-accent); color: var(--pc-text); overflow-wrap: anywhere; }
    .raw-editor label { display: block; margin-bottom: 5px; }
    .raw-editor textarea { min-height: 250px; font-family: ui-monospace, Consolas, monospace; font-size: 12px; tab-size: 2; }
    :is(input, select, textarea, button, summary, .schema-scroll):focus-visible { outline: 2px solid var(--schema-accent); outline-offset: 2px; }
    :disabled { opacity: .5; cursor: default; }
    [aria-invalid='true'] { border-color: var(--pc-error); }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    @container (max-width: 280px) { .setting-row { gap: 6px; grid-template-columns: minmax(57px, .75fr) minmax(85px, 1.25fr); } .schema-toolbar { gap: 6px; } summary > span { margin-left: 4px; } }
</style>

