import type { PreviewMode } from './recorded-preview';
export function readPreviewMode(storage?: Pick<Storage, 'getItem'>): PreviewMode;
export function writePreviewMode(storage: Pick<Storage, 'setItem'> | undefined, mode: PreviewMode): boolean;
