import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, cp, mkdir, mkdtemp, access, readdir } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const install = await mkdtemp(join(tmpdir(), 'lattice-install-'));
for (const name of ['manifest.json', 'index.js', 'style.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'src', 'dist', 'assets']) await cp(join(root, name), join(install, name), { recursive: true });
// Only the host mock accompanies the install; no developer UI source or dependencies.
await mkdir(join(install, 'tests', 'browser'), { recursive: true });
for (const name of ['tests/mock.js', 'tests/browser/harness.js', 'tests/browser/harness.html', 'tests/browser/native-fixture.mjs']) await cp(join(root, name), join(install, name));
let hasDependencies = true;
try { await access(join(install, 'node_modules')); } catch { hasDependencies = false; }
if (hasDependencies) throw new Error('The installation smoke must run without node_modules');
const retired = new Set(['compile.js','memory.js','jev.js','thoughts.js','statevals.js','state-window.js','lore.js','expr.js','select.js','clip.js','model-combo.js','migration.js','legacy-insertion.js','domain-surfaces.js','graph-analysis.js']);
// The new scoped Introspection adapter shares a basename with the retired
// reader. Only its canonical installed path is allowed; all other copies and
// imports of the retired names still fail the audit.
const scopedMemory = join(install, 'src', 'workflow', 'introspection', 'memory.js');
const isRetiredModule = path => retired.has(path.split(/[\\/]/).at(-1)) && resolve(path) !== scopedMemory;
// Browser runtime specifiers have explicit file extensions; extensionless JSDoc
// import('./types') annotations do not add an installed module dependency.
const runtimeImports = /(?:from\s*|import\s*\(?\s*|new\s+URL\s*\(\s*)['"]([^'"]+\.(?:m?js|json)(?:[?#][^'"]*)?)['"]/g;
async function auditDirectory(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
        const full = join(path, entry.name);
        if (entry.isDirectory()) await auditDirectory(full);
        else if (/\.m?js$/.test(entry.name)) {
            if (isRetiredModule(full)) throw Error('Retired installed module: ' + full);
            const code = await readFile(full, 'utf8');
            for (const match of code.matchAll(runtimeImports)) {
                const specifier = match[1].split(/[?#]/)[0];
                const dependency = specifier.startsWith('.') ? resolve(full, '..', specifier) : specifier;
                if (isRetiredModule(dependency)) throw Error('Retired installed dependency: ' + match[1]);
                if (specifier.startsWith('.')) await access(resolve(full, '..', specifier));
            }
        }
    }
}
await auditDirectory(join(install, 'src')); await auditDirectory(join(install, 'dist'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
// Host-owned public exports are separate from the copied extension distribution.
// The synthetic host is idle and only synchronizes its own mock chat messages.
const publicHostModule = `
    const context = () => globalThis.SillyTavern.getContext();
    export const isGenerating = () => false;
    export function syncMesToSwipe(index) {
        const m = context().chat[index], id = m?.swipe_id;
        if (!m || !Number.isInteger(id) || typeof m.swipes?.[id] !== 'string' || !Array.isArray(m.swipe_info)) return false;
        m.swipes[id] = m.mes;
        m.swipe_info[id] = { ...m.swipe_info[id], extra: structuredClone(m.extra || {}) };
        return true;
    }
    export function syncSwipeToMes(index, swipeId) {
        const m = context().chat[index];
        if (!m || !Number.isInteger(swipeId) || typeof m.swipes?.[swipeId] !== 'string') return false;
        m.swipe_id = swipeId; m.mes = m.swipes[swipeId];
        Object.assign(m, structuredClone(m.swipe_info?.[swipeId] || {}));
        return true;
    }
`;
const server = createServer(async (request, response) => {
    try {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/scripts/user.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }).end("export function getCurrentUserHandle(){return 'default-user';}"); return; }
        if (pathname === '/script.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(publicHostModule); return; }
        const path = resolve(install, '.' + pathname);
        if (!path.startsWith(install + sep)) { response.writeHead(403).end(); return; }
        const body = await readFile(path); response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], missing = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
    page.on('request', request => requests.push(request.url()));
    await page.goto(`http://127.0.0.1:${server.address().port}/tests/browser/harness.html`); await page.waitForFunction(() => !!window.canvasHarness);
    const result = await page.evaluate(async () => {
        const h = window.canvasHarness, { UI, S, canvas, settle } = h, graph = S.activeWorkflow(), root = document.querySelector('.pc-root');
        const { validateWorkflow } = await import('/src/workflow/contracts.js?v=' + h.version);
        const checked = validateWorkflow(graph), settings = S.settings();
        const helpers = await import('/script.js'), context = globalThis.SillyTavern.getContext();
        const index = context.chat.length;
        const message = { mes: 'Synthetic original', swipe_id: 0, swipes: ['Synthetic original', 'Synthetic revision'], swipe_info: [{ send_date: 1, extra: {} }, { send_date: 2, extra: { revised: true } }], extra: { preserved: true } };
        context.chat.push(message);
        const publicHelpers = !helpers.isGenerating() && helpers.syncMesToSwipe(index) && message.swipe_info[0].extra.preserved === true && message.swipe_info[0].send_date === 1 && helpers.syncSwipeToMes(index, 1) && message.mes === 'Synthetic revision' && message.extra.revised === true && !helpers.syncMesToSwipe(index + 1) && !helpers.syncSwipeToMes(index, 9);
        context.chat.pop();
        const node = Object.values(graph.nodes).find(node => node.operation === 'generate-reply'); canvas.select({ kind: 'node', id: node.id });
        UI.close(); window.lattice.open(); await settle();
        return { publicHelpers, mounted: root === document.querySelector('.pc-root'), sharedGraph: graph === S.activeWorkflow() && graph === window.canvasHarness.graph,
            launchers: document.getElementById('pc-sendbar')?.parentElement?.id === 'leftSendForm' && !!document.getElementById('pc-sendbar')?.querySelector('img[src$="/assets/lattice-logo.svg"]') && !!document.getElementById('pc-menu-launch'), workbench: root.dataset.pcWorkbench,
            fresh: h.freshSettingsAbsent && graph.name === 'Unified story workflow' && graph.template?.id === 'unified-basic' && graph.mode === 'native-unified' && graph.schema === 3 && graph.runtime === 2 && checked.ok && checked.data.callBound === 0 && !settings.enabled && !root.querySelector('.pc-arm-input').checked && ['graphs', 'activeGraphId', 'nativeBindings'].every(key => !Object.hasOwn(settings, key)),
            providerCalls: h.providerCalls(), retiredPins: !!root.querySelector('.pc-node-output,.pc-port-key,.pc-port-stage,.pc-tok'), node: !!root.querySelector(`[data-id="${node.id}"]`) };
    });
    if (errors.length || missing.length || !result.publicHelpers || !result.mounted || !result.sharedGraph || !result.launchers || !result.fresh || result.providerCalls || result.retiredPins || !result.node || result.workbench !== 'svelte') throw Error(JSON.stringify({ result, errors, missing }));
    if (requests.some(url => new URL(url).hostname !== '127.0.0.1')) throw Error('Production smoke made an external request');
    const apiRequests = requests.filter(url => new URL(url).pathname.startsWith('/api/')).length;
    if (apiRequests) throw Error('Production smoke made an unexpected host API/model request');
    console.log(JSON.stringify({ apiRequests, install, nodeModules: false, developerUiSource: false, requests: requests.length, errors, missing, ...result }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
