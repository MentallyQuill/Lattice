import type { ReadableContent } from './recorded-preview';
export interface PreviewMarkdownOptions { maxHtmlBytes?: number; }
export interface RenderedPreviewMarkdown { readonly html: string; readonly truncated: boolean; readonly omittedFormatting: boolean; }
export interface RenderedReadableMarkdown {
    readonly parts: readonly RenderedPreviewMarkdown[];
    /** Display-only escaped strings/rows; source DTO and copy values remain unchanged. */
    readonly displayContent: ReadableContent;
    /** Sanitized prose/escaped text bytes plus conservative reserved UI chrome and row bytes. */
    readonly htmlBytes: number;
    readonly truncated: boolean;
    readonly omittedFormatting: boolean;
    readonly omittedMessages: number;
}
export function renderPreviewMarkdown(text: string, window: Window, options?: PreviewMarkdownOptions): RenderedPreviewMarkdown;
export function renderReadableMarkdown(content: ReadableContent, window: Window, options?: PreviewMarkdownOptions): RenderedReadableMarkdown;
