import { test, expect } from '@playwright/test';

async function arrangeBackwardWire(page, targetAbove) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness);
    await page.evaluate(async targetAbove => {
        const h = window.canvasHarness;
        await h.reset(2, 2);
        Object.assign(h.graph.nodes.n0, { x: 700, y: targetAbove ? 560 : 80, title: 'Source' });
        Object.assign(h.graph.nodes.n1, { x: 260, y: targetAbove ? 80 : 560, title: 'Target' });
        h.S.touchGraph(h.graph);
        h.UI.refreshIfOpen();
        await h.settle();
    }, targetAbove);
    for (const name of ['Toggle Details Panel']) {
        const toggle = page.getByRole('button', { name, exact: true });
        if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click();
    }
    const collapse = page.getByRole('button', { name: 'Collapse preview', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    await page.evaluate(() => window.canvasHarness.view({ x: 0, y: 0, zoom: .73 }));
}

async function arrangeSteepForwardWire(page, targetAbove) {
    await arrangeBackwardWire(page, targetAbove);
    await page.evaluate(async targetAbove => {
        const h = window.canvasHarness;
        Object.assign(h.graph.nodes.n0, { x: 220, y: targetAbove ? 550 : 90 });
        Object.assign(h.graph.nodes.n1, { x: 700, y: targetAbove ? 90 : 550 });
        h.S.touchGraph(h.graph);
        h.UI.refreshIfOpen();
        await h.settle();
        const wire = h.canvas.graph.wires.w1;
        const pin = (node, direction, port) => {
            const card = h.canvas.nodeLayer.querySelector(`.pc-node-native[data-id="${node}"]`);
            const rect = card.querySelector(`.pc-port[data-dir="${direction}"][data-port="${port}"]`).getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        };
        const output = pin(wire.from, 'out', wire.fromPort), input = pin(wire.to, 'in', wire.toPort);
        // Position the visible native pins rather than relying on card widths or
        // port row offsets. This is the steep forward layout that formed hooks.
        h.graph.nodes.n1.x += 100 - (input.x - output.x) / h.canvas.view.zoom;
        h.graph.nodes.n1.y += (targetAbove ? -300 : 300) - (input.y - output.y) / h.canvas.view.zoom;
        h.S.touchGraph(h.graph);
        h.UI.refreshIfOpen();
        await h.settle();
    }, targetAbove);
}

async function renderedWire(page) {
    return page.evaluate(() => {
        const { canvas } = window.canvasHarness;
        const path = canvas.svg.querySelector('.pc-wire[data-id="w1"]');
        const hit = canvas.svg.querySelector('.pc-wire-hit[data-id="w1"]');
        const label = canvas.svg.querySelector('.pc-wire-label');
        const length = path.getTotalLength(), matrix = path.getScreenCTM();
        const graphPoint = distance => {
            const p = path.getPointAtLength(distance);
            return { x: p.x, y: p.y };
        };
        const screenPoint = distance => {
            const p = graphPoint(distance), s = new DOMPoint(p.x, p.y).matrixTransform(matrix);
            return { x: s.x, y: s.y };
        };
        const wire = canvas.graph.wires.w1;
        const pin = (node, direction, port) => {
            const card = canvas.nodeLayer.querySelector(`.pc-node-native[data-id="${node}"]`);
            const rect = card.querySelector(`.pc-port[data-dir="${direction}"][data-port="${port}"]`).getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        };
        const labelPoint = { x: Number(label.getAttribute('x')), y: Number(label.getAttribute('y')) };
        const samples = Array.from({ length: 2001 }, (_, index) => graphPoint(length * index / 2000));
        const middleSlopes = Array.from({ length: 61 }, (_, index) => {
            const at = length * (.2 + index / 100);
            const before = graphPoint(at - 4), after = graphPoint(at + 4);
            return Math.abs(after.y - before.y) / Math.hypot(after.x - before.x, after.y - before.y);
        });
        const tokens = path.getAttribute('d').match(/[MLC]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi);
        let index = 0, point;
        const geometry = [];
        const read = () => ({ x: Number(tokens[index++]), y: Number(tokens[index++]) });
        while (index < tokens.length) {
            const command = tokens[index++];
            if (command === 'M') point = read();
            else {
                const controls = command === 'C' ? [read(), read()] : [];
                const end = read();
                geometry.push({ command, start: point, controls, end });
                point = end;
            }
        }
        const departureLead = geometry[0], arrivalLead = geometry.at(-1);
        const sourceTurn = geometry[1], targetTurn = geometry.at(-2);
        const middle = geometry[2], vertical = Math.sign(middle.end.y - middle.start.y) || 1;
        const middleAngle = Math.atan2((middle.end.y - middle.start.y) * vertical, middle.end.x - middle.start.x);
        const endpointTurns = [sourceTurn, targetTurn].map((turn, turnIndex) => {
            // Native SVG samples catch the shape painted by the browser, including
            // a tiny reversal confined to either compact endpoint turn.
            const localPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            localPath.setAttribute('d', `M ${turn.start.x},${turn.start.y} C ${[...turn.controls, turn.end].map(point => `${point.x},${point.y}`).join(' ')}`);
            const turnLength = localPath.getTotalLength();
            const points = Array.from({ length: 161 }, (_, index) => localPath.getPointAtLength(turnLength * index / 160));
            const tangents = points.slice(1).map((point, index) => ({ x: point.x - points[index].x, y: point.y - points[index].y }));
            const angles = tangents.map(tangent => Math.atan2(tangent.y * vertical, tangent.x));
            const rotation = turnIndex === 0 ? 1 : -1;
            return {
                minimumStepX: Math.min(...tangents.map(tangent => tangent.x)),
                angleOvershoot: Math.max(...angles.map(angle => Math.max(-angle, angle - middleAngle))),
                angleReversal: Math.max(0, ...angles.slice(1).map((angle, index) => (angles[index] - angle) * rotation)),
            };
        });
        return {
            d: path.getAttribute('d'), hitD: hit.getAttribute('d'),
            start: screenPoint(0), departure: screenPoint(5), arrival: screenPoint(length - 5), end: screenPoint(length),
            graphStart: graphPoint(0), graphEnd: graphPoint(length),
            verticalDeviation: Math.max(...samples.map(p => Math.abs(p.y - graphPoint(0).y))),
            output: pin(wire.from, 'out', wire.fromPort), input: pin(wire.to, 'in', wire.toPort),
            middleVerticalFraction: Math.min(...middleSlopes),
            labelDistance: Math.min(...samples.map(p => Math.hypot(p.x - labelPoint.x, p.y - labelPoint.y))),
            departureLead: { x: departureLead.end.x - departureLead.start.x, y: departureLead.end.y - departureLead.start.y },
            arrivalLead: { x: arrivalLead.start.x - arrivalLead.end.x, y: arrivalLead.start.y - arrivalLead.end.y },
            middleIsLine: geometry[2]?.command === 'L',
            endpointTurns,
            turnRadius: Math.max(...[
                ...[...sourceTurn.controls, sourceTurn.end].map(point => Math.hypot(point.x - sourceTurn.start.x, point.y - sourceTurn.start.y)),
                ...[targetTurn.start, ...targetTurn.controls].map(point => Math.hypot(point.x - targetTurn.end.x, point.y - targetTurn.end.y)),
            ]),
        };
    });
}

function expectDirectRoute(wire) {
    expect(wire.departureLead.x, 'output lead extends 25 graph pixels to the right').toBeCloseTo(25, 5);
    expect(wire.departureLead.y, 'output lead stays horizontal').toBeCloseTo(0, 5);
    expect(wire.arrivalLead.x, 'input lead extends 25 graph pixels to the left').toBeCloseTo(-25, 5);
    expect(wire.arrivalLead.y, 'input lead stays horizontal').toBeCloseTo(0, 5);
    expect(wire.middleIsLine, 'compact turns frame a literal direct middle span').toBe(true);
    expect(wire.turnRadius, 'rounded turns stay close to the lead ends').toBeLessThanOrEqual(15);
}

for (const targetAbove of [true, false]) {
    const direction = targetAbove ? 'above' : 'below';
    test(`native steep forward endpoint turns toward a target ${direction} never hook or overshoot`, async ({ page }, testInfo) => {
        await arrangeSteepForwardWire(page, targetAbove);
        await expect(page.locator('.pc-node-native')).toHaveCount(2);
        const wire = await renderedWire(page);
        expectDirectRoute(wire);
        expect(wire.graphEnd.x - wire.graphStart.x, 'visible native pins reproduce the 100px forward gap').toBeCloseTo(100, 1);
        expect(Math.abs(wire.graphEnd.y - wire.graphStart.y), 'visible native pins reproduce the 300px steep rise').toBeCloseTo(300, 1);
        expect(Math.hypot(wire.start.x - wire.output.x, wire.start.y - wire.output.y), 'wire begins at its native output pin').toBeLessThanOrEqual(1);
        expect(Math.hypot(wire.end.x - wire.input.x, wire.end.y - wire.input.y), 'wire ends at its native input pin').toBeLessThanOrEqual(1);
        expect(wire.hitD, 'hit target follows the painted steep cable').toBe(wire.d);
        expect(wire.labelDistance, 'wire label remains on the visible steep cable').toBeLessThan(1);
        await page.locator('.pc-canvas').screenshot({ path: testInfo.outputPath(`steep-forward-${direction}.png`) });
        for (const [index, turn] of wire.endpointTurns.entries()) {
            const name = index === 0 ? 'source' : 'target';
            expect.soft(turn.minimumStepX, `${name} compact turn never hooks backward`).toBeGreaterThanOrEqual(-.0001);
            expect.soft(turn.angleOvershoot, `${name} tangent stays between horizontal and the straight middle angle`).toBeLessThan(.005);
            expect.soft(turn.angleReversal, `${name} tangent rotates once without an S-shaped inflection`).toBeLessThan(.005);
        }
    });
}

test('native level backward wires keep a compact return at different horizontal separations', async ({ page }, testInfo) => {
    await arrangeBackwardWire(page, false);
    let previousGap = 0;
    for (const separation of [300, 520, 820]) {
        await page.evaluate(async separation => {
            const h = window.canvasHarness;
            Object.assign(h.graph.nodes.n0, { x: 320 + separation, y: 250 });
            Object.assign(h.graph.nodes.n1, { x: 320, y: 250 });
            h.S.touchGraph(h.graph);
            h.UI.refreshIfOpen();
            await h.settle();
            const wire = h.canvas.graph.wires.w1;
            const pinY = (node, direction, port) => {
                const card = h.canvas.nodeLayer.querySelector(`.pc-node-native[data-id="${node}"]`);
                const rect = card.querySelector(`.pc-port[data-dir="${direction}"][data-port="${port}"]`).getBoundingClientRect();
                return rect.y + rect.height / 2;
            };
            h.graph.nodes.n1.y += (pinY(wire.from, 'out', wire.fromPort) - pinY(wire.to, 'in', wire.toPort)) / h.canvas.view.zoom;
            h.S.touchGraph(h.graph);
            h.UI.refreshIfOpen();
            await h.settle();
        }, separation);
        await page.evaluate(() => window.canvasHarness.view({ x: 0, y: 0, zoom: .73 }));
        const wire = await renderedWire(page);
        expectDirectRoute(wire);
        const gap = wire.graphStart.x - wire.graphEnd.x;
        expect(gap, 'each layout increases the backward pin separation').toBeGreaterThan(previousGap + 150);
        previousGap = gap;
        expect(Math.abs(wire.graphStart.y - wire.graphEnd.y), 'both pins are level in graph space').toBeLessThan(1);
        expect(Math.hypot(wire.start.x - wire.output.x, wire.start.y - wire.output.y), 'wire begins at the visible output pin').toBeLessThanOrEqual(1);
        expect(Math.hypot(wire.end.x - wire.input.x, wire.end.y - wire.input.y), 'wire ends at the visible input pin').toBeLessThanOrEqual(1);
        expect(wire.departure.x).toBeGreaterThan(wire.start.x);
        expect(Math.abs(wire.departure.y - wire.start.y), 'output lead remains horizontal').toBeLessThan(1);
        expect(wire.end.x).toBeGreaterThan(wire.arrival.x);
        expect(Math.abs(wire.end.y - wire.arrival.y), 'input lead remains horizontal').toBeLessThan(1);
        expect(wire.verticalDeviation, `level return at a ${Math.round(gap)}px pin separation stays six pixels shallow`).toBeLessThanOrEqual(7);
        expect(wire.hitD, 'hit target follows the visible cable').toBe(wire.d);
        expect(wire.labelDistance, 'wire kind label is anchored on the visible curve').toBeLessThan(1);
        await page.evaluate(() => window.canvasHarness.view({ x: 75, y: 60, zoom: .95 }));
        const clip = await page.evaluate(() => {
            const { canvas } = window.canvasHarness;
            const elements = [canvas.svg.querySelector('.pc-wire[data-id="w1"]'), ...canvas.nodeLayer.querySelectorAll('.pc-node-native')];
            const bounds = elements.map(element => element.getBoundingClientRect());
            const x = Math.max(0, Math.floor(Math.min(...bounds.map(rect => rect.left))) - 24);
            const y = Math.max(0, Math.floor(Math.min(...bounds.map(rect => rect.top))) - 24);
            const right = Math.min(innerWidth, Math.ceil(Math.max(...bounds.map(rect => rect.right))) + 24);
            const bottom = Math.min(innerHeight, Math.ceil(Math.max(...bounds.map(rect => rect.bottom))) + 24);
            return { x, y, width: right - x, height: bottom - y };
        });
        await page.screenshot({ path: testInfo.outputPath(`level-backward-${Math.round(gap)}.png`), clip });
        await page.evaluate(() => window.canvasHarness.view({ x: 85, y: 35, zoom: 1.1 }));
        const zoomed = await renderedWire(page);
        expect(zoomed.d, 'zoom preserves the graph-space cable route').toBe(wire.d);
        expect(zoomed.hitD).toBe(zoomed.d);
        expect(zoomed.labelDistance).toBeLessThan(1);
        expect(zoomed.verticalDeviation).toBeCloseTo(wire.verticalDeviation, 3);
    }
});

for (const targetAbove of [true, false]) {
    const direction = targetAbove ? 'above' : 'below';
    test(`native backward wire to a target far ${direction} follows a direct diagonal middle`, async ({ page }, testInfo) => {
        await arrangeBackwardWire(page, targetAbove);
        const wire = await renderedWire(page);
        expectDirectRoute(wire);
        expect(wire.input.x).toBeLessThan(wire.output.x);
        expect(Math.abs(wire.input.y - wire.output.y)).toBeGreaterThan(300);
        expect(Math.hypot(wire.start.x - wire.output.x, wire.start.y - wire.output.y), 'wire begins at the visible output pin').toBeLessThanOrEqual(1);
        expect(Math.hypot(wire.end.x - wire.input.x, wire.end.y - wire.input.y), 'wire ends at the visible input pin').toBeLessThanOrEqual(1);
        expect(wire.departure.x).toBeGreaterThan(wire.start.x);
        expect(Math.abs(wire.departure.y - wire.start.y), 'output lead remains horizontal').toBeLessThan(1);
        expect(wire.end.x).toBeGreaterThan(wire.arrival.x);
        expect(Math.abs(wire.end.y - wire.arrival.y), 'input lead remains horizontal').toBeLessThan(1);
        // A steep returning cable should keep changing height through its middle;
        // a horizontal join creates the visible shelf reported for this layout.
        expect(wire.middleVerticalFraction, 'the middle does not flatten into a shelf').toBeGreaterThan(.2);
        expect(wire.hitD, 'hit target follows the visible cable').toBe(wire.d);
        expect(wire.labelDistance, 'wire kind label is anchored on the visible curve').toBeLessThan(1);
        await page.locator('.pc-canvas').screenshot({ path: testInfo.outputPath(`backward-${direction}.png`) });
        await page.evaluate(() => window.canvasHarness.view({ x: 85, y: 35, zoom: 1.1 }));
        const zoomed = await renderedWire(page);
        expect(zoomed.d, 'zoom preserves the graph-space cable route').toBe(wire.d);
        expect(zoomed.hitD).toBe(zoomed.d);
        expect(zoomed.labelDistance).toBeLessThan(1);
    });
}
