import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { compiled } from './helpers/svelte-compile.mjs';
import { renderPreviewMarkdown, renderReadableMarkdown } from '../src/ui/preview-markdown.js';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
const window = dom.window;
const bytes = text => new TextEncoder().encode(text).byteLength;
const fragment = html => { const template = window.document.createElement('template'); template.innerHTML = html; return template.content; };

test('preserves wording and punctuation while rendering supported prose structures', () => {
    const text = '# Heading\n\n"Words" -- ... *emphasis* **strong** ~~removed~~.\n\n> Quote\n\n1. one\n2. two\n\n- item\n\n```js\nconst x = "<tag>";\n```\n\n| A | B |\n|---|---|\n| one | two |\n\n<details open><summary>More</summary><p>Details</p></details>';
    const result = renderPreviewMarkdown(text, window);
    const content = fragment(result.html);
    for (const tag of ['h1', 'p', 'em', 'strong', 's', 'blockquote', 'ol', 'ul', 'li', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'details', 'summary']) assert.ok(content.querySelector(tag), tag);
    assert.match(content.textContent, /"Words" -- \.\.\./);
    assert.equal(content.querySelector('code').textContent, 'const x = "<tag>";\n');
    assert.equal(content.querySelector('details').hasAttribute('open'), true);
    assert.equal(result.truncated, false);
    assert.equal(fragment(renderPreviewMarkdown('3. item', window).html).querySelector('ol').getAttribute('start'), '3');
    assert.equal(renderPreviewMarkdown('https://example.test', window).html.includes('<a'), false, 'plain URLs do not get linkified');
});

test('removes executable and resource-bearing HTML and exposes inert resource descriptions', () => {
    const text = '<script>alert(1)</script><style>p{color:red}</style><p style="color:red" class="x" id="x" name="x" onclick="alert(1)">Hello</p><img src="https://example.test/pixel" alt="Picture <caption>" onerror="alert(1)"><iframe src="https://example.test">Frame</iframe><video src="https://example.test"><source src="https://example.test"></video><audio src="https://example.test"></audio><object data="https://example.test">Object</object><embed src="https://example.test"><svg><a href="javascript:alert(1)">SVG</a></svg><math><mi>x</mi></math><form><input name="x"></form><link rel="stylesheet" href="https://example.test"><div href="https://example.test" title="no" open start="4">End</div>';
    const result = renderPreviewMarkdown(text, window);
    const content = fragment(result.html);
    assert.equal(content.querySelector('script,style,img,iframe,video,audio,source,object,embed,svg,math,form,input,link'), null);
    for (const element of content.querySelectorAll('*')) for (const attribute of element.attributes) assert.ok(!/^(on|style$|class$|id$|name$|src|data$)/i.test(attribute.name), attribute.name);
    assert.equal(content.querySelector('div').attributes.length, 0, 'allowlisted attributes are restricted to their owning tags');
    assert.match(content.textContent, /Picture <caption>/);
    assert.match(content.textContent, /omitted/i);
    assert.equal(result.omittedFormatting, true);
    assert.equal(result.html.includes('onerror'), false);
});

test('allows only controlled explicit http https and mailto links', () => {
    const blocked = ['javascript:alert(1)', 'java&#x73;cript:alert(1)', 'data:text/html,a', 'file:///tmp/a', '/relative', 'relative', '//example.test', 'codex://action', 'app://action', 'https:relative', 'https://example.test/\u0000bad'];
    for (const href of blocked) {
        const content = fragment(renderPreviewMarkdown(`<a href="${href}" target="self" rel="opener">Link</a>`, window).html);
        assert.equal(content.querySelector('a').hasAttribute('href'), false, href);
    }
    for (const href of ['http://example.test/a', 'https://example.test/a', 'mailto:person@example.test']) {
        const link = fragment(renderPreviewMarkdown(`<a href="${href}" title="Title" onclick="evil()">Link</a>`, window).html).querySelector('a');
        assert.equal(link.getAttribute('href'), href);
        assert.equal(link.getAttribute('title'), 'Title');
        assert.equal(link.getAttribute('target'), '_blank');
        assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
        assert.equal(link.hasAttribute('onclick'), false);
    }
});

test('rerenders Unicode-safe shortened input into complete bounded markup', () => {
    const text = ('- **界😀**\n').repeat(20000);
    const result = renderPreviewMarkdown(text, window);
    assert.equal(result.truncated, true);
    assert.ok(bytes(result.html) <= 262144);
    assert.match(result.html, /<\/ul>\n$/);
    assert.equal(fragment(result.html).querySelectorAll('li').length > 0, true);
    assert.equal(result.html.includes('\ufffd'), false);
    assert.equal(/\p{Surrogate}/u.test(result.html), false);
    const tiny = renderPreviewMarkdown('😀界😀界', window, { maxHtmlBytes: 18 });
    assert.ok(bytes(tiny.html) <= 18);
    assert.equal(tiny.html.includes('\ufffd'), false);
    assert.match(tiny.html, /<\/p>\n$/);
    assert.equal(renderPreviewMarkdown('x', window, { maxHtmlBytes: 0 }).html, '');
});

test('shares the complete representation budget across multiple messages and caches immutable content', () => {
    const text = ('**界😀** ').repeat(9000);
    const content = Object.freeze({ kind: 'messages', messages: Object.freeze(Array.from({ length: 3 }, (_, index) => Object.freeze({ id: String(index), role: 'assistant', text, truncated: false }))), omittedMessages: 0, truncated: false });
    const result = renderReadableMarkdown(content, window);
    assert.ok(result.parts[0].html.includes('<strong>'));
    assert.equal(result.truncated, true);
    assert.ok(result.htmlBytes <= 262144);
    assert.ok(result.parts.reduce((sum, part) => sum + bytes(part.html), 0) < 262144);
    assert.equal(renderReadableMarkdown(content, window), result, 'status-only reuse preserves rendering identity');
    assert.notEqual(renderReadableMarkdown(content, window, { maxHtmlBytes: 10000 }), result);
    assert.equal(content.messages[0].text, text, 'render shortening never changes copy text');
});

for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: window[key] });
globalThis.window = window; globalThis.document = window.document;
const { mount, unmount, flushSync } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
async function fixture(content, callbacks = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-readable-'));
    const host = document.createElement('div'); document.body.append(host);
    let component;
    try {
        const leaf = await compiled('ReadableContent', directory, await readFile(new URL('../ui/ReadableContent.svelte', import.meta.url), 'utf8'));
        component = mount(leaf.component, { target: host, props: { content, ...callbacks } }); flushSync();
        return { host, async close() { await unmount(component); host.remove(); const rel = relative(resolve(tmpdir()), resolve(directory)); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(directory, { recursive: true, force: true }); } };
    } catch (error) { if (component) await unmount(component); host.remove(); await rm(directory, { recursive: true, force: true }); throw error; }
}
test('copies the exact underlying Markdown rather than normalized rendered DOM text', async () => {
    const text = '**Words**\n\n  spaces\tand "punctuation" --';
    const copied = [];
    const f = await fixture({ kind: 'text', text, truncated: false }, { onCopyText: value => copied.push(value) });
    try { assert.ok(f.host.querySelector('strong')); f.host.querySelector('button').click(); assert.deepEqual(copied, [text]); } finally { await f.close(); }
});

test('keeps ordered distinct messages with escaped metadata and exact message copy', async () => {
    const messages = [{ id: '<img src=x>', role: '<script>role</script>', text: '**first**', truncated: false }, { id: 'two', role: 'user', text: '', truncated: false }, { id: 'three', role: 'assistant', text: 'third\n\nbody', truncated: true }];
    const copied = [];
    const f = await fixture({ kind: 'messages', messages, omittedMessages: 2, snapshotOmittedMessages: 1, truncated: true }, { onCopyMessage: value => copied.push(value) });
    try {
        const nodes = [...f.host.querySelectorAll('[data-preview-message]')]; assert.equal(nodes.length, 3);
        assert.match(nodes[0].textContent, /<script>role<\/script>/); assert.equal(f.host.querySelector('img, script'), null);
        nodes[2].querySelector('button').click(); assert.deepEqual(copied, [messages[2]]);
        assert.match(f.host.textContent, /2.*omitted/i); assert.match(f.host.textContent, /1.*record/i);
    } finally { await f.close(); }
});

test('malformed namespace and parser-mutation payloads remain inert after DOM insertion', () => {
    const attacks = [
        '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
        '<svg><style><a id="</style><img src=x onerror=alert(1)>">',
        '<details ontoggle="alert(1)" open><summary id="x">More</summary><p aria-label="bad" data-x="bad">Safe</p></details>',
        '<p><iframe srcdoc="<script>alert(1)</script>"></iframe><a href="java\nscript:alert(1)">Bad</a></p>',
        '![Alt <caption>](https://example.test/pixel "Image title")',
    ];
    for (const attack of attacks) {
        const result = renderPreviewMarkdown(attack, window), content = fragment(result.html);
        assert.equal(content.querySelector('img,iframe,svg,math,script,style'), null);
        for (const element of content.querySelectorAll('*')) for (const attr of element.attributes) assert.ok(!/^(on|id$|name$|src|style$|data-|aria-)/i.test(attr.name), attr.name);
        assert.equal(result.omittedFormatting, true);
    }
});

test('bounds actual message DOM including metadata wrappers and reports hidden messages', async () => {
    const messages = Array.from({ length: 1000 }, (_, index) => ({ id: 'message-' + index, role: 'user', text: '', truncated: false }));
    const content = { kind: 'messages', messages, omittedMessages: 0, truncated: false };
    const f = await fixture(content, { onCopyMessage() {} });
    try {
        assert.ok(bytes(f.host.innerHTML) <= 262144, 'including message chrome and labels');
        assert.ok(f.host.querySelectorAll('[data-preview-message]').length < messages.length);
        assert.match(f.host.textContent, /messages omitted from this display/);
    } finally { await f.close(); }
});
