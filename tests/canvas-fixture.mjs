import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { after } from 'node:test';
import { compiled } from './helpers/svelte-compile.mjs';
export const dom = new JSDOM('<body><div id="canvas"></div></body>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, CSS: { escape: value => value }, getComputedStyle: dom.window.getComputedStyle });
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLDivElement', 'HTMLMediaElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'SVGElement', 'MutationObserver']) if (!(key in globalThis)) Object.defineProperty(globalThis, key, { configurable: true, get: () => globalThis.window?.[key] });
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
document.elementFromPoint = () => null;
export const version = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).version;
// Compile only the current Canvas components. Focused renderer tests do not depend on a stale full UI bundle.
const directory = await mkdtemp(join(tmpdir(), 'lattice-canvas-components-'));
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
await compiled('CanvasLayer', directory);
const entry = `import {mount,unmount,flushSync} from ${JSON.stringify(clientURL)}; import CanvasLayer from './CanvasLayer.mjs';
export function mountCanvas(target,actions) { const component=mount(CanvasLayer,{target,props:{actions}}); flushSync(); return { ...component.getLayers(), applyScene: scene => flushSync(() => component.applyScene(scene)), setWirePreview: ghost => flushSync(() => component.setWirePreview(ghost)), setVisualStatus: trace => flushSync(() => component.setVisualStatus(trace)), setComments:(comments,actions)=>flushSync(()=>component.setComments(comments,actions)), setNodes:nodes=>flushSync(()=>component.setNodes(nodes)), setRecallStatus:status=>flushSync(()=>component.setRecallStatus(status)), setPreviewTarget:id=>flushSync(()=>component.setPreviewTarget(id)), setNodeProfiles:rows=>flushSync(()=>component.setNodeProfiles(rows)), setGroups:groups=>flushSync(()=>component.setGroups(groups)), setWires:(wires,bounds,ghost)=>flushSync(()=>component.setWires(wires,bounds,ghost)), setPositions:(nodes,groups,scene)=>flushSync(()=>{component.setPositions(nodes,groups);if(scene)component.applyScene(scene);}), destroy:()=>unmount(component) }; }`;
await writeFile(join(directory, 'entry.mjs'), entry);
const loader = registerHooks({ resolve(specifier, context, next) { return specifier.includes('/dist/lattice-ui.js') ? { url: pathToFileURL(join(directory, 'entry.mjs')).href, shortCircuit: true } : next(specifier, context); } });
export const { Canvas } = await import(`../src/canvas.js?v=${version}`); loader.deregister();
after(async () => { const rel=relative(resolve(tmpdir()),resolve(directory)); if(!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe test temporary directory.'); await rm(directory,{recursive:true,force:true}); });
let sequence = 0;
export function fixture(hooks = {}) {
    const host = document.createElement('div'); document.body.append(host);
    host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 });
    const a = { id: 'a', type: 'workflow', operation: 'scene-context', x: 50, y: 50 };
    const b = { id: 'b', type: 'workflow', operation: 'smart-compactor', x: 350, y: 50 };
    const edge = { id: 'edge', route: 'wire', from: a.id, fromPort: 'out', to: b.id, toPort: 'in' };
    const graph = { id: 'canvas-fixture-' + ++sequence, name: 'Test', schema: 3, runtime: 2, mode: 'native-pre', nodes: { a, b }, wires: { edge }, portals: {}, definitions: {}, groups: {}, view: { x: 0, y: 0, zoom: 1 }, nativeCards: {} };
    for (const node of [a,b]) graph.nativeCards[node.id] = { canonicalTitle: node.id, family: 'Shaping', iconPath: 'M1 1h2', body: 'Prepared', hostResult: false,
        ports: (node === a ? ['out'] : ['in','out']).map(dir => ({ id: `${dir}:${dir}`, port: dir, dir, side: dir === 'in' ? 'left' : 'right', row: 1, kind: 'context', label: dir, className: 'pc-port pc-port-' + dir, title: dir + ': context' })) };
    const canvas = new Canvas(host, hooks); canvas.setGraph(graph);
    for (const node of [a,b]) canvas.geometry.measure(node.id,160,48,graph.nativeCards[node.id].ports.map(p=>({id:p.port,direction:p.dir,x:p.dir==='in'?0:160,y:24,side:p.side,kind:p.kind})));
    canvas.render();
    return { host, graph, a, b, wire: { ok: true, wire: edge }, canvas };
}
export function mouse(target, type, x, y, options = {}) {
    target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...options }));
}
