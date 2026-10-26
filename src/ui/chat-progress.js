import { createRunState, reduceRunState, projectRunRows } from '../workflow/run-state.js?v=0.28.1';
import { alignPixelGrid } from './pixel-grid.js?v=0.28.1';

/** Retain live run progress independently of the optional chat launcher. */
export function createChatProgress({ document, subscribeActivity, subscribeEvents }) {
    const root = document.createElement('span');
    root.className = 'pc-chat-progress';
    root.hidden = true;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    const pixels = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pixels.setAttribute('class', 'pc-chat-progress-pixels');
    pixels.setAttribute('aria-hidden', 'true');
    const percent = document.createElement('span');
    percent.className = 'pc-chat-progress-percent';
    percent.setAttribute('aria-hidden', 'true');
    root.append(pixels, percent);
    const alignment = alignPixelGrid(pixels);
    let state = null, disposed = false, fadeStarted = null, fadeTimer = null;

    function fade() {
        if (!state || root.hidden || fadeStarted !== null) return;
        fadeStarted = Date.now();
        root.classList.add('pc-chat-progress-fading');
        const runId = state.runId;
        fadeTimer = setTimeout(() => {
            if (disposed || state?.runId !== runId) return;
            root.hidden = true;
            fadeTimer = null;
        }, 3000);
    }

    function render() {
        if (!state) return;
        const included = state.nodes.filter(node => node.included);
        const skipped = included.filter(node => node.status === 'skipped').length;
        const finished = included.filter(node => node.status === 'completed').length + skipped;
        percent.textContent = state.plan ? (state.status === 'completed' ? 100 : Math.min(99, included.length ? Math.floor(finished / included.length * 100) : 0)) + '%' : '—';
        root.dataset.status = state.status === 'empty' ? 'waiting' : state.status;
        const description = `Workflow stage progress. ${root.dataset.status}. ${finished} of ${included.length} stages finished. ${skipped} skipped.`;
        root.title = description;
        root.setAttribute('aria-label', description);
        let rows = state.plan ? projectRunRows(state) : [{ status: 'waiting' }];
        if (rows.length > 36) {
            const remaining = rows.slice(35);
            const priority = ['cancelling', 'running', 'failed', 'blocked', 'cancelled', 'invalid', 'stale', 'unresolved', 'queued', 'waiting', 'not-run'];
            const status = priority.find(value => remaining.some(row => row.status === value)) ?? (remaining.every(row => row.status === 'skipped') ? 'skipped' : 'completed');
            rows = [...rows.slice(0, 35), { status }];
        }
        pixels.replaceChildren(...rows.map(row => {
            const pixel = document.createElementNS(pixels.namespaceURI, 'rect');
            pixel.setAttribute('class', 'pc-chat-progress-pixel');
            pixel.dataset.status = row.status;
            return pixel;
        }));
        alignment.update();
    }

    const unsubscribeActivity = subscribeActivity(activity => {
        if (disposed) return;
        if (!activity?.busy) { fade(); return; }
        if (!activity.runId) return;
        if (state?.runId !== activity.runId) {
            state = createRunState(activity.runId);
            clearTimeout(fadeTimer); fadeTimer = null; fadeStarted = null;
            root.classList.remove('pc-chat-progress-fading');
            root.style.removeProperty('--pc-chat-progress-fade-elapsed');
            root.hidden = !state;
        }
        render();
    });
    const unsubscribeEvents = subscribeEvents(event => {
        if (disposed) return;
        const next = reduceRunState(state, event);
        if (next === state) return;
        state = next;
        render();
        if (['completed', 'unresolved', 'failed', 'cancelled', 'invalid', 'stale'].includes(state.status)) fade();
    });

    return {
        mount(button) {
            if (disposed) return;
            root.remove();
            if (fadeStarted !== null) root.style.setProperty('--pc-chat-progress-fade-elapsed', -(Date.now() - fadeStarted) + 'ms');
            button?.append(root);
            alignment.update();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            clearTimeout(fadeTimer);
            alignment.destroy();
            unsubscribeActivity(); unsubscribeEvents(); root.remove();
        },
    };
}
