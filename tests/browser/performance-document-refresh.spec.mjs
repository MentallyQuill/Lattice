import { test, expect } from '@playwright/test';

test('a real Details commit computes the document checkpoint once after recovery publication', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => { const h = window.canvasHarness; await h.reset(3, 3); h.canvas.select({ kind: 'node', id: 'n0' }); await h.settle(); });
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
        const h = window.canvasHarness, input = document.querySelector('input[aria-label="Trim output"]');
        if (!input) throw new Error('The real compose Details modifier is unavailable.');
        const wanted = !input.checked, stringify = JSON.stringify; let snapshots = 0;
        JSON.stringify = function (value, ...args) {
            if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2 && Object.hasOwn(value, 'graph') && Object.hasOwn(value, 'workspaceViews')) snapshots++;
            return stringify.call(this, value, ...args);
        };
        try { input.checked = wanted; input.dispatchEvent(new Event('change', { bubbles: true })); }
        finally { JSON.stringify = stringify; }
        const enabled = graph => !!graph.nodes.n0.modifiers?.find(item => item.type === 'trim')?.enabled;
        return { snapshots, wanted, authored: enabled(h.graph), recovered: enabled(h.S.settings().recoveryDraft.graph), dirty: h.S.documentSession.dirty(), providerCalls: h.providerCalls() };
    });
    expect(result.authored).toBe(result.wanted); expect(result.recovered).toBe(result.wanted);
    expect(result.dirty).toBe(true); expect(result.providerCalls).toBe(0);
    await expect(page.getByRole('status', { name: 'Document status' })).toContainText('Modified');
    expect(result.snapshots).toBe(1);
});

test('a views observer raw mutation reaches the final current checkpoint and recovery', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => { const h = window.canvasHarness; await h.reset(2, 2); h.canvas.select({ kind: 'node', id: 'n0' }); await h.settle(); });
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
        const h = window.canvasHarness, root = h.graph, stringify = JSON.stringify, snapshots = [];
        const unsubscribe = h.S.documentSession.subscribe(event => { if (event.type === 'views' && event.graph === root) root.name = 'External views observer'; });
        JSON.stringify = function (value, ...args) { if (value && typeof value === 'object' && Object.keys(value).length === 2 && Object.hasOwn(value, 'graph') && Object.hasOwn(value, 'workspaceViews')) snapshots.push(value.graph.name); return stringify.call(this, value, ...args); };
        try { const input = document.querySelector('input[aria-label="Trim output"]'); input.checked = !input.checked; input.dispatchEvent(new Event('change', { bubbles: true })); }
        finally { JSON.stringify = stringify; unsubscribe(); }
        return { snapshots, recoveredName: h.S.settings().recoveryDraft.graph.name, dirty: h.S.documentSession.dirty() };
    });
    expect(result.snapshots).toEqual(['External views observer']); expect(result.recoveredName).toBe('External views observer'); expect(result.dirty).toBe(true);
});

test('a same-ID activation inside a views observer refreshes the replacement immediately', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => { const h = window.canvasHarness; await h.reset(2, 2); h.canvas.select({ kind: 'node', id: 'n0' }); await h.settle(); });
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
        const h = window.canvasHarness, old = h.graph, captured = h.S.documentSession.capture(), next = structuredClone(old); next.name = 'Observer replacement';
        let activated = false;
        const unsubscribe = h.S.documentSession.subscribe(event => { if (!activated && event.type === 'views' && event.graph === old) { activated = true; h.S.activateWorkflow(next, { clean: true }); } });
        try { const input = document.querySelector('input[aria-label="Trim output"]'); input.checked = !input.checked; input.dispatchEvent(new Event('change', { bubbles: true })); }
        finally { unsubscribe(); }
        return { activated, currentName: h.graph.name, exactReplacement: h.graph === next, stale: h.S.documentSession.stillCurrent(captured), dirty: h.S.documentSession.dirty(), recoveredName: h.S.settings().recoveryDraft.graph.name };
    });
    expect(result).toEqual({ activated: true, currentName: 'Observer replacement', exactReplacement: true, stale: false, dirty: false, recoveredName: 'Observer replacement' });
    // A clean checkpoint with no storage acknowledgement is still an unsaved draft.
    await expect(page.getByRole('status', { name: 'Document status' })).toHaveText('Unsaved draft');
});

test('source and saved observers remain immediate while matching views refresh is deferred', async ({ page }) => {
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async () => { const h = window.canvasHarness; await h.reset(2, 2); h.canvas.select({ kind: 'node', id: 'n0' }); await h.settle(); });
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
        const h = window.canvasHarness, root = h.graph, stringify = JSON.stringify, calls = { source: 0, saved: 0 }; let phase = null, observed = false;
        JSON.stringify = function (value, ...args) { if (phase && value && typeof value === 'object' && Object.keys(value).length === 2 && Object.hasOwn(value, 'graph') && Object.hasOwn(value, 'workspaceViews')) calls[phase]++; return stringify.call(this, value, ...args); };
        const unsubscribe = h.S.documentSession.subscribe(event => {
            if (observed || event.type !== 'views' || event.graph !== root) return; observed = true;
            phase = 'source'; h.S.documentSession.source({ name: 'Observer source.json' }); phase = null;
            const snapshot = h.S.documentSession.snapshot();
            phase = 'saved'; h.S.documentSession.markSaved(h.S.documentSession.capture(), snapshot, { name: 'Observer saved.json' }); phase = null;
        });
        try { const input = document.querySelector('input[aria-label="Trim output"]'); input.checked = !input.checked; input.dispatchEvent(new Event('change', { bubbles: true })); }
        finally { JSON.stringify = stringify; unsubscribe(); }
        return { calls, source: h.S.documentSession.source().name, dirty: h.S.documentSession.dirty() };
    });
    expect(result).toEqual({ calls: { source: 1, saved: 1 }, source: 'Observer saved.json', dirty: false });
    await expect(page.locator('.pc-document-name')).toHaveText('Observer saved.json');
    // markSaved updates the session checkpoint; this fixture performs no actual file save.
    await expect(page.getByRole('status', { name: 'Document status' })).toHaveText('Unsaved draft');
});
