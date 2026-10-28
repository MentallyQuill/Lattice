<script lang="ts">
 import {untrack} from 'svelte';
 import type {FileStorageSetup} from '../src/ui/file-storage-setup';
 let {setup,onclose}: {setup:FileStorageSetup;onclose?:()=>void}=$props();
 let view=$state(untrack(()=>setup.view()));
 $effect(()=>{view=setup.view();return setup.subscribe(()=>{view=setup.view();});});
 async function close(){await setup.cancel();onclose?.();}
 async function inside(){await setup.choose('inside');onclose?.();}
 const statusLabel=$derived({checking:'Checking file access…',ready:'File access is ready',missing:'File support needs setup',incompatible:'File support needs an update',denied:'Your account needs access',unreachable:'The server could not be reached'}[view.status]);
</script>

{#if view.open}
 <section class="storage-setup" aria-label="File storage setup" data-file-storage-setup>
  <h2>File storage</h2>
  <p class="status" role="status" aria-live="polite">{statusLabel}</p>
  {#if view.hostId}<p class="host">SillyTavern host: {view.hostId}</p>{/if}
  {#if view.step==='choice'}
   <p>Save your work automatically, and choose wider file access whenever you need it.</p>
   <div class="choices">
    <button type="button" data-storage-choice="inside" onclick={inside}>Save only inside SillyTavern</button>
    <button type="button" data-storage-choice="anywhere" onclick={()=>setup.choose('anywhere')}>{view.local?'Save anywhere on this computer':'Choose locations on the SillyTavern server'}</button>
   </div>
   {#if !view.local}<p>File paths belong to the computer running SillyTavern. This does not give access to files on the device showing your browser.</p>{/if}
  {:else if view.step==='complete' && view.status==='ready'}
   <p>You can choose file locations on the SillyTavern {view.local?'computer':'server'}. Your account and the server’s file permissions still apply.</p>
   <button type="button" onclick={close}>Done</button>
  {:else if view.status==='denied'}
   <p>Ask the SillyTavern host owner to grant your account file access. You do not need to share administrator credentials here.</p>
   <button type="button" onclick={()=>setup.check()}>Check again</button>
  {:else if view.status==='unreachable'}
   <p>Check your SillyTavern connection, then retry. Setup progress is kept.</p>
   <button type="button" onclick={()=>setup.check()}>Retry connection</button>
  {:else}
   {#if view.step==='download'}
    <h3>1. Download included file support</h3>
    <p>Lattice includes a small component that lets SillyTavern use custom file locations.</p>
    {#if !view.local}<p>The host owner must run setup on the server. A browser cannot open a folder picker on a remote server. Download the bundle and give it to that owner.</p>{/if}
    <button type="button" onclick={()=>setup.download()}>Download setup</button>
   {:else if view.step==='install'}
    <h3>2. Open setup on the SillyTavern computer</h3>
    <p>Extract the entire download. Open the Windows, macOS or Linux launcher. It needs the Node.js runtime used by SillyTavern.</p>
    <p>Choose the folder containing SillyTavern’s server.js file. Setup asks before enabling server plugins and keeps a backup of the configuration.</p>
    <p>For a headless or shared server, the owner can use the command in the bundle’s README. Keep saving inside SillyTavern while they finish.</p>
   {:else if view.step==='restart'}
    <h3>3. Restart SillyTavern</h3>
    <p>After setup reports success, restart SillyTavern using its usual controls. Return here afterward; your progress is saved.</p>
   {:else}
    <h3>4. Check access</h3>
    <p>Verify that this SillyTavern account can use the installed file support.</p>
   {/if}
   <div class="navigation">
    <button type="button" onclick={()=>setup.back()}>Back</button>
    {#if view.step!=='verify'}<button type="button" onclick={()=>setup.next()}>Continue</button>{/if}
    <button type="button" disabled={view.status==='checking'} onclick={()=>setup.check()}>Check again</button>
   </div>
  {/if}
  {#if view.error}<p role="status">{view.error}</p>{/if}
  {#if view.preferenceError}<p role="alert">Your preference could not be saved: {view.preferenceError}</p>{/if}
  <div class="footer">
   {#if view.step!=='choice'&&view.step!=='complete'}<button type="button" data-storage-choice="inside" onclick={inside}>Continue saving inside SillyTavern</button>{/if}
   <button type="button" data-cancel-storage-setup onclick={close}>Close setup</button>
  </div>
 </section>
{/if}

<style>
 .storage-setup{color:inherit;background:var(--pc-panel-bg,Canvas);border:1px solid var(--pc-border,#8886);border-radius:.65rem;padding:1rem;max-width:42rem;max-height:85dvh;overflow:auto;overflow-wrap:anywhere}
 h2{margin:.1rem 0 .7rem}h3{font-size:1.05rem}.status{font-weight:600}.host{font-size:.85rem;opacity:.8}.choices,.navigation,.footer{display:flex;flex-wrap:wrap;gap:.5rem}.choices{flex-direction:column}.footer{border-top:1px solid var(--pc-border,#8886);padding-top:.75rem;margin-top:.75rem}button{font:inherit;color:inherit;padding:.6rem .8rem;border:1px solid var(--pc-border,#8888);background:var(--pc-button-bg,#8881);border-radius:.4rem;cursor:pointer}button:focus-visible{outline:2px solid var(--pc-accent,#729eff);outline-offset:2px}button:disabled{opacity:.6;cursor:wait}
</style>
