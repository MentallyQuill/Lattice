export interface RunDiagnosticPaint { tooltip: string; inputPortId?: string; }
export interface CanvasRunDiagnostics { attemptId: string; documentKey: string; nodes: { key: string; address: {workflowId: string; instancePath: string[]; nodeId: string}; error: {code: string; message: string}; inputPortId?: string }[]; }
export function projectRunDiagnostics(value: unknown, scope: {workflowId: string; instancePath: string[]}, cards: Record<string,{ports:{dir:string;port:string}[]}>): Map<string,RunDiagnosticPaint>;
export function retainRunDiagnostics(next: Map<string,RunDiagnosticPaint>, previous?: Map<string,RunDiagnosticPaint>): Map<string,RunDiagnosticPaint>;
