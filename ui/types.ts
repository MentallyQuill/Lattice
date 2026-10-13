import type {AddSystemView, AddSystemActions} from './system-authoring-types';
import type {RecallBadgeView,RecallProjection,RecallActions} from './recall-types';
import type { WorkflowExampleLesson } from '../src/workflow/examples';
import type { StoryDocumentsView, StoryDocumentsActions, ConfigureNodeView, ConfigureNodeActions } from './storage-setup-types';
import type { GraphViews, GraphViewActions } from './view-types';
import type { NodeDetailsView, NodeDetailsActions, OutputPreviewView, OutputPreviewActions, RunDetailsView, RunDetailsActions } from './detail-types';
import type { RunMeterView } from './run-meter-types';
import type { PortalManagerView, PortalManagerActions } from './manager-types';
import type { NodeSearchView, NodeSearchActions, PinMenuView, PinMenuActions, SearchChoice } from './native-wire-types';
import type { DetailSelection, DetailEditResponse } from './detail-types';
import type { CommentFrameData, CommentPatch, CommentCommand } from './comment-types';
export interface Port { id: string; className: string; dir: 'in' | 'out'; side: 'left' | 'right'; port: string; title: string; label: string; row: number; kind: string }
export interface NodeCardData { id: string; x: number; y: number; w: number; type: string; className: string; title: string; titleHint: string; label: string; iconPath: string; body: string | null; ports: Port[]; compact: boolean; hostResult: boolean; enabled: boolean; modifierSummary?: { count: number; labels: readonly string[]; text: string }; boundary?: { direction: 'input' | 'output'; editable: boolean }; recall?: RecallBadgeView; off?: boolean; offHint?: string }
export interface GroupCardData { id: string; collapsed: boolean; x: number; y: number; w: number; h?: number; className: string; title: string; body: string; count: string }
export interface WireData { kind?: string; id: string; d: string; className: string; label: { x: number; y: number; text: string; className: string; anchor?: string; id?: string; title?: string } }
export interface CanvasActions { openRecallDetails?: (nodeId:string)=>void; hostResult: (id: string) => void; hoverPin: (pin: { nodeId: string; dir: string; port: string } | null) => void; group: (id: string, action: 'open' | 'collapse') => void; editProfile?: (selection: DetailSelection, value: string) => DetailEditResponse; refreshProfiles?: (selection: DetailSelection) => unknown }
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
export interface WorkflowExampleNode { id: string; x: number; y: number; w: number; h: number; title: string; className: string; iconPath: string; body: string | null; compact: boolean; ports: WorkflowExamplePin[] }
export interface WorkflowExampleWire { id: string; d: string; kind: string; from: { nodeId: string; portId: string }; to: { nodeId: string; portId: string } }
export interface WorkflowExampleComment { id: string; x: number; y: number; w: number; h: number; title: string; content: string; color: string }
export interface WorkflowExampleThumbnail { bounds: { x: number; y: number; w: number; h: number }; nodes: WorkflowExampleNode[]; wires: WorkflowExampleWire[]; comments: WorkflowExampleComment[]; groups: { id: string; title: string; x: number; y: number; w: number; h: number }[] }
export interface WorkflowExampleTile { id: string; number: number; title: string; goal: string; lesson?: WorkflowExampleLesson; searchText: string; thumbnail: WorkflowExampleThumbnail | null; issue: string }
export interface WorkbenchView {
    menuContextKey?: string; guideInsertionBusy?: boolean;
    hasArchivedWorkflows?: boolean;
    graphId: string; enabled: boolean; inspectorOpen: boolean; detailsWidth?: number;
    document?: WorkflowDocumentView;
    history: HistoryView; camera: { x: number; y: number; zoom: number; mode: string }; selectionCount: number;
    workflow?: WorkflowView; rootWorkflow?: WorkflowView;
    nativeFlatCanvas?: boolean; nativeDiagnostic?: string; readOnly?: boolean; graphViews?: GraphViews;
    nodeDetails?: NodeDetailsView | null; outputPreview?: OutputPreviewView | null; runDetails?: RunDetailsView | null; runMeter?: RunMeterView | null;
    commentDetails?: { comment: CommentFrameData; selection: DetailSelection } | null;
    addSystem?: AddSystemView | null; portalManager?: PortalManagerView | null; subgraphSave?: SubgraphSaveView | null;
    nativeSearch?: NodeSearchView | null; nativePinMenu?: PinMenuView | null; nativeChoices?: readonly SearchChoice[];
    importReview?: ImportReviewView | null;
    documentPrompt?: DocumentPromptView | null;
    recall?: RecallProjection;
    storyDocuments?: StoryDocumentsView; configureNode?: ConfigureNodeView | null;
    examples?: readonly WorkflowExampleTile[];
    examplesIssue?: string;
    selectionActions?: { copy: boolean; cut: boolean; delete: boolean };
    menuCapabilities?: { addSystem?: boolean; inspect: boolean; rename: boolean; duplicate: boolean; group: boolean; ungroup: boolean; createSubgraph: boolean; saveSubgraph: boolean; comment: boolean; compact: boolean; compactChecked: boolean; fitSelection: boolean; hasSelection: boolean; stop: boolean };
}
export interface WorkbenchActions {
    nodeGuide?: import('./node-guide-types').NodeGuideActions;
    logoUrl?: string;
    graphViewActions?: GraphViewActions; nodeDetails?: NodeDetailsActions; outputPreview?: OutputPreviewActions; runDetails?: RunDetailsActions;
    commentDetails?: { patch: (selection: DetailSelection, patch: CommentPatch) => DetailEditResponse; command: (selection: DetailSelection, command: CommentCommand) => DetailEditResponse };
    addSystem?: AddSystemActions; portalManager?: PortalManagerActions; managePortals?: () => void;
    shelfSubgraph?: (id: string, action: 'delete' | 'open') => void; subgraphSave?: SubgraphSaveActions;
    chooseNative?: (id: string, at?: { x: number; y: number }) => void; nativeSearch?: NodeSearchActions; nativePinMenu?: PinMenuActions; openRunDetails?: () => void;
    setEnabled: (enabled: boolean) => void; command: (name: string) => void;
    mode: (mode: string) => void; zoom: (factor: number) => void; fitSelection: () => void;
    resizeStart?: () => void; resizeDetails?: (width: number) => void;
    acceptImport?: () => void; cancelImport?: () => void; prepareImportAgain?: () => void;
    documentPrompt?: DocumentPromptActions;
    recall?: RecallActions;
    storyDocuments?: StoryDocumentsActions; configureNode?: ConfigureNodeActions;
    captureExampleContext?: () => unknown;
    exampleContextCurrent?: (context: unknown) => boolean;
    openExample?: (id: string, context?: unknown) => boolean | Promise<boolean>;
    refreshExamples?: (context?: unknown) => boolean | void | Promise<boolean | void>;
}


export interface WorkflowNodeView { id: string; title: string; canonicalTitle: string; alias: string; compact: boolean; operation: string; family: string; phase: string; input: string; output: string; terminal: boolean; modelRole: string | null; profileId: string; model: string; effective: string; enabled: boolean; issue?: string; issueDiagnostic?: import('./diagnostic-types').DiagnosticView }
export interface WorkflowAddress { workflowId: string; instancePath: string[]; nodeId: string }
export type WorkflowTarget = (WorkflowAddress & { portId: string }) | { kind: 'terminal'; address: WorkflowAddress };
export interface WorkflowReviewSelector { handleId: string; runId: string; terminal: { kind: 'terminal'; address: WorkflowAddress } }
export interface WorkflowBoundedResultView { kind: 'bounded'; ok: boolean; error: string; errorDiagnostic?: import('./diagnostic-types').DiagnosticView; applyDiagnostic?: import('./diagnostic-types').DiagnosticView; previewStatus?: string | null; actualCalls: number; callBound: number; runId?: string; source: import('../src/ui/recorded-preview').PreviewSource; sections: import('../src/workflow/types').RecordedPreviewSection[]; previewTarget?: WorkflowTarget | null; tokenMethods: string[]; applyAvailable: boolean; selectedReviewHandle?: WorkflowReviewSelector | null; applyIssue: string }
export interface WorkflowView {
    diagnostics?: import('./diagnostic-types').DiagnosticView[];
    enabled?: boolean;
    graphId: string; name: string; phase: string; selectedId: string | null;
    profiles: { id: string; name: string }[];
    families: { name: string; description: string; operations: { id: string; title: string; phase: string; compatible: boolean }[] }[];
    nodes: WorkflowNodeView[]; groups: { id: string; title: string; members: string[]; collapsed: boolean; callBound: number }[];
    reviewTerminals?: WorkflowTarget[];
    callBound: number; issues: string[]; busy: boolean; ownedBusy?: boolean; status: string; quoteHelp: string;
    availability?: 'current' | 'stale' | 'superseded' | 'cancelled'; preparationError?: { code: string; message: string } | null;
    result: WorkflowBoundedResultView | null;
}
