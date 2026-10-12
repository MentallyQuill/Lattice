import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, totalmem } from 'node:os';

// Full production controller and built Svelte UI; synthetic host, idle Compose cards.
// Run matched source builds serially. This probe never builds or modifies its source.
const args = process.argv.slice(2);
const usage = 'node tools/benchmark-viewport-performance.mjs --source=<build> --output=<directory> --sizes=10,250,500 --width=3840 --height=2160 --repeats=5 --motion-modes=pan,zoom,drag [--disable-culling]';
if (args.includes('--help')) { console.log(usage); process.exit(0); }
const values = new Map(), flags = new Set();
for (let i = 0; i < args.length; i++) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
    if (!match) throw Error(`Unsupported argument: ${args[i]}`);
    const [, key, inline] = match;
    if (key === 'disable-culling') {
        if (inline !== undefined || flags.has(key)) throw Error('Use --disable-culling once, without a value.');
        flags.add(key); continue;
    }
    if (!['source', 'output', 'sizes', 'width', 'height', 'repeats', 'motion-modes'].includes(key) || values.has(key)) throw Error(`Unsupported or repeated option: --${key}`);
    const value = inline ?? args[++i];
    if (!value || value.startsWith('--')) throw Error(`Missing value for --${key}`);
    values.set(key, value);
}
const integer = (name, fallback, min, max) => {
    const value = Number(values.get(name) ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(`Use --${name}=${min}..${max}.`);
    return value;
};
const source = resolve(values.get('source') ?? process.cwd());
const output = resolve(values.get('output') ?? join(process.cwd(), 'benchmark-results', 'viewport-performance'));
const viewport = { width: integer('width', 3840, 640, 8192), height: integer('height', 2160, 480, 8192) };
const sizes = (values.get('sizes') ?? '10,250,500').split(',').map(Number);
const motionModes = (values.get('motion-modes') ?? 'pan,zoom,drag').split(',');
if (!sizes.length || new Set(sizes).size !== sizes.length || !sizes.every(n => Number.isSafeInteger(n) && n >= 2 && n <= 500)) throw Error('Use unique fixture sizes from 2 through 500; these complete Compose fixtures stay within production workflow admission budgets.');
if (!motionModes.length || new Set(motionModes).size !== motionModes.length || !motionModes.every(mode => ['pan', 'zoom', 'drag'].includes(mode))) throw Error('Use unique motion modes: pan,zoom,drag.');
const repeats = integer('repeats', 5, 1, 30), frames = 45, eventsPerFrame = 6;
const disableCulling = flags.has('disable-culling');
const require = createRequire(join(source, 'package.json'));
const { chromium } = require('@playwright/test');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const hashFile = async path => { const data = await readFile(join(source, path)); return { path: path.replaceAll('\\', '/'), bytes: data.length, sha256: sha256(data) }; };
const treeFiles = async directory => {
    const files = [];
    for (const entry of await readdir(join(source, directory), { withFileTypes: true })) {
        const path = join(directory, entry.name);
        files.push(...(entry.isDirectory() ? await treeFiles(path) : [path]));
    }
    return files;
};
const keyPaths = ['src/canvas.js', 'src/ui/controller.js', 'src/ui/node-profile-preparation.js', 'src/ui/workspace-preparation.js', 'src/state.js', 'ui/CanvasLayer.svelte', 'ui/NodeCard.svelte', 'ui/NodeProfilePicker.svelte', 'ui/entry.js', 'style.css', 'index.js', 'manifest.json', 'package.json', 'package-lock.json', 'tests/mock.js', 'tests/browser/harness.js', 'tests/browser/harness.html', ...await treeFiles('src/canvas'), ...await treeFiles('dist')];
const files = await Promise.all([...new Set(keyPaths)].sort().map(hashFile));
const bundle = files.find(file => file.path === 'dist/lattice-ui.js');
if (!bundle) throw Error('Source must include the production dist/lattice-ui.js bundle.');
const scriptPath = fileURLToPath(import.meta.url), script = await readFile(scriptPath);
let reference;
try { reference = { kind: 'snapshot-ref.txt', ref: (await readFile(join(source, 'snapshot-ref.txt'), 'utf8')).trim() }; }
catch {
    try {
        const git = (...gitArgs) => execFileSync('git', ['-C', source, ...gitArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
        reference = { kind: 'git', head: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), status: git('status', '--short') };
    } catch { reference = { kind: 'unavailable' }; }
}
const percentile = (numbers, p) => numbers.length ? numbers.toSorted((a, b) => a - b)[Math.ceil(numbers.length * p) - 1] : null;
const summarize = samples => {
    const intervals = samples.flatMap(sample => sample.intervals), handlers = samples.flatMap(sample => sample.handlers);
    const result = { repeats: samples.length, frameMedianMs: percentile(intervals, .5), frameP95Ms: percentile(intervals, .95), frameWorstMs: intervals.length ? Math.max(...intervals) : null, framesOver20Ms: intervals.filter(ms => ms > 20).length, framesOver25Ms: intervals.filter(ms => ms > 25).length, handlerP95Ms: percentile(handlers, .95), handlerWorstMs: handlers.length ? Math.max(...handlers) : null };
    for (const key of ['taskMs', 'scriptMs', 'layoutMs', 'styleMs', 'downMs', 'thresholdSyncMs', 'releaseSyncMs', 'releaseSettledMs']) {
        const numbers = samples.map(sample => sample[key]).filter(Number.isFinite);
        result[`${key.slice(0, -2)}MedianMs`] = percentile(numbers, .5); result[`${key.slice(0, -2)}P95Ms`] = percentile(numbers, .95);
    }
    return result;
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const saveInjection = "const context = installMock();\nglobalThis.__viewportProbeSaves = { calls: 0, events: [] };\ncontext.saveSettingsDebounced = () => { globalThis.__viewportProbeSaves.calls++; globalThis.__viewportProbeSaves.events.push(performance.now()); };";
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const path = resolve(source, `.${pathname}`);
        if (!path.startsWith(source.endsWith(sep) ? source : source + sep)) { response.writeHead(403).end(); return; }
        let body = await readFile(path);
        if (pathname === '/tests/browser/harness.js') {
            body = body.toString();
            if (!body.includes('const context = installMock();')) throw Error('Unsupported harness save boundary.');
            body = body.replace('const context = installMock();', saveInjection).replace('function (graph) { canvas = this; return setGraph.call(this, graph); }', 'function (graph, ...options) { canvas = this; return setGraph.call(this, graph, ...options); }');
        }
        response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(body);
    } catch (error) { response.writeHead(404).end(String(error.message)); }
});
await mkdir(output, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`, rows = [], errors = [], blocked = [], httpErrors = [];
const metricNames = { taskMs: 'TaskDuration', scriptMs: 'ScriptDuration', layoutMs: 'LayoutDuration', styleMs: 'RecalcStyleDuration' };
const report = { status: 'partial', date: new Date().toISOString(), source, reference, bundleSha256: bundle.sha256, viewport, requestedDpr: 1, runtime: process.version, command: process.argv, options: { sizes, motionModes, repeats, frames, eventsPerFrame, warmupsPerCase: 1, disableCulling, cpuThrottlingRate: 1, reducedMotion: 'reduce' }, hardware: { cpuModels: [...new Set(cpus().map(cpu => cpu.model))], logicalCpus: cpus().length, memoryBytes: totalmem(), platform: process.platform, arch: process.arch }, provenance: { files, measurement: { path: scriptPath, bytes: script.length, sha256: sha256(script) }, servedHarnessAdaptation: 'Measure synthetic host save submissions before settings admission; forward legacy setGraph options; serve /scripts/user.js getCurrentUserHandle() returning default-user exactly as tools/capture-lattice-workspace.mjs.' }, scope: 'Mounted production controller and supplied dist/lattice-ui.js in the synthetic browser host. Enabled idle Compose cards and named Text chain; 10 cards use 5 columns and two rows, larger fixtures use a 10-column grid. Synthetic DOM mouse/wheel input, fixed 45 rAF frames with 6 events per frame; one warmup per case and plain timing samples only. Raw rAF intervals are paint-opportunity estimates, not INP. CDP duration deltas cover gesture down, live motion, release and two settling rAFs; save-boundary waiting and geometry/visibility checks occur afterward. Host save submission is not disk acknowledgment. Culling-disabled samples force card opacity to 1!important outside the timing window, then restore it. Provider calls and external requests are prohibited.', errors, blocked, httpErrors, rows, summary: [] };
const resultPath = join(output, 'viewport-performance-results.json');
const persist = async () => { report.summary = rows.map(({ size, mode, samples }) => ({ size, mode, ...summarize(samples) })); await writeFile(resultPath, JSON.stringify(report, null, 2)); };
let browser;
try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await page.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
        if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) { blocked.push(`${request.method()} ${url.href}`); return route.abort(); }
        if (url.pathname === '/script.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;' });
        if (url.pathname === '/scripts/user.js') return route.fulfill({ contentType: 'text/javascript', body: "export const getCurrentUserHandle=()=> 'default-user';" });
        return route.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
    const session = await page.context().newCDPSession(page);
    await session.send('Performance.enable');
    const metrics = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
    const browserSession = await browser.newBrowserCDPSession();
    report.browser = { version: await browser.version(), executablePath: chromium.executablePath(), playwrightVersion: require('@playwright/test/package.json').version, ...await browserSession.send('Browser.getVersion') };
    const info = await browserSession.send('SystemInfo.getInfo');
    report.gpu = { devices: info.gpu.devices, featureStatus: info.gpu.featureStatus, auxAttributes: info.gpu.auxAttributes };
    await page.goto(base + '/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    report.actualViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
    await page.evaluate(async () => {
        const h = window.canvasHarness, { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        const a = window.viewportProbe = { defaults: operationDefaults };
        a.fixture = size => {
            const columns = size === 10 ? 5 : 10;
            const graph = { id: 'viewport-benchmark', name: 'Viewport benchmark', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {}, view: { x: 0, y: 0, zoom: 1 } };
            for (let i = 0; i < size; i++) {
                const id = 'n' + i;
                graph.nodes[id] = { ...operationDefaults('compose'), id, type: 'workflow', operation: 'compose', operationVersion: 1, enabled: true, title: 'Text ' + (i + 1), x: (i % columns) * 300 + 80, y: Math.floor(i / columns) * 210 + 100, outputKind: 'text', sections: [{ name: 'Text', text: 'Synthetic rendering fixture.' }] };
                if (i) graph.wires['w' + i] = { id: 'w' + i, route: 'wire', from: 'n' + (i - 1), fromPort: 'out', to: id, toPort: 'section.Text' };
            }
            return graph;
        };
        a.geometry = () => {
            const c = h.canvas, node = c.graph.nodes.n0;
            return { node: { x: node.x, y: node.y }, width: c.widthOf(node), height: c.heightOf(node), pins: [...c.nodeLayer.querySelectorAll('[data-id="n0"] .pc-port')].map(pin => ({ id: pin.dataset.port, dir: pin.dataset.dir, local: { ...c.geometry.endpoint('n0', pin.dataset.dir, pin.dataset.port) }, graph: { ...c.endpoint('n0', pin.dataset.dir, pin.dataset.port) } })) };
        };
        a.snapshot = () => {
            const c = h.canvas, box = c.host.getBoundingClientRect(), v = c.view, cards = [...c.nodeLayer.querySelectorAll('.pc-node-native')];
            let visible = 0, fullyVisible = 0, markedOffscreen = 0, opacitySuppressed = 0;
            const extents = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
            for (const card of cards) {
                const node = c.graph.nodes[card.dataset.id], x = node.x * v.zoom + v.x, y = node.y * v.zoom + v.y, w = c.widthOf(node) * v.zoom, h = c.heightOf(node) * v.zoom;
                if (x + w > 0 && y + h > 0 && x < box.width && y < box.height) visible++;
                if (x >= 0 && y >= 0 && x + w <= box.width && y + h <= box.height) fullyVisible++;
                if (card.classList.contains('pc-offscreen')) markedOffscreen++;
                if (Number(getComputedStyle(card).opacity) === 0) opacitySuppressed++;
                extents.left = Math.min(extents.left, node.x); extents.top = Math.min(extents.top, node.y);
                extents.right = Math.max(extents.right, node.x + c.widthOf(node)); extents.bottom = Math.max(extents.bottom, node.y + c.heightOf(node));
            }
            return { cards: cards.length, wires: Object.keys(c.graph.wires).length, visible, offscreen: cards.length - visible, fullyVisible, markedOffscreen, opacitySuppressed, view: { ...v }, host: { x: box.x, y: box.y, width: box.width, height: box.height }, extents, geometry: a.geometry() };
        };
    });
    for (const size of sizes) for (const mode of motionModes) {
        const row = { size, mode, samples: [] }; rows.push(row);
        for (let repeat = -1; repeat < repeats; repeat++) {
            await page.evaluate(async ({ size, disableCulling }) => {
                const h = canvasHarness, c = h.canvas, a = viewportProbe;
                c.cancelGesture(); await h.activate(a.fixture(size)); c.select({ kind: 'node', id: 'n0' });
                Object.assign(c.view, { x: 0, y: 0, zoom: 1 }); c.applyTransform();
                await document.fonts.ready; await h.settle();
                a.opacityRestores = disableCulling ? [...c.nodeLayer.querySelectorAll('.pc-node-native')].map(card => {
                    const value = card.style.getPropertyValue('opacity'), priority = card.style.getPropertyPriority('opacity');
                    card.style.setProperty('opacity', '1', 'important'); return () => value ? card.style.setProperty('opacity', value, priority) : card.style.removeProperty('opacity');
                }) : [];
                await h.settle();
            }, { size, disableCulling });
            // Admission, selection, ResizeObserver and controller save timers settle before sampling.
            await page.waitForTimeout(350);
            const beforeSnapshot = await page.evaluate(({ size, mode, disableCulling }) => {
                const h = canvasHarness, c = h.canvas, a = viewportProbe;
                a.before = a.snapshot(); a.nodes = [...c.nodeLayer.querySelectorAll('.pc-node-native')];
                a.node = c.nodeLayer.querySelector('[data-id="n0"]'); a.pins = [...a.node.querySelectorAll('.pc-port')];
                const heading = a.node.querySelector('.pc-native-heading'), box = heading.getBoundingClientRect();
                a.at = { x: box.left + 20, y: box.top + 10 }; a.heading = heading;
                a.saveStart = __viewportProbeSaves.calls; a.commits = [];
                const original = c.hooks.onViewCommit;
                c.hooks.onViewCommit = function (...args) { const at = performance.now(); try { return original?.apply(this, args); } finally { a.commits.push({ at, syncMs: performance.now() - at }); } };
                a.restoreCommit = () => { c.hooks.onViewCommit = original; };
                if (disableCulling && a.before.opacitySuppressed) throw Error('The culling-disabled diagnostic did not reveal every card.');
                if (a.before.cards !== size || a.before.geometry.width <= 0 || a.before.geometry.height <= 0 || !a.pins.length) throw Error('Fixture did not mount measured native cards and pins.');
                if (size === 10 && mode === 'pan' && innerWidth >= 3840 && innerHeight >= 2160 && a.before.fullyVisible !== size) throw Error('Compact 10-card fixture is not fully visible before pan.');
                return a.before;
            }, { size, mode, disableCulling });
            const beforeMetrics = await metrics();
            const sample = await page.evaluate(async ({ mode, size, frames, eventsPerFrame }) => {
                const h = canvasHarness, c = h.canvas, a = viewportProbe, at = a.at;
                const mouse = (target, type, x, y, button = 0) => target.dispatchEvent(new MouseEvent(type, { button, clientX: x, clientY: y, bubbles: true, cancelable: true }));
                a.startedAt = performance.now();
                if (mode === 'drag') mouse(a.heading, 'mousedown', at.x, at.y);
                if (mode === 'pan') mouse(c.host, 'mousedown', at.x, at.y, 1);
                const downMs = performance.now() - a.startedAt, intervals = [], handlers = [];
                let previous, sawZoomChange = false, thresholdAt, thresholdSettledMs, lastInputAt, allVisibleDuringPan = a.before.fullyVisible === size;
                for (let frame = 0; frame < frames; frame++) {
                    const stamp = await new Promise(resolve => requestAnimationFrame(resolve));
                    if (previous !== undefined) intervals.push(stamp - previous);
                    if (frame === 1) thresholdSettledMs = performance.now() - thresholdAt;
                    previous = stamp;
                    const started = performance.now(); if (frame === 0) thresholdAt = started;
                    for (let event = 0; event < eventsPerFrame; event++) {
                        if (mode === 'zoom') c.host.dispatchEvent(new WheelEvent('wheel', { deltaY: frame % 2 ? -2 : 2, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
                        else mouse(c.host, 'mousemove', at.x + 30 + frame % 10 + event, at.y + 10 + frame / 4);
                    }
                    handlers.push(performance.now() - started); lastInputAt = performance.now();
                    if (c.view.zoom !== a.before.view.zoom) sawZoomChange = true;
                    if (size === 10 && mode === 'pan') {
                        const e = a.before.extents, v = c.view, host = a.before.host;
                        allVisibleDuringPan &&= e.left * v.zoom + v.x >= 0 && e.top * v.zoom + v.y >= 0 && e.right * v.zoom + v.x <= host.width && e.bottom * v.zoom + v.y <= host.height;
                    }
                }
                const releaseAt = performance.now(), savesBeforeRelease = __viewportProbeSaves.calls;
                if (mode !== 'zoom') mouse(c.host, 'mouseup', at.x + 60, at.y + 30, mode === 'pan' ? 1 : 0);
                const releaseSyncMs = mode === 'zoom' ? null : performance.now() - releaseAt;
                await h.settle();
                const releaseSettledMs = mode === 'zoom' ? null : performance.now() - releaseAt;
                a.lastInputAt = lastInputAt; a.releaseAt = releaseAt;
                if (mode === 'pan' && c.view.x === a.before.view.x) throw Error('Pan did not change the camera.');
                if (mode === 'zoom' && !sawZoomChange) throw Error('Zoom did not change the camera.');
                if (mode === 'drag' && h.graph.nodes.n0.x === a.before.geometry.node.x) throw Error('Drag did not persist coordinates.');
                if (h.providerCalls()) throw Error('Unexpected provider call.');
                return { repeat: null, downMs, thresholdDelayMs: thresholdAt - a.startedAt, thresholdSyncMs: handlers[0], thresholdSettledMs, releaseSyncMs, releaseSettledMs, savesDuringLiveMotion: savesBeforeRelease - a.saveStart, intervals, handlers, allVisibleDuringPan: size === 10 && mode === 'pan' ? allVisibleDuringPan : null, providerCalls: h.providerCalls() };
            }, { mode, size, frames, eventsPerFrame });
            const afterMetrics = await metrics();
            for (const [key, name] of Object.entries(metricNames)) sample[key] = (afterMetrics[name] - beforeMetrics[name]) * 1000;
            sample.layoutCount = afterMetrics.LayoutCount - beforeMetrics.LayoutCount;
            sample.styleRecalcCount = afterMetrics.RecalcStyleCount - beforeMetrics.RecalcStyleCount;
            const inspection = await page.evaluate(async ({ size, mode, disableCulling }) => {
                const h = canvasHarness, c = h.canvas, a = viewportProbe, saves = __viewportProbeSaves;
                try {
                    const deadline = performance.now() + 5000;
                    let finalCommit, finalSaveAt;
                    while (true) {
                        finalCommit = mode === 'drag' ? undefined : a.commits.find(commit => commit.at >= a.lastInputAt);
                        if (mode === 'drag' || finalCommit) {
                            const saveAfter = Math.max(a.lastInputAt, finalCommit?.at ?? a.lastInputAt);
                            finalSaveAt = saves.events.slice(a.saveStart).find(at => at >= saveAfter);
                            if (finalSaveAt !== undefined) break;
                        }
                        if (performance.now() > deadline) throw Error('Final gesture commit and host save submission did not complete.');
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                    const after = a.snapshot(), old = a.before.geometry, next = after.geometry;
                    if (disableCulling && after.opacitySuppressed) throw Error('The culling-disabled diagnostic was overwritten during the gesture.');
                    const near = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= .05;
                    const geometryRetained = near(old.width, next.width) && near(old.height, next.height) && old.pins.length === next.pins.length && old.pins.every((pin, i) => pin.id === next.pins[i].id && pin.dir === next.pins[i].dir && near(pin.local.x, next.pins[i].local.x) && near(pin.local.y, next.pins[i].local.y));
                    const endpointFollowsNode = old.pins.every((pin, i) => near(next.pins[i].graph.x - pin.graph.x, next.node.x - old.node.x) && near(next.pins[i].graph.y - pin.graph.y, next.node.y - old.node.y));
                    const retained = { n0Node: c.nodeLayer.querySelector('[data-id="n0"]') === a.node, n0Pins: a.pins.every(pin => a.node.contains(pin)), allNodes: a.nodes.every(card => c.nodeLayer.contains(card)), n0CachedGeometry: geometryRetained, n0GraphEndpoints: endpointFollowsNode };
                    if (Object.values(retained).some(value => !value)) throw Error('Gesture changed retained DOM or cached graph-space geometry: ' + JSON.stringify(retained));
                    if (size === 10 && mode === 'pan' && innerWidth >= 3840 && innerHeight >= 2160 && after.fullyVisible !== size) throw Error('Compact 10-card fixture is not fully visible after pan.');
                    return { after, retained, saveBoundary: { calls: saves.calls - a.saveStart, finalSubmissionAfterLastInputMs: finalSaveAt - a.lastInputAt, finalSubmissionAfterReleaseMs: finalSaveAt - a.releaseAt, viewCommitAfterLastInputMs: finalCommit ? finalCommit.at - a.lastInputAt : null, viewCommitSyncMs: finalCommit?.syncMs ?? null, commits: a.commits.length, kind: 'synthetic host submission; no disk acknowledgment' } };
                } finally { a.restoreCommit(); a.opacityRestores.forEach(restore => restore()); }
            }, { size, mode, disableCulling });
            if (errors.length || blocked.length || httpErrors.length || sample.providerCalls) throw Error(JSON.stringify({ errors, blocked, httpErrors, providerCalls: sample.providerCalls }));
            if (sample.allVisibleDuringPan === false && viewport.width >= 3840 && viewport.height >= 2160) throw Error('Compact 10-card fixture left the viewport during pan.');
            if (repeat < 0) continue;
            row.samples.push({ ...sample, repeat, before: beforeSnapshot, ...inspection });
            console.log(JSON.stringify({ size, mode, repeat, disableCulling, ...summarize([sample]), visible: beforeSnapshot.visible, offscreen: beforeSnapshot.offscreen, markedOffscreen: beforeSnapshot.markedOffscreen, opacitySuppressed: beforeSnapshot.opacitySuppressed, retained: inspection.retained, saveBoundary: inspection.saveBoundary }));
            await persist();
        }
    }
    report.providerCalls = await page.evaluate(() => canvasHarness.providerCalls());
    if (errors.length || blocked.length || httpErrors.length || report.providerCalls) throw Error(JSON.stringify({ errors, blocked, httpErrors, providerCalls: report.providerCalls }));
    report.status = 'complete'; await persist();
    console.log(`Saved ${rows.reduce((count, row) => count + row.samples.length, 0)} samples to ${resultPath}`);
} catch (error) { report.status = 'failed'; report.failure = { message: error.message, stack: error.stack }; await persist(); throw error; }
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
