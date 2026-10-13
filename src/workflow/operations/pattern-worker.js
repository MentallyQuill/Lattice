import { literalCoverage } from './pattern-matching.js?v=0.27.2';
const failure = (code, message) => ({ ok: false, error: { code, message } });
/** Worker-only regex entry. The caller executes this behind a terminable Worker. */
export function runPatternRegex({ text, settings, regions, upstreamExemptions, upstreamCaseSensitive }) {
    let expressions;
    try { expressions = settings.rules.map(rule => new RegExp(rule.pattern, 'gu' + (settings.caseSensitive ? '' : 'i') + settings.regexFlags)); }
    catch { return failure('INVALID_PATTERN_REGEX', 'Pattern contains an invalid Unicode regular expression.'); }
    const upstreamExempt = literalCoverage(text, upstreamExemptions, upstreamCaseSensitive), configuredExempt = literalCoverage(text, settings.exemptions, settings.caseSensitive);
    const occurrences = [];
    for (const [ruleIndex, expression] of expressions.entries()) for (const [from, to] of regions) for (const match of text.slice(from, to).matchAll(expression)) {
        if (!match[0].length) return failure('PATTERN_ZERO_WIDTH', 'Zero-width regular expressions cannot produce Pattern occurrences.');
        const start = from + match.index, end = start + match[0].length;
        if (upstreamExempt(start, end) || configuredExempt(start, end)) continue;
        if (occurrences.length >= 4096) return failure('PATTERN_OCCURRENCE_LIMIT', 'Pattern exceeds 4,096 occurrences.');
        occurrences.push({ ruleIndex, start, end, text: match[0] });
    }
    return { ok: true, data: { occurrences } };
}
self.addEventListener('message', event => {
    try { self.postMessage(runPatternRegex(event.data)); }
    catch { self.postMessage({ ok: false, error: { code: 'INVALID_PATTERN_REGEX', message: 'The Pattern Worker could not scan its bounded request.' } }); }
});
