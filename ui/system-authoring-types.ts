import type { SystemPicker, SystemPreview } from '../src/workflow/system-authoring';
import type { Result, Endpoint } from '../src/workflow/types';
export interface SystemDraft {
    choiceKey: string;
    inputs: Record<string, Endpoint>;
    outputs: {
        outputPortId: string;
        destination: Endpoint;
    }[];
    parameterOverrides: Record<string, unknown>;
    guidance?: {
        outputPortId: string;
        destination: {
            kind: 'new-compose';
        } | {
            kind: 'existing-compose';
            nodeId: string;
        };
    };
}
export interface AddSystemView extends SystemPicker {
    key: string;
    mode?: 'assist';
    error?: string;
}
export interface AddSystemActions {
    close(): void;
    preview(key: string, draft: SystemDraft): Result<{
        connections: string[];
        changes: SystemPreview[];
    }>;
    submit(key: string, choiceKey?: string): unknown;
}
