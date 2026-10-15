/** Prepared authoring diagnostics. No graph expansion or host work occurs in rendering. */
export function prepareNodeReadiness({address, setupIssues = [], ports = [], wires = [], deferred = []}) {
    const issues = setupIssues.map(issue => ({...issue,address:structuredClone(issue.address ?? address),category:'setup'}));
    const connected = new Set(Object.values(wires).filter(wire => wire.to === address.nodeId).map(wire => wire.toPort));
    for (const port of ports) if (port.direction === 'input' && port.required && !connected.has(port.id)) issues.push({code:'INPUT_REQUIRED',message:`Connect ${port.label || port.id}.`,portId:port.id,address:structuredClone(address),category:'input'});
    return readinessFromIssues(issues, deferred);
}
export function readinessFromIssues(issues = [], deferred = []) {
    issues=[...issues].sort((a,b)=>(a.category==='setup'?0:1)-(b.category==='setup'?0:1));
    const state = issues.some(issue => issue.category === 'setup') ? 'setup' : issues.length ? 'input' : 'ready';
    const label = state === 'setup' ? 'Setup Required' : state === 'input' ? 'Input Required' : '';
    return {state,label,issues,deferred,description:issues.map(issue => issue.message).join(' ')};
}
/** Count each occurrence once, preferring its setup category over input requirements. */
export function summarizeReadiness(rows = []) {
    const byAddress = new Map();
    for (const row of rows) for (const issue of row?.issues ?? []) {
        const at=issue.address;
        const key = at.kind==='library' ? JSON.stringify(['library',at.definitionRef,at.instancePath ?? [],at.nodeId]) : JSON.stringify([at.workflowId,at.instancePath,at.nodeId]);
        if (!byAddress.has(key) || issue.category === 'setup') byAddress.set(key,issue.category);
    }
    const setup = [...byAddress.values()].filter(value => value === 'setup').length, input = byAddress.size - setup;
    return {...readinessFromIssues(rows.flatMap(row => row?.issues ?? [])),setup,input,label:[setup && `${setup} need${setup===1?'s':''} setup`,input && `${input} need${input === 1 ? 's' : ''} input`].filter(Boolean).join(' · ')};
}
