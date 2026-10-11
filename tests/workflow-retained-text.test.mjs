import assert from 'node:assert/strict';
import test from 'node:test';
import { recognizeRecordedText } from '../src/workflow/retained-text.js';
import { applyTextModifiers } from '../src/workflow/modifiers.js';
import { formatRecordedTextModifiers } from '../src/workflow/recording.js';
import { projectRecordedPreview } from '../src/ui/recorded-preview.js';

const captured = value => ({ kind: 'text', format: 'structured', value });

test('retained Text recognition recomputes canonical modifier metadata without presentation', () => {
    const modified = applyTextModifiers(' raw ', [{ id: 'trim', type: 'trim', version: 1, enabled: true, settings: { edges: 'both' } }]);
    assert.equal(modified.ok, true);
    const result = recognizeRecordedText(captured({ kind: 'text', text: 'raw', modifiers: { rawText: ' raw ', trace: modified.data.trace } }));
    assert.deepEqual(result, { text: 'raw', rawText: ' raw ', trace: [{ id: 'trim', type: 'trim', version: 1, settings: { edges: 'both' }, beforeLength: 5, afterLength: 3, changed: true }], hasModifiers: true });
    assert.ok(Object.isFrozen(result.trace));
    assert.deepEqual(recognizeRecordedText(captured({ kind: 'text', text: '' })), { text: '', rawText: '', trace: [], hasModifiers: false });
});

test('shared recognition rejects partial, malformed and mismatched metadata in both formatters', () => {
    const trace = [{ id: 'trim', type: 'trim', version: 1, settings: { edges: 'both' }, beforeLength: 5, afterLength: 3, changed: true }];
    const invalid = [
        { kind: 'text', format: 'json-prefix-text', text: '{"kind":"text"' },
        { kind: 'text', format: 'omitted', reason: 'limit' },
        { kind: 'data', format: 'structured', value: { kind: 'text', text: 'raw' } },
        captured({ kind: 'guidance', text: 'raw' }),
        captured({ kind: 'text', text: 'mismatched result', modifiers: { rawText: ' raw ', trace } }),
        captured({ kind: 'text', text: 'raw', modifiers: { rawText: ' raw ', trace: [{ ...trace[0], version: 2 }] } }),
        captured({ kind: 'text', text: 'raw', modifiers: { rawText: ' raw ', trace: [trace[0], , trace[0]] } }),
        captured({ kind: 'text', text: 'raw', modifiers: { rawText: ' raw ', trace: Array.from({ length: 17 }, (_, i) => ({ ...trace[0], id: 'trim' + i })) } }),
        captured({ kind: 'text', text: 'x'.repeat(100001) }),
        captured({ kind: 'text', text: 'raw', modifiers: { rawText: 'x'.repeat(100001), trace: [] } }),
    ];
    for (const artifact of invalid) {
        assert.equal(recognizeRecordedText(artifact), null);
        assert.deepEqual(formatRecordedTextModifiers(artifact), []);
        assert.ok(projectRecordedPreview(artifact).sections.every(section => section.recordedRawText === undefined));
    }
    let reads = 0;
    const metadata = { rawText: ' raw ' };
    Object.defineProperty(metadata, 'trace', { enumerable: true, get() { reads++; throw Error('getter'); } });
    const accessor = captured({ kind: 'text', text: 'raw', modifiers: metadata });
    assert.equal(recognizeRecordedText(accessor), null);
    assert.deepEqual(formatRecordedTextModifiers(accessor), []);
    assert.ok(projectRecordedPreview(accessor).sections.every(section => section.recordedRawText === undefined));
    assert.equal(reads, 0);
});

test('shared canonical trace ignores untrusted lengths while formatter presentation stays separate', () => {
    const artifact = captured({ kind: 'text', text: 'raw', modifiers: { rawText: ' raw ', trace: [{ id: 'trim', type: 'trim', version: 1, settings: { edges: 'both' }, beforeLength: 999, afterLength: 999, changed: false }] } });
    const legacy = formatRecordedTextModifiers(artifact), projected = projectRecordedPreview(artifact).sections;
    assert.equal(legacy[0].recordedModifierTrace[0].beforeLength, 5);
    assert.equal(legacy[0].recordedModifierTrace[0].afterLength, 3);
    assert.equal(legacy[0].recordedModifierTrace[0].changed, true);
    assert.deepEqual(projected[0].recordedModifierTrace, legacy[0].recordedModifierTrace);
    assert.equal(legacy[0].text, 'raw');
    assert.equal(projected[0].readable.text, 'raw');
    assert.equal(legacy[1].text, ' raw ');
    assert.equal(projected[1].readable.text, ' raw ');
    assert.ok(!legacy[2].text.includes('\n'));
    assert.ok(projected[2].readable.text.includes('\n'));
    assert.deepEqual(JSON.parse(projected[2].readable.text), JSON.parse(legacy[2].text));
});
