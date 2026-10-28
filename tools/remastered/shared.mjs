import { ACTIVE_PROFILE_ID } from '../../src/workflow/model-profiles.js';
export const actor = 'character:rowan.png', partner = 'character:iris.png';
export function liveJson(r, id, targetId, settings = {}) {
    r.add(id + '-file', 'read-file', { targetId, ...settings }, 'authorized live target');
    r.add(id, 'json-decode', { phase: settings.phase ?? 'pre' });
    r.connect(id + '-file', 'text', id, 'in');
    r.requirements.push(`Known sample ${targetId} prepares automatically for this independent copy.`);
    return id;
}
export function draftEvidence(r, id = 'native-source') {
    r.add('draft-scope', 'select-fields', { phase: 'post', fields: [{ name: 'sourceId', path: ['runId'] }, { name: 'revision', path: ['runId'] }, { name: 'sceneId', path: ['source', 'chatId'] }, {
                name: 'visibility', path: ['publicVisibility'], required: false, default: 'public'
            }] }, 'owned native identity');
    r.connect('generate', 'metadata', 'draft-scope', 'in');
    r.add(id, 'draft-event-source');
    r.connect('generate', 'draft', id, 'in');
    r.connect('draft-scope', 'out', id, 'scope');
    return id;
}
export function eventCandidates(r, source, { id = 'events', itemId, eventType = 'scene-action', phase = 'post', instructions = '' } = {}) {
    r.data('entities', { actorIds: [actor, partner], itemIds: itemId ? [itemId] : [] }, phase);
    if (itemId) {
        r.add(id, 'item-use-trigger', {
            itemId, mode: 'extract', watch: phase === 'post' ? 'draft' : 'player-message', phase, instructions
        });
        r.connect(source, 'out', id, 'source');
        r.connect('entities', 'out', id, 'entities');
        return id;
    }
    r.add('candidate-request', 'text', { phase, text: `Return exactly a raw JSON array of {eventType,actorId,objectId only when relevant,position:{start,end},semantics}. Copy exact UTF-16 evidence spans from supplied source.text. Use only supplied canonical actor IDs ${actor}, ${partner}. Target eventType ${eventType}. Distinguish actual, mentioned, planned, threatened, recalled, proposed, uncertain. ${instructions}` });
    r.add('candidates', 'model-call', { outputKind: 'data', phase, instructions: 'Extract candidates only; never confirm or fabricate evidence.' });
    r.connect('candidate-request', 'out', 'candidates', 'prompt');
    r.connect(source, 'out', 'candidates', 'data');
    r.add(id, 'event-normalize', { phase });
    r.connect(source, 'out', id, 'source');
    r.connect('entities', 'out', id, 'entities');
    r.connect('candidates', 'out', id, 'candidates');
    return id;
}
export function confirmEach(r, candidates, { id = 'confirmed', phase = 'post', limit = 3, question = 'Does this exact candidate evidence establish an actual completed action now? Reject plans, negation, threats, recollection and ambiguous grammar.' } = {}) {
    const ref = r.helper(r.id + '-confirmation', 'Confirm one exact occurrence', (add, c) => {
        add('decision', 'decision', { questions: { actual: { type: 'noul', instructions: question } } });
        add('acceptance', 'select-fields', { fields: [{ name: 'accepted', path: ['answers', 'actual', 'accepted'] }] });
        add('single-record', 'format');
        add('confirm', 'confirm-events', { mode: 'single-gate' });
        c('item', 'out', 'decision', 'in');
        c('decision', 'out', 'acceptance', 'in');
        c('item', 'out', 'single-record', 'in');
        c('single-record', 'records', 'confirm', 'events');
        c('acceptance', 'out', 'confirm', 'decisions');
        c('confirm', 'out', 'result', 'in');
    });
    r.add('confirm-each', 'for-each', {
        phase, helper: ref, limit, requestBoundPerIteration: 1, roleOverrides: { decision: { profileId: ACTIVE_PROFILE_ID } }
    });
    r.connect(candidates, 'out', 'confirm-each', 'in');
    r.add(id, 'collection', { phase, mode: 'flatten' });
    r.connect('confirm-each', 'out', id, 'in');
    return id;
}
export function cast(r, source, { context = false, phase = 'pre', actors = [actor], prefix = 'cast' } = {}) {
    r.add(prefix + '-request', 'text', { phase, text: `Return exactly {sceneId,sourceId,revision,actors:[{actorId,status,evidence}]}. Copy identity from ${context ? 'context.source' : 'data'}. Check only ${actors.join(', ')}. Present requires exact current scene quote and actual participation, not name mention, remembered actor, card text or offscreen speculation. Status is present, absent or unresolved.` });
    r.add(prefix, 'model-call', { phase, outputKind: 'data', instructions: 'Interpret genuine scene participation from the unchanged supplied source; copy its IDs and evidence exactly.' });
    r.connect(prefix + '-request', 'out', prefix, 'prompt');
    r.connect(source, 'out', prefix, context ? 'context' : 'data');
    const result = {};
    for (const [index, actorId] of actors.entries()) {
        const id = prefix + '-presence-' + index;
        r.add(id, 'scene-presence', { actorId, phase });
        r.connect(prefix, 'out', id, 'in');
        result[actorId] = id;
    }
    return result;
}
export function present(r, presence, id, phase = 'pre') {
    r.add(id + '-present', 'condition', { phase, path: ['status'], value: 'present' });
    r.connect(presence, 'out', id + '-present', 'in');
    r.add(id + '-route', 'branch', { phase });
    r.connect(presence, 'out', id + '-route', 'in');
    r.connect(id + '-present', 'out', id + '-route', 'condition');
    return id + '-route';
}
export function writeState(r, source, file, { id = 'save', phase = 'post', schema = '' } = {}) {
    r.add(id + '-format', 'format', { phase, jsonShape: 'single', schema });
    r.connect(source, 'out', id + '-format', 'in');
    r.add(id, 'write-file', { mode: 'replace', schema });
    r.connect(file, 'reference', id, 'reference');
    r.connect(id + '-format', 'text', id, 'text');
}
export function unwrapEvent(r, source, id, phase = 'pre') {
    const names = ['schemaVersion', 'recordType', 'eventId', 'eventType', 'sceneId', 'source', 'actorId', 'objectId', 'itemId', 'position', 'evidence', 'semantics', 'status', 'acceptance', 'confirmation', 'holderId'];
    r.add(id, 'select-fields', { phase, fields: names.map(name => ({ name, path: ['value', name], required: !['objectId', 'itemId', 'holderId', 'confirmation'].includes(name) })) });
    r.connect(source, 'out', id, 'in');
    return id;
}
