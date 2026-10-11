import { OPERATIONS, operationFor } from '../workflow/catalog.js?v=0.27.0';
import { introspectionDefaults } from '../workflow/introspection/native.js?v=0.27.0';
import { recallControlLabel } from '../workflow/recall-labels.js?v=0.27.0';
import { resolveControlInputSpec } from './control-input-contracts.js?v=0.27.0';
/** Shared detached authoring fields; no graph, host, or execution authority. */
export function projectNodeControls(operation, controls = {}, { phase, readOnly = false }) {
 const base = OPERATIONS[operation]; if (!base) return [];
 const defaults = ['state','context','memory'].includes(operation) ? introspectionDefaults(operation, controls.mode) : base.defaults;
 const metadata = operationFor({type:'workflow', operation, ...defaults, ...controls}, {phase}) ?? operationFor({type:'workflow', operation, ...defaults}, {phase}) ?? base;
 const node = {operation, ...defaults, ...controls};
 return Object.entries(metadata.controlDescriptors).filter(([key, descriptor]) => !descriptor.hidden && visibleDetailControl(node, metadata.defaults, key) && (!descriptor.visibleWhen || node[descriptor.visibleWhen.key] === descriptor.visibleWhen.value)).map(([key, descriptor]) => {
  const value = Object.hasOwn(controls, key) ? controls[key] : metadata.defaults[key] ?? descriptor.default;
  const labeled = ['recall','hotkey-arm'].includes(operation) && descriptor.values ? {...descriptor, valueLabels:Object.fromEntries(descriptor.values.map(value=>[value,recallControlLabel(key,value)??value]))} : descriptor;
  const inputSpec=resolveControlInputSpec({operation, controls:node, key, descriptor});
  return {...detailControl(key, descriptor.label || friendlyControlLabel(key), labeled, value), ...detailPresentation(operation,key), ...(inputSpec.editor==='path'?{editor:'json',representation:'json-value'}:{}), inputSpec, readOnly};
 });
}
export function detailControl(key,label,descriptor,value) {
 const editor=descriptor.editor==='json'||descriptor.type==='json-value'||descriptor.type==='object'||descriptor.type==='array'&&descriptor.items!=='string'?'json':descriptor.type==='enum'?'enum':descriptor.type==='array'?'lines':['integer','number'].includes(descriptor.type)?'number':descriptor.type==='boolean'?'boolean':'text';
 return {key,label,value:value === undefined ? descriptor.default : value,editor,...(descriptor.help?{help:descriptor.help}:{}),...(editor==='json'?(descriptor.type==='string'?{representation:'json-text',allowEmpty:true}:{representation:'json-value'}):{}),...(descriptor.values?{options:descriptor.values.map(value=>({value,label:descriptor.valueLabels?.[value]??value}))}:{}),...(descriptor.min!==undefined?{min:descriptor.min}:{}),...(descriptor.max!==undefined?{max:descriptor.max}:{}),...(editor==='number'?{step:descriptor.step ?? (descriptor.type==='integer'?1:'any')}:{})};
}
const friendlyControlLabel = key => ({ maxTokens: 'Output tokens', budgetTokens: 'Token budget', pins: 'Pinned wording', rules: 'Rules' }[key] ?? key.replace(/([A-Z])/g, char => ' ' + char.toLowerCase()).replace(/^./, char => char.toUpperCase()));
function visibleDetailControl(node, defaults, key) {
 const value = name => node?.[name] ?? defaults[name];
 if (node?.operation === 'compose') return key !== 'template' || value('mode') === 'template' ? key !== 'separator' || value('mode') === 'join' : false;
 if (node?.operation === 'text-rules') return key !== 'separator' || value('mode') === 'extract' ? !['scope','protectedLiterals'].includes(key) || value('inputKind') === 'draft' : false;
 if (node?.operation === 'smart-compactor' && key === 'maxTokens') return value('method') === 'compress';
 return true;
}
function detailPresentation(operation, key) {
 if (operation === 'read-file' && ['schema', 'columns'].includes(key)) return {group:'Validation', advanced:true};
 if (operation === 'read-file' && ['actorScope', 'actorId'].includes(key)) return {group:'Actor access', advanced:true, ...(key === 'actorId' ? {singleLine:true} : {})};
 const structured = key === 'sections' && operation === 'compose' ? 'sections'
  : key === 'fields' && operation === 'select-fields' ? 'fields'
  : key === 'rules' && operation === 'text-rules' ? 'rules'
  : key === 'inputs' && operation === 'context-join' ? 'slots'
  : key === 'updates' && operation === 'state' ? 'numeric-map'
  : key === 'durations' ? 'durations' : undefined;
 const group = ['pins','protectedLiterals','exemptions'].includes(key) ? 'Protections'
  : ['min','max','baseline','decay'].includes(key) ? 'Bounds'
  : key === 'durations' ? 'Phases'
  : ['separator','maxTokens'].includes(key) ? 'Output' : 'Main';
 return {group, ...(group !== 'Main' ? {advanced:true} : {}), ...(structured ? {structured} : {}), ...(['actorId','curveId','trackId','idempotencyKey','promptId'].includes(key) ? {singleLine:true} : {})};
}
