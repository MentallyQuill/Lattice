export const boundary = (text, at) => !(at > 0 && at < text.length && /[\uD800-\uDBFF]/u.test(text[at - 1]) && /[\uDC00-\uDFFF]/u.test(text[at]));
/** Literal-only expressions never execute authored regex on the caller thread. */
export function* literalHits(text, pattern, caseSensitive) {
    const matcher = new RegExp(RegExp.escape(pattern), 'uy' + (caseSensitive ? '' : 'i'));
    for (let at = 0; at < text.length; at += text.codePointAt(at) > 0xFFFF ? 2 : 1) {
        matcher.lastIndex = at;
        const match = matcher.exec(text);
        if (match && boundary(text, at + match[0].length)) yield { start: at, end: at + match[0].length, text: match[0] };
    }
}
/** Coverage stays bounded by source size even with thousands of overlapping pins. */
export function literalCoverage(text, pins, caseSensitive) {
    const changes = new Int32Array(text.length + 1);
    for (const pin of pins) for (const hit of literalHits(text, pin, caseSensitive)) { changes[hit.start]++; changes[hit.end]--; }
    const prefix = new Uint32Array(text.length + 1); let active = 0;
    for (let at = 0; at < text.length; at++) { active += changes[at]; prefix[at + 1] = prefix[at] + Number(active > 0); }
    return (start, end) => prefix[end] > prefix[start];
}
