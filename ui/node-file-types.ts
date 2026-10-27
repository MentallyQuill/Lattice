import type { DetailEditResponse, DetailEditResult, DetailSelection, NodeDetailsActions } from './detail-types';

/** Portable intent only. Native handles stay in the origin-local file service. */
export interface NodeFileSettings {
    bindingId: string;
    name: string;
    format: 'json' | 'jsonl' | 'csv' | 'text' | 'markdown';
    missing: 'create' | 'error';
    content: string;
    visibility: { kind: 'public' | 'hidden' } | { kind: 'actor-private'; actorId: string };
}

/** Prepared display state; the panel never resolves references or file authority. */
export interface NodeFileView {
    operation: string;
    mode: 'source' | 'destination' | 'inherited';
    destinationMode: 'connected' | 'own';
    settings: NodeFileSettings;
    available: boolean;
    supported: boolean;
    accessIssue?: { code: string; message: string };
    issue?: string;
    legacy: boolean;
    summary?: string;
}

export interface NodeFileActions {
    chooseNodeFile?: (selection: DetailSelection, request: { mode: 'open' | 'save'; settings: NodeFileSettings }) => Promise<DetailEditResult>;
    saveNodeFile?: (selection: DetailSelection, settings: NodeFileSettings) => DetailEditResponse;
    editControls?: NodeDetailsActions['editControls'];
}
