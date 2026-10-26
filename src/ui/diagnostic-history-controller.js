/** Saved history is descriptive UI data, independent of current run authority. */
export function diagnosticScopeKey(scope) {
    return scope && typeof scope.userId === 'string' && scope.userId && ['string', 'number'].includes(typeof scope.chatId)
        ? JSON.stringify([scope.userId, scope.chatId, scope.characterId ?? null, scope.groupId ?? null]) : '';
}

export function createDiagnosticHistoryController(options) {
    let generation = 0;
    const empty = scopeKey => ({ scopeKey, enabled: options.enabled() === true, loading: false, issue: '', entries: [], selectedId: null });
    let view = empty('');
    const current = () => options.scope();
    const key = () => diagnosticScopeKey(current());
    const publish = () => { try { options.changed?.(); } catch { /* UI observers do not own storage. */ } };
    const snapshot = () => key() === view.scopeKey ? { ...view, enabled: options.enabled() === true } : empty(key());
    async function refresh() {
        const captured = current(), capturedKey = diagnosticScopeKey(captured), ticket = ++generation;
        if (capturedKey !== view.scopeKey) view = empty(capturedKey);
        if (!capturedKey) { publish(); return; }
        view = { ...view, loading: true }; publish();
        let result;
        try { result = await options.history.list(captured); }
        catch { result = { ok: false, error: { message: 'Saved diagnostic logs could not be read in this browser.' } }; }
        if (ticket !== generation || key() !== capturedKey) return;
        const entries = result.ok ? result.data.entries : [];
        view = { ...view, loading: false, entries, issue: result.ok ? options.history.status?.().issue ?? '' : result.error.message, selectedId: entries.some(entry => entry.id === view.selectedId) ? view.selectedId : null };
        publish();
    }
    const actions = {
        select(id) {
            if (key() !== view.scopeKey || !view.entries.some(entry => entry.id === id)) return;
            view = { ...view, selectedId: id }; publish();
        },
        async setEnabled(enabled) {
            if (typeof enabled !== 'boolean' || key() !== view.scopeKey) return;
            try { options.setEnabled?.(enabled); }
            catch { view = { ...view, issue: 'The diagnostic logging preference could not be saved.' }; publish(); return; }
            await refresh();
        },
        async export(scopeKey) {
            if (!scopeKey || scopeKey !== key() || scopeKey !== view.scopeKey) return;
            const captured = current(), ticket = generation;
            let result;
            try { result = await options.history.export(captured); }
            catch { result = { ok: false, error: { message: 'Diagnostic logs could not be exported.' } }; }
            if (ticket !== generation || scopeKey !== key()) return;
            if (result.ok) {
                try { options.download?.(result.data.text, result.data.fileName); }
                catch { view = { ...view, issue: 'The diagnostic download could not be started.' }; publish(); }
            } else { view = { ...view, issue: result.error.message }; publish(); }
        },
        async clear(scopeKey) {
            if (!scopeKey || scopeKey !== key() || scopeKey !== view.scopeKey) return;
            const captured = current(), ticket = ++generation;
            view = { ...view, entries: [], selectedId: null, loading: true }; publish();
            let result;
            try { result = await options.history.clear(captured); }
            catch { result = { ok: false, error: { message: 'Saved diagnostic logs could not be cleared.' } }; }
            if (ticket !== generation || scopeKey !== key()) return;
            if (!result.ok) { view = { ...view, issue: result.error.message, loading: false }; publish(); }
            else await refresh();
        },
    };
    const unsubscribe = options.history.subscribe?.(() => { void refresh(); });
    return { snapshot, refresh, actions, sync() { if (key() !== view.scopeKey) void refresh(); }, dispose() { generation++; unsubscribe?.(); } };
}
