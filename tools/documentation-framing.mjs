// Capture a control or a connected group directly from the running UI.
// Union crops keep several related controls together without blank canvas.
export async function screenshotRegion(page, path, selectors, padding = 16) {
    if (!selectors) { await page.screenshot({ path, animations: 'disabled' }); return { kind: 'workspace' }; }
    const selector = Array.isArray(selectors) ? selectors.join(', ') : selectors;
    await page.locator(selector).first().waitFor({ state: 'visible' });
    const clip = await page.locator(selector).evaluateAll((elements, padding) => {
        const boxes = elements.map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
        if (!boxes.length) throw Error('No visible documentation targets.');
        const x = Math.max(0, Math.floor(Math.min(...boxes.map(rect => rect.left)) - padding));
        const y = Math.max(0, Math.floor(Math.min(...boxes.map(rect => rect.top)) - padding));
        const right = Math.min(innerWidth, Math.ceil(Math.max(...boxes.map(rect => rect.right)) + padding));
        const bottom = Math.min(innerHeight, Math.ceil(Math.max(...boxes.map(rect => rect.bottom)) + padding));
        if (right <= x || bottom <= y) throw Error('Documentation target is outside the viewport.');
        return { x, y, width: right - x, height: bottom - y };
    }, padding);
    await page.screenshot({ path, clip, animations: 'disabled' });
    return { kind: 'region', selector, ...clip };
}
