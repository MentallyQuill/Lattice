import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as engine from '../src/workflow/story-time.js';

const clock = (absoluteMinute = 820, extra = {}) => ({
    clockId: 'story-clock', calendarId: 'campaign-days', dayLengthMinutes: 1440,
    absoluteMinute, ...extra,
});
const daily = { scheduleId: 'afternoon-bell', kind: 'daily', minuteOfDay: 840 };
const data = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };

test('daily crossing includes 14:00 once and excludes a boundary at the start', () => {
    const result = data(engine.enumerateScheduledOccurrences(clock(), 910, [daily]));
    assert.deepEqual(result.occurrences.map(event => event.dueMinute), [840]);
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(840), 910, [daily])).occurrences, []);
});

test('an explicit duration advances a detached clock and preserves metadata', () => {
    const input = clock(820, { revision: 7, notes: { label: 'Mira', tags: ['keep'] } });
    const proposal = { kind: 'duration', minutes: 90 };
    const result = data(engine.advanceStoryClock(input, proposal));
    assert.equal(result.clock.absoluteMinute, 910);
    assert.equal(result.previousClock.absoluteMinute, 820);
    assert.equal(result.elapsedMinutes, 90);
    assert.equal(result.requestedAbsoluteMinute, 910);
    assert.equal(result.actualCalls, 0);
    assert.equal(result.evidence.kind, 'explicit');
    assert.equal(result.clock.revision, 7);
    result.clock.notes.tags.push('changed');
    assert.deepEqual(input.notes.tags, ['keep']);
    assert.deepEqual(proposal, { kind: 'duration', minutes: 90 });
});

test('an explicit destination crosses midnight in the configured minute epoch', () => {
    const result = data(engine.advanceStoryClock(clock(1430), { kind: 'destination', absoluteMinute: 1450 }));
    assert.equal(result.clock.absoluteMinute, 1450);
    assert.equal(result.elapsedMinutes, 20);
    assert.equal(result.requestedAbsoluteMinute, 1450);
});

test('daily schedules enumerate multiple days in chronological order', () => {
    const schedules = [
        { scheduleId: 'midnight', kind: 'daily', minuteOfDay: 0 },
        { scheduleId: 'dawn', kind: 'daily', minuteOfDay: 360 },
    ];
    const occurrences = data(engine.enumerateScheduledOccurrences(clock(1430), 2900, schedules)).occurrences;
    assert.deepEqual(occurrences.map(event => event.dueMinute), [1440, 1800, 2880]);
});

test('interval cadence stays anchored when processing a boundary late', () => {
    const interval = { scheduleId: 'eight-hours', kind: 'interval', anchorMinute: 360, intervalMinutes: 480 };
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(360), 1800, [interval])).occurrences.map(event => event.dueMinute), [840, 1320, 1800]);
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(900), 1800, [interval])).occurrences.map(event => event.dueMinute), [1320, 1800]);
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(0), 360, [interval])).occurrences, []);
});

test('a delay emits its one due instant without recurring', () => {
    const delay = { scheduleId: 'accepted-action-delay', kind: 'delay', dueMinute: 840 };
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(360), 2900, [delay])).occurrences.map(event => event.dueMinute), [840]);
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(840), 2900, [delay])).occurrences, []);
});

test('occurrence identity is stable across replay and attributes clock, revision and due instant', () => {
    const schedule = { ...daily, subjectId: 'mira', operation: 'set', value: { form: 'werewolf' } };
    const first = data(engine.enumerateScheduledOccurrences(clock(), 910, [schedule])).occurrences[0];
    assert.equal(first.occurrenceId, 'time:["story-clock","afternoon-bell",1,840]');
    assert.equal(first.scheduleRevision, 1);
    assert.equal(first.clockId, 'story-clock');
    assert.equal(first.calendarId, 'campaign-days');
    assert.equal(first.day, 1);
    assert.equal(first.minuteOfDay, 840);
    assert.equal(first.kind, 'daily');
    assert.equal(first.schedule.subjectId, 'mira');
    assert.equal(first.schedule.revision, 1);
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(), 910, [schedule])).occurrences[0], first);
    assert.notEqual(data(engine.enumerateScheduledOccurrences(clock(), 910, [{ ...daily, revision: 2 }])).occurrences[0].occurrenceId, first.occurrenceId);
    assert.notEqual(data(engine.enumerateScheduledOccurrences(clock(820, { clockId: 'other-clock' }), 910, [daily])).occurrences[0].occurrenceId, first.occurrenceId);
    first.schedule.value.form = 'human';
    assert.equal(schedule.value.form, 'werewolf');
    assert.equal(Object.hasOwn(schedule, 'revision'), false);
});

test('consumed occurrence IDs suppress duplicate settlement on replay', () => {
    const schedules = [{ ...daily }, { scheduleId: 'once', kind: 'delay', dueMinute: 900 }];
    const ids = ['time:["story-clock","afternoon-bell",1,840]', 'time:["story-clock","afternoon-bell",1,840]'];
    const result = data(engine.enumerateScheduledOccurrences(clock(), 910, schedules, { consumedIds: ids }));
    assert.deepEqual(result.occurrences.map(event => event.scheduleId), ['once']);
    assert.equal(ids.length, 2);
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(820, { settledTimeEventIds: [ids[0]] }), 910, [daily])).occurrences, []);
});

test('bounded enumeration holds the entire projection instead of dropping overflow events', () => {
    const everyMinute = { scheduleId: 'minute', kind: 'interval', anchorMinute: 0, intervalMinutes: 1 };
    const result = engine.enumerateScheduledOccurrences(clock(0), 5, [everyMinute], { limit: 2 });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'OCCURRENCE_LIMIT');
    assert.equal(Object.hasOwn(result, 'data'), false);
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(0), 2, [everyMinute], { limit: 2 })).occurrences.map(event => event.dueMinute), [1, 2]);
});


test('ordinary time advance rejects invalid, unsafe and backward minute arithmetic', () => {
    for (const proposal of [
        { kind: 'duration', minutes: -1 }, { kind: 'duration', minutes: 0.5 },
        { kind: 'duration', minutes: NaN }, { kind: 'duration', minutes: Number.MAX_SAFE_INTEGER },
        { kind: 'destination', absoluteMinute: 819 }, { kind: 'destination', absoluteMinute: Infinity },
        { kind: 'duration' }, { kind: 'prose', text: 'later' },
        { kind: 'duration', minutes: 90, absoluteMinute: 1000 },
    ]) assert.equal(engine.advanceStoryClock(clock(), proposal).ok, false);
    assert.equal(data(engine.advanceStoryClock(clock(), { kind: 'duration', minutes: 0 })).clock.absoluteMinute, 820);
    assert.equal(engine.enumerateScheduledOccurrences(clock(), 819, [daily]).ok, false);
    assert.equal(engine.enumerateScheduledOccurrences(clock(), 910.5, [daily]).ok, false);
});

test('estimated time requires an authored acceptance policy and retains its provenance', () => {
    for (const evidence of [
        { kind: 'estimate', origin: 'route approximation' },
        { kind: 'estimate', acceptancePolicy: 'accept' },
        { kind: 'estimate', origin: 'route approximation', acceptancePolicy: 'unresolved' },
        { kind: 'vague', origin: 'a while later' },
    ]) {
        const result = engine.advanceStoryClock(clock(), { kind: 'duration', minutes: 90, evidence });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'UNRESOLVED_TIME');
    }
    const evidence = { kind: 'estimate', origin: 'authored route approximation', acceptancePolicy: 'accept' };
    const accepted = data(engine.advanceStoryClock(clock(), { kind: 'duration', minutes: 90, evidence }));
    assert.deepEqual(accepted.evidence, evidence);
    assert.deepEqual(accepted.clock.timeEvidence, evidence);
    const continued = data(engine.advanceStoryClock(accepted.clock, { kind: 'duration', minutes: 30 }));
    assert.deepEqual(continued.clock.timeEvidence, evidence);
    const resolved = data(engine.advanceStoryClock(accepted.clock, { kind: 'destination', absoluteMinute: 1000 }));
    assert.equal(resolved.clock.timeEvidence.kind, 'explicit');
});

test('clock admission validates calendar identity, canonical origin and own plain data', () => {
    let invoked = 0;
    const accessor = Object.defineProperty(clock(), 'absoluteMinute', { enumerable: true, get() { invoked++; return 820; } });
    const invalid = [
        null, {}, { ...clock(), clockId: '' }, { ...clock(), calendarId: '' },
        { ...clock(), dayLengthMinutes: 0 }, { ...clock(), absoluteMinute: -1 },
        { ...clock(), unit: 'hour' }, { ...clock(), originMinute: 1 }, { ...clock(), originDay: 0 },
        Object.create(clock()), accessor,
    ];
    for (const input of invalid) {
        assert.equal(engine.advanceStoryClock(input, { kind: 'duration', minutes: 90 }).ok, false);
        assert.equal(engine.enumerateScheduledOccurrences(input, 910, [daily]).ok, false);
    }
    assert.equal(invoked, 0);
    const canonical = Object.assign(Object.create(null), clock(820, { unit: 'minute', originMinute: 0, originDay: 1 }));
    assert.equal(data(engine.advanceStoryClock(canonical, { kind: 'duration', minutes: 90 })).clock.absoluteMinute, 910);
    const shortDay = clock(90, { dayLengthMinutes: 100 });
    const midnight = { scheduleId: 'midnight', kind: 'daily', minuteOfDay: 0 };
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(shortDay, 210, [midnight])).occurrences.map(event => [event.dueMinute, event.day, event.minuteOfDay]), [[100, 2, 0], [200, 3, 0]]);
});

test('schedule and replay option admission reject ambiguous or unsafe definitions', () => {
    let invoked = 0;
    const accessor = Object.defineProperty({ ...daily }, 'minuteOfDay', { enumerable: true, get() { invoked++; return 840; } });
    for (const schedules of [
        null, [null], [{ ...daily, scheduleId: '' }], [{ ...daily, revision: 0 }],
        [{ ...daily, kind: 'cooldown' }], [{ ...daily, minuteOfDay: 1440 }],
        [{ ...daily, minuteOfDay: -1 }], [{ ...daily, order: 0.1 }],
        [{ scheduleId: 'i', kind: 'interval', anchorMinute: 0, intervalMinutes: 0 }],
        [{ scheduleId: 'i', kind: 'interval', anchorMinute: -1, intervalMinutes: 1 }],
        [{ scheduleId: 'd', kind: 'delay', dueMinute: 1.5 }],
        [{ ...daily, clockId: 'other' }], [{ ...daily, calendarId: 'other' }],
        [daily, { ...daily }], [accessor], [, daily], [Object.create(daily)],
    ]) assert.equal(engine.enumerateScheduledOccurrences(clock(), 910, schedules).ok, false);
    for (const options of [null, { limit: 0 }, { limit: 10001 }, { limit: 1.5 }, { consumedIds: new Set() }, { consumedIds: [1] }, { consumedIds: [, 'x'] }]) {
        assert.equal(engine.enumerateScheduledOccurrences(clock(), 910, [daily], options).ok, false);
    }
    assert.equal(engine.enumerateScheduledOccurrences(clock(820, { settledTimeEventIds: [1] }), 910, [daily]).ok, false);
    assert.equal(invoked, 0);
});

test('simultaneous events use authored order then schedule identity independent of input order', () => {
    const schedules = [
        { scheduleId: 'z-last', kind: 'delay', dueMinute: 840, order: 1 },
        { scheduleId: 'b-default', kind: 'delay', dueMinute: 840 },
        { scheduleId: 'a-default', kind: 'delay', dueMinute: 840 },
        { scheduleId: 'first', kind: 'delay', dueMinute: 840, order: -1 },
    ];
    const expected = ['first', 'a-default', 'b-default', 'z-last'];
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(), 910, schedules)).occurrences.map(event => event.scheduleId), expected);
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(), 910, [...schedules].reverse())).occurrences.map(event => event.scheduleId), expected);
});

test('interrupt stops at 14:00 and returns the remaining 70 requested minutes', () => {
    const result = data(engine.resolveTimeAdvance(clock(), { kind: 'duration', minutes: 90 }, [daily], { policy: 'interrupt' }));
    assert.equal(result.clock.absoluteMinute, 840);
    assert.equal(result.requestedAbsoluteMinute, 910);
    assert.equal(result.requestedElapsedMinutes, 90);
    assert.equal(result.elapsedMinutes, 20);
    assert.equal(result.remainingMinutes, 70);
    assert.equal(result.interrupted, true);
    assert.equal(result.policy, 'interrupt');
    assert.equal(result.actualCalls, 0);
    assert.deepEqual(result.occurrences.map(event => event.dueMinute), [840]);
});

test('catch-up resolves all ordered boundaries and continues to the requested destination', () => {
    const schedules = [{ scheduleId: 'later', kind: 'delay', dueMinute: 900 }, daily];
    const result = data(engine.resolveTimeAdvance(clock(), { kind: 'destination', absoluteMinute: 910 }, schedules, { policy: 'catch-up' }));
    assert.equal(result.clock.absoluteMinute, 910);
    assert.equal(result.elapsedMinutes, 90);
    assert.equal(result.remainingMinutes, 0);
    assert.equal(result.interrupted, false);
    assert.deepEqual(result.occurrences.map(event => event.dueMinute), [840, 900]);
});

test('resolution requires an explicit catch-up or interruption policy', () => {
    for (const options of [undefined, {}, { policy: 'run-all' }, { policy: null }]) {
        const result = engine.resolveTimeAdvance(clock(), { kind: 'duration', minutes: 90 }, [daily], options);
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'INVALID_POLICY');
    }
});

test('interruption bounds only the next unconsumed instant across a very long request', () => {
    const interval = { scheduleId: 'eight-hours', kind: 'interval', anchorMinute: 360, intervalMinutes: 480 };
    const result = data(engine.resolveTimeAdvance(clock(360), { kind: 'destination', absoluteMinute: 1_000_000_000 }, [interval], {
        policy: 'interrupt', limit: 1, consumedIds: ['time:["story-clock","eight-hours",1,840]'],
    }));
    assert.equal(result.clock.absoluteMinute, 1320);
    assert.equal(result.remainingMinutes, 999_998_680);
    assert.deepEqual(result.occurrences.map(event => event.dueMinute), [1320]);
});

test('bounded output holds a projection whose preserved schedule metadata exceeds the DTO budget', () => {
    const schedule = { ...daily, notes: 'x'.repeat(140000) };
    const result = engine.enumerateScheduledOccurrences(clock(), 2350, [schedule]);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'OUTPUT_LIMIT');
    assert.equal(Object.hasOwn(result, 'data'), false);
    assert.equal(engine.advanceStoryClock(clock(820, { notes: 'x'.repeat(140000) }), { kind: 'duration', minutes: 90 }).ok, false);
});

test('persisted estimated clocks and extracted evidence require valid acceptance provenance', () => {
    for (const timeEvidence of [
        { kind: 'estimate', origin: 'old estimate' },
        { kind: 'estimate', origin: 'old estimate', acceptancePolicy: 'unresolved' },
        { kind: 'vague' }, { kind: 'unknown' }, null,
    ]) assert.equal(engine.advanceStoryClock(clock(820, { timeEvidence }), { kind: 'duration', minutes: 90 }).ok, false);
    for (const evidence of [null, [], { kind: 'authored-rule' }, { kind: 'validated-extraction', origin: '' }, { kind: 'unknown' }]) {
        assert.equal(engine.advanceStoryClock(clock(), { kind: 'duration', minutes: 90, evidence }).ok, false);
    }
    const evidence = { kind: 'validated-extraction', origin: 'accepted travel event:turn-4' };
    assert.deepEqual(data(engine.advanceStoryClock(clock(), { kind: 'duration', minutes: 90, evidence })).evidence, evidence);
});

test('calendar derivation holds instead of emitting an unsafe day number', () => {
    const result = engine.enumerateScheduledOccurrences(clock(0, { dayLengthMinutes: 1 }), Number.MAX_SAFE_INTEGER, [
        { scheduleId: 'far-future', kind: 'delay', dueMinute: Number.MAX_SAFE_INTEGER },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'TIME_RANGE');
});

test('escaped boundary identities remain replayable within the admitted identity bounds', () => {
    const input = clock(820, { clockId: `c${'\u0000'.repeat(255)}` });
    const schedule = { ...daily, scheduleId: `s${'\u0000'.repeat(255)}` };
    const id = data(engine.enumerateScheduledOccurrences(input, 910, [schedule])).occurrences[0].occurrenceId;
    assert.ok(id.length > 2048);
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(input, 910, [schedule], { consumedIds: [id] })).occurrences, []);
});

test('a valid no-occurrence resolution still advances and differs from a scheduling failure', () => {
    for (const policy of ['interrupt', 'catch-up']) {
        const result = data(engine.resolveTimeAdvance(clock(850), { kind: 'duration', minutes: 60 }, [daily], { policy }));
        assert.equal(result.clock.absoluteMinute, 910);
        assert.equal(result.elapsedMinutes, 60);
        assert.equal(result.remainingMinutes, 0);
        assert.equal(result.interrupted, false);
        assert.equal(result.actualCalls, 0);
        assert.deepEqual(result.occurrences, []);
    }
    assert.equal(engine.resolveTimeAdvance(clock(), { kind: 'duration', minutes: 90, evidence: { kind: 'vague' } }, [], { policy: 'catch-up' }).ok, false);
    assert.equal(engine.resolveTimeAdvance(clock(), { kind: 'duration', minutes: 90 }, [{ ...daily, minuteOfDay: -1 }], { policy: 'catch-up' }).ok, false);
});

test('replay starts from the supplied frozen snapshot and stages no consumed IDs', () => {
    const input = Object.freeze(clock(820, { settledTimeEventIds: Object.freeze([]) }));
    const proposal = Object.freeze({ kind: 'duration', minutes: 90 });
    const schedules = Object.freeze([Object.freeze({ ...daily })]);
    const options = Object.freeze({ policy: 'catch-up' });
    const first = data(engine.resolveTimeAdvance(input, proposal, schedules, options));
    const replay = data(engine.resolveTimeAdvance(input, proposal, schedules, options));
    assert.deepEqual(replay, first);
    assert.equal(input.absoluteMinute, 820);
    assert.deepEqual(input.settledTimeEventIds, []);
    assert.deepEqual(first.clock.settledTimeEventIds, []);
    assert.equal(Object.hasOwn(schedules[0], 'revision'), false);
    const consumed = data(engine.resolveTimeAdvance(input, proposal, schedules, {
        policy: 'catch-up', consumedIds: [first.occurrences[0].occurrenceId],
    }));
    assert.equal(consumed.clock.absoluteMinute, 910);
    assert.deepEqual(consumed.occurrences, []);
});

test('interruption includes all simultaneous events or holds their configured bound', () => {
    const schedules = [{ scheduleId: 'first', kind: 'delay', dueMinute: 840, order: -1 }, daily];
    const result = data(engine.resolveTimeAdvance(clock(), { kind: 'duration', minutes: 90 }, schedules, { policy: 'interrupt', limit: 2 }));
    assert.deepEqual(result.occurrences.map(event => event.scheduleId), ['first', 'afternoon-bell']);
    assert.equal(result.clock.absoluteMinute, 840);
    const overflow = engine.resolveTimeAdvance(clock(), { kind: 'duration', minutes: 90 }, schedules, { policy: 'interrupt', limit: 1 });
    assert.equal(overflow.ok, false);
    assert.equal(overflow.error.code, 'OCCURRENCE_LIMIT');
});

test('safe-integer endpoint arithmetic stays exact at the supported minute maximum', () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const input = clock(maximum - 3);
    const interval = { scheduleId: 'last-three', kind: 'interval', anchorMinute: maximum - 3, intervalMinutes: 1 };
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(input, maximum, [interval])).occurrences.map(event => event.dueMinute), [maximum - 2, maximum - 1, maximum]);
    assert.equal(data(engine.advanceStoryClock(input, { kind: 'duration', minutes: 3 })).clock.absoluteMinute, maximum);
    assert.equal(engine.advanceStoryClock(input, { kind: 'duration', minutes: 4 }).ok, false);
    assert.deepEqual(data(engine.enumerateScheduledOccurrences(clock(), 840, [daily])).occurrences.map(event => event.dueMinute), [840]);
});

test('clock schema and optional snapshot revision remain valid when preserved', () => {
    for (const metadata of [{ schemaVersion: 2 }, { revision: 0 }, { revision: 1.5 }, { revision: 'saved' }]) {
        assert.equal(engine.advanceStoryClock(clock(820, metadata), { kind: 'duration', minutes: 90 }).ok, false);
    }
    const result = data(engine.advanceStoryClock(clock(820, { schemaVersion: 1, revision: 7 }), { kind: 'duration', minutes: 90 }));
    assert.equal(result.clock.schemaVersion, 1);
    assert.equal(result.clock.revision, 7);
});

test('proposal evidence cannot hide estimates or contradictory authoring fields', () => {
    for (const proposal of [
        { kind: 'duration', minutes: 90, estimated: true },
        { kind: 'duration', minutes: 90, text: 'a while later' },
        { kind: 'duration', minutes: 90, evidence: { kind: 'explicit', origin: 1 } },
        { kind: 'duration', minutes: 90, evidence: { kind: 'explicit', acceptancePolicy: 'unresolved' } },
    ]) assert.equal(engine.advanceStoryClock(clock(), proposal).ok, false);
});

test('additive estimates retain both origins through later exact duration advances', () => {
    const first = { kind: 'estimate', origin: 'first route', acceptancePolicy: 'accept' };
    const second = { kind: 'estimate', origin: 'second route', acceptancePolicy: 'accept' };
    const input = clock(820, { timeEvidence: first });
    const advanced = data(engine.advanceStoryClock(input, { kind: 'duration', minutes: 90, evidence: second }));
    const merged = { ...second, lineage: ['first route', 'second route'] };
    assert.deepEqual(advanced.clock.timeEvidence, merged);
    assert.deepEqual(advanced.evidence, second);
    assert.deepEqual(input.timeEvidence, first);
    assert.deepEqual(second, { kind: 'estimate', origin: 'second route', acceptancePolicy: 'accept' });
    const continued = data(engine.advanceStoryClock(advanced.clock, { kind: 'duration', minutes: 30 }));
    assert.deepEqual(continued.clock.timeEvidence, merged);
    assert.equal(continued.clock.absoluteMinute, 940);
    const resolved = data(engine.advanceStoryClock(continued.clock, { kind: 'destination', absoluteMinute: 1000 }));
    assert.deepEqual(resolved.clock.timeEvidence, { kind: 'explicit' });
});

test('estimate provenance holds instead of truncating a sixty-fifth uncertainty source', () => {
    const lineage = Array.from({ length: 64 }, (_, index) => `source-${index + 1}`);
    const timeEvidence = { kind: 'estimate', origin: 'source-64', acceptancePolicy: 'accept', lineage };
    const input = clock(820, { timeEvidence });
    const result = engine.advanceStoryClock(input, {
        kind: 'duration', minutes: 90,
        evidence: { kind: 'estimate', origin: 'source-65', acceptancePolicy: 'accept' },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'EVIDENCE_LIMIT');
    assert.equal(Object.hasOwn(result, 'data'), false);
    assert.equal(input.absoluteMinute, 820);
    assert.equal(input.timeEvidence.lineage.length, 64);
    const reused = data(engine.advanceStoryClock(input, {
        kind: 'duration', minutes: 90,
        evidence: { kind: 'estimate', origin: 'source-64', acceptancePolicy: 'accept' },
    }));
    assert.deepEqual(reused.clock.timeEvidence.lineage, lineage);
});

test('evidence admission rejects unsupported flags rather than relabeling an estimate as exact', () => {
    for (const evidence of [
        { kind: 'explicit', origin: 'route estimate', estimated: true },
        { kind: 'authored-rule', origin: 'route estimate', estimated: true },
        { kind: 'validated-extraction', origin: 'route estimate', estimated: true },
        { kind: 'estimate', origin: 'route estimate', acceptancePolicy: 'accept', exact: true },
        { kind: 'explicit', origin: 'route estimate', lineage: ['route estimate'] },
    ]) {
        const result = engine.advanceStoryClock(clock(), { kind: 'duration', minutes: 90, evidence });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'INVALID_EVIDENCE');
    }
    assert.equal(engine.advanceStoryClock(clock(820, { timeEvidence: {
        kind: 'explicit', origin: 'route estimate', estimated: true,
    } }), { kind: 'duration', minutes: 90 }).ok, false);
});

test('estimate lineage admission requires bounded distinct text sources including the current origin', () => {
    const estimate = { kind: 'estimate', origin: 'current route', acceptancePolicy: 'accept' };
    for (const lineage of [
        [], ['old route'], ['current route', 'current route'], ['current route', ''],
        ['current route', 1], 'current route', [{ origin: 'current route', estimated: false }],
    ]) {
        const result = engine.advanceStoryClock(clock(), { kind: 'duration', minutes: 90, evidence: { ...estimate, lineage } });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'INVALID_EVIDENCE');
        assert.equal(engine.advanceStoryClock(clock(820, { timeEvidence: { ...estimate, lineage } }), { kind: 'duration', minutes: 90 }).ok, false);
    }
    const oversized = engine.advanceStoryClock(clock(), { kind: 'duration', minutes: 90, evidence: {
        ...estimate, lineage: ['current route', ...Array.from({ length: 64 }, (_, index) => `old-${index}`)],
    } });
    assert.equal(oversized.ok, false);
    assert.equal(oversized.error.code, 'EVIDENCE_LIMIT');
});

test('composite estimate sources merge once without nested or repeated history', () => {
    let input = clock(820, { timeEvidence: {
        kind: 'estimate', origin: 'second route', acceptancePolicy: 'accept', lineage: ['first route', 'second route'],
    } });
    const expected = {
        kind: 'estimate', origin: 'third route', acceptancePolicy: 'accept',
        lineage: ['first route', 'second route', 'third route'],
    };
    input = data(engine.advanceStoryClock(input, { kind: 'duration', minutes: 1, evidence: {
        kind: 'estimate', origin: 'third route', acceptancePolicy: 'accept', lineage: ['second route', 'third route'],
    } })).clock;
    assert.deepEqual(input.timeEvidence, expected);
    for (let retry = 0; retry < 32; retry++) {
        input = data(engine.advanceStoryClock(input, { kind: 'duration', minutes: 1, evidence: input.timeEvidence })).clock;
        assert.deepEqual(input.timeEvidence, expected);
    }
    assert.equal(input.absoluteMinute, 853);
});

test('evidence field types are validated before selecting an unresolved route', () => {
    for (const evidence of [
        { kind: 'vague', origin: 1 },
        { kind: 'estimate', origin: 'route', acceptancePolicy: true },
        { kind: 'estimate', origin: 'route', acceptancePolicy: 'automatic' },
        { kind: 'estimate', origin: 'route', acceptancePolicy: 'unresolved', lineage: ['other route'] },
    ]) {
        const result = engine.advanceStoryClock(clock(), { kind: 'duration', minutes: 90, evidence });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'INVALID_EVIDENCE');
    }
    const unresolved = engine.advanceStoryClock(clock(), { kind: 'duration', minutes: 90, evidence: {
        kind: 'estimate', origin: 'route', acceptancePolicy: 'unresolved', lineage: ['route'],
    } });
    assert.equal(unresolved.ok, false);
    assert.equal(unresolved.error.code, 'UNRESOLVED_TIME');
});

test('shared schedule admission normalizes revision without inventing clock scope or calendar bounds',()=>{
    assert.equal(typeof engine.validateStorySchedules,'function');
    const input=[{...daily,clockId:'another-clock',calendarId:'custom-calendar',minuteOfDay:2000,extra:{visibility:'private',value:null}}];
    assert.deepEqual(data(engine.validateStorySchedules(input)),[{...input[0],revision:1}]);
    assert.equal(Object.hasOwn(input[0],'revision'),false);
    assert.equal(engine.validateStorySchedules(input,clock()).ok,false);
    assert.equal(engine.validateStorySchedules([{...daily,minuteOfDay:1440}],clock()).ok,false);
    assert.equal(engine.validateStorySchedules([{...daily,minuteOfDay:1439}],clock()).ok,true);
    assert.equal(engine.enumerateScheduledOccurrences(clock(),2000,[{...daily,minuteOfDay:1440}]).ok,false);
    assert.equal(engine.enumerateScheduledOccurrences(clock(),2000,[{...daily,clockId:'another-clock'}]).ok,false);
});
