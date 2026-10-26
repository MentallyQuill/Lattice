import type { DiagnosticHistory } from '../workflow/diagnostic-history';
import type { DiagnosticHistoryView, DiagnosticHistoryActions } from '../../ui/diagnostic-history-types';
export interface DiagnosticScope { userId: string; chatId: string | number; characterId?: string | number | null; groupId?: string | number | null; }
export function diagnosticScopeKey(scope: DiagnosticScope | null | undefined): string;
export function createDiagnosticHistoryController(options: {
    history: DiagnosticHistory;
    scope(): DiagnosticScope | null;
    enabled(): boolean;
    setEnabled(enabled: boolean): unknown;
    changed(): void;
    download(text: string, fileName: string): void;
}): { snapshot(): DiagnosticHistoryView; refresh(): Promise<void>; sync(): void; actions: DiagnosticHistoryActions; dispose(): void; };
