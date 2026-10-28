import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { getNodeGuideExample } from '../src/workflow/node-guide-examples.js';
import { prepareExampleFileDefaults } from '../src/workflow/example-file-defaults.js';
import { resolveManagedFileNode } from '../src/workflow/managed-file-policy.js';

const fixtures = await import('../src/workflow/node-guide-fixtures.js').catch(() => ({}));
const expected = [
    ['read-file', 'lesson-16', ['campaign-notebook.txt']],
    ['write-file', 'lesson-17', ['accepted-scene-journal.json']],
    ['current-holder', 'lesson-20', ['accepted-item-holders.json']],
    ['prompted-memory', 'lesson-22', ['accepted-item-holders.json', 'rowan-item-memories.json']],
    ['story-clock', 'lesson-23', ['story-clock.json']],
    ['time-trigger', 'lesson-24', ['story-clock.json']],
    ['state', 'lesson-25', ['player-progression.json']],
    ['recall', 'lesson-26', ['rowan-moments.json']],
    ['effect-author', 'lesson-27', ['wand-holders.json', 'wand-effects.json', 'wand-outcomes.json']],
    ['stage-outcome', 'lesson-27', ['wand-holders.json', 'wand-effects.json', 'wand-outcomes.json']],
    ['actor-context', 'lesson-29', ['iris-moments.json']],
];

test('guide setup embeds exactly the shipped fixture bytes needed by its selected lesson', async () => {
    assert.equal(typeof fixtures.getNodeGuideFixtures, 'function');
    for (const [key, lessonId, names] of expected) {
        const example = getNodeGuideExample(key);
        assert.equal(example.id, lessonId);
        assert.deepEqual(example.fixtures?.map(fixture => fixture.name), names, key);
        assert.deepEqual(example.fixtures, fixtures.getNodeGuideFixtures(lessonId), key);
        for (const fixture of example.fixtures) {
            assert.match(fixture.name, /\.(?:txt|json)$/);
            assert.equal(fixture.content, await readFile(new URL(`../examples/remastered/fixtures/${fixture.name}`, import.meta.url), 'utf8'), `${key}: ${fixture.name}`);
            if (fixture.name.endsWith('.json')) JSON.parse(fixture.content);
        }
    }
});

test('fixture results are detached and omit unrelated setup or fabricated native memory', () => {
    assert.equal(typeof fixtures.getNodeGuideFixtures, 'function');
    const copy = fixtures.getNodeGuideFixtures('lesson-27'); copy[0].content = 'changed'; copy.push({ name: 'extra.json', content: '{}' });
    assert.equal(fixtures.getNodeGuideFixtures('lesson-27').length, 3);
    assert.notEqual(fixtures.getNodeGuideFixtures('lesson-27')[0].content, 'changed');
    const example = getNodeGuideExample('story-clock'); example.fixtures[0].content = 'changed';
    assert.notEqual(getNodeGuideExample('story-clock').fixtures[0].content, 'changed');
    assert.deepEqual(fixtures.getNodeGuideFixtures('unknown'), []);
    assert.equal(getNodeGuideExample('compose').fixtures, undefined);
    assert.equal(getNodeGuideExample('file-input').fixtures, undefined, 'The imported lore snapshot is already in the graph.');
    const memory = getNodeGuideExample('memory');
    assert.equal(memory.fixtures, undefined);
    assert.ok(memory.requirements.some(text => /accepted native episode/.test(text)));
    const reflection = getNodeGuideExample('actor-context');
    assert.ok(reflection.requirements.some(text => /prepares automatically as an empty array/.test(text)), 'The reflection targets prepare empty without manual JSON setup.');
    assert.equal(reflection.fixtures.some(f => f.name === 'rowan-moments.json'), false);
    const before = structuredClone(reflection.graph), workflowId = 'guide-private-reflections';
    const prepare = actorBindings => prepareExampleFileDefaults({ exampleId: reflection.id, nodes: reflection.graph.nodes, workflowId, actorBindings });
    const unselected = prepare({});
    assert.equal(unselected.ok, true, JSON.stringify(unselected));
    assert.deepEqual(unselected.data.actorChoices.map(choice => choice.sampleActorId).sort(), ['character:iris.png', 'character:rowan.png']);
    assert.deepEqual(unselected.data.initialTemplates, {}, 'No private sample contents are prepared before choosing the actors.');
    const selected = prepare({ 'character:rowan.png': 'character:ChosenRowan.png', 'character:iris.png': 'character:ChosenIris.png' });
    assert.equal(selected.ok, true, JSON.stringify(selected));
    assert.deepEqual(Object.values(selected.data.initialTemplates), ['[]', '[]'], 'Neither private file imports the populated Recall record or fabricated episodes.');
    const readers = selected.data.nodes.filter(entry => entry.node.operation === 'read-file');
    assert.equal(readers.length, 2);
    const targets = new Set();
    for (const entry of readers) {
        assert.deepEqual(entry.node.fileTarget.visibility, { kind: 'actor-private', actorId: entry.node.actorId });
        assert.equal(entry.node.fileTarget.managed, true);
        assert.equal(entry.node.fileTarget.bindingId, undefined, 'The sample carries no imported file grant.');
        assert.equal(entry.node.fileTarget.path, undefined, 'The sample carries no imported disk path.');
        const resolved = resolveManagedFileNode(entry.node, { workflowId, address: entry.address });
        assert.equal(resolved.ok, true, JSON.stringify(resolved));
        assert.deepEqual(JSON.parse(resolved.data.definition.content), []);
        assert.deepEqual(resolved.data.definition.visibility, entry.node.fileTarget.visibility);
        targets.add(resolved.data.definition.targetId);
    }
    assert.equal(targets.size, 2, 'Each selected actor owns a separate private file.');
    assert.deepEqual(reflection.graph, before, 'Automatic defaults leave the detached guide graph unchanged.');
});

test('event examples name auxiliary Extract and helper model connections required before running', () => {
    const itemUse = getNodeGuideExample('item-use-trigger');
    const itemCheck = itemUse.requirements.find(text => text.startsWith('Check these auxiliary model connections'));
    assert.ok(itemCheck, 'Item Use Trigger Extract mode needs its auxiliary connection in addition to native generation.');
    assert.match(itemCheck, /Item Use Trigger/);
    assert.match(itemCheck, /Decision.*helper role/);
    const wand = getNodeGuideExample('effect-author');
    const wandCheck = wand.requirements.find(text => text.startsWith('Check these auxiliary model connections'));
    assert.ok(wandCheck);
    for (const operation of ['Item Use Trigger', 'Effect Author', 'Decision', 'Revise Draft']) assert.ok(wandCheck.includes(operation), operation);
    assert.equal(wandCheck.includes('For Each ·'), false, 'For Each forwards requests through bound helper roles; it is not itself an auxiliary model operation.');
    assert.equal(getNodeGuideExample('compose').requirements.some(text => text.startsWith('Check these auxiliary model connections')), false);
});
