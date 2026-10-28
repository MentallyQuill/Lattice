/** In-memory authenticated host files; unexpected routes never reach the network. */
export function createHostFileFixture() {
    const files = new Map(), requests = [], unexpected = [];
    const fetch = async (url, options = {}) => {
        requests.push({ url, method: options.method ?? 'GET' });
        if (url === '/api/plugins/lattice-files/status' && (options.method ?? 'GET') === 'GET') {
            return new Response('', { status: 404 });
        }
        if (url === '/api/files/upload' && options.method === 'POST') {
            const { name, data } = JSON.parse(options.body);
            if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name) || name.includes('..') || typeof data !== 'string' || data.length > 12 * 1024 * 1024) {
                return new Response('', { status: 400 });
            }
            files.set(name, Buffer.from(data, 'base64'));
            return Response.json({ path: 'user/files/' + name });
        }
        if (url === '/api/files/delete' && options.method === 'POST') {
            const { path } = JSON.parse(options.body);
            const name = typeof path === 'string' && /^files\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path) ? path.slice(6) : null;
            if (!name || name.includes('..')) return new Response('', { status: 400 });
            files.delete(name);
            return Response.json({ ok: true });
        }
        if (typeof url === 'string' && /^\/user\/files\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(url) && (options.method ?? 'GET') === 'GET') {
            const name = url.slice('/user/files/'.length);
            return files.has(name) ? new Response(files.get(name)) : new Response('', { status: 404 });
        }
        unexpected.push({ url, method: options.method ?? 'GET' });
        throw new Error('Unexpected fixture request: ' + url);
    };
    return { files, requests, unexpected, fetch };
}
