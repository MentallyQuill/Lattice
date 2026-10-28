import { safeError, addressKey, expandRecordAddress, freeze } from '../workflow/record-data.js?v=0.29.1';
/** Metadata only. Caller checks document/revision/run freshness. Exact key: JSON.stringify([workflowId,instancePath,nodeId]). */
export function projectCurrentDiagnostics({attemptId,documentKey,plan,recording,error,runState}) {
    if(typeof attemptId!=='string'||!attemptId||typeof documentKey!=='string'||!documentKey)return null;
    const state=runState;
    if(['cancelled','cancelling','stale'].includes(state?.status)||['cancelled','stale'].includes(recording?.status))return null;
    const inventory=plan??state?.plan??(recording?.plan?{
        units:recording.units.map(unit=>({address:expandRecordAddress(recording,unit.address),included:unit.included,inputPorts:unit.ports.filter(port=>port.direction==='input').map(port=>recording.identities.strings[port.port])})),
        hierarchy:recording.hierarchy.map(entry=>({...entry,address:expandRecordAddress(recording,entry.address),inputPorts:(entry.inputPorts??[]).map(port=>recording.identities.strings[port])}))
    }:null);
    if(!inventory)return null;
    const nodes=new Map();
    const add=raw=>{const cause=safeError(raw,inventory);if(!cause?.address)return;const key=addressKey(cause.address);nodes.set(key,{key,address:cause.address,error:cause,...(cause.inputPortId?{inputPortId:cause.inputPortId}:{})});};
    for(const node of state?.nodes??[])if(node.status==='failed')add(node.error);
    add(error??state?.error??recording?.error);
    return freeze({attemptId,documentKey,nodes:[...nodes.values()]});
}
