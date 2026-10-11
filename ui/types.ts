import type { StoryDocumentsView, StoryDocumentsActions, ConfigureNodeView, ConfigureNodeActions } from './storage-setup-types';
import type { FastConnectionsView, FastConnectionsActions } from './fast-connections-types';
import type { GraphViews, GraphViewActions } from './view-types';
import type { NodeDetailsView, NodeDetailsActions, OutputPreviewView, OutputPreviewActions, RunDetailsView, RunDetailsActions } from './detail-types';
import type { RunMeterView } from './run-meter-types';
import type { PortalManagerView, PortalManagerActions } from './manager-types';
import type { NodeSearchView, NodeSearchActions, PinMenuView, PinMenuActions, SearchChoice } from './native-wire-types';
import type { DetailSelection, DetailEditResponse } from './detail-types';
import type { CommentFrameData, CommentPatch, CommentCommand } from './comment-types';
export interface Port { id: string; className: string; dir: 'in' | 'out'; side: 'left' | 'right'; port: string; title: string; label: string; row: number; kind: string }
export interface NodeCardData { id: string; x: number; y: number; w: number; type: string; className: string; title: string; titleHint: string; label: string; iconPath: string; body: string | null; ports: Port[]; compact: boolean; hostResult: boolean; enabled: boolean; modifierSummary?: { count: number; labels: readonly string[]; text: string }; boundary?: { direction: 'input' | 'output'; editable: boolean }; off?: boolean; offHint?: string }
export interface GroupCardData { id: string; collapsed: boolean; x: number; y: number; w: number; h?: number; className: string; title: string; body: string; count: string }
export interface WireData { kind?: string; id: string; d: string; className: string; label: { x: number; y: number; text: string; className: string; anchor?: string; id?: string; title?: string } }
export interface CanvasActions { hostResult: (id: string) => void; hoverPin: (pin: { nodeId: string; dir: string; port: string } | null) => void; group: (id: string, action: 'open' | 'collapse') => void; editProfile?: (selection: DetailSelection, value: string) => DetailEditResponse; refreshProfiles?: (selection: DetailSelection) => unknown }
export interface PositionUpdate { id: string; x: number; y: number; w?: number; h?: number }
export interface HistoryView { undo: boolean; redo: boolean; undoTitle: string; redoTitle: string; note: string; showNote: boolean }
export interface ImportReviewView {
    fileName: string; name: string; phase: string; nodeCount: number; wireCount: number; groupCount: number;
    callBound: number; importedCallBound: number; requiredRoles: string[];
    unresolvedBindings: { role: string; title: string; missing: string[] }[];
    inheritedBindingCount: number; terminals: { title: string; operation: string }[];
    bindingReviewRequired: boolean; error: string;
}
export interface SubgraphSaveView { key: string; name: string; targetId: string | null; entries: { id: string; name: string }[]; error?: string }
export interface SubgraphSaveActions { close(): void; save(key: string, name: string, targetId: string | null): unknown }
export interface DocumentPromptView { name: string }
export interface DocumentPromptActions { choose(choice: 'save' | 'discard' | 'cancel'): void }
export interface WorkflowDocumentView {
    name: string; dirty: boolean; busy: boolean; native: boolean; status?: string;
    recents: { id: string; name: string }[];
    recovery: { id: string; name: string; issue?: string }[];
}
export interface WorkflowExamplePin extends Port { x: number; y: number }
export interface WorkflowExampleNode { id: string; x: number; y: number; w: number; h: number; title: string; className: string; iconPath: string; body: string | null; ports: WorkflowExamplePin[] }
export interface WorkflowExampleWire { id: string; d: string; kind: string; from: { nodeId: string; portId: string }; to: { nodeId: string; portId: string } }
export interface WorkflowExampleComment { id: string; x: number; y: number; w: number; h: number; title: string; content: string; color: string }
export interface WorkflowExampleThumbnail { bounds: { x: number; y: number; w: number; h: number }; nodes: WorkflowExampleNode[]; wires: WorkflowExampleWire[]; comments: WorkflowExampleComment[] }
export interface WorkflowExampleTile { id: string; number: number; title: string; goal: string; thumbnail: WorkflowExampleThumbnail | null; issue: string }
export interface RecallArmsView {
    scope: {userId:string;chatId:string;workflowId:string;actorId:string} | null;
    nodes: {nodeId:string;actorId:string;memorySetId:string;hotkey:{code:string;ctrl:boolean;alt:boolean;shift:boolean;meta:boolean};target:string;uses:string;consumeOn:string;armed:boolean;remaining:{reply:boolean;swipe:boolean};pendingCount:number}[];
    issue?:string;
}
export interface RecallArmsActions {refresh():void;arm(nodeId:string):DetailEditResponse;disarm(nodeId:string):DetailEditResponse;}
export interface WorkbenchView {
    graphId: string; armed: boolean; inspectorOpen: boolean; detailsWidth?: number;
    document?: WorkflowDocumentView;
    history: HistoryView; camera: { x: number; y: number; zoom: number; mode: string }; selectionCount: number;
    workflow?: WorkflowView; rootWorkflow?: WorkflowView;
    nativeFlatCanvas?: boolean; nativeDiagnostic?: string; readOnly?: boolean; graphViews?: GraphViews;
    nodeDetails?: NodeDetailsView | null; outputPreview?: OutputPreviewView | null; runDetails?: RunDetailsView | null; runMeter?: RunMeterView | null;
    commentDetails?: { comment: CommentFrameData; selection: DetailSelection } | null;
    portalManager?: PortalManagerView | null; subgraphSave?: SubgraphSaveView | null;
    nativeSearch?: NodeSearchView | null; nativePinMenu?: PinMenuView | null; nativeChoices?: readonly SearchChoice[];
    importReview?: ImportReviewView | null;
    documentPrompt?: DocumentPromptView | null;
    fastConnections?: FastConnectionsView; fastConnectionsActive?: boolean;
    recallArms?: RecallArmsView;
    storyDocuments?: StoryDocumentsView; configureNode?: ConfigureNodeView | null;
    examples?: readonly WorkflowExampleTile[];
    examplesIssue?: string;
    selectionActions?: { copy: boolean; cut: boolean; delete: boolean };
}
export interface WorkbenchActions {
    logoUrl?: string;
    graphViewActions?: GraphViewActions; nodeDetails?: NodeDetailsActions; outputPreview?: OutputPreviewActions; runDetails?: RunDetailsActions;
    commentDetails?: { patch: (selection: DetailSelection, patch: CommentPatch) => DetailEditResponse; command: (selection: DetailSelection, command: CommentCommand) => DetailEditResponse };
    portalManager?: PortalManagerActions; managePortals?: () => void;
    shelfSubgraph?: (id: string, action: 'delete' | 'open') => void; subgraphSave?: SubgraphSaveActions;
    chooseNative?: (id: string, at?: { x: number; y: number }) => void; nativeSearch?: NodeSearchActions; nativePinMenu?: PinMenuActions; openRunDetails?: () => void;
    arm: (enabled: boolean) => void; command: (name: string) => void;
    mode: (mode: string) => void; zoom: (factor: number) => void; fitSelection: () => void;
    resizeStart?: () => void; resizeDetails?: (width: number) => void; addNode?: (id: string, at?: { x: number; y: number }) => void;
    acceptImport?: () => void; cancelImport?: () => void; prepareImportAgain?: () => void;
    documentPrompt?: DocumentPromptActions;
    fastConnections?: FastConnectionsActions;
    recallArms?: RecallArmsActions;
    storyDocuments?: StoryDocumentsActions; configureNode?: ConfigureNodeActions;
    openExample?: (id: string) => boolean | Promise<boolean>;
    refreshExamples?: () => boolean | void;
}


export interface WorkflowControl { key: string; label: string; value: string | number | boolean; kind: string; options: string[] | null }
export interface WorkflowNodeView { id: string; title: string; canonicalTitle: string; alias: string; compact: boolean; operation: string; family: string; phase: string; input: string; output: string; terminal: boolean; modelRole: string | null; profileId: string; model: string; effective: string; enabled: boolean; controls: WorkflowControl[] }
export interface WorkflowAddress { workflowId: string; instancePath: string[]; nodeId: string }
export type WorkflowTarget = (WorkflowAddress & { portId: string }) | { kind: 'terminal'; address: WorkflowAddress };
export interface WorkflowReviewSelector { handleId: string; runId: string; terminal: { kind: 'terminal'; address: WorkflowAddress } }
export interface WorkflowBoundedResultView { kind: 'bounded'; ok: boolean; error: string; actualCalls: number; callBound: number; runId?: string; sections: { kind: string; format: string; text: string; truncated: boolean }[]; previewTarget?: WorkflowTarget | null; tokenMethods: string[]; applyAvailable: boolean; selectedReviewHandle?: WorkflowReviewSelector | null; applyIssue: string; memoryCommit?: Readonly<{ applied: boolean; acknowledged: boolean; version: number }> }
export interface WorkflowView {
    graphId: string; name: string; phase: string; selectedId: string | null;
    profiles: { id: string; name: string }[];
    fastConnections?: { value: string; label: string }[];
    families: { name: string; description: string; operations: { id: string; title: string; phase: string; compatible: boolean }[] }[];
    nodes: WorkflowNodeView[]; groups: { id: string; title: string; members: string[]; collapsed: boolean; callBound: number }[];
    callBound: number; issues: string[]; busy: boolean; status: string; quoteHelp: string;
    availability?: 'current' | 'stale' | 'superseded' | 'cancelled'; preparationError?: { code: string; message: string } | null;
    result: WorkflowBoundedResultView | null;
}
