import { cloneJsonValue } from '../workflow/operations/json-data.js?v=0.27.2';
/** Tokenize explicit CSV/TSV without inferring field meaning. */
export function parseDelimitedInput(text, delimiter) {
    const rows = [], row = [];
    const fail = message => ({ ok: false, error: { code: 'INVALID_DELIMITED_INPUT', message, row: rows.length + 1, cell: row.length + 1 } });
    if (typeof text !== 'string' || ![',', '\t'].includes(delimiter) || new TextEncoder().encode(text).byteLength > 262144) return fail('Choose CSV or TSV and bounded input text.');
    let cell = '', state = 'start', quoted = false;
    const push = () => { row.push(quoted ? cell : cell.trim()); cell = ''; state = 'start'; quoted = false; };
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (state === 'quoted') {
            if (char === '"') {
                if (text[index + 1] === '"') { cell += '"'; index++; }
                else state = 'closed';
            } else cell += char;
        } else if (char === delimiter || char === '\r' || char === '\n') {
            push();
            if (char !== delimiter) {
                rows.push(row.splice(0));
                if (char === '\r' && text[index + 1] === '\n') index++;
            }
        } else if (state === 'start' && char === '"') {
            cell = ''; quoted = true; state = 'quoted';
        } else if (state === 'closed' && char !== ' ' && char !== '\t') {
            return fail('Only separator padding may follow a quoted cell.');
        } else if (state === 'unquoted' && char === '"') {
            return fail('Quotes must surround the entire cell.');
        } else if (state !== 'closed') {
            cell += char;
            if (!/\s/.test(char)) state = 'unquoted';
        }
    }
    if (state === 'quoted') return fail('Close the quoted cell before importing.');
    push(); rows.push(row);
    const checked = cloneJsonValue(rows); if (!checked.ok) return checked;
    return { ok: true, data: { rows: checked.data.value } };
}
