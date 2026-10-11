import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPreviewMode, writePreviewMode } from '../src/ui/preview-preferences.js';

test('mode reads accept only the application-wide valid string and survive unavailable storage', () => {
    for (const value of [null, undefined, '', 'broken', '"source"', '{bad}', 'Readable']) assert.equal(readPreviewMode({ getItem: key => { assert.equal(key, 'lattice.workspace.preview.mode'); return value; } }), 'readable');
    for (const value of ['source', 'readable']) assert.equal(readPreviewMode({ getItem: () => value }), value);
    assert.equal(readPreviewMode(), 'readable');
    assert.equal(readPreviewMode({ getItem() { throw Error('disabled'); } }), 'readable');
});

test('mode writes only a mode string under one preference key without touching geometry or content', () => {
    const saved = new Map([['lattice.workspace.preview', 'geometry']]);
    const storage = { setItem(key, value) { saved.set(key, value); } };
    assert.equal(writePreviewMode(storage, 'source'), true);
    assert.deepEqual([...saved], [['lattice.workspace.preview', 'geometry'], ['lattice.workspace.preview.mode', 'source']]);
    assert.equal(writePreviewMode(storage, 'readable'), true);
    assert.equal(saved.get('lattice.workspace.preview.mode'), 'readable');
    assert.equal(writePreviewMode(storage, 'broken'), false);
    assert.equal(writePreviewMode(undefined, 'source'), false);
    assert.equal(writePreviewMode({ setItem() { throw Error('disabled'); } }, 'source'), false);
});
