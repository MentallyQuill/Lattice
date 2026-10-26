import { test, expect } from '@playwright/test';

async function completedMeters(page) {
    await page.goto('/tests/browser/harness.html');
    await page.waitForFunction(() => !!window.canvasHarness?.canvas);
    await page.addStyleTag({ content: '#pc-sendbar.pc-chat-launcher { opacity: 1 !important; } .pc-chat-progress-fading { animation: none !important; opacity: 1 !important; } .pc-chat-progress-pixel, .pc-run-pixel { animation: none !important; box-shadow: none !important; filter: none !important; }' });
    await page.evaluate(async () => {
        const h = window.canvasHarness;
        await h.reset(36);
        h.canvas.select({ kind: 'node', id: 'n35' });
        const left = document.getElementById('leftSendForm');
        left.hidden = false;
        left.style.cssText = 'position:fixed;bottom:16.3px;left:12.3px;z-index:99999;display:flex';
        await h.settle();
    });
    await page.locator('.pc-output-preview [data-run-here]').click();
    await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');
    await expect(page.locator('.pc-chat-progress-percent')).toHaveText('100%');
}

async function paintedRuns(page, grid) {
    const box = await grid.boundingBox();
    // Crisp SVG edges can extend a fraction beyond the layout box; include their full paint.
    const name = (await grid.getAttribute('class')).split(' ')[0];
    const ratio = await page.evaluate(() => devicePixelRatio);
    const png = await page.screenshot({ path: `.tmp/pixel-grid-${name}-${ratio}.png`, clip: { x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 } });
    return page.evaluate(async base64 => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, image.width, image.height);
        const rows = [];
        for (let y = 0; y < image.height; y++) {
            const runs = [];
            for (let x = 0; x < image.width; x++) {
                const offset = (y * image.width + x) * 4;
                if (data[offset] === 138 && data[offset + 1] === 173 && data[offset + 2] === 150) {
                    const previous = runs.at(-1);
                    if (previous && previous.end === x) previous.end++;
                    else runs.push({ start: x, end: x + 1 });
                }
            }
            if (runs.length) rows.push({ y, runs });
        }
        return rows;
    }, png.toString('base64'));
}

for (const ratio of [1.25, 1, 1.5, 1.75, 2, 2.625]) {
    test(`both pixel meters paint equal square cells and gaps at ${ratio}x display scale`, async ({ browser }) => {
        const context = await browser.newContext({ deviceScaleFactor: ratio, viewport: { width: 1200, height: 900 } });
        const page = await context.newPage();
        try {
            await completedMeters(page);
            for (const selector of ['.pc-chat-progress-pixels', '.pc-run-meter-pixels']) {
                const rows = await paintedRuns(page, page.locator(selector));
                const cell = Math.round(4 * ratio), gap = Math.round(2 * ratio);
                expect(rows.length, selector + ' painted height').toBe(3 * cell);
                for (const { runs } of rows) {
                    expect(runs.length, selector + ' column count').toBe(12);
                    expect(runs.map(run => run.end - run.start), selector + ' equal cell widths').toEqual(Array(12).fill(cell));
                    expect(runs.slice(1).map((run, index) => run.start - runs[index].end), selector + ' equal horizontal gaps').toEqual(Array(11).fill(gap));
                }
                const verticalGaps = rows.slice(1).map((row, index) => row.y - rows[index].y - 1).filter(value => value > 0);
                expect(verticalGaps, selector + ' equal vertical gaps').toEqual([gap, gap]);
            }
        } finally { await context.close(); }
    });
}

test('both meters realign when display scale changes without another workflow event', async ({ page }) => {
    await completedMeters(page);
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1.75, mobile: false });
    await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(1.75);
    for (const selector of ['.pc-chat-progress-pixels', '.pc-run-meter-pixels']) {
        await expect.poll(() => page.locator(selector).evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(130 / 1.75, 1);
        const widths = await page.locator(selector).evaluate(element => [...element.querySelectorAll('rect')].map(pixel => pixel.getBoundingClientRect().width * devicePixelRatio));
        for (const width of widths) expect(width).toBeCloseTo(7, 1);
    }
});
