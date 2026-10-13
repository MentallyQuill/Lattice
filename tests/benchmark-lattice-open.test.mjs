import assert from 'node:assert/strict';
import { parseOptions, assertReopenedContent } from '../tools/benchmark-lattice-open.mjs';
assert.throws(() => parseOptions(['--repeats=0']), /repeats/);
assert.throws(() => parseOptions(['--sizes=25,25']), /sizes/);
assert.throws(() => parseOptions(['--unexpected=x']), /Unsupported/);
assert.throws(() => parseOptions(['--source=one', '--source=two']), /repeated/);
assert.equal(parseOptions(['--repeats', '7']).repeats, 7);
assert.deepEqual(parseOptions([]).sizes, [25, 100, 250]);
console.log('Opening benchmark options pass');
// A prepared drawing can have the refreshed title but retain a stale detached section.
// The authored root is already current, so checking it alone cannot detect this failure.
const authored = { title: 'Changed while closed', sections: [{ text: 'Changed content while closed.' }] };
const staleDrawing = { title: authored.title, sections: [{ text: 'Synthetic rendering fixture.' }] };
assert.equal(staleDrawing.title, authored.title);
assert.throws(() => assertReopenedContent({ authoredSectionText: authored.sections[0].text, drawnSectionText: staleDrawing.sections[0].text }, 'changed'), /stale section/);
const currentDrawing = structuredClone(authored);
assert.doesNotThrow(() => assertReopenedContent({ authoredSectionText: authored.sections[0].text, drawnSectionText: currentDrawing.sections[0].text }, 'changed'));
assert.doesNotThrow(() => assertReopenedContent({ authoredSectionText: 'Synthetic rendering fixture.', drawnSectionText: 'Synthetic rendering fixture.' }, 'unchanged'));
console.log('Opening benchmark rejects stale detached content');
