import test from 'node:test';
import assert from 'node:assert/strict';
import * as preparation from '../src/ui/workspace-preparation.js?v=0.27.3';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.3';
import { nodeCard } from '../src/canvas/presentation.js?v=0.27.3';
import { makeLocalCopy } from '../src/workflow/definition-library.js?v=0.27.3';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
import { siblingWorkflow, nestedWorkflow } from './fixtures/workflow-prepared-fixture.mjs';

function editorFor(root, mode) {
    const workspace = preparation.prepareWorkspaceViews(root); assert.equal(workspace.ok, true, JSON.stringify(workspace.error));
    const library = mode === 'library' ? preparation.prepareLibraryViews(root.id, nestedWorkflow().definitions) : { ok: true, data: { navigation: [], preparedViews: [] } }; assert.equal(library.ok, true);
    const created = createGraphViewSession({ root, activationId: 'canvas-draw', navigation: [...workspace.data.navigation, ...library.data.navigation], preparedViews: [...workspace.data.preparedViews, ...library.data.preparedViews] }); assert.equal(created.ok, true);
    const session = created.data;
    if (mode === 'library') session.openLibrary(library.data.preparedViews.find(view => view.definitionRef.id === 'prepared-plan').definitionRef);
    if (mode === 'boundary') session.openInstance(['first/path']);
    return session.readEditor();
}
const privateRoot = () => { const copied = makeLocalCopy(siblingWorkflow(), { instancePath: ['first/path'], id: 'canvas-draw-owned' }); assert.equal(copied.ok, true); return copied.data.candidate; };
for (const [label, create, mode] of [
    ['mixed root', () => fixtureGraph('native-guidance'), 'root'],
    ['structured dynamic pins', () => fixtureGraph('structured-guidance'), 'root'],
    ['private boundary', privateRoot, 'boundary'],
    ['library body', () => fixtureGraph('structured-guidance'), 'library'],
]) test('Canvas-only drawing preserves full rendered cards and independent editor schemas for ' + label, () => {
    const root = create(), before = structuredClone(root), editor = editorFor(root, mode), savedDraw = structuredClone(editor.prepared.drawBase);
    const full = preparation.projectEditorDraw(editor), canvas = preparation.projectEditorDraw(editor, { canvasOnly: true });
    const { nativeCards: fullCards, ...fullRest } = full, { nativeCards: canvasCards, ...canvasRest } = canvas;
    assert.deepEqual(canvasRest, fullRest, 'all authored, attachment, binding and scope data remains unchanged');
    for (const [id, card] of Object.entries(fullCards)) {
        assert.equal(Object.hasOwn(card, 'controlDescriptors'), true); assert.equal(Object.hasOwn(card, 'defaults'), true);
        assert.equal(Object.hasOwn(canvasCards[id], 'controlDescriptors'), false, 'Canvas excludes editor control descriptors');
        assert.equal(Object.hasOwn(canvasCards[id], 'defaults'), false, 'Canvas excludes editor defaults');
        const { controlDescriptors, defaults, ...visual } = card;
        assert.deepEqual(canvasCards[id], visual);
        assert.deepEqual(nodeCard(canvas.nodes[id], { graph: canvas }), nodeCard(full.nodes[id], { graph: full }));
        assert.notEqual(card.controlDescriptors, editor.prepared.drawBase.nativeCards[id].controlDescriptors);
        assert.notEqual(card.defaults, editor.prepared.drawBase.nativeCards[id].defaults);
        card.controlDescriptors.local = { label: 'local schema' }; card.defaults.local = 'local default';
        canvas.nodes[id].title = 'local drawing title';
    }
    assert.deepEqual(editor.prepared.drawBase, savedDraw, 'Details retains its private complete immutable metadata');
    assert.deepEqual(root, before, 'both drawing variants remain detached from authored root/definitions');
    assert.equal(Object.isFrozen(fullCards[Object.keys(fullCards)[0]].defaults), false);
    assert.equal(Object.isFrozen(canvas.nodes[Object.keys(canvas.nodes)[0]]), false);
});

function nestedObjects(value) { return !value || typeof value !== 'object' ? 0 : 1 + Object.values(value).reduce((sum, child) => sum + nestedObjects(child), 0); }
test('Canvas-only drawing excludes repeated schemas before cloning 100 Compose cards', t => {
    const root = { id: 'canvas-schema-counts', schema: 3, runtime: 2, mode: 'native-unified', nodes: Object.fromEntries(Array.from({ length: 100 }, (_, index) => ['n' + index, { id: 'n' + index, type: 'workflow', operation: 'compose', operationVersion: 1, phase: 'pre', x: index * 10, y: 50, sections: [{ name: 'Content', text: 'Content ' + index }] }])), wires: {}, groups: {}, roles: {}, portals: {}, definitions: {} };
    const editor = editorFor(root, 'root'), clone = globalThis.structuredClone, copied = [];
    globalThis.structuredClone = function(value, ...options) {
        if (value?.nativeCards) copied.push({ bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength, objects: nestedObjects(value), schemas: Object.values(value.nativeCards).filter(card => Object.hasOwn(card, 'defaults') || Object.hasOwn(card, 'controlDescriptors')).length });
        return clone(value, ...options);
    };
    try { preparation.projectEditorDraw(editor); preparation.projectEditorDraw(editor, { canvasOnly: true }); }
    finally { globalThis.structuredClone = clone; }
    assert.equal(copied.length, 2); assert.equal(copied[0].schemas, 100); assert.equal(copied[1].schemas, 0, 'schemas are omitted from the actual structuredClone input');
    assert.ok(copied[1].bytes < copied[0].bytes); assert.ok(copied[1].objects <= copied[0].objects - 200);
    t.diagnostic(`drawing clone inputs: full=${copied[0].bytes} bytes/${copied[0].objects} objects; Canvas=${copied[1].bytes} bytes/${copied[1].objects} objects`);
    assert.ok(Object.values(editor.prepared.drawBase.nativeCards).every(card => Object.hasOwn(card, 'defaults') && Object.hasOwn(card, 'controlDescriptors')));
});
