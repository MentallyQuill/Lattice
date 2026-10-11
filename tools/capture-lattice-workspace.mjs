import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run only after the reviewed production bundle is ready and capture execution is authorized.
// This uses the development host's real Workbench/Canvas/controller and production UI bundle.
// Fixture admission changes the open document/host data only; all navigation and runs use actual UI.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'http://127.0.0.1:4179';
const args = process.argv.slice(2);
const allowed = args.every(arg => arg === '--execute' || arg === '--help' || arg.startsWith('--output='));
if (!allowed) throw new Error('Use --execute, --output=<directory>, or --help.');
if (args.includes('--help')) {
    console.log('node tools/capture-lattice-workspace.mjs --execute [--output=<directory>]');
    console.log('Captures actual native workspace at 1024/736/360/320, tab joins at DPR 1/1.25/2/4, Derive flyout, real child view and zero-call running/failure states. No build or downloads.');
    process.exit(0);
}
if (!args.includes('--execute')) throw new Error('Capture execution is held. Supply --execute only after the root capture grant and compiled checkpoint.');
const output = resolve(root, args.find(arg => arg.startsWith('--output='))?.slice('--output='.length)
    || '.superpowers/sdd/2026-10-08-lattice-workspace/task-10-captures');
const workerDelayMs = 800; // Root-approved delay stays below the unchanged real 1000ms deadline.
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const bundle = await readFile(join(root, 'dist', 'lattice-ui.js'));
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const evidence = { version: manifest.version, bundleSha256: createHash('sha256').update(bundle).digest('hex'),
    base, output, workerDelayMs, workerDeadlineDefaultMs: 1000, startedAt: new Date().toISOString(), cases: [], status: 'running' };
await mkdir(output, { recursive: true });
let server, browser, serverText = '';

async function startServer() {
    try { const existing = await fetch(base + '/manifest.json', { signal: AbortSignal.timeout(500) }); if (existing.ok) throw new Error('Port 4179 is already serving a host. Stop it before this runner; do not reuse an unknown checkout.'); }
    catch (error) { if (error.message.startsWith('Port 4179')) throw error; }
    server = spawn(process.execPath, ['tools/serve-harness.mjs'], { cwd: root, env: { ...process.env, PORT: '4179' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let launchError;
    server.on('error', error => { launchError = error; });
    for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverText = (serverText + data.toString()).slice(-4096); });
    for (let attempt = 0; attempt < 80; attempt++) {
        if (launchError || server.exitCode !== null) throw launchError ?? new Error('Local host exited: ' + serverText);
        try {
            const response = await fetch(base + '/manifest.json', { signal: AbortSignal.timeout(500) });
            if (response.ok && (await response.json()).version === manifest.version) return;
        } catch {}
        await pause(100);
    }
    throw new Error('Local production-workspace host did not start: ' + serverText);
}

async function newCasePage({ width = 1024, dpr = 1, workerDelay = false }) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: dpr, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const issues = [], localResponses = new Set(), workerRequests = [];
    await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
        if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) {
            issues.push('Blocked nonlocal or mutating request: ' + request.method() + ' ' + url.href);
            return route.abort('blockedbyclient');
        }
        // The actual host exposes these public helpers from /script.js; the local harness supplies the established fixture.
        if (url.pathname === '/script.js') return route.fulfill({ contentType: 'text/javascript', body: `
            const context = () => globalThis.SillyTavern.getContext();
            export const isGenerating = () => false;
            export function syncMesToSwipe(index) { const m = context().chat[index]; m.swipe_info[m.swipe_id] = { extra: structuredClone(m.extra || {}) }; return true; }
            export function syncSwipeToMes(index, swipeId) { const m = context().chat[index]; m.swipe_id = swipeId; m.mes = m.swipes[swipeId]; Object.assign(m, structuredClone(m.swipe_info[swipeId])); return true; }
        ` });
        if (workerDelay && /\/(?:text-rules-worker|worker-entry)(?:[./-]|$)/.test(url.pathname)) {
            workerRequests.push({ url: url.href, delayedMs: workerDelayMs });
            await pause(workerDelayMs);
        }
        await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => issues.push('Page error: ' + error.message));
    page.on('console', message => { if (message.type() === 'error') issues.push('Console error: ' + message.text()); });
    context.on('response', response => {
        const url = new URL(response.url()); localResponses.add(url.pathname);
        if (response.status() >= 400) issues.push('HTTP ' + response.status() + ': ' + response.url());
    });
    await page.goto(base + '/tests/browser/harness.html?hostCss=1');
    await page.waitForFunction(() => !!window.canvasHarness);
    return { context, page, issues, localResponses, workerRequests, width, dpr };
}

async function activate(env, fixture = 'structured') {
    const { page } = env;
    const fixtureInfo = await page.evaluate(async fixtureName => {
        const h = window.canvasHarness, version = (await (await fetch('/manifest.json')).json()).version;
        const [{ starterGraph }, { validateGraphStructure }, definitions, packages] = await Promise.all([
            import('/src/workflow/starters.js?v=' + version), import('/src/workflow/contracts.js?v=' + version),
            import('/src/workflow/definitions.js?v=' + version), import('/src/workflow/packages.js?v=' + version),
        ]);
        const graph = starterGraph(fixtureName === 'cleanup' ? 'literal-cleanup' : 'structured-guidance');
        if (fixtureName === 'cleanup') {
            const parsed = packages.parseSubgraph(await (await fetch('/workflows/subgraphs/literal-cleanup.json')).text());
            if (!parsed.ok) throw new Error('Portable cleanup definition rejected: ' + JSON.stringify(parsed.error));
            const definition = parsed.data.definition, old = graph.nodes['text-rules'];
            graph.definitions = { ...parsed.data.definitions, [definitions.definitionRefKey(definition)]: definition };
            graph.nodes[old.id] = { id: old.id, type: 'subgraph', definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash },
                parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {}, x: old.x, y: old.y };
            graph.wires['wire-1'].toPort = 'draft'; graph.wires['wire-2'].fromPort = 'patches';
            Object.assign(h.context, { chatId: 'local-capture-chat', characterId: 1, groupId: null });
            h.context.chat.splice(0, h.context.chat.length, { mes: 'Continue.', is_user: true },
                { mes: 'It was very very quiet.', is_user: false, swipe_id: 0, swipes: ['It was very very quiet.'],
                    swipe_info: [{ extra: {}, gen_started: 1, gen_finished: 2 }], extra: {}, gen_started: 1, gen_finished: 2 });
        } else {
            graph.nodes['select-fields'].presentation = { alias: 'Scene Fields', compact: true };
            if (fixtureName === 'failure') graph.nodes['compose-json'].sections[0].text = '{broken';
        }
        const checked = validateGraphStructure(graph);
        if (!checked.ok) throw new Error('Actual native root fixture rejected: ' + JSON.stringify(checked.error));
        await h.activate(graph);
        return { id: graph.id, mode: graph.mode, nodeIds: Object.keys(graph.nodes), definitionRefs: Object.keys(graph.definitions),
            wrapperId: fixtureName === 'cleanup' ? 'text-rules' : null };
    }, fixture);
    await page.evaluate(async () => { await window.canvasHarness.settle(); window.canvasHarness.canvas.fit(); await window.canvasHarness.settle(); await document.fonts.ready; });
    await page.locator('.pc-root.pc-native-workspace[data-pc-workbench="svelte"]').waitFor({ state: 'visible' });
    assert(env.localResponses.has('/dist/lattice-ui.js'), 'Actual production UI bundle was not loaded.');
    assert(await page.locator('.pc-node-native').count() === fixtureInfo.nodeIds.length, 'Production Canvas did not render all real root nodes.');
    env.fixture = fixtureInfo;
    return fixtureInfo;
}

async function captureFresh(env) {
    env.fixture = await env.page.evaluate(async () => {
        const h = window.canvasHarness, settings = h.S.settings(), graph = h.S.activeWorkflow();
        const { validateWorkflow } = await import('/src/workflow/contracts.js?v=' + h.version);
        const checked = validateWorkflow(graph);
        if (!h.freshSettingsAbsent || graph.name !== 'Unified story workflow' || graph.template?.id !== 'unified-basic' || graph.mode !== 'native-unified' || graph.schema !== 3 || graph.runtime !== 2 || !checked.ok || checked.data.callBound !== 0 || settings.enabled || !document.querySelector('.pc-arm-input') || document.querySelector('.pc-arm-input').checked || ['graphs', 'activeGraphId', 'nativeBindings', 'workflowMode'].some(key => Object.hasOwn(settings, key)) || h.providerCalls() !== 0) throw Error('Actual fresh launch did not use the disabled zero-request Unified story workflow document.');
        if (document.querySelector('.pc-node-output,.pc-port-key,.pc-port-stage,.pc-tok') || ['sillyCanvas','promptCanvas','comfyTavernGenerationInterceptor'].some(key => Object.hasOwn(window,key))) throw Error('A retired surface or global survived fresh startup.');
        await h.settle(); await document.fonts.ready;
        return { id: graph.id, mode: graph.mode, nodeIds: Object.keys(graph.nodes), definitionRefs: Object.keys(graph.definitions), fresh: true, hostCss: h.hostCss, providerCalls: h.providerCalls() };
    });
    await env.page.locator('.pc-root.pc-native-workspace[data-pc-workbench="svelte"]').waitFor({state:'visible'});
}

async function inspectCompact(env) {
    const card = env.page.locator('.pc-node-native.pc-node-compact[data-id="select-fields"]');
    await card.locator('.pc-native-alias').waitFor({ state: 'visible' });
    assert((await card.locator('.pc-native-alias').textContent()).trim() === 'Scene Fields', 'Actual compact presentation alias is missing.');
    await card.dblclick(); // The real node-open handler also reveals Details on narrow viewports.
    const details = env.page.locator('.pc-inspector');
    await details.waitFor({ state: 'visible' });
    assert(await details.getByRole('checkbox', { name: 'Compact card', exact: true }).isChecked(), 'Inspector did not reflect the actual compact node.');
}

async function rootCommand(env, command = 'Run workflow') {
    await env.page.getByRole('button', { name: 'Graph', exact: true }).click();
    await env.page.getByRole('menuitem', { name: command, exact: true }).click();
}

async function metrics(env) {
    await env.page.getByRole('button', { name: 'Graph', exact: true }).click();
    const rootRun = await env.page.getByRole('menu', { name: 'Graph', exact: true }).evaluate(menu => {
        const command = name => menu.querySelector('[aria-label="' + name + '"]');
        const run = command('Run workflow'), stop = command('Stop workflow');
        return { text: run.textContent.trim(), disabled: run.disabled, stopText: stop.textContent.trim(), stopDisabled: stop.disabled, busy: !stop.disabled, source: 'Graph menu' };
    });
    await env.page.keyboard.press('Escape');
    const value = await env.page.evaluate(({ rootId, rootRun }) => {
        const root = window.canvasHarness.S.activeWorkflow();
        if (root.id !== rootId) throw new Error('Capture fixture is not the open workflow document.');
        const read = (selector, optional = false) => {
            const element = document.querySelector(selector);
            if (!element) { if (optional) return null; throw new Error('Required production selector missing: ' + selector); }
            const css = getComputedStyle(element), rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, background: css.backgroundColor, color: css.color,
                radius: css.borderTopRightRadius, border: css.borderTopColor, shadow: css.boxShadow,
                fontFamily: css.fontFamily, fontSize: css.fontSize, fontWeight: css.fontWeight, letterSpacing: css.letterSpacing };
        };
        return { mode: root.mode, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
            brand: { text: document.querySelector('.pc-brand').textContent.trim(), ...read('.pc-brand'), wordmark: read('.pc-brand span'), fontReady: document.fonts.check('600 20px "Bricolage Grotesque"'), logo: read('.pc-brand img') },
            header: read('.pc-header'), graph: read('.pc-canvas-area'), preview: read('.pc-preview-pane'), inspector: read('.pc-inspector'), shelf: read('.pc-node-shelf'),
            activeTab: read('.pc-graph-tab[aria-selected="true"]'), breadcrumbs: read('.pc-graph-location', true),
            rootRun: { ...rootRun, ...read('[data-menu="Graph"]') },
            workflowStatus: document.querySelector('.pc-root-workflow-status').textContent.trim(),
            nodes: [...document.querySelectorAll('.pc-node-native')].map(node => ({ id: node.dataset.id, classes: [...node.classList], ...read('.pc-node-native[data-id="' + CSS.escape(node.dataset.id) + '"]'),
                opacity: getComputedStyle(node).opacity, headingOpacity: getComputedStyle(node.querySelector('.pc-native-heading')).opacity,
                headingFilter: getComputedStyle(node.querySelector('.pc-native-heading')).filter,
                heading: node.querySelector('.pc-native-heading')?.textContent.trim() ?? '', alias: node.querySelector('.pc-native-alias')?.textContent.trim() ?? null,
                pins: [...node.querySelectorAll('.pc-port[data-port]')].map(pin => ({ portId: pin.dataset.port, dir: pin.dataset.dir, kind: pin.dataset.kind,
                    hitWidth: getComputedStyle(pin).width, hitHeight: getComputedStyle(pin).height,
                    dotColor: getComputedStyle(pin, '::after').backgroundColor, dotWidth: getComputedStyle(pin, '::after').width })) })),
            tabs: [...document.querySelectorAll('.pc-graph-tab[role="tab"]')].map(tab => ({ label: tab.textContent.trim(), selected: tab.getAttribute('aria-selected'), title: tab.title })),
            families: [...document.querySelectorAll('.pc-family-row[data-family]')].map(row => ({ name: row.dataset.family, ...read('.pc-family-row[data-family="' + row.dataset.family + '"]'), familyColor: getComputedStyle(row).getPropertyValue('--pc-family').trim(), disabled: row.disabled })),
            shelfChoices: [...document.querySelectorAll('[data-shelf-choice]')].map(row => ({ id: row.dataset.shelfChoice, name: row.querySelector('.pc-catalog-name')?.textContent.trim(), code: row.querySelector('small')?.textContent.trim(), disabled: row.disabled })),
            familyMenu: read('.pc-family-menu', true), leafMenu: read('.pc-leaf-menu', true),
            run: { label: document.querySelector('.pc-run-meter-label')?.textContent.trim() ?? null, title: document.querySelector('.pc-run-meter')?.getAttribute('aria-label') ?? null,
                pixels: [...document.querySelectorAll('[data-run-pixel]')].map(pixel => ({ status: pixel.dataset.status, title: pixel.title })) },
            shelfSnapshots: { count: Object.keys(window.canvasHarness.S.settings().subgraphLibrary?.definitions ?? {}).length,
                refs: Object.keys(window.canvasHarness.S.settings().subgraphLibrary?.definitions ?? {}) },
            rootSnapshots: { count: Object.keys(root.definitions ?? {}).length, refs: Object.keys(root.definitions ?? {}) },
            overflow: document.documentElement.scrollWidth > innerWidth,
            nativeWorkbench: !!document.querySelector('.pc-root.pc-native-workspace[data-pc-workbench="svelte"]') };
    }, { rootId: env.fixture.id, rootRun });
    assert(value.viewport.width === env.width && value.viewport.dpr === env.dpr, 'Viewport/DPR differs from the required capture case.');
    assert(value.nativeWorkbench && value.brand.text === 'LATTICE' && value.brand.fontReady, 'Production native workspace brand/font is unavailable.');
    assert(!value.overflow && value.graph.width > 100 && value.graph.height > 140, 'Native workspace overflowed or graph collapsed.');
    assert(value.families.length === 8 && value.families.some(family => family.name === 'Introspection' && !family.disabled), 'All eight native family shelf entries, including Introspection, must remain present.');
    assert(value.families.find(family => family.name === 'Transpose')?.disabled === false, 'Text Transpose must remain available in either native phase.');
    return { ...value, fixture: env.fixture, workerRequests: env.workerRequests, issues: [...env.issues] };
}

async function image(env, name, { joinCrop = false } = {}) {
    const path = join(output, name + '.png');
    if (joinCrop) {
        const clip = await env.page.evaluate(() => {
            const tab = document.querySelector('.pc-graph-tab[aria-selected="true"]').getBoundingClientRect(), frame = document.querySelector('.pc-canvas-area').getBoundingClientRect();
            const x = Math.max(0, Math.floor(Math.min(frame.x, tab.x) - 4)), y = Math.max(0, Math.floor(tab.y - 4));
            return { x, y, width: Math.min(innerWidth - x, Math.ceil(frame.right + 4 - x)), height: Math.min(innerHeight - y, Math.ceil(frame.y + 36 - y)) };
        });
        assert(clip.width > 0 && clip.height > 0, 'Actual tab/frame join has no capture area.');
        await env.page.screenshot({ path, clip, scale: 'device', animations: 'disabled' });
    } else await env.page.screenshot({ path, fullPage: false, scale: 'device', animations: 'disabled' });
    return path;
}

async function caseRun(name, options, action) {
    let env;
    const record = { name, width: options.width ?? 1024, height: 900, dpr: options.dpr ?? 1, images: [], status: 'running' };
    evidence.cases.push(record);
    try {
        env = await newCasePage(options);
        await action(env, record);
        record.metrics = await metrics(env);
        assert(env.issues.length === 0, 'Production browser errors or forbidden requests: ' + env.issues.join('; '));
        record.status = 'passed';
    } catch (error) {
        record.status = 'failed'; record.error = error.stack ?? String(error);
        if (env) {
            record.issues = [...env.issues]; record.workerRequests = [...env.workerRequests];
            try { record.images.push(await image(env, name + '-error')); } catch (captureError) { record.captureError = String(captureError); }
        }
    } finally { await env?.context.close(); }
    await writeFile(join(output, 'metrics.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ name, status: record.status, images: record.images, error: record.error }));
}

async function runDetails(env, expectedStatus) {
    await env.page.locator('.pc-run-meter').click();
    const panel = env.page.getByRole('region', { name: 'Run details', exact: true });
    await panel.waitFor({ state: 'visible' });
    assert(await panel.locator('header [data-status="' + expectedStatus + '"]').count() === 1, 'Run details has no actual ' + expectedStatus + ' settlement.');
    assert(/0 of 0 requests/.test(await panel.locator('.pc-run-summary').textContent()), 'Required capture run made or allowed a model request.');
    const details = await panel.evaluate(element => ({ text: element.querySelector('.pc-run-summary').textContent.trim(),
        issue: element.querySelector('.pc-run-error')?.textContent.trim() ?? null,
        rows: [...element.querySelectorAll('[data-run-row]')].map(row => ({ key: row.dataset.runRow, status: row.dataset.status, depth: row.dataset.depth })) }));
    await env.page.getByRole('button', { name: 'Close panel', exact: true }).click();
    return details;
}

try {
    await startServer();
    browser = await chromium.launch({ headless: true }); // Uses the installed local browser; never downloads one.
    for (const width of [1024, 736, 360, 320]) await caseRun('fresh-' + width + '-dpr1', { width }, async (env, record) => {
        await captureFresh(env);
        record.images.push(await image(env, record.name));
        if (width === 1024) record.images.push(await image(env, 'tab-join-1024-dpr1', { joinCrop: true }));
    });
    for (const dpr of [1.25, 2, 4]) await caseRun('fresh-1024-dpr' + dpr, { dpr }, async (env, record) => {
        await captureFresh(env);
        record.images.push(await image(env, record.name), await image(env, 'tab-join-1024-dpr' + dpr, { joinCrop: true }));
    });
    for (const width of [1024, 736, 360, 320]) await caseRun('compact-' + width, {width}, async (env, record) => {
        await activate(env); await inspectCompact(env); record.images.push(await image(env, record.name));
    });
    await caseRun('derive-node-menu', {}, async (env, record) => {
        await activate(env, 'cleanup');
        await env.page.locator('[data-family="Derive"]').hover();
        await env.page.locator('.pc-family-menu').waitFor({ state: 'visible' });
        assert(await env.page.locator('.pc-family-menu [data-shelf-choice="operation:json-decode"]').count() === 1, 'Actual Derive node menu must contain one canonical JSON Decode.');
        assert(await env.page.locator('[data-subfamily], .pc-leaf-menu').count() === 0, 'Actual family menu must not add category submenus.');
        record.images.push(await image(env, record.name));
    });
    await caseRun('literal-cleanup-child', {}, async (env, record) => {
        await activate(env, 'cleanup');
        await env.page.locator('.pc-node[data-id="text-rules"] .pc-native-heading').dblclick();
        await env.page.locator('.pc-graph-location').waitFor({ state: 'visible' });
        assert(await env.page.getByRole('tab').count() >= 2, 'Actual subgraph double-click did not create a child tab.');
        assert(/Literal cleanup/.test(await env.page.locator('.pc-graph-tab[aria-selected="true"]').textContent()), 'Actual child tab did not retain the saved definition name.');
        await env.page.evaluate(async () => { await window.canvasHarness.settle(); window.canvasHarness.canvas.fit(); await window.canvasHarness.settle(); });
        assert(await env.page.locator('.pc-node-native[data-id="rules"]').count() === 1, 'Actual definition body was not rendered.');
        record.images.push(await image(env, record.name), await image(env, 'literal-cleanup-child-tab-join', { joinCrop: true }));
    });
    await caseRun('genuine-running', { workerDelay: true }, async (env, record) => {
        await activate(env, 'cleanup');
        await rootCommand(env);
        for (let attempt = 0; attempt < 40 && !env.workerRequests.length; attempt++) await pause(10);
        assert(env.workerRequests.length > 0, 'The genuine running case did not request its actual Worker module.');
        await env.page.locator('.pc-node-native.pc-trace-running').first().waitFor({ state: 'visible' });
        await env.page.waitForFunction(() => !!document.querySelector('[data-run-pixel][data-status="running"]'));
        record.runningMetrics = await metrics(env);
        assert(record.runningMetrics.rootRun.busy && record.runningMetrics.rootRun.disabled && !record.runningMetrics.rootRun.stopDisabled, 'Actual Graph menu did not expose Stop for the running workflow.');
        const runningNodes = record.runningMetrics.nodes.filter(node => node.classes.includes('pc-trace-running'));
        const runningAccent = record.runningMetrics.graph.border;
        const hasRunningRing = node => node.shadow.split(/,(?![^(]*\))/).some(part => {
            const ring = part.trim().match(/^(.*?)\s+0px\s+0px\s+0px\s+([\d.]+)px$/);
            return ring?.[1] === runningAccent && Number(ring[2]) > 0;
        });
        assert(runningNodes.length > 0 && runningNodes.every(node => node.border === runningAccent && hasRunningRing(node)), 'Actual running cards must retain the graph-accent border and visible outer ring.');
        record.images.push(await image(env, record.name));
        await env.page.waitForFunction(() => document.querySelector('.pc-run-meter-label')?.textContent.trim().toLowerCase() === 'completed');
        record.details = await runDetails(env, 'completed');
        record.settlement = 'completed';
        record.images.push(await image(env, 'genuine-running-settled'));
    });
    await caseRun('genuine-json-failure', {}, async (env, record) => {
        await activate(env, 'failure');
        await rootCommand(env);
        await env.page.locator('.pc-node-native.pc-trace-failed[data-id="json-decode"]').waitFor({ state: 'visible' });
        await env.page.locator('.pc-node-native.pc-trace-blocked').first().waitFor({ state: 'visible' });
        await env.page.waitForFunction(() => document.querySelector('.pc-run-meter-label')?.textContent.trim().toLowerCase() === 'failed');
        record.details = await runDetails(env, 'failed');
        assert(record.details.rows.some(row => row.status === 'failed') && record.details.rows.some(row => row.status === 'blocked'), 'Real invalid JSON did not produce failed/blocked stages.');
        await env.page.locator('.pc-node-native[data-id="json-decode"]').click();
        await env.page.evaluate(async () => { await window.canvasHarness.settle(); });
        record.failureMetrics = await metrics(env);
        const failedNode = record.failureMetrics.nodes.find(node => node.id === 'json-decode');
        const blockedNodes = record.failureMetrics.nodes.filter(node => node.classes.includes('pc-trace-blocked'));
        assert(failedNode?.classes.includes('pc-selected') && failedNode.border === 'rgb(229, 118, 118)', 'Actual selected failed card must retain the current error-red border.');
        const failedGrayscale = Number(failedNode.headingFilter.match(/grayscale\(([\d.]+)%?\)/)?.[1] ?? 0);
        assert(Number(failedNode.headingOpacity) > 0 && Number(failedNode.headingOpacity) < 1 && failedGrayscale > 0, 'Actual failed heading must remain visibly dimmed and grayscale.');
        assert(blockedNodes.length > 0 && blockedNodes.every(node => Number(node.opacity) > 0 && Number(node.opacity) < 1), 'Actual blocked cards must remain visibly dimmed.');
        record.images.push(await image(env, record.name));
    });
    evidence.status = evidence.cases.some(record => record.status !== 'passed') ? 'failed' : 'passed';
    assert(evidence.cases.length === 15, 'A required capture case was omitted.');
    assert(evidence.status === 'passed', 'Required capture cases failed; inspect metrics.json and saved error images.');
} catch (error) {
    evidence.status = 'failed'; evidence.error = error.stack ?? String(error); process.exitCode = 1;
} finally {
    const cleanupFailed = (stage, error) => {
        const diagnostic = error?.stack ?? String(error);
        evidence.status = 'failed'; process.exitCode = 1;
        (evidence.cleanupErrors ??= []).push({ stage, diagnostic });
        console.error('Capture cleanup failed (' + stage + '): ' + diagnostic);
    };
    try { await browser?.close(); } catch (error) { cleanupFailed('browser close', error); }
    try {
        if (server?.kill() === false && server.exitCode === null) throw new Error('Runner-owned local server did not accept termination.');
    } catch (error) { cleanupFailed('server stop', error); }
    evidence.finishedAt = new Date().toISOString(); evidence.serverLog = serverText;
    try { await writeFile(join(output, 'metrics.json'), JSON.stringify(evidence, null, 2)); }
    catch (error) { cleanupFailed('metrics persistence: ' + join(output, 'metrics.json'), error); }
}
