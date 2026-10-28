import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (pathname === '/__host/style.css') {
            let css = '/* lattice-host-css:fallback */\nbody{margin:0;background:#16171d;color:#e8e8e8;font:14px system-ui}button,input,textarea,select{font:inherit;color:inherit;background:#292b35;border:1px solid #555967;border-radius:5px;padding:6px}';
            try {
                const host = await fetch('http://127.0.0.1:8000/style.css', { signal: AbortSignal.timeout(1500), redirect: 'error' });
                // Public base cascade only: secondary imports/resources are outside this read boundary.
                if (host.ok) css = '/* lattice-host-css:current */\n' + (await host.text()).replace(/@import\s+[^;]+;/gi, '').replace(/url\([^)]*\)/gi, 'none');
            } catch { /* Deterministic standalone host CSS when SillyTavern is absent. */ }
            response.writeHead(200, { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' }); response.end(css); return;
        }
        const path = resolve(root, `.${pathname === '/' ? '/tests/browser/harness.html' : pathname}`);
        if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
        const bytes=await readFile(path);
        response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(bytes);
    } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
});
server.listen(Number(process.env.PORT ?? 4178), '127.0.0.1', () => console.log('Mock SillyTavern host ready at http://127.0.0.1:4178'));
