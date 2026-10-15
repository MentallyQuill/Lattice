/** Descriptor-safe, bounded paint projection. Never expands graphs or mutates prepared ports. */
const record = value => value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const read = (value, key) => record(value) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
function list(value, limit) {
    if (!Array.isArray(value) || ![Array.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const fields = Object.getOwnPropertyDescriptors(value), length = fields.length?.value;
    if (!Number.isInteger(length) || length < 0 || length > limit) return null;
    const result=[];
    for (let index=0;index<length;index++) { const field=fields[index]; if (!field || !('value' in field)) return null; result.push(field.value); }
    return result;
}
export function projectRunDiagnostics(value, scope, cards) {
    const result = new Map();
    try {
        if (!scope || typeof scope.workflowId !== 'string' || !Array.isArray(scope.instancePath)
            || typeof read(value,'attemptId') !== 'string' || typeof read(value,'documentKey') !== 'string') return result;
        const nodes=list(read(value,'nodes'),1000); if (!nodes) return result;
        for (const row of nodes) {
            const address=read(row,'address'), path=list(read(address,'instancePath'),64), nodeId=read(address,'nodeId');
            if (!path || !path.every(part=>typeof part==='string') || typeof nodeId!=='string' || read(address,'workflowId')!==scope.workflowId
                || path.length!==scope.instancePath.length || path.some((part,index)=>part!==scope.instancePath[index])
                || read(row,'key')!==JSON.stringify([scope.workflowId,path,nodeId]) || !Object.hasOwn(cards ?? {},nodeId)) continue;
            const error=read(row,'error'), code=read(error,'code'), message=read(error,'message');
            if (typeof code!=='string' || typeof message!=='string' || !code || !message) continue;
            const input=read(row,'inputPortId'), card=cards[nodeId];
            const inputPortId=typeof input==='string' && card.ports.some(port=>port.dir==='in' && port.port===input) ? input : undefined;
            result.set(nodeId,{tooltip:code.slice(0,128)+': '+message.slice(0,2048),...(inputPortId ? {inputPortId} : {})});
        }
    } catch { return new Map(); }
    return result;
}
/** Retain unchanged paint values; publications touch only diagnostics and changed mounted slots. */
export function retainRunDiagnostics(next, previous = new Map()) {
    for (const [id,row] of next) {
        const old=previous.get(id);
        if (old?.tooltip===row.tooltip && old.inputPortId===row.inputPortId) next.set(id,old);
    }
    return next.size===previous.size && [...next].every(([id,row])=>previous.get(id)===row) ? previous : next;
}
