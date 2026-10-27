import type { DetailEditResponse, DetailEditResult, DetailSelection, NodeDetailsActions } from './detail-types';

/** Authored intent only. The file service owns binding authority. */
export interface NodeFileSettings {
    bindingId: string;
    name: string;
    path?: string;
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
    storage?: 'server' | 'native';
    location?: { basePath: string; platform?: string; canUseAbsolutePaths?: boolean };
    accessIssue?: { code: string; message: string };
    issue?: string;
    legacy: boolean;
    summary?: string;
}

export interface NodeFileActions {
    chooseNodeFile?: (selection: DetailSelection, request: { mode: 'open' | 'save'; settings: NodeFileSettings }) => Promise<DetailEditResult>;
    saveNodeFile?: (selection: DetailSelection, settings: NodeFileSettings) => DetailEditResponse;
    refreshNodeFiles?: () => DetailEditResponse;
    editControls?: NodeDetailsActions['editControls'];
}
