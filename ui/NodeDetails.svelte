<script lang="ts">
    import {controlInputPresentation} from '../src/ui/node-control-projection.js';
    import {parseControlInput} from '../src/ui/control-input-contracts.js';
    import type {ControlInputFormat} from '../src/ui/control-input-contracts';
    import {cloneJsonValue} from '../src/workflow/operations/json-data.js';
    import type {SchemaDraftState} from '../src/ui/schema-authoring';
    import type {JsonValue} from '../src/workflow/operations/json-data';
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import { presentDiagnostics } from '../src/ui/diagnostics.js';
    import { onDestroy, untrack } from 'svelte';
    import DetailControlEditor from './DetailControl.svelte';
    import RecallDetails from './RecallDetails.svelte';
    import ModifierStack from './ModifierStack.svelte';
    import WorkflowData from './WorkflowData.svelte';
    import type { DetailBindingMode, DetailControl, DetailEditResponse, DetailModifier, DetailSelection, NodeDetailsActions, NodeDetailsView } from './detail-types';
    let { view, actions = {}, idPrefix = 'pc-node-details', openGuide }: { view: NodeDetailsView | null; actions?: NodeDetailsActions; idPrefix?: string; openGuide?: () => void } = $props();
    type LocalDraft = { text: string; format?:ControlInputFormat; typedValue?: unknown; error: string; pending: boolean; editor?: DetailControl['editor']; representation?: 'json-text' | 'json-value'; artifactKind?: string; required?: boolean; boundaryId?: string; boundaryDirection?: 'input' | 'output'; modifierType?: string; helperKey?:string };
    let drafts = $state<Record<string, LocalDraft>>({});
    let errors = $state<Record<string, string>>({});
    // View/navigation state never owns the canonical text of an untouched control.
    let schemaStates = $state.raw<Record<string, SchemaDraftState>>({});
    let identity = '', revision = '', support = '';
    let sequence = 0, boundaryDraftSequence = 0, draftVisit = 0;
    const requests = new Map<string, number>();
    let modifierBusy = $state(false);
    let modifierIdSequence = 0, modifierBusySequence = 0, modifierEpoch = 0;
    const modifierGenerations = new Map<string, number>();
    const draftGenerations = new Map<string, number>();
    // The mounted workspace inspector owns drafts; qualified nodes never share them.
    const draftCache = new Map<string, { contract: string; drafts: typeof drafts; schemas: typeof schemaStates }>();
    const settledDrafts = (values: typeof drafts) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { ...value, pending: false }]));
    function supportedDrafts(values: typeof drafts, node: NodeDetailsView | null) {
        if (!node) return {};
        return Object.fromEntries(Object.entries(settledDrafts(values)).flatMap(([key, value]) => {
            if (key.startsWith('["helper-binding",')) {
                const tuple=JSON.parse(key),row=node.helperBindings?.roles.find(row=>row.role===tuple[1]);
                return row && tuple[2]==='model' && node.helperBindings?.editable && value.helperKey===node.helperBindings.helperKey ? [[key,value]] : [];
            }
            if (key === 'model') {
                const binding = node.model?.model;
                return binding?.allowedModes.some(option => option.value === 'override') ? [[key, value]] : [];
            }
            if (key === 'boundary') return node.boundary && value.boundaryId === node.boundary.id && value.boundaryDirection === node.boundary.direction ? [[key, { ...value, artifactKind: node.boundary.kinds.includes(value.artifactKind ?? '') ? value.artifactKind : node.boundary.kind }]] : [];
            if (key === 'fileInput') return node.fileInput ? [[key, value]] : [];
            if (key.startsWith('modifier:')) {
                const item = node.modifiers?.items.find(item => 'modifier:' + item.id === key);
                return item && item.type === value.modifierType && node.modifiers?.options.some(option => option.type === item.type) ? [[key, value]] : [];
            }
            return node.controls.some(control => control.key === key && control.editor === value.editor && control.representation === value.representation && (control.editor === 'json' || control.editor === 'lines')) ? [[key, value]] : [];
        }));
    }
    const selectionIdentity = (node: DetailSelection) => JSON.stringify([node.documentNamespace ?? '', node.selectionKey, 'kind' in node.address
        ? [node.address.kind, node.address.definitionRef.id, node.address.definitionRef.version, node.address.definitionRef.semanticHash, node.address.nodeId]
        : [node.address.workflowId, node.address.instancePath, node.address.nodeId]]);
    let alive = true;
    onDestroy(() => { alive = false; requests.clear(); draftCache.clear(); draftGenerations.clear(); modifierGenerations.clear(); });
    $effect.pre(() => {
        const next = view ? selectionIdentity(view) : '', nextRevision = view?.revision ?? '';
        const nextSupport = view?.editorContractKey ?? JSON.stringify([view?.controls.map(control => [control.key, control.editor, control.representation, control.allowEmpty, control.structured, control.inputSpec?.id, control.inputSpec?.version]), view?.model?.profile.allowedModes, view?.model?.model.allowedModes, view?.model?.editable, view?.helperBindings && [view.helperBindings.helperKey,view.helperBindings.editable,view.helperBindings.roles.map(row=>[row.role,row.model.allowedModes])], view?.boundary && [view.boundary.id, view.boundary.direction, view.boundary.kinds], !!view?.fileInput, view?.modifiers && [view.modifiers.items.map(item => [item.id, item.type]).sort(([a], [b]) => a.localeCompare(b)), view.modifiers.options.map(option => [option.type, option.fields.map(field => [field.key, field.editor])]), view.modifiers.editable, view.readOnly]]);
        const changedSelection = next !== identity;
        if (changedSelection || nextRevision !== revision || nextSupport !== support) {
            if (changedSelection || nextSupport !== support) { boundaryDraftSequence++; modifierEpoch++; }
            if (changedSelection) {
                draftVisit++;
                if (identity) draftCache.set(identity, { contract: support, drafts: untrack(() => settledDrafts(drafts)), schemas: untrack(() => ({...schemaStates})) });
            }
            const incompatible = !changedSelection && nextSupport !== support;
            const retained = draftCache.get(next), changedContract = incompatible || !!retained && retained.contract !== nextSupport;
            let restored = changedSelection ? retained?.drafts ?? {} : untrack(() => drafts);
            let restoredSchemas = changedSelection ? retained?.schemas ?? {} : untrack(() => schemaStates);
            if (changedContract) {
                draftCache.delete(next); restoredSchemas = {};
                // Boundary label/required fields keep the same contract when the allowed
                // artifact kinds change. Revalidate only that field; other incompatible
                // editor drafts must remain discarded when an old contract returns.
                restored = restored.boundary ? supportedDrafts({ boundary: restored.boundary }, view) : {};
                if (restored.boundary) nextDraftGeneration('boundary');
            }
            identity = next; revision = nextRevision; support = nextSupport; requests.clear(); sequence++; errors = {}; modifierBusy = false; modifierBusySequence++;
            // A revision expires writes, while unsaved text still belongs to this node.
            drafts = supportedDrafts(restored, view);
            schemaStates = Object.fromEntries(Object.entries(restoredSchemas).filter(([key])=>view?.controls.some(control=>control.key===key && control.inputSpec?.editor==='schema')));
        }
    });
    const selection = (node: NodeDetailsView): DetailSelection => ({ ...(node.documentNamespace ? { documentNamespace: node.documentNamespace } : {}), selectionKey: node.selectionKey, revision: node.revision, address: 'kind' in node.address ? { ...node.address, definitionRef: { ...node.address.definitionRef } } : { ...node.address, instancePath: [...node.address.instancePath] } });
    const current = (captured: DetailSelection) => alive && !!view && view.selectionKey === captured.selectionKey && view.revision === captured.revision && selectionIdentity(view) === selectionIdentity(captured);
    const formatFor=(control:DetailControl)=>drafts[control.key]?.format??controlInputPresentation(control).format;
    const textFor=(control:DetailControl)=>controlInputPresentation(control,drafts[control.key]?.format).text;
    function draftContract(node: NodeDetailsView, key: string) {
        if (node.editorContractKey) return node.editorContractKey + ':' + key;
        if(key.startsWith('["helper-binding",')){const tuple=JSON.parse(key);return node.helperBindings?.editable && node.helperBindings.roles.some(row=>row.role===tuple[1]) ? JSON.stringify(['helper-binding',node.helperBindings.helperKey,tuple[1],tuple[2]]) : null;}
        if (key === 'model') {
            const binding = node.model?.model;
            return binding?.allowedModes.some(option => option.value === 'override') ? JSON.stringify(['binding', key, node.model?.editable ?? !node.readOnly]) : null;
        }
        const control = node.controls.find(control => control.key === key);
        return control && (control.editor === 'json' || control.editor === 'lines') ? JSON.stringify([control.editor, control.representation, control.allowEmpty, control.structured, control.inputSpec?.id, control.inputSpec?.version]) : null;
    }
    function nextDraftGeneration(key: string) {
        const generation = (draftGenerations.get(key) ?? 0) + 1;
        draftGenerations.set(key, generation);
        return generation;
    }
    function settleSubmittedDraft(key: string) {
        // Submitted text expires; inactive/view schema state remains in its cache.
        const next = { ...drafts }; delete next[key]; drafts = next;
    }
    async function perform(key: string, presentation: boolean, operation: (captured: DetailSelection) => DetailEditResponse) {
        const node = view;
        const bindingEdit = key === 'profileId' || key === 'model';
        if (!node || (presentation ? !node.canPresent : bindingEdit ? !canEditBinding(node) : node.readOnly)) return;
        const captured = selection(node), token = ++sequence, visit = draftVisit, contract = draftContract(node, key);
        const generation = drafts[key] && contract ? nextDraftGeneration(key) : null;
        requests.set(key, token); errors = { ...errors, [key]: '' };
        if (drafts[key]) drafts = { ...drafts, [key]: { ...drafts[key], pending: true, error: '' } };
        let error = '', accepted = false;
        try { const result = await operation(captured); accepted = result.ok; if (!result.ok) error = result.error.code + ': ' + result.error.message; }
        catch { error = 'The edit could not be accepted. Check the current settings before trying the edit again.'; }
        // A successful transaction may publish its revision before acknowledgment.
        // Expire only the submitted draft; later text, Saves and node visits keep theirs.
        if (accepted && generation !== null && drafts[key] && alive && view && draftVisit === visit && selectionIdentity(view) === selectionIdentity(captured) && draftGenerations.get(key) === generation && draftContract(view, key) === contract) {
            settleSubmittedDraft(key);
        }
        if (!current(captured) || requests.get(key) !== token) return;
        requests.delete(key); errors = { ...errors, [key]: error };
        if (drafts[key]) {
            if (error) drafts = { ...drafts, [key]: { ...drafts[key], error, pending: false } };
            else settleSubmittedDraft(key);
        }
    }
    function chooseFile(input: HTMLInputElement) {
        const file = input.files?.[0]; input.value = '';
        if (!file || !view?.fileInput || view.readOnly || !actions.loadFile || drafts.fileInput?.pending) return;
        drafts = { ...drafts, fileInput: { text: '', error: '', pending: false } };
        // perform captures this selection synchronously before the file action starts reading.
        void perform('fileInput', false, captured => actions.loadFile!(captured, file));
    }
    function draft(control: DetailControl, text: string) {
        if (!view || view.readOnly) return;
        nextDraftGeneration(control.key);
        requests.delete(control.key);
        drafts = { ...drafts, [control.key]: { text, format:drafts[control.key]?.format, error: '', pending: false, editor: control.editor, representation: control.representation } };
        errors = { ...errors, [control.key]: '' };
    }
    function draftValue(control: DetailControl, value: unknown) {
        if (!view || view.readOnly) return;
        nextDraftGeneration(control.key); requests.delete(control.key);
        drafts = { ...drafts, [control.key]: { text: '', typedValue: value, error: '', pending: false, editor: control.editor, representation: control.representation } };
        errors = { ...errors, [control.key]: '' };
    }
    function formatDraft(control:DetailControl,format:ControlInputFormat) {
        const current=drafts[control.key];
        if(current?.typedValue!==undefined){
            draftValue(control,current.typedValue);
            drafts={...drafts,[control.key]:{...drafts[control.key],format}};
            return;
        }
        const present=controlInputPresentation(control,format),text=current?.text;
        draft(control,text??present.text);
        drafts={...drafts,[control.key]:{...drafts[control.key],format:text===undefined?present.format:format}};
    }
    function schemaDraft(control:DetailControl,state:SchemaDraftState){
        if(!view||view.readOnly||!actions.editControl||drafts[control.key]?.pending)return;
        if(JSON.stringify(schemaStates[control.key])===JSON.stringify(state))return;
        schemaStates={...schemaStates,[control.key]:state};
        // Invalid-only input is a genuine authored generation even without ontext.
        if(state.invalid){
            nextDraftGeneration(control.key); requests.delete(control.key);
            const current=drafts[control.key], text=current?.text??textFor(control);
            drafts={...drafts,[control.key]:{...current,text,error:text!==''?state.feedback:'',pending:false,editor:control.editor,representation:control.representation}};
        }
    }
    function save(control: DetailControl) {
        if (!view || view.readOnly || !actions.editControl) return;
        const text = drafts[control.key]?.text ?? textFor(control);
        if(text!=='' && schemaStates[control.key]?.invalid)return;
        const authored = drafts[control.key]?.typedValue;
        const cloned = authored === undefined ? undefined : cloneJsonValue(authored);
        if(cloned && !cloned.ok){drafts={...drafts,[control.key]:{...drafts[control.key],text,error:cloned.error.message,pending:false,editor:control.editor,representation:control.representation}};return;}
        const typed = cloned?.ok ? cloned.data.value : undefined;
        let value: unknown = text;
        if (control.inputSpec) {
            const input = typed === undefined ? {format:control.inputSpec.editor==='path'?'json':drafts[control.key]?.format ?? (control.structured ? 'json' : formatFor(control)) as ControlInputFormat,text} : {format:'rows' as const,value:typed as JsonValue};
            const parsed = parseControlInput(control.inputSpec,{...input,currentValue:control.value as JsonValue});
            if(!parsed.ok){drafts={...drafts,[control.key]:{...drafts[control.key],text,error:parsed.error.message,pending:false,editor:control.editor,representation:control.representation}};return;}
            value=parsed.data.value;
        } else if (typed !== undefined) value=typed;
        else if (control.editor === 'json') {
            try {if (!(control.representation === 'json-text' && control.allowEmpty && text.trim() === '')) {const parsed=JSON.parse(text);if(control.representation !== 'json-text')value=parsed;}}
            catch {drafts={...drafts,[control.key]:{text,error:'Enter valid JSON before saving.',pending:false,editor:control.editor,representation:control.representation}};return;}
        } else if (control.editor === 'lines') value=text.split('\n').filter(line=>line.trim());
        if(control.inputSpec?.editor==='schema' && !drafts[control.key])drafts={...drafts,[control.key]:{text,error:'',pending:false,editor:control.editor,representation:control.representation}};
        void perform(control.key, false, captured => actions.editControl!(captured, control.key, value));
    }
    function editControl(control: DetailControl, value: unknown) {
        if (!actions.editControl) return;
        void perform(control.key, false, captured => actions.editControl!(captured, control.key, value));
    }
    function editNumber(control: DetailControl, input: HTMLInputElement) {
        if (!view || view.readOnly || !actions.editControl) return;
        const value = Number(input.value);
        if (!input.value.trim() || !Number.isFinite(value)) {
            errors = { ...errors, [control.key]: 'Enter a finite number before saving.' }; return;
        }
        if (!input.validity.valid) {
            errors = { ...errors, [control.key]: 'Enter a number within the allowed range and step.' }; return;
        }
        editControl(control, value);
    }
    const helperBindingKey=(role:string,field:'profileId'|'model')=>JSON.stringify(['helper-binding',role,field]);
    const helperRow=(role:string)=>view?.helperBindings?.roles.find(row=>row.role===role);
    const canEditHelperBindings=()=>!!view?.helperBindings?.editable&&!view.readOnly&&!!actions.editHelperBinding;
    const canEditHelperField=(role:string,field:'profileId'|'model')=>canEditHelperBindings()&&helperRow(role)?.[field==='profileId'?'profile':'model'].editable!==false;
    const helperModelMode=(role:string)=>drafts[helperBindingKey(role,'model')]?'override':helperRow(role)?.model.mode;
    function editHelperBinding(role:string,field:'profileId'|'model',mode:DetailBindingMode,value:string|null){
        if(!canEditHelperField(role,field)||!helperRow(role))return;
        void perform(helperBindingKey(role,field),false,captured=>actions.editHelperBinding!(captured,role,field,mode,value));
    }
    function draftHelperModel(role:string,text:string){
        if(!canEditHelperField(role,'model')||!helperRow(role))return;
        const key=helperBindingKey(role,'model');nextDraftGeneration(key);requests.delete(key);
        drafts={...drafts,[key]:{text,error:'',pending:false,helperKey:view?.helperBindings?.helperKey}};errors={...errors,[key]:''};
    }
    function chooseHelperModelMode(role:string,mode:DetailBindingMode){
        const row=helperRow(role);if(!canEditHelperField(role,'model')||!row?.model.allowedModes.some(option=>option.value===mode))return;
        const key=helperBindingKey(role,'model');
        if(mode==='override'){draftHelperModel(role,drafts[key]?.text??row.model.value??'');return;}
        requests.delete(key);const next={...drafts};delete next[key];drafts=next;errors={...errors,[key]:''};
        if(mode!==row.model.mode)editHelperBinding(role,'model',mode,null);
    }
    function saveHelperModel(role:string,text:string){
        if(!canEditHelperField(role,'model')||helperModelMode(role)!=='override')return;
        draftHelperModel(role,text);const key=helperBindingKey(role,'model');
        if(!text.trim()||text.length>256){errors={...errors,[key]:'Enter a model identifier of 1–256 characters.'};return;}
        editHelperBinding(role,'model','override',text);
    }
    function editBinding(field: 'profileId' | 'model', mode: string, value: string | null) {
        const binding = bindingFor(field);
        if (!binding?.allowedModes.some(option => option.value === mode) || !actions.editBinding) return;
        void perform(field, false, captured => actions.editBinding!(captured, field, mode as DetailBindingMode, value));
    }
    const bindingFor = (field: 'profileId' | 'model') => field === 'profileId' ? view?.model?.profile : view?.model?.model;
    const canEditBinding = (node: NodeDetailsView | null = view) => !!node?.model && (node.model.editable ?? !node.readOnly) && !!actions.editBinding;
    const bindingMode = (field: 'profileId' | 'model') => drafts[field] ? 'override' : bindingFor(field)?.mode;
    const bindingText = (field: 'profileId' | 'model') => drafts[field]?.text ?? bindingFor(field)?.value ?? '';
    const usesProfileModel = () => view?.model?.profile.mode === 'override' || !!view?.model?.profileDefaultModel;
    function draftBinding(field: 'model', text: string) {
        if (!canEditBinding() || !bindingFor(field)?.allowedModes.some(option => option.value === 'override')) return;
        nextDraftGeneration(field);
        requests.delete(field);
        drafts = { ...drafts, [field]: { text, error: '', pending: false } };
        errors = { ...errors, [field]: '' };
    }
    function chooseBindingMode(field: 'model', mode: string) {
        const binding = bindingFor(field);
        if (!canEditBinding() || !binding?.allowedModes.some(option => option.value === mode)) return;
        // Revealing an editor is local; null keeps its historical saved fallback.
        if (mode === 'override') { draftBinding(field, bindingText(field)); return; }
        requests.delete(field);
        const next = { ...drafts }; delete next[field]; drafts = next;
        errors = { ...errors, [field]: '' };
        if (mode !== binding.mode) editBinding(field, mode, null);
    }
    function saveBinding(field: 'model', text: string) {
        if (!canEditBinding() || (field === 'model' && bindingMode(field) !== 'override') || !bindingFor(field)?.allowedModes.some(option => option.value === 'override')) return;
        draftBinding(field, text);
        if (!text.trim()) {
            const defaultMode = view?.readOnly ? 'block' : 'inherit';
            if (field === 'model' && usesProfileModel() && bindingFor(field)?.allowedModes.some(option => option.value === defaultMode)) {
                chooseBindingMode(field, defaultMode); return;
            }
            drafts = { ...drafts, [field]: { text, error: 'Enter a model identifier before saving an override.', pending: false } };
            return;
        }
        editBinding(field, 'override', text);
    }
    const canEditModifiers = () => !!view?.modifiers?.editable && !view.readOnly && !!actions.editModifiers;
    const cloneModifiers = () => JSON.parse(JSON.stringify(view?.modifiers?.items ?? [])) as DetailModifier[];
    function modifierSettings(item: DetailModifier) {
        const cached = drafts['modifier:' + item.id];
        if (cached) { try { return JSON.parse(cached.text) as Record<string, unknown>; } catch { /* saved settings remain inspectable */ } }
        return item.settings;
    }
    const modifierDrafts = () => Object.fromEntries((view?.modifiers?.items ?? []).map(item => {
        const cached = drafts['modifier:' + item.id];
        return [item.id, { settings: modifierSettings(item), error: cached?.error || errors['modifier:' + item.id] || '', pending: !!cached?.pending, dirty: !!cached }];
    }));
    function editModifierStack(items: DetailModifier[]) {
        if (!canEditModifiers() || modifierBusy || items.length > 16 || !actions.editModifiers) return;
        const token = ++modifierBusySequence;
        modifierBusy = true;
        void perform('modifiers', false, captured => actions.editModifiers!(captured, items)).finally(() => { if (token === modifierBusySequence) modifierBusy = false; });
    }
    function addModifier(type: string) {
        if (!canEditModifiers() || !view?.modifiers || view.modifiers.items.length >= 16) return;
        const option = view.modifiers.options.find(option => option.type === type);
        if (!option) return;
        const items = cloneModifiers();
        let id: string;
        do { id = `mod-${type.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 28)}-${Date.now().toString(36)}-${(++modifierIdSequence).toString(36)}`; } while (items.some(item => item.id === id));
        editModifierStack([...items, { id, type, version: 1, enabled: true, settings: JSON.parse(JSON.stringify(option.defaultSettings)) }]);
    }
    function quickModifier(type: string, enabled: boolean) {
        if (!canEditModifiers() || !view?.modifiers || !view.modifiers.options.some(option => option.type === type)) return;
        const items = cloneModifiers();
        if (!items.some(item => item.type === type)) { if (enabled) addModifier(type); return; }
        editModifierStack(items.map(item => item.type === type ? { ...item, enabled } : item));
    }
    function enableModifier(id: string, enabled: boolean) {
        if (!canEditModifiers() || !view?.modifiers?.items.some(item => item.id === id)) return;
        editModifierStack(cloneModifiers().map(item => item.id === id ? { ...item, enabled } : item));
    }
    function removeModifier(id: string) {
        if (!canEditModifiers() || !view?.modifiers?.items.some(item => item.id === id)) return;
        editModifierStack(cloneModifiers().filter(item => item.id !== id));
    }
    function moveModifier(id: string, direction: -1 | 1) {
        if (!canEditModifiers()) return;
        const items = cloneModifiers(), from = items.findIndex(item => item.id === id), to = from + direction;
        if (from < 0 || to < 0 || to >= items.length) return;
        [items[from], items[to]] = [items[to], items[from]];
        editModifierStack(items);
    }
    function draftModifier(id: string, field: string, value: unknown) {
        if (!canEditModifiers()) return;
        const item = view?.modifiers?.items.find(item => item.id === id), option = view?.modifiers?.options.find(option => option.type === item?.type);
        if (!item || !option?.fields.some(control => control.key === field)) return;
        const key = 'modifier:' + id;
        modifierGenerations.set(key, (modifierGenerations.get(key) ?? 0) + 1);
        requests.delete(key); errors = { ...errors, [key]: '' };
        drafts = { ...drafts, [key]: { text: JSON.stringify({ ...modifierSettings(item), [field]: value }), error: '', pending: false, modifierType: item.type } };
    }
    function saveModifier(id: string) {
        if (!canEditModifiers() || !actions.editModifiers) return;
        const item = view?.modifiers?.items.find(item => item.id === id), key = 'modifier:' + id;
        if (!item || !drafts[key] || drafts[key].pending) return;
        const generation = (modifierGenerations.get(key) ?? 0) + 1, epoch = modifierEpoch, type = item.type;
        modifierGenerations.set(key, generation);
        const settings = modifierSettings(item), items = cloneModifiers().map(entry => entry.id === id ? { ...entry, settings } : entry);
        void perform(key, false, async captured => {
            const result = await actions.editModifiers!(captured, items);
            // A accepted graph commit can publish a revision before its acknowledgment.
            if (result.ok && alive && view && selectionIdentity(view) === selectionIdentity(captured) && modifierEpoch === epoch && modifierGenerations.get(key) === generation && view.modifiers?.items.some(entry => entry.id === id && entry.type === type)) {
                const next = { ...drafts }; delete next[key]; drafts = next;
            }
            return result;
        });
    }
    const controlGroups = $derived.by(() => {
        const groups = new Map<string, DetailControl[]>();
        for (const control of view?.controls ?? []) {
            const name = control.group && control.group !== 'Main' ? control.group : control.advanced ? 'Advanced' : 'Main';
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name)!.push(control);
        }
        return [...groups].sort(([a], [b]) => a === 'Main' ? -1 : b === 'Main' ? 1 : 0);
    });
    let mountedGroups = $state<Record<string, boolean>>({});
    const groupHasError = (controls: DetailControl[]) => controls.some(control => !!(drafts[control.key]?.error || errors[control.key]));
    function editName(value: string) {
        if (!view || view.boundary || !actions.present) return;
        void perform('alias', true, captured => actions.present!(captured, 'alias', value === view?.canonicalTitle ? '' : value));
    }
    function boundaryValues() {
        return { label: drafts.boundary?.text ?? view?.boundary?.label ?? '', artifactKind: drafts.boundary?.artifactKind ?? view?.boundary?.kind ?? '', required: drafts.boundary?.required ?? view?.boundary?.required ?? false };
    }
    function draftBoundary(field: 'label' | 'artifactKind' | 'required', value: string | boolean) {
        if (!view?.boundary || view.readOnly || !actions.editInterface) return;
        if (field === 'artifactKind' && !view.boundary.kinds.includes(String(value))) return;
        const next = { ...boundaryValues(), [field]: value };
        boundaryDraftSequence++;
        requests.delete('boundary'); errors = { ...errors, boundary: '' };
        drafts = { ...drafts, boundary: { text: String(next.label), artifactKind: String(next.artifactKind), required: next.required === true, error: '', pending: false, boundaryId: view.boundary.id, boundaryDirection: view.boundary.direction } };
    }
    function editBoundary() {
        if (!view?.boundary || view.readOnly || !actions.editInterface || drafts.boundary?.pending) return;
        const id = view.boundary.id, values = boundaryValues();
        if (!values.label.trim() || !view.boundary.kinds.includes(values.artifactKind)) return;
        const draftSequence = ++boundaryDraftSequence;
        drafts = { ...drafts, boundary: { text: values.label, artifactKind: values.artifactKind, required: values.required, error: '', pending: false, boundaryId: id, boundaryDirection: view.boundary.direction } };
        void perform('boundary', false, async captured => {
            const result = await actions.editInterface!(captured, { kind: 'update', id, ...values });
            // A successful interface transaction can publish its revision before this response settles.
            // Only its acknowledged draft expires; newer local edits still belong to the selected port.
            if (result.ok && alive && view?.boundary?.id === id && selectionIdentity(view) === selectionIdentity(captured) && boundaryDraftSequence === draftSequence) {
                const next = { ...drafts }; delete next.boundary; drafts = next;
            }
            return result;
        });
    }
</script>
<section class="pc-node-details" aria-label="Node details">
{#if view}
    <header style:--pc-detail-family={view.familyColor ?? 'var(--pc-accent)'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={view.iconPath} /></svg>
        <div class="pc-detail-identity">
            <input id={idPrefix + '-name'} class="pc-detail-name" aria-label="Node name" maxlength={view.boundary ? undefined : 80} value={view.boundary ? boundaryValues().label : view.alias || view.title || view.canonicalTitle} disabled={view.boundary ? view.readOnly || !actions.editInterface : !view.canPresent || !actions.present} oninput={event => { if (view?.boundary) draftBoundary('label', event.currentTarget.value); }} onchange={event => { if (!view?.boundary) editName(event.currentTarget.value); }} />
            {#if !view.boundary && (view.alias || view.title || view.canonicalTitle) !== view.canonicalTitle}<small data-canonical-title>Canonical type: {view.canonicalTitle}</small>{/if}
            <small>{view.boundary ? 'Subgraph ' + view.boundary.direction : view.family + ' · ' + view.phase + ' phase'}</small>
        </div>
        {#if openGuide}<button type="button" class="pc-node-guide-help" aria-label={`Open ${view.canonicalTitle} guide`} title={`Help with ${view.canonicalTitle}`} onclick={openGuide}>?</button>{/if}
    </header>
    {#if view.phaseEditable}<label>Workflow stage<select aria-label="Workflow stage" value={view.phase} disabled={view.readOnly || !actions.editPhase} onchange={event => { const phase = event.currentTarget.value as 'pre' | 'post'; void perform('phase', false, captured => actions.editPhase!(captured, phase)); }}><option value="pre">Preparation · before Generate Reply</option><option value="post">Response · after Generate Reply</option></select></label>{#if errors.phase}<div class="pc-detail-error"><DiagnosticMessage issue={errors.phase} context={{ nodeTitle: view?.title }} /></div>{/if}{/if}
    {#if view.recall}<RecallDetails view={view.recall} actions={{queue:()=>actions.queueRecall?.(selection(view!))??{ok:false,error:{code:'RECALL_UNAVAILABLE',message:'Memory recall is unavailable.'}},cancel:()=>actions.cancelRecall?.(selection(view!))??{ok:false,error:{code:'RECALL_UNAVAILABLE',message:'Memory recall is unavailable.'}},revealShortcut:actions.revealRecallShortcut}} />{/if}
    {#if view.readOnly || !view.enabled}<p class="pc-detail-state">{#if view.readOnly}<span>Read-only body</span>{/if}{#if !view.enabled}<span class="pc-detail-blocked">{view.system ? 'System skipped' : 'Blocks run · Disabled'}</span>{/if}</p>{/if}
    {#if view.system}<label><input type="checkbox" aria-label="Run this system" checked={view.enabled} disabled={view.readOnly || !actions.editField} onchange={event => { const enabled = event.currentTarget.checked; void perform('enabled', false, captured => actions.editField!(captured, 'enabled', enabled)); }} /> Run this system</label><small>When off, the whole system and its outputs are skipped. Optional Guidance sections can omit it.</small>{#if errors.enabled}<div class="pc-detail-error"><DiagnosticMessage issue={errors.enabled} context={{ nodeTitle: view?.title }} /></div>{/if}{/if}
    {#if errors.alias}<div class="pc-detail-error"><DiagnosticMessage issue={errors.alias} context={{ nodeTitle: view?.title }} /></div>{/if}
    {#if view.boundary}
        <fieldset class="pc-detail-group" data-boundary-controls><legend>Subgraph {view.boundary.direction}</legend>
            <label>Type<select aria-label="Subgraph port type" value={boundaryValues().artifactKind} disabled={view.readOnly || !actions.editInterface} onchange={event => draftBoundary('artifactKind', event.currentTarget.value)}>{#each view.boundary.kinds as kind (kind)}<option value={kind}>{kind}</option>{/each}</select></label>
            <label class="pc-detail-check"><input aria-label="Required subgraph port" type="checkbox" checked={boundaryValues().required} disabled={view.readOnly || !actions.editInterface} onchange={event => draftBoundary('required', event.currentTarget.checked)} /> Required</label>
            <div class="pc-detail-actions"><button type="button" data-save-boundary disabled={view.readOnly || !actions.editInterface || !boundaryValues().label.trim() || !!drafts.boundary?.pending} onclick={() => editBoundary()}>{drafts.boundary?.pending ? 'Validating…' : 'Save port'}</button></div>
            <small>Labels appear on the subgraph block. Disconnect incompatible connections before changing the type. Deleting this node removes its port and attached connections.</small>
            {#if drafts.boundary?.error || errors.boundary}<div class="pc-detail-error"><DiagnosticMessage issue={drafts.boundary?.error || errors.boundary} context={{ nodeTitle: view?.title }} /></div>{/if}
        </fieldset>
    {/if}
    {#if !view.boundary}
        {#if view.workflowData}<WorkflowData model={view.workflowData} selection={selection(view)} {actions} disabled={view.readOnly} idPrefix={idPrefix + '-workflow-data'} />{/if}
        <fieldset class="pc-detail-group pc-detail-main" data-operation-controls>
            {#if view.fileInput}
                <div data-file-input-controls>
                    <label>{view.fileInput.loaded ? 'Replace file' : 'Choose file'}<input type="file" aria-label={view.fileInput.loaded ? 'Replace file' : 'Choose file'} accept=".txt,.md,.json,text/plain,text/markdown,application/json" disabled={view.readOnly || !actions.loadFile || !!drafts.fileInput?.pending} aria-invalid={!!errors.fileInput} aria-describedby={errors.fileInput ? idPrefix + '-error-fileInput' : undefined} onchange={event => chooseFile(event.currentTarget)} /></label>
                    <p>{view.fileInput.loaded ? 'Loaded file: ' + view.fileInput.fileName : 'No file loaded.'}</p>
                    <small>The file's UTF-8 text is embedded in this workflow. Runs use the saved snapshot; replace the file to refresh it.</small>
                    <small>Choose a .txt, .md or .json file up to 400,000 bytes and 100,000 UTF-16 code units.</small>
                    {#if drafts.fileInput?.pending}<p role="status">Loading file…</p>{/if}
                    {#if errors.fileInput}<div id={idPrefix + '-error-fileInput'} class="pc-detail-error"><DiagnosticMessage issue={errors.fileInput} context={{ nodeTitle: view?.title }} /></div>{/if}
                </div>
            {/if}
            {#each controlGroups.filter(([group]) => group === 'Main') as [group, controls] (group)}
                {#each controls as control (control.key)}{@render controlEditor(control)}{/each}
            {/each}
        </fieldset>
        {#each controlGroups.filter(([group]) => group !== 'Main') as [group, controls] (group)}
            <details class="pc-detail-group" data-control-group={group} open={groupHasError(controls)}><summary onclick={() => { mountedGroups[group] = true; }}>{group}</summary>
                {#if mountedGroups[group] || groupHasError(controls)}{#each controls as control (control.key)}{@render controlEditor(control)}{/each}{/if}
            </details>
        {/each}
    {/if}
    {#if view.helperBindings}
        <details class="pc-detail-group" data-helper-model-controls open><summary>Helper model bindings</summary>
            <small>Choose connections for inherited text model roles in the pinned helper. Explicit helper-node bindings take precedence. These selections belong to this For Each node.</small>
            {#each view.helperBindings.roles as row (row.role)}
                <fieldset><legend>{row.label}</legend>
                    <label>Connection profile<select aria-label={row.role+' connection profile'} value={row.profile.value??''} disabled={!canEditHelperField(row.role,'profileId')} onchange={event=>editHelperBinding(row.role,'profileId',event.currentTarget.value?'override':'inherit',event.currentTarget.value||null)}>
                        <option value="">Use helper connection</option>
                        {#if row.profile.value && !(row.profile.options??[]).some(option=>option.value===row.profile.value)}<option value={row.profile.value}>Unavailable connection · {row.profile.value}</option>{/if}
                        {#each row.profile.options??[] as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
                    </select></label>
                    <label>Model mode<select aria-label={row.role+' model mode'} value={helperModelMode(row.role)} disabled={!canEditHelperField(row.role,'model')} onchange={event=>chooseHelperModelMode(row.role,event.currentTarget.value as DetailBindingMode)}>{#each row.model.allowedModes as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select></label>
                    {#if helperModelMode(row.role)==='override'}<label>Model identifier<input aria-label={row.role+' model identifier'} value={drafts[helperBindingKey(row.role,'model')]?.text??row.model.value??''} disabled={!canEditHelperField(row.role,'model')} oninput={event=>draftHelperModel(row.role,event.currentTarget.value)} onchange={event=>saveHelperModel(row.role,event.currentTarget.value)} /></label>{/if}
                    <small>Effective connection: {row.effective}</small><small>{row.source}</small>{#if row.caveat}<small>{row.caveat}</small>{/if}
                    {#if errors[helperBindingKey(row.role,'profileId')] || errors[helperBindingKey(row.role,'model')]}<div class="pc-detail-error"><DiagnosticMessage issue={errors[helperBindingKey(row.role,'profileId')] || errors[helperBindingKey(row.role,'model')]} context={{ nodeTitle: view?.title }} /></div>{/if}
                </fieldset>
            {/each}
            {#if view.helperBindings.issueDiagnostic || view.helperBindings.issue}<div class="pc-detail-error"><DiagnosticMessage diagnostic={view.helperBindings.issueDiagnostic} issue={view.helperBindings.issue} context={{ nodeTitle: view?.title }} /></div>{:else if !view.helperBindings.roles.length}<small>This helper has no text model calls to configure.</small>{/if}
        </details>
    {/if}
    {#if view.model}
        {#if view.model.issueDiagnostic || view.model.issue}<div class="pc-detail-error"><DiagnosticMessage diagnostic={view.model.issueDiagnostic} issue={view.model.issue} context={{ nodeTitle: view?.title }} /></div>{/if}
        <details class="pc-detail-group" data-model-controls><summary>Advanced model settings</summary>
            <button type="button" data-reset-profile disabled={!canEditBinding() || view.model.profile.mode === 'inherit' || !view.model.profile.allowedModes.some(option => option.value === 'inherit')} onclick={() => editBinding('profileId', 'inherit', null)}>{view.readOnly ? 'Use definition connection' : 'Use inherited connection'}</button>
            <small>Choose a connection with the bar under this node. Reset removes this node's connection override.</small>
            <label>Model mode<select aria-label="Model mode" value={bindingMode('model')} disabled={!canEditBinding()} onchange={event => chooseBindingMode('model', event.currentTarget.value)}>{#each view.model.model.allowedModes as option (option.value)}<option value={option.value}>{option.value === 'inherit' && !view.readOnly ? usesProfileModel() || !view.model.model.effectiveValue ? 'Use profile model' : 'Existing role model' : option.label}</option>{/each}</select></label>
            {#if bindingMode('model') === 'override'}<label>Model identifier<input aria-label="Model identifier" value={bindingText('model')} disabled={!canEditBinding()} oninput={event => draftBinding('model', event.currentTarget.value)} onchange={event => saveBinding('model', event.currentTarget.value)} /></label>{/if}
            <label>Model role<input aria-label="Model role" value={view.model.role} disabled={view.readOnly || !view.model.roleEditable || !actions.editField} onchange={event => { const value = event.currentTarget.value; if (view?.model?.roleEditable && actions.editField) void perform('modelRole', false, captured => actions.editField!(captured, 'modelRole', value)); }} /></label>
            {#if !view.model.issue || view.model.effective.trim() !== view.model.issue.trim()}<small>Effective connection: {view.model.effective}</small>{/if}{#if view.model.source}<small>{view.model.source}</small>{/if}
            {#if errors.modelRole || errors.profileId || drafts.model?.error || errors.model}<div class="pc-detail-error"><DiagnosticMessage issue={errors.modelRole || errors.profileId || drafts.model?.error || errors.model} context={{ nodeTitle: view?.title }} /></div>{/if}
        </details>
    {/if}
    {#if view.ports.length}<details class="pc-detail-group"><summary>Inputs and outputs</summary>{#each view.ports as port (port.direction + ':' + port.id)}<p class="pc-detail-port">{port.direction === 'input' ? 'In' : 'Out'} · {port.label}<small>{port.kind}</small></p>{/each}</details>{/if}
    {#if view.status}<p role="status">{view.status}</p>{/if}
    {#each presentDiagnostics((view.issues ?? []).filter(issue => issue !== view?.model?.issue && issue !== view?.helperBindings?.issue), {nodeTitle: view.title}) as diagnostic (diagnostic.id)}<div class="pc-detail-error"><DiagnosticMessage {diagnostic} /></div>{/each}
    {#if view.modifiers}
        <ModifierStack items={view.modifiers.items} options={view.modifiers.options} disabled={!canEditModifiers()} busy={modifierBusy} drafts={modifierDrafts()} error={errors.modifiers || ''} {idPrefix} onquick={quickModifier} onadd={addModifier} onenable={enableModifier} onremove={removeModifier} onmove={moveModifier} ondraft={draftModifier} onsave={saveModifier} />
    {/if}
{:else}
    <p class="pc-detail-empty">Select a node to inspect its settings.</p>
{/if}
</section>

{#snippet controlEditor(control: DetailControl)}
    <DetailControlEditor {control} format={formatFor(control)} onformat={format=>formatDraft(control,format)} text={drafts[control.key]?.text ?? textFor(control)} error={drafts[control.key]?.error || errors[control.key] || ''} disabled={!!view?.readOnly || !actions.editControl} pending={!!drafts[control.key]?.pending} idPrefix={idPrefix + '-' + control.key} draftValue={drafts[control.key]?.typedValue} schemaIdentity={view ? selectionIdentity(view)+':'+draftContract(view,control.key) : ''} schemaDraft={schemaStates[control.key]} onSchemaDraft={state=>schemaDraft(control,state)} onDraft={value => draftValue(control, value)} ontext={text => draft(control, text)} onvalue={value => editControl(control, value)} onnumber={input => editNumber(control, input)} onsave={() => save(control)} />
{/snippet}

<style>
    .pc-node-guide-help { flex: none; align-self: center; width: 26px; height: 26px; border: 1px solid var(--pc-border); border-radius: 50%; background: transparent; color: var(--pc-muted); font: inherit; font-weight: 600; cursor: pointer; }
    .pc-node-guide-help:hover { color: var(--pc-text); background: var(--pc-hover); }
    .pc-node-guide-help:focus-visible { outline: 2px solid var(--pc-flow); outline-offset: 2px; }
    .pc-node-details { --pc-r-sm: 4px; box-sizing: border-box; flex: 1; display: flex; flex-direction: column; min-width: 0; width: 100%; color: var(--pc-text); font: inherit; font-size: 12px; padding: 10px; }
    .pc-node-details :global(.pc-modifiers) { margin-top: auto; padding-top: 12px; }
    header { display: flex; gap: 7px; align-items: start; padding: 7px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-field); }
    header svg { width: 21px; height: 21px; margin-top: 5px; flex: none; fill: none; stroke: var(--pc-detail-family); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    .pc-detail-identity { min-width: 0; flex: 1; } .pc-detail-identity .pc-detail-name { font-weight: 600; font-size: 14px; margin: 0 0 2px !important; border-color: transparent !important; background: transparent !important; padding: 3px !important; }
    .pc-detail-name:hover:not(:disabled), .pc-detail-name:focus { border-color: var(--pc-border) !important; background: var(--pc-field) !important; }
    small { display: block; color: var(--pc-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .pc-detail-state { display: flex; flex-wrap: wrap; gap: 3px 8px; margin: 8px 0; color: var(--pc-muted); font-size: 10px; } .pc-detail-blocked { color: var(--pc-warn); }
    .pc-detail-group { min-width: 0; margin: 10px 0 0; padding: 9px 0 0; border: 0; border-top-width: 1px; border-top-style: solid; border-top-color: var(--pc-border); border-radius: 0; background: transparent; box-shadow: none; }
    .pc-detail-main { margin-top: 0; border-top-color: transparent; padding-top: 2px; }
    legend { padding: 0 5px; color: var(--pc-muted); font-size: 11px; } label { display: block; margin: 8px 0; color: var(--pc-text); font-size: 11px; }
    input:not([type='checkbox']), select { display: block; width: 100%; min-width: 0; box-sizing: border-box; margin-top: 4px; min-height: 28px; padding: 5px 7px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-field); color: var(--pc-text); font: inherit; }
    input[type='checkbox'] { accent-color: var(--pc-accent); }
    .pc-detail-check { display: flex; align-items: center; gap: 6px; } button { min-height: 27px; padding: 4px 8px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-control); color: var(--pc-text); font: inherit; font-size: 11px; cursor: pointer; }
    button:hover:not(:disabled) { background: color-mix(in srgb, var(--pc-text) 10%, var(--pc-control)); } :is(button, input, select):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
    :disabled { opacity: .55; cursor: default; } .pc-detail-error { color: var(--pc-error); font-size: 11px; overflow-wrap: anywhere; }
    .pc-detail-port { display: flex; justify-content: space-between; gap: 8px; margin: 8px 0; font-size: 11px; } summary { cursor: pointer; font-size: 11px; color: var(--pc-muted); overflow-wrap: anywhere; }
    .pc-detail-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; } .pc-detail-empty { color: var(--pc-muted); }
</style>
