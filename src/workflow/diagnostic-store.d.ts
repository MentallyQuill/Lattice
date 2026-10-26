import type {DiagnosticStore} from './diagnostic-history';
export function createDiagnosticStore(options?:{indexedDB?:IDBFactory|null}):DiagnosticStore;
