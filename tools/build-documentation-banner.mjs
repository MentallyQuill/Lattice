import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Compose the existing brand assets; this does not change or redraw the logo.
const root = new URL('../', import.meta.url);
const output = new URL('../docs/images/lattice-banner.png', import.meta.url);
const html = `<!doctype html><html lang="en"><meta charset="utf-8">
<style>
@font-face{font-family:Bricolage;src:url('/font.ttf');font-weight:100 900}
html,body{margin:0;background:#161616}
.banner{width:1440px;height:300px;display:flex;align-items:center;justify-content:center;gap:22px;color:#fff;background:#161616}
img{width:144px;height:144px;filter:brightness(0) invert(1)}
span{font:600 100px/1 Bricolage,sans-serif;letter-spacing:.015em}
</style><div class="banner"><img src="/logo.svg" alt=""><span>LATTICE</span></div>`;
const server = createServer(async (request, response) => {
    const assets = { '/logo.svg': ['assets/lattice-logo.svg', 'image/svg+xml'], '/font.ttf': ['assets/bricolage-grotesque.ttf', 'font/ttf'] };
    try {
        if (request.url === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(html); return; }
        const asset = assets[request.url];
        if (!asset) { response.writeHead(404).end(); return; }
        response.writeHead(200, { 'Content-Type': asset[1] });
        response.end(await readFile(new URL(asset[0], root)));
    } catch { response.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 300 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    if (!await page.evaluate(() => document.fonts.check('600 100px Bricolage') && document.querySelector('img').naturalWidth > 0)) throw Error('Brand assets did not load.');
    if (errors.length) throw Error(errors.join('\n'));
    await mkdir(new URL('../docs/images/', import.meta.url), { recursive: true });
    await page.locator('.banner').screenshot({ path: fileURLToPath(output) });
    console.log('Built docs/images/lattice-banner.png from the extension logo and font.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
