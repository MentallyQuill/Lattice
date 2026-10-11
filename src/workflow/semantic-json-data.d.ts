export interface SemanticJsonContext { kind: 'metadata' | 'graph' | 'node' | 'controls' | 'descriptor' | 'command' | 'definition' | 'definitions' | 'library' | 'envelope' | 'mapping-list' | 'mapping' | 'payload' | 'parameters'; operation?: string; valueKind?: 'payload' | 'mapping-list'; definitionDraft?: boolean; controlId?: string; root?: boolean; snapshots?: unknown; slots?: Map<string,string> }
export interface SemanticJsonOptions { operation?: string; node?: boolean; descriptor?: boolean; descriptorOperation?: string; controlId?: string; command?: boolean; controlsOperation?: string; commandValueKind?: 'payload' | 'mapping-list'; snapshotEnvelope?: boolean; definitionDraft?: boolean; snapshots?: unknown }
export function prototypeJsonKey(key: string): boolean;
export function ownJsonData(value: unknown, key: unknown): unknown;
export function semanticJsonRootContext(value: unknown, options?: SemanticJsonOptions): SemanticJsonContext;
export function semanticJsonChildContext(parent: unknown, key: string, context: SemanticJsonContext): SemanticJsonContext;

export function semanticJsonCommandOptions(root: unknown, command: unknown): SemanticJsonOptions;
