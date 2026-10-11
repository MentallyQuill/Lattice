<script lang="ts">
    import DiagnosticMessage from './DiagnosticMessage.svelte';
 import type {RecallProjection,RecallActions} from './recall-types';
 let {view,actions}:{view:RecallProjection|null;actions?:RecallActions}=$props();
 let pending=$state(''),issue=$state('');
 const uid=$props.id();
 async function change(memorySetId:string,nodeIds:string[],action:'queue'|'cancel'){if(pending)return;pending=memorySetId;issue='';try{const result=await actions?.change(nodeIds,action,'all');if(result?.ok!==true)issue=(result?.error ? result.error.code + ': ' + result.error.message : undefined)??'Memory recall is unavailable.';}catch{issue='Memory recall could not be updated.';}finally{pending='';}}
</script>
<p>Queue a memory set for the next reply, generated swipe, or both. Matching nodes share one request.</p>
{#if view?.scope}<p aria-label="Recall scope">User {view.scope.userId} · Chat {view.scope.chatId} · Actor {view.scope.actorId}</p>{/if}
{#if view?.issue||issue}<div><DiagnosticMessage issue={issue||view?.issue} /></div>{/if}
{#if !view?.sets.length}<p>Add a Recall Shortcut to the open unified workflow for the active character. Configure its actor, memory set and policy in Details, then enable Lattice.</p>{/if}
{#each view?.sets??[] as set (set.memorySetId)}
 {@const queueReason=pending?'Wait for the Recall change to finish.':!actions?'Recall actions are unavailable in this workspace.':!set.queueAllowed?set.reason||'Recall is already queued.':''}
 {@const cancelReason=pending?'Wait for the Recall change to finish.':!actions?'Recall actions are unavailable in this workspace.':!set.cancelAllowed?'No recall is queued to cancel.':''}
 <fieldset data-recall-set={set.memorySetId}><legend>{set.memorySetId}</legend><p role="status">{set.statusText}</p>
 <p>{set.targetLabel} · {set.useLabel} · {set.consumeLabel}</p>
 {#if set.queued}<p>Remaining: {set.remainingText}</p>{/if}
 {#if set.pendingCount}<p>Pending generations: {set.pendingCount}</p>{/if}
 {#if set.reason && set.reason!==queueReason}<p>{set.reason}</p>{/if}
 <div class="pc-recall-overview-actions"><button type="button" data-recall-queue disabled={!!pending||!actions||!set.queueAllowed} aria-label={'Queue recall '+set.memorySetId} aria-describedby={queueReason?uid+'-queue-'+set.memorySetId:undefined} onclick={()=>change(set.memorySetId,set.nodeIds,'queue')}>Queue recall</button><button type="button" disabled={!!pending||!actions||!set.cancelAllowed} aria-label={'Cancel recall '+set.memorySetId} aria-describedby={cancelReason?uid+'-cancel-'+set.memorySetId:undefined} onclick={()=>change(set.memorySetId,set.nodeIds,'cancel')}>Cancel recall</button></div>
 {#if queueReason}<p id={uid+'-queue-'+set.memorySetId}>{queueReason}</p>{/if}{#if cancelReason}<p id={uid+'-cancel-'+set.memorySetId}>{cancelReason}</p>{/if}
 <ul aria-label="Matching nodes">{#each set.linkedNodes as node (node.nodeId)}<li><button type="button" disabled={!actions} onclick={()=>actions?.reveal(node.nodeId)}>{node.title} · {node.displayId??node.nodeId}</button></li>{/each}</ul>
 <small>{set.nodeIds.length} linked {set.nodeIds.length===1?'node':'nodes'}{set.hotkeys.length?' · '+set.hotkeys.map(key=>key.label).join(', '):''}</small>
 </fieldset>
{/each}
<p><button type="button" onclick={()=>actions?.refresh()} disabled={!!pending||!actions}>Refresh recall state</button></p>
<small>Shortcuts use physical keys and pause while typing. Automatic Recall uses its own conditions. Queue and Cancel do not generate a reply.</small>
<style>fieldset{margin:1rem 0;padding:.75rem;min-width:0}legend{overflow-wrap:anywhere}p,small{line-height:1.5}small{display:block;opacity:.85}.pc-recall-overview-actions{display:flex;gap:6px;flex-wrap:wrap}</style>
