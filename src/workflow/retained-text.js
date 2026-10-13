import { own, dense, freeze } from './record-data.js?v=0.27.3';
import { applyTextModifiers } from './modifiers.js?v=0.27.3';

/** Recognize diagnostic Text and recompute its canonical metadata without formatting or live authority. */
export function recognizeRecordedText(raw) {
    try {
        if (own(raw, 'format') !== 'structured' || own(raw, 'kind') !== 'text') return null;
        const value = own(raw, 'value'), text = own(value, 'text');
        if (own(value, 'kind') !== 'text' || typeof text !== 'string' || text.length > 100000) return null;
        const metadata = own(value, 'modifiers'), rawText = metadata === undefined ? text : own(metadata, 'rawText');
        const supplied = metadata === undefined ? [] : own(metadata, 'trace');
        if (!dense(supplied, 16)) return null;
        const entries = Array.from({ length: supplied.length }, (_, i) => {
            const entry = own(supplied, String(i));
            return { id: own(entry, 'id'), type: own(entry, 'type'), version: own(entry, 'version'), enabled: true, settings: own(entry, 'settings') };
        });
        const checked = applyTextModifiers(rawText, entries);
        if (!checked.ok || checked.data.text !== text) return null;
        return freeze({ text, rawText, trace: checked.data.trace, hasModifiers: metadata !== undefined });
    } catch { return null; }
}
