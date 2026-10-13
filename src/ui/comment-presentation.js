import { cloneDefinitionData } from '../workflow/definitions.js?v=0.27.3';
import { safeId } from '../workflow/composition-edit.js?v=0.27.3';
import { viewIdentityKey } from './view-state.js?v=0.27.3';

const MAX_BYTES = 262144;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (value, fields) => record(value) && Object.keys(value).every(key => fields.includes(key));
const coordinatesFor = node => Object.fromEntries(['x', 'y'].filter(axis => Object.hasOwn(node, axis)).map(axis => [axis, node[axis]]));
const groupCoordinatesFor = group => Object.fromEntries(['x', 'y', 'frame'].filter(key => Object.hasOwn(group, key)).map(key => [key, structuredClone(group[key])]));
const validRectangle = frame => only(frame, ['x', 'y', 'w', 'h']) && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(frame[key])) && frame.w > 0 && frame.h > 0;
const validCoordinates = node => only(node, ['x', 'y']) && Object.values(node).every(Number.isFinite);
const validGroupCoordinates = group => only(group, ['x', 'y', 'frame']) && ['x', 'y'].every(axis => !Object.hasOwn(group, axis) || Number.isFinite(group[axis])) && (!Object.hasOwn(group, 'frame') || validRectangle(group.frame));
const validTable = (value, validRow) => record(value) && Object.keys(value).length <= 1000 && Object.entries(value).every(([id, row]) => safeId(id) && validRow(row));
function plain(value) {
    const copied = cloneDefinitionData(value);
    return copied.ok && new TextEncoder().encode(JSON.stringify(copied.data)).length <= MAX_BYTES ? copied.data : null;
}
function validPresentation(value) {
    return record(value) && Object.keys(value).length <= 1000 && Object.entries(value).every(([id, node]) => safeId(id) && only(node, ['alias', 'compact', 'x', 'y'])
        && (!Object.hasOwn(node, 'alias') || typeof node.alias === 'string' && node.alias.length <= 80)
        && (!Object.hasOwn(node, 'compact') || typeof node.compact === 'boolean')
        && ['x', 'y'].every(axis => !Object.hasOwn(node, axis) || Number.isFinite(node[axis])));
}
function validGroupPresentation(value) {
    return validTable(value, group => only(group, ['collapsed', 'x', 'y', 'frame']) && Object.keys(group).length > 0
        && (!Object.hasOwn(group, 'collapsed') || typeof group.collapsed === 'boolean')
        && ['x', 'y'].every(axis => !Object.hasOwn(group, axis) || Number.isFinite(group[axis]))
        && (!Object.hasOwn(group, 'frame') || validRectangle(group.frame)));
}
function validViewKey(identity) {
    const key = viewIdentityKey(identity);
    return key && safeId(identity.workflowId)
        && (identity.kind !== 'instance' || identity.instancePath.every(safeId))
        && (identity.kind !== 'library' || safeId(identity.definitionRef.id)) ? key : null;
}

function validEffect(effect) {
    const key = record(effect) ? validViewKey(effect.identity) : null;
    return only(effect, ['viewKey', 'identity', 'coordinates', 'groupCoordinates'])
        && key && effect.viewKey === key && validTable(effect.coordinates, validCoordinates)
        && (!Object.hasOwn(effect, 'groupCoordinates') || validTable(effect.groupCoordinates, validGroupCoordinates));
}

/** Capture {viewKey,identity,coordinates:{[id]:{x?,y?}},groupCoordinates?} for view.key/identity.
 * nodeIds is a bounded array of ordinary IDs selected by the caller; duplicate
 * IDs collapse. Empty coordinate records capture absence of both axes. No graph,
 * frame, or history membership is inferred here. Optional groupIds capture exact
 * x/y/frame presence. Invalid/unsafe DTOs return null.
 */
export function captureCommentPresentation(view, nodeIds, groupIds = []) {
    const source = plain(view), ids = plain(nodeIds), groups = plain(groupIds);
    if (!record(source) || !Array.isArray(ids) || ids.length > 1000 || !ids.every(safeId) || !validPresentation(source.nodePresentation)
        || !Array.isArray(groups) || groups.length > 1000 || !groups.every(safeId) || !validGroupPresentation(source.groupPresentation ?? {})) return null;
    const key = validViewKey(source.identity);
    if (!key || source.key !== key) return null;
    const effect = { viewKey: key, identity: structuredClone(source.identity), coordinates: Object.fromEntries([...new Set(ids)].map(id => [id, coordinatesFor(Object.hasOwn(source.nodePresentation, id) ? source.nodePresentation[id] : {})])),
        ...(groups.length ? { groupCoordinates: Object.fromEntries([...new Set(groups)].map(id => [id, groupCoordinatesFor(Object.hasOwn(source.groupPresentation ?? {}, id) ? source.groupPresentation[id] : {})])) } : {}) };
    return plain(effect) ? effect : null;
}

/** Derive a detached nodePresentation table: undo restores captured x/y presence
 * and values, redo removes both axes. Preserve current alias/compact and unrelated
 * records; remove emptied affected records. The caller targets effect.viewKey and
 * owns history/session checks. Invalid/unsafe/excess-size DTOs return null.
 */
export function applyCommentPresentation(currentNodePresentation, effect, direction) {
    const current = plain(currentNodePresentation), captured = plain(effect);
    if (!['undo', 'redo'].includes(direction) || !validPresentation(current) || !validEffect(captured)) return null;
    const next = structuredClone(current);
    for (const id of Object.keys(captured.coordinates)) {
        const node = Object.hasOwn(next, id) ? next[id] : {};
        delete node.x; delete node.y;
        if (direction === 'undo') Object.assign(node, captured.coordinates[id]);
        if (Object.keys(node).length) next[id] = node;
        else delete next[id];
    }
    return validPresentation(next) && plain(next) ? next : null;
}

/** Derive detached groupPresentation geometry for the same qualified history
 * effect. Undo restores exact captured x/y/frame presence; redo removes geometry.
 * Keep current collapsed state and unrelated groups, dropping emptied records.
 * Effects without groupCoordinates produce an unchanged detached table.
 */
export function applyCommentGroupPresentation(currentGroupPresentation, effect, direction) {
    const current = plain(currentGroupPresentation), captured = plain(effect);
    if (!['undo', 'redo'].includes(direction) || !validGroupPresentation(current) || !validEffect(captured)) return null;
    const next = structuredClone(current);
    for (const id of Object.keys(captured.groupCoordinates ?? {})) {
        const group = Object.hasOwn(next, id) ? next[id] : {};
        delete group.x; delete group.y; delete group.frame;
        if (direction === 'undo') Object.assign(group, structuredClone(captured.groupCoordinates[id]));
        if (Object.keys(group).length) next[id] = group;
        else delete next[id];
    }
    return validGroupPresentation(next) && plain(next) ? next : null;
}
