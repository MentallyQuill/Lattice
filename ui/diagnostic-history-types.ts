import type { DiagnosticLog } from '../src/workflow/diagnostic-history';

export interface DiagnosticHistoryView {
    scopeKey: string;
    enabled: boolean;
    loading: boolean;
    issue: string;
    entries: DiagnosticLog[];
    selectedId: string | null;
}

export interface DiagnosticHistoryActions {
    setEnabled(enabled: boolean): unknown;
    select(id: string): unknown;
    export(scopeKey: string): unknown;
    clear(scopeKey: string): unknown;
}
