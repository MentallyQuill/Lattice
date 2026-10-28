<script lang="ts">
 let {view,actions}:{view:{name:string;versions:{versionId:string;createdAt:number;bytes:number}[];busy:boolean;error:string;confirming:string|null},actions:{close():void;select(id:string):void;cancel():void;restore():unknown}}=$props();
</script>
<div class="pc-file-recovery" role="dialog" aria-modal="true" aria-label="Recover saved file" tabindex="-1">
 <header><h2>Recover {view.name}</h2><button type="button" disabled={view.busy} onclick={actions.close}>Close</button></header>
 <p>Restore an earlier content version. Existing replay history and privacy stay with this file.</p>
 {#if view.error}<p role="alert">{view.error}</p>{/if}
 {#if view.confirming}<p>Replace the current file with this earlier version? A newer change to the file will stop this recovery.</p><button type="button" disabled={view.busy} onclick={()=>actions.restore()}>Restore this version</button><button type="button" disabled={view.busy} onclick={actions.cancel}>Cancel restoration</button>
 {:else if !view.versions.length}<p>No previous content versions have been saved yet.</p>
 {:else}<ul>{#each view.versions as version(version.versionId)}<li><button type="button" disabled={view.busy} onclick={()=>actions.select(version.versionId)}>{new Date(version.createdAt).toLocaleString()} · {version.bytes.toLocaleString()} bytes</button></li>{/each}</ul>{/if}
</div>
<style>.pc-file-recovery{position:absolute;inset:70px max(18px,20%);z-index:60;background:var(--pc-panel,#202128);border:1px solid var(--pc-line,#555);border-radius:12px;padding:24px;overflow:auto;box-shadow:0 12px 48px #0008}.pc-file-recovery header{display:flex;align-items:center;justify-content:space-between}.pc-file-recovery button{margin:5px;padding:8px}.pc-file-recovery ul{padding:0;list-style:none}.pc-file-recovery p{line-height:1.5}</style>
