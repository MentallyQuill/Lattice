import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeTimeNode, executeTimeNode, TIME_OPERATIONS } from '../src/workflow/operations/time-nodes.js';

const clock = (minute = 820, extra = {}) => ({ schemaVersion: 1, clockId: 'story-2-clock', calendarId: 'campaign-days', revision: 7, dayLengthMinutes: 1440, absoluteMinute: minute, ...extra });
const artifact = value => ({ kind: 'data', value });
const success = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result; };
test('Clock Commit preserves bounded native history capacity diagnostics',async()=>{
 const result=await executeTimeNode({operation:'commit-clock'},{projection:artifact({status:'proposed'})},{root:true,stageStoryClock:async()=>({ok:false,error:{code:'CLOCK_LEDGER_FULL',message:'PRIVATE HOST DETAIL'}})});
 assert.equal(result.error.code,'CLOCK_LEDGER_FULL');assert.match(result.error.message,/Workflow Data/);assert.equal(JSON.stringify(result).includes('PRIVATE HOST DETAIL'),false);
});

test('Story Clock is a both-phase root source and returns a detached persisted clock', async () => {
    const node = { operation: 'story-clock', clockId: 'story-2-clock' };
    const description = success(describeTimeNode(node, { phase: 'post' })).data;
    assert.equal(TIME_OPERATIONS['story-clock'].phase, 'both');
    assert.equal(description.descriptor.rootOnly, true);
    assert.equal(description.descriptor.hostOperation, true);
    assert.equal(description.descriptor.minimumSchema, 3);
    assert.equal(description.descriptor.minimumRuntime, 2);
    assert.equal(description.descriptor.requestBound, 0);
    assert.deepEqual(description.ports.map(port => [port.id, port.direction, port.kind]), [['out', 'output', 'data']]);
    const original = clock(820, { notes: { owner: 'Mira' }, timeEvidence: { kind: 'estimate', origin: 'route', acceptancePolicy: 'accept', lineage: ['route'] } });
    let calls = 0;
    const result = success(await executeTimeNode(node, {}, { root: true, phase: 'post', readStoryClock: async id => { calls++; assert.equal(id, 'story-2-clock'); return { ok: true, data: original }; } }));
    assert.deepEqual(result.outputs.out.value, original);
    assert.notEqual(result.outputs.out.value, original);
    assert.equal(Object.isFrozen(result.outputs.out.value), true);
    original.notes.owner = 'changed';
    assert.equal(result.outputs.out.value.notes.owner, 'Mira');
    assert.equal(calls, 1);
});

test('Story Clock holds without a trusted source and rejects mismatched persisted identity', async () => {
    const node = { operation: 'story-clock', clockId: 'story-2-clock' };
    assert.equal((await executeTimeNode(node, {}, { root: true })).error.code, 'STORY_CLOCK_MISSING');
    assert.equal((await executeTimeNode(node, {}, { root: true, readStoryClock: async () => ({ ok: true, data: clock(820, { clockId: 'other' }) }) })).error.code, 'CLOCK_SCOPE_MISMATCH');
    assert.equal((await executeTimeNode(node, {}, { root: true, readStoryClock: async () => ({ ok: true, data: clock(820, { revision: 0 }) }) })).error.code, 'INVALID_CLOCK');
});

test('Advance Time interrupts at 14:00 and exposes the effective clock, due records and remainder on separate ports', async () => {
    const node = { operation: 'advance-time', policy: 'interrupt', schedules: [{ scheduleId: 'curse', kind: 'daily', minuteOfDay: 840, subjectId: 'Mira', operation: 'set', value: { form: 'werewolf' } }] };
    const description = success(describeTimeNode(node, { phase: 'pre' })).data;
    assert.equal(description.descriptor.hostOperation, undefined);
    assert.deepEqual(description.ports.filter(port => port.direction === 'output').map(port => port.id), ['clock', 'occurrences', 'remainder', 'report']);
    const input = clock(360, { notes: 'preserve', timeEvidence: { kind: 'estimate', origin: 'road estimate', acceptancePolicy: 'accept', lineage: ['road estimate'] } });
    const result = success(await executeTimeNode(node, { clock: artifact(input), proposal: artifact({ kind: 'duration', minutes: 720 }) }));
    assert.equal(result.outputs.clock.value.absoluteMinute, 840);
    assert.equal(result.outputs.clock.value.revision, 7);
    assert.deepEqual(result.outputs.clock.value.timeEvidence.lineage, ['road estimate']);
    assert.deepEqual(result.outputs.occurrences.value.map(event => [event.dueMinute, event.schedule.subjectId, event.schedule.value.form]), [[840, 'Mira', 'werewolf']]);
    assert.deepEqual(result.outputs.remainder.value, { kind: 'duration', minutes: 240, evidence: { kind: 'explicit' } });
    assert.equal(result.outputs.report.value.status, 'proposed');
    assert.equal(result.outputs.report.value.requestedAbsoluteMinute, 1080);
    assert.equal(result.outputs.report.value.elapsedMinutes, 480);
    assert.equal(result.outputs.report.value.interrupted, true);
    assert.equal(input.absoluteMinute, 360);
    assert.equal(result.reports[0].actualCalls, 0);
});

test('Advance Time catch-up orders input schedules and treats empty due collections as completed proposals', async () => {
    const node = { operation: 'advance-time', policy: 'catch-up' };
    const result = success(await executeTimeNode(node, { clock: artifact(clock(1430)), proposal: artifact({ kind: 'destination', absoluteMinute: 2900 }), schedules: artifact([{ scheduleId: 'dawn', kind: 'daily', minuteOfDay: 360 }, { scheduleId: 'midnight', kind: 'daily', minuteOfDay: 0 }]) }));
    assert.equal(result.outputs.clock.value.absoluteMinute, 2900);
    assert.deepEqual(result.outputs.occurrences.value.map(event => event.dueMinute), [1440, 1800, 2880]);
    assert.equal(result.outputs.remainder.value.minutes, 0);
    const empty = success(await executeTimeNode(node, { clock: artifact(clock()), proposal: artifact({ kind: 'duration', minutes: 30 }) }));
    assert.equal(empty.outputs.clock.value.absoluteMinute, 850);
    assert.deepEqual(empty.outputs.occurrences.value, []);
    assert.equal(empty.outputStates, undefined);
});

test('Advance Time holds ambiguous timing, overflow, backward time and bounded catch-up rather than yielding empty success', async () => {
    const node = { operation: 'advance-time', policy: 'catch-up', limit: 2 };
    for (const proposal of [{ kind: 'duration', minutes: 2, evidence: { kind: 'vague' } }, { kind: 'duration', minutes: 2, evidence: { kind: 'estimate', origin: 'guess' } }, { kind: 'destination', absoluteMinute: 0 }, { kind: 'duration', minutes: Number.MAX_SAFE_INTEGER }, { kind: 'duration', minutes: 2, hiddenHours: 8 }]) {
        const result = await executeTimeNode(node, { clock: artifact(clock()), proposal: artifact(proposal) });
        assert.equal(result.ok, false, JSON.stringify(proposal));
        assert.equal(result.outputs, undefined);
    }
    const bounded = await executeTimeNode(node, { clock: artifact(clock(0)), proposal: artifact({ kind: 'duration', minutes: 10000 }), schedules: artifact([{ scheduleId: 'every-minute', kind: 'interval', anchorMinute: 0, intervalMinutes: 1 }]) });
    assert.equal(bounded.error.code, 'OCCURRENCE_LIMIT');
    assert.equal(bounded.outputs, undefined);
});

test('Time Trigger enumerates midnight and 14:00 crossings including the endpoint but excluding the start', async () => {
    const daily = { operation: 'time-trigger', scheduleId: 'curse', mode: 'daily', minuteOfDay: 840, metadata: { subjectId: 'Mira', operation: 'set', value: { form: 'werewolf' } } };
    const result = success(await executeTimeNode(daily, { previous: artifact(clock(820)), destination: artifact(clock(840)) }));
    assert.deepEqual(result.outputs.occurrences.value.map(event => [event.dueMinute, event.day, event.schedule.subjectId]), [[840, 1, 'Mira']]);
    assert.equal(result.outputs.occurrences.value[0].occurrenceId, 'time:["story-2-clock","curse",1,840]');
    const start = success(await executeTimeNode(daily, { previous: artifact(clock(840)), destination: artifact(clock(900)) }));
    assert.deepEqual(start.outputs.occurrences.value, []);
    const midnight = success(await executeTimeNode({ ...daily, scheduleId: 'midnight', minuteOfDay: 0 }, { previous: artifact(clock(1430)), destination: artifact(clock(2880)) }));
    assert.deepEqual(midnight.outputs.occurrences.value.map(event => [event.dueMinute, event.day, event.minuteOfDay]), [[1440, 2, 0], [2880, 3, 0]]);
    assert.equal(midnight.outputs.report.value.policy, 'catch-up');
});

test('Time Trigger interval stays anchored every eight hours and delay fires only once', async () => {
    const interval = { operation: 'time-trigger', scheduleId: 'curse', mode: 'interval', anchorMinute: 360, intervalMinutes: 480, scheduleRevision: 2 };
    const result = success(await executeTimeNode(interval, { previous: artifact(clock(360)), destination: artifact(clock(1800)) }));
    assert.deepEqual(result.outputs.occurrences.value.map(event => event.dueMinute), [840, 1320, 1800]);
    assert.deepEqual(result.outputs.occurrences.value.map(event => event.scheduleRevision), [2, 2, 2]);
    const late = success(await executeTimeNode(interval, { previous: artifact(clock(900)), destination: artifact(clock(1800)) }));
    assert.deepEqual(late.outputs.occurrences.value.map(event => event.dueMinute), [1320, 1800]);
    const delayed = success(await executeTimeNode({ operation: 'time-trigger', scheduleId: 'one-time', mode: 'delay', dueMinute: 840 }, { previous: artifact(clock(360)), destination: artifact(clock(5000)) }));
    assert.deepEqual(delayed.outputs.occurrences.value.map(event => event.dueMinute), [840]);
});

test('Time Trigger consumes replay IDs without modifying the accepted ledger', async () => {
    const node = { operation: 'time-trigger', scheduleId: 'curse', mode: 'interval', anchorMinute: 360, intervalMinutes: 480, consumedIds: ['time:["story-2-clock","curse",1,840]'] };
    const input = clock(360, { settledTimeEventIds: ['time:["story-2-clock","curse",1,1320]'] });
    const result = success(await executeTimeNode(node, { previous: artifact(input), destination: artifact(clock(2280)), consumed: artifact(['time:["story-2-clock","curse",1,1800]']) }));
    assert.deepEqual(result.outputs.occurrences.value.map(event => event.dueMinute), [2280]);
    assert.deepEqual(input.settledTimeEventIds, ['time:["story-2-clock","curse",1,1320]']);
});

test('Time Trigger holds mismatched clock calendars, contradictory metadata, unknown modes and long bounded skips', async () => {
    const node = { operation: 'time-trigger', scheduleId: 'curse', mode: 'daily', minuteOfDay: 840, limit: 1 };
    for (const destination of [clock(900, { calendarId: 'other' }), clock(900, { clockId: 'other' }), clock(900, { dayLengthMinutes: 1000 }), clock(800)]) {
        const result = await executeTimeNode(node, { previous: artifact(clock(820)), destination: artifact(destination) });
        assert.equal(result.ok, false);
    }
    assert.equal(describeTimeNode({ ...node, mode: 'wall-clock' }).error.code, 'INVALID_SETTINGS');
    assert.equal(describeTimeNode({ ...node, metadata: { kind: 'interval' } }).error.code, 'INVALID_SETTINGS');
    const bounded = await executeTimeNode(node, { previous: artifact(clock(0)), destination: artifact(clock(10000)) });
    assert.equal(bounded.error.code, 'OCCURRENCE_LIMIT');
    assert.equal(bounded.outputs, undefined);
});

test('Clock capture rejects a changed source configuration while the host read is pending', async () => {
    const node = { operation: 'story-clock', clockId: 'story-2-clock' };
    const inputs = {};
    let release;
    const pending = executeTimeNode(node, inputs, { root: true, readStoryClock: () => new Promise(resolve => { release = resolve; }) });
    node.clockId = 'other';
    release({ ok: true, data: clock() });
    const stale = await pending;
    assert.equal(stale.ok, false);
    assert.equal(stale.error.code, 'STALE_INPUT');
    const secondNode = { operation: 'story-clock', clockId: 'story-2-clock' };
    const secondInputs = {};
    const second = executeTimeNode(secondNode, secondInputs, { root: true, readStoryClock: () => new Promise(resolve => { release = resolve; }) });
    secondInputs.injected = artifact(clock());
    release({ ok: true, data: clock() });
    assert.equal((await second).error.code, 'STALE_INPUT');
});

test('Clock capture ignores cancellation after awaiting the trusted source and does not evaluate accessor controls', async () => {
    const controller = new AbortController();
    const node = { operation: 'story-clock', clockId: 'story-2-clock' };
    let release;
    const pending = executeTimeNode(node, {}, { root: true, signal: controller.signal, readStoryClock: () => new Promise(resolve => { release = resolve; }) });
    controller.abort();
    release({ ok: true, data: clock() });
    assert.equal((await pending).error.code, 'ABORTED');
    let getterCalls = 0;
    const getterNode = { operation: 'story-clock' };
    Object.defineProperty(getterNode, 'clockId', { enumerable: true, get() { getterCalls++; return 'story-2-clock'; } });
    assert.equal(describeTimeNode(getterNode).ok, false);
    assert.equal((await executeTimeNode(getterNode, {})).ok, false);
    const fakeSignal = {};
    Object.defineProperty(fakeSignal, 'aborted', { enumerable: true, get() { getterCalls++; return false; } });
    const badSignal = await executeTimeNode(node, {}, { root: true, signal: fakeSignal, readStoryClock: async () => ({ ok: true, data: clock() }) });
    assert.equal(badSignal.ok, false);
    assert.equal(getterCalls, 0);
});

test('Time projections preserve private clock and schedule attribution on every derived artifact and due record', async () => {
    const privateClock = clock(820, { visibility: { kind: 'actor-private', actorId: 'Mira' }, scope: { actorId: 'Mira', chatId: 'Story-2' }, notes: { secret: 'curse' } });
    const result = success(await executeTimeNode({ operation: 'advance-time', policy: 'catch-up', schedules: [{ scheduleId: 'curse', kind: 'daily', minuteOfDay: 840 }] }, { clock: artifact(privateClock), proposal: artifact({ kind: 'duration', minutes: 30 }) }));
    for (const output of Object.values(result.outputs)) assert.deepEqual(output.visibility, { kind: 'actor-private', actorId: 'Mira' });
    assert.deepEqual(result.outputs.occurrences.value[0].visibility, { kind: 'actor-private', actorId: 'Mira' });
    assert.deepEqual(result.outputs.clock.value.scope, { actorId: 'Mira', chatId: 'Story-2' });
    const schedule = success(await executeTimeNode({ operation: 'time-trigger', scheduleId: 'private-curse', metadata: { visibility: 'actor-private', actorId: 'Mira', subjectId: 'Mira' } }, { previous: artifact(clock()), destination: artifact(clock(900)) }));
    assert.deepEqual(schedule.outputs.occurrences.visibility, { kind: 'actor-private', actorId: 'Mira' });
    assert.deepEqual(schedule.outputs.occurrences.value[0].visibility, { kind: 'actor-private', actorId: 'Mira' });
    const empty = success(await executeTimeNode({ operation: 'time-trigger', scheduleId: 'private-curse' }, { previous: artifact(privateClock), destination: artifact(clock(830, { visibility: { kind: 'actor-private', actorId: 'Mira' } })) }));
    assert.deepEqual(empty.outputs.occurrences.value, []);
    assert.deepEqual(empty.outputs.occurrences.visibility, { kind: 'actor-private', actorId: 'Mira' });
});

test('Story Clock requires explicit root authority and validates trusted failure Results', async () => {
    let calls = 0;
    const local = { readStoryClock: async () => { calls++; return { ok: true, data: clock() }; } };
    const node = { operation: 'story-clock', clockId: 'story-2-clock' };
    const result = await executeTimeNode(node, {}, local);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'ROOT_ONLY');
    assert.equal(calls, 0);
    const malformed = await executeTimeNode(node, {}, { root: true, readStoryClock: async () => ({ ok: false, error: { code: 7, message: 'bad' } }) });
    assert.equal(malformed.error.code, 'INVALID_CLOCK');
    const rejected = await executeTimeNode(node, {}, { root: true, readStoryClock: async () => ({ ok: false, error: { code: 'CLOCK_NOT_FOUND', message: 'Choose an authored initial clock.' }, extra: 'private debug' }) });
    assert.deepEqual(rejected, { ok: false, error: { code: 'CLOCK_NOT_FOUND', message: 'Choose an authored initial clock.' } });
});

test('Explicit null schedules or consumed ledgers hold rather than silently substituting defaults', async () => {
    const node = { operation: 'advance-time', policy: 'catch-up' };
    const inputs = { clock: artifact(clock()), proposal: artifact({ kind: 'duration', minutes: 90 }) };
    assert.equal((await executeTimeNode(node, { ...inputs, schedules: artifact(null) })).ok, false);
    assert.equal((await executeTimeNode(node, { ...inputs, consumed: artifact(null) })).ok, false);
    assert.equal((await executeTimeNode({ operation: 'time-trigger', scheduleId: 'curse' }, { previous: artifact(clock()), destination: artifact(clock(900)), consumed: artifact(null) })).ok, false);
});

test('Time adapter descriptions reject malformed authored schedules and accessor routing without invoking hooks', () => {
    assert.equal(describeTimeNode({ operation: 'advance-time', schedules: ['not a record'] }).ok, false);
    for (const node of [{ operation: 'advance-time', policy: 'guess' }, { operation: 'advance-time', limit: 0 }, { operation: 'time-trigger', scheduleId: 'curse', intervalMinutes: 0 }, { operation: 'time-trigger', scheduleId: 'curse', consumedIds: [4] }, { operation: 'time-trigger', scheduleId: 'curse', metadata: [] }]) assert.equal(describeTimeNode(node).ok, false);
    let calls = 0;
    const node = {};
    Object.defineProperty(node, 'operation', { enumerable: true, get() { calls++; return 'advance-time'; } });
    assert.equal(describeTimeNode(node).ok, false);
    const options = {};
    Object.defineProperty(options, 'phase', { enumerable: true, get() { calls++; return 'pre'; } });
    assert.equal(describeTimeNode({ operation: 'advance-time' }, options).ok, false);
    assert.equal(calls, 0);
});

test('Pure projections use authored custom calendars with zero model and host requests', async () => {
    let calls = 0;
    const local = { phase: 'post', request: async () => { calls++; throw new Error('Unexpected model request'); }, readStoryClock: async () => { calls++; throw new Error('Unexpected host clock read'); } };
    const result = success(await executeTimeNode({ operation: 'advance-time', policy: 'catch-up', schedules: [{ scheduleId: 'midnight', kind: 'daily', minuteOfDay: 0 }] }, { clock: artifact(clock(990, { dayLengthMinutes: 1000 })), proposal: artifact({ kind: 'duration', minutes: 20, evidence: { kind: 'authored-rule', origin: 'known route' } }) }, local));
    assert.equal(result.outputs.clock.value.absoluteMinute, 1010);
    assert.deepEqual(result.outputs.occurrences.value.map(event => [event.dueMinute, event.day, event.minuteOfDay]), [[1000, 2, 0]]);
    assert.equal(calls, 0);
    assert.deepEqual(result.outputs.clock.value.timeEvidence, { kind: 'authored-rule', origin: 'known route' });
    assert.equal(result.reports[0].actualCalls, 0);
});

test('Named Data admission holds missing inputs, unsupported inputs, accessor payloads and ambiguous schedule sources', async () => {
    assert.equal((await executeTimeNode({ operation: 'advance-time' }, {})).error.code, 'MISSING_INPUT');
    const node = { operation: 'advance-time', schedules: [{ scheduleId: 'curse', kind: 'daily', minuteOfDay: 840 }] };
    const inputs = { clock: artifact(clock()), proposal: artifact({ kind: 'duration', minutes: 30 }) };
    assert.equal((await executeTimeNode(node, { ...inputs, schedules: artifact([]) })).error.code, 'AMBIGUOUS_SCHEDULES');
    assert.equal((await executeTimeNode(node, { ...inputs, reply: artifact('irrelevant') })).error.code, 'UNSUPPORTED_INPUT');
    let calls = 0;
    const value = {};
    Object.defineProperty(value, 'kind', { enumerable: true, get() { calls++; return 'duration'; } });
    assert.equal((await executeTimeNode(node, { ...inputs, proposal: artifact(value) })).ok, false);
    assert.equal(calls, 0);
    const controller = new AbortController(); controller.abort();
    assert.equal((await executeTimeNode(node, inputs, { signal: controller.signal })).error.code, 'ABORTED');
});

test('Mixed private actors and restricted ledgers strengthen derived visibility to hidden', async () => {
    const node = { operation: 'time-trigger', scheduleId: 'curse', metadata: { visibility: 'actor-private', actorId: 'Laya' } };
    const previous = clock(820, { visibility: 'actor-private', actorId: 'Mira' });
    const result = success(await executeTimeNode(node, { previous: artifact(previous), destination: artifact(clock(900, { visibility: 'public' })) }));
    assert.deepEqual(result.outputs.occurrences.visibility, { kind: 'hidden' });
    assert.deepEqual(result.outputs.occurrences.value[0].visibility, { kind: 'hidden' });
    assert.equal(result.outputs.report.value.previousClock.visibility, 'actor-private');
    const restricted = success(await executeTimeNode({ operation: 'advance-time', policy: 'catch-up' }, { clock: artifact(clock()), proposal: artifact({ kind: 'duration', minutes: 30 }), consumed: { ...artifact([]), visibility: { kind: 'hidden' } } }));
    assert.deepEqual(restricted.outputs.clock.visibility, { kind: 'hidden' });
    assert.deepEqual(restricted.outputs.remainder.visibility, { kind: 'hidden' });
});

test('Cancellation checks never invoke an own aborted accessor on a genuine signal', async () => {
    const controller = new AbortController();
    let calls = 0;
    Object.defineProperty(controller.signal, 'aborted', { get() { calls++; return false; } });
    const node = { operation: 'advance-time' };
    const inputs = { clock: artifact(clock()), proposal: artifact({ kind: 'duration', minutes: 30 }) };
    const active = success(await executeTimeNode(node, inputs, { signal: controller.signal }));
    assert.equal(active.outputs.clock.value.absoluteMinute, 850);
    assert.equal(calls, 0);
    controller.abort();
    const stopped = await executeTimeNode(node, inputs, { signal: controller.signal });
    assert.equal(stopped.error.code, 'ABORTED');
    assert.equal(calls, 0);
});

test('Implicit private introspection in clock metadata restricts all clock, advance and trigger outputs', async () => {
    const notes = { schemaVersion: 1, recordType: 'reflection', scope: { actorId: 'Mira', chatId: 'Story-2' }, summary: 'Private feelings' };
    const privateClock = clock(820, { notes });
    const captured = success(await executeTimeNode({ operation: 'story-clock', clockId: 'story-2-clock' }, {}, { root: true, readStoryClock: async () => ({ ok: true, data: privateClock }) }));
    assert.deepEqual(captured.outputs.out.visibility, { kind: 'actor-private', actorId: 'Mira' });
    assert.deepEqual(captured.outputs.out.value.notes, notes);
    const advanced = success(await executeTimeNode({ operation: 'advance-time', policy: 'catch-up', schedules: [{ scheduleId: 'curse', kind: 'daily', minuteOfDay: 840 }] }, { clock: artifact(privateClock), proposal: artifact({ kind: 'duration', minutes: 30 }) }));
    for (const output of Object.values(advanced.outputs)) assert.deepEqual(output.visibility, { kind: 'actor-private', actorId: 'Mira' });
    assert.deepEqual(advanced.outputs.occurrences.value[0].visibility, { kind: 'actor-private', actorId: 'Mira' });
    const triggered = success(await executeTimeNode({ operation: 'time-trigger', scheduleId: 'curse' }, { previous: artifact(privateClock), destination: artifact(clock(900)) }));
    for (const output of Object.values(triggered.outputs)) assert.deepEqual(output.visibility, { kind: 'actor-private', actorId: 'Mira' });
    assert.deepEqual(triggered.outputs.occurrences.value[0].visibility, { kind: 'actor-private', actorId: 'Mira' });
});

test('Implicit private schedule records resist public labels and become hidden without valid actor scope', async () => {
    for (const recordType of ['actor-state', 'reflection', 'state-proposal', 'episodes', 'commit-intent']) {
        const metadata = { visibility: 'public', privateNote: { schemaVersion: 1, recordType, scope: { actorId: 'Mira', chatId: 'Story-2' }, summary: 'Private feelings' } };
        const triggered = success(await executeTimeNode({ operation: 'time-trigger', scheduleId: 'curse', metadata }, { previous: artifact(clock()), destination: artifact(clock(900)) }));
        assert.deepEqual(triggered.outputs.occurrences.visibility, { kind: 'actor-private', actorId: 'Mira' }, recordType);
        assert.deepEqual(triggered.outputs.occurrences.value[0].visibility, { kind: 'actor-private', actorId: 'Mira' }, recordType);
        assert.deepEqual(triggered.outputs.report.visibility, { kind: 'actor-private', actorId: 'Mira' }, recordType);
        const advanced = success(await executeTimeNode({ operation: 'advance-time', policy: 'catch-up', schedules: [{ scheduleId: 'curse', kind: 'daily', minuteOfDay: 840, ...metadata }] }, { clock: artifact(clock()), proposal: artifact({ kind: 'duration', minutes: 30 }) }));
        for (const output of Object.values(advanced.outputs)) assert.deepEqual(output.visibility, { kind: 'actor-private', actorId: 'Mira' }, recordType);
    }
    const hidden = success(await executeTimeNode({ operation: 'time-trigger', scheduleId: 'curse', metadata: { privateNote: { recordType: 'reflection', scope: { actorId: '' }, summary: 'Private feelings' } } }, { previous: artifact(clock()), destination: artifact(clock(900)) }));
    assert.deepEqual(hidden.outputs.occurrences.visibility, { kind: 'hidden' });
    assert.deepEqual(hidden.outputs.occurrences.value[0].visibility, { kind: 'hidden' });
    assert.deepEqual(hidden.outputs.report.visibility, { kind: 'hidden' });
});

test('Story Clock replaces known host failure messages with controlled local diagnostics', async () => {
    const result = await executeTimeNode({ operation: 'story-clock', clockId: 'story-2-clock' }, {}, { root: true, readStoryClock: async () => ({ ok: false, error: { code: 'CLOCK_NOT_FOUND', message: 'Mira private storage path: /private/clock-secret', details: { token: 'clock-secret' } }, debug: 'clock-secret' }) });
    assert.deepEqual(result, { ok: false, error: { code: 'CLOCK_NOT_FOUND', message: 'Choose an authored initial clock.' } });
    assert.equal(JSON.stringify(result).includes('clock-secret'), false);
    const stale = await executeTimeNode({ operation: 'story-clock', clockId: 'story-2-clock' }, {}, { root: true, readStoryClock: async () => ({ ok: false, error: { code: 'STALE_INPUT', message: 'Private internal revision: clock-secret' } }) });
    assert.deepEqual(stale, { ok: false, error: { code: 'STALE_INPUT', message: 'The accepted story clock changed; capture it again.' } });
});

test('Story Clock replaces arbitrary host diagnostic codes and rejects failure accessors without invoking them', async () => {
    for (const code of ['Mira-clock-secret', 'toString', 'constructor', '/private/clock-secret']) {
        const result = await executeTimeNode({ operation: 'story-clock', clockId: 'story-2-clock' }, {}, { root: true, readStoryClock: async () => ({ ok: false, error: { code, message: 'Private clock-secret' } }) });
        assert.deepEqual(result, { ok: false, error: { code: 'STORY_CLOCK_FAILED', message: 'The accepted story clock could not be captured.' } });
        assert.equal(JSON.stringify(result).includes('clock-secret'), false);
    }
    let calls = 0;
    const error = { code: 'CLOCK_NOT_FOUND' };
    Object.defineProperty(error, 'message', { enumerable: true, get() { calls++; return '/private/clock-secret'; } });
    const getter = await executeTimeNode({ operation: 'story-clock', clockId: 'story-2-clock' }, {}, { root: true, readStoryClock: async () => ({ ok: false, error }) });
    assert.equal(getter.error.code, 'INVALID_CLOCK');
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(getter).includes('clock-secret'), false);
});
