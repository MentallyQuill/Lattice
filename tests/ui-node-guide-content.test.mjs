import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OPERATIONS, describeOperation, operationDefaults } from '../src/workflow/catalog.js';
import { INTROSPECTION_OPERATIONS } from '../src/workflow/introspection/nodes.js';
import * as guide from '../src/ui/node-guide-content.js';

test('every selectable operation and structural node offers practical guide content', () => {
    const keys = [...Object.keys(OPERATIONS), 'note', 'comment', 'subgraph', 'subgraph-input', 'subgraph-output'];
    assert.equal(keys.length, 80);
    for (const key of keys) {
        const entry = guide.getNodeGuide(key);
        assert.ok(entry, `${key} has a guide`);
        assert.equal(entry.key, key);
        assert.ok(entry.title.trim());
        assert.ok(entry.summary.trim().length >= 25, `${key} explains its purpose`);
        assert.ok(entry.howTo.length >= 2 && entry.howTo.length <= 4, `${key} offers 2–4 practical steps`);
        assert.ok(entry.howTo.every(step => typeof step === 'string' && step.trim().length >= 20));
    }
    assert.equal(guide.getNodeGuide('unknown-operation'), null);
});

test('guide identity follows the operation and separates comment frames from notes', () => {
    assert.equal(guide.nodeGuideKey({ type: 'workflow', operation: 'compose', title: 'My prompt' }), 'compose');
    assert.equal(guide.nodeGuideKey({ type: 'note', commentFrame: true }), 'comment');
    assert.equal(guide.nodeGuideKey({ type: 'note', commentFrame: false }), 'note');
    assert.equal(guide.nodeGuideKey({ type: 'subgraph-input' }), 'subgraph-input');
    assert.equal(guide.nodeGuideKey({ type: 'unknown' }), null);
    assert.equal(guide.nodeGuideKey(null), null);
});

function effectiveDescriptions() {
    const graph = { schema: 3, runtime: 2, mode: 'native-unified' };
    const configured = {
        'for-each': { helper: { id: 'guide-helper', version: 1, semanticHash: 'sha256:' + 'a'.repeat(64) } },
        'time-trigger': { scheduleId: 'afternoon' },
        'actor-context': { actorId: 'actor-a' },
        'prompted-memory': { actorId: 'actor-a' },
        'item-mention-trigger': { actorId: 'actor-a', itemId: 'wand', aliases: ['wand'] },
        'item-use-trigger': { itemId: 'wand' },
        'scene-presence': { actorId: 'actor-a' },
        'character-direction': { actorId: 'actor-a' },
        'parse-effect-library': { libraryId: 'effects', revision: '1', itemId: 'wand' },
        recall: { actorId: 'actor-a', memorySetId: 'memories', keywords: ['signal'], eventTypes: ['item-use'] },
        'hotkey-arm': { actorId: 'actor-a', memorySetId: 'memories' },
    };
    const descriptions = [];
    for (const operation of Object.keys(OPERATIONS)) {
        const node = { type: 'workflow', ...operationDefaults(operation), ...configured[operation] };
        const result = describeOperation(graph, node);
        assert.equal(result.ok, true, `${operation}: ${JSON.stringify(result.error)}`);
        descriptions.push(result.data.descriptor);
        // Exercise every accepted enum variation, including controls that alter named pins.
        for (const [key, descriptor] of Object.entries(result.data.descriptor.controlDescriptors)) {
            for (const value of descriptor.values ?? []) {
                const variant = describeOperation(graph, { ...node, [key]: value });
                if (variant.ok) descriptions.push(variant.data.descriptor);
            }
        }
    }
    // Introspection modes expose different controls, not just different values.
    for (const { id, modes } of INTROSPECTION_OPERATIONS) {
        for (const mode of modes) {
            const result = describeOperation(graph, { type: 'workflow', ...operationDefaults(id, { mode }) });
            assert.equal(result.ok, true, `${id}/${mode}: ${JSON.stringify(result.error)}`);
            descriptions.push(result.data.descriptor);
        }
    }
    return descriptions;
}

test('effective settings in every operation and changing mode have meaningful explanations', () => {
    let settings = 0;
    for (const descriptor of effectiveDescriptions()) {
        for (const key of Object.keys(descriptor.controlDescriptors)) {
            const description = guide.describeGuideControl(descriptor.id, key);
            assert.equal(typeof description, 'string', `${descriptor.id}/${key} has an explanation`);
            assert.ok(description.trim().length >= 25, `${descriptor.id}/${key} explains its effect`);
            assert.doesNotMatch(description, /adjust this option|configure this setting|controls? the .+ setting/i);
            settings++;
        }
    }
    assert.ok(settings > 1000, 'mode variants were exercised');
});

test('Compose explains saved-section replacement and bounded template insertion', () => {
    assert.match(guide.describeGuideControl('compose', 'sections'), /connected.*replace.*saved|replace.*saved.*connected/i);
    assert.match(guide.describeGuideControl('compose', 'sections'), /Save Sections/);
    assert.match(guide.describeGuideControl('compose', 'mode'), /unused sections are not added/i);
    assert.match(guide.describeGuideControl('compose', 'outputKind'), /Guidance.*only in Preparation/i);
    const template = guide.describeGuideControl('compose', 'template');
    assert.match(template, /\{\{section:Direction\}\}/);
    assert.match(template, /\{\{data:\/tone\}\}/);
    assert.match(template, /missing.*stop/i);
    assert.match(template, /do not run scripts or host macros/i);
});

test('comment settings explain grouping and moving contained nodes', () => {
    assert.match(guide.describeGuideControl('comment', 'moveContents') ?? '', /mov.*nodes.*frame|frame.*mov.*nodes/i);
    assert.match(guide.describeGuideControl('comment', 'title') ?? '', /heading|label/i);
    assert.match(guide.describeGuideControl('comment', 'content') ?? '', /explanation|text/i);
    assert.match(guide.describeGuideControl('note', 'content') ?? '', /note|text/i);
});

test('appended section identity explains replacement on reuse', () => {
    for (const key of ['append', 'combine']) {
        assert.match(guide.describeGuideControl(key, 'sectionId'), /same identity.*replace|reus.*replac/i);
    }
});

test('character Recall activation uses the configured actor presence', () => {
    assert.match(guide.describeGuideControl('recall', 'activation'), /Character.*chosen actor.*presen|Character.*configured actor.*presen/i);
});

test('Event Normalize explains the authored progression event type', () => {
    assert.match(guide.describeGuideControl('event-normalize', 'eventType'), /Progression/i);
    assert.match(guide.describeGuideControl('event-normalize', 'eventType'), /blank.*retain|omit.*retain/i);
});


test('System and Compose guides explain skipped typed contributions and budgets', () => {
    assert.match(guide.describeGuideControl('subgraph', 'enabled') ?? '', /system/i);
    assert.match(guide.describeGuideControl('subgraph', 'enabled') ?? '', /skip/i);
    const sections = guide.describeGuideControl('compose', 'sections');
    for (const meaning of [/Text.*Guidance/i, /required/i, /skip/i, /empty/i]) assert.match(sections, meaning);
    assert.match(guide.describeGuideControl('compose', 'budgetTokens') ?? '', /budget.*token|token.*budget/i);
    assert.match(guide.describeGuideControl('compose', 'budgetTokens') ?? '', /overflow|exceed/i);
});

test('Filter Text guide explains live reports, atomic units and held review without model requests', () => {
    const entry=guide.getNodeGuide('filter-text');
    assert.ok(entry, 'Filter Text has practical guide content');
    assert.equal(entry.title, 'Filter Text');
    const explanation=[entry.summary,...entry.howTo].join(' ');
    for(const meaning of [/live.*Pattern.*report/i,/same Draft/i,/zero model requests/i,/atomic/i,/blocked.*empty/i,/Review.*Publish/i]) assert.match(explanation,meaning);
    const action=guide.describeGuideControl('filter-text','action');
    assert.match(action,/Remove.*matching/i);assert.match(action,/Keep.*nonmatching/i);
    const unit=guide.describeGuideControl('filter-text','unit');
    assert.match(unit,/LF.*CRLF.*CR/);assert.match(unit,/paragraph.*blank.*separator/i);assert.match(unit,/retained.*unchanged/i);
    const scope=guide.describeGuideControl('filter-text','scope');
    assert.match(scope,/independent.*Pattern.*scan/i);assert.match(scope,/whole.*unit|unit.*entire/i);assert.match(scope,/permission/i);
    const protections=guide.describeGuideControl('filter-text','protectedLiterals');
    assert.match(protections,/Pattern.*Draft.*Filter/i);assert.match(protections,/no partial/i);
});
