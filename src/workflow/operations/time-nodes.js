import { advanceStoryClock, enumerateScheduledOccurrences, resolveTimeAdvance } from '../story-time.js?v=0.27.1';
import { cloneJsonValue, stringifyJsonValue } from './json-data.js?v=0.27.1';
import { freeze } from '../record-data.js?v=0.27.1';
import { workflowDataPresetFor } from '../workflow-data-defaults.js?v=0.27.1';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const own = (value, key, fallback) => {
    if (!plain(value)) throw new Error('Plain own data required.');
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property) return fallback;
    if (!property.enumerable || !Object.hasOwn(property, 'value')) throw new Error('Own data required.');
    return property.value;
};
const id = value => typeof value === 'string' && !!value.trim() && value.length <= 256;
const pin = (id, label, direction, required = false) => ({ id, label, direction, kind: 'data', required, cardinality: 'one' });
const stringControl = (label, value = '') => ({ type: 'string', label, default: value, maxLength: 256 });
const occurrenceControls = {
    limit: { type: 'integer', label: 'Due event limit', default: 1000, min: 1, max: 10000, help: 'A limit overflow holds the whole time projection.' },
    consumedIds: { type: 'array', label: 'Already settled occurrence IDs', default: [], items: 'string', max: 1000 },
};
const registration = (id, title, controlDescriptors, extra = {}) => ({
    id, title, family: id === 'story-clock' ? 'Input' : id === 'time-trigger' ? 'Derive' : 'Shaping', phase: 'both', operationVersion: 1, minimumSchema: 3, minimumRuntime: 2,
    input: 'data', output: 'data', controls: Object.keys(controlDescriptors), controlDescriptors,
    defaults: Object.fromEntries(Object.entries(controlDescriptors).map(([key, control]) => [key, structuredClone(control.default)])),
    requestBound: 0, modelRole: null, terminal: false, dynamicPorts: true, ...extra,
});
export const TIME_OPERATIONS = {
    'commit-clock': registration('commit-clock','Clock Commit',{}, {family:'Output',phase:'post',rootOnly:true,hostOperation:true,terminal:true}),
    'story-clock': registration('story-clock', 'Story Clock', {
        clockId: stringControl('Clock', workflowDataPresetFor('story-clock').targetId), calendarId: stringControl('Expected calendar (optional)'),
    }, { input: null, rootOnly: true, hostOperation: true }),
    'time-trigger': registration('time-trigger', 'Time Trigger', {
        mode: { type: 'enum', label: 'Schedule mode', default: 'daily', values: ['daily', 'interval', 'delay'] },
        scheduleId: stringControl('Schedule identity'),
        scheduleRevision: { type: 'integer', label: 'Schedule revision', default: 1, min: 1, max: Number.MAX_SAFE_INTEGER },
        clockId: stringControl('Expected clock (optional)'), calendarId: stringControl('Expected calendar (optional)'),
        minuteOfDay: { type: 'integer', label: 'Daily minute (00:00 = 0; 14:00 = 840)', default: 840, min: 0, max: Number.MAX_SAFE_INTEGER, visibleWhen: { key: 'mode', value: 'daily' } },
        anchorMinute: { type: 'integer', label: 'Interval origin minute', default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, visibleWhen: { key: 'mode', value: 'interval' } },
        intervalMinutes: { type: 'integer', label: 'Interval minutes (8 hours = 480)', default: 480, min: 1, max: Number.MAX_SAFE_INTEGER, visibleWhen: { key: 'mode', value: 'interval' } },
        dueMinute: { type: 'integer', label: 'One-time due minute', default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, visibleWhen: { key: 'mode', value: 'delay' } },
        order: { type: 'integer', label: 'Simultaneous event order', default: 0, min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
        metadata: { type: 'object', label: 'Attributed consequence and scope', default: {}, max: 128, editor: 'json', help: 'Retain subject, visibility and authored consequence; schedule identity and timing come from their dedicated controls.' },
        ...occurrenceControls,
    }),
    'advance-time': registration('advance-time', 'Advance Time', {
        policy: { type: 'enum', label: 'Due-event policy', default: 'interrupt', values: ['interrupt', 'catch-up'], help: 'Interruption retains the unprocessed duration; catch-up enumerates all due events within the bound.' },
        schedules: { type: 'array', label: 'Authored schedules', default: [], items: 'record', max: 1000, editor: 'json' },
        ...occurrenceControls,
    }),
};
function resolve(node, options = {}) {
    if (!plain(node) || !plain(options)) return fail('INVALID_SETTINGS', 'Time node settings require plain own data.');
    const operation = own(node, 'operation');
    const base = Object.hasOwn(TIME_OPERATIONS, operation) && TIME_OPERATIONS[operation];
    if (!base) return fail('UNKNOWN_OPERATION', 'Unknown Time operation.');
    if (own(node, 'operationVersion', 1) !== 1) return fail('INVALID_SETTINGS', 'Time operation version must be 1.');
    const phase = own(options, 'phase') ?? own(node, 'phase') ?? (base.phase === 'post' ? 'post' : 'pre');
    if (!['pre', 'post'].includes(phase) || own(node, 'phase') !== undefined && own(node, 'phase') !== phase) return fail('INVALID_PHASE', 'Time operation must match its effective phase.');
    if (base.phase === 'post' && phase !== 'post') return fail('INVALID_PHASE','Clock Commit is a Post operation.');
    const settings = {};
    for (const key of base.controls) {
        const checked = cloneJsonValue(own(node, key, base.defaults[key]));
        if (!checked.ok) return fail('INVALID_SETTINGS', 'Time controls require bounded own JSON.');
        settings[key] = operation === 'story-clock' && key === 'clockId' && checked.data.value === '' ? base.defaults.clockId : checked.data.value;
        const control = base.controlDescriptors[key];
        const value = settings[key];
        if (control.type === 'string' && (typeof value !== 'string' || value.length > control.maxLength)
            || control.type === 'integer' && (!Number.isSafeInteger(value) || value < control.min || value > control.max)
            || control.type === 'enum' && !control.values.includes(value)
            || control.type === 'array' && (!Array.isArray(value) || value.length > control.max || control.items === 'record' && value.some(item => !plain(item)))) return fail('INVALID_SETTINGS', 'Use supported bounded Time controls.');
    }
    if (operation === 'story-clock' && (!id(settings.clockId) || settings.calendarId !== '' && !id(settings.calendarId))) return fail('INVALID_SETTINGS', 'Select an explicit clock and optional calendar identity.');
    if (operation === 'time-trigger' && (!id(settings.scheduleId) || settings.clockId !== '' && !id(settings.clockId) || settings.calendarId !== '' && !id(settings.calendarId) || !plain(settings.metadata) || Object.keys(settings.metadata).length > 128 || Object.keys(settings.metadata).some(key => ['scheduleId', 'revision', 'kind', 'clockId', 'calendarId', 'minuteOfDay', 'anchorMinute', 'intervalMinutes', 'dueMinute', 'order'].includes(key)))) return fail('INVALID_SETTINGS', 'Time Trigger requires an identity and noncontradictory bounded schedule metadata.');
    if (settings.consumedIds && settings.consumedIds.some(value => typeof value !== 'string' || !value.length || value.length > 4096)) return fail('INVALID_SETTINGS', 'Consumed occurrence IDs require bounded nonempty strings.');
    const ports = operation === 'commit-clock' ? [pin('projection','Advance Time report','input',true),pin('occurrences','Additional checked due events','input'),pin('receipt','Staged clock receipt','output')] : operation === 'story-clock' ? [pin('out', 'Accepted Story Clock', 'output')] : operation === 'time-trigger' ? [
        pin('previous', 'Previous Story Clock', 'input', true), pin('destination', 'Projected Story Clock', 'input', true), pin('consumed', 'Settled occurrence IDs (optional)', 'input'),
        pin('occurrences', 'Ordered due events', 'output'), pin('report', 'Time trigger report', 'output'),
    ] : [
        pin('clock', 'Previous Story Clock', 'input', true), pin('proposal', 'Explicit time proposal', 'input', true),
        pin('schedules', 'Authored schedules (optional)', 'input'), pin('consumed', 'Settled occurrence IDs (optional)', 'input'),
        pin('clock', 'Projected Story Clock', 'output'), pin('occurrences', 'Ordered due events', 'output'), pin('remainder', 'Remaining duration', 'output'), pin('report', 'Time projection report', 'output'),
    ];
    return { ok: true, data: { descriptor: { ...base, phase }, settings, ports } };
}
export function describeTimeNode(node, options = {}) {
    try { const result = resolve(node, options); if (!result.ok) return result; return { ok: true, data: { descriptor: result.data.descriptor, ports: result.data.ports } }; }
    catch { return fail('INVALID_SETTINGS', 'Time controls and routing metadata require own data.'); }
}
function checkedClock(value) {
    const result = advanceStoryClock(value, { kind: 'duration', minutes: 0 });
    return result.ok ? { ok: true, data: result.data.previousClock } : result;
}
const dataArtifact = (value, visibility) => ({ kind: 'data', value, ...(visibility ? { visibility } : {}) });
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const isStopped = signal => signal === undefined ? false : nativeAborted.call(signal);
function capturedSignal(local) {
    const signal = own(local, 'signal');
    if (signal === undefined) return undefined;
    isStopped(signal);
    return signal;
}
function visibilityFor(...values) {
    const restrictions = [];
    const visit = value => {
        if (value === null || typeof value !== 'object') return;
        if (Object.hasOwn(value, 'visibility')) {
            const mark = value.visibility;
            if (mark === 'public' || mark?.kind === 'public') { /* Nested restrictions still apply. */ }
            else if (plain(mark) && mark.kind === 'actor-private' && id(mark.actorId)) restrictions.push({ kind: 'actor-private', actorId: mark.actorId });
            else if (mark === 'actor-private' && id(value.actorId ?? value.scope?.actorId)) restrictions.push({ kind: 'actor-private', actorId: value.actorId ?? value.scope.actorId });
            else restrictions.push({ kind: 'hidden' });
        }
        if (Object.hasOwn(value, 'visibleTo')) restrictions.push({ kind: 'hidden' });
        if (['actor-state', 'reflection', 'state-proposal', 'episodes', 'commit-intent'].includes(value.recordType)) restrictions.push(id(value.scope?.actorId) ? { kind: 'actor-private', actorId: value.scope.actorId } : { kind: 'hidden' });
        Object.values(value).forEach(visit);
    };
    values.forEach(visit);
    if (!restrictions.length) return { kind: 'public' };
    const first = restrictions[0];
    return restrictions.every(mark => mark.kind === first.kind && mark.actorId === first.actorId) ? first : { kind: 'hidden' };
}
function captureFingerprint(node, resolved, inputs) {
    return stringifyJsonValue({ operation: resolved.descriptor.id, phase: resolved.descriptor.phase, nodeId: own(node, 'id', null), settings: resolved.settings, inputs });
}
function admittedInputs(raw, ports) {
    const result = cloneJsonValue(raw);
    if (!result.ok || !plain(result.data.value)) return fail('INVALID_INPUT', 'Time operations require bounded named Data artifacts.');
    const inputs = result.data.value;
    const allowed = ports.filter(port => port.direction === 'input');
    if (Object.keys(inputs).some(key => !allowed.some(port => port.id === key))) return fail('UNSUPPORTED_INPUT', 'Unsupported Time input.');
    for (const port of allowed) {
        if (!Object.hasOwn(inputs, port.id)) { if (port.required) return fail('MISSING_INPUT', 'Required Time input is missing: ' + port.id); continue; }
        const artifact = inputs[port.id];
        if (!plain(artifact) || artifact.kind !== 'data' || !Object.hasOwn(artifact, 'value')) return fail('INVALID_INPUT', 'Time input requires an explicit Data artifact.');
    }
    return { ok: true, data: inputs };
}
function outputResult(operation, outputs, summary = {}, visibility = { kind: 'public' }) {
    for (const [key, artifact] of Object.entries(outputs)) {
        artifact.visibility = visibility;
        if (visibility.kind !== 'public' && key === 'occurrences') artifact.value = artifact.value.map(event => ({ ...event, visibility }));
        if (visibility.kind !== 'public' && ['report', 'remainder'].includes(key)) artifact.value = { ...artifact.value, visibility };
    }
    const checked = cloneJsonValue({ ok: true, outputs, reports: [{ operation, actualCalls: 0, status: 'proposed', ...summary }] });
    return checked.ok ? freeze(checked.data.value) : fail('OUTPUT_LIMIT', 'Time outputs exceed the bounded portable JSON budget.');
}
function projectAdvance(settings, inputs) {
    if (inputs.schedules && settings.schedules.length) return fail('AMBIGUOUS_SCHEDULES', 'Use either connected schedules or authored schedules, not both.');
    const schedules = Object.hasOwn(inputs, 'schedules') ? inputs.schedules.value : settings.schedules;
    const consumed = Object.hasOwn(inputs, 'consumed') ? inputs.consumed.value : [];
    if (!Array.isArray(consumed)) return fail('INVALID_OPTIONS', 'Settled occurrence IDs must be an explicit array.');
    const result = resolveTimeAdvance(inputs.clock.value, inputs.proposal.value, schedules, { policy: settings.policy, limit: settings.limit, consumedIds: [...settings.consumedIds, ...consumed] });
    if (!result.ok) return result;
    const { clock, occurrences, ...report } = result.data;
    return outputResult('advance-time', {
        clock: dataArtifact(clock), occurrences: dataArtifact(occurrences),
        remainder: dataArtifact({ kind: 'duration', minutes: report.remainingMinutes, evidence: report.evidence }),
        report: dataArtifact({ ...report, status: 'proposed', effectiveAbsoluteMinute: clock.absoluteMinute, occurrenceCount: occurrences.length }),
    }, { occurrenceCount: occurrences.length, interrupted: report.interrupted }, visibilityFor(inputs, settings.schedules));
}
function projectTrigger(settings, inputs) {
    const previous = checkedClock(inputs.previous.value);
    if (!previous.ok) return previous;
    const destination = checkedClock(inputs.destination.value);
    if (!destination.ok) return destination;
    const clock = previous.data, next = destination.data;
    if (['clockId', 'calendarId', 'dayLengthMinutes'].some(key => clock[key] !== next[key]) || settings.clockId !== '' && clock.clockId !== settings.clockId || settings.calendarId !== '' && clock.calendarId !== settings.calendarId) return fail('CLOCK_SCOPE_MISMATCH', 'Previous and destination clocks must share the selected identity and calendar.');
    const schedule = {
        ...settings.metadata, scheduleId: settings.scheduleId, revision: settings.scheduleRevision, kind: settings.mode,
        clockId: clock.clockId, calendarId: clock.calendarId, order: settings.order,
        ...(settings.mode === 'daily' ? { minuteOfDay: settings.minuteOfDay } : settings.mode === 'interval' ? { anchorMinute: settings.anchorMinute, intervalMinutes: settings.intervalMinutes } : { dueMinute: settings.dueMinute }),
    };
    const consumed = Object.hasOwn(inputs, 'consumed') ? inputs.consumed.value : [];
    if (!Array.isArray(consumed)) return fail('INVALID_OPTIONS', 'Settled occurrence IDs must be an explicit array.');
    const result = enumerateScheduledOccurrences(clock, next.absoluteMinute, [schedule], { limit: settings.limit, consumedIds: [...settings.consumedIds, ...consumed] });
    if (!result.ok) return result;
    return outputResult('time-trigger', {
        occurrences: dataArtifact(result.data.occurrences),
        report: dataArtifact({ status: 'proposed', policy: 'catch-up', clockId: clock.clockId, calendarId: clock.calendarId, previousClock: clock, destinationClock: next, schedule, occurrenceCount: result.data.occurrences.length, actualCalls: 0 }),
    }, { occurrenceCount: result.data.occurrences.length }, visibilityFor(inputs, schedule));
}
const clockFailureMessages = {
    CLOCK_NOT_FOUND: 'Choose an authored initial clock.',
    CLOCK_SCOPE_MISMATCH: 'The captured clock must match the selected identity and calendar.',
    CLOCK_REVISION_CONFLICT: 'The accepted story clock changed; capture it again.',
    INVALID_CLOCK: 'The accepted story clock is invalid.',
    STORY_CLOCK_MISSING: 'The trusted host must supply the accepted story clock.',
    STORY_CLOCK_FAILED: 'The accepted story clock could not be captured.',
    STALE_INPUT: 'The accepted story clock changed; capture it again.',
    ABORTED: 'Story Clock capture was stopped.',
    SERVICE_UNAVAILABLE: 'The accepted story clock service is unavailable.',
};
function controlledClockFailure(error) {
    if (!plain(error) || typeof error.code !== 'string' || !error.code.length || error.code.length > 128 || typeof error.message !== 'string' || !error.message.length || error.message.length > 2048) return fail('INVALID_CLOCK', 'Clock capture failure requires bounded diagnostic code and message.');
    const code = Object.hasOwn(clockFailureMessages, error.code) ? error.code : 'STORY_CLOCK_FAILED';
    return fail(code, clockFailureMessages[code]);
}
export async function executeTimeNode(node, inputs, local = {}) {
    try {
        const resolved = resolve(node, { phase: own(local, 'phase') });
        if (!resolved.ok) return resolved;
        const { settings, descriptor, ports } = resolved.data;
        const admitted = admittedInputs(inputs, ports);
        if (!admitted.ok) return admitted;
        const signal = capturedSignal(local);
        if (isStopped(signal)) return fail('ABORTED', 'Time projection was stopped.');
        if (['advance-time','time-trigger'].includes(descriptor.id)) {
            const result = descriptor.id === 'advance-time' ? projectAdvance(settings, admitted.data) : projectTrigger(settings, admitted.data);
            const retain = own(local,'retainTimeProjection');
            if (result.ok && retain !== undefined) {
                if (typeof retain !== 'function') return fail('TIME_PROJECTION_FAILED','Time retention requires a trusted host capability.');
                let retained; try { retained = await retain({operation:descriptor.id,inputs,settings,outputs:result.outputs}); } catch { return fail('TIME_PROJECTION_FAILED','The trusted time projection could not be retained.'); }
                if (isStopped(signal)) return fail('ABORTED','The time projection was stopped.');
                if (retained?.ok !== true) return fail('TIME_PROJECTION_FAILED','The captured clock changed while retaining its projection.');
            }
            return result;
        }
        if (own(local, 'root') !== true) return fail('ROOT_ONLY', 'Accepted clock capture is reserved for a root workflow.');
        if (descriptor.id === 'commit-clock') {
            const stage = own(local,'stageStoryClock');
            if (typeof stage !== 'function') return fail('HOST_OPERATION_REQUIRED','Clock Commit requires a trusted accepted-state host.');
            let staged; try { staged = await stage(inputs.projection.value,inputs.occurrences?.value); } catch { return fail('CLOCK_COMMIT_FAILED','The clock projection could not be staged.'); }
            if (isStopped(signal)) return fail('ABORTED','Clock staging was stopped.');
            if (staged?.ok !== true) return fail('CLOCK_COMMIT_FAILED','The captured time projection could not be staged; verify its clock and accepted occurrence history.');
            const checked = cloneJsonValue(staged.data);
            if (!checked.ok) return fail('CLOCK_COMMIT_FAILED','Clock staging requires a bounded descriptive receipt.');
            const receipt=dataArtifact(checked.data.value,visibilityFor(admitted.data));
            return freeze({ok:true,artifact:receipt,outputs:{receipt},reports:[{operation:descriptor.id,actualCalls:0,status:'staged'}]});
        }
        const fingerprint = captureFingerprint(node, resolved.data, admitted.data);
        if (!fingerprint.ok) return fail('INVALID_INPUT', 'The clock source identity must be bounded own data.');
        const read = own(local, 'readStoryClock');
        if (typeof read !== 'function') return fail('STORY_CLOCK_MISSING', 'The trusted host must supply the accepted story clock.');
        let raw;
        try { raw = await read(settings.clockId, { signal }); }
        catch { return fail(isStopped(signal) ? 'ABORTED' : 'STORY_CLOCK_FAILED', 'The accepted story clock could not be captured.'); }
        if (isStopped(signal)) return fail('ABORTED', 'Ignore the stopped story clock capture.');
        let current;
        try {
            const latest = resolve(node, { phase: resolved.data.descriptor.phase });
            if (latest.ok) current = captureFingerprint(node, latest.data, inputs);
        } catch { /* A changed accessor or malformed source holds the result. */ }
        if (!current?.ok || current.data.text !== fingerprint.data.text) return fail('STALE_INPUT', 'Story Clock source settings or inputs changed during capture.');
        const admittedResponse = cloneJsonValue(raw);
        if (!admittedResponse.ok || !plain(admittedResponse.data.value)) return fail('INVALID_CLOCK', 'Story Clock requires a bounded successful Result.');
        const response = admittedResponse.data.value;
        if (response.ok === false) return controlledClockFailure(response.error);
        if (response.ok !== true) return fail('INVALID_CLOCK', 'Story Clock requires a successful captured Result.');
        const validated = checkedClock(response.data);
        if (!validated.ok) return validated;
        const clock = validated.data;
        if (clock.schemaVersion !== 1 || !Number.isSafeInteger(clock.revision) || clock.revision < 1) return fail('INVALID_CLOCK', 'Accepted clocks require schema 1 and a positive persisted revision.');
        if (clock.clockId !== settings.clockId || settings.calendarId !== '' && clock.calendarId !== settings.calendarId) return fail('CLOCK_SCOPE_MISMATCH', 'The captured clock must match the selected identity and calendar.');
        return freeze({ ok: true, outputs: { out: dataArtifact(clock, visibilityFor(clock)) }, reports: [{ operation: 'story-clock', actualCalls: 0, status: 'captured', clockId: clock.clockId, revision: clock.revision }] });
    } catch { return fail('INVALID_INPUT', 'Time inputs and execution metadata require own data.'); }
}
