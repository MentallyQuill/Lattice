const fail=message=>({ok:false,error:{code:'STALE_RECALL_CONTEXT',message}});
/** Ephemeral command authority; captured selection IDs never fall back to another scope. */
export function createRecallCommands(ports){
 const captures=new WeakMap();
 return Object.freeze({
 capture(nodeIds,scope='selected'){const context=ports.readContext();if(!context||!Array.isArray(nodeIds)||!nodeIds.length||nodeIds.length>1000)return fail('Select an eligible Recall or Recall Shortcut node.');if(!['selected','all'].includes(scope)||scope==='selected'&&(context.viewKind==='library'||context.viewKind==='instance'&&!nodeIds.some(id=>context.projection.nodes[id]?.address)))return fail('Memory recall requires an active workflow instance.');const native=ports.captureRecall();if(!native?.ok)return native??fail('Memory recall is unavailable.');const capture=Object.freeze({});captures.set(capture,{context,scope,nodeIds:[...new Set(nodeIds)],native:native.data});return {ok:true,data:capture};},
 change(capture,action){
  const saved=captures.get(capture);if(!saved||!['queue','cancel'].includes(action)||!ports.isContextCurrent(saved.context))return fail('The document or selection changed. Reopen these controls and try again.');
  const context=ports.readContext();if(!context||!ports.isContextCurrent(saved.context))return fail('Memory recall is unavailable.');
  const allowed=action==='queue'?'queueAllowed':'cancelAllowed',source=snapshot=>saved.scope==='all'?snapshot.projection.allNodes??snapshot.projection.nodes:snapshot.projection.nodes;
  const capability=(snapshot,id)=>saved.scope==='all'?snapshot.projection.commands.all[action==='queue'?'queueNodeIds':'cancelNodeIds'].includes(id):snapshot.projection.nodes[id]?.[allowed];
  const intended=saved.nodeIds.filter(id=>capability(saved.context,id));if(intended.some(id=>!capability(context,id)))return fail('Recall eligibility changed. Reopen these controls and try again.');
  const eligible=intended.map(id=>saved.scope==='all'&&!context.projection.allNodes?context.projection.sets?.find(set=>set.nodeIds.includes(id))??source(context)[id]:source(context)[id]);if(!eligible.length||eligible.some(view=>!view))return fail('No eligible memory recall requests in this selection.');
  const shortcutAddresses=[...new Map(eligible.filter(view=>view.shortcutAddresses?.length).map(view=>{const address=view.shortcutAddresses[0];return [JSON.stringify([address.workflowId,address.instancePath,address.nodeId]),address];})).values()];
  const shortcutNodeIds=[...new Set(eligible.filter(view=>!view.shortcutAddresses?.length).map(view=>view.shortcutNodeIds[0]))];
  const request={action,...(shortcutAddresses.length?{shortcutAddresses,...(shortcutNodeIds.length?{shortcutNodeIds}:{})}:{shortcutNodeIds})};
  const result=ports.changeRecallQueues(saved.native,request);if(result?.ok)ports.changed(result.data);return result??fail('Memory recall is unavailable.');
 },
 openDetails(nodeId){ports.openDetails(nodeId);},
 });
}
