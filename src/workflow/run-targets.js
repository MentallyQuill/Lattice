import { inspectExpandedGraph, nodeAddressKey, safeWorkflowData } from './graph-validation.js?v=0.28.0';
const fail = () => ({ok:false,error:{code:'INVALID_RUN_TARGETS',message:'Workflow outputs must name existing terminal operations by exact instance path.'}});
/** Internal checked-expansion reader; never broadens explicit empty enrollment. */
export function expandedRunTargets(root, plan) {
    if (Object.hasOwn(root, 'runTargets')) {
        if (!Array.isArray(root.runTargets) || root.runTargets.length > 1000) return fail();
        const seen = new Set(), targets = [];
        for (const target of root.runTargets) {
            if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).some(key=>!['instancePath','nodeId'].includes(key)) || !Array.isArray(target.instancePath) || target.instancePath.length>8 || !target.instancePath.every(id=>typeof id==='string'&&id.length) || typeof target.nodeId!=='string') return fail();
            const key = nodeAddressKey({workflowId:plan.workflowId,...target});
            if (!plan.primitives.some(unit=>unit.terminal && nodeAddressKey(unit.address)===key)) return fail();
            if (!seen.has(key)) { seen.add(key); targets.push({instancePath:[...target.instancePath],nodeId:target.nodeId}); }
        }
        return {ok:true,data:targets};
    }
    // Legacy inference admits only a unique enabled native primary chain.
    const byKey = new Map(plan.primitives.map(unit=>[nodeAddressKey(unit.address),unit]));
    const ancestors = unit => {
        const found=new Map();
        const visit = current => { const key=nodeAddressKey(current.address); if(found.has(key))return; found.set(key,current); for(const edge of plan.edges)if(nodeAddressKey(edge.to)===key)visit(byKey.get(nodeAddressKey(edge.from))); };
        visit(unit); return [...found.values()];
    };
    const primary = plan.primitives.filter(unit=>unit.node.operation==='review-publish' && unit.enabled).filter(unit=>{
        const closure=ancestors(unit), generations=closure.filter(item=>item.node.operation==='generate-reply'), activations=closure.filter(item=>item.node.operation==='on-send');
        return generations.length===1 && activations.length===1 && closure.every(item=>item.enabled&&!item.setupIssues?.length) && plan.edges.some(edge=>nodeAddressKey(edge.to)===nodeAddressKey(generations[0].address)&&edge.to.portId==='activation'&&nodeAddressKey(edge.from)===nodeAddressKey(activations[0].address));
    });
    return {ok:true,data:primary.length===1 ? [{instancePath:[...primary[0].address.instancePath],nodeId:primary[0].address.nodeId}] : []};
}
export function workflowRunTargets(root) {
    const checked = inspectExpandedGraph(root);
    return checked.ok ? {ok:true,data:structuredClone(checked.data.runTargets)} : checked;
}
export function setWorkflowRunTargets(root, targets) {
    if (!safeWorkflowData(targets)) return fail();
    const checked = inspectExpandedGraph(root); if(!checked.ok)return checked;
    const candidate=structuredClone(root); candidate.runTargets=structuredClone(targets);
    const result=expandedRunTargets(candidate,checked.data);
    if(!result.ok)return result;
    candidate.runTargets=result.data;
    return {ok:true,data:candidate};
}
