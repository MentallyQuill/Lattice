import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPERATIONS } from '../src/workflow/catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const documents = ['README.md', 'docs/README.md', 'docs/examples.md', 'docs/operators-manual.md', 'docs/node-reference.md', 'docs/lattice-workspace.md', 'docs/native-workflows.md', 'docs/development.md', 'docs/unified-workflows.md', 'docs/lattice-reference-library.md', 'docs/introspection-package.md', 'docs/story-systems.md', 'docs/media.md'];
const texts = new Map(await Promise.all(documents.map(async path => [path, (await readFile(join(root, path), 'utf8')).replace(/\r\n?/g, '\n')])));
const failures = [], images = new Set();
let links = 0;
const slug = text => text.toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-');
function anchors(text) {
    const counts = new Map();
    return new Set([...text.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) => {
        const base = slug(heading), count = counts.get(base) ?? 0;
        counts.set(base, count + 1);
        return base + (count ? '-' + count : '');
    }));
}
for (const [path, text] of texts) {
    if (/Silly\s*Canvas|ComfyTavern|\bfork\b/i.test(text)) failures.push(path + ': obsolete branding or interface reference');
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const href = match[1];
        if (/^https?:/.test(href)) continue;
        const [local, fragment] = href.split('#');
        const target = local ? resolve(root, dirname(path), decodeURIComponent(local)) : join(root, path);
        try { await access(target); } catch { failures.push(path + ': missing ' + href); continue; }
        links++;
        if (fragment && extname(target) === '.md') {
            if (!anchors((await readFile(target, 'utf8')).replace(/\r\n?/g, '\n')).has(fragment)) failures.push(path + ': missing anchor ' + href);
        }
        if (match[0].startsWith('!')) {
            if (!target.startsWith(join(root, 'docs', 'images'))) failures.push(path + ': screenshot outside current image set');
            images.add(target);
        }
    }
}
// The README introduces families; the node reference owns complete operation coverage.
for (const guide of ['node-reference', 'unified-workflows']) if (!texts.get('README.md').includes('](docs/' + guide + '.md)')) failures.push('README missing guide ' + guide);
const sharedHeadings = { Join: 'Join and Collect', Collect: 'Join and Collect', Append: 'Append and Combine', Combine: 'Append and Combine' };
for (const operation of Object.values(OPERATIONS)) {
    const heading = sharedHeadings[operation.title] ?? operation.title;
    if (!texts.get('docs/node-reference.md').includes('### ' + heading + '\n')) failures.push('Reference missing ' + operation.title);
}
const gifs = (await readdir(join(root, 'docs/images'))).filter(name => name.endsWith('.gif'));
for (const name of gifs) {
    const path = join(root, 'docs/images', name), buffer = await readFile(path);
    if (!['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString()) || !buffer.readUInt16LE(6) || !buffer.readUInt16LE(8) || buffer.at(-1) !== 0x3b) failures.push('Invalid GIF ' + name);
    if (buffer.length > 3 * 1024 * 1024) failures.push('GIF exceeds 3 MiB budget ' + name);
    if (!images.has(path)) failures.push('Unreferenced animation ' + name);
}
const pngs = (await readdir(join(root, 'docs/images'))).filter(name => name.endsWith('.png'));
for (const name of pngs) {
    const path = join(root, 'docs/images', name), buffer = await readFile(path);
    if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || !buffer.readUInt32BE(16) || !buffer.readUInt32BE(20)) failures.push('Invalid PNG ' + name);
    if (!images.has(path)) failures.push('Unreferenced screenshot ' + name);
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ documents: documents.length, localLinks: links, operations: Object.keys(OPERATIONS).length, screenshots: pngs.length, animations: gifs.length, status: 'passed' }));
