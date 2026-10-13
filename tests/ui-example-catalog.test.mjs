const exampleCount = 30;
import test from 'node:test';
import assert from 'node:assert/strict';

test('example thumbnails project the 30 remastered lessons in curriculum order', async () => {
    const api = await import('../src/ui/example-catalog.js?v=0.27.3').catch(error => {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
        return {};
    });
    assert.equal(typeof api.projectWorkflowExamples, 'function', 'The native package thumbnail projection is available');
    const tiles = api.projectWorkflowExamples();
    assert.equal(tiles.length, exampleCount);
    assert.deepEqual(tiles.map(entry => entry.id), Array.from({length: 30}, (_, index) => `lesson-${String(index + 1).padStart(2, '0')}`));
    assert.deepEqual(tiles.map(tile => tile.number), Array.from({ length: exampleCount }, (_, index) => index + 1));
    assert.equal(tiles[0].title, 'Follow a reply from Send to Review');
    assert.equal(tiles[29].title, 'A relationship that changes slowly over weeks');
    for (const tile of tiles) {
        assert.ok(tile.thumbnail.nodes.length, tile.title);
        assert.ok(tile.thumbnail.wires.length, tile.title);
        assert.ok(tile.thumbnail.nodes.every(node => node.title && node.ports.every(port => port.label && port.kind)));
        assert.ok(tile.thumbnail.bounds.w > 0 && tile.thumbnail.bounds.h > 0);
    }
});

test('thumbnails preserve native authored positions, named typed wires, labels and comment notes', async () => {
    const { listWorkflowExamples } = await import('../src/workflow/examples.js?v=0.27.3');
    const { projectWorkflowExamples } = await import('../src/ui/example-catalog.js?v=0.27.3');
    const examples = listWorkflowExamples(), before = structuredClone(examples), tiles = projectWorkflowExamples();
    for (const [index, example] of examples.entries()) {
        const preview = tiles[index].thumbnail;
        assert.equal(preview.nodes.length + preview.comments.length, Object.keys(example.graph.nodes).length);
        assert.equal(preview.wires.length, Object.keys(example.graph.wires).length);
        for (const node of preview.nodes) {
            const authored = example.graph.nodes[node.id];
            assert.equal(node.x, authored.x);
            assert.equal(node.y, authored.y);
            assert.equal(node.w, authored.w || 260);
            if (authored.title || authored.alias || authored.presentation?.alias) assert.equal(node.title, authored.presentation?.alias || authored.alias || authored.title);
            assert.ok(node.x >= preview.bounds.x && node.x + node.w <= preview.bounds.x + preview.bounds.w);
            assert.ok(node.y >= preview.bounds.y && node.y + node.h <= preview.bounds.y + preview.bounds.h);
        }
        for (const comment of preview.comments) {
            const authored = example.graph.nodes[comment.id];
            assert.deepEqual([comment.x, comment.y, comment.w, comment.h, comment.title, comment.content], [authored.x, authored.y, authored.w, authored.h, authored.title, authored.content]);
        }
        for (const wire of preview.wires) {
            const authored = example.graph.wires[wire.id];
            assert.deepEqual(wire.from, { nodeId: authored.from, portId: authored.fromPort });
            assert.deepEqual(wire.to, { nodeId: authored.to, portId: authored.toPort });
            const source = preview.nodes.find(node => node.id === authored.from).ports.find(pin => pin.dir === 'out' && pin.port === authored.fromPort);
            assert.equal(wire.kind, source.kind);
            assert.ok(wire.d.startsWith(`M ${source.x},${source.y} `));
            assert.match(wire.d, /C /);
        }
    }
    assert.deepEqual(examples, before, 'Preparing thumbnails cannot change saved examples');
});

test('stable example revisions reuse immutable thumbnail projections', async () => {
    const { projectWorkflowExamples } = await import('../src/ui/example-catalog.js?v=0.27.3');
    const first = projectWorkflowExamples(), again = projectWorkflowExamples();
    assert.equal(again, first);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first[0].thumbnail.nodes[0].ports), true);
    assert.throws(() => { first[0].thumbnail.nodes[0].title = 'Changed'; }, TypeError);
});

test('the warm catalog cache is checked before package admission and carries precomputed search text', async () => {
    const { REMASTERED_WORKFLOW_EXAMPLE_DATA: WORKFLOW_EXAMPLE_DATA } = await import('../src/workflow/remastered-example-data.js?v=0.27.3');
    const { projectWorkflowExamples } = await import('../src/ui/example-catalog.js?v=0.27.3');
    const entry = WORKFLOW_EXAMPLE_DATA[0], descriptor = Object.getOwnPropertyDescriptor(entry, 'goal');
    const parse = JSON.parse; let parses = 0;
    entry.goal = `${entry.goal} Catalog cache probe.`;
    JSON.parse = (...args) => { parses++; return parse(...args); };
    try {
        const first = projectWorkflowExamples();
        const admittedParses = parses;
        assert.ok(admittedParses > 0, 'The changed plain source must be parsed and admitted');
        const again = projectWorkflowExamples();
        assert.equal(again, first);
        assert.equal(parses, admittedParses, 'A warm plain projection must return before admitting packages');
        assert.match(first[0].searchText, /follow a reply from send to review/);
        assert.match(first[0].searchText, /foundations/);
        assert.match(first[0].searchText, /send/);
    } finally {
        JSON.parse = parse;
        Object.defineProperty(entry, 'goal', descriptor);
    }
});

test('dynamic getter sources bypass admission and projection caches across corruption and repair', async () => {
    const { REMASTERED_WORKFLOW_EXAMPLE_DATA: WORKFLOW_EXAMPLE_DATA } = await import('../src/workflow/remastered-example-data.js?v=0.27.3');
    const { projectWorkflowExamples } = await import('../src/ui/example-catalog.js?v=0.27.3');
    const { workflowExampleCatalogRevision } = await import('../src/workflow/examples.js?v=0.27.3');
    const node = Object.values(WORKFLOW_EXAMPLE_DATA[0].packages[0].graph.nodes).find(item => item.type === 'workflow');
    const descriptor = Object.getOwnPropertyDescriptor(node, 'operation'); let operation = descriptor.value;
    Object.defineProperty(node, 'operation', { configurable: true, enumerable: true, get() { return operation; } });
    try {
        assert.equal(workflowExampleCatalogRevision(), null, 'Accessor-backed catalogs are explicitly uncacheable');
        const healthy = projectWorkflowExamples();
        assert.ok(healthy[0].thumbnail?.nodes.length);
        operation = 'missing-example-operation';
        const broken = projectWorkflowExamples();
        assert.equal(broken[0].thumbnail, null);
        assert.match(broken[0].issue, /node type|supported|workflow version/i);
        operation = descriptor.value;
        const repaired = projectWorkflowExamples();
        assert.ok(repaired[0].thumbnail?.nodes.length);
        assert.equal(repaired[0].issue, '');
    } finally {
        Object.defineProperty(node, 'operation', descriptor);
        projectWorkflowExamples();
    }
});

test('a malformed primary retains its diagnostic tile while the other previews stay usable', async () => {
    const { REMASTERED_WORKFLOW_EXAMPLE_DATA: WORKFLOW_EXAMPLE_DATA } = await import('../src/workflow/remastered-example-data.js?v=0.27.3');
    const { projectWorkflowExamples } = await import('../src/ui/example-catalog.js?v=0.27.3');
    const entry = WORKFLOW_EXAMPLE_DATA[0], node = Object.values(entry.packages[0].graph.nodes).find(node => node.type === 'workflow');
    const operation = node.operation;
    try {
        node.operation = 'missing-example-operation';
        let tiles;
        assert.doesNotThrow(() => { tiles = projectWorkflowExamples(); }, 'A malformed example must not abort the workspace catalog');
        assert.equal(tiles.length, exampleCount);
        assert.deepEqual(tiles.map(tile => tile.number), Array.from({ length: exampleCount }, (_, index) => index + 1));
        assert.equal(tiles[0].title, 'Follow a reply from Send to Review');
        assert.equal(tiles[0].thumbnail, null);
        assert.match(tiles[0].issue, /node type|supported|workflow version/i);
        assert.ok(tiles.slice(1).every(tile => !tile.issue && tile.thumbnail.nodes.length));
    } finally { node.operation = operation; }
    const repaired = projectWorkflowExamples();
    assert.equal(repaired[0].issue, '');
    assert.ok(repaired[0].thumbnail.nodes.length);
});

test('lesson instructions are detached from authored data and immutable in catalog tiles', async () => {
    const { listWorkflowExamples, listWorkflowExampleResults } = await import('../src/workflow/examples.js?v=0.27.3');
    const { projectWorkflowExamples } = await import('../src/ui/example-catalog.js?v=0.27.3');
    const examples = listWorkflowExamples(), results = listWorkflowExampleResults(), tiles = projectWorkflowExamples();
    assert.ok(examples.every(entry => entry.lesson?.focus && entry.lesson.requirements.length && entry.lesson.steps.length && entry.lesson.checkpoints.length));
    assert.deepEqual(tiles[0].lesson, examples[0].lesson);
    assert.notEqual(results[0].lesson, examples[0].lesson);
    examples[0].lesson.steps[0] = 'Changed locally';
    assert.notEqual(listWorkflowExamples()[0].lesson.steps[0], 'Changed locally');
    assert.equal(Object.isFrozen(tiles[0].lesson.steps), true);
    assert.throws(() => { tiles[0].lesson.steps.push('Changed'); }, TypeError);
});

test('group thumbnails retain readable preparation and response frames around their member cards', async () => {
    const {listWorkflowExamples} = await import('../src/workflow/examples.js?v=0.27.3');
    const {projectWorkflowExamples} = await import('../src/ui/example-catalog.js?v=0.27.3');
    const example = listWorkflowExamples().find(example => Object.keys(example.graph.groups).length), preview = projectWorkflowExamples().find(tile => tile.id === example.id).thumbnail;
    assert.equal(preview.groups.length, Object.keys(example.graph.groups).length);
    for (const group of preview.groups) {
        assert.ok(group.title && group.w > 0 && group.h > 0);
        const members = preview.nodes.filter(node => example.graph.nodes[node.id].inGroup === group.id);
        assert.ok(members.length);
        assert.ok(members.every(node => node.x >= group.x && node.x + node.w <= group.x + group.w && node.y > group.y && node.y + node.h <= group.y + group.h));
        assert.ok(group.x >= preview.bounds.x && group.y >= preview.bounds.y && group.x + group.w <= preview.bounds.x + preview.bounds.w && group.y + group.h <= preview.bounds.y + preview.bounds.h);
    }
});
