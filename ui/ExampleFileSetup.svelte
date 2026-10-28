<script lang="ts">
 let {view,actions}:{view:{choices:{sampleActorId:string;label:string}[];actors:{id:string;label:string}[];values:Record<string,string>;error:string},actions:{close():void;apply(values:Record<string,string>):unknown}}=$props();
 let values=$state<Record<string,string>>({});
 $effect(()=>{values={...view.values};});
</script>
<div class="pc-example-file-setup" role="dialog" aria-modal="true" aria-label="Example characters" tabindex="-1">
 <h2>Choose this example’s characters</h2><p>Match the example’s familiar names to characters loaded in SillyTavern. Each chat keeps its own saved state.</p>
 {#each view.choices as choice(choice.sampleActorId)}<label>{choice.label}<select aria-label={choice.label} value={values[choice.sampleActorId]??''} onchange={event=>values={...values,[choice.sampleActorId]:event.currentTarget.value}}><option value="">Choose a character…</option>{#each view.actors as actor(actor.id)}<option value={actor.id}>{actor.label}</option>{/each}</select></label>{/each}
 {#if view.error}<p role="alert">{view.error}</p>{/if}
 <button type="button" onclick={()=>actions.apply(values)}>Prepare example</button><button type="button" onclick={actions.close}>Later</button>
</div>
<style>.pc-example-file-setup{position:absolute;inset:70px max(18px,25%);z-index:65;background:var(--pc-panel,#202128);border:1px solid var(--pc-line,#555);border-radius:12px;padding:24px;overflow:auto;box-shadow:0 12px 48px #0008}.pc-example-file-setup label{display:flex;flex-direction:column;gap:5px;margin:16px 0}.pc-example-file-setup button{margin:8px 8px 0 0}.pc-example-file-setup p{line-height:1.5}</style>
