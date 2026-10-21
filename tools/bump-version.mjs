// Set the release version everywhere it matters, in one go:
//   node tools/bump-version.mjs 0.3.0
//
// Browsers cache ES modules hard, so after an update people can keep running
// the old code. Every import between the extension's own files carries
// ?v=<version>, and manifest.json loads index.js the same way, so a new
// version is a new URL and the browser has to fetch it.
// Every file must use the SAME query for a given module, or the browser loads
// two copies of it with separate state â€” this script keeps them in step.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? '')) { console.error('usage: node tools/bump-version.mjs 1.2.3'); process.exit(1); }

const mf = path.join(root, 'manifest.json');
const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
m.version = v;
m.js = `index.js?v=${v}`;
fs.writeFileSync(mf, JSON.stringify(m, null, 4) + '\n');

function sources(dir, extensions = ['.js']) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sources(`${dir}/${entry.name}`, extensions) : extensions.some(extension => entry.name.endsWith(extension)) ? [`${dir}/${entry.name}`] : []);
}
const files = ['index.js', ...sources('src')];
for (const f of files) {
    const p = path.join(root, f);
    const before = fs.readFileSync(p, 'utf8');
    const after = before.replace(/(from\s+['"])(\.{1,2}\/[^'"?]+\.js)(\?v=[^'"]*)?(['"])/g, `$1$2?v=${v}$4`)
        .replace(/(import\s*\(\s*['"])(\.{1,2}\/[^'"?]+\.js)(?:\?v=\d+\.\d+\.\d+)?(['"]\s*\))/g, `$1$2?v=${v}$3`);
    if (after !== before) fs.writeFileSync(p, after);
}
// Retain each test/tool's intentional module shape, but migrate existing cache URLs
// so fixtures and the installed source do not load separate domain singletons.
// Non-release markers deliberately isolate modules for cache/Worker tests.
for (const dir of ['tests', 'tools']) if (fs.existsSync(path.join(root, dir))) for (const f of sources(dir, ['.js', '.mjs'])) {
    const p = path.join(root, f);
    const before = fs.readFileSync(p, 'utf8');
    const after = before.replace(/((?:from\s+|import\s*\()\s*['"])(\.{1,2}\/[^'"?]+\.js)\?v=\d+\.\d+\.\d+(['"])/g, `$1$2?v=${v}$3`);
    if (after !== before) fs.writeFileSync(p, after);
}
const stylesheet = path.join(root, 'style.css');
const cssBefore = fs.readFileSync(stylesheet, 'utf8');
const cssAfter = cssBefore.replace(/(\.\/dist\/lattice\.css\?v=)[^'"\s)]+/g, (_, prefix) => prefix + v);
if (cssAfter !== cssBefore) fs.writeFileSync(stylesheet, cssAfter);
for (const file of ['package.json', 'package-lock.json']) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const value = JSON.parse(fs.readFileSync(p, 'utf8'));
    value.version = v;
    if (value.packages?.['']) value.packages[''].version = v;
    fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}
console.log(`version ${v}: manifest and ${files.length} files updated`);
