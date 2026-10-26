/** UUID v4 for runtime identities, including browsers served over LAN HTTP. */
export function randomUuid() {
    const randomSource = globalThis.crypto;
    if (typeof randomSource?.randomUUID === 'function') return randomSource.randomUUID();
    if (typeof randomSource?.getRandomValues !== 'function') throw new Error('Secure randomness is unavailable for Lattice identifiers.');
    const bytes = new Uint8Array(16);
    randomSource.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
