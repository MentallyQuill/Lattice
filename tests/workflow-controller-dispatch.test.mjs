import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<body><div id="chat"></div></body>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, CSS: { escape: s => s }, CustomEvent: dom.window.CustomEvent, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent });
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.toastr = { info() {}, warning() {}, success() {}, error() {} };
const { installMock } = await import('./mock.js');
const context = installMock({ settings: { graphs: {} } });
let lore = 0, snapshots = 0, tokens = 0;
context.getWorldInfoPrompt = async () => { lore++; return {}; };
context.getCharacterCardFields = () => { snapshots++; return {}; };
context.getTokenCountAsync = async () => { tokens++; return 1; };
const state = await import('../src/state.js');
const { starterGraph } = await import('../src/workflow/starters.js');
const { cloneWorkflowDocument } = await import('../src/workflow/document.js');
const UI = await import('../src/ui.js');
for (const schema of [3, 99]) {
    const graph = cloneWorkflowDocument(starterGraph('native-guidance')).data;
    graph.schema = schema;
    if (schema === 99) graph.nodes.legacy = { id: 'legacy', type: 'generate', title: 'Unsupported old block', x: 0, y: 0 };
    const before = structuredClone(graph);
    state.activateWorkflow(graph, { clean: true });
    UI.open();
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(lore, 0, `schema ${schema} controller never gathers legacy lore`);
    assert.equal(snapshots, 0, `schema ${schema} controller never gathers legacy character snapshots`);
    assert.equal(tokens, 0, `schema ${schema} controller never tokenizes a legacy prompt`);
    assert.equal(document.querySelector('.pc-preview'), null);
    if (schema === 3) {
        assert.ok(document.querySelector('.pc-details-heading')?.textContent.includes('Details'), 'supported native execution opens the actual Details pane');
        assert.equal(document.querySelector('.pc-native-diagnostic'), null, 'supported native execution has no unsupported-version diagnostic');
    } else {
        const diagnostic = document.querySelector('.pc-native-diagnostic');
        assert.ok(diagnostic && !diagnostic.hidden && !diagnostic.closest('[hidden]'), 'unsupported native execution exposes an honest visible diagnostic');
        assert.match(diagnostic.textContent, /current|supported|schema/i);
    }
    assert.equal(Object.values(graph.nodes).some(node => node.type === 'output'), false);
    if (schema === 99) assert.equal(document.querySelectorAll('.pc-node').length, 0, 'Rejected documents never reach Canvas');
    assert.equal(state.activeWorkflow(), graph, 'UI retains the actual document root identity');
    assert.deepEqual(state.activeWorkflow(), before, 'native preview/context navigation cannot repair or mutate the document root');
    UI.close();
}
console.log('workflow-controller-dispatch: ok');
