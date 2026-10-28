<script lang="ts">
 let {view,actions}:{view:{items:{id:string;name:string}[];busy:boolean;error:string},actions:{open(id:string):unknown;close():void;refresh():unknown}}=$props();
</script>
<div class="pc-library-dialog" role="dialog" aria-modal="true" aria-label="Saved workflows" tabindex="-1">
 <header><h2>Saved workflows</h2><button type="button" onclick={()=>actions.close()} aria-label="Close saved workflows">×</button></header>
 <p>Open one shared workflow in any chat. Saved edits update it everywhere. Use Save As for an independent copy.</p>
 {#if view.error}<p role="alert">{view.error}</p>{/if}
 {#if !view.items.length}<p>No saved workflows yet. Choose Save workflow to save your current draft in SillyTavern.</p>{/if}
 <ul>{#each view.items as item(item.id)}<li><button type="button" disabled={view.busy} onclick={()=>actions.open(item.id)}>{item.name}</button></li>{/each}</ul>
 <button type="button" disabled={view.busy} onclick={()=>actions.refresh()}>Refresh saved workflows</button>
</div>
<style>
 .pc-library-dialog{position:absolute;inset:70px max(18px,20%);z-index:50;background:var(--pc-panel,#202128);border:1px solid var(--pc-line,#555);border-radius:12px;padding:24px;overflow:auto;box-shadow:0 12px 48px #0008}.pc-library-dialog header{display:flex;align-items:center;justify-content:space-between}.pc-library-dialog h2{margin:0}.pc-library-dialog p{line-height:1.5}.pc-library-dialog ul{padding:0;list-style:none}.pc-library-dialog li{margin:8px 0}.pc-library-dialog button{padding:8px 12px}
</style>
