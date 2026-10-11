import { test, expect } from '@playwright/test';
async function finishExampleChoice(page, picker) {
    const guard=page.getByRole('dialog',{name:'Save workflow changes?',exact:true});
    await expect.poll(async()=>await guard.isVisible()||!await picker.isVisible()).toBe(true);
    if(await guard.isVisible())await guard.getByRole('button',{name:"Don't Save",exact:true}).click();
    await expect(picker).toBeHidden();
}

test('Fit graph keeps opened lesson nodes clear of the floating shelf in root and helper views', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Examples', exact: true });
    await dialog.getByRole('button', { name: 'Build one reusable item-card processor', exact: true }).click();
    await finishExampleChoice(page, dialog);
    async function check() { await page.getByRole('menuitem', { name: 'View', exact: true }).click(); await page.getByRole('menuitem', { name: 'Fit graph', exact: true }).click(); await expect.poll(() => page.evaluate(() => { const shelf = document.querySelector('.pc-node-shelf').getBoundingClientRect(); const nodes = [...document.querySelectorAll('.pc-canvas-host .pc-node-native')].map(n => n.getBoundingClientRect()); return Math.min(...nodes.map(n => n.left)) - shelf.right; })).toBeGreaterThan(8); }
    await check();
    await page.locator('.pc-canvas-host .pc-node-subgraph .pc-native-heading').first().dblclick();
    await expect(page.locator('.pc-graph-tabs [role="tab"]')).toHaveCount(2);
    await check();
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
test('Fit graph includes every capstone node within the unobstructed canvas overview', async ({ page }) => {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    const lessons = await page.evaluate(async () => { const d = await import('/src/workflow/remastered-example-data.js?v=' + window.canvasHarness.version); return d.REMASTERED_WORKFLOW_EXAMPLE_DATA.filter(e => e.number >= 27).map(e => e.title); });
    expect(lessons).toHaveLength(4);
    for (const title of lessons) {
        await page.getByRole('menuitem', { name: 'File', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Open examples…', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Examples', exact: true });
        await dialog.getByRole('button', { name: title, exact: true }).click();
        await finishExampleChoice(page, dialog);
        await page.getByRole('menuitem', { name: 'View', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Fit graph', exact: true }).click();
        await expect.poll(() => page.evaluate(() => { const host = document.querySelector('.pc-canvas-host').getBoundingClientRect(), shelf = document.querySelector('.pc-node-shelf').getBoundingClientRect(); return [...document.querySelectorAll('.pc-canvas-host .pc-node-native')].every(n => { const r = n.getBoundingClientRect(); return r.left >= shelf.right + 8 && r.right <= host.right - 8 && r.top >= host.top + 8 && r.bottom <= host.bottom - 8; }); })).toBe(true);
    }
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('every lesson and helper keeps rendered cards separate and long wires distinguishable', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    const audit = await page.evaluate(async () => {
        const h = window.canvasHarness;
        const { REMASTERED_WORKFLOW_EXAMPLE_DATA: lessons } = await import('/src/workflow/remastered-example-data.js?v=' + h.version);
        const { prepareWorkspaceViews, prepareLibraryViews } = await import('/src/ui/workspace-preparation.js?v=' + h.version);
        const { Canvas } = await import('/src/canvas.js?v=' + h.version);
        // Use the production renderer for prepared roots, instances and pure
        // iteration helpers, including helpers without a root subgraph tile.
        const host = document.createElement('div');
        host.className = 'pc-canvas-host';
        host.style.cssText = 'position:fixed;inset:0;width:1440px;height:1000px';
        document.querySelector('.pc-root').append(host);
        const canvas = new Canvas(host), failures = [];
        let roots = 0, helpers = 0;
        try {
            await document.fonts.ready;
            for (const lesson of lessons) {
                const graph = structuredClone(lesson.packages[0].graph);
                const workspace = prepareWorkspaceViews(graph), library = prepareLibraryViews(graph.id, graph.definitions);
                if (!workspace.ok || !library.ok) throw Error('Cannot prepare lesson ' + lesson.number);
                for (const [index, view] of [...workspace.data.preparedViews, ...library.data.preparedViews].entries()) {
                    const label = `Lesson ${lesson.number}, view ${index}`;
                    view.identity.kind === 'root' ? roots++ : helpers++;
                    const draw = structuredClone(view.drawBase);
                    draw.view = { x: 0, y: 0, zoom: 1 };
                    canvas.setGraph(draw, { viewKey: label });
                    await h.settle(); await h.settle();
                    const nodes = [...host.querySelectorAll('.pc-node-native, .pc-comment-frame')].map(element => {
                        const rect = element.getBoundingClientRect();
                        return { id: element.dataset.id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
                    });
                    if (nodes.length !== Object.keys(draw.nodes).length) failures.push(`${label}: missing rendered cards`);
                    for (let i = 0; i < nodes.length; i++) for (const b of nodes.slice(i + 1)) {
                        const a = nodes[i];
                        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
                            failures.push(`${label}: ${a.id} overlaps ${b.id}`);
                    }
                    const paths = [...host.querySelectorAll('.pc-wires .pc-wire')];
                    if (paths.length !== Object.keys(draw.wires).length) failures.push(`${label}: missing rendered connections`);
                    const spans = paths.map(path => {
                        // Read the longest straight span from the actual SVG,
                        // after the renderer measures intrinsic widths and pins.
                        const commands = [...path.getAttribute('d').matchAll(/([MLC])\s*([^MLC]+)/g)];
                        let point, longest;
                        for (const command of commands) {
                            const coordinates = command[2].match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
                            const next = coordinates.slice(-2);
                            if (command[1] === 'L' && point) {
                                const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
                                if (!longest || length > longest.length) longest = { id: path.dataset.id, length,
                                    x1: point[0], y1: point[1], x2: next[0], y2: next[1], slope: (next[1] - point[1]) / (next[0] - point[0]) };
                            }
                            point = next;
                        }
                        return longest;
                    }).filter(span => span && span.x2 > span.x1);
                    const y = (span, x) => span.y1 + span.slope * (x - span.x1);
                    for (let i = 0; i < spans.length; i++) for (const b of spans.slice(i + 1)) {
                        const a = spans[i], left = Math.max(a.x1, b.x1), right = Math.min(a.x2, b.x2);
                        if (right <= left) continue;
                        const factor = Math.min(Math.hypot(1, a.slope), Math.hypot(1, b.slope));
                        const difference = y(a, left) - y(b, left), slope = a.slope - b.slope, tolerance = 6 * factor;
                        let merged;
                        if (Math.abs(slope) < .000001) merged = Math.abs(difference) < tolerance ? right - left : 0;
                        else {
                            const limits = [(-tolerance - difference) / slope, (tolerance - difference) / slope].sort((a, b) => a - b);
                            merged = Math.max(0, Math.min(right - left, limits[1]) - Math.max(0, limits[0]));
                        }
                        // Short crossings and the shared neck at a fan-out are
                        // acceptable; a 120px merged run obscures distinct wires.
                        if (merged * factor > 120) failures.push(`${label}: ${a.id}/${b.id} merge for ${Math.round(merged * factor)}px`);
                    }
                }
            }
        } finally { await canvas.destroy(); host.remove(); }
        return { roots, helpers, failures };
    });
    expect(audit.roots).toBe(30);
    expect(audit.helpers).toBeGreaterThan(0);
    expect(audit.failures).toEqual([]);
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});
