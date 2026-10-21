<script lang="ts">
 import type {NativeSourceSetupView} from '../src/ui/native-source-setup';
 import type {DetailSelection,NodeDetailsActions} from './detail-types';
 import DiagnosticMessage from './DiagnosticMessage.svelte';
 let {model,selection,actions,disabled=false}:{model:NativeSourceSetupView;selection:DetailSelection;actions:NodeDetailsActions;disabled?:boolean}=$props();
 let pending=$state(false),issue=$state('');
 async function execute(action:'setup'|'verify'|'reconcile'){
  if(pending||!actions.sourceSetup)return;pending=true;issue='';try{const result=await actions.sourceSetup(selection,model.key,action);if(result?.ok===false)issue=result.error.message;}finally{pending=false;}
 }
</script>
<fieldset class="pc-detail-group" data-native-source-setup><legend>Verified chat sources</legend>
 <p role="status">{model.status==='acknowledged'?'Ready':model.status==='setup-required'?'Setup Required':model.status==='pending'?'Save verification pending':model.status==='unverified'?'Saved sources need verification':'Unavailable'} · {model.activeSources} source messages</p>
 <p>Setup saves source identities in this chat and verifies the persisted result. It makes no model request and leaves story text and raw history intact.</p>
 <div class="pc-detail-actions">
 {#if model.status==='setup-required'}<button type="button" disabled={disabled||pending||model.busy||!model.key||!actions.sourceSetup} onclick={()=>execute('setup')}>Set up chat sources</button>
 {:else if model.status!=='unavailable'}<button type="button" disabled={disabled||pending||model.busy||!actions.sourceSetup} onclick={()=>execute('verify')}>Verify saved sources</button><button type="button" disabled={disabled||pending||model.busy||!actions.sourceSetup} onclick={()=>execute('reconcile')}>Reconcile sources</button>{/if}
 <button type="button" disabled={pending||model.busy||!actions.refreshSourceSetup} onclick={()=>actions.refreshSourceSetup?.(selection)}>Refresh source status</button>
 </div>
 {#if pending||model.busy}<p role="status">Checking chat sources…</p>{/if}
 {#if model.notice}<p role="status">{model.notice}</p>{/if}
 {#if issue||model.issue}<DiagnosticMessage issue={issue||model.issue} />{/if}
</fieldset>
