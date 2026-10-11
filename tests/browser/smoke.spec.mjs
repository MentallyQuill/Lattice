import { rootCommand, expectRootBusy } from './workflow-commands.mjs';
import { test, expect } from '@playwright/test';
test('a settings-free launch opens the current disabled zero-request workflow', async ({ page }) => {
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()));
    await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
    await expect(page.locator('.pc-root.pc-open.pc-native-workspace')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Lattice', exact: true })).toBeVisible();
    await expect(page.locator('.pc-brand')).toHaveText('LATTICE');
    const launch = await page.evaluate(async () => {
        const h = window.canvasHarness, settings = h.S.settings();
        const { validateWorkflow } = await import('/src/workflow/contracts.js?v=' + h.version);
        const checked = validateWorkflow(h.graph);
        return { fresh: h.freshSettingsAbsent, name: h.graph.name, schema: h.graph.schema, runtime: h.graph.runtime, enabled: settings.enabled,
            collection: Object.hasOwn(settings, 'graphs'), bound: checked.data?.callBound, calls: h.providerCalls(), currentGlobal: typeof window.lattice.open === 'function',
            oldGlobals: ['sillyCanvas','promptCanvas','comfyTavernGenerationInterceptor'].some(key => Object.hasOwn(window,key)),
            mode: Object.hasOwn(settings,'workflowMode'), prepared: h.canvas.graph !== h.graph && !!h.canvas.graph.nativeCards };
    });
    expect(launch).toMatchObject({fresh:true,name:'Unified story workflow',schema:3,runtime:2,enabled:false,bound:0,calls:0,currentGlobal:true,oldGlobals:false,mode:false,prepared:true});
    expect(launch.collection).toBe(false);
    await expect(page.locator('.pc-node-native')).toHaveCount(3);
    await expect(page.locator('.pc-node-output,.pc-port-key,.pc-port-stage,.pc-tok')).toHaveCount(0);
    await expect(page.getByLabel('Workflow mode',{exact:true})).toHaveCount(0);
    const before=await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph));
    await rootCommand(page); await expect(page.locator('.pc-root')).toContainText('Enable this open workflow, then Send in SillyTavern.');
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Not run');
    expect(await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph))).toBe(before);
    expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
    expect(requests.filter(url=>new URL(url).pathname.startsWith('/api/'))).toEqual([]);
    expect(errors).toEqual([]);
});
