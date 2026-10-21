import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).version;
function sources(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sources(join(dir, entry.name)) : entry.name.endsWith('.js') ? [join(dir, entry.name)] : []); }
const files = [join(root, 'index.js'), ...sources(join(root, 'src'))];
let imports = 0;
for (const file of files) for (const match of readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+\.js)(\?v=[^'"]*)?['"]/g)) {
    imports++;
    assert.equal(match[2], `?v=${version}`, `version mismatch in ${file}: ${match[1]}`);
    assert.ok(existsSync(resolve(dirname(file), match[1])), `missing installed asset: ${match[1]}`);
}
const bundle = readFileSync(join(root, 'dist/lattice-ui.js'), 'utf8');
assert.ok(existsSync(join(root, 'dist/lattice.css')), 'compiled Svelte styles accompany the extension');
assert.ok(readFileSync(join(root, 'style.css'), 'utf8').includes(`@import url('./dist/lattice.css?v=${version}');`), 'installed stylesheet loads the matching compiled Svelte styles');
assert.ok(bundle.includes('mountCanvas'), 'canvas mount is exported');
assert.ok(bundle.includes('mountWorkbench'), 'workbench mount is exported');
const parsed = ts.createSourceFile('lattice-ui.js', bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function checkImports(node) {
    assert.ok(!ts.isImportDeclaration(node) && !(ts.isExportDeclaration(node) && node.moduleSpecifier)
        && !(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword), 'compiled UI has no runtime imports or CDN dependency');
    ts.forEachChild(node, checkImports);
}
checkImports(parsed);
assert.ok(!/extensionSettings|chatMetadata|function emissionCounts|function compile\(/.test(bundle), 'domain state and compiler remain outside the UI bundle');
assert.ok(existsSync(join(root, 'THIRD_PARTY_NOTICES.md')), 'bundled runtime license accompanies the extension');
for (const asset of ['lattice-logo.svg', 'bricolage-grotesque.ttf', 'Bricolage-Grotesque-OFL.txt']) assert.ok(existsSync(join(root, 'assets', asset)), `local brand asset accompanies the extension: ${asset}`);
assert.ok(readFileSync(join(root, 'style.css'), 'utf8').includes('assets/bricolage-grotesque.ttf'), 'brand font loads from the installed extension');
console.log(`Assets verified: ${imports} versioned local imports; self-contained Svelte UI; one native domain module graph.`);
