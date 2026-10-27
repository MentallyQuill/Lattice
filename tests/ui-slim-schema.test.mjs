import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectorComponent, control, input, click, nodeAt } from './helpers/inspector-component.mjs';

const schema = ' { "type":"object", "properties":{"a.b":{"type":"array","items":{"type":"string"}},"__proto__":{"const":false},"sibling":{"type":"number"}}, "required":["a.b"] }\n';

test('schema fields expand inline without redundant switches or losing siblings', async () => {
    await inspectorComponent('SchemaControl', schema, {}, async f => {
        assert.equal(f.host.querySelector('input[type="checkbox"]'), null, 'Schema authoring must not present enable/keyword checkbox grids');
        assert.equal(f.read().text, schema, 'Merely viewing the structure preserves source formatting');
        click(f.host, 'Edit Test field a.b');
        const field = nodeAt(f.host, ['properties','a.b']);
        assert.equal(control(field, 'Test schema type').value, 'array');
        assert.ok(control(f.host, 'Edit Test field sibling'));
        click(field, 'Edit Test list item definition');
        input(nodeAt(f.host, ['properties','a.b','items']), 'Test schema type', 'integer', 'change');
        const next = JSON.parse(f.read().text);
        assert.equal(next.properties['a.b'].items.type, 'integer');
        assert.equal(next.properties.__proto__.const, false);
        assert.equal(Object.hasOwn(next, 'additionalProperties'), false);
        assert.equal(f.host.querySelector('[aria-label*="Back Test"]'), null);
        assert.equal(f.host.querySelector('[role="region"][tabindex="0"]').getAttribute('aria-label'), 'Test fields');
    });
});

test('readonly schemas retain expansion and raw inspection while rejecting forced edits', async () => {
    await inspectorComponent('SchemaControl', schema, { disabled: true }, async f => {
        click(f.host, 'Edit Test field a.b');
        const field = nodeAt(f.host, ['properties','a.b']);
        assert.equal(control(field, 'Test schema type').disabled, true);
        input(field, 'Test schema type', 'number', 'change');
        assert.equal(f.read().text, schema);
        click(f.host, 'Edit Test schema as JSON');
        const json = control(f.host, 'Test schema JSON');
        assert.equal(json.readOnly || json.disabled, true);
        assert.equal(f.read().changes.length, 0);
    });
});

test('collapsed invalid constraints retain their complete document and recover across remounts', async () => {
    await inspectorComponent('SchemaControl', schema, {}, async f => {
        click(f.host, 'Edit Test field sibling');
        input(nodeAt(f.host, ['properties','sibling']), 'Add constraint', 'minimum', 'change');
        input(nodeAt(f.host, ['properties','sibling']), 'Test minimum value', '-');
        click(f.host, 'Edit Test field sibling');
        assert.equal(f.read().draft.invalid, true);
        await f.remount();
        click(f.host, 'Edit Test field sibling');
        assert.equal(control(nodeAt(f.host, ['properties','sibling']), 'Test minimum value').value, '-');
        click(f.host, 'Edit Test schema as JSON');
        const source = control(f.host, 'Test schema JSON').value;
        assert.ok(source.includes('a.b') && source.includes('minimum') && source.includes('__proto__'));
        input(f.host, 'Test schema JSON', schema);
        assert.equal(f.read().draft.invalid, false);
        assert.equal(f.read().text, schema);
    });
});
