import { OPERATIONS, operationFor, describeAuthoredOperation } from '../workflow/catalog.js?v=0.30.0';
import { introspectionDefaults } from '../workflow/introspection/native.js?v=0.30.0';
import { recallControlLabel } from '../workflow/recall-labels.js?v=0.30.0';
import { resolveControlInputSpec, formatControlInput } from './control-input-contracts.js?v=0.30.0';
import { reasoningOptions } from '../workflow/reasoning.js?v=0.30.0';
/** Editor compatibility only; revision/activation are write tokens. */
export function detailsEditorContractKey(node) {
 return JSON.stringify([node.controls.map(control => [control.key, control.editor, control.representation, control.allowEmpty, control.structured, control.inputSpec?.id, control.inputSpec?.version]), node.model?.profile.allowedModes, node.model?.model.allowedModes, node.model?.editable, node.helperBindings && [node.helperBindings.helperKey, node.helperBindings.editable, node.helperBindings.roles.map(row => [row.role, row.model.allowedModes])], node.boundary && [node.boundary.id, node.boundary.direction, node.boundary.kinds], !!node.fileInput, node.modifiers && [node.modifiers.items.map(item => [item.id, item.type]).sort(([a], [b]) => a.localeCompare(b)), node.modifiers.options.map(option => [option.type, option.fields.map(field => [field.key, field.editor])]), node.modifiers.editable], node.readOnly]);
}
/** Shared detached authoring fields; no graph, host, or execution authority. */
export function projectNodeControls(operation, controls = {}, { phase, readOnly = false, graph }) {
 const base = OPERATIONS[operation]; if (!base) return [];
 const defaults = ['state','context','memory'].includes(operation) ? introspectionDefaults(operation, controls.mode) : base.defaults;
 const described=operation==='scene-context'&&graph?.schema===4&&graph?.runtime===3?describeAuthoredOperation(graph,{type:'workflow',operation,...defaults,...controls}):null;
 const metadata = (described?.ok?described.data.descriptor:null) ?? operationFor({type:'workflow', operation, ...defaults, ...controls}, {phase}) ?? operationFor({type:'workflow', operation, ...defaults}, {phase}) ?? base;
 const node = {operation, ...defaults, ...controls};
 return Object.entries(metadata.controlDescriptors).filter(([key, descriptor]) => !descriptor.hidden && visibleDetailControl(node, metadata.defaults, key) && (!descriptor.visibleWhen || node[descriptor.visibleWhen.key] === descriptor.visibleWhen.value)).map(([key, descriptor]) => {
  const value = Object.hasOwn(controls, key) ? controls[key] : metadata.defaults[key] ?? descriptor.default;
  const labeled = ['recall','hotkey-arm'].includes(operation) && descriptor.values ? {...descriptor, valueLabels:Object.fromEntries(descriptor.values.map(value=>[value,recallControlLabel(key,value)??value]))} : descriptor;
  const inputSpec=resolveControlInputSpec({operation, controls:node, key, descriptor});
  return {...detailControl(key, descriptor.label || friendlyControlLabel(key), labeled, value), ...detailPresentation(operation,key), ...(['path','rows','questions','schedules'].includes(inputSpec.editor)?{editor:'json',representation:'json-value'}:{}), inputSpec, readOnly};
 });
}
export function detailControl(key,label,descriptor,value) {
 const editor=descriptor.editor==='json'||descriptor.type==='json-value'||descriptor.type==='object'||descriptor.type==='array'&&descriptor.items!=='string'?'json':descriptor.type==='enum'?'enum':descriptor.type==='array'?'lines':['integer','number'].includes(descriptor.type)?'number':descriptor.type==='boolean'?'boolean':'text';
 return {key,label,value:value === undefined ? descriptor.default : value,editor,...(descriptor.help?{help:descriptor.help}:{}),...(editor==='json'?(descriptor.type==='string'?{representation:'json-text',allowEmpty:true}:{representation:'json-value'}):{}),...(descriptor.values?{options:descriptor.values.map(value=>({value,label:descriptor.valueLabels?.[value]??value}))}:{}),...(descriptor.min!==undefined?{min:descriptor.min}:{}),...(descriptor.max!==undefined?{max:descriptor.max}:{}),...(editor==='number'?{step:descriptor.step ?? (descriptor.type==='integer'?1:'any')}:{})};
}
/** Provider decoration stays separate from cached authored field contracts. */
const reasoningControlCache = new WeakMap();
export function projectReasoningControls(controls, target = {}) {
 if (!controls.some(control => control.key === 'reasoningEffort')) return controls;
 const key = JSON.stringify([target.api, target.source, target.model, target.reasoningProvider, target.endpoint, target.metadata]);
 const previous = reasoningControlCache.get(controls);
 if (previous?.key === key) return previous.controls;
 const presentation = reasoningOptions(target);
 const projected = controls.map(control => {
  if (control.key !== 'reasoningEffort') return control;
  const value = control.value ?? 'none', options = [...presentation.options];
  if (!options.some(option => option.value === value)) options.push({value:String(value),label:String(value) + ' (saved)'});
  return {...control,value,options,help:presentation.help};
 });
 reasoningControlCache.set(controls, {key,controls:projected});
 return projected;
}
const friendlyControlLabel = key => ({ maxTokens: 'Output tokens', budgetTokens: 'Token budget', pins: 'Pinned wording', rules: 'Rules' }[key] ?? key.replace(/([A-Z])/g, char => ' ' + char.toLowerCase()).replace(/^./, char => char.toUpperCase()));
function visibleDetailControl(node, defaults, key) {
 const value = name => node?.[name] ?? defaults[name];
 if (['reasoningEffort','reasoningCustom'].includes(key)) {
  const operation = operationFor(node), bound = operation?.requestBound;
  if (!operation?.nativeBoundary && !(typeof bound === 'function' ? bound(node) : bound)) return false;
 }
 if(node?.operation==='scene-context'&&defaults.selection!==undefined){if(key==='activationMode')return false;if(key==='recentMessages')return value('selection')==='recent';if(key==='keepRecentAssistantTurns')return value('selection')==='before-window';}
 if (node?.operation === 'compose') return key !== 'template' || value('mode') === 'template' ? key !== 'separator' || value('mode') === 'join' : false;
 if (node?.operation === 'text-rules') return key !== 'separator' || value('mode') === 'extract' ? !['scope','protectedLiterals'].includes(key) || value('inputKind') === 'draft' : false;
 if (node?.operation === 'smart-compactor' && key === 'maxTokens') return value('method') === 'compress';
 return true;
}
function detailPresentation(operation, key) {
 if (operation === 'read-file' && ['schema', 'columns'].includes(key)) return {group:'Validation', advanced:true};
 if (operation === 'read-file' && ['actorScope', 'actorId'].includes(key)) return {group:'Actor access', advanced:true, ...(key === 'actorId' ? {singleLine:true} : {})};
 const structured = key === 'sections' && operation === 'compose' ? 'sections'
  : key === 'fields' && ['select-fields','format'].includes(operation) ? 'fields'
  : key === 'rules' && operation === 'text-rules' ? 'rules'
  : key === 'inputs' && ['context-join','join','collect'].includes(operation) ? 'slots'
  : key === 'updates' && operation === 'state' ? 'numeric-map'
  : key === 'rules' && operation === 'pattern' ? 'patterns'
  : key === 'patterns' && operation === 'extract' ? 'extract'
  : key === 'durations' ? 'durations' : undefined;
 const primaryModel = ['enrich','extract','model-call','revise-draft'].includes(operation);
 const purpose = purposeGroups[operation];
 const specific = purpose && Object.entries(purpose).find(([,keys]) => keys.includes(key))?.[0];
 const group = ['reasoningEffort','reasoningCustom'].includes(key) ? 'Limits & retries'
  : key === 'instructions' ? 'Instructions'
  : primaryModel && ['maxTokens','maxRetries'].includes(key) ? 'Limits & retries'
  : primaryModel && ['outputKind','schema'].includes(key) ? 'Output'
  : specific ?? (['pins','protectedLiterals','exemptions'].includes(key) ? 'Protections'
  : ['min','max','baseline','decay'].includes(key) ? 'Bounds'
  : key === 'durations' ? 'Phases'
  : ['separator','maxTokens'].includes(key) ? 'Output' : 'Main');
 const groupOpen = group === 'Instructions' || primaryModel && group === 'Output';
 return {group, ...(groupOpen ? {groupOpen:true} : {}), ...(group !== 'Main' ? {advanced:true} : {}), ...(structured ? {structured} : {}), ...(operation === 'model-call' && key === 'outputKind' ? {options:[{value:'text',label:'Plain text'},{value:'data',label:'JSON data'}]} : {}), ...(['actorId','curveId','trackId','idempotencyKey','promptId','reasoningCustom'].includes(key) ? {singleLine:true} : {})};
}

// Presentation groups never change visibility, defaults, admission, or values.
const purposeGroups = {
 chunk:{Sizing:['sizeUnit','targetSize','overlap','turnsPerChunk'],Advanced:['sentenceLocale','tokenizerBinding','maxTokenizerCalls','maxChunks']},
 pattern:{Matching:['scope','caseSensitive','matchPolicy','minOccurrences','regexFlags'],Limits:['timeoutMs']},
 format:{Output:['fields','schema','columns','separator','trailingSeparator']},
 'write-file':{Content:['collectionPath','missingPath','key','fieldPolicy','fields','emptyPolicy'],Format:['schema','columns','separator','trailingSeparator'],'Actor access':['actorScope','actorId']},
 'project-document':{Content:['collectionPath','missingPath','key','fieldPolicy','fields','emptyPolicy'],Format:['schema','columns','separator','trailingSeparator']},
 'time-trigger':{Schedule:['scheduleId','scheduleRevision','clockId','calendarId','minuteOfDay','order'],Metadata:['metadata'],Limits:['limit','consumedIds']},
 collection:{Matching:['fieldPath','value','operator','missingPolicy'],Merge:['mergePolicy','identityPath'],Thresholds:['thresholds']},
 recall:{Matching:['keywords','caseSensitive','eventTypes','partnerIds','tags','recordIds'],Limits:['limit','maxCharacters','maxTokens'],Output:['title']},
};

/** Present saved list values in a grammar that round trips their literal contents. */
export function controlInputPresentation(control, format = 'auto') {
 if (control.inputSpec?.editor === 'list' && (control.inputSpec.storage !== 'json-text' || format !== 'auto')) {
  const result = formatControlInput(control.inputSpec, control.value, format);
  if (result.ok) return {text:result.data,format};
  const json = formatControlInput(control.inputSpec,control.value,'json');
  if (json.ok) return {text:json.data,format:'json'};
 }
 return {format, text:control.editor === 'json' ? control.representation === 'json-text' ? String(control.value ?? '') : JSON.stringify(control.value,null,2) : control.editor === 'lines' && Array.isArray(control.value) ? control.value.join('\n') : String(control.value ?? '')};
}
