/** Plain boundary DTOs: never carry host adapters, authenticated bindings or authority. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: WorkflowError };
export interface WorkflowError { code: string; message: string; nodeId?: string; address?: NodeAddress; }
export type { PatternRule, PatternSettings, PatternOccurrence, PatternMatchReport, PatternReportBinding } from './operations/pattern-engine';
export type { FilterTextSettings, FilterTextReport } from './operations/filter-text';
export type ArtifactKind = 'context' | 'draft' | 'patches' | 'candidate' | 'guidance' | 'text' | 'data';
export type WorkflowPhase = 'pre' | 'post';
export type WorkflowRunPhase = WorkflowPhase | 'unified';
export type NativeWorkflowMode = 'native-pre' | 'native-post' | 'native-unified';
export interface Endpoint { nodeId: string; portId: string; }
export interface NodeAddress { workflowId: string; instancePath: string[]; nodeId: string; }
export interface ArtifactAddress extends NodeAddress { portId: string; }
export interface PortDescriptor {
    id: string;
    label: string;
    kind: ArtifactKind;
    direction: 'input' | 'output';
    required: boolean;
    /** Inputs accept one binding; outputs may fan out to many consumers. */
    cardinality: 'one';
}
export type ControlDescriptor = ({ label?: string; valueLabels?: Record<string, string>; editor?: 'text' | 'json'; exposable?: boolean; maxLength?: number; multiline?: boolean; hidden?: boolean; visibleWhen?: { key: string; value: string | boolean | number }; help?: string } & (
    | { type: 'integer'; min: number; max: number; default: number }
    | { type: 'number'; min: number; max: number; step?: number | 'any'; default: number }
    | { type: 'enum'; values: string[]; default: string }
    | { type: 'string'; default: string }
    | { type: 'boolean'; default: boolean }
    | { type: 'json-value'; default: import('./operations/json-data').JsonValue }
    | { type: 'array'; items: 'string' | 'string-or-record' | 'record' | 'context-slot' | 'json'; min?: number; max?: number; default: unknown[] }
    | { type: 'object'; max?: number; default: { [key: string]: import('./operations/json-data').JsonValue } }));
export interface OperationDescriptor {
    id: string; title: string; family: string; phase: WorkflowPhase | 'both' | null;
    minimumSchema?: 3; input: ArtifactKind | null; output: ArtifactKind | null;
    controls: string[]; controlDescriptors: Record<string, ControlDescriptor>; defaults: Record<string, unknown>;
    requestCapability?: 'text-completion';
    requestBound: number | ((node: NativeNode) => number); modelRole: string | null; terminal: boolean; dynamicPorts?: boolean;
    rootOnly?: boolean; requiresStateInDefinition?: boolean; modes?: string[];
    acceptsSkippedInputs?: boolean; hostOperation?: boolean; nativeBoundary?: boolean;
}
export interface OperationDescription { descriptor: OperationDescriptor; ports: PortDescriptor[]; }
export interface Binding { profileId?: string | null; model?: string | null; }
export interface NativeNode extends Binding {
    id: string;
    type: 'workflow' | 'note';
    operation?: string;
    operationVersion?: 1;
    modifiers?: import('./modifiers').NodeModifier[];
    enabled?: boolean;
    modelRole?: string | null;
    artifactKind?: ArtifactKind;
    /** Explicit Text Transpose runs in either phase; omitted preserves legacy post Draft mode. */
    inputKind?: 'text' | 'draft';
    phase?: WorkflowPhase;
    /** Native Generate Reply guidance placement; omitted preserves System at chat depth 0. */
    injectionRole?: 'system' | 'user' | 'assistant';
    injectionPosition?: 'before-prompt' | 'in-prompt' | 'in-chat';
    injectionDepth?: number;
    [key: string]: unknown;
}
export interface DirectWire {
    id: string; route: 'wire'; from: string; fromPort: string; to: string; toPort: string;
}
export interface PortalWire { id: string; route: 'portal'; portalId: string; to: string; toPort: string; }
export interface Portal { id: string; label: string; source: Endpoint; kind: ArtifactKind; }
export interface DefinitionRef { id: string; version: number; semanticHash: string; }
export interface InterfacePort extends PortDescriptor { boundaryNodeId: string; }
export interface BoundaryNode { id: string; type: 'subgraph-input' | 'subgraph-output'; interfacePortId: string; enabled?: boolean; inGroup?: string; }
export interface ParameterTarget { instancePath: string[]; nodeId: string; controlId: string; }
export interface ExposedParameter { id: string; label: string; target: ParameterTarget; }
export interface DefinitionBody {
    schema: 3; runtime: 2; mode: NativeWorkflowMode;
    nodes: Record<string, NativeNode | SubgraphInstance | BoundaryNode>;
    wires: Record<string, DirectWire | PortalWire>;
    groups?: Record<string, Record<string, unknown>>;
    roles?: Record<string, Binding>; portals?: Record<string, Portal>;
}
export interface DefinitionSnapshot extends DefinitionRef {
    name: string; description?: string;
    interface: InterfacePort[]; parameters: ExposedParameter[]; body: DefinitionBody;
}
export type SnapshotTable = Record<string, DefinitionSnapshot>;
export interface DefinitionLibrary { definitions: SnapshotTable; entries?: Record<string, DefinitionRef>; }
export interface LibraryEdit { library: DefinitionLibrary; ref?: DefinitionRef; changed: boolean; addedDefinitionKeys?: string[]; }
export interface DefinitionDiagnostics { ref: DefinitionRef; definition: DefinitionSnapshot; interface: InterfacePort[]; parameters: ExposedParameter[]; parameterDescriptors: Record<string, ControlDescriptor>; nodeCount: number; wireCount: number; }
export interface SubgraphInstance {
    id: string; type: 'subgraph'; definition: DefinitionRef; enabled?: boolean;
    /** Validated exclusive root owner; authoring-only, never exported or executable authority. */
    localCopy?: { definitionId: string };
    parameterOverrides: Record<string, unknown>;
    roleOverrides: Record<string, Binding>;
    nodeBindingOverrides: Record<string, Binding>;
}
interface NativeDocument {
    id?: string;
    name?: string;
    mode: NativeWorkflowMode;
    nodes: Record<string, NativeNode | SubgraphInstance>;
    groups?: Record<string, Record<string, unknown>>;
    roles?: Record<string, Binding>;
    [key: string]: unknown;
}
export interface NativeGraph3 extends NativeDocument {
    schema: 3; runtime: 2; wires: Record<string, DirectWire | PortalWire>;
    portals?: Record<string, Portal>;
    definitions?: SnapshotTable;
    /** Full wrapper paths; immutable definition bodies never contain this permission registry. */
    localDefinitionOwners?: { instancePath: string[]; definitionId: string }[];
}
/** Terminal host results have no routable artifact port. */
export interface TerminalTarget { kind: 'terminal'; address: NodeAddress; }
export type WorkflowTarget = ArtifactAddress | TerminalTarget;
export interface ResolvedEdge { from: ArtifactAddress; to: ArtifactAddress; disabled?: boolean; provenance?: { wireId: string; portalId?: string; instancePath: string[] }; }
export interface RunUnit {
    address: NodeAddress; operation: string; phase?: WorkflowPhase; label?: string; included: boolean;
    dependencies: NodeAddress[]; requestBound: number; inputPorts: string[]; outputPorts: string[];
}
export interface RunHierarchyEntry { address: NodeAddress; kind: 'instance' | 'primitive'; parent?: NodeAddress; included: boolean; }
export interface RunPlan {
    workflowId: string; phase: WorkflowRunPhase; mode: 'root' | 'target';
    target?: WorkflowTarget; resolvedTarget?: WorkflowTarget;
    units: RunUnit[]; hierarchy: RunHierarchyEntry[]; terminals: TerminalTarget[]; callBound: number;
}
export interface ResolvedPrimitive {
    systemDefaults?: import('./workflow-data-defaults').WorkflowDataPreset[]; systemDisabled?: boolean;
    address: NodeAddress; node: NativeNode; phase: WorkflowPhase; enabled: boolean; terminal: boolean; included: boolean;
    inputPorts: PortDescriptor[]; outputPorts: PortDescriptor[]; requestBound: number; dependencies: NodeAddress[];
}
export interface BoundaryMapping {
    instance: NodeAddress; portId: string; direction: 'input' | 'output'; boundary: ArtifactAddress;
    source: ArtifactAddress | null; required: boolean; disabled?: boolean;
}
export interface ResolvedPlan extends RunPlan {
    primitives: ResolvedPrimitive[]; edges: ResolvedEdge[]; boundaryMappings: BoundaryMapping[];
    dependencies: { address: NodeAddress; dependencies: NodeAddress[] }[];
    perNodeBounds: { address: NodeAddress; requestBound: number; included: boolean }[]; requiredRoles: string[];
}
export interface StructureDiagnostics { nodeCount: number; wireCount: number; }
export interface PreparedGraphEdit {
    /** Private one-shot candidate capability; cloning does not transfer admission. */
    checkedCandidate?: object;
    candidate: NativeGraph3;
    changed: boolean;
    addedEdgeIds: string[];
    removedEdgeIds: string[];
    baseDocumentSignature: string;
    baseSignature: string;
}
export interface ConnectionCommand { from: Endpoint; to: Endpoint; replace?: boolean; }
export interface LocalDefinitionOwner { instancePath: string[]; definitionId: string; }
export interface QualifiedInstanceCommand { instancePath?: string[]; instanceId?: string; }
export interface LocalCopyCommand extends QualifiedInstanceCommand { id: string; name?: string; materializeOverrides?: boolean; }
export interface LocalDefinitionEditCommand extends QualifiedInstanceCommand { expectedRef: DefinitionRef; draft: DefinitionSnapshot; }
export interface ChangedDefinitionRef { instancePath: string[]; before: DefinitionRef; after: DefinitionRef; }
export interface LocalDefinitionEdit extends PreparedGraphEdit { instancePath: string[]; changedRefs: ChangedDefinitionRef[]; copying: boolean; }
export interface SelectionNodePosition { x: number; y: number; w?: number; h?: number; }
export interface SelectionNodePresentation { alias?: string; compact?: boolean; }
export interface SelectionGroupPresentation { x?: number; y?: number; collapsed?: boolean; frame?: { x: number; y: number; w: number; h: number }; }
export interface CreateFromSelectionCommand { viewPath?: string[]; nodeIds: string[]; definitionId: string; name: string; instanceId?: string; nodePositions?: Record<string, SelectionNodePosition>; nodePresentation?: Record<string, SelectionNodePresentation>; groupPresentation?: Record<string, SelectionGroupPresentation>; }
export interface SelectionCompositionEdit extends PreparedGraphEdit {
    instanceId: string; definitionRef: DefinitionRef;
    proposal: { inputs: InterfacePort[]; outputs: InterfacePort[]; selectedNodeIds: string[] };
}
export interface UnpackCompositionEdit extends PreparedGraphEdit {
    instancePath: string[];
    identityMap: { nodes: Record<string, string>; wires: Record<string, string>; groups: Record<string, string>; portals: Record<string, string> };
    generatedReroutes: { nodeId: string; interfacePortId: string; direction: 'input' | 'output'; kind: ArtifactKind }[];
    generatedRoles: { role: string; sourceRole: string; nodeId: string; binding: Binding }[];
    changedRefs: ChangedDefinitionRef[];
}
export interface CompositionView {
    instancePath: string[]; definitionRef?: DefinitionRef; editable: boolean;
    savedGraph: DefinitionBody;
    effectiveNodes: DefinitionBody['nodes']; interface: InterfacePort[];
    ports: { address: ArtifactAddress; direction: 'input' | 'output'; kind: ArtifactKind }[];
}
export interface CompositionViews { workflowId: string; views: CompositionView[]; }

export interface NodeControlChangeCommand { nodeId: string; controls: Record<string, unknown>; removeEdgeIds?: string[]; }
/** Authoritative values use the operation engines' bounded runtime contracts. */
export interface TextArtifact { kind: 'text'; text: string; }
/** Diagnostic-only metadata; runtime Text remains the strict kind/text envelope. */
export interface RecordedTextArtifact extends TextArtifact { modifiers?: import('./modifiers').TextModifierMetadata; }
export interface DataArtifact { kind: 'data'; value: import('./operations/json-data').JsonValue; }
export type ContextArtifact = import('./operations/context-data').RuntimeContext;
export interface GuidanceArtifact { kind: 'guidance'; text: string; visibility?: import('./artifact-privacy').ArtifactVisibility | 'public' | 'hidden' | 'actor-private'; scope?: { actorId?: string; [key: string]: unknown }; sourceRefs?: unknown[]; [key: string]: unknown; }
export type WorkflowArtifact = GuidanceArtifact | TextArtifact | DataArtifact | ContextArtifact | { kind: 'draft' | 'patches' | 'candidate'; [key: string]: unknown };
export interface PortState { status: 'completed' | 'skipped' | 'unresolved'; reason?: SafeRunError; }
/** Actual output pins are independent; legacy artifact is admitted only on the conventional out pin. */
export type OperationResult = { ok: true; artifact?: WorkflowArtifact; outputs?: Record<string, WorkflowArtifact>; outputStates?: Record<string, PortState>; reports?: unknown[] } | { ok: false; error: WorkflowError };
export interface ScopedOutputRetention {
    node: NativeNode; address: NodeAddress; inputs: Record<string, WorkflowArtifact>;
    inputStates?: Readonly<Record<string, PortState>>; artifact: WorkflowArtifact;
    portId: string; rawResult: OperationResult;
}
export interface OperationExecutionContext {
    phase: WorkflowPhase; rootMode: NativeWorkflowMode; root: boolean; address: NodeAddress;
    inputStates: Readonly<Record<string, PortState>>; signal?: AbortSignal;
    request: import('./operations/control-nodes').IterationRequest;
}
/** Trusted root host transport with static system delegation; public execution never obtains this capability. */
export interface HostOperationExecutionContext extends OperationExecutionContext {
    /** Detached current request references; exact binding identities remain private host authority. */
    getRequestBindings(): ReadonlyArray<Readonly<{ address: NodeAddress; binding: Binding; capability: 'text-completion'; role: string; iteration?: IterationProvenance }>>;
}
export type HostOperationExecutor = (node: NativeNode, inputs: Record<string, WorkflowArtifact>, local: HostOperationExecutionContext) => Promise<OperationResult> | OperationResult;

/** Frozen diagnostic data; authenticated connection objects never enter these DTOs. */
export type RunStatus = 'empty' | 'waiting' | 'queued' | 'running' | 'cancelling' | 'completed' | 'skipped' | 'unresolved' | 'failed' | 'blocked' | 'not-run' | 'cancelled' | 'invalid' | 'stale';
export type RunSettlement = 'completed' | 'unresolved' | 'failed' | 'cancelled' | 'invalid' | 'stale';
export interface SafeRunError { code: string; message: string; truncated?: boolean; }
/** Historical recordings may describe the retired typed transport; active operations use text completion. */
export interface BindingSummary { capability?: 'text-completion' | 'typed-decision'; provider?: 'jev' | 'laya' | 'compatible'; connectionId?: string; role?: string; profileId?: string | null; model?: string | null; fingerprint?: string; truncated?: boolean; }
export interface SourceSummary {
    kind?: string; phase?: string; chatId?: string | number | null; characterId?: string | number | null; groupId?: string | number | null;
    messageIndex?: number; swipeId?: number; revision?: string | number; truncated?: boolean;
    operation?: 'context-join'; inputs?: { portId: string; source: SourceSummary }[];
}
export type ReportedUsage = Partial<Record<'inputTokens' | 'outputTokens' | 'totalTokens' | 'promptTokens' | 'completionTokens' | 'input_tokens' | 'output_tokens' | 'total_tokens' | 'prompt_tokens' | 'completion_tokens' | 'cached_tokens' | 'reasoning_tokens', number>>;
export interface RequestSummary {
    attempt: number; status: 'running' | 'completed' | 'failed' | 'cancelled'; maxTokens: number;
    inputTokens: number | null; capability?: 'text-completion' | 'typed-decision'; startedAt: number; durationMs?: number; finish?: string | null; usage?: ReportedUsage | null; error?: SafeRunError; iteration?: IterationProvenance;
}
export interface IterationProvenance { index: number; helper: DefinitionRef; childAddress?: NodeAddress; childOmitted?: true; }
interface EventClock { runId: string; seq: number; at: number; elapsedMs: number; }
export type RunEvent = EventClock & (
    | { type: 'plan'; plan: RunPlan }
    | { type: 'run-cancelling'; reason?: SafeRunError }
    | { type: 'run-settled'; status: RunSettlement; error?: SafeRunError; failedAddress?: NodeAddress }
    | { type: 'node-phase'; address: NodeAddress; phase: 'binding' | 'executing'; binding?: BindingSummary }
    | { type: 'node-binding'; address: NodeAddress; binding: BindingSummary }
    | { type: 'request-start'; address: NodeAddress; attempt: number; maxTokens: number; inputTokens?: number | null; capability?: 'text-completion' | 'typed-decision'; iteration?: IterationProvenance }
    | { type: 'request-settled'; address: NodeAddress; attempt: number; status: 'completed' | 'failed' | 'cancelled'; durationMs: number; finish?: string | null; usage?: ReportedUsage | null; error?: SafeRunError }
    | { type: 'node-settled'; address: NodeAddress; status: 'completed' | 'skipped' | 'unresolved' | 'failed' | 'cancelled'; error?: SafeRunError; reason?: SafeRunError }
);
export interface RunNodeState extends RunUnit {
    status: RunStatus; subphase: 'binding' | 'executing' | 'request' | 'cancelling' | null;
    attempts: number; request: RequestSummary | null; startedAt: number | null; settledAt: number | null; durationMs: number | null;
    binding?: BindingSummary; error?: SafeRunError; reason?: SafeRunError; metadataTruncated?: boolean;
}
export interface RunState { runId: string; lastSeq: number; status: RunStatus; plan: RunPlan | null; nodes: RunNodeState[]; elapsedMs: number; at: number | null; error?: SafeRunError; }
export interface RunRow {
    address: NodeAddress; kind: 'instance' | 'primitive'; status: RunStatus;
    executableCount: number; completedCount: number; children: RunRow[];
    included?: boolean; operation?: string; label?: string; request?: RequestSummary | null;
}
export type RecordedTarget = { kind: 'terminal'; address: number } | { address: number; port: number };
export interface RecordedUnit {
    address: number; included: boolean; phase?: WorkflowPhase; dependencies: number[]; requestBound: number; status: RunStatus;
    subphase: RunNodeState['subphase']; attempts: number; startedAt: number | null; settledAt: number | null; durationMs: number | null;
    ports: { direction: 'input' | 'output'; port: number; artifact: number | null; state?: PortState }[];
    operation?: string; label?: string; request?: RequestSummary; binding?: BindingSummary; source?: SourceSummary;
    error?: SafeRunError; reason?: SafeRunError; reports?: Record<string, string | number | boolean>[]; metadataTruncated?: boolean; metadataOmitted?: boolean;
}
export type RecordedArtifact = {
    id: number; origin: { address: number; direction: 'input' | 'output' | 'terminal'; port?: number }; kind: string;
} & (
    | { format: 'structured'; value: unknown }
    | { format: 'json-prefix-text'; text: string; truncated: true }
    | { format: 'omitted'; reason: string }
);
export interface Recording {
    version: 1; runId: string; lastSeq: number; status: RunStatus; at: number | null; elapsedMs: number;
    plan: { workflowId: number; phase: WorkflowRunPhase; mode: 'root' | 'target'; callBound: number; target?: RecordedTarget; resolvedTarget?: RecordedTarget } | null;
    identities: { strings: string[]; paths: (null | [number, number])[]; addresses: [number, number, number][] };
    units: RecordedUnit[]; hierarchy: { address: number; kind: 'instance' | 'primitive'; included: boolean; parent?: number }[];
    terminals: { kind: 'terminal'; address: number; artifact: number | null }[]; artifacts: RecordedArtifact[];
    error?: SafeRunError; metadataOmitted?: boolean;
    retention?: { policy: 'canonical-prefix'; payloadAllowance: number; pendingBytes: number; metadataAllowance: number; pendingMetadataBytes: number };
}
export interface RecordedPreviewSection {
    kind: string; label?: string; format: 'structured-text' | 'json-prefix-text' | 'omitted'; text: string; truncated: boolean;
    readable: import('../ui/recorded-preview').ReadableContent;
    collapsed?: boolean; notices?: readonly string[];
    /** Present only for a complete retained Text source; local recomputation is always a stale preview. */
    recordedRawText?: string; recordedModifierTrace?: readonly import('./modifiers').ModifierTrace[];
}
export interface TerminalReviewHandle { handleId: string; runId: string; terminal: TerminalTarget; }
interface BoundedRunData { runId: string; ok: boolean; callBound: number; actualCalls: number; recording: Recording; error?: WorkflowError; preview?: true; }
export type BoundedWorkflowRunResult = BoundedRunData & { schema: 3; runtime: 2; mode: 'root' | 'target' };
/** A failed factory can return no recording; consumers preserve their prior bounded record. */
export interface WorkflowPreparationFailure { schema?: number; runtime?: number; mode: 'root' | 'target'; runId?: string; ok: false; callBound: number; actualCalls: number; error: WorkflowError; recording?: never; }
export type WorkflowRunResult = BoundedWorkflowRunResult | WorkflowPreparationFailure;
export type HostWorkflowRunResult = WorkflowRunResult & { reviewHandles?: TerminalReviewHandle[]; published?: boolean; fallback?: 'native'; };
export interface WorkflowRunOptions {
    target?: WorkflowTarget; onEvent?: (event: RunEvent) => unknown; runId?: string;
    clock?: { now(): number; monotonic(): number }; phase?: WorkflowRunPhase; signal?: AbortSignal; preview?: boolean; dryRun?: boolean;
    iterateHelper?: import('./operations/control-nodes').IterateHelper;
}
