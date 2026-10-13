import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REMASTERED_WORKFLOW_EXAMPLE_DATA } from '../src/workflow/remastered-example-data.js?v=0.27.2';

test('opening one guide admits only its requested example, then returns detached cached copies', async () => {
    const envelopes = REMASTERED_WORKFLOW_EXAMPLE_DATA.flatMap(entry => entry.packages);
    let admissions = 0;
    for (const envelope of envelopes) Object.defineProperty(envelope, 'toJSON', { configurable: true, value() { admissions++; return Object.fromEntries(Object.entries(this)); } });
    try {
        const { getNodeGuideExample } = await import('../src/workflow/node-guide-examples.js?cold-guide-regression');
        const compose = getNodeGuideExample('compose');
        assert.equal(compose.graph.nodes.guidance.operation, 'compose');
        assert.equal(admissions, 0, 'Compose must not admit every unrelated curriculum graph');
        assert.equal(getNodeGuideExample('unknown-guide'), null);
        assert.equal(admissions, 0, 'unknown guides must not prepare unrelated examples');
        const clock = getNodeGuideExample('story-clock');
        assert.ok(clock);
        assert.ok(admissions > 0 && admissions < envelopes.length, 'a lesson-backed guide admits its own bundle only');
        const count = admissions;
        clock.graph.nodes = {};
        assert.ok(Object.keys(getNodeGuideExample('story-clock').graph.nodes).length);
        assert.equal(admissions, count, 'reopening reuses admitted local data');
    } finally {
        for (const envelope of envelopes) delete envelope.toJSON;
    }
});
