import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join, relative, sep, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { cpus, totalmem } from 'node:os';

// This tool never builds. Both bundles run against one frozen snapshot of the
// current controller, CSS, fonts and synthetic host, in a single browser process.
const usage = `node tools/benchmark-shelf-browsing.mjs --baseline=<saved-lattice-ui.js> [--source=<repo>] [--output=<directory>] [--sizes=3,250] [--cpu=1,4] [--repeats=3] [--sweeps=4] [--no-instrument]
Each repeat is a complete ABBA block: baseline, candidate, candidate, baseline.
Every slot gets a fresh browser context. Candidate is source/dist/lattice-ui.js.
Example: node tools/benchmark-shelf-browsing.mjs --baseline=.tmp/shelf-start-2026-10-15.js --repeats=3`;

export function parseOptions(args) {
    const values = new Map(); let instrument = true;
    for (let index = 0; index < args.length; index++) {
        if (args[index] === '--no-instrument') {
            if (!instrument) throw Error('Repeated --no-instrument.');
            instrument = false; continue;
        }
        const match = /^--(baseline|source|output|sizes|cpu|repeats|sweeps)(?:=(.*))?$/.exec(args[index]);
        if (!match || values.has(match[1])) throw Error(`Unsupported or repeated argument: ${args[index]}`);
        const value = match[2] ?? args[++index];
        if (!value || value.startsWith('--')) throw Error(`Missing value for --${match[1]}.`);
        values.set(match[1], value);
    }
    if (!values.has('baseline')) throw Error('Supply --baseline=<saved UI bundle>; no Git reference is inferred.');
    const integer = (key, fallback, min, max) => {
        const value = Number(values.get(key) ?? fallback);
        if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(`Use --${key}=${min}..${max}.`);
        return value;
    };
    const list = (key, fallback, valid) => {
        const numbers = (values.get(key) ?? fallback).split(',').map(Number);
        if (!numbers.length || new Set(numbers).size !== numbers.length || !numbers.every(valid)) throw Error(`Invalid --${key}.`);
        return numbers;
    };
    return {
        baseline: resolve(values.get('baseline')), source: resolve(values.get('source') ?? process.cwd()),
        output: resolve(values.get('output') ?? join(process.cwd(), 'benchmark-results', 'shelf-browsing')),
        sizes: list('sizes', '3,250', n => Number.isSafeInteger(n) && n >= 2 && n <= 500),
        cpu: list('cpu', '1,4', n => n === 1 || n === 4),
        repeats: integer('repeats', 3, 1, 30), sweeps: integer('sweeps', 4, 1, 100), instrument,
    };
}

const hash = data => createHash('sha256').update(data).digest('hex');
const percentile = (values, p) => {
    if (!values.length) return null;
    const sorted = values.toSorted((a, b) => a - b);
    return p === .5 && sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.ceil(sorted.length * p) - 1];
};
const statistics = values => ({ count: values.length, median: percentile(values, .5), p95: percentile(values, .95), max: values.length ? Math.max(...values) : null });
const numeric = (rows, key) => rows.map(row => row[key]).filter(Number.isFinite);
export function summarize(rows) {
    return [...new Set(rows.map(row => JSON.stringify([row.size, row.cpu, row.variant, row.phase])))].map(key => {
        const [size, cpu, variant, phase] = JSON.parse(key), group = rows.filter(row => row.size === size && row.cpu === cpu && row.variant === variant && row.phase === phase);
        const switches = group.flatMap(row => row.switches);
        return { size, cpu, variant, phase, contexts: group.length, switches: switches.length,
            handlerMs: statistics(numeric(switches, 'handlerMs')), domCommittedMs: statistics(numeric(switches, 'domCommittedMs')),
            readyMs: statistics(numeric(switches, 'readyMs')), nextRafOpportunityMs: statistics(numeric(switches, 'nextRafOpportunityMs')),
            contextMedianReadyMs: statistics(group.map(row => percentile(numeric(row.switches, 'readyMs'), .5))),
            rendererPerSwitch: Object.fromEntries(['scriptMs', 'layoutMs', 'styleMs', 'taskMs', 'layoutCount', 'styleCount'].map(name => [name, statistics(group.map(row => row.renderer[name] / row.switches.length))])),
        };
    });
}

async function freezeSource(source) {
    const walk = async directory => (await Promise.all((await readdir(join(source, directory), { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : join(directory, entry.name)))).flat();
    const paths = ['index.js', 'style.css', 'manifest.json', 'package.json', 'package-lock.json', 'tests/mock.js', 'tests/browser/harness.html', 'tests/browser/harness.js', 'tests/browser/native-fixture.mjs', ...await walk('src'), ...await walk('ui'), ...await walk('dist'), ...await walk('assets')];
    const files = new Map(await Promise.all([...new Set(paths)].sort().map(async path => [path.replaceAll('\\', '/'), await readFile(join(source, path))])));
    const identity = [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) }));
    return { files, identity, sha256: hash(JSON.stringify(identity)) };
}

// Runs inside Chromium. The observer detects the correct family, then a bounded
// microtask sentinel crosses open()'s awaited Svelte tick and position commit.
// Merely observing the menu or waiting for one rAF would not establish readiness.
function installBrowserProbe() {
    const h = window.canvasHarness, root = document.querySelector('.pc-canvas-area'), shelf = root?.querySelector('.pc-node-shelf');
    if (!root || !shelf) throw Error('Mounted production shelf is unavailable.');
    const buttons = [...shelf.querySelectorAll('.pc-family-row:not(:disabled)')];
    if (buttons.length < 2) throw Error('At least two enabled families are required.');
    const graph = JSON.stringify(h.graph), focus = document.activeElement;
    const familyNames = buttons.map(button => button.dataset.family), expectedChoices = new Map(), knownRows = new WeakSet();
    const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve(performance.now())));
    const microtask = () => new Promise(resolve => queueMicrotask(resolve));
    let lastFamily = '', recordWork = false, work = null;
    const originalRect = Element.prototype.getBoundingClientRect;
    let workObserver;
    const shelfElement = element => element instanceof Element && !!element.closest('.pc-node-shelf, .pc-shelf-menu');
    const countMutations = records => {
        if (!recordWork || !work) return;
        const add = (node, collection) => {
            collection.add(node);
            for (const child of node.childNodes) add(child, collection);
        };
        for (const mutation of records) {
            if (shelfElement(mutation.target)) {
                for (const node of mutation.addedNodes) add(node, work.added);
                for (const node of mutation.removedNodes) add(node, work.removed);
            } else {
                for (const node of mutation.addedNodes) if (shelfElement(node)) add(node, work.added);
                for (const node of mutation.removedNodes) if (node instanceof Element && node.matches('.pc-node-shelf, .pc-shelf-menu')) add(node, work.removed);
            }
        }
    };
    const stopWork = () => {
        if (!work) return null;
        countMutations(workObserver.takeRecords()); recordWork = false;
        // Attachments include pooled rows moved back into the live drawer. Track
        // DOM object identity separately; prior plain cold/warm validation seeds
        // knownRows with every visited family's rows before instrumentation.
        const observedRows = new Set([...work.added].filter(node => node instanceof Element && node.matches('[data-shelf-choice]')));
        for (const row of root.querySelectorAll('.pc-family-menu [data-shelf-choice]')) observedRows.add(row);
        let newRowIdentities = 0, reusedRows = 0;
        for (const row of observedRows) {
            if (knownRows.has(row)) reusedRows++; else { newRowIdentities++; knownRows.add(row); }
        }
        const result = { shelfRectReads: work.shelfRectReads, paneRectReads: work.paneRectReads,
            addedNodes: work.added.size, removedNodes: work.removed.size,
            addedElements: [...work.added].filter(node => node instanceof Element).length,
            removedElements: [...work.removed].filter(node => node instanceof Element).length,
            observedRowIdentities: observedRows.size, newRowIdentities, reusedRows };
        work = null; return result;
    };
    function validate(button) {
        const menu = root.querySelector('.pc-family-menu'), family = button.dataset.family;
        if (!menu || menu.getAttribute('aria-label') !== family + ' nodes' || button.getAttribute('aria-expanded') !== 'true') return { ok: false, reason: 'Expected family has not committed.' };
        const box = menu.getBoundingClientRect(), area = root.getBoundingClientRect(), anchor = button.getBoundingClientRect(), first = menu.querySelector('button')?.getBoundingClientRect(), css = getComputedStyle(menu);
        const left = area.left + root.clientLeft, top = area.top + root.clientTop, right = left + root.clientWidth, bottom = top + root.clientHeight;
        const alignedTop = first ? anchor.top + (anchor.height - first.height) / 2 - (first.top - box.top) : anchor.top;
        const expectedTop = top + Math.max(4, Math.min(alignedTop - top, root.clientHeight - box.height - 4));
        const within = box.left >= left - 1 && box.right <= right + 1 && box.top >= top - 1 && box.bottom <= bottom + 1;
        const aligned = Math.abs(box.top - expectedTop) <= 1;
        if (!within || !aligned || box.width <= 0 || box.height <= 0 || css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0) return { ok: false, reason: `Drawer geometry is not ready: ${JSON.stringify({ family, within, aligned, top: box.top, expectedTop })}` };
        const rows = [...menu.querySelectorAll('[data-shelf-choice]')], ids = rows.map(element => element.dataset.shelfChoice);
        if (!ids.length) throw Error('An enabled family has no choices: ' + family);
        const serialized = JSON.stringify(ids), previous = expectedChoices.get(family);
        if (previous && previous !== serialized) throw Error('Choice inventory changed while browsing: ' + family);
        expectedChoices.set(family, serialized);
        return { ok: true, menu, style: menu.getAttribute('style'), choices: ids.length, rows };
    }
    async function open(button, instrumented) {
        const family = button.dataset.family;
        if (family === lastFamily) throw Error('Benchmark attempted a same-family no-op: ' + family);
        let observer, timeout;
        const seen = new Promise((resolve, reject) => {
            const check = () => { if (root.querySelector('.pc-family-menu')?.getAttribute('aria-label') === family + ' nodes') resolve(); };
            observer = new MutationObserver(check);
            observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'style', 'class'] });
            timeout = setTimeout(() => reject(Error('Timed out opening ' + family)), 5000);
        });
        const event = new PointerEvent('pointerenter', { pointerType: 'mouse', pointerId: 1, isPrimary: true });
        if (instrumented) { workObserver.takeRecords(); work = { shelfRectReads: 0, paneRectReads: 0, added: new Set(), removed: new Set() }; recordWork = true; }
        const started = performance.now();
        let handlerMs, domCommittedMs, readyMs, result, checks = 0, measuredWork;
        try {
            button.dispatchEvent(event); handlerMs = performance.now() - started;
            await seen;
            // The first observer delivery can precede open()'s continuation.
            // Two queued microtasks plus stable style/geometry verification form
            // the commit sentinel; no animation frame is awaited to define ready.
            await microtask(); await microtask();
            let style = root.querySelector('.pc-family-menu')?.getAttribute('style');
            for (; checks < 8; checks++) {
                await microtask();
                const menu = root.querySelector('.pc-family-menu'), nextStyle = menu?.getAttribute('style');
                if (style !== nextStyle) { style = nextStyle; continue; }
                domCommittedMs = performance.now() - started;
                // Probe reads do not count as production shelf geometry reads.
                const recording = recordWork; recordWork = false;
                result = validate(button);
                recordWork = recording;
                if (result.ok) break;
            }
            if (!result?.ok) throw Error(result?.reason ?? 'Shelf position did not settle for ' + family);
            readyMs = performance.now() - started;
            if (instrumented) measuredWork = stopWork();
            else for (const row of result.rows) knownRows.add(row);
        } finally { clearTimeout(timeout); observer.disconnect(); if (recordWork) stopWork(); }
        lastFamily = family;
        const nextRafOpportunityMs = (await frame()) - started;
        // A later frame must not change the position established by the sentinel.
        if (result.menu.getAttribute('style') !== result.style) throw Error('Position changed after the readiness sentinel for ' + family);
        return instrumented ? { family, ...measuredWork, readinessChecks: checks + 1 } : { family, handlerMs, domCommittedMs, readyMs, nextRafOpportunityMs, readinessChecks: checks + 1, choices: result.choices };
    }
    window.__shelfBenchmark = {
        families: familyNames,
        graph,
        instrument() {
            workObserver = new MutationObserver(countMutations);
            workObserver.observe(root, { subtree: true, childList: true });
            Element.prototype.getBoundingClientRect = function (...args) {
                if (recordWork && work) {
                    if (shelfElement(this)) work.shelfRectReads++;
                    else if (this === root) work.paneRectReads++;
                }
                return originalRect.apply(this, args);
            };
        },
        async sweep({ sweeps = 1, instrumented = false, cold = false }) {
            const switches = [];
            for (let sweep = 0; sweep < sweeps; sweep++) {
                const ordered = cold || sweep % 2 === 0 ? buttons : buttons.toReversed();
                for (const button of ordered) if (button.dataset.family !== lastFamily) switches.push(await open(button, instrumented));
            }
            return switches;
        },
        async warm() {
            // Explicit warm-up after the separately recorded first visit sweep.
            for (const button of buttons.toReversed()) if (button.dataset.family !== lastFamily) await open(button, false);
        },
        correctness() {
            if (JSON.stringify(h.graph) !== graph) throw Error('Shelf browsing changed the authored graph.');
            if (document.activeElement !== focus) throw Error('Hover browsing stole focus.');
            if (h.providerCalls() !== 0) throw Error('Shelf browsing called a provider.');
            if (h.canvas.hasContentGesture()) throw Error('Shelf browsing left an active canvas gesture.');
            return { graphPreserved: true, focusPreserved: true, providerCalls: 0, nodes: Object.keys(h.graph.nodes).length, choices: Object.fromEntries(expectedChoices), actualDpr: devicePixelRatio };
        },
        dispose() { workObserver?.disconnect(); Element.prototype.getBoundingClientRect = originalRect; },
    };
    return { families: familyNames, graph };
}

const metricNames = { scriptMs: 'ScriptDuration', layoutMs: 'LayoutDuration', styleMs: 'RecalcStyleDuration', taskMs: 'TaskDuration', layoutCount: 'LayoutCount', styleCount: 'RecalcStyleCount' };
const deltaMetrics = (before, after) => Object.fromEntries(Object.entries(metricNames).map(([key, metric]) => {
    if (!Number.isFinite(before[metric]) || !Number.isFinite(after[metric])) throw Error('Required Chromium metric unavailable: ' + metric);
    return [key, (after[metric] - before[metric]) * (key.endsWith('Ms') ? 1000 : 1)];
}));
const format = value => Number.isFinite(value) ? value.toFixed(3) : 'n/a';
function markdown(report) {
    const lines = ['# Shelf browsing benchmark', '', `Status: **${report.status}**. ${report.date}`, '',
        `Baseline: \`${report.variants.baseline.sha256}\`. Candidate: \`${report.variants.candidate.sha256}\`.`, '',
        'Each repeat is ABBA in one Chromium process, with a fresh context per slot. Cold is the first family visit sweep after fixture admission; warm follows an explicit visit to every family. Values below are medians of context medians. Renderer durations include the probe and final geometry validation; instrumentation runs afterward and is excluded from timings.', '',
        '| Nodes | CPU | Phase | Baseline ready ms | Candidate ready ms | Change | Baseline script/switch ms | Candidate script/switch ms |',
        '| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |'];
    for (const size of report.options.sizes) for (const cpu of report.options.cpu) for (const phase of ['cold-first-sweep', 'warm']) {
        const find = variant => report.summary.find(row => row.size === size && row.cpu === cpu && row.phase === phase && row.variant === variant), baseline = find('baseline'), candidate = find('candidate');
        if (!baseline && !candidate) continue;
        const a = baseline?.contextMedianReadyMs.median, b = candidate?.contextMedianReadyMs.median;
        lines.push(`| ${size} | ${cpu}× | ${phase} | ${format(a)} | ${format(b)} | ${a > 0 && Number.isFinite(b) ? ((b / a - 1) * 100).toFixed(1) + '%' : 'n/a'} | ${format(baseline?.rendererPerSwitch.scriptMs.median)} | ${format(candidate?.rendererPerSwitch.scriptMs.median)} |`);
    }
    if (report.instrumented.length) {
        lines.push('', 'Separate untimed work pass; values are medians of per-context totals.', '',
            '| Nodes | CPU | Bundle | Switches/context | New row identities/context | Reused row observations/context | Attached element observations/context |',
            '| ---: | ---: | --- | ---: | ---: | ---: | ---: |');
        for (const size of report.options.sizes) for (const cpu of report.options.cpu) for (const variant of ['baseline', 'candidate']) {
            const samples = report.instrumented.filter(row => row.size === size && row.cpu === cpu && row.variant === variant);
            if (!samples.length) continue;
            const total = key => percentile(samples.map(sample => sample.switches.reduce((sum, row) => sum + row[key], 0)), .5);
            lines.push(`| ${size} | ${cpu}× | ${variant} | ${format(percentile(samples.map(sample => sample.switches.length), .5))} | ${format(total('newRowIdentities'))} | ${format(total('reusedRows'))} | ${format(total('addedElements'))} |`);
        }
        lines.push('', '`newRowIdentities` counts previously unseen row DOM objects observed in attachments or the active drawer. A WeakSet is seeded by prior cold/warm validation of every family. `reusedRows` counts known row objects observed once per switch. Added/removed nodes and elements count DOM attachment/removal observations, including moves of pooled objects; they do not measure allocation or creation. Detached rows never attached or shown are outside this probe.');
    }
    lines.push('', 'Readiness crosses the async Svelte position commit, checks stable inline position, and validates visible geometry and clamped row alignment before any rAF wait. JSON separates synchronous handler time, DOM commit, geometry-validated ready, and next-rAF opportunity. A geometry read can force layout. rAF is an opportunity estimate, not paint or INP.', '',
        'Synthetic pointerenter events isolate shelf handling; OS input delivery, real pointer hit-testing, overlapping/coalesced hovers, authenticated SillyTavern CSS, providers and module loading are outside scope. Cold does not mean a cold browser/JIT for each family. CPU throttling affects renderer CPU only. Use per-context and ABBA block comparisons; pooled switch percentiles are descriptive, not independent replicates.', '',
        `JSON contains ${report.rows.length} timed phase samples and ${report.instrumented.length} separate work-count samples, full file hashes, raw switch data and validation. No Git revision supplies the baseline.`);
    if (report.failure) lines.push('', 'Failure: ' + report.failure.split('\n')[0]);
    return lines.join('\n') + '\n';
}

export async function main(args = process.argv.slice(2)) {
    if (args.includes('--help')) { console.log(usage); return; }
    const options = parseOptions(args), { source, output } = options;
    const snapshot = await freezeSource(source), baseline = await readFile(options.baseline), candidate = snapshot.files.get('dist/lattice-ui.js');
    if (!baseline.length || !candidate?.length) throw Error('Both UI bundles must be nonempty.');
    const require = createRequire(join(source, 'package.json')), { chromium } = require('@playwright/test');
    const viewport = { width: 1440, height: 1000 }, rows = [], instrumented = [], failures = [], networkFailures = [];
    const report = { status: 'partial', date: new Date().toISOString(), command: process.argv, options, viewport, requestedDpr: 1, reducedMotion: 'reduce', runtime: process.version,
        hardware: { cpuModels: [...new Set(cpus().map(cpu => cpu.model))], logicalCpus: cpus().length, memoryBytes: totalmem(), platform: process.platform, arch: process.arch },
        variants: { baseline: { path: options.baseline, sha256: hash(baseline), bytes: baseline.length }, candidate: { path: join(source, 'dist/lattice-ui.js'), sha256: hash(candidate), bytes: candidate.length } },
        sourceSnapshot: { sha256: snapshot.sha256, files: snapshot.identity }, measurement: { path: fileURLToPath(import.meta.url), sha256: hash(await readFile(fileURLToPath(import.meta.url))) },
        schedule: 'For each size/CPU case, each repeat runs baseline,candidate,candidate,baseline serially in one browser; fresh context per slot. All served bytes are frozen at startup except the explicitly selected UI bundle.',
        scope: 'Synthetic production harness and mounted controller. Synthetic pointerenter, async commit sentinel, stable inline position and geometry validation. Geometry-ready includes benchmark validation reads; CDP counters include probe work. Next-rAF is an opportunity, not physical paint, input delivery or INP. Instrumented DOM/rect counts follow timed passes and exclude validation reads. No providers or external requests.',
        rows, instrumented, failures, networkFailures, summary: [], comparisons: [] };
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
    const server = createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname), absolute = resolve(source, '.' + pathname), path = relative(source, absolute).replaceAll('\\', '/');
        if (path === '..' || path.startsWith('../') || (sep === '\\' && path.includes(':'))) { response.writeHead(403).end(); return; }
        const body = snapshot.files.get(path);
        if (!body) { response.writeHead(404).end('Not in frozen benchmark source: ' + path); return; }
        response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(body);
    });
    await mkdir(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const persist = async () => {
        report.summary = summarize(rows);
        report.comparisons = [];
        for (const size of options.sizes) for (const cpu of options.cpu) for (let block = 0; block < options.repeats; block++) for (const phase of ['cold-first-sweep', 'warm']) {
            const group = rows.filter(row => row.size === size && row.cpu === cpu && row.block === block && row.phase === phase);
            const value = variant => { const selected = group.filter(row => row.variant === variant); return selected.length === 2 ? percentile(selected.map(row => percentile(numeric(row.switches, 'readyMs'), .5)), .5) : null; };
            const before = value('baseline'), after = value('candidate');
            if (before !== null && after !== null) report.comparisons.push({ size, cpu, block, phase, baselineMedianReadyMs: before, candidateMedianReadyMs: after, differenceMs: after - before, changePercent: before > 0 ? (after / before - 1) * 100 : null });
        }
        await writeFile(join(output, 'shelf-browsing-results.json'), JSON.stringify(report, null, 2));
        await writeFile(join(output, 'shelf-browsing-report.md'), markdown(report));
    };
    let browser, admission = new Map();
    try {
        browser = await chromium.launch();
        report.browser = { version: await browser.version(), executablePath: chromium.executablePath(), playwrightVersion: require('@playwright/test/package.json').version };
        for (const size of options.sizes) for (const cpu of options.cpu) for (let block = 0; block < options.repeats; block++) {
            for (const [slot, variant] of ['baseline', 'candidate', 'candidate', 'baseline'].entries()) {
                const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
                const tags = { size, cpu, block, slot, variant };
                try {
                    await context.route('**/*', route => {
                        const request = route.request(), url = new URL(request.url());
                        if (['blob:', 'data:'].includes(url.protocol)) return route.continue();
                        if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) { networkFailures.push({ ...tags, request: `${request.method()} ${url.href}` }); return route.abort(); }
                        if (url.pathname === '/dist/lattice-ui.js') return route.fulfill({ contentType: 'text/javascript', body: variant === 'baseline' ? baseline : candidate });
                        if (url.pathname === '/script.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;' });
                        if (url.pathname === '/scripts/user.js') return route.fulfill({ contentType: 'text/javascript', body: "export const getCurrentUserHandle=()=> 'default-user';" });
                        return route.continue();
                    });
                    const page = await context.newPage();
                    page.on('pageerror', error => failures.push({ ...tags, error: error.stack }));
                    page.on('console', message => { if (message.type() === 'error') failures.push({ ...tags, error: message.text() }); });
                    page.on('response', response => { if (response.status() >= 400) networkFailures.push({ ...tags, response: `${response.status()} ${response.url()}` }); });
                    const cdp = await context.newCDPSession(page);
                    await cdp.send('Performance.enable');
                    // Admission is unthrottled and outside every measurement window.
                    await page.goto(base + '/tests/browser/harness.html');
                    await page.waitForFunction(() => !!window.canvasHarness);
                    await page.evaluate(async size => {
                        await canvasHarness.reset(size, size <= 3 ? 3 : 16);
                        await document.fonts.ready;
                        await canvasHarness.settle();
                        // Drain preceding recovery/view publication before measuring hover.
                        await new Promise(resolve => setTimeout(resolve, 250));
                    }, size);
                    await page.mouse.move(5, 5);
                    const fixture = await page.evaluate(installBrowserProbe), graphHash = hash(fixture.graph);
                    const previous = admission.get(size);
                    if (previous && previous !== graphHash) throw Error('Variants received different authored graphs.');
                    admission.set(size, graphHash);
                    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
                    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
                    for (const phase of ['cold-first-sweep', 'warm']) {
                        if (phase === 'warm') await page.evaluate(() => __shelfBenchmark.warm());
                        const before = await metrics();
                        const switches = await page.evaluate(({ phase, sweeps }) => __shelfBenchmark.sweep({ sweeps: phase === 'warm' ? sweeps : 1, cold: phase === 'cold-first-sweep' }), { phase, sweeps: options.sweeps });
                        const after = await metrics();
                        const correctness = await page.evaluate(() => __shelfBenchmark.correctness());
                        rows.push({ ...tags, phase, families: fixture.families, graphSha256: graphHash, switches, renderer: deltaMetrics(before, after), correctness });
                    }
                    if (options.instrument) {
                        await page.evaluate(() => __shelfBenchmark.instrument());
                        const switches = await page.evaluate(() => __shelfBenchmark.sweep({ sweeps: 2, instrumented: true }));
                        const correctness = await page.evaluate(() => __shelfBenchmark.correctness());
                        instrumented.push({ ...tags, phase: 'separate-warm-work-counts', switches, correctness });
                    }
                    await page.evaluate(() => __shelfBenchmark.dispose());
                    if (failures.length || networkFailures.length) throw Error('Browser, console or network failure; inspect report.');
                    console.log(JSON.stringify({ ...tags, phases: rows.filter(row => row.size === size && row.cpu === cpu && row.block === block && row.slot === slot).map(row => ({ phase: row.phase, switches: row.switches.length, readyMedianMs: percentile(numeric(row.switches, 'readyMs'), .5), scriptMs: row.renderer.scriptMs, layoutCount: row.renderer.layoutCount })) }));
                } finally { await context.close(); }
                await persist();
            }
        }
        const inventories = new Set(rows.map(row => JSON.stringify(row.correctness.choices)));
        if (inventories.size !== 1) throw Error('Baseline/candidate shelf choice inventories differ.');
        report.status = 'complete';
    } catch (error) { report.failure = error.stack; throw error; }
    finally { await persist(); await browser?.close(); await new Promise(resolve => server.close(resolve)); }
    console.log('Saved ' + join(output, 'shelf-browsing-results.json'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
