<script lang="ts">
 import {parseControlInput,formatControlInput} from '../src/ui/control-input-contracts.js';
 import type {ControlInputFormat} from '../src/ui/control-input-contracts';
 import type {DetailControl} from './detail-types';
 import type {JsonValue} from '../src/workflow/operations/json-data';
 let {control,text,format='auto',draftValue,disabled=false,idPrefix,error='',ontext,onformat}:{control:DetailControl;text:string;format?:ControlInputFormat;draftValue?:unknown;disabled?:boolean;idPrefix:string;error?:string;ontext:(text:string)=>void;onformat?:(format:ControlInputFormat)=>void}=$props();
 let feedback=$state('');
 const parsed=$derived(control.inputSpec?parseControlInput(control.inputSpec,draftValue === undefined?{format,text,currentValue:control.value as JsonValue}:{format:'rows',value:draftValue as JsonValue,currentValue:control.value as JsonValue}):null);
 const shown=$derived(draftValue === undefined?text:JSON.stringify(draftValue,null,2));
 function chooseFormat(next:ControlInputFormat,input:HTMLSelectElement){
  if(disabled)return;
  if(parsed?.ok){if(!exportText(next))input.value=format;}
  else {feedback='';onformat?.(next);}
 }
 function exportText(next:ControlInputFormat){
  if(disabled||!parsed?.ok||!control.inputSpec)return false;
  const result=formatControlInput(control.inputSpec,parsed.data.value,next);
  if(!result.ok){feedback=result.error.message;return false;}
  feedback='';onformat?.(next);ontext(result.data);return true;
 }
</script>
<label for={idPrefix+'-editor'}>{control.label}</label>
<select aria-label={control.label+' input format'} value={format} {disabled} onchange={event=>chooseFormat(event.currentTarget.value as ControlInputFormat,event.currentTarget)}><option value="auto">{control.inputSpec?.id==='collection.thresholds'?'Numbers / CSV':control.inputSpec?.id==='pattern.rules:regex'?'Expressions (one per line)':'Terms / CSV'}</option><option value="plain">Plain text</option><option value="csv">CSV</option><option value="json">Advanced JSON</option></select>
<textarea id={idPrefix+'-editor'} aria-label={control.label} value={shown} {disabled} aria-invalid={!!error||parsed?.ok===false} aria-describedby={error?idPrefix+'-error':undefined} oninput={event=>{if(!disabled){feedback='';onformat?.(format);ontext(event.currentTarget.value);}}}></textarea>
<small>{control.inputSpec?.id==='pattern.rules:regex'?'One expression per line. Commas, brackets and backslashes stay in the expression.':'Separate terms with commas or newlines. Quote phrases containing commas.'}</small>
{#if parsed?.ok}<div data-control-items>{parsed.data.displayItems?.length??0} entries{#each parsed.data.displayItems??[] as item,index}<span data-control-item={index}>{item}</span>{/each}</div>{#each parsed.data.warnings as warning}<small>{warning}</small>{/each}{:else if parsed}<small role="status">{parsed.error.message}</small>{/if}
<div class="exports"><button type="button" aria-label={'Export '+control.label+' as Plain text'} disabled={disabled||!parsed?.ok} onclick={()=>exportText('plain')}>Plain text</button><button type="button" aria-label={'Export '+control.label+' as Advanced JSON'} disabled={disabled||!parsed?.ok} onclick={()=>exportText('json')}>Advanced JSON</button><button type="button" aria-label={'Export '+control.label+' as CSV'} disabled={disabled||!parsed?.ok} onclick={()=>exportText('csv')}>Export CSV</button></div>
{#if feedback}<small role="status">{feedback}</small>{/if}
<style>
 label,small{display:block;font-size:12px;margin:5px 0;color:var(--pc-muted);}select,textarea{box-sizing:border-box;width:100%;margin:4px 0;padding:6px;background:var(--pc-field);border:1px solid var(--pc-border);color:var(--pc-text);font:inherit;}textarea{min-height:88px;resize:vertical;}[data-control-items]{font-size:12px;overflow-wrap:anywhere;}span{display:inline-block;margin:3px;padding:3px 6px;background:var(--pc-control);border-radius:3px;white-space:pre-wrap;}.exports{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;}button{padding:4px 6px;border:1px solid var(--pc-border);background:var(--pc-control);color:var(--pc-text);font:inherit;} :disabled{opacity:.55;} :is(select,textarea,button):focus-visible{outline:2px solid var(--pc-accent);outline-offset:1px;}
</style>
