import { decodeJson } from './json-decode.js?v=0.30.3';

// Only repair syntax with an explicit value already present. Never complete a
// document, infer missing values, extract a fragment or evaluate model text.
function repairModelJson(text) {
    const output = [];
    let quote = '', previous = '', beforeComma = '', commaIndex = -1;
    const repairs = new Set();
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quote) {
            if (char === '\\') {
                const escaped = text[++index] ?? '';
                output.push(quote === "'" && escaped === "'" ? "'" : '\\' + escaped);
            } else if (char === quote) {
                output.push('"');
                quote = '';
                previous = '"';
            } else if (char.charCodeAt(0) < 32) {
                output.push(JSON.stringify(char).slice(1, -1));
                repairs.add('string-control-character');
            } else output.push(char === '"' ? '\\"' : char);
            continue;
        }
        if (char === '/' && (text[index + 1] === '/' || text[index + 1] === '*')) {
            if (text[index + 1] === '/') {
                index += 2;
                while (index < text.length && !/[\r\n\u2028\u2029]/.test(text[index])) index++;
            } else {
                const end = text.indexOf('*/', index + 2);
                if (end < 0) return { text, repairs: [] };
                index = end + 1;
            }
            // Whitespace prevents a comment from joining distinct tokens.
            output.push(' ');
            repairs.add('comment');
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            output.push('"');
            if (char === "'") repairs.add('single-quote');
            continue;
        }
        if ((char === '}' || char === ']') && previous === ',' && beforeComma && !'[{,:'.includes(beforeComma)) {
            output[commaIndex] = '';
            repairs.add('trailing-comma');
        }
        if (char === ',') {
            beforeComma = previous;
            commaIndex = output.length;
        }
        output.push(char);
        if (!/[ \t\r\n]/.test(char)) previous = char;
    }
    return { text: output.join(''), repairs: [...repairs] };
}

/** Decode model JSON with bounded, local syntax repair and full validation. */
export function decodeModelJson(input, options = {}) {
    // Bound the original envelope before removing presentation wrappers.
    if (typeof input !== 'string' || input.length > 100000 || new TextEncoder().encode(input).byteLength > 262144) return { ok: false, error: { code: 'INVALID_JSON', message: 'Model JSON requires bounded text.' } };
    const bom = /^[ \t\r\n]*\uFEFF/.exec(input);
    const document = bom ? input.slice(bom[0].length) : input;
    const fence = /^[ \t\r\n]*```(json)?[ \t]*(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)```[ \t\r\n]*$/i.exec(document);
    const text = fence ? fence[2] : document;
    let decoded = decodeJson(text, options), repairs = [];
    if (!decoded.ok && decoded.error.code === 'INVALID_JSON') {
        const repaired = repairModelJson(text);
        if (repaired.repairs.length) {
            decoded = decodeJson(repaired.text, options);
            repairs = repaired.repairs;
        }
    }
    if (!decoded.ok) return decoded;
    const report = [...decoded.data.report];
    if (bom || fence) report.push({ code: 'MODEL_JSON_WRAPPER_REMOVED', actualCalls: 0, wrapper: { bom: !!bom, fence: fence ? fence[1] ? 'json' : 'unlabeled' : null } });
    if (repairs.length) report.push({ code: 'MODEL_JSON_REPAIRED', actualCalls: 0, repairs });
    return { ok: true, data: { ...decoded.data, report } };
}
