const key = 'lattice.workspace.preview.mode';

/** The preference stores one presentation string; it never stores preview content. */
export function readPreviewMode(storage) {
    try { return storage?.getItem(key) === 'source' ? 'source' : 'readable'; }
    catch { return 'readable'; }
}

export function writePreviewMode(storage, mode) {
    if (!storage || (mode !== 'readable' && mode !== 'source')) return false;
    try { storage.setItem(key, mode); return true; }
    catch { return false; }
}
