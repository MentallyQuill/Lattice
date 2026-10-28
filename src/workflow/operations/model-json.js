import { decodeJson } from './json-decode.js?v=0.29.0';

/** Decode a complete model JSON document without repairing its contents. */
export function decodeModelJson(input, options = {}) {
    // Bound the original envelope before removing presentation wrappers.
    if (typeof input !== 'string' || input.length > 100000 || new TextEncoder().encode(input).byteLength > 262144) return { ok: false, error: { code: 'INVALID_JSON', message: 'Model JSON requires bounded text.' } };
    const bom = /^[ \t\r\n]*\uFEFF/.exec(input);
    const document = bom ? input.slice(bom[0].length) : input;
    const fence = /^[ \t\r\n]*```(json)?[ \t]*(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)```[ \t\r\n]*$/i.exec(document);
    const decoded = decodeJson(fence ? fence[2] : document, options);
    if (!decoded.ok || !bom && !fence) return decoded;
    return { ok: true, data: { ...decoded.data, report: [...decoded.data.report, { code: 'MODEL_JSON_WRAPPER_REMOVED', actualCalls: 0, wrapper: { bom: !!bom, fence: fence ? fence[1] ? 'json' : 'unlabeled' : null } }] } };
}
