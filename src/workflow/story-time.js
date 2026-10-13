import { cloneJsonValue, stringifyJsonValue } from './operations/json-data.js?v=0.27.2';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const integer = value => Number.isSafeInteger(value) && value >= 0;
const own = (value, key) => Object.hasOwn(value, key) ? value[key] : undefined;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const ids = value => Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 4096);

export function enumerateScheduledOccurrences(rawClock, destination, rawSchedules, rawOptions = {}) {
    const admitted = validateStoryClock(rawClock);
    if (!admitted.ok) return admitted;
    const clock = admitted.data;
    if (!integer(destination) || destination < clock.absoluteMinute) return fail('INVALID_DESTINATION', 'Destination must be a forward safe-integer minute.');
    const admittedSchedules = validateStorySchedules(rawSchedules, clock);
    if (!admittedSchedules.ok) return admittedSchedules;
    const admittedOptions = readOptions(rawOptions);
    if (!admittedOptions.ok) return admittedOptions;
    const schedules = admittedSchedules.data;
    const options = admittedOptions.data;
    const occurrences = [];
    let outputBytes = 18;
    let outputError = null;
    const limit = options.limit ?? 1000;
    const overflow = () => fail('OCCURRENCE_LIMIT', 'Occurrence limit exceeded; hold the entire time projection.');
    const consumed = new Set([...(clock.settledTimeEventIds ?? []), ...(options.consumedIds ?? [])]);
    const append = (schedule, dueMinute) => {
        if (consumed.has(occurrenceIdentity(clock, schedule, dueMinute))) return true;
        const event = occurrence(clock, schedule, dueMinute);
        if (!integer(event.day)) { outputError = fail('TIME_RANGE', 'Derived calendar day exceeds safe-integer arithmetic.'); return false; }
        if (occurrences.length === limit) return false;
        const encoded = stringifyJsonValue(event);
        if (!encoded.ok) { outputError = fail('OUTPUT_LIMIT', 'Occurrence data exceeds the bounded DTO budget.'); return false; }
        outputBytes += new TextEncoder().encode(encoded.data.text).byteLength + (occurrences.length ? 1 : 0);
        if (outputBytes > 262144) { outputError = fail('OUTPUT_LIMIT', 'Occurrence data exceeds the bounded DTO budget.'); return false; }
        occurrences.push(event);
        return true;
    };
    for (const schedule of schedules) {
        const period = cadence(clock, schedule);
        const first = firstDueMinute(clock, schedule);
        if (first <= clock.absoluteMinute) continue;
        for (let dueMinute = first; dueMinute <= destination; dueMinute += period) {
            if (!append(schedule, dueMinute)) return outputError ?? overflow();
            if (schedule.kind === 'delay') break;
        }
    }
    occurrences.sort((a, b) => a.dueMinute - b.dueMinute || (a.schedule.order ?? 0) - (b.schedule.order ?? 0) || (a.scheduleId < b.scheduleId ? -1 : a.scheduleId > b.scheduleId ? 1 : 0));
    return finish({ occurrences });
}

export function advanceStoryClock(rawClock, rawProposal) {
    const admitted = validateStoryClock(rawClock);
    if (!admitted.ok) return admitted;
    const clock = admitted.data;
    const checked = cloneJsonValue(rawProposal);
    if (!checked.ok || !checked.data.value || Array.isArray(checked.data.value) || typeof checked.data.value !== 'object') return fail('INVALID_PROPOSAL', 'Use a plain duration or destination proposal.');
    const proposal = checked.data.value;
    const kind = own(proposal, 'kind');
    if (kind !== 'duration' && kind !== 'destination') return fail('UNRESOLVED_TIME', 'An explicit duration or destination is required.');
    if (kind === 'duration' ? !integer(own(proposal, 'minutes')) || Object.hasOwn(proposal, 'absoluteMinute') : !integer(own(proposal, 'absoluteMinute')) || Object.hasOwn(proposal, 'minutes')) return fail('INVALID_PROPOSAL', 'Use one nonnegative safe-integer minute value.');
    const proposalFields = ['kind', 'evidence', kind === 'duration' ? 'minutes' : 'absoluteMinute'];
    if (Object.keys(proposal).some(key => !proposalFields.includes(key))) return fail('INVALID_PROPOSAL', 'Proposal contains ambiguous or unsupported timing fields.');
    const destination = kind === 'destination' ? proposal.absoluteMinute : clock.absoluteMinute + proposal.minutes;
    if (!integer(destination) || destination < clock.absoluteMinute) return fail('INVALID_DESTINATION', 'Destination must be a forward safe-integer minute.');
    const admittedEvidence = readEvidence(Object.hasOwn(proposal, 'evidence') ? proposal.evidence : { kind: 'explicit' });
    if (!admittedEvidence.ok) return admittedEvidence;
    const evidence = admittedEvidence.data;
    const evidenceKind = evidence.kind;
    const previousClock = structuredClone(clock);
    let timeEvidence = structuredClone(evidence);
    if (kind === 'duration' && clock.timeEvidence?.kind === 'estimate') {
        timeEvidence = evidenceKind === 'estimate' ? {
            ...timeEvidence,
            lineage: [...new Set([
                ...(clock.timeEvidence.lineage ?? [clock.timeEvidence.origin]),
                ...(evidence.lineage ?? [evidence.origin]),
            ])],
        } : structuredClone(clock.timeEvidence);
        if (timeEvidence.lineage?.length > 64) return fail('EVIDENCE_LIMIT', 'Estimate provenance exceeds 64 sources; hold the entire time projection.');
    }
    return finish({
        previousClock,
        clock: { ...structuredClone(clock), absoluteMinute: destination, timeEvidence },
        requestedAbsoluteMinute: destination,
        elapsedMinutes: destination - clock.absoluteMinute,
        evidence,
        actualCalls: 0,
    });
}

function occurrence(clock, schedule, dueMinute) {
    const revision = schedule.revision ?? 1;
    return {
        occurrenceId: occurrenceIdentity(clock, schedule, dueMinute),
        clockId: clock.clockId, calendarId: clock.calendarId,
        scheduleId: schedule.scheduleId, scheduleRevision: revision, kind: schedule.kind,
        dueMinute, day: Math.floor(dueMinute / clock.dayLengthMinutes) + 1,
        minuteOfDay: dueMinute % clock.dayLengthMinutes,
        schedule: { ...structuredClone(schedule), revision },
    };
}

export function validateStoryClock(raw) {
    const checked = cloneJsonValue(raw);
    if (!checked.ok || !checked.data.value || typeof checked.data.value !== 'object' || Array.isArray(checked.data.value)) return fail('INVALID_CLOCK', 'Clock must contain bounded own plain data.');
    const clock = checked.data.value;

    if (!identity(own(clock, 'clockId')) || !identity(own(clock, 'calendarId')) || !integer(own(clock, 'absoluteMinute')) || !integer(own(clock, 'dayLengthMinutes')) || clock.dayLengthMinutes === 0) return fail('INVALID_CLOCK', 'Clock requires identities and safe-integer minute/calendar values.');
    if (Object.hasOwn(clock, 'schemaVersion') && clock.schemaVersion !== 1) return fail('INVALID_CLOCK', 'Clock schema version must be 1.');
    if (Object.hasOwn(clock, 'revision') && (!integer(clock.revision) || clock.revision < 1)) return fail('INVALID_CLOCK', 'Clock revision must be a positive safe integer.');
    if (Object.hasOwn(clock, 'timeEvidence') && !readEvidence(clock.timeEvidence).ok) return fail('INVALID_CLOCK', 'Clock time evidence must retain accepted provenance.');
    if (Object.hasOwn(clock, 'settledTimeEventIds') && !ids(clock.settledTimeEventIds)) return fail('INVALID_CLOCK', 'Settled occurrence IDs must be a bounded string array.');
    for (const [key, canonical] of [['unit', 'minute'], ['originMinute', 0], ['originDay', 1]]) {
        if (Object.hasOwn(clock, key) && clock[key] !== canonical) return fail('INVALID_CALENDAR', 'This calendar uses minute units with minute zero at Day 1.');
    }
    return { ok: true, data: clock };
}

function readOptions(raw) {
    const checked = cloneJsonValue(raw);
    if (!checked.ok || !record(checked.data.value)) return fail('INVALID_OPTIONS', 'Options must contain bounded own plain data.');
    const options = checked.data.value;
    if (Object.hasOwn(options, 'limit') && (!integer(options.limit) || options.limit < 1 || options.limit > 10000)) return fail('INVALID_OPTIONS', 'Occurrence limit must be an integer from 1 to 10000.');
    if (Object.hasOwn(options, 'consumedIds') && !ids(options.consumedIds)) return fail('INVALID_OPTIONS', 'Consumed occurrence IDs must be a bounded string array.');
    return { ok: true, data: options };
}

/** Intrinsic schedule admission, with exact scope/day checks only for an explicitly supplied clock. */
export function validateStorySchedules(raw, rawClock) {
    let clock;
    if (rawClock !== undefined) {
        const admittedClock = validateStoryClock(rawClock);
        if (!admittedClock.ok) return admittedClock;
        clock = admittedClock.data;
    }
    const checked = cloneJsonValue(raw);
    if (!checked.ok || !Array.isArray(checked.data.value) || checked.data.value.length > 1000) return fail('INVALID_SCHEDULE', 'Schedules must be a bounded dense plain-data array.');
    const schedules = checked.data.value;
    const seen = new Set();
    for (const schedule of schedules) {
        if (!record(schedule) || !identity(own(schedule, 'scheduleId'))) return fail('INVALID_SCHEDULE', 'Each schedule requires an own schedule identity.');
        if (seen.has(schedule.scheduleId)) return fail('DUPLICATE_SCHEDULE', 'Only one active definition is allowed for each schedule identity.');
        seen.add(schedule.scheduleId);
        for (const key of ['clockId', 'calendarId']) if (Object.hasOwn(schedule, key) && (clock ? schedule[key] !== clock[key] : !identity(schedule[key]))) return fail('SCHEDULE_SCOPE', 'Schedule clock and calendar must match the input clock.');
        const revision = Object.hasOwn(schedule, 'revision') ? schedule.revision : 1;
        if (!integer(revision) || revision < 1 || (Object.hasOwn(schedule, 'order') && !Number.isSafeInteger(schedule.order))) return fail('INVALID_SCHEDULE', 'Schedule revision and order must be safe integers.');
        const kind = own(schedule, 'kind');
        if (kind === 'daily') {
            if (!integer(own(schedule, 'minuteOfDay')) || clock && schedule.minuteOfDay >= clock.dayLengthMinutes) return fail('INVALID_SCHEDULE', 'Daily time must be inside the authored day.');
        } else if (kind === 'interval') {
            if (!integer(own(schedule, 'anchorMinute')) || !integer(own(schedule, 'intervalMinutes')) || schedule.intervalMinutes < 1) return fail('INVALID_SCHEDULE', 'Interval needs a nonnegative anchor and positive cadence.');
        } else if (kind === 'delay') {
            if (!integer(own(schedule, 'dueMinute'))) return fail('INVALID_SCHEDULE', 'Delay needs one nonnegative due minute.');
        } else return fail('INVALID_SCHEDULE', 'Use daily, interval or delay schedules.');
        schedule.revision = revision;
    }
    return { ok: true, data: schedules };
}

export function resolveTimeAdvance(clock, proposal, rawSchedules, rawOptions = {}) {
    const admitted = readOptions(rawOptions);
    if (!admitted.ok) return admitted;
    const options = admitted.data;
    if (!['catch-up', 'interrupt'].includes(own(options, 'policy'))) return fail('INVALID_POLICY', 'Select an explicit catch-up or interrupt policy.');
    const advanced = advanceStoryClock(clock, proposal);
    if (!advanced.ok) return advanced;
    const report = advanced.data;
    const admittedSchedules = validateStorySchedules(rawSchedules, report.previousClock);
    if (!admittedSchedules.ok) return admittedSchedules;
    const schedules = admittedSchedules.data;
    let destination = report.requestedAbsoluteMinute;
    if (options.policy === 'interrupt') {
        const consumed = new Set([...(report.previousClock.settledTimeEventIds ?? []), ...(options.consumedIds ?? [])]);
        for (const schedule of schedules) {
            const period = cadence(report.previousClock, schedule);
            let due = firstDueMinute(report.previousClock, schedule);
            if (due <= report.previousClock.absoluteMinute) continue;
            while (due <= destination && consumed.has(occurrenceIdentity(report.previousClock, schedule, due))) {
                if (schedule.kind === 'delay') { due = Infinity; break; }
                due += period;
            }
            if (due <= destination) destination = due;
        }
    }
    const enumerated = enumerateScheduledOccurrences(report.previousClock, destination, schedules, options);
    if (!enumerated.ok) return enumerated;
    return finish({
        ...report,
        clock: { ...report.clock, absoluteMinute: destination },
        requestedElapsedMinutes: report.elapsedMinutes,
        elapsedMinutes: destination - report.previousClock.absoluteMinute,
        remainingMinutes: report.requestedAbsoluteMinute - destination,
        interrupted: destination < report.requestedAbsoluteMinute,
        policy: options.policy,
        occurrences: enumerated.data.occurrences,
    });
}

function finish(data) {
    const bounded = cloneJsonValue(data);
    return bounded.ok ? { ok: true, data: bounded.data.value } : fail('OUTPUT_LIMIT', 'Projection exceeds the bounded plain-data DTO budget.');
}

function readEvidence(evidence) {
    if (!record(evidence)) return fail('INVALID_EVIDENCE', 'Evidence must be a plain record.');
    const kind = own(evidence, 'kind');
    if (!['explicit', 'authored-rule', 'validated-extraction', 'estimate', 'vague'].includes(kind)) return fail('INVALID_EVIDENCE', 'Use a supported time evidence kind.');
    const fields = kind === 'estimate' ? ['kind', 'origin', 'acceptancePolicy', 'lineage'] : ['kind', 'origin'];
    if (Object.keys(evidence).some(key => !fields.includes(key))) return fail('INVALID_EVIDENCE', 'Evidence contains unsupported or contradictory fields.');
    const hasOrigin = typeof own(evidence, 'origin') === 'string' && evidence.origin.trim().length > 0;
    if (Object.hasOwn(evidence, 'origin') && !hasOrigin) return fail('INVALID_EVIDENCE', 'Evidence origin must be nonempty text.');
    if (kind === 'estimate' && Object.hasOwn(evidence, 'acceptancePolicy') && !['accept', 'unresolved'].includes(evidence.acceptancePolicy)) return fail('INVALID_EVIDENCE', 'Estimate acceptance policy must be accept or unresolved.');
    if (Object.hasOwn(evidence, 'lineage')) {
        const lineage = evidence.lineage;
        if (!Array.isArray(lineage) || lineage.length === 0 || !lineage.every(origin => typeof origin === 'string' && origin.trim().length > 0) || new Set(lineage).size !== lineage.length || !lineage.includes(evidence.origin)) return fail('INVALID_EVIDENCE', 'Estimate lineage must contain distinct nonempty text origins including the current origin.');
        if (lineage.length > 64) return fail('EVIDENCE_LIMIT', 'Estimate provenance exceeds 64 sources; hold the entire time projection.');
    }
    if (kind === 'vague' || (kind === 'estimate' && (!hasOrigin || own(evidence, 'acceptancePolicy') !== 'accept'))) return fail('UNRESOLVED_TIME', 'Estimated or vague time needs an explicit accepted authored rule.');
    if (['authored-rule', 'validated-extraction'].includes(kind) && !hasOrigin) return fail('INVALID_EVIDENCE', 'Rule and extraction evidence must identify their origin.');
    return { ok: true, data: evidence };
}

// Both policy paths use the same anchored arithmetic and replay identity.
function cadence(clock, schedule) {
    return schedule.kind === 'interval' ? schedule.intervalMinutes : clock.dayLengthMinutes;
}

function firstDueMinute(clock, schedule) {
    if (schedule.kind === 'delay') return schedule.dueMinute;
    const interval = schedule.kind === 'interval';
    const anchor = interval ? schedule.anchorMinute : schedule.minuteOfDay;
    const period = cadence(clock, schedule);
    const index = Math.max(interval ? 1 : 0, Math.floor((clock.absoluteMinute - anchor) / period) + 1);
    return index * period + anchor;
}

function occurrenceIdentity(clock, schedule, dueMinute) {
    return `time:${JSON.stringify([clock.clockId, schedule.scheduleId, schedule.revision ?? 1, dueMinute])}`;
}





