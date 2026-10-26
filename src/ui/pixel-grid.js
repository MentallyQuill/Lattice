/** Keep the three-row progress grid on whole device pixels at every zoom level. */
export function alignPixelGrid(svg) {
    const window = svg.ownerDocument.defaultView;
    let disposed = false;
    let resolution = null, resolutionRatio = null;

    function watchResolution(ratio) {
        if (!window?.matchMedia || resolutionRatio === ratio) return;
        resolution?.removeEventListener('change', update);
        resolutionRatio = ratio;
        resolution = window.matchMedia(`(resolution: ${ratio}dppx)`);
        resolution.addEventListener('change', update);
    }

    function update() {
        if (disposed) return;
        const deviceRatio = window?.devicePixelRatio;
        const ratio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
        const cell = Math.max(1, Math.round(4 * ratio));
        const gap = Math.round(2 * ratio);
        const pixels = [...svg.children].filter(child => child.localName === 'rect');
        const columns = Math.ceil(pixels.length / 3);
        // A transparent device pixel on each edge keeps viewport clipping away
        // from the crisp cells when the SVG starts at a fractional CSS position.
        const width = columns * cell + Math.max(0, columns - 1) * gap + 2;
        const height = 3 * cell + 2 * gap + 2;
        svg.setAttribute('shape-rendering', 'crispEdges');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('viewBox', `-1 -1 ${width} ${height}`);
        svg.style.width = `${width / ratio}px`;
        svg.style.height = `${height / ratio}px`;
        pixels.forEach((pixel, index) => {
            pixel.setAttribute('x', String(Math.floor(index / 3) * (cell + gap)));
            pixel.setAttribute('y', String(index % 3 * (cell + gap)));
            pixel.setAttribute('width', String(cell));
            pixel.setAttribute('height', String(cell));
        });
        watchResolution(ratio);
    }

    const observer = window?.MutationObserver ? new window.MutationObserver(update) : null;
    observer?.observe(svg, { childList: true });
    window?.addEventListener('resize', update);
    update();
    return {
        update,
        destroy() {
            if (disposed) return;
            disposed = true;
            observer?.disconnect();
            window?.removeEventListener('resize', update);
            resolution?.removeEventListener('change', update);
        },
    };
}
