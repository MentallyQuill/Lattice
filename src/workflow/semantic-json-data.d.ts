export interface SemanticJsonContext { kind: 'metadata' | 'graph' | 'node' | 'controls' | 'descriptor' | 'command' | 'definition' | 'definitions' | 'library' | 'envelope' | 'mapping-list' | 'mapping' | 'payload' | 'parameters'; operation?: string; controlId?: string; root?: boolean; snapshots?: unknown; slots?: Map<string,string> }
export interface SemanticJsonOptions { operation?: string; node?: boolean; descriptor?: boolean; descriptorOperation?: string; controlId?: string; command?: boolean; controlsOperation?: string }
export function prototypeJsonKey(key: string): boolean;
export function ownJsonData(value: unknown, key: PropertyKey): unknown;
export function semanticJsonRootContext(value: unknown, options?: SemanticJsonOptions): SemanticJsonContext;
export function semanticJsonChildContext(parent: unknown, key: string, context: SemanticJsonContext): SemanticJsonContext;
