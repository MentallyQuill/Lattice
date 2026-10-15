/** Prepared authoring diagnostics. No graph expansion or host work occurs in rendering. */
export function prepareNodeReadiness({address, setupIssues = [], ports = [], wires = [], deferred = []}) {
    const issues = setupIssues.map(issue => ({...issue,address:structuredClone(issue.address ?? address),category:'setup'}));
    return readinessFromIssues(issues, deferred);
}
export function readinessFromIssues(issues = [], deferred = []) {
    issues=issues.filter(issue => issue.category === 'setup');
    const state = issues.length ? 'setup' : 'ready';
    const label = state === 'setup' ? 'Setup Required' : '';
    return {state,label,issues,deferred,description:issues.map(issue => issue.message).join(' ')};
}
/** Count each occurrence once, preferring its setup category over input requirements. */
export function summarizeReadiness(rows = []) {
    const byAddress = new Map();
    for (const row of rows) for (const issue of row?.issues ?? []) {
        if (issue.category !== 'setup') continue;
        const at=issue.address;
        const key = at.kind==='library' ? JSON.stringify(['library',at.definitionRef,at.instancePath ?? [],at.nodeId]) : JSON.stringify([at.workflowId,at.instancePath,at.nodeId]);
        if (!byAddress.has(key) || issue.category === 'setup') byAddress.set(key,issue.category);
    }
    const setup = [...byAddress.values()].filter(value => value === 'setup').length, input = 0;
    return {...readinessFromIssues(rows.flatMap(row => row?.issues ?? [])),setup,input,label:[setup && `${setup} need${setup===1?'s':''} setup`].filter(Boolean).join(' · ')};
}
