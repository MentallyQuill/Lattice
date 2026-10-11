import { installMock } from '../mock.js';
import { canvasWorkflow } from './native-fixture.mjs';
let hostCss = 'synthetic';
if (new URLSearchParams(location.search).has('hostCss')) {
    const css = await (await fetch('/__host/style.css')).text(), style = document.createElement('style');
    hostCss = css.startsWith('/* lattice-host-css:current */') ? 'current' : 'fallback';
    style.dataset.hostCss = hostCss; style.textContent = css;
    document.head.insertBefore(style, document.querySelector('link[rel="stylesheet"]'));
    document.getElementById('synthetic-host-css')?.remove();
}
const context = installMock();
// Exercise startup with no saved Lattice namespace; do not pick a fixture here.
delete context.extensionSettings.lattice;
const freshSettingsAbsent = !Object.hasOwn(context.extensionSettings, 'lattice');
let providerCalls = 0;
context.ConnectionManagerRequestService = { getProfile: () => null, sendRequest() { providerCalls++; throw Error('Browser fixtures must never request a model.'); } };
context.ChatCompletionService = { processRequest() { providerCalls++; throw Error('Browser fixtures must never request a model.'); } };
// Browser fixtures exercise the public host events used by workflow freshness.
const listeners = new Map();
context.eventSource = {
    on(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeListener(name, callback) { listeners.get(name)?.delete(callback); },
    async emit(name, ...args) { for (const callback of [...(listeners.get(name) ?? [])]) await callback(...args); },
};
context.eventTypes = new Proxy({}, { get: (_, key) => key });
context.SlashCommandParser = { addCommandObject() {} }; context.SlashCommand = { fromProps: value => value };
const toasts = [];
globalThis.toastr = Object.fromEntries(['info', 'success', 'warning', 'error'].map(type => [type, message => toasts.push({ type, message })]));
const version = (await (await fetch('/manifest.json')).json()).version;
const S = await import(`/src/state.js?v=${version}`);
const { Canvas } = await import(`/src/canvas.js?v=${version}`);
let canvas;
const setGraph = Canvas.prototype.setGraph;
Canvas.prototype.setGraph = function (graph) { canvas = this; return setGraph.call(this, graph); };
const UI = await import(`/src/ui.js?v=${version}`);
const H = await import(`/src/history.js?v=${version}`);
const { operationDefaults } = await import(`/src/workflow/catalog.js?v=${version}`);
const { validateGraphStructure } = await import(`/src/workflow/contracts.js?v=${version}`);
await import(`/index.js?v=${version}`);
window.lattice.open();
const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
await settle();
async function activate(graph, options = {}) {
    const checked = validateGraphStructure(graph); if (!checked.ok) throw Error(JSON.stringify(checked.error));
    S.activateWorkflow(graph, { clean: true, ...options }); S.save(); UI.refreshIfOpen(); await settle();
    await settle(); return Object.keys(graph.nodes);
}
window.canvasHarness = {
    context, S, UI, H, toasts, version, freshSettingsAbsent, hostCss, providerCalls: () => providerCalls, activate,
    get canvas() { return canvas; },
    // Native drawing tables are detached; fixture edits must reach the saved
    // root. Standalone Canvas-only fixtures retain their direct graph fallback.
    get graph() { return S.activeWorkflow() ?? canvas.graph; },
    get selection() { return [...canvas.multi]; },
    async reset(count = 3, columns = 3) {
        const g = canvasWorkflow(operationDefaults, count, columns);
        await activate(g);
        await settle();
        Object.assign(canvas.view, { x: 0, y: 0, zoom: 1 }); canvas.applyTransform();
        return Object.keys(g.nodes);
    },
    async view(view) { Object.assign(canvas.view, view); canvas.applyTransform(); await settle(); },
    settle,
};
