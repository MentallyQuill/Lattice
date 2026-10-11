import MarkdownIt from 'markdown-it';
import createDOMPurify from 'dompurify';

const MAX_HTML_BYTES = 262144;
const encoder = new TextEncoder();
const parser = new MarkdownIt({ html: true, typographer: false, linkify: false });
// Language classes are outside the presentation policy; avoid generating them.
parser.options.langPrefix = '';
parser.renderer.rules.fence = (tokens, index) => '<pre><code>' + parser.utils.escapeHtml(tokens[index].content) + '</code></pre>\n';
const tags = ['p', 'br', 'hr', 'em', 'strong', 's', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'details', 'summary', 'a', 'span', 'div'];
const resourceTags = new Set(['img', 'picture', 'source', 'video', 'audio', 'iframe', 'embed', 'object', 'svg', 'math', 'link']);
const windows = new WeakMap();
const size = text => encoder.encode(text).byteLength;
const limitFor = options => Number.isFinite(options?.maxHtmlBytes) ? Math.max(0, Math.min(MAX_HTML_BYTES, Math.floor(options.maxHtmlBytes))) : MAX_HTML_BYTES;
function safePrefix(text, length) {
    let end = Math.max(0, Math.floor(length));
    if (end > 0 && end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
    return text.slice(0, end);
}
function allowedURL(value) {
    if (/[\u0000-\u0020\u007f\ufffd]/.test(value) || !/^(https?:\/\/|mailto:)/i.test(value)) return false;
    try { return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol); } catch { return false; }
}
function stateFor(window) {
    let state = windows.get(window);
    if (state) return state;
    const purifier = createDOMPurify(window);
    state = { purifier, omitted: false, textCache: new Map(), contentCache: new WeakMap() };
    purifier.addHook('uponSanitizeElement', (node, data) => {
        if (node.nodeType === 1 && data.tagName !== 'body' && !tags.includes(data.tagName)) state.omitted = true;
        if (resourceTags.has(data.tagName)) {
            state.omitted = true;
            // DOMPurify owns this inert tree. Source URLs never become active nodes.
            const description = node.getAttribute('alt') || node.getAttribute('title') || '';
            node.replaceWith(window.document.createTextNode('[' + data.tagName + ' omitted' + (description ? ': ' + description : '') + ']'));
        }
    });
    purifier.addHook('uponSanitizeAttribute', (node, data) => {
        const tag = node.nodeName.toLowerCase();
        const allowed = tag === 'a' && ['href', 'title'].includes(data.attrName)
            || tag === 'ol' && data.attrName === 'start'
            || tag === 'details' && data.attrName === 'open';
        if (!allowed || data.attrName === 'href' && !allowedURL(data.attrValue)) { data.keepAttr = false; state.omitted = true; }
    });
    purifier.addHook('afterSanitizeAttributes', node => {
        if (node.nodeName.toLowerCase() === 'a' && node.hasAttribute('href')) {
            node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer');
        }
    });
    windows.set(window, state);
    return state;
}
function sanitize(text, state) {
    state.omitted = false;
    const html = state.purifier.sanitize(parser.render(text), {
        ALLOWED_TAGS: tags, ALLOWED_ATTR: ['href', 'title', 'start', 'open'],
        ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
        FORBID_TAGS: ['script', 'style', 'form', 'input', 'button', 'textarea', 'select', 'option'],
        RETURN_TRUSTED_TYPE: false, FORCE_BODY: true,
    });
    return { html, omittedFormatting: state.omitted };
}
/** Render complete sanitizer-owned HTML; shorten input and rerender, never slice HTML. */
export function renderPreviewMarkdown(text, window, options) {
    const maxHtmlBytes = limitFor(options), state = stateFor(window);
    const key = JSON.stringify([maxHtmlBytes, text]);
    if (state.textCache.has(key)) return state.textCache.get(key);
    let selected = text, result = sanitize(selected, state), omittedFormatting = result.omittedFormatting;
    while (size(result.html) > maxHtmlBytes) {
        // Conservative progress handles Markdown's non-monotonic formatting boundaries.
        selected = safePrefix(selected, Math.min(selected.length - 1, selected.length * maxHtmlBytes / size(result.html) * 0.9));
        result = sanitize(selected, state); omittedFormatting ||= result.omittedFormatting;
    }
    const rendered = Object.freeze({ html: result.html, truncated: selected.length < text.length, omittedFormatting });
    // Keep parsing caches bounded; large direct calls are not retained by value.
    if (text.length <= 65536) {
        if (state.textCache.size >= 16) state.textCache.delete(state.textCache.keys().next().value);
        state.textCache.set(key, rendered);
    }
    return rendered;
}
/** One selected representation gets one budget, including conservative UI chrome reserves. */
export function renderReadableMarkdown(content, window, options) {
    const state = stateFor(window), maxHtmlBytes = limitFor(options);
    const immutable = Object.isFrozen(content);
    let policies = immutable ? state.contentCache.get(content) : undefined;
    if (policies?.has(maxHtmlBytes)) return policies.get(maxHtmlBytes);
    let htmlBytes = Math.min(512, maxHtmlBytes), truncated = false, omittedFormatting = false;
    const parts = [];
    let displayContent = content, exhausted = false;
    const reserve = bytes => {
        if (bytes > maxHtmlBytes - htmlBytes) { truncated = true; exhausted = true; return false; }
        htmlBytes += bytes; return true;
    };
    const plain = text => {
        let end = 0;
        for (const character of text) {
            const escaped = ({ '\u00a0': '&nbsp;', '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character;
            const bytes = size(escaped);
            if (bytes > maxHtmlBytes - htmlBytes) { truncated = true; exhausted = true; break; }
            htmlBytes += bytes; end += character.length;
        }
        return text.slice(0, end);
    };
    const rows = (items, transform) => {
        const displayed = [];
        for (const item of items) {
            if (exhausted || !reserve(256)) { truncated = true; break; }
            displayed.push(transform(item));
        }
        return displayed;
    };
    if (content.kind === 'json') displayContent = { ...content, text: plain(content.text) };
    else if (content.kind === 'unavailable') displayContent = { ...content, reason: plain(content.reason) };
    else if (content.kind === 'pattern-matches') {
        reserve(1024);
        displayContent = { ...content, report: { ...content.report,
            rules: rows(content.report.rules, rule => ({ ...rule, id: plain(rule.id), pattern: plain(rule.pattern), ...(rule.label !== undefined ? { label: plain(rule.label) } : {}) })),
            occurrences: rows(content.report.occurrences, occurrence => ({ ...occurrence, ruleId: plain(occurrence.ruleId), text: plain(occurrence.text) })),
            diagnostics: rows(content.report.diagnostics, diagnostic => ({ ...diagnostic, message: plain(diagnostic.message) })),
        } };
    } else if (content.kind === 'text-filter') {
        reserve(1024);
        displayContent = { ...content, report: { ...content.report,
            units: rows(content.report.units, unit => ({ ...unit, text: plain(unit.text) })),
            diagnostics: rows(content.report.diagnostics, diagnostic => ({ ...diagnostic, message: plain(diagnostic.message) })),
        } };
    }
    const messages = content.kind === 'messages' ? content.messages : null;
    const texts = messages ? messages.map(message => message.text) : content.kind === 'text' ? [content.text] : [];
    for (let index = 0; index < texts.length; index++) {
        const message = messages?.[index];
        // Escaping expands source metadata by at most six bytes per source byte.
        const chrome = message ? 1024 + ['id', 'role', 'speaker', 'timestamp'].reduce((sum, field) => sum + size(message[field] ?? '') * 6, 0) : 0;
        if (chrome > maxHtmlBytes - htmlBytes) { truncated = true; break; }
        htmlBytes += chrome;
        const part = renderPreviewMarkdown(texts[index], window, { maxHtmlBytes: maxHtmlBytes - htmlBytes });
        htmlBytes += size(part.html); parts.push(part);
        omittedFormatting ||= part.omittedFormatting;
        if (part.truncated) { truncated = true; break; }
    }
    const result = Object.freeze({ parts: Object.freeze(parts), displayContent, htmlBytes, truncated, omittedFormatting, omittedMessages: messages ? messages.length - parts.length : 0 });
    if (immutable) {
        policies ??= new Map(); policies.set(maxHtmlBytes, result); state.contentCache.set(content, policies);
    }
    return result;
}
