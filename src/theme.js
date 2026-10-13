/** Lattice workspace themes and explicit user overrides. */

import { settings, save, safe } from './state.js?v=0.27.3';
import { ARTIFACT_KINDS, ARTIFACT_PIN_COLORS } from './ui/artifact-glyph.js?v=0.27.3';

/** The roles, in the order the editor lists them. */
export const ROLES = [
    { key: 'panel', label: 'Panel background', group: 'surface' },
    { key: 'block', label: 'Block background', group: 'surface' },
    { key: 'canvas', label: 'Canvas background', group: 'surface' },
    { key: 'border', label: 'Borders', group: 'surface' },
    { key: 'text', label: 'Text', group: 'surface' },
    { key: 'muted', label: 'Quiet text', group: 'surface' },
    { key: 'flow', label: 'Selection accent', group: 'meaning' },
    { key: 'warn', label: 'Warnings and skipped blocks', group: 'meaning' },
    { key: 'error', label: 'Errors and switched-off blocks', group: 'meaning' },
];
const MEANING = ROLES.filter(r => r.group === 'meaning').map(r => r.key);

/**
 * The look of a theme, apart from its colours. Each is a small choice, set on
 * the page as data attributes and CSS variables that style.css reads.
 */
export const STYLE_OPTIONS = {
    shape: { label: 'Shape', options: [['sharp', 'Sharp corners'], ['rounded', 'Rounded'], ['soft', 'Soft and round']] },
    font: { label: 'Font', options: [['theme', 'SillyTavern’s'], ['sans', 'Clean sans'], ['round', 'Friendly rounded'], ['serif', 'Book serif'], ['mono', 'Typewriter mono']] },
    grid: { label: 'Canvas', options: [['dots', 'Dots'], ['lines', 'Grid lines'], ['paper', 'Paper'], ['scan', 'Scanlines'], ['none', 'Plain']] },
    wires: { label: 'Wires', options: [['curved', 'Curved'], ['angled', 'Right angles']] },
    weight: { label: 'Lines', options: [['thin', 'Thin'], ['normal', 'Normal'], ['bold', 'Bold']] },
    header: { label: 'Block headers', options: [['tint', 'Quiet'], ['strip', 'Coloured by type']] },
    depth: { label: 'Depth', options: [['flat', 'Flat'], ['soft', 'Soft shadow'], ['deep', 'Deep shadow'], ['glow', 'Glow']] },
};
const DEFAULT_STYLE = { shape: 'rounded', font: 'sans', grid: 'none', wires: 'curved', weight: 'normal', header: 'tint', depth: 'soft' };

const FONTS = {
    sans: `system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
    round: `Nunito, Quicksand, 'Varela Round', 'Segoe UI', system-ui, sans-serif`,
    serif: `'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif`,
    mono: `'Cascadia Mono', 'JetBrains Mono', Consolas, 'Courier New', ui-monospace, monospace`,
};
const RADII = { sharp: [2, 1, 3], rounded: [4, 3, 4], soft: [16, 10, 999] };
const WEIGHTS = { thin: [1, 1.6], normal: [1, 2.5], bold: [2, 3.5] };

/**
 * Built-in themes. Ember inherits selected SillyTavern tokens; the other
 * palettes use the approved comparison surfaces.
 */
export const PRESETS = {
    ember: {
        name: 'Ember', note: 'The approved neutral canvas and soft translucent cards, with SillyTavern surfaces, text and orange accent.',
        style: { ...DEFAULT_STYLE },
        colors: { panel: '#171717', block: 'rgba(40, 40, 40, 0.75)', canvas: '#0f0f0f', border: 'rgba(0, 0, 0, 0.5)', text: '#dcdcd2', muted: '#919191', flow: '#e18a24', warn: '#e3c341', error: '#e57676' },
    },
    lattice: {
        name: 'Lattice', note: 'Charcoal surfaces with SillyTavern quote color as their accent.',
        style: { ...DEFAULT_STYLE },
        colors: { panel: '#202220', block: '#191b19', canvas: '#292a28', border: '#41433e', text: '#e7e8e4', muted: '#aaa99e', flow: '#ffb554', warn: '#e3c341', error: '#e57676' },
    },
    ash: {
        name: 'Ash', note: 'Medium neutral gray surfaces and warm selection accents.',
        style: { ...DEFAULT_STYLE },
        colors: { panel: '#343434', block: '#292929', canvas: '#454545', border: '#646464', text: '#f0f0ec', muted: '#bfc0ba', flow: '#e18a24', warn: '#e3c341', error: '#e57676' },
    },
    graphite: {
        name: 'Graphite', note: 'Warm charcoal with raised cards.',
        style: { ...DEFAULT_STYLE },
        colors: { panel: '#242422', block: '#32322e', canvas: '#20201f', border: '#50504a', text: '#e9e9e2', muted: '#b2b2a8', flow: '#e18a24', warn: '#e3c341', error: '#e57676' },
    },
    slate: {
        name: 'Slate', note: 'Cool steel surfaces with warm selection accents.',
        style: { ...DEFAULT_STYLE },
        colors: { panel: '#262c34', block: '#2b323b', canvas: '#1e2329', border: '#4b5563', text: '#e5eaf0', muted: '#b0bac6', flow: '#e18a24', warn: '#e3c341', error: '#e57676' },
    },
    obsidian: {
        name: 'Obsidian', note: 'Near black surfaces and clear, warm signals.',
        style: { ...DEFAULT_STYLE },
        colors: { panel: '#121417', block: '#1b1e23', canvas: '#08090b', border: '#343a42', text: '#e4e7eb', muted: '#a5abb4', flow: '#e18a24', warn: '#e3c341', error: '#e57676' },
    },
    harbor: {
        name: 'Harbor', note: 'Blue and amber with the shared type shapes and patterned wires for colorblind-friendly connections.',
        accessible: true,
        style: { ...DEFAULT_STYLE },
        colors: { panel: '#17232d', block: '#233340', canvas: '#0e1820', border: '#657988', text: '#f2f5f7', muted: '#b9c8d2', flow: '#e69f00', warn: '#f0e442', error: '#ffb4a2' },
        pins: { context: '#f0e442', guidance: '#cc79a7', draft: '#7fd8c5', patches: '#ffffff', text: '#e69f00', data: '#56b4e9', candidate: '#cbd5e1' },
    },
    signal: {
        name: 'Signal', note: 'High contrast grayscale with the shared type shapes and patterned wires for colorblind-friendly connections.',
        accessible: true,
        style: { ...DEFAULT_STYLE },
        colors: { panel: '#151515', block: '#262626', canvas: '#080808', border: '#929292', text: '#ffffff', muted: '#d0d0d0', flow: '#ffffff', warn: '#ffffff', error: '#ffffff' },
        pins: { context: '#f2f2f2', guidance: '#f2f2f2', draft: '#f2f2f2', patches: '#f2f2f2', text: '#f2f2f2', data: '#f2f2f2', candidate: '#f2f2f2' },
    },
};



export const DEFAULT_PRESET = 'ember';
const EMBER_HOST_ROLES = { panel: 'SmartThemeBlurTintColor', text: 'SmartThemeBodyColor', muted: 'SmartThemeEmColor', border: 'SmartThemeBorderColor', flow: 'SmartThemeQuoteColor' };

/* ------------------------------------------------------------------ */
/* colour maths                                                        */
/* ------------------------------------------------------------------ */

export function parseColor(c) {
    const s = String(c ?? '').trim();
    let m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
    m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
    if (m) {
        const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return { r: +m[1], g: +m[2], b: +m[3], a };
    }
    return null;
}

export const toHex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Put a see-through colour over the colour behind it. */
function over(top, under) {
    const a = top.a ?? 1;
    return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 };
}

function luminance({ r, g, b }) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Perceptual distance between two colours (CIE76 in Lab). Below ~15 they are hard to tell apart. */
export function distance(a, b) {
    const lab = ({ r, g, b }) => {
        const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const R = f(r), G = f(g), B = f(b);
        const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
        const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
        const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
        const t = (v) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
        return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))];
    };
    const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b);
    return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Darken or lighten a colour, keeping its hue, until it reads against every background. */
export function fitContrast(color, bg, target = 3) {
    const backgrounds = Array.isArray(bg) ? bg : [bg];
    const score = c => Math.min(...backgrounds.map(surface => contrast(c, surface)));
    let best = color, bestScore = score(color);
    if (bestScore >= target) return color;
    const black = { r: 0, g: 0, b: 0 }, white = { r: 255, g: 255, b: 255 };
    const darker = score(black) > score(white);
    for (const darken of [darker, !darker]) {
        let c = { ...color };
        for (let i = 0; i < 24; i++) {
            c = darken
                ? { r: c.r * 0.9, g: c.g * 0.9, b: c.b * 0.9 }
                : { r: c.r + (255 - c.r) * 0.12, g: c.g + (255 - c.g) * 0.12, b: c.b + (255 - c.b) * 0.12 };
            const candidate = { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) };
            const ratio = score(candidate);
            if (ratio >= target) return candidate;
            if (ratio > bestScore) { best = candidate; bestScore = ratio; }
        }
        const endpoint = darken ? black : white, ratio = score(endpoint);
        if (ratio >= target) return endpoint;
        if (ratio > bestScore) { best = endpoint; bestScore = ratio; }
    }
    return best;
}

/* ------------------------------------------------------------------ */
/* the current theme                                                   */
/* ------------------------------------------------------------------ */

function store() {
    const ui = (settings().ui ??= {});
    ui.theme ??= { preset: DEFAULT_PRESET, colors: {}, style: {} };
    ui.theme.colors ??= {};
    ui.theme.style ??= {};
    if (!Object.hasOwn(PRESETS, ui.theme.preset)) ui.theme.preset = DEFAULT_PRESET;
    return ui.theme;
}

/** The chosen preset plus your own changes. */
export function currentTheme() {
    const t = store();
    const p = PRESETS[t.preset];
    const colors = { ...p.colors, ...t.colors };
    if (t.preset === 'ember') for (const [role, token] of Object.entries(EMBER_HOST_ROLES)) if (!Object.hasOwn(t.colors, role)) {
        const inherited = safe(() => getComputedStyle(document.documentElement).getPropertyValue('--' + token).trim());
        if (parseColor(inherited)) colors[role] = inherited;
    }
    return {
        preset: t.preset,
        colors,
        custom: { ...t.colors },
        style: { ...DEFAULT_STYLE, ...p.style, ...t.style },
        customStyle: { ...t.style },
    };
}

export function setPreset(key, { keepCustom = false } = {}) {
    const t = store();
    t.preset = Object.hasOwn(PRESETS, key) ? key : DEFAULT_PRESET;
    if (!keepCustom) { t.colors = {}; t.style = {}; }
    save();
    applyTheme();
}

export function setColor(role, value) {
    const t = store();
    if (value === null || value === undefined || value === '') delete t.colors[role];
    else t.colors[role] = value;
    save();
    applyTheme();
}

/** Change one part of the look (shape, font, ...). null goes back to the preset's. */
export function setStyle(part, value) {
    const t = store();
    const opts = STYLE_OPTIONS[part]?.options.map(o => o[0]) ?? [];
    if (value === null || value === undefined || !opts.includes(value) || value === PRESETS[t.preset].style?.[part]) delete t.style[part];
    else t.style[part] = value;
    save();
    applyTheme();
}

/**
 * Composite translucent surfaces over the page to measure what is visible.
 */
function measuredSurfaces(colors) {
    const doc = globalThis.document;
    const probe = (prop, fallback) => {
        if (colors[prop]) return parseColor(colors[prop]);
        const v = safe(() => getComputedStyle(doc.documentElement).getPropertyValue(`--pc-${prop}`).trim());
        return parseColor(v) ?? parseColor(fallback);
    };
    const page = safe(() => parseColor(getComputedStyle(doc.body).backgroundColor)) ?? parseColor('#202024');
    const base = page && page.a > 0 ? page : parseColor('#202024');
    const panel = over(probe('panel', 'rgba(20,20,24,0.97)') ?? parseColor('#141418'), base);
    const block = over(probe('block', 'rgba(40,40,48,0.96)') ?? parseColor('#282830'), panel);
    const canvas = over(probe('canvas', '#202024') ?? parseColor('#202024'), base);
    return { panel, block, canvas };
}

/**
 * Put the theme on the page. Meaning colours are then checked against the
 * backgrounds they sit on, and nudged darker (or lighter) if they would be
 * hard to read, so a colour picked on a dark theme still works on a light one.
 */
export function applyTheme() {
    const doc = globalThis.document;
    if (!doc?.documentElement) return;
    const { colors, style, preset, custom } = currentTheme();
    const root = doc.documentElement.style;
    const data = doc.documentElement.dataset;
    data.pcPreset = preset;
    data.pcAccessible = PRESETS[preset].accessible ? '1' : '0';
    for (const kind of [...ARTIFACT_KINDS, 'findings']) root.removeProperty('--pc-kind-' + kind);

    // The look: data attributes for style.css, and a few sizes as variables.
    for (const part of Object.keys(STYLE_OPTIONS)) data[`pc${part[0].toUpperCase()}${part.slice(1)}`] = style[part];
    // A theme with its own surfaces also styles SillyTavern's buttons and
    // fields inside the panel, which otherwise keep SillyTavern's colours.
    data.pcOwn = '1';
    const [r, rSm, rChip] = RADII[style.shape] ?? RADII.rounded;
    root.setProperty('--pc-r', `${r}px`);
    root.setProperty('--pc-r-sm', `${rSm}px`);
    root.setProperty('--pc-r-chip', `${rChip}px`);
    const [bw, ww] = WEIGHTS[style.weight] ?? WEIGHTS.normal;
    root.setProperty('--pc-bw', `${bw}px`);
    root.setProperty('--pc-wire-w', String(ww));
    if (FONTS[style.font]) root.setProperty('--pc-font', FONTS[style.font]);
    else root.removeProperty('--pc-font');
    for (const r of ROLES) root.removeProperty(`--pc-${r.key}`);
    root.removeProperty('--pc-panel-solid');
    root.removeProperty('--pc-on-accent');
    for (const key of ['field', 'control', 'accent']) root.removeProperty('--pc-' + key);

    for (const r of ROLES) if (colors[r.key]) root.setProperty(`--pc-${r.key}`, colors[r.key]);
    if (colors.panel) root.setProperty('--pc-panel-solid', colors.panel);
    if (preset === 'ember') {
        for (const [role, token] of Object.entries(EMBER_HOST_ROLES)) if (!Object.hasOwn(custom, role)) root.setProperty('--pc-' + role, `var(--${token}, ${PRESETS.ember.colors[role]})`);
        if (!Object.hasOwn(custom, 'panel')) root.setProperty('--pc-panel-solid', `var(--SmartThemeBlurTintColor, ${PRESETS.ember.colors.panel})`);
        root.setProperty('--pc-field', 'var(--SmartThemeUserMesBlurTintColor, rgba(30, 30, 30, 0.9))');
        root.setProperty('--pc-control', 'var(--SmartThemeBotMesBlurTintColor, rgba(30, 30, 30, 0.9))');
    }

    const { panel, block, canvas } = measuredSurfaces(colors);
    const light = luminance(panel) > 0.4;
    // Menus and popovers need a solid background. When the panel colour comes
    // from SillyTavern it is often see-through, so use what it looks like.
    if (!colors.panel) root.setProperty('--pc-panel-solid', toHex(panel));
    doc.documentElement.dataset.pcLight = light ? '1' : '0';

    // Keep the recall status green readable on custom and host-derived surfaces.
    root.setProperty('--pc-recall-ready-fit', toHex(fitContrast(parseColor('#8fc878'), [panel, block], 3)));
    // Gaea-style action colors belong to icons; keep idle and hovered rows readable.
    const menuText = parseColor(colors.text) ?? parseColor(PRESETS[preset].colors.text);
    const menuHover = over({ ...menuText, a: (menuText.a ?? 1) * 0.09 }, panel);
    for (const [tone, color] of Object.entries({ blue: '#56b4e9', yellow: '#e3c341', green: '#8fc878', purple: '#b49af2', teal: '#7fd8c5', red: colors.error })) {
        const base = parseColor(preset === 'signal' ? colors.text : color) ?? parseColor(PRESETS[preset].colors[preset === 'signal' ? 'text' : 'error']);
        root.setProperty('--pc-workspace-icon-' + tone, toHex(fitContrast(base, [panel, menuHover], 3)));
    }
    for (const key of MEANING) {
        if (preset === 'ember' && key === 'flow' && !Object.hasOwn(custom, key)) continue;
        const c = parseColor(colors[key]);
        if (!c) continue;
        const fitted = fitContrast(c, [panel, block], 3);
        if (fitted !== c) root.setProperty(`--pc-${key}`, toHex(fitted));
    }
    for (const [kind, color] of Object.entries({ ...ARTIFACT_PIN_COLORS, ...PRESETS[preset].pins })) {
        const c = parseColor(color);
        const fitted = fitContrast(c, [block, canvas], 3);
        root.setProperty('--pc-kind-' + kind, fitted === c ? color : toHex(fitted));
    }
    if (preset === 'lattice' && !currentTheme().custom.flow) {
        const quote = safe(() => getComputedStyle(doc.documentElement).getPropertyValue('--SmartThemeQuoteColor').trim());
        if (quote && parseColor(quote)) root.setProperty('--pc-flow', quote);
    }
    root.setProperty('--pc-accent', root.getPropertyValue('--pc-flow') || 'var(--SmartThemeQuoteColor, #e18a24)');
    // Filled controls need ink that contrasts with the effective accent,
    // including a host quote color or a contrast-adjusted custom selection.
    const accent = over(parseColor(root.getPropertyValue('--pc-flow')) ?? parseColor(colors.flow) ?? parseColor(PRESETS[preset].colors.flow), panel);
    const darkInk = parseColor('#1a1a1e'), lightInk = parseColor('#ffffff');
    const ink = contrast(darkInk, accent) >= contrast(lightInk, accent) ? darkInk : lightInk;
    root.setProperty('--pc-on-accent', toHex(fitContrast(ink, accent, 4.5)));
    // Run rows use fields/controls, not card fills. Fit their small meaning text
    // against those surfaces so even gray-text light host themes stay readable.
    const hostSurface = token => parseColor(safe(() => getComputedStyle(doc.documentElement).getPropertyValue('--' + token).trim())) ?? parseColor('rgba(30, 30, 30, 0.9)');
    const runField = preset === 'ember' ? over(hostSurface('SmartThemeUserMesBlurTintColor'), panel) : over({ ...menuText, a: .05 }, block);
    const runControl = preset === 'ember' ? over(hostSurface('SmartThemeBotMesBlurTintColor'), panel) : over({ ...menuText, a: .07 }, block);
    for (const [role, color] of Object.entries({ success: '#a4c2ad', error: colors.error, warning: colors.warn, flow: toHex(accent) })) {
        const base = preset === 'signal' ? menuText : parseColor(color) ?? parseColor(PRESETS[preset].colors[role === 'warning' ? 'warn' : 'error']);
        root.setProperty('--pc-run-' + role + '-text', toHex(fitContrast(base, [panel, runField, runControl], 4.5)));
    }
    // Notify the workspace after explicit theme changes.
    safe(() => doc.dispatchEvent(new CustomEvent('pc-theme')));
}

/** The font stack a look uses, for showing a preset's name in its own font. */
export function fontFor(style) {
    return FONTS[style?.font] ?? null;
}

/**
 * Things worth knowing about a theme: meaning colours too close to tell
 * apart, and colours hard to read on their background. Advice only.
 */
export function themeWarnings(colors = currentTheme().colors) {
    const out = [];
    const label = (k) => ROLES.find(r => r.key === k)?.label ?? k;
    const parsed = Object.fromEntries(MEANING.map(k => [k, parseColor(colors[k])]).filter(([, v]) => v));
    const keys = Object.keys(parsed);
    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            const d = distance(parsed[keys[i]], parsed[keys[j]]);
            if (d < 15) out.push({ kind: 'similar', roles: [keys[i], keys[j]], text: `"${label(keys[i])}" and "${label(keys[j])}" are very close. They will be hard to tell apart.` });
        }
    }
    const text = parseColor(colors.text), panel = parseColor(colors.panel), block = parseColor(colors.block);
    if (text && panel && contrast(text, panel) < 4.5) out.push({ kind: 'contrast', roles: ['text', 'panel'], text: 'The text is hard to read on the panel background.' });
    if (text && block && contrast(text, block) < 4.5) out.push({ kind: 'contrast', roles: ['text', 'block'], text: 'The text is hard to read on the block background.' });
    return out;
}

/* ------------------------------------------------------------------ */
/* sharing                                                             */
/* ------------------------------------------------------------------ */

export function exportTheme(name = null) {
    const { preset, custom, customStyle } = currentTheme();
    const changed = Object.keys(custom).length + Object.keys(customStyle).length;
    return JSON.stringify({ latticeTheme: 1, name: name || PRESETS[preset].name + (changed ? ' (custom)' : ''), base: preset, colors: custom, style: customStyle });
}

/** @returns {{ok: boolean, reason?: string, name?: string}} */
export function importTheme(text) {
    let o;
    try { o = JSON.parse(String(text ?? '').trim()); } catch { return { ok: false, reason: 'That is not a Lattice theme. Paste the whole text you were given.' }; }
    if (!o || o.latticeTheme !== 1 || typeof o.colors !== 'object') return { ok: false, reason: 'That is not a Lattice theme.' };
    const colors = {};
    for (const r of ROLES) {
        const v = o.colors[r.key];
        if (v !== undefined && parseColor(v)) colors[r.key] = toHex(parseColor(v));
    }
    const style = {};
    for (const [part, def] of Object.entries(STYLE_OPTIONS)) {
        const v = o.style?.[part];
        if (def.options.some(x => x[0] === v)) style[part] = v;
    }
    const t = store();
    const base = o.base;
    t.preset = Object.hasOwn(PRESETS, base) ? base : DEFAULT_PRESET;
    t.colors = colors;
    t.style = style;
    save();
    applyTheme();
    return { ok: true, name: String(o.name || 'Imported theme') };
}
