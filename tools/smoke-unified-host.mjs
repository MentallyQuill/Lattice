import { readFile, realpath, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PREFIX = '/__lattice-unified-host-test/';
const READS = new Set(['GET /api/extensions/discover', 'GET /api/users/me', 'POST /api/settings/get', 'POST /api/ping']);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
/** No model request or persistence write can cross this browser boundary. */
export function createInstalledHostBoundary(host = 'http://127.0.0.1:8000') {
    const parsed = new URL(host);
    if (parsed.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw Error('Use a plain HTTP loopback host.');
    const counts = { modelBlocked: 0, writeBlocked: 0, externalBlocked: 0, otherBlocked: 0, permittedReads: 0 };
    return {
        counts: () => ({ ...counts }),
        allow(url, method) {
            let target;
            try { target = new URL(url); } catch { counts.otherBlocked++; return false; }
            if (target.origin !== parsed.origin || target.username || target.password) { counts.externalBlocked++; return false; }
            const path = target.pathname;
            if (/^\/api\/backends\//.test(path) || /^\/api\/(generate|novelai|kobold|textgenerationwebui|openai)\b/.test(path)) { counts.modelBlocked++; return false; }
            if (!target.search && READS.has(method + ' ' + path)) { counts.permittedReads++; return true; }
            if (method !== 'GET') { counts.writeBlocked++; return false; }
            if (path.startsWith('/api/') || path.startsWith('/proxy/') || /^\/(characters|chats|worlds)\//.test(path)) { counts.otherBlocked++; return false; }
            if (path.startsWith(PREFIX) || ['/', '/version', '/csrf-token'].includes(path) || /\.(js|mjs|css|html|json|png|jpg|jpeg|svg|ico|gif|webp|woff2?|ttf|wasm)$/i.test(path)) return true;
            counts.otherBlocked++; return false;
        },
    };
}
/** Only the exact dependency closure of the tested production modules is served. */
export async function productionModules(repo = root) {
    const base = await realpath(repo), allowed = new Map(), queue = ['src/workflow/host.js', 'src/workflow/catalog.js', 'src/workflow/document-catalog.js'];
    while (queue.length) {
        const name = queue.pop();
        if (allowed.has(name)) continue;
        if (!['src/random-id.js','src/ui/node-file-access.js','src/ui/node-file-service.js','src/ui/server-file-access.js'].includes(name) && !/^src\/workflow\/[a-z0-9/-]+\.js$/.test(name)) throw Error('Unapproved production dependency.');
        const target = await realpath(resolve(base, name));
        const rel = relative(base, target);
        if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw Error('Production dependency escaped the repository.');
        const source = await readFile(target, 'utf8'); allowed.set(name, { path: target, source });
        for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+\.js(?:[?#][^'"]*)?)['"]/g)) {
            const specifier = match[1].split(/[?#]/)[0];
            if (!specifier.startsWith('.')) throw Error('Unexpected external production dependency.');
            queue.push(relative(base, resolve(dirname(target), specifier)).split(sep).join('/'));
        }
    }
    return {
        size: allowed.size,
        get(url) {
            const parsed = new URL(url), name = parsed.pathname.slice(PREFIX.length);
            if (!parsed.pathname.startsWith(PREFIX) || parsed.search && !/^\?v=[0-9.]+$/.test(parsed.search) || parsed.hash || !allowed.has(name)) throw Error('Unapproved test module request.');
            return allowed.get(name).source;
        },
    };
}

export async function runInstalledHostFixture() {
    const { createNativeWorkflowController } = await import('/__lattice-unified-host-test/src/workflow/host.js');
    const { operationDefaults } = await import('/__lattice-unified-host-test/src/workflow/catalog.js');
    const { createChatDocumentCatalog } = await import('/__lattice-unified-host-test/src/workflow/document-catalog.js');
    const helpers = await import('/script.js'), users = await import('/scripts/user.js');
    const actual = window.SillyTavern.getContext();
    const require = (condition, code) => { if (!condition) throw Error(code); };
    require(['isGenerating', 'syncMesToSwipe', 'syncSwipeToMes'].every(key => typeof helpers[key] === 'function'), 'PUBLIC_SWIPE_HELPERS_UNAVAILABLE');
    require(users.getCurrentUserHandle?.() === 'default-user', 'DEFAULT_USER_UNAVAILABLE');
    // Never borrow a real story. Chat reads are blocked and the isolated page must be empty.
    require(Array.isArray(actual.chat) && actual.chat.length === 0 && !helpers.isGenerating(), 'ISOLATED_EMPTY_CHAT_REQUIRED');
    require(actual.eventSource && typeof actual.eventSource.constructor === 'function', 'PUBLIC_EVENT_SOURCE_UNAVAILABLE');
    const originalChat = actual.chat, outcomes = [];
    for (const order of ['received-first', 'ended-first']) {
        let controller;
        try {
            const eventSource = new actual.eventSource.constructor();
            require(['on', 'emit', 'removeListener'].every(key => typeof eventSource[key] === 'function'), 'ISOLATED_HOST_EMITTER_UNAVAILABLE');
            const events = [], results = [];
            let modelCalls = 0, chatSaves = 0, documentSaves = 0, displayUpdates = 0, refreshes = 0, busy = false;
            const c = { chatId: 'lattice-isolated-host-' + order, characterId: 0, groupId: null, characters: [{ avatar: 'synthetic-mara.png', data: { name: 'Synthetic Mara' } }], chat: originalChat, chatMetadata: { isolated: true }, extensionPrompts: {}, eventSource, eventTypes: actual.eventTypes };
            require(c.eventTypes?.GENERATION_STARTED && c.eventTypes.MESSAGE_RECEIVED && c.eventTypes.GENERATION_ENDED, 'HOST_EVENT_TYPES_UNAVAILABLE');
            c.setExtensionPrompt = (key, value) => { c.extensionPrompts[key] = { value }; };
            c.saveChat = async () => { chatSaves++; return true; };
            c.saveMetadata = async () => true;
            c.updateMessageBlock = async () => { displayUpdates++; };
            c.swipe = { refresh: async () => { refreshes++; } };
            const node = (id, operation, extra = {}) => ({ ...operationDefaults(operation), id, type: 'workflow', ...extra });
            const graph = { id: 'installed-unified-fixture', name: 'Installed host unified fixture', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, nodes: {}, wires: {}, definitions: {}, portals: {} };
            const add = (id, operation, extra) => graph.nodes[id] = node(id, operation, extra);
            const wire = (id, from, fromPort, to, toPort) => graph.wires[id] = { id, route: 'wire', from, fromPort, to, toPort };
            add('send', 'on-send'); add('guidance', 'compose', { outputKind: 'guidance', sections: [{ name: 'Style', text: 'Describe the blue lantern; preserve the closed gate.' }] });
            add('generate', 'generate-reply'); add('revise', 'revise-draft', { scope: 'whole', instructions: 'Tighten prose without changing the scene.' });
            add('notes', 'text', { text: 'Scene items: blue lantern; closed gate.' }); add('append', 'append'); add('review', 'review-publish');
            add('body', 'draft-text'); add('read', 'read-file', { targetId: 'scene-journal.txt' }); add('write', 'write-file', { mode: 'append' });
            wire('activation', 'send', 'activation', 'generate', 'activation'); wire('guide', 'guidance', 'out', 'generate', 'guidance');
            wire('native', 'generate', 'draft', 'revise', 'draft'); wire('revised', 'revise', 'out', 'append', 'draft'); wire('notes', 'notes', 'out', 'append', 'section'); wire('review', 'append', 'out', 'review', 'draft');
            wire('body', 'revise', 'out', 'body', 'draft'); wire('reference', 'read', 'reference', 'write', 'reference'); wire('save-body', 'body', 'out', 'write', 'text');
            const catalog = createChatDocumentCatalog({ getContext: () => c, getUserId: users.getCurrentUserHandle });
            require(catalog.define({ targetId: 'scene-journal.txt', name: 'Synthetic scene journal', format: 'text', content: 'Prior accepted scene.', visibility: { kind: 'public' } }).ok, 'DOCUMENT_AUTHORIZATION_FAILED');
            controller = createNativeWorkflowController({ context: () => c, userId: users.getCurrentUserHandle, getGraph: phase => phase === 'unified' ? graph : undefined, isEnabled: () => true, isBusy: () => busy || helpers.isGenerating(), countTokens: async text => ({ tokens: Math.ceil(text.length / 4), method: 'synthetic-character-estimate' }), resolveBinding: () => ({ ok: true, data: { profileId: 'synthetic-fixed-profile', model: 'synthetic-prose-model' } }), request: async input => { modelCalls++; require(input.messages.some(m => m.content.includes('The blue lantern waited beside the closed gate.')), 'POST_MODEL_MISSING_NATIVE_REPLY'); return { ok: true, data: { text: 'The blue lantern glowed beside the closed gate.', finish: 'stop' } }; }, documentCatalog: catalog, persistenceVerifier: { saveAndVerify: async () => { documentSaves++; return { ok: true, data: { acknowledged: true } }; } }, syncMesToSwipe: helpers.syncMesToSwipe, syncSwipeToMes: helpers.syncSwipeToMes, onEvent: event => events.push(event), onResult: result => results.push(result) });
            controller.subscribe();
            originalChat.push({ mes: 'I inspect the blue lantern.', is_user: true, extra: {}, send_date: new Date().toISOString() });
            busy = true;
            await eventSource.emit(c.eventTypes.GENERATION_STARTED, 'normal', {}, false);
            const preparation = await controller.beforeGenerate(originalChat.map(m => ({ ...m })), 8192, () => { throw Error('UNEXPECTED_NATIVE_ABORT'); }, 'normal');
            require(preparation.ok && preparation.awaitingNative && preparation.published && modelCalls === 0 && chatSaves === 0 && documentSaves === 0, 'PRE_NATIVE_BOUNDARY_FAILED');
            require(Object.values(c.extensionPrompts).some(p => p.value === 'Describe the blue lantern; preserve the closed gate.'), 'GUIDANCE_NOT_INSTALLED');
            const now = new Date().toISOString(), nativeText = 'The blue lantern waited beside the closed gate.';
            const reply = { mes: nativeText, is_user: false, extra: {}, send_date: now, gen_started: now, gen_finished: now, swipe_id: 0, swipes: [nativeText], swipe_info: [{ send_date: now, gen_started: now, gen_finished: now, extra: {} }] };
            originalChat.push(reply);
            if (order === 'received-first') await eventSource.emit(c.eventTypes.MESSAGE_RECEIVED, 1, 'normal');
            busy = false; await eventSource.emit(c.eventTypes.GENERATION_ENDED, 2);
            if (order === 'ended-first') await eventSource.emit(c.eventTypes.MESSAGE_RECEIVED, 1, 'normal');
            for (let i = 0; i < 150 && !results.length; i++) await new Promise(r => setTimeout(r, 10));
            const result = results[0];
            require(result?.ok && result.runId === preparation.runId && result.recording?.plan.phase === 'unified' && result.reviewHandles.length === 1 && modelCalls === 1, 'SAME_RUN_POST_CONTINUATION_FAILED');
            require(reply.mes === nativeText && reply.swipes.length === 1 && chatSaves === 0 && documentSaves === 0 && !c.chatMetadata.latticeDocuments, 'REVIEW_MUTATED_CANONICAL_STATE');
            require(Object.values(c.extensionPrompts).every(p => !p.value), 'GUIDANCE_NOT_CLEARED');
            const accepted = await controller.apply(result.reviewHandles[0]);
            require(accepted.ok && accepted.settlement?.status === 'settled', 'ACCEPTED_SETTLEMENT_FAILED');
            require(reply.swipes[0] === nativeText && reply.swipes.length === 2 && reply.swipe_id === 1 && reply.mes.includes('The blue lantern glowed beside the closed gate.') && reply.mes.includes('Scene items: blue lantern; closed gate.'), 'PUBLIC_SWIPE_SYNCHRONIZATION_FAILED');
            const stored = c.chatMetadata.latticeDocuments?.['default-user']?.['scene-journal.txt'];
            require(stored?.content === 'Prior accepted scene.\nThe blue lantern glowed beside the closed gate.' && chatSaves === 1 && documentSaves === 1, 'ACCEPTED_FILE_APPEND_FAILED');
            require((await controller.apply(result.reviewHandles[0])).ok && modelCalls === 1 && chatSaves === 1 && documentSaves === 1 && reply.swipes.length === 2, 'ACCEPTANCE_NOT_IDEMPOTENT');
            require(events.filter(e => e.type === 'plan').length === 1 && events.filter(e => e.type === 'run-settled').length === 1, 'RUN_WAS_REPLACED');
            outcomes.push({ order, sameRun: true, plans: 1, runSettlements: 1, auxiliaryMockCalls: modelCalls, originalSwipePreserved: true, reviewBeforeWrites: true, acceptedFileAppends: documentSaves, localChatSaveCallbacks: chatSaves, repeatedApplyNoAdditionalEffects: true, publicSwipeHelpers: true, hostEventEmitter: true, displayUpdates, refreshes });
        } finally { controller?.dispose(); originalChat.splice(0); }
    }
    require(actual.chat === originalChat && originalChat.length === 0, 'HOST_CHAT_NOT_RESTORED');
    return { user: 'default-user', fixtures: outcomes, actualProviderGenerations: 0, hostChatRestored: true, persistence: 'synthetic acknowledged verifier; no host persistence API called', generation: 'synthetic native reply plus actual host event emitter; no backend generation', helperExports: ['isGenerating', 'syncMesToSwipe', 'syncSwipeToMes', 'getCurrentUserHandle'] };
}

export async function runInstalledHostSmoke({ host = 'http://127.0.0.1:8000', screenshot } = {}) {
    const boundary = createInstalledHostBoundary(host), modules = await productionModules();
    const { chromium } = await import('@playwright/test');
    let browser, context, stage = 'browser';
    try {
        browser = await chromium.launch({ headless: true }); context = await browser.newContext({ serviceWorkers: 'block' });
        const page = await context.newPage();
        await context.route('**/*', async route => {
            const request = route.request();
            if (!boundary.allow(request.url(), request.method())) { await route.abort(); return; }
            if (new URL(request.url()).pathname.startsWith(PREFIX)) {
                try { await route.fulfill({ contentType: 'text/javascript', body: modules.get(request.url()) }); } catch { await route.abort(); }
            } else await route.continue();
        });
        await context.routeWebSocket('**/*', async socket => { boundary.allow(socket.url(), 'WEBSOCKET'); await socket.close(); });
        stage = 'login';
        // Only this explicit login uses APIRequestContext; all test page traffic is routed.
        const csrfResponse = await context.request.get(new URL('/csrf-token', host).href);
        if (!csrfResponse.ok()) throw Error('LOCAL_CSRF_UNAVAILABLE');
        const csrf = await csrfResponse.json();
        const login = await context.request.post(new URL('/api/users/login', host).href, { headers: { 'x-csrf-token': csrf.token }, data: { handle: 'default-user', password: '' } });
        if (!login.ok()) throw Error('LOCAL_DEFAULT_USER_LOGIN_UNAVAILABLE');
        stage = 'navigation'; await page.goto(host, { waitUntil: 'domcontentloaded' });
        stage = 'host-readiness'; await page.waitForFunction(() => typeof window.SillyTavern?.getContext === 'function', {}, { timeout: 60000 });
        await page.waitForFunction(async () => { const module = await import('/scripts/user.js'); return module.getCurrentUserHandle?.() === 'default-user'; }, {}, { timeout: 30000 });
        stage = 'unified-fixtures'; const result = await page.evaluate(runInstalledHostFixture);
        if (screenshot) {
            stage = 'screenshot';
            await page.evaluate(result => { const panel = document.createElement('div'); panel.id = 'lattice-isolated-validation'; panel.style.cssText = 'position:fixed;inset:30px auto auto 30px;width:720px;background:white;color:#172235;padding:28px;font:18px/1.5 sans-serif;z-index:2147483647;border-radius:12px'; const title = document.createElement('h1'); title.textContent = 'Unified workflow — installed host validation'; panel.append(title); for (const text of ['Guidance → native boundary → prose revision → notes → Review / Apply → journal append', 'Both native event orders resumed the same run.', 'Original reply preserved. Writes waited for acceptance.', 'Actual SillyTavern public swipe helpers and event emitter.', 'Zero provider generations. Synthetic persistence only.']) { const p = document.createElement('p'); p.textContent = text; panel.append(p); } document.body.append(panel); }, result);
            await mkdir(dirname(resolve(screenshot)), { recursive: true }); await page.locator('#lattice-isolated-validation').screenshot({ path: screenshot });
        }
        return { ok: true, productionModules: modules.size, ...result, boundary: boundary.counts(), authenticatedLoginWrites: 1 };
    } catch (error) { const detail = typeof error?.message === 'string' && /^[A-Z_]+$/.test(error.message) ? ': ' + error.message : ''; throw Error('Installed host smoke failed at ' + stage + detail); }
    finally { try { await context?.close(); } finally { await browser?.close(); } }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    const args = process.argv.slice(2); let host = 'http://127.0.0.1:8000', screenshot;
    for (let i = 0; i < args.length; i++) { if (args[i] === '--host' && args[i + 1]) host = args[++i]; else if (args[i] === '--screenshot' && args[i + 1]) screenshot = args[++i]; else throw Error('Use --host LOOPBACK and optional --screenshot PATH.'); }
    console.log(JSON.stringify(await runInstalledHostSmoke({ host, screenshot }), null, 2));
}
