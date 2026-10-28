import type { DetailEditResponse, DetailEditResult, DetailSelection, NodeDetailsActions } from './detail-types';

/** Authored intent only. The file service owns binding authority. */
export interface NodeFileSettings {
    managed?: boolean;
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
    managed?: boolean;
    friendlyName?: string;
    ownFileConfigured?: boolean;
    typeLabel?: string;
    status?: string;
    saving?: boolean;
    initialization?: 'generate' | 'template' | 'require-file';
    initializationInstructions?: string;
    initializationMaxTokens?: number;
    fileHandling?: 'replace' | 'append';
    advancedMutation?: string;
    mutation?: string;
    inputIssue?: string;
    actorScope?: 'selected' | 'presence';
    actorId?: string;
    actors?: {id: string; label: string}[];
    storage?: 'server' | 'native' | 'host';
    location?: { basePath: string; platform?: string; canUseAbsolutePaths?: boolean };
    accessIssue?: { code: string; message: string };
    issue?: string;
    legacy: boolean;
    summary?: string;
}

export interface NodeFileActions {
    chooseNodeFile?: (selection: DetailSelection, request: { mode: 'open' | 'save'; settings: NodeFileSettings; newCopy?: boolean }) => Promise<DetailEditResult>;
    createNodeFileCopy?: (selection: DetailSelection, settings: NodeFileSettings) => DetailEditResponse;
    openNodeFile?: (selection: DetailSelection) => DetailEditResponse;
    downloadNodeFile?: (selection: DetailSelection) => DetailEditResponse;
    importNodeFile?: (selection: DetailSelection) => DetailEditResponse;
    setupNodeFiles?: () => DetailEditResponse;
    saveNodeFile?: (selection: DetailSelection, settings: NodeFileSettings) => DetailEditResponse;
    refreshNodeFiles?: () => DetailEditResponse;
    editControls?: NodeDetailsActions['editControls'];
}
