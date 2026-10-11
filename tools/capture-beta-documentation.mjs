import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Actual production UI and gestures. Fixture data supplies a disposable story;
// the only visual overlay is a cursor, since browser screenshots omit it.
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.LATTICE_BETA_DOC_PORT ?? 4187);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid LATTICE_BETA_DOC_PORT');
const base = `http://127.0.0.1:${port}`;
const output = join(root, 'docs/images');
const scratch = join(root, 'benchmark-results/beta-media');
const only = process.env.LATTICE_BETA_DOC_ONLY ?? process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
const evidence = { status: 'running', version: JSON.parse(await readFile(join(root, 'manifest.json'))).version, screenshots: [], animations: [], checks: [], errors: [], blockedRequests: [] };
await mkdir(output, { recursive: true });
await mkdir(scratch, { recursive: true });
try { if ((await fetch(base + '/manifest.json', { signal: AbortSignal.timeout(300) })).ok) throw Error('Capture port already in use'); }
catch (error) { if (error.message === 'Capture port already in use') throw error; }
const server = spawn(process.execPath, ['tools/serve-harness.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: 'ignore' });
let browser, page, context;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let sequence = null, pointer = { x: 1350, y: 60 };
const card = id => page.locator(`.pc-canvas-host .pc-node-native[data-id="${id}"]`);
const heading = id => card(id).locator('.pc-native-heading');
async function settle() { await page.evaluate(async () => { await window.canvasHarness.settle(); await document.fonts.ready; }); }
async function check(label, value) { evidence.checks.push({ label, value }); if (!value) throw Error(label); }
async function screenshot(name, selector) {
    await settle();
    const broken = await page.locator('img').evaluateAll(images => images.filter(img => img.complete && !img.naturalWidth).map(img => img.src));
    if (broken.length) throw Error('Missing capture image: ' + broken.join(', '));
    await page.evaluate(() => { const cursor = document.getElementById('documentation-cursor'); if (cursor) cursor.hidden = true; });
    const path = join(output, name + '.png');
    await (selector ? page.locator(selector) : page).screenshot({ path, animations: 'disabled' });
    await page.evaluate(() => { const cursor = document.getElementById('documentation-cursor'); if (cursor) cursor.hidden = false; });
    evidence.screenshots.push({ name, selector: selector ?? 'workspace', bytes: (await stat(path)).size });
    console.log('Captured ' + name);
}
async function frame(count = 1) {
    if (!sequence) return;
    await settle();
    const buffer = await page.screenshot({ animations: 'disabled' });
    for (let i = 0; i < count; i++) await writeFile(join(sequence.directory, String(sequence.frames++).padStart(5, '0') + '.png'), buffer);
}
async function move(x, y, steps = 12) {
    const start = { ...pointer };
    for (let i = 1; i <= steps; i++) {
        const t = i / steps, smooth = t * t * (3 - 2 * t);
        await page.mouse.move(start.x + (x - start.x) * smooth, start.y + (y - start.y) * smooth);
        await frame();
    }
    pointer = { x, y };
}
async function point(locator, steps = 10) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw Error('Missing gesture target');
    const tx = box.x + box.width / 2, ty = box.y + box.height / 2;
    // Travel below the menubar before entering its popup: crossing a neighbor
    // would legitimately switch the open menu while the cursor is in motion.
    if (pointer.y < 48 && ty >= 48) await move(pointer.x, ty, 3);
    if (ty < 48 && Math.abs(pointer.x - tx) > 80) { await move(pointer.x, 80, 3); await move(tx, 80, steps); }
    await move(tx, ty, steps);
}
async function click(locator, options = {}) {
    await point(locator);
    await page.mouse.down(options); await frame(2); await page.mouse.up(options); await frame(4);
}
async function drag(from, to) {
    await point(from);
    await page.mouse.down(); await frame(3);
    const box = await to.boundingBox();
    await move(box.x + box.width / 2, box.y + box.height / 2, 20);
    await frame(3); await page.mouse.up(); await frame(8);
}
async function animation(name, action) {
    const directory = join(scratch, name);
    await mkdir(directory, { recursive: true });
    sequence = { directory, frames: 0 };
    await frame(10); await action(); await frame(22);
    // Limit the input range so leftover frames from an earlier take are ignored.
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '10', '-i', join(directory, '%05d.png'), '-frames:v', String(sequence.frames), '-filter_complex', '[0:v]scale=1280:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=192[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle', '-loop', '0', join(output, name + '.gif')], { windowsHide: true, timeout: 120000 });
    evidence.animations.push({ name, frames: sequence.frames, seconds: sequence.frames / 10, width: 1280, bytes: (await stat(join(output, name + '.gif'))).size });
    console.log('Encoded ' + name + ' (' + sequence.frames / 10 + 's)');
    sequence = null;
}
async function menu(group, command) {
    await page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name: group, exact: true }).click();
    await page.getByRole('menuitem', { name: command, exact: true }).click();
}
async function select(id) { await heading(id).click(); await settle(); }
async function fit(maxZoom = .95) {
    await page.evaluate(async maxZoom => {
        const h = window.canvasHarness, c = h.canvas;
        c.fit(); await h.settle();
        const area = c.host.getBoundingClientRect(), v = c.view;
        const boxes = [...c.host.querySelectorAll('.pc-node-native')].map(e => {
            const r = e.getBoundingClientRect(); return { x: (r.x - area.x - v.x) / v.zoom, y: (r.y - area.y - v.y) / v.zoom, w: r.width / v.zoom, h: r.height / v.zoom };
        });
        const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
        const width = Math.max(...boxes.map(b => b.x + b.w)) - left, height = Math.max(...boxes.map(b => b.y + b.h)) - top;
        const zoom = Math.min(maxZoom, (area.width - 210) / width, (area.height - 100) / height);
        Object.assign(v, { zoom, x: 165 + (area.width - 210 - width * zoom) / 2 - left * zoom, y: (area.height - height * zoom) / 2 - top * zoom });
        c.applyTransform(); await h.settle();
    }, maxZoom);
}
async function load(kind = 'structured') {
    // Each take starts with a fresh panel layout; previous demonstrations may
    // have collapsed Preview or hidden Details on purpose.
    if (page.url().startsWith(base)) await page.evaluate(() => localStorage.removeItem('lattice.workspace.preview'));
    await page.goto(base + '/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async kind => {
        const h = window.canvasHarness, c = h.context;
        Object.assign(c, { chatId: 'Harbor-story', characterId: 0, groupId: null, characters: [{ avatar: 'rowan.png', name: 'Rowan', data: { name: 'Rowan' } }], chatMetadata: {} });
        c.chat.splice(0, c.chat.length, { is_user: true, mes: 'Rowan waits at the harbor. Keep the choice to board the ship mine.', extra: {} });
        const profiles = [
            { id: 'story', name: 'Story narrator', api: 'openai', model: 'story-model', preset: null },
            { id: 'editor', name: 'Prose editor', api: 'openai', model: 'editor-model', preset: null },
            { id: 'planner', name: 'Scene planner', api: 'openai', model: 'planner-model', preset: null },
        ];
        c.extensionSettings.connectionManager = { profiles };
        c.CONNECT_API_MAP = { openai: { selected: 'openai', source: 'openai' } };
        c.ConnectionManagerRequestService.getProfile = id => profiles.find(p => p.id === id);
        await (await import('/src/run.js?v=' + h.version)).initializeNativeWorkflowController();
        const { fixtureGraph } = await import('/tests/helpers/workflow-fixtures.mjs');
        const { operationDefaults } = await import('/src/workflow/catalog.js?v=' + h.version);
        let graph;
        if (kind === 'hero') {
            graph = (await (await fetch('/examples/unified/unified-combined-systems.json')).json()).graph;
            graph.name = 'Wand, weather & relationships';
            const { installSubgraphDefinition } = await import('/src/library.js?v=' + h.version);
            for (const id of ['wand', 'weather', 'relationship']) {
                const ref = graph.nodes[id].definition;
                const def = graph.definitions[JSON.stringify([ref.id, ref.version, ref.semanticHash])];
                const saved = installSubgraphDefinition(def, graph.definitions);
                if (!saved.ok) throw Error(saved.error.message);
            }
            for (const [id, x, y] of [['send', 30, 20], ['generate', 1040, 20], ['review', 1370, 20], ['player', 30, 330], ['clock', 30, 650], ['wand', 370, 270], ['relationship', 370, 525], ['weather', 370, 760], ['compose', 710, 390]]) Object.assign(graph.nodes[id], { x, y });
        } else if (kind === 'starter') graph = fixtureGraph('unified-basic');
        else if (kind === 'model') {
            graph = fixtureGraph('native-guidance'); graph.name = 'Plan the harbor reunion';
            for (const [i, id] of ['scene-context', 'smart-compactor', 'response-plan', 'guidance'].entries()) Object.assign(graph.nodes[id], { x: i * 300, y: 60 });
            Object.assign(graph.nodes['on-send'], { x: 300, y: 320 });
            Object.assign(graph.nodes['generate-reply'], { x: 1200, y: 320 });
            Object.assign(graph.nodes['review-publish'], { x: 1500, y: 320 });
            graph.nodes['smart-compactor'].method = 'select';
            graph.nodes['response-plan'].profileId = 'planner';
        } else {
            graph = fixtureGraph('structured-guidance'); graph.name = 'A scene brief for the harbor reunion';
            for (const [i, id] of ['compose-json', 'json-decode', 'select-fields', 'compose-guidance', 'guidance'].entries()) Object.assign(graph.nodes[id], { x: i * 280, y: 100 });
            graph.nodes['compose-json'].sections = [{ name: 'Scene', text: JSON.stringify({ direction: 'An uneasy reunion at the harbor.', constraint: 'Let the player decide whether to board the ship.', tone: 'Restrained; salt air, creaking ropes, unfinished words.' }, null, 2) }];
            graph.nodes['select-fields'].fields.push({ name: 'tone', path: ['tone'] });
            graph.nodes['compose-guidance'].template = 'Direction: {{data:/direction}}\nConstraint: {{data:/constraint}}\nTone: {{data:/tone}}';
            for (const [id, x, y] of [['on-send', 0, 480], ['generate-reply', 840, 480], ['review-publish', 1120, 480]]) Object.assign(graph.nodes[id], { x, y });
            if (kind === 'connect') { delete graph.wires['wire-1']; delete graph.wires['wire-2']; }
            if (kind === 'complex') {
                graph.nodes['scene-note'] = { ...operationDefaults('compose'), id: 'scene-note', type: 'workflow', phase: 'pre', x: 0, y: 300, sections: [{ name: 'Text', text: 'Do not choose the player’s actions.' }] };
                graph.nodes['clean-note'] = { ...operationDefaults('text-rules'), id: 'clean-note', type: 'workflow', phase: 'pre', inputKind: 'text', x: 280, y: 300 };
                graph.nodes['compose-guidance'].sections.push({ name: 'Agency', text: '' });
                for (const [id, from, fromPort, to, toPort] of [['agency', 'scene-note', 'out', 'clean-note', 'in'], ['agency-brief', 'clean-note', 'out', 'compose-guidance', 'section.Agency']]) graph.wires[id] = { id, route: 'wire', from, fromPort, to, toPort };
            }
        }
        await h.activate(graph); await h.settle();
    }, kind);
    const expandAfter = page.getByRole('button', { name: 'Expand preview', exact: true });
    if (await expandAfter.isVisible()) await expandAfter.click();
    await fit();
}
async function editingView() {
    const collapse = page.getByRole('button', { name: 'Collapse preview', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    const inspector = page.getByRole('button', { name: 'Toggle inspector', exact: true });
    if (await inspector.getAttribute('aria-pressed') === 'true') await inspector.click();
    await fit(.95);
}
async function run(id) {
    await select(id); await page.locator('.pc-output-preview [data-run-here]').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    await check('Successful deterministic preview', await page.evaluate(async () => {
        const h = window.canvasHarness, r = (await import('/src/run.js?v=' + h.version)).getNativeWorkflowController().lastResult();
        return r.ok && r.actualCalls === 0;
    }));
}
try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) { try { ready = (await fetch(base + '/manifest.json')).ok; } catch {} if (!ready) await pause(100); }
    if (!ready) throw Error('Local capture host failed to start');
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
        if (url.origin !== base || !['GET', 'HEAD'].includes(req.method())) { evidence.blockedRequests.push(req.method() + ' ' + url.href); return route.abort(); }
        if (url.pathname === '/scripts/user.js') return route.fulfill({ contentType: 'text/javascript', body: "export const getCurrentUserHandle=()=> 'default-user';" });
        if (url.pathname === '/script.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;' });
        return route.continue();
    });
    await context.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            const cursor = document.createElement('div'); cursor.id = 'documentation-cursor';
            cursor.style.cssText = 'position:fixed;left:1350px;top:60px;width:28px;height:34px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 1px 2px #0009)';
            cursor.innerHTML = '<svg viewBox="0 0 28 34"><circle cx="10" cy="12" r="11" fill="none" stroke="#ffb554" stroke-width="2" opacity="0"/><path d="M3 2V25L9 19L14 30L19 28L14 17H24Z" fill="white" stroke="#171717" stroke-width="1.5"/></svg>';
            document.body.append(cursor);
            addEventListener('pointermove', e => { cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px'; }, true);
            addEventListener('pointerdown', () => cursor.querySelector('circle').setAttribute('opacity', '1'), true);
            addEventListener('pointerup', () => cursor.querySelector('circle').setAttribute('opacity', '0'), true);
        });
    });
    page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', e => evidence.errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') evidence.errors.push(msg.text()); });
    page.on('response', r => { if (r.status() >= 400) evidence.errors.push('HTTP ' + r.status() + ': ' + r.url()); });

    if (!only || only === 'screenshots') {
        await page.setViewportSize({ width: 1680, height: 1050 });
        await load('hero'); await select('compose');
        await page.getByRole('button', { name: 'Collapse preview', exact: true }).click();
        await fit(.95);
        await screenshot('beta-overview');
        await select('wand'); await screenshot('system-settings');
        await menu('Workflow', 'Add system…');
        const rain = await page.getByLabel('Saved system', { exact: true }).locator('option').evaluateAll(options => options.find(o => o.textContent.includes('Eight-hour rain'))?.value);
        if (!rain) throw Error('Saved weather system missing');
        await page.getByLabel('Saved system', { exact: true }).selectOption(rain);
        for (const input of await page.locator('.pc-system-dialog select[aria-label^=\"System input\"]').all()) {
            const clock = await input.locator('option').evaluateAll(options => options.find(o => o.value && o.textContent.includes('Story Clock'))?.value);
            if (clock) await input.selectOption(clock);
        }
        await page.getByLabel('System Guidance output', { exact: true }).selectOption('output-1');
        await page.getByLabel('Guidance merge destination', { exact: true }).selectOption('compose');
        await page.getByRole('button', { name: 'Preview connections', exact: true }).click();
        await expect(page.getByText('Connection preview', { exact: true })).toBeVisible();
        await screenshot('add-system', '.pc-system-dialog'); await page.keyboard.press('Escape');
        await heading('wand').dblclick(); await fit(.85); await screenshot('wand-system');
        await load('starter'); await select('review-publish'); await screenshot('unified-starter');
        await menu('File', 'Open examples…'); await screenshot('examples-curriculum', '.pc-workspace-dialog');
        await page.locator('.pc-example-details-button').first().click(); await screenshot('example-lesson', '.pc-workspace-dialog'); await page.keyboard.press('Escape');
        await load('model'); await select('response-plan');
        await page.locator('.pc-node-profile[data-id="response-plan"] .profile-bar').click(); await screenshot('profile-picker'); await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 1680, height: 2100 });
        await load(); await select('compose-guidance');
        await page.getByRole('button', { name: 'Open Compose guide', exact: true }).click();
        await page.locator('details[data-guide-settings] > summary').click();
        await page.locator('details[data-guide-example] > summary').click();
        await page.locator('.pc-node-guide').evaluate(panel => { panel.scrollTop = 0; });
        await screenshot('node-guide', '.pc-node-guide-dialog'); await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 1680, height: 1050 });
        await load('hero'); await select('clock'); await screenshot('clock-settings', '.pc-inspector');
        await menu('Workflow', 'Configure'); await page.getByRole('menuitem', { name: 'Workflow Data…', exact: true }).click(); await screenshot('workflow-data', '.pc-workspace-dialog'); await page.keyboard.press('Escape');
        await page.getByRole('menuitem', { name: 'File', exact: true }).click(); await screenshot('file-menu'); await page.keyboard.press('Escape');
        await load('starter'); await menu('Workflow', 'Validate workflow'); await screenshot('workflow-validation', '.pc-workspace-dialog'); await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 1440, height: 900 });
    }

    if (!only || only === 'shelf') {
        await load(); await editingView();
        await animation('search-and-place', async () => {
            await click(page.getByRole('menuitem', { name: 'Graph', exact: true }));
            await click(page.getByRole('menuitem', { name: 'Add node…', exact: true }));
            const search = page.getByRole('textbox', { name: 'Search nodes', exact: true });
            await point(search); await search.click();
            for (const ch of 'text rules') { await page.keyboard.type(ch); await frame(2); }
            await frame(10);
            const choice = page.locator('[data-shelf-choice="operation:text-rules"]');
            await point(choice); await page.mouse.down(); await frame(4);
            const area = await page.locator('.pc-canvas-host').boundingBox();
            await move(area.x + 500, area.y + 240, 24); await screenshot('shelf-drag'); await frame(5); await page.mouse.up(); await frame(8);
            await check('Shelf drag creates exactly one Text Rules node', await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).filter(n => n.operation === 'text-rules').length === 1));
        });
    }
    if (!only || only === 'connect') {
        await load('connect'); await editingView();
        await animation('connect-nodes', async () => {
            for (const [from, to] of [['compose-json', 'json-decode'], ['json-decode', 'select-fields']]) {
                await drag(card(from).locator('.pc-port[data-dir="out"][data-port="out"]'), card(to).locator('.pc-port[data-dir="in"][data-port="in"]'));
            }
            await check('Mouse-created Text and Data wires exist', await page.evaluate(() => ['compose-json', 'json-decode'].every(id => Object.values(window.canvasHarness.graph.wires).some(w => w.from === id))));
            await screenshot('connecting-nodes');
        });
    }
    if (!only || only === 'subgraph') {
        await load('complex'); await editingView();
        await animation('create-subgraph', async () => {
            await click(heading('json-decode'));
            await page.keyboard.down('Shift'); await click(heading('select-fields')); await click(heading('compose-guidance')); await page.keyboard.up('Shift');
            await check('Three processing nodes selected', await page.evaluate(() => window.canvasHarness.canvas.multi.size === 3));
            await screenshot('selection-subgraph');
            await click(heading('select-fields'), { button: 'right' }); await frame(8);
            await click(page.getByRole('menuitem', { name: 'Create subgraph', exact: true }));
            await expect(page.locator('.pc-graph-tabs [aria-selected="true"]')).toContainText('Subgraph');
            await fit(.95); await frame(8); await screenshot('created-subgraph');
            await check('Extraction creates typed input and output boundaries', await page.locator('.pc-node-subgraph-input').count() >= 1 && await page.locator('.pc-node-subgraph-output').count() >= 1);
            await click(page.locator('.pc-graph-tabs [role="tab"]').first()); await fit(); await frame(10); await screenshot('subgraph-parent');
            const wrapper = await page.evaluate(() => Object.values(window.canvasHarness.graph.nodes).find(n => n.type === 'subgraph').id);
            await check('Parent wires reconnect through the wrapper', await page.evaluate(id => Object.values(window.canvasHarness.graph.wires).some(w => w.to === id) && Object.values(window.canvasHarness.graph.wires).some(w => w.from === id), wrapper));
            await click(heading(wrapper)); await page.keyboard.press('F2'); await page.getByLabel('Node name', { exact: true }).fill('Scene brief'); await page.getByLabel('Node name', { exact: true }).press('Tab');
            await frame(5);
        });
    }
    if (!only || only === 'preview') {
        await load(); await run('compose-guidance');
        await animation('inspect-and-pin', async () => {
            await click(heading('select-fields')); await frame(12);
            await click(page.getByRole('button', { name: 'Pin preview', exact: true })); await frame(6);
            await click(heading('json-decode')); await frame(12);
            await check('Pin keeps the Select Fields output visible', (await page.locator('.pc-output-preview h3').textContent()).includes('Select Fields'));
            await screenshot('pinned-preview');
            await click(page.getByRole('button', { name: 'Pin preview', exact: true })); await frame(10);
            await check('Unpin follows the selected JSON Decode node', (await page.locator('.pc-output-preview h3').textContent()).includes('JSON Decode'));
        });
    }
    if (!only || only === 'comments') {
        await load();
        await animation('frame-a-workflow', async () => {
            await click(heading('json-decode')); await page.keyboard.down('Shift'); await click(heading('select-fields')); await page.keyboard.up('Shift');
            await page.locator('.pc-canvas-host').focus(); await page.keyboard.press('c'); await frame(8);
            const name = page.getByRole('region', { name: 'Comment details', exact: true }).getByLabel('Comment title', { exact: true });
            await name.fill('Build the scene brief'); await name.press('Tab'); await frame(8);
            await check('A labeled comment frame exists', await page.locator('.pc-comment-frame').count() === 1);
            await screenshot('workflow-comments');
        });
    }
    await check('No auxiliary model requests', await page.evaluate(() => window.canvasHarness.providerCalls() === 0));
    if (evidence.errors.length || evidence.blockedRequests.length) throw Error(JSON.stringify({ errors: evidence.errors, blocked: evidence.blockedRequests }));
    evidence.status = 'passed';
} catch (error) {
    evidence.status = 'failed'; evidence.failure = error.message;
    if (page) await page.screenshot({ path: join(scratch, 'failure.png') }).catch(() => {});
    throw error;
} finally {
    await writeFile(join(scratch, only ? `evidence-${only}.json` : 'evidence.json'), JSON.stringify(evidence, null, 2));
    await browser?.close(); server.kill();
}
