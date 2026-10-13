import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, totalmem } from 'node:os';

const usage = 'node tools/benchmark-lattice-open.mjs --source=<built-source> --output=<directory> --sizes=25,100,250 --repeats=5 [--instrument]';
export function parseOptions(args) {
    const values = new Map(); let instrument = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--instrument') { if (instrument) throw Error('Repeated --instrument'); instrument = true; continue; }
        const match = /^--(source|output|sizes|repeats)(?:=(.*))?$/.exec(args[i]);
        if (!match) throw Error(`Unsupported argument: ${args[i]}`);
        if (values.has(match[1])) throw Error(`Unsupported or repeated option: --${match[1]}`);
        const value = match[2] ?? args[++i];
        if (!value || value.startsWith('--')) throw Error(`Missing value for --${match[1]}`);
        values.set(match[1], value);
    }
    const repeats = Number(values.get('repeats') ?? 5);
    if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 30) throw Error('Use repeats from 1 through 30 (at least five for comparisons).');
    const sizes = (values.get('sizes') ?? '25,100,250').split(',').map(Number);
    if (!sizes.length || new Set(sizes).size !== sizes.length || !sizes.every(n => Number.isSafeInteger(n) && n >= 2 && n <= 500)) throw Error('Use unique sizes from 2 through 500.');
    return { source: resolve(values.get('source') ?? process.cwd()), output: resolve(values.get('output') ?? join(process.cwd(), 'benchmark-results', 'lattice-open')), sizes, repeats, instrument };
}
export function assertReopenedContent({ authoredSectionText, drawnSectionText }, mode) {
    const expected = mode === 'changed' ? 'Changed content while closed.' : 'Synthetic rendering fixture.';
    if (authoredSectionText !== expected) throw Error('Closed edit was lost.');
    if (drawnSectionText !== expected) throw Error('Reopening showed stale section content.');
}
const hash = value => createHash('sha256').update(value).digest('hex');
export const summarize = samples => Object.fromEntries(['syncMs', 'settleMs', 'layoutCount', 'layoutMs', 'styleCount', 'styleMs', 'scriptMs', 'taskMs'].flatMap(key => {
    const values = samples.map(sample => sample[key]).filter(Number.isFinite).sort((a, b) => a - b);
    return values.length ? [[`${key}Median`, values[Math.ceil(values.length * .5) - 1]], [`${key}P95`, values[Math.ceil(values.length * .95) - 1]]] : [];
}));
export async function sourceIdentity(source) {
    const walk = async path => (await Promise.all((await readdir(join(source, path), { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(join(path, entry.name)) : join(path, entry.name)))).flat();
    const paths = ['index.js', 'style.css', 'manifest.json', 'package.json', 'package-lock.json', 'tests/mock.js', 'tests/browser/harness.html', 'tests/browser/harness.js', 'tests/browser/native-fixture.mjs', ...await walk('src'), ...await walk('ui'), ...await walk('dist')];
    const files = await Promise.all(paths.sort().map(async path => { const bytes = await readFile(join(source, path)); return { path: path.replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes) }; }));
    const bundle = files.find(file => file.path === 'dist/lattice-ui.js');
    if (!bundle) throw Error('Source must already have dist/lattice-ui.js; the benchmark never builds.');
    let reference;
    try { reference = { snapshot: (await readFile(join(source, 'snapshot-ref.txt'), 'utf8')).trim() }; }
    catch { try { const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); reference = { head: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), status: git('status', '--short') }; } catch { reference = { unavailable: true }; } }
    return { files, sourceSha256: hash(JSON.stringify(files.filter(file => !file.path.startsWith('dist/')))), buildSha256: hash(JSON.stringify(files.filter(file => file.path.startsWith('dist/')))), bundleSha256: bundle.sha256, reference };
}
// Only the synthetic harness is adapted. Production modules and bundle are served byte-for-byte.
export function adaptHarness(body, instrument) {
    const marker = 'window.lattice.open();';
    if (body.split(marker).length !== 2) throw Error('Unsupported harness startup open boundary.');
    body = body.replace(marker, '// Benchmark controls first opening after closed fixture admission.');
    // Older snapshots dropped the independent Canvas options in their capturing wrapper.
    body = body.replace('function (graph) { canvas = this; return setGraph.call(this, graph); }', 'function (graph, ...options) { canvas = this; return setGraph.call(this, graph, ...options); }');
    if (instrument) {
        const marker = 'const setGraph = Canvas.prototype.setGraph;';
        if (!body.includes(marker)) throw Error('Unsupported harness Canvas boundary.');
        body = body.replace(marker, `
const count = name => { if (globalThis.__openingWork) globalThis.__openingWork[name] = (globalThis.__openingWork[name] ?? 0) + 1; };
for (const name of ['setGraph', 'render']) { const original = Canvas.prototype[name]; Canvas.prototype[name] = function (...args) {
    count(name);
    if (!this.geometry.__openingWrapped) { const measure = this.geometry.measure; this.geometry.measure = function (...args) { count('geometryMeasure'); return measure.apply(this, args); }; this.geometry.__openingWrapped = true; }
    return original.apply(this, args);
}; }
for (const [prototype, name, counter] of [[Element.prototype, 'getBoundingClientRect', 'elementRects'], [Range.prototype, 'getBoundingClientRect', 'rangeRects'], [Range.prototype, 'getClientRects', 'rangeClientRects']]) { const original = prototype[name]; prototype[name] = function (...args) { count(counter); return original.apply(this, args); }; }
const computedStyle = globalThis.getComputedStyle; globalThis.getComputedStyle = function (...args) { count('computedStyle'); return computedStyle.apply(this, args); };
${marker}`);
    }
    return body;
}

async function main() {
    if (process.argv.includes('--help')) { console.log(usage); return; }
    const options = parseOptions(process.argv.slice(2)), { source, output, instrument, sizes, repeats } = options;
    const require = createRequire(join(source, 'package.json')), { chromium } = require('@playwright/test');
    const identity = await sourceIdentity(source), measurement = await readFile(fileURLToPath(import.meta.url));
    const viewport = { width: 1440, height: 1000 }, rows = [], errors = [], blocked = [], httpErrors = [];
    const report = { status: 'partial', date: new Date().toISOString(), options, identity, measurementSha256: hash(measurement), command: process.argv, runtime: process.version, hardware: { cpuModels: [...new Set(cpus().map(cpu => cpu.model))], logicalCpus: cpus().length, memoryBytes: totalmem(), platform: process.platform, arch: process.arch }, viewport, requestedDpr: 1, reducedMotion: 'reduce', cpuThrottlingRate: 1, errors, blocked, httpErrors, providerCalls: 0, rows,
        scope: 'Production controller and supplied production UI bundle in disabled synthetic host. Cold is first controller open on a fresh page/context after modules/fonts/closed fixture admission; unchanged and same-ID mutable-root changed reopen follow serially. Module loading, host authentication and provider/model execution excluded. Settle is three requestAnimationFrame opportunities, not physical paint, input latency or authenticated-host latency. CDP counters are renderer work, not pin-specific forced-layout counts. Instrumented primitive/Canvas work counts run separately and must not be compared as ordinary timings.' };
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    const server = createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname), path = resolve(source, `.${pathname}`);
            if (!path.startsWith(source.endsWith(sep) ? source : source + sep)) { response.writeHead(403).end(); return; }
            let body = await readFile(path);
            if (pathname === '/tests/browser/harness.js') body = adaptHarness(body.toString(), instrument);
            response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(body);
        } catch (error) { response.writeHead(404).end(error.message); }
    });
    await mkdir(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`, resultPath = join(output, instrument ? 'lattice-open-instrumented.json' : 'lattice-open-results.json');
    const persist = async () => { report.summary = rows.map(({ size, mode, samples }) => ({ size, mode, repeats: samples.length, ...summarize(samples) })); await writeFile(resultPath, JSON.stringify(report, null, 2)); };
    let browser;
    try {
        browser = await chromium.launch({ headless: true }); report.browser = { version: browser.version(), executablePath: chromium.executablePath(), playwrightVersion: require('@playwright/test/package.json').version };
        for (const size of sizes) {
            const cases = Object.fromEntries(['cold', 'unchanged', 'changed'].map(mode => { const row = { size, mode, samples: [] }; rows.push(row); return [mode, row]; }));
            for (let repeat = 0; repeat < repeats; repeat++) {
                const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
                try {
                    const page = await context.newPage();
                    page.on('pageerror', error => errors.push(error.message));
                    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
                    page.on('response', response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
                    await page.route('**/*', route => {
                        const request = route.request(), url = new URL(request.url());
                        if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
                        if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) { blocked.push(`${request.method()} ${url.href}`); return route.abort(); }
                        if (url.pathname === '/script.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;' });
                        if (url.pathname === '/scripts/user.js') return route.fulfill({ contentType: 'text/javascript', body: "export const getCurrentUserHandle=()=> 'default-user';" });
                        return route.continue();
                    });
                    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
                    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
                    await page.goto(base + '/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness);
                    await page.evaluate(async size => {
                        const h = canvasHarness, { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version), { canvasWorkflow } = await import('/tests/browser/native-fixture.mjs');
                        await h.activate(canvasWorkflow(operationDefaults, size, 10)); await document.fonts.ready;
                        if (document.querySelector('.pc-open')) throw Error('Cold fixture was opened before sampling.');
                    }, size);
                    let previousScope;
                    for (const mode of ['cold', 'unchanged', 'changed']) {
                        if (mode !== 'cold') await page.evaluate(async mode => {
                            window.lattice.close(); await canvasHarness.settle();
                            if (mode === 'changed') { const node = canvasHarness.graph.nodes.n0; node.title = 'Changed while closed'; node.sections[0].text = 'Changed content while closed.'; }
                            await canvasHarness.settle();
                        }, mode);
                        const before = await metrics();
                        const sample = await page.evaluate(async ({ instrument }) => {
                            globalThis.__openingWork = instrument ? {} : null;
                            const start = performance.now(); window.lattice.open(); const syncMs = performance.now() - start;
                            await canvasHarness.settle(); await new Promise(resolve => requestAnimationFrame(resolve));
                            const settleMs = performance.now() - start, work = globalThis.__openingWork; globalThis.__openingWork = null;
                            return { syncMs, settleMs, work };
                        }, { instrument });
                        const after = await metrics();
                        for (const [key, metric] of Object.entries({ layoutCount: 'LayoutCount', styleCount: 'RecalcStyleCount', layoutMs: 'LayoutDuration', styleMs: 'RecalcStyleDuration', scriptMs: 'ScriptDuration', taskMs: 'TaskDuration' })) sample[key] = (after[metric] - before[metric]) * (key.endsWith('Ms') ? 1000 : 1);
                        sample.correctness = await page.evaluate(({ size, mode, previousScope }) => {
                            const h = canvasHarness, c = h.canvas, card = c.nodeLayer.querySelector('[data-id="n0"]'), title = mode === 'changed' ? 'Changed while closed' : 'Text 1';
                            const cards = c.nodeLayer.querySelectorAll('.pc-node-native').length;
                            if (cards !== size || Object.keys(c.graph.nodes).length !== size) throw Error(`Wrong card count ${cards}/${size}`);
                            if (!card?.textContent.includes(title) || c.graph.nodes.n0.title !== title) throw Error('Reopening showed stale title.');

                            if (previousScope && previousScope === c.detailScopeKey) throw Error('Opening reused edit scope.');
                            const pins = [...card.querySelectorAll('.pc-port')].map(pin => ({ direction: pin.dataset.dir, port: pin.dataset.port, local: c.geometry.endpoint('n0', pin.dataset.dir, pin.dataset.port) }));
                            if (!pins.length || pins.some(pin => !pin.local || !Number.isFinite(pin.local.x) || !Number.isFinite(pin.local.y))) throw Error('Missing finite pin geometry.');
                            const providerCalls = h.providerCalls(); if (providerCalls !== 0) throw Error(`Unexpected provider calls: ${providerCalls}`);
                            if (h.context.extensionSettings.lattice.enabled) throw Error('Synthetic host unexpectedly enabled.');
                            return { authoredSectionText: h.graph.nodes.n0.sections[0].text, drawnSectionText: c.graph.nodes.n0.sections[0].text, nodes: size, cards, title, editScope: c.detailScopeKey, freshEditScope: true, pins, width: c.widthOf(c.graph.nodes.n0), height: c.heightOf(c.graph.nodes.n0), providerCalls, actualDpr: devicePixelRatio };
                        }, { size, mode, previousScope });
                        assertReopenedContent(sample.correctness, mode);
                        previousScope = sample.correctness.editScope; report.providerCalls += sample.correctness.providerCalls;
                        cases[mode].samples.push(sample);
                        if (errors.length || blocked.length || httpErrors.length) throw Error('Page, console, HTTP or prohibited request failure; inspect report.');
                    }
                } finally { await context.close(); }
            }
            await persist();
            console.log(JSON.stringify(report.summary.filter(row => row.size === size)));
        }
        const afterIdentity = await sourceIdentity(source);
        if (afterIdentity.sourceSha256 !== identity.sourceSha256 || afterIdentity.buildSha256 !== identity.buildSha256) throw Error('Source/build changed during measurement. Freeze source and rerun.');
        report.identityStable = true; report.status = 'complete';
    } catch (error) { report.failure = error.stack; throw error; }
    finally { await persist(); await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
