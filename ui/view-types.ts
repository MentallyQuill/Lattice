/** Plain graph-view DTOs and callbacks. These components do not import workflow/runtime state. */
export interface GraphDefinitionRef { id: string; version: number; semanticHash: string }
export type GraphViewIdentity =
    | { kind: 'root'; workflowId: string }
    | { kind: 'instance'; workflowId: string; instancePath: readonly string[] }
    | { kind: 'library'; workflowId: string; definitionRef: GraphDefinitionRef };
export interface GraphBreadcrumb { key: string; identity: GraphViewIdentity; label: string }
export interface GraphViewInfo {
    key: string; identity: GraphViewIdentity; label: string; readOnly: boolean;
    breadcrumbs: readonly GraphBreadcrumb[];
    definitionRef?: GraphDefinitionRef;
}
export interface GraphViews {
    workflowId: string; viewEpoch: number; active: GraphViewInfo;
    tabs: readonly GraphViewInfo[]; closedViews: readonly GraphViewInfo[];
}
export interface GraphViewActions {
    openInstance?: (path: readonly string[]) => void;
    openLibrary?: (ref: GraphDefinitionRef) => void;
    focusView?: (key: string) => void;
    closeView?: (key?: string) => void;
    reopenView?: (key: string) => void;
    revealParent?: () => void;
    closeOtherViews?: (key: string) => void;
    exportView?: (key: string) => void;
    renameView?: (key: string, name: string) => void;
    canRenameView?: (key: string) => boolean;
}
