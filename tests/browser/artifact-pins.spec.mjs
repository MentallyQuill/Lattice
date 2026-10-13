import { test, expect } from '@playwright/test';
import { openEmber } from './ember-fixture.mjs';

const kinds = ['context', 'guidance', 'draft', 'patches', 'candidate', 'text', 'data'];
const presets = ['ember', 'lattice', 'ash', 'graphite', 'slate', 'obsidian', 'harbor', 'signal'];

async function allTypes(page, wrapped = false) {
    await openEmber(page);
    await page.evaluate(async wrapped => {
        const h = window.canvasHarness, { fixtureGraph } = await import('/tests/helpers/workflow-fixtures.mjs');
        const graph = fixtureGraph('structured-guidance'), cleanup = fixtureGraph('literal-cleanup'), planning = fixtureGraph('native-guidance');
        graph.id = 'artifact-pin-design'; graph.name = 'Artifact pin design';
        Object.assign(graph.nodes, cleanup.nodes, { 'scene-context': planning.nodes['scene-context'], 'response-plan': planning.nodes['response-plan'] });
        for (const [id, wire] of Object.entries(cleanup.wires)) graph.wires['cleanup-' + id] = { ...wire, id: 'cleanup-' + id };
        graph.wires['context-plan'] = { id: 'context-plan', route: 'wire', from: 'scene-context', fromPort: 'out', to: 'response-plan', toPort: 'in' };
        if (wrapped) graph.nodes['compose-json'].sections[0].name = 'LongSceneInputLabelThatWrapsOntoSeveralLines';
        Object.values(graph.nodes).forEach((node, index) => Object.assign(node, { x: 30 + index % 4 * 265, y: 25 + Math.floor(index / 4) * 135 }));
        await h.activate(graph); await h.view({ x: 0, y: 0, zoom: 1 });
    }, wrapped);
    for (const name of ['Toggle Details Panel']) {
        const toggle = page.getByRole('button', { name, exact: true });
        if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click();
    }
    const collapse = page.getByRole('button', { name: 'Collapse preview', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    await page.evaluate(() => window.canvasHarness.settle());
}

async function pinState(page) {
    return page.evaluate(() => {
        const h = window.canvasHarness, zoom = h.canvas.view.zoom;
        const textContext = document.createElement('canvas').getContext('2d');
        const inkCenter = label => {
            const style = getComputedStyle(label); textContext.font = style.font;
            const metrics = textContext.measureText(label.textContent);
            const probe = document.createElement('span');
            probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
            label.prepend(probe); const first = probe.getBoundingClientRect().top; probe.remove();
            label.append(probe); const last = probe.getBoundingClientRect().top; probe.remove();
            return (first + last + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) * zoom) / 2;
        };
        const pins = [...document.querySelectorAll('.pc-node-native .pc-port')].map(pin => {
            const row = pin.closest('.pc-native-row'), label = row.querySelector('.pc-native-pin-label');
            const glyph = pin.querySelector('[data-glyph]'), svg = pin.querySelector('svg');
            const box = pin.getBoundingClientRect(), glyphBox = svg.getBoundingClientRect();
            const wrapped = label.getBoundingClientRect().height / zoom > 24;
            const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            const endpoint = h.canvas.endpoint(pin.dataset.node, pin.dataset.dir, pin.dataset.port);
            const screen = new DOMPoint(endpoint.x, endpoint.y).matrixTransform(document.querySelector('.pc-wires').getScreenCTM());
            return { kind: pin.dataset.kind, shape: glyph.innerHTML, scale: glyph.getAttribute('transform'), color: getComputedStyle(glyph).fill,
                hit: { width: box.width / zoom, height: box.height / zoom },
                glyphCenterError: Math.hypot(glyphBox.x + glyphBox.width / 2 - center.x, glyphBox.y + glyphBox.height / 2 - center.y),
                // A single-line label has one metrics envelope. Wrapped ink
                // uses the independent known-line regression below instead.
                labelError: wrapped || getComputedStyle(label).display === 'none' ? null : center.y - inkCenter(label),
                endpointError: Math.hypot(screen.x - center.x, screen.y - center.y),
                wrapped };
        });
        return { pins, positions: Object.values(h.graph.nodes).map(node => [node.id, node.x, node.y]),
            wires: [...document.querySelectorAll('.pc-wires .pc-wire-native[data-id]')].map(wire => ({ kind: wire.dataset.kind, color: getComputedStyle(wire).stroke })) };
    });
}

test('all eight themes and custom corner styles keep the approved seven glyphs and matched wire colors', async ({ page }, testInfo) => {
    await allTypes(page);
    const initial = await pinState(page);
    expect([...new Set(initial.pins.map(pin => pin.kind))].sort()).toEqual([...kinds].sort());
    const shapes = Object.fromEntries(initial.pins.map(pin => [pin.kind, pin.shape]));
    for (const preset of presets) {
        await page.evaluate(async preset => {
            const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
            T.setPreset(preset); T.setStyle('shape', 'sharp'); await h.settle();
        }, preset);
        const state = await pinState(page);
        expect(state.positions).toEqual(initial.positions);
        for (const pin of state.pins) {
            expect(pin.shape, preset + ' ' + pin.kind).toBe(shapes[pin.kind]);
            expect(pin.scale).toBe('scale(0.5625)');
            expect(pin.hit.width).toBeCloseTo(24, 4); expect(pin.hit.height).toBeCloseTo(24, 4);
            expect(pin.glyphCenterError).toBeLessThan(.02); expect(pin.endpointError).toBeLessThan(.05);
            if (pin.labelError !== null) expect(Math.abs(pin.labelError), preset + ' label ink').toBeLessThan(.1);
        }
        for (const wire of state.wires) expect(wire.color).toBe(state.pins.find(pin => pin.kind === wire.kind).color);
        const triangle = await page.locator('.pc-port[data-kind="patches"] polygon').first().getAttribute('points');
        expect(triangle.trim().split(/\s+/)).toHaveLength(3);
        if (['ember', 'harbor', 'signal'].includes(preset)) {
            await page.evaluate(async () => { const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version); T.setStyle('shape', 'rounded'); await h.settle(); });
            await page.screenshot({ path: testInfo.outputPath(preset + '-approved-artifact-pins.png'), animations: 'disabled' });
        }
    }
});

test('wrapped labels, font changes and nonidentity zooms retain optical pin and wire alignment', async ({ page }) => {
    await allTypes(page, true);
    const initial = await pinState(page);
    expect(initial.pins.some(pin => pin.wrapped)).toBe(true);
    for (const font of ['sans', 'round', 'serif', 'mono', 'theme']) {
        for (const zoom of [.73, 1, 1.35]) {
            await page.evaluate(async ({ font, zoom }) => {
                const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
                T.setStyle('font', font); await document.fonts.ready; await h.view({ x: 0, y: 0, zoom });
                document.fonts.dispatchEvent(new Event('loadingdone')); await h.settle();
            }, { font, zoom });
            const state = await pinState(page);
            expect(state.positions).toEqual(initial.positions);
            for (const pin of state.pins) {
                expect(pin.hit.width).toBeCloseTo(24, 3); expect(pin.hit.height).toBeCloseTo(24, 3);
                expect(pin.endpointError, font + ' wire anchor at zoom ' + zoom).toBeLessThan(.1);
                if (pin.labelError !== null) expect(Math.abs(pin.labelError), font + ' label at zoom ' + zoom).toBeLessThan(.1);
            }
        }
    }
});

test('wrapped lowercase and uppercase lines align against their own visible ink', async ({ page }) => {
    await openEmber(page);
    const result = await page.evaluate(async () => {
        const h = window.canvasHarness, { alignCardPins } = await import('/src/canvas/pin-alignment.js?v=' + h.version);
        await h.view({ x: 0, y: 0, zoom: 1 });
        const card = document.querySelector('.pc-node-native:not(.pc-node-compact)');
        const label = card.querySelector('.pc-native-pin-label'), pin = label.closest('.pc-native-row').querySelector('.pc-port');
        const before = [h.graph.nodes[card.dataset.id].x, h.graph.nodes[card.dataset.id].y];
        label.textContent = 'xxxx WWWW';
        label.style.cssText = 'font:12px/1.35 Arial;width:48px;flex:none';
        alignCardPins(card, 1);
        const textNode = label.firstChild, range = document.createRange();
        range.setStart(textNode, 0); range.setEnd(textNode, 4); const firstLine = range.getBoundingClientRect();
        range.setStart(textNode, 5); range.setEnd(textNode, 9); const lastLine = range.getBoundingClientRect();
        const baseline = atStart => {
            const probe = document.createElement('span');
            probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
            if (atStart) label.prepend(probe); else label.append(probe);
            const y = probe.getBoundingClientRect().top; probe.remove(); return y;
        };
        const context = document.createElement('canvas').getContext('2d');
        context.font = '12px Arial';
        // These two known rendered lines provide an independent oracle: the
        // capitals on the bottom line cannot extend the first line's top ink.
        const top = baseline(true) - context.measureText('xxxx').actualBoundingBoxAscent;
        const bottom = baseline(false) + context.measureText('WWWW').actualBoundingBoxDescent;
        const box = pin.getBoundingClientRect(), glyph = pin.querySelector('svg').getBoundingClientRect();
        return { lines: lastLine.top > firstLine.top, error: box.y + box.height / 2 - (top + bottom) / 2,
            glyphError: glyph.y + glyph.height / 2 - (top + bottom) / 2,
            before, after: [h.graph.nodes[card.dataset.id].x, h.graph.nodes[card.dataset.id].y] };
    });
    expect(result.lines).toBe(true);
    expect(Math.abs(result.error)).toBeLessThan(.1);
    expect(Math.abs(result.glyphError)).toBeLessThan(.1);
    expect(result.after).toEqual(result.before);
});
