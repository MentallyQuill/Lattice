import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Real production UI, local mock host, synthetic material, no provider requests.
const root = fileURLToPath(new URL('../', import.meta.url));
const portText = process.env.LATTICE_DOC_PORT ?? '4186';
const port = Number(portText);
if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('LATTICE_DOC_PORT must be an integer from 1 to 65535.');
const base = 'http://127.0.0.1:' + port;
const shotNames = [
    'workspace-overview', 'compose-details', 'guidance-preview', 'select-fields-details', 'json-decode-details',
    'node-shelf', 'node-search', 'text-rules-details', 'text-rules-graph', 'review-candidate',
    'run-details', 'subgraph-instance', 'subgraph-save', 'subgraph-tab', 'subgraph-interface',
    'scene-planning-graph', 'compactor-details', 'model-details', 'context-assembly',
];
const requestedShots = process.env.LATTICE_DOC_SHOTS === undefined ? null : new Set(process.env.LATTICE_DOC_SHOTS.split(',').map(name => name.trim()));
if (requestedShots && [...requestedShots].some(name => !shotNames.includes(name))) throw new Error('LATTICE_DOC_SHOTS must list known screenshot names separated by commas.');
const expectedShots = requestedShots ?? new Set(shotNames);
const output = join(root, 'docs', 'images');
const evidence = { status: 'running', screenshots: [], graphChecks: [], runs: [], errors: [], blockedRequests: [] };
try {
    const response = await fetch(base + '/manifest.json', { signal: AbortSignal.timeout(500) });
    if (response.ok) throw new Error('Port ' + port + ' is already serving a host. Stop it before capturing this checkout.');
} catch (error) { if (error.message.startsWith('Port ' + port)) throw error; }
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['tools/serve-harness.mjs'], {
    cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore', windowsHide: true,
});
let browser;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
        if (server.exitCode !== null) throw new Error('Documentation server exited before startup.');
        try { ready = (await fetch(base + '/manifest.json')).ok; } catch {}
        if (!ready) await pause(100);
    }
    if (!ready) throw new Error('Local documentation host did not start.');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1680, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
        if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) {
            evidence.blockedRequests.push(request.method() + ' ' + url.href);
            return route.abort();
        }
        if (url.pathname === '/scripts/user.js') return route.fulfill({contentType:'text/javascript',body:"export const getCurrentUserHandle=()=> 'default-user';"});
        if (url.pathname === '/script.js') return route.fulfill({ contentType: 'text/javascript', body: `
            const context = () => globalThis.SillyTavern.getContext();
            export const isGenerating = () => false;
            export function syncMesToSwipe(i) { const m = context().chat[i]; m.swipe_info[m.swipe_id] = { extra: structuredClone(m.extra || {}) }; return true; }
            export function syncSwipeToMes(i, s) { const m = context().chat[i]; m.swipe_id = s; m.mes = m.swipes[s]; Object.assign(m, structuredClone(m.swipe_info[s])); return true; }
        ` });
        return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => evidence.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') evidence.errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) evidence.errors.push('HTTP ' + response.status() + ': ' + response.url()); });
    page.setDefaultTimeout(10000);
    async function activate(kind) {
        await page.goto(base + '/tests/browser/harness.html');
        await page.waitForFunction(() => !!window.canvasHarness);
        const id = await page.evaluate(async kind => {
            const h = window.canvasHarness, v = h.version;
            const { fixtureGraph } = await import('/tests/helpers/workflow-fixtures.mjs');
            const { validateGraphStructure } = await import('/src/workflow/contracts.js?v=' + v);
            const graph = fixtureGraph(kind === 'subgraph' ? 'literal-cleanup' : kind === 'branching' ? 'native-guidance' : kind);
            // Diagnostic authoring fixtures need no native continuation. Owned review below uses the full starter.
            if(kind!=='unified-basic'){for(const id of ['on-send','generate-reply','review-publish'])delete graph.nodes[id];for(const [id,wire]of Object.entries(graph.wires))if(!graph.nodes[wire.from]||!graph.nodes[wire.to])delete graph.wires[id];}
            // Layout and writing material are fixture data; UI and execution are unchanged.
            const ids = kind === 'subgraph' || kind === 'literal-cleanup'
                ? ['reply-snapshot', 'text-rules', 'validate-patches', 'review-gate', 'apply-reply']
                : ['compose-json', 'json-decode', 'select-fields', 'compose-guidance', 'guidance'];
            if (kind === 'native-guidance' || kind === 'branching') {
                for (const [i, node] of Object.values(graph.nodes).entries()) Object.assign(node, { x: 180 + i * (kind==='unified-basic'?420:300), y: 160 });
            } else for (const [i, nodeId] of (kind==='unified-basic'?Object.keys(graph.nodes):ids).entries()) Object.assign(graph.nodes[nodeId], { x: 180 + i * 300, y: 160 });
            if (kind === 'structured-guidance') {
                graph.nodes['compose-json'].sections = [{ name: 'Scene', text: JSON.stringify({ direction: 'A tense reunion at the harbor.', constraint: 'Leave the decision to board the ship to the user.', tone: 'Restrained, with concrete sensory detail.' }, null, 2) }];
                graph.nodes['select-fields'].fields.push({ name: 'tone', path: ['tone'] });
                graph.nodes['compose-guidance'].template = 'Direction: {{data:/direction}}\nConstraint: {{data:/constraint}}\nTone: {{data:/tone}}';
            }
            if (kind === 'literal-cleanup' || kind === 'subgraph') {
                Object.assign(h.context, { chatId: 'documentation-demo', characterId: 1, groupId: null });
                const text = 'The harbor was very very quiet. Mara watched the departing ship, keeping her decision to herself.';
                h.context.chat.splice(0, h.context.chat.length, { mes: 'Describe the reunion at the harbor.', is_user: true }, { mes: text, is_user: false, swipe_id: 0, swipes: [text], swipe_info: [{ extra: {}, gen_started: 1, gen_finished: 2 }], extra: {}, gen_started: 1, gen_finished: 2 });
            }
            if (kind === 'subgraph') {
                const { parseSubgraph } = await import('/src/workflow/packages.js?v=' + v);
                const { definitionRefKey } = await import('/src/workflow/definitions.js?v=' + v);
                const parsed = parseSubgraph(await (await fetch('/workflows/subgraphs/literal-cleanup.json')).text());
                if (!parsed.ok) throw new Error(parsed.error.message);
                const definition = parsed.data.definition, old = graph.nodes['text-rules'];
                graph.definitions = { ...parsed.data.definitions, [definitionRefKey(definition)]: definition };
                graph.nodes[old.id] = { id: old.id, type: 'subgraph', definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash }, parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {}, x: old.x, y: old.y };
                graph.wires['wire-1'].toPort = 'draft'; graph.wires['wire-2'].fromPort = 'patches';
            }
            if (kind === 'branching') {
                const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + v);
                graph.id = 'context-assembly'; graph.name = 'Context assembly'; graph.schema = 3; graph.runtime = 2; graph.portals = {}; graph.definitions = {};
                graph.nodes['smart-compactor'].method = 'select';
                graph.nodes['recent-context'] = { ...operationDefaults('scene-context'), id: 'recent-context', type: 'workflow', operationVersion: 1, phase:'pre', enabled: true, x: 180, y: 380, recentMessages: 2, includeCharacter: false };
                graph.nodes['context-join'] = { ...operationDefaults('context-join'), id: 'context-join', type: 'workflow', operationVersion: 1, phase:'pre', enabled: true, x: 680, y: 260 };
                Object.assign(graph.nodes['scene-context'], { x: 180, y: 140 });
                Object.assign(graph.nodes['smart-compactor'], { x: 430, y: 140 });
                Object.assign(graph.nodes['response-plan'], { x: 930, y: 260 });
                Object.assign(graph.nodes.guidance, { x: 1180, y: 260 });
                graph.wires = { ...Object.fromEntries(Object.entries(graph.wires).filter(([id])=>['activation','draft','native-guidance'].includes(id))), ...Object.fromEntries([
                    ['context', 'scene-context', 'out', 'smart-compactor', 'in'],
                    ['selected', 'smart-compactor', 'out', 'context-join', 'context-1'],
                    ['recent', 'recent-context', 'out', 'context-join', 'context-2'],
                    ['plan', 'context-join', 'out', 'response-plan', 'in'],
                    ['publish', 'response-plan', 'out', 'guidance', 'in'],
                ].map(([id, from, fromPort, to, toPort]) => [id, { id, route: 'wire', from, fromPort, to, toPort }])) };
            }
            const checked = validateGraphStructure(graph);
            if (!checked.ok) throw new Error(JSON.stringify(checked.error));
            await h.activate(graph);
            if (!['native-guidance', 'branching'].includes(kind)) await (await import('/src/run.js?v=' + v)).initializeNativeWorkflowController();
            return graph.id;
        }, kind);
        await page.evaluate(async () => { await window.canvasHarness.settle(); window.canvasHarness.canvas.fit(); await window.canvasHarness.settle(); await document.fonts.ready; });
        if (await page.getByRole('button', { name: 'Toggle inspector' }).getAttribute('aria-pressed') !== 'true') await page.getByRole('button', { name: 'Toggle inspector' }).click();
        await page.evaluate(() => window.canvasHarness.settle());
        await fit();
        return id;
    }
    async function fit() {
        await page.evaluate(async () => {
            const h = window.canvasHarness, canvas = h.canvas;
            canvas.fit(); await h.settle();
            const area = document.querySelector('.pc-canvas-host').getBoundingClientRect(), view = canvas.view;
            const boxes = [...document.querySelectorAll('.pc-node-native')].map(node => {
                const rect = node.getBoundingClientRect();
                return { x: (rect.x - area.x - view.x) / view.zoom, y: (rect.y - area.y - view.y) / view.zoom, w: rect.width / view.zoom, h: rect.height / view.zoom };
            });
            const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
            const width = Math.max(...boxes.map(b => b.x + b.w)) - left, height = Math.max(...boxes.map(b => b.y + b.h)) - top;
            const zoom = Math.min(1.1, (area.width - 220) / (width + 40), (area.height - 130) / (height + 40));
            Object.assign(view, { zoom, x: 170 + (area.width - 220 - width * zoom) / 2 - left * zoom, y: (area.height - height * zoom) / 2 - top * zoom });
            canvas.applyTransform(); await h.settle();
        });
    }
    async function select(id) {
        // Selection uses the real canvas controller; this avoids clicking a wire over a card.
        await page.evaluate(async id => { window.canvasHarness.canvas.select({ kind: 'node', id }); await window.canvasHarness.settle(); }, id);
        await page.getByRole('region', { name: 'Node details', exact: true }).getByLabel('Node name', { exact: true }).waitFor({ state: 'visible' });
    }
    async function subgraphCommand(id, command) {
        await page.locator(`.pc-node-native[data-id="${id}"] .pc-native-heading`).click({ button: 'right' });
        await page.getByRole('menuitem', { name: command, exact: true }).click();
    }
    async function shot(name, selector) {
        if (!selector && name !== 'node-shelf') await checkConnections(name);
        if (requestedShots && !requestedShots.has(name)) return;
        if (selector === '.pc-inspector') {
            await page.setViewportSize({ width: 1680, height: 1400 });
            const height = await page.locator('.pc-inspector').evaluate(panel => {
                panel.scrollTop = 0;
                const content = panel.querySelector('.pc-node-details');
                const bottom = Math.max(...[...content.children].map(element => element.getBoundingClientRect().bottom));
                return Math.ceil(window.innerHeight - panel.getBoundingClientRect().bottom + bottom + 12);
            });
            await page.setViewportSize({ width: 1680, height: Math.max(360, Math.min(1400, height)) });
            await page.locator('.pc-inspector').evaluate(panel => { panel.scrollTop = 0; });
        }
        if (name !== 'node-shelf') await page.mouse.move(1400, 20);
        await page.evaluate(() => window.canvasHarness.settle());
        const path = join(output, name + '.png');
        if (selector) await page.locator(selector).screenshot({ path, animations: 'disabled' });
        else await page.screenshot({ path, animations: 'disabled' });
        evidence.screenshots.push({ name, selector: selector ?? 'workspace', path });
        console.log('Captured ' + name);
        if (selector === '.pc-inspector') {
            await page.setViewportSize({ width: 1680, height: 1000 });
            await fit();
        }
    }
    async function checkConnections(name) {
        const result = await page.evaluate(() => {
            const boxes = [...document.querySelectorAll('.pc-node-native')].map(node => ({ id: node.dataset.id, box: node.getBoundingClientRect() }));
            const wires = [...document.querySelectorAll('.pc-wires path[data-id]:not(.pc-wire-hit)')];
            const failures = [];
            for (const wire of wires) {
                const binding = window.canvasHarness.canvas.graph.wires[wire.dataset.id];
                const matrix = wire.getScreenCTM(), length = wire.getTotalLength();
                let previousX = -Infinity;
                for (let distance = 0; distance <= length; distance += 2) {
                    const point = wire.getPointAtLength(distance), mapped = new DOMPoint(point.x, point.y).matrixTransform(matrix);
                    if (mapped.x < previousX - 0.1) { failures.push(wire.dataset.id + ': backwards flow'); break; }
                    previousX = mapped.x;
                    const covered = boxes.find(({ id, box }) => id !== binding.from && id !== binding.to && mapped.x > box.left + 4 && mapped.x < box.right - 4 && mapped.y > box.top + 4 && mapped.y < box.bottom - 4);
                    if (covered) { failures.push(wire.dataset.id + ': crosses card ' + covered.id); break; }
                }
            }
            return { wires: wires.length, failures };
        });
        evidence.graphChecks.push({ name, ...result });
        if (!result.wires || result.failures.length) throw new Error('Screenshot connection layout failed: ' + JSON.stringify(result));
    }
    async function operationControls() {
        await page.locator('.pc-node-details [data-operation-controls]').scrollIntoViewIfNeeded();
    }
    async function openDetailGroup(selector) {
        const group = page.locator('.pc-node-details ' + selector);
        if (!await group.evaluate(element => element.open)) await group.locator(':scope > summary').click();
    }
    async function run(nodeId) {
        await select(nodeId);
        await page.locator('[data-run-here]').click();
        await page.locator('.pc-run-meter-label').filter({ hasText: 'Completed' }).waitFor();
        const result = await page.evaluate(async () => {
            const h = window.canvasHarness, value = (await import('/src/run.js?v=' + h.version)).getNativeWorkflowController().lastResult();
            return { ok: value?.ok, calls: value?.actualCalls, error: value?.error };
        });
        if (!result.ok || result.calls !== 0) throw new Error('Expected successful zero-call demo: ' + JSON.stringify(result));
        evidence.runs.push(result);
    }
    await activate('structured-guidance');
    await run('compose-guidance');
    await select('compose-guidance');
    await shot('workspace-overview');
    await operationControls();
    await shot('compose-details', '.pc-inspector');
    await shot('guidance-preview', '.pc-preview-pane');
    await select('select-fields');
    await operationControls();
    await shot('select-fields-details', '.pc-inspector');
    await select('json-decode');
    await operationControls();
    await shot('json-decode-details', '.pc-inspector');
    await page.locator('[data-family="Derive"]').hover();
    await page.locator('.pc-family-menu').waitFor({ state: 'visible' });
    // Keep the real canonical node menu open for the screenshot by retaining the hover.
    await shot('node-shelf');
    await page.mouse.move(1400, 20);
    await page.locator('.pc-header').click({ position: { x: 1100, y: 15 } });
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: 'Graph', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Add node…', exact: true }).click();
    await shot('node-search');
    await page.keyboard.press('Escape');
    await activate('literal-cleanup');
    await run('validate-patches');
    await select('text-rules');
    await page.getByLabel('Rule 1 pattern', { exact: true }).waitFor({ state: 'visible' });
    await operationControls();
    await shot('text-rules-details', '.pc-inspector');
    await shot('text-rules-graph');
    await activate('unified-basic');
    await page.getByRole('checkbox',{name:'Enable Lattice',exact:true}).check();
    await page.evaluate(async()=>{
        const h=window.canvasHarness,c=h.context;
        Object.assign(c,{chatId:'documentation-unified',characterId:0,groupId:null,characters:[{avatar:'mara.png',data:{name:'Mara'}}],saveChat:async()=>{},updateMessageBlock:async()=>{},swipe:{refresh:async()=>{}}});
        c.chat.splice(0,c.chat.length,{mes:'Describe the harbor reunion.',is_user:true,extra:{}});
        const controller=(await import('/src/run.js?v='+h.version)).getNativeWorkflowController();
        await c.eventSource.emit(c.eventTypes.GENERATION_STARTED,'normal',{},false);
        const ready=await controller.beforeGenerate(c.chat,8192,()=>{},'normal');if(!ready.ok||!ready.awaitingNative)throw Error(JSON.stringify(ready));
        const text='Mara watched the departing ship, keeping her decision to herself.',now=new Date().toISOString(),index=c.chat.length;
        c.chat.push({mes:text,is_user:false,swipe_id:0,swipes:[text],swipe_info:[{extra:{},gen_started:now,gen_finished:now}],extra:{},gen_started:now,gen_finished:now});
        await c.eventSource.emit(c.eventTypes.MESSAGE_RECEIVED,index,'normal');await c.eventSource.emit(c.eventTypes.GENERATION_ENDED,c.chat.length);
    });
    await page.locator('.pc-run-meter-label').filter({hasText:'Completed'}).waitFor();
    await select('review-publish');
    const terminal=page.getByRole('combobox',{name:'Preview output',exact:true});
    if (await terminal.count()) {
        const terminalValue=await terminal.locator('option').evaluateAll(options=>options.find(option=>option.textContent.startsWith('Review / Publish · Host result'))?.value);
        if(!terminalValue)throw Error('Review / Publish result missing from actual preview choices.');
        await terminal.selectOption(terminalValue);
    }
    if (!await page.locator('.pc-output-preview h3').textContent().then(text => text.includes('Review / Publish'))) throw Error('Owned review is not selected in Preview.');
    await shot('review-candidate');
    if(!await page.locator('[data-preview-apply]').isEnabled())throw Error('Owned native review action is unavailable.');
    await page.locator('.pc-run-meter').click();await shot('run-details','.pc-workspace-dialog');
    await page.getByRole('button',{name:'Close panel',exact:true}).click();
    await activate('subgraph');
    await run('validate-patches');
    await select('text-rules');
    await shot('subgraph-instance');
    await subgraphCommand('text-rules', 'Add to Subgraphs');
    await shot('subgraph-save', '.pc-subgraph-save');
    await page.getByRole('button', { name: 'Close save subgraph', exact: true }).click();
    await page.locator('.pc-node-native[data-id="text-rules"] .pc-native-heading').dblclick();
    await fit();
    await select('rules');
    await shot('subgraph-tab');
    await page.locator('.pc-graph-tabs').getByRole('tab').first().click();
    await subgraphCommand('text-rules', 'Make editable copy');
    await fit();
    await select('entry');
    await shot('subgraph-interface', '.pc-node-details');
    await activate('native-guidance');
    await select('smart-compactor');
    await shot('scene-planning-graph');
    await operationControls();
    await openDetailGroup('[data-control-group="Protections"]');
    await page.getByLabel('Pinned wording', { exact: true }).waitFor({ state: 'visible' });
    await shot('compactor-details', '.pc-inspector');
    await select('response-plan');
    await openDetailGroup('[data-model-controls]');
    await openDetailGroup('[data-control-group="Output"]');
    await page.locator('[data-model-controls]').scrollIntoViewIfNeeded();
    await shot('model-details', '.pc-inspector');
    await activate('branching');
    await select('context-join');
    await shot('context-assembly');
    if (evidence.screenshots.length !== expectedShots.size || evidence.screenshots.some(shot => !expectedShots.has(shot.name)) || evidence.runs.some(run => run.calls !== 0)) throw new Error('Required sanitized screenshots or zero-request demonstrations were omitted.');
    if (evidence.errors.length || evidence.blockedRequests.length) throw new Error(JSON.stringify(evidence));
    evidence.status = 'passed';
    console.log(JSON.stringify({ captured: evidence.screenshots.length, errors: evidence.errors, blockedRequests: evidence.blockedRequests }));
} catch (error) {
    evidence.status = 'failed'; evidence.failure = error.message; throw error;
} finally {
    await mkdir(join(root, 'benchmark-results'), { recursive: true });
    await writeFile(join(root, 'benchmark-results', 'documentation-capture.json'), JSON.stringify(evidence, null, 2));
    await browser?.close();
    server.kill();
}
