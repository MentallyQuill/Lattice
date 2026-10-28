<script lang="ts">
 import {onDestroy,untrack} from 'svelte';
 import type {ServerFileAccess,ServerFileDirectory} from '../src/ui/server-file-access';
 let {access,mode='open',name='',onselect,oncancel}: {access:ServerFileAccess;mode?:'open'|'save';name?:string;onselect:(path:string)=>void;oncancel:()=>void}=$props();
 let roots=$state<{name:string;path:string}[]>([]),listing=$state<ServerFileDirectory|null>(null),filename=$state(untrack(()=>name)),manualPath=$state(''),error=$state(''),busy=$state(false);
 let sequence=0,alive=true;
 onDestroy(()=>{alive=false;sequence++;});
 async function browse(path:string){const ticket=++sequence;busy=true;error='';const result=await access.browse({path});if(!alive||ticket!==sequence)return;busy=false;if(result.ok){listing=result.data;manualPath=result.data.path;}else{listing=null;error=result.error.message;}}
 $effect(()=>{const selected=access;let current=true;void(async()=>{const result=await selected.roots();if(!current||!alive)return;if(result.ok){roots=result.data.roots;if(roots.length)await browse(roots[0].path);}else error=result.error.message;})();return()=>{current=false;sequence++;};});
 function cancel(){sequence++;alive=false;oncancel();}
 function select(path:string){if(busy)return;sequence++;alive=false;onselect(path);}
 function save(){if(!listing||!filename.trim()||/[\\/\0]/.test(filename)||['.','..'].includes(filename.trim()))return;const separator=listing.path.includes('\\')?'\\':'/';select(listing.path.replace(/[\\/]$/,'')+separator+filename.trim());}
</script>

<section class="server-chooser" aria-label="Choose file on the SillyTavern server" data-server-file-chooser>
 <h2>{mode==='open'?'Choose file':'Choose save location'}</h2>
 <p>These files are on the computer running SillyTavern. Choosing a path does not change the file.</p>
 <nav aria-label="Server folders">
  {#each roots as root}<button type="button" disabled={busy} onclick={()=>browse(root.path)}>{root.name}</button>{/each}
 </nav>
 <form onsubmit={event=>{event.preventDefault();void browse(manualPath);}}>
  <label>Server folder <input aria-label="Server folder" bind:value={manualPath} /></label><button type="submit" disabled={busy||!manualPath.trim()}>Go</button>
 </form>
 {#if busy}<p role="status">Opening folder…</p>{/if}
 {#if error}<p role="alert">{error}</p>{/if}
 {#if listing}
  <p class="path">{listing.path}</p>
  {#if listing.parent}<button type="button" disabled={busy} onclick={()=>browse(listing!.parent!)}>Parent folder</button>{/if}
  <ul aria-label="Files and folders">
   {#each listing.entries as entry}
    <li><button type="button" disabled={busy} data-server-entry={entry.kind} onclick={()=>entry.kind==='directory'?browse(entry.path):select(entry.path)}>{entry.kind==='directory'?'Folder: ':'File: '}{entry.name}</button></li>
   {/each}
  </ul>
  {#if !listing.entries.length}<p>This folder has no selectable files or folders.</p>{/if}
  {#if listing.truncated}<p>Only part of this folder is shown. Enter a more specific folder path to find other files.</p>{/if}
  {#if mode==='save'}
   <form onsubmit={event=>{event.preventDefault();save();}}><label>Filename <input aria-label="Filename" bind:value={filename} /></label><button type="submit" disabled={busy||!filename.trim()||/[\\/\0]/.test(filename)||['.','..'].includes(filename.trim())}>Use this location</button></form>
  {/if}
 {/if}
 <button type="button" onclick={cancel}>Cancel</button>
</section>

<style>
 .server-chooser{color:inherit;background:var(--pc-panel-bg,Canvas);border:1px solid var(--pc-border,#8886);border-radius:.65rem;padding:1rem;max-width:42rem;max-height:85dvh;overflow:auto;overflow-wrap:anywhere}h2{margin:.1rem 0 .7rem}nav,form{display:flex;flex-wrap:wrap;gap:.5rem;align-items:end;margin:.75rem 0}label{display:flex;flex:1;flex-direction:column;gap:.25rem;min-width:10rem}input{font:inherit;color:inherit;background:var(--pc-input-bg,#8881);border:1px solid var(--pc-border,#8888);border-radius:.3rem;padding:.55rem;min-width:0}button{font:inherit;color:inherit;background:var(--pc-button-bg,#8881);border:1px solid var(--pc-border,#8888);border-radius:.3rem;padding:.5rem .7rem;cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid var(--pc-accent,#729eff);outline-offset:2px}button:disabled{opacity:.6;cursor:wait}ul{list-style:none;padding:0;max-height:18rem;overflow:auto}li button{width:100%;text-align:left;margin:.15rem 0;overflow-wrap:anywhere}.path{font-size:.9rem}
</style>
