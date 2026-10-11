import { graphPoint, zoomAt, zoomTo, wheelFactor, zoomShortcutFactor } from './canvas/camera.js?v=0.27.0';
import { createFrameScheduler } from './canvas/frame.js?v=0.27.0';
import { selectionMode, rectangle, intersects, combineSelection } from './canvas/selection.js?v=0.27.0';
import { createGeometryCache, indexIncidentWires } from './canvas/geometry.js?v=0.27.0';
import { nodeCards, preparedCardFor } from './canvas/presentation.js?v=0.27.0';
import { buildConnectionRoute, buildDragConnectionRoute } from './canvas/connection-route.js?v=0.27.0';
import { alignCardPins } from './canvas/pin-alignment.js?v=0.27.0';
import { isCommentFrame, containedCommentNodes } from './canvas/comment-frames.js?v=0.27.0';
import { retainSlots, cardLayoutKey } from './canvas/retained-scene.js?v=0.27.0';
import { mountCanvas } from '../dist/lattice-ui.js?v=0.27.0';
const groupOf = (graph, node) => node && graph?.groups?.[node.inGroup];
const inNodeProfile = event => event.target?.closest?.('.pc-node-profile');
const samePaintValues = (previous, next) => previous && previous.length === next.length && next.every((value, index) => value === previous[index]);
const samePaintMembers = (previous, next) => previous && previous.size === next.size && [...next].every(id => previous.has(id));

// Prepared cards expand catalog metadata beyond the authoring budget. Keep this
// draw-only traversal bounded independently; authoring admission stays unchanged.
function safePreparedGraph(graph) {
    // Retained authored text and prepared Note bodies may each consume the full
    // authoring allowance. Reserve another 8 KiB per admitted card for catalog,
    // named-pin and attachment metadata, while still bounding the entire DTO.
    const characterLimit = 2 * 2000000 + 1000 * 8192;
    let entries = 0, characters = 0;
    const active = new Set();
    const visit = (item, depth) => {
        if (++entries > 200000 || depth > 40) return false;
        if (typeof item === 'string') { characters += item.length; return characters <= characterLimit; }
        if (item === null || typeof item === 'boolean') return true;
        if (typeof item === 'number') return Number.isFinite(item);
        if (typeof item !== 'object' || active.has(item)) return false;
        if (![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(item))) return false;
        const properties = Object.getOwnPropertyDescriptors(item);
        active.add(item);
        for (const key of Reflect.ownKeys(properties)) {
            if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)
                || /^(api[_-]?key|api[_-]?token|access[_-]?token|token|password|secret|credentials?|authorization|headers?|provider|endpoint|base[_-]?url)$/i.test(key)
                || !('value' in properties[key]) || !visit(properties[key].value, depth + 1)) return false;
        }
        active.delete(item);
        return true;
    };
    try {
        const cards = Object.getOwnPropertyDescriptor(graph, 'nativeCards');
        if (cards && (!('value' in cards) || !cards.value || typeof cards.value !== 'object'
            || Array.isArray(cards.value) || Object.keys(Object.getOwnPropertyDescriptors(cards.value)).length > 1000)) return false;
        return visit(graph, 0);
    } catch { return false; }
}
/** Prepared named-pin rendering, cached geometry, camera and native interaction bridge. */
export class Canvas {

    constructor(host, hooks = {}) {
        this.host = host;
        this.hooks = hooks;
        this.graph = null;
        this.selection = null;      // {kind:'node'|'wire'|'group', id}
        this.multi = new Set();     // blocks picked with Shift-click or a Shift-drag box
        this.marquee = null;
        this.drag = null;
        this.nativeWireView = null;
        this.wireMulti = new Set();
        this.wireSelections = new Map();
        this.nativeCaptures = new Set();
        this.trace = null;
        this.mode = 'select';
        this.operationEpoch = 0;
        this.spaceDown = false;
        this.geometry = createGeometryCache();
        this.recallStatus = {};
        this.nodeProfiles = [];
        this.nodeProfileVersion = 0;
        this.nodeElements = new Map();
        this.layoutKeys = new Map(); this.dirtyGeometry = new Set(); this.observerSizes = new Map();
        this.cardSlots = new Map(); this.groupSlots = new Map(); this.commentSlots = new Map();
        this.layoutEpoch = 0; this.geometryEpoch = 0; this.paintRevision = 0;
        this.incident = new Map();
        this.wireViews = new Map(); this.publishedWireClasses = new Map();
        this.eventController = new window.AbortController();
        host.classList.add('pc-canvas');
        host.tabIndex = 0;
        host.innerHTML = '';
        this.layer = mountCanvas(host, {
            openRecallDetails: id => this.hooks.onRecallDetails?.(id),
            hostResult: id => this.hooks.onHostResult?.(this.graph?.nodes[id]),
            hoverPin: pin => { this.hoverPin = pin; this.#applyFocus(); },
            group: (id, action) => this.setCollapsed(id, action === 'collapse'),
            editProfile: (selection, value) => this.hooks.editProfile?.(selection, value) ?? { ok: false, error: { code: 'unavailable', message: 'Profile editing is unavailable' } },
            refreshProfiles: selection => this.hooks.refreshProfiles?.(selection),
        });
        this.viewport = this.layer.viewport; this.svg = this.layer.svg; this.nodeLayer = this.layer.nodeLayer; this.commentLayer = this.layer.commentLayer;
        this.frames = createFrameScheduler((flags, time) => {
            if (flags & 1) this.#paintCamera(time);
            if (flags & 2) this.#drawWires();
            if (flags & 8) this.#drawWirePreview();
            if (flags & 4) this.#renderDrag();
        });
        const Resize = globalThis.ResizeObserver ?? window.ResizeObserver;
        if (Resize) this.createResizeObserver = () => {
            const epoch = this.geometryEpoch;
            return new Resize(entries => {
            if (epoch !== this.geometryEpoch || this.eventController.signal.aborted) return;
            const changed = new Set();
            for (const entry of entries) {
                const id = entry.target.dataset.id ?? 'group:' + entry.target.dataset.group;
                if (this.nodeElements.get(id) !== entry.target || !this.host.contains(entry.target)) continue;
                const size = entry.contentRect && [entry.contentRect.width, entry.contentRect.height];
                const previous = this.observerSizes.get(id);
                if (size && previous && size.every((value, index) => Math.abs(value - previous[index]) < .6) && !this.dirtyGeometry.has(id)) continue;
                if (size) this.observerSizes.set(id, size);
                if (this.#measureCard(entry.target, id)) changed.add(id);
                this.dirtyGeometry.delete(id);
            }
            if (changed.size && this.graph) {
                this.#drawWires(changed, {groups:this.#groupCards(changed), nodeProfiles:this.#nodeProfileRows()});
            }
        });
        };
        this.resizeObserver = this.createResizeObserver?.();
        const layoutChanged = () => {
            if (!this.graph || this.eventController.signal.aborted) return;
            this.invalidateGeometry(Object.keys(this.graph.nodes), 'environment');
        };
        const Mutation = host.ownerDocument.defaultView.MutationObserver;
        if (Mutation) {
            this.layoutObserver = new Mutation(layoutChanged);
            const root = host.closest('.pc-root');
            for (const element of [host.ownerDocument.documentElement, root].filter(Boolean)) this.layoutObserver.observe(element, {attributes:true, attributeFilter:['style','class','data-pc-theme']});
        }
        const pointerMedia = window.matchMedia?.('(pointer: coarse)');
        pointerMedia?.addEventListener?.('change', layoutChanged, {signal:this.eventController.signal});
        this.#bind();
        const fonts = host.ownerDocument.fonts;
        const refreshFontGeometry = () => {
            if (!this.graph || this.eventController.signal.aborted) return;
            this.invalidateGeometry(Object.keys(this.graph.nodes), 'fonts');
        };
        fonts?.addEventListener?.('loadingdone', refreshFontGeometry, { signal: this.eventController.signal });
        fonts?.ready?.then(refreshFontGeometry);
    }

    async destroy() {
        this.cancelGesture();
        this.frames.destroy();
        this.resizeObserver?.disconnect(); this.layoutObserver?.disconnect();
        this.eventController.abort();
        await this.layer.destroy();
    }

    get view() {
        this.graph.view ??= { x: 0, y: 0, zoom: 1 };
        return this.graph.view;
    }

    setGraph(graph, options = {}) {
        if (!graph) return;
        if (!safePreparedGraph(graph)) throw new Error('Expected a prepared current workflow graph.');
        const admittedCards = nodeCards(Object.values(graph.nodes ?? {}).filter(n => !isCommentFrame(n)), {graph, hooks:this.hooks});
        this.cancelGesture('view-change', {render:false});
        // Cancellation restores coordinate overlays on a same-root raw caller.
        for (const card of admittedCards) { const node = graph.nodes[card.id]; card.x = node.x ?? 0; card.y = node.y ?? 0; }
        if (this.nativeSelectionKey) this.wireSelections.set(this.nativeSelectionKey, [...this.wireMulti]);
        const scope = this.hooks.nativeScope?.();
        const nativeSelectionKey = scope?.workflowId && Array.isArray(scope.instancePath) ? JSON.stringify([scope.workflowId, scope.instancePath]) : null;
        const legacyScopeKey = this.hooks.viewKey?.() ?? nativeSelectionKey ?? JSON.stringify([graph.id, []]);
        const detailScopeKey = options.viewKey ?? legacyScopeKey;
        if (detailScopeKey !== this.detailScopeKey) {
            this.trace = null; this.layer.setVisualStatus({}); this.hoverPin = null; this.hoverWire = null;
            this.geometry.clear(); this.wireViews.clear(); this.publishedWireClasses.clear(); this.layoutKeys.clear(); this.dirtyGeometry.clear();
            this.cardSlots.clear(); this.groupSlots.clear(); this.commentSlots.clear();
            this.geometryEpoch++; this.resizeObserver?.disconnect();
            this.resizeObserver = this.createResizeObserver?.();
            this.nodeElements.clear(); this.observerSizes.clear();
        }
        const lodScopeKey = options.lodKey ?? this.hooks.lodKey?.() ?? (this.graph && options.viewKey == null && graph.id === this.graph.id && legacyScopeKey === this.legacyScopeKey ? this.lodScopeKey : detailScopeKey);
        if (graph.id !== this.graph?.id || lodScopeKey !== this.lodScopeKey) delete this.host.dataset.pcDetail;
        this.lodScopeKey = lodScopeKey;
        this.detailScopeKey = detailScopeKey;
        this.legacyScopeKey = legacyScopeKey;
        this.nodeProfiles = []; this.nodeProfileVersion++;
        this.graph = graph; this.selection = null; this.multi.clear();
        if (scope?.workflowId && this.nativeSelectionRoot !== scope.workflowId) this.wireSelections.clear();
        this.nativeSelectionRoot = scope?.workflowId ?? this.nativeSelectionRoot;
        this.nativeSelectionKey = nativeSelectionKey;
        this.wireMulti = new Set((this.wireSelections.get(this.nativeSelectionKey) ?? []).filter(id => graph.wires[id]));
        this.nativeWireView = null; this.#renderScene(admittedCards);
    }

    /** Runtime display only: never prepare a graph, cancel a gesture or measure geometry. */
    setRecallStatus(status) { this.recallStatus = status; this.layer.setRecallStatus(status); }

    setTrace(trace) {
        this.trace = new Map((trace ?? []).map(t => [t.id, t]));
        this.layer.setVisualStatus(Object.fromEntries(this.trace));
    }

    setPreviewTarget(id) {
        this.layer.setPreviewTarget(id);
    }

    /** Accept prepared profile metadata; layout adds only cached native bounds. */
    setNodeProfiles(rows) {
        this.nodeProfiles = Array.isArray(rows) ? rows : [];
        this.nodeProfileVersion++;
        this.#drawNodeProfiles();
    }

    #drawNodeProfiles() { if (this.graph) this.layer.setNodeProfiles(this.#nodeProfileRows()); }

    #nodeProfileRows() {
        if (!this.graph) return [];
        const rect = this.host.getBoundingClientRect(), view = this.view, zoom = view.zoom || 1;
        const visibleBounds = { x: -view.x / zoom, y: -view.y / zoom, w: rect.width / zoom, h: rect.height / zoom };
        return this.nodeProfiles.flatMap(row => {
            const node = this.graph.nodes[row.id];
            if (!node || isCommentFrame(node) || this.#folded(node)) return [];
            return [{ ...row, x: node.x, y: node.y, w: this.widthOf(node), h: this.heightOf(node),
                clearance: node.presentation?.compact ? 38 : 0, authorityVersion: this.nodeProfileVersion, visibleBounds }];
        });
    }

    applyTransform(drawProfiles = true) {
        const v = this.view;
        // Change detail only at zoom thresholds, without rebuilding cards or
        // touching their intrinsic sizes and cached named-pin geometry.
        const detail = this.host.dataset.pcDetail;
        const next = v.zoom < .5 || detail === 'overview' && v.zoom < .6 ? 'overview' : 'full';
        if (detail !== next) { this.host.dataset.pcDetail = next; this.paintRevision++; }
        this.host.style.setProperty('--pc-recall-scale', String(Math.max(1, 0.625 / v.zoom)));
        this.viewport.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
        // The canvas background moves and scales with the graph. Each theme
        // background has its own layers, so each gets sizes to match.
        const s = 24 * v.zoom;
        const at = `${v.x}px ${v.y}px`;
        const grid = globalThis.document?.documentElement?.dataset?.pcGrid ?? 'dots';
        if (grid === 'lines') {
            this.host.style.backgroundSize = `${s}px ${s}px, ${s}px ${s}px, ${s * 5}px ${s * 5}px, ${s * 5}px ${s * 5}px`;
            this.host.style.backgroundPosition = `${at}, ${at}, ${at}, ${at}`;
        } else if (grid === 'paper') {
            this.host.style.backgroundSize = `${s * 1.5}px ${s * 1.5}px, 100% 100%`;
            this.host.style.backgroundPosition = `${at}, 0 0`;
        } else if (grid === 'scan') {
            this.host.style.backgroundSize = `auto, 100% 100%`;
            this.host.style.backgroundPosition = `0 0, 0 0`;
        } else {
            this.host.style.backgroundSize = `${s}px ${s}px`;
            this.host.style.backgroundPosition = at;
        }
        this.hooks.onView?.({ ...v, mode: this.mode });
        if (drawProfiles) this.#drawNodeProfiles();
    }

    toGraph(clientX, clientY) {
        const rect = this.gestureRect ?? this.host.getBoundingClientRect();
        return graphPoint(this.view, { x: clientX - rect.left, y: clientY - rect.top });
    }

    zoomBy(factor, clientX, clientY) {
        if (!this.graph) return;
        const rect = this.wheelRect ?? this.host.getBoundingClientRect();
        if (this.#queueZoom(factor, { x: clientX - rect.left, y: clientY - rect.top })) this.wheelRect = rect;
    }

    #queueZoom(factor, point) {
        // Accumulate input against the requested scale, while hit testing and
        // geometry continue to use the camera actually displayed this frame.
        const target = { ...this.view, zoom: this.zoomMotion?.to ?? this.view.zoom };
        if (!zoomAt(target, factor, point)) return false;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            this.zoomMotion = null;
            zoomTo(this.view, target.zoom, point);
        } else {
            this.zoomMotion = { from: this.view.zoom, to: target.zoom, point, start: null };
        }
        this.host.classList.add('pc-interacting');
        this.frames.schedule(1);
        clearTimeout(this.wheelTimer);
        this.wheelTimer = setTimeout(() => this.#finishZoom(), 180);
        return true;
    }

    #paintCamera(time) {
        const motion = this.zoomMotion;
        if (motion) {
            motion.start ??= time - 16;
            const progress = Math.max(0, Math.min(1, (time - motion.start) / 160));
            const eased = 1 - (1 - progress) ** 3;
            const zoom = progress === 1 ? motion.to : motion.from * (motion.to / motion.from) ** eased;
            zoomTo(this.view, zoom, motion.point);
            if (progress === 1) this.zoomMotion = null;
            else this.frames.schedule(1);
        }
        this.applyTransform();
    }

    #finishZoom(settle = true) {
        if (!this.wheelRect) return;
        clearTimeout(this.wheelTimer);
        const motion = this.zoomMotion;
        this.zoomMotion = null;
        if (motion && settle) {
            zoomTo(this.view, motion.to, motion.point);
            this.frames.schedule(1);
        }
        this.frames.flush();
        this.wheelRect = null;
        this.host.classList.remove('pc-interacting');
        this.hooks.onViewCommit?.();
    }

    fit({ avoidShelf = true } = {}) {
        this.#finishZoom(false);
        const boxes = Object.values(this.graph?.nodes ?? {}).filter(n => !this.#folded(n)).map(n => ({ x: n.x, y: n.y, w: this.widthOf(n), h: this.heightOf(n) || 160 }));
        for (const g of Object.values(this.graph?.groups ?? {})) {
            if (g.collapsed) boxes.push({ x: g.x, y: g.y, w: g.w || 260, h: this.geometry.get(`group:${g.id}`, 160) || 160 });
            else boxes.push(this.#nativeGroupFrame(g));
        }
        if (!boxes.length) return;
        const pad = 80;
        const minX = Math.min(...boxes.map(b => b.x)) - pad;
        const minY = Math.min(...boxes.map(b => b.y)) - pad;
        const maxX = Math.max(...boxes.map(b => b.x + b.w)) + pad;
        const maxY = Math.max(...boxes.map(b => b.y + b.h)) + pad;
        const rect = this.host.getBoundingClientRect();
        // The narrow shelf floats across the canvas. Fit frames below it, while
        // ordinary pan/zoom and node placement retain the entire canvas area.
        const shelf = this.host.parentElement?.querySelector('.pc-node-shelf');
        const shelfRect = shelf?.getBoundingClientRect();
        const topInset = shelfRect && shelfRect.width > rect.width / 2
            ? Math.min(Math.max(0, rect.height - 80), Math.max(0, shelfRect.bottom - rect.top + 16)) : 0;
        const leftInset = avoidShelf && shelfRect && shelfRect.width <= rect.width / 2
            ? Math.min(Math.max(0, rect.width - 80), Math.max(0, shelfRect.right - rect.left + 24)) : 0;
        const width = rect.width - leftInset;
        const height = rect.height - topInset;
        // A complete graph overview may need to zoom below the ordinary interaction floor.
        const zoom = Math.max(0.05, Math.min(1.2, Math.min(width / (maxX - minX), height / (maxY - minY))));
        const v = this.view;
        v.zoom = zoom;
        v.x = leftInset - minX * zoom + (width - (maxX - minX) * zoom) / 2;
        v.y = topInset - minY * zoom + (height - (maxY - minY) * zoom) / 2;
        this.applyTransform();
    }

    render() { this.#renderScene(); }

    #renderScene(admittedCards) {
        if (!this.graph) return;
        this.incident = indexIncidentWires(Object.values(this.graph.wires));
        this.groupMembership = new Map();
        for (const node of Object.values(this.graph.nodes)) if (node.inGroup) {
            if (!this.groupMembership.has(node.inGroup)) this.groupMembership.set(node.inGroup, []);
            this.groupMembership.get(node.inGroup).push(node);
        }
        this.applyTransform(false); const scene = this.#drawNodes(admittedCards); this.#drawWires(null, scene);
    }

    #applyFocus() {
        const pin = this.hoverPin;
        const gesture = this.nativeWireView?.gesture;
        const active = gesture && gesture.kind !== 'idle' ? gesture : null;
        // Motion changes routes, not focus. Compare only paint inputs before touching DOM.
        // Snapshot scalar pin fields so even an in-place bridge update is detected.
        const pinFields = value => [value?.nodeId, value?.dir, value?.portId ?? value?.port];
        const values = [this.paintRevision, this.detailScopeKey, this.mode, this.host.dataset.pcDetail,
            ...pinFields(pin), ...pinFields(active?.origin), ...pinFields(active?.target),
            active?.kind, active?.feedback?.compatible, this.hoverWire, this.selection?.kind, this.selection?.id];
        if (samePaintValues(this.focusPaint?.values, values) && samePaintMembers(this.focusPaint?.wireMulti, this.wireMulti)) return;
        this.focusPaint = {values, wireMulti:new Set(this.wireMulti)};
        const pinKey = value => value && JSON.stringify([value.nodeId, value.dir, value.portId ?? value.port]);
        const pins = new Set([pinKey(pin), pinKey(active?.origin)].filter(Boolean));
        const targetKey = pinKey(active?.target);
        for (const path of this.svg.querySelectorAll('path.pc-wire')) {
            const wire = this.graph?.wires[path.dataset.id];
            const attached = pin && wire && (pin.dir === 'in' ? wire.to === pin.nodeId && wire.toPort === pin.port : wire.from === pin.nodeId && wire.fromPort === pin.port);
            const focused = wire && (attached || this.hoverWire === wire.id || this.wireMulti.has(wire.id) || this.selection?.kind === 'wire' && this.selection.id === wire.id);
            path.classList.toggle('pc-wire-feeds', !!focused);
            if (focused) {
                pins.add(JSON.stringify([wire.from, 'out', wire.fromPort]));
                pins.add(JSON.stringify([wire.to, 'in', wire.toPort]));
            }
        }
        for (const element of this.nodeLayer.querySelectorAll('.pc-port[data-node][data-dir][data-port]')) {
            const key = JSON.stringify([element.dataset.node, element.dataset.dir, element.dataset.port]);
            const target = key === targetKey;
            element.classList.toggle('pc-pin-highlight', pins.has(key));
            element.classList.toggle('pc-pin-target', target);
            element.classList.toggle('pc-pin-compatible', target && active.feedback?.compatible === true);
            element.classList.toggle('pc-pin-invalid', target && active.feedback?.compatible === false);
        }
    }

    #layoutEnvironment() {
        const style = getComputedStyle(this.host);
        return [this.layoutEpoch, style.font, style.fontSize, style.fontFamily, style.lineHeight,
            this.host.ownerDocument.documentElement.getAttribute('data-pc-theme'),
            window.matchMedia?.('(pointer: coarse)').matches ?? false];
    }

    #groupMembers(id) { return this.groupMembership?.get(id) ?? []; }

    #groupCards(ids = null) {
        if (!ids) return retainSlots(Object.values(this.graph.groups ?? {}).map(g => this.#groupCard(g)), this.groupSlots);
        const affected = new Set([...ids].map(id => this.graph.nodes[id]?.inGroup).filter(Boolean));
        for (const id of ids) if (id.startsWith('group:')) affected.add(id.slice(6));
        for (const id of affected) {
            const group = this.graph.groups[id]; if (!group) continue;
            const value = this.#groupCard(group), signature = JSON.stringify(value);
            if (this.groupSlots.get(id)?.signature !== signature) this.groupSlots.set(id, {value, signature});
        }
        return [...this.groupSlots.values()].map(slot => slot.value);
    }

    #drawNodes(admittedCards) {
        const context = { graph: this.graph, selection: this.selection, multi: this.multi, hooks: this.hooks };
        // Classify the admitted scene once, including folded nodes whose metadata still drives group frames.
        const all = admittedCards ?? nodeCards(Object.values(this.graph.nodes).filter(n => !isCommentFrame(n)), context);
        this.preparedCards = new Map(all.map(card => [card.id, card]));
        const environment = this.#layoutEnvironment();
        for (const card of all) {
            const key = cardLayoutKey(card, environment);
            if (this.layoutKeys.get(card.id) !== key) this.dirtyGeometry.add(card.id);
            this.layoutKeys.set(card.id, key);
        }
        const cards = retainSlots(all.filter(card => !this.#folded(this.graph.nodes[card.id])).sort((a,b) => (a.y-b.y)||(a.x-b.x)), this.cardSlots);
        this.paintRevision++; // Card, group and port publications may replace classes or keyed children.
        const draw = this.graph, comments = Object.values(draw.nodes).filter(isCommentFrame);
        const capture = comments.length && this.#canEdit() ? this.hooks.captureCommentEdit?.() : null;
        const current = id => this.graph === draw && isCommentFrame(draw.nodes[id]);
        this.layer.applyScene({nodes:cards, groups:this.#groupCards(), comments:retainSlots(comments.map(node => this.#commentCard(node)), this.commentSlots), commentActions:{
            select: id => { if (current(id)) { this.setMulti([]); this.select({ kind: 'node', id }); } },
            update: (id, patch) => { if (current(id) && this.#canEdit()) this.hooks.onCommentPatch?.(capture, id, patch); },
            command: (id, command) => { if (current(id) && this.#canEdit()) this.hooks.onCommentCommand?.(capture, id, command); },
        }});
        this.#measureCards('.pc-node[data-id]');
        this.#measureCards('.pc-node-group');
        const keep = new Set([...Object.keys(this.graph.nodes), ...Object.keys(this.graph.groups ?? {}).map(id => 'group:' + id)]);
        for (const [id, element] of this.nodeElements) if (!this.host.contains(element)) {
            this.resizeObserver?.unobserve(element); this.nodeElements.delete(id); this.observerSizes.delete(id);
        }
        this.geometry.retain(keep);
        for (const map of [this.layoutKeys, this.dirtyGeometry]) for (const id of map.keys()) if (!keep.has(id)) map.delete(id);
        this.#paintSelection();
        return {groups:this.#groupCards(), nodeProfiles:this.#nodeProfileRows()};
    }

    #measureCards(selector) {
        for (const el of this.nodeLayer.querySelectorAll(selector)) {
            const id = el.dataset.id ?? 'group:' + el.dataset.group;
            const previous = this.nodeElements.get(id);
            if (previous !== el) {
                if (previous) this.resizeObserver?.unobserve(previous);
                this.nodeElements.set(id, el); this.dirtyGeometry.add(id); this.resizeObserver?.observe(el);
            }
            if (this.dirtyGeometry.has(id)) {
                this.#measureCard(el, id); this.dirtyGeometry.delete(id);
                const style = getComputedStyle(el);
                this.observerSizes.set(id, [el.clientWidth - (parseFloat(style.paddingLeft)||0) - (parseFloat(style.paddingRight)||0), el.clientHeight - (parseFloat(style.paddingTop)||0) - (parseFloat(style.paddingBottom)||0)]);
            }
        }
    }

    /** Explicit layout changes invalidate hidden members too; remount measures their latest contract. */
    invalidateGeometry(ids = Object.keys(this.graph?.nodes ?? {}), reason = 'layout') {
        if (!this.graph) return;
        for (const id of ids) if (this.graph.nodes[id] || id.startsWith('group:')) this.dirtyGeometry.add(id);
        this.#measureCards('.pc-node[data-id], .pc-node-group');
        this.#drawWires(new Set(ids), {groups:this.#groupCards(ids), nodeProfiles:this.#nodeProfileRows()});
    }

    /** Coordinate publication preserves the admitted scene and patches only incident routes. */
    setPositions(updates, groupUpdates = []) {
        if (!this.graph) return;
        const ids = [];
        for (const update of updates ?? []) {
            const node = this.graph.nodes[update.id];
            if (!node || !Number.isFinite(update.x) || !Number.isFinite(update.y)) continue;
            node.x = update.x; node.y = update.y; ids.push(node.id);
        }
        const groups = [];
        for (const update of groupUpdates) {
            const group = this.graph.groups?.[update.id]; if (!group) continue;
            if (Number.isFinite(update.x)) group.x = update.x;
            if (Number.isFinite(update.y)) group.y = update.y;
            if (Object.hasOwn(update, 'frame')) {
                if (update.frame == null) delete group.frame;
                else if (['x','y','w','h'].every(key => Number.isFinite(update.frame[key]))) group.frame = {...update.frame};
            }
            groups.push('group:' + group.id);
        }
        this.#renderPositions(ids, groups);
    }

    #measureCard(el, id) {
        if (!el.classList.contains('pc-node-native')) return this.geometry.update(id, el.offsetHeight);
        const zoom = this.view.zoom || 1;
        alignCardPins(el, zoom);
        const box = el.getBoundingClientRect();
        const pins = [...el.querySelectorAll('.pc-port')].map(port => {
            const dot = port.getBoundingClientRect();
            return { id: port.dataset.port, direction: port.dataset.dir, side: port.dataset.side, kind: port.dataset.kind, x: (dot.left + dot.width / 2 - box.left) / zoom, y: (dot.top + dot.height / 2 - box.top) / zoom };
        });
        return this.geometry.measure(id, box.width / zoom, box.height / zoom, pins);
    }

    endpoint(nodeId, direction, portId = direction) {
        const node = this.graph?.nodes[nodeId], offset = this.geometry.endpoint(nodeId, direction, portId);
        return node && offset ? { ...offset, x: node.x + offset.x, y: node.y + offset.y } : null;
    }

    #folded(node) {
        const g = groupOf(this.graph, node);
        return g?.collapsed ? g : null;
    }

    #nativeGroupFrame(g) {
        const members = this.#groupMembers(g.id);
        if (!members.length) return g.frame ?? { x: g.x ?? 0, y: g.y ?? 0, w: g.w || 260, h: 140 };
        const x = Math.min(...members.map(node => node.x)) - 24, y = Math.min(...members.map(node => node.y)) - 48;
        const right = Math.max(...members.map(node => node.x + this.widthOf(node))) + 24;
        const bottom = Math.max(...members.map(node => node.y + this.heightOf(node))) + 24;
        if (!g.frame) return { x, y, w: right - x, h: bottom - y };
        const left = Math.min(g.frame.x, x), top = Math.min(g.frame.y, y);
        return { x: left, y: top, w: Math.max(g.frame.x + g.frame.w, right) - left, h: Math.max(g.frame.y + g.frame.h, bottom) - top };
    }

    #groupCard(g) {
        const members = this.#groupMembers(g.id).sort((a, b) => (a.y - b.y) || (a.x - b.x));
        const frame = this.#nativeGroupFrame(g), selected = this.selection?.kind === 'group' && this.selection.id === g.id;
        const multi = members.length > 0 && members.every(n => this.multi.has(n.id));
        return {
            id: g.id, collapsed: !!g.collapsed, x: g.collapsed ? g.x ?? frame.x : frame.x, y: g.collapsed ? g.y ?? frame.y : frame.y,
            w: g.collapsed ? g.w || 260 : frame.w, h: frame.h,
            className: (g.collapsed ? 'pc-node pc-node-group' : 'pc-group-frame') + (selected ? ' pc-selected' : '') + (multi ? ' pc-multi' : '') + (members.length ? '' : ' pc-group-empty'),
            title: g.title || 'Group', body: members.map(n => n.presentation?.alias || n.title || (this.#nativeCard(n).canonicalTitle ?? this.#nativeCard(n).label)).join(' · '),
            count: `${members.length} node${members.length === 1 ? '' : 's'}`,
        };
    }

    heightOf(node) {
        return isCommentFrame(node) ? (Number.isFinite(node.h) && node.h > 0 ? node.h : 220) : this.geometry.get(node?.id);
    }

    #nativeCard(node) { return node && (this.preparedCards?.get(node.id) ?? preparedCardFor(this.graph, node, this.hooks)); }

    widthOf(node) { return isCommentFrame(node) ? (Number.isFinite(node.w) && node.w > 0 ? node.w : 360) : this.geometry.width(node?.id); }

    #commentCard(node) {
        return { id: node.id, x: node.x ?? 0, y: node.y ?? 0, w: this.widthOf(node), h: this.heightOf(node),
            title: node.title || 'Comment', content: node.content || '', color: node.color || '#637d89', moveContents: node.moveContents !== false,
            selected: this.selection?.kind === 'node' && this.selection.id === node.id || this.multi.has(node.id), readOnly: !this.#canEdit() };
    }

    #paintMulti() {
        for (const el of this.nodeLayer.querySelectorAll('.pc-node[data-id]')) {
            el.classList.toggle('pc-multi', this.multi.has(el.dataset.id));
        }
        for (const el of this.nodeLayer.querySelectorAll('.pc-node-group')) {
            const members = this.#groupMembers(el.dataset.group);
            el.classList.toggle('pc-multi', members.length > 0 && members.every(n => this.multi.has(n.id)));
        }
        for (const el of this.commentLayer.querySelectorAll('.pc-comment-frame[data-id]')) {
            el.classList.toggle('pc-comment-selected', this.multi.has(el.dataset.id) || this.selection?.kind === 'node' && this.selection.id === el.dataset.id);
        }
    }

    #paintSelection() {
        const values = [this.paintRevision, this.detailScopeKey, this.mode, this.host.dataset.pcDetail, this.selection?.kind, this.selection?.id];
        if (samePaintValues(this.selectionPaint?.values, values) && samePaintMembers(this.selectionPaint?.multi, this.multi)
            && samePaintMembers(this.selectionPaint?.wireMulti, this.wireMulti)) { this.#applyFocus(); return; }
        this.selectionPaint = {values, multi:new Set(this.multi), wireMulti:new Set(this.wireMulti)};
        for (const el of this.nodeLayer.querySelectorAll('.pc-node[data-id]')) el.classList.toggle('pc-selected', this.selection?.kind === 'node' && this.selection.id === el.dataset.id);
        for (const el of this.nodeLayer.querySelectorAll('.pc-node-group, .pc-group-frame')) el.classList.toggle('pc-selected', this.selection?.kind === 'group' && this.selection.id === el.dataset.group);
        this.#paintMulti();
        for (const [id, wire] of this.wireViews) {
            const selected = this.wireMulti.has(id) || this.selection?.kind === 'wire' && this.selection.id === id;
            const className = wire.className.replace(/ pc-selected\b/g, '') + (selected ? ' pc-selected' : '');
            if (className !== wire.className) this.wireViews.set(id, { ...wire, className });
        }
        for (const path of this.svg.querySelectorAll('path.pc-wire[data-id]')) path.classList.toggle('pc-selected', this.wireMulti.has(path.dataset.id) || this.selection?.kind === 'wire' && this.selection.id === path.dataset.id);
        this.#applyFocus();
    }

    setMulti(ids) {
        const hadWireSelection = this.wireMulti.size > 0;
        this.wireMulti.clear();
        const next = new Set(ids.filter(id => this.graph?.nodes[id]));
        if (next.size === this.multi.size && [...next].every(id => this.multi.has(id))
            && (!this.selection || (next.size === 1 && this.selection.kind === 'node' && next.has(this.selection.id)))) {
            if (hadWireSelection) this.#paintSelection();
            return;
        }
        this.multi = next;
        this.selection = next.size === 1 ? { kind: 'node', id: [...next][0] } : null;
        this.#paintSelection();
        this.hooks.onSelect?.(this.selection ? this.graph.nodes[this.selection.id] : null, this.selection?.kind ?? null);
        this.hooks.onMulti?.([...this.multi]);
    }

    #pickedIds() {
        const ids = new Set(this.multi);
        if (this.selection?.kind === 'node') ids.add(this.selection.id);
        if (this.selection?.kind === 'group') for (const n of this.#groupMembers(this.selection.id)) ids.add(n.id);
        return ids;
    }

    #dragGroups(ids, extraGroup) {
        const selected = new Set(ids);
        return Object.values(this.graph.groups ?? {}).filter(group => {
            const members = this.#groupMembers(group.id);
            return group.id === extraGroup || group.collapsed && members.length && members.every(node => selected.has(node.id));
        }).map(group => {
            const frame = this.#nativeGroupFrame(group);
            return { id: group.id, x: group.x ?? frame.x, y: group.y ?? frame.y,
                original: Object.fromEntries(['x', 'y', 'frame'].filter(key => Object.hasOwn(group, key)).map(key => [key, structuredClone(group[key])])) };
        });
    }

    setMode(mode) {
        this.mode = mode === 'pan' ? 'pan' : 'select';
        this.host.classList.toggle('pc-pan-mode', this.mode === 'pan');
        if (this.graph) this.#paintSelection();
        if (this.graph) this.hooks.onView?.({ ...this.view, mode: this.mode });
    }

    selectAll() { if (this.graph) this.setMulti(Object.keys(this.graph.nodes)); }

    centerSelection({ fit = false } = {}) {
        if (!this.graph || this.drag || this.marquee || this.pan || this.#nativeBridge()?.hasContentGesture()) return;
        this.#finishZoom(false);
        const ids = new Set(this.multi);
        if (this.selection?.kind === 'node') ids.add(this.selection.id);
        const all = !this.selection && !this.multi.size && !this.wireMulti.size;
        if (all) for (const id of Object.keys(this.graph.nodes)) ids.add(id);
        const boxes = [], groups = new Set();
        const addGroup = group => {
            if (!group || groups.has(group.id)) return;
            groups.add(group.id);
            const card = this.#groupCard(group), key = `group:${group.id}`;
            boxes.push(group.collapsed ? { x: card.x, y: card.y, w: this.geometry.width(key, card.w), h: this.geometry.get(key, 90) } : card);
        };
        for (const id of ids) {
            const node = this.graph.nodes[id];
            if (!node) continue;
            const group = this.#folded(node);
            if (group) addGroup(group);
            else boxes.push({ x: node.x, y: node.y, w: this.widthOf(node), h: this.heightOf(node) });
        }
        if (this.selection?.kind === 'group') addGroup(this.graph.groups?.[this.selection.id]);
        if (all) for (const group of Object.values(this.graph.groups ?? {})) addGroup(group);
        const wires = new Set(this.wireMulti);
        if (this.selection?.kind === 'wire') wires.add(this.selection.id);
        for (const id of wires) {
            const wire = this.graph.wires[id];
            if (!wire) continue;
            const from = this.endpoint(wire.from, 'out', wire.fromPort), to = this.endpoint(wire.to, 'in', wire.toPort);
            if (from && to) boxes.push({ x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(from.x - to.x), h: Math.abs(from.y - to.y) });
        }
        const bounds = boxes.filter(box => ['x', 'y', 'w', 'h'].every(key => Number.isFinite(box[key])) && box.w >= 0 && box.h >= 0);
        if (!bounds.length) return;
        const minX = Math.min(...bounds.map(box => box.x)), maxX = Math.max(...bounds.map(box => box.x + box.w));
        const minY = Math.min(...bounds.map(box => box.y)), maxY = Math.max(...bounds.map(box => box.y + box.h));
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const rect = this.host.getBoundingClientRect(), view = this.view;
        if (fit) view.zoom = Math.max(0.25, Math.min(1.2, rect.width / (maxX - minX + 120), rect.height / (maxY - minY + 120)));
        view.x = rect.width / 2 - cx * view.zoom;
        view.y = rect.height / 2 - cy * view.zoom;
        this.applyTransform();
        this.hooks.onViewCommit?.();
    }

    fitSelection() {
        if (!this.graph || this.drag || this.marquee || this.pan || this.#nativeBridge()?.hasContentGesture()) return;
        if (!this.selection && !this.multi.size && !this.wireMulti.size) {
            this.fit();
            this.hooks.onViewCommit?.();
            return;
        }
        this.centerSelection({ fit: true });
    }

    cancelGesture(reason = 'cancel', {render = true} = {}) {
        this.operationEpoch++;
        const bridge = this.#nativeBridge();
        const active = !!(this.drag || this.marquee || this.pan || bridge?.hasContentGesture());
        if (bridge) { const result = bridge.cancel(reason); this.updateNativeWire(result.view, result.requests); }
        const panning = !!this.pan;
        this.#finishZoom();
        this.frames.cancel(); clearTimeout(this.wheelTimer);
        this.gestureRect = null; this.wheelRect = null;
        const d = this.drag;
        if (d && this.graph) this.#restoreDrag(d);
        if (this.pan?.start && this.graph) Object.assign(this.view, this.pan.start);
        this.marquee?.box.remove();
        this.drag = null; this.marquee = null; this.pan = null;
        this.nativeMouseSuppressed = false;
        this.spaceDown = false;
        this.host.classList.remove('pc-panning', 'pc-interacting', 'pc-space-pan');
        this.hooks.onDragBlock?.(false);
        if (active && this.graph) {
            const start = this.gestureStart;
            this.multi = new Set(start?.multi ?? this.multi);
            this.wireMulti = new Set([...(start?.wireMulti ?? this.wireMulti)].filter(id => this.graph.wires[id]));
            this.selection = start?.selection ?? null;
            if (this.selection?.kind === 'wire' && !this.graph.wires[this.selection.id]) {
                const surviving = [...this.wireMulti].at(-1);
                this.selection = surviving ? { kind: 'wire', id: surviving } : null;
            }
            if (render) this.render();
            else { this.layer.setWirePreview(null); this.#paintSelection(); }
            const sel = this.selection;
            const picked = sel?.kind === 'node' ? this.graph.nodes[sel.id] : sel?.kind === 'group' ? this.graph.groups?.[sel.id] : sel?.kind === 'wire' ? this.graph.wires[sel.id] : null;
            this.hooks.onSelect?.(picked, sel?.kind ?? null); this.hooks.onMulti?.([...this.multi]);
        }
        else {
            if (bridge && this.graph) {
                // An idle bridge may have queued cleanup after its ghost was
                // painted. Cancelling that frame must still clear the draft.
                this.layer.setWirePreview(null);
                this.#applyFocus();
            }
        }
        if (panning) this.hooks.onViewCommit?.();
        return active;
    }

    #restoreDrag(d) {
        for (const [id, x, y] of d.several ?? []) {
            const node = this.graph.nodes[id]; if (node) { node.x = x; node.y = y; }
        }
        const node = d.id && this.graph.nodes[d.id];
        if (node) {
            node.x = d.homeX; node.y = d.homeY;
            if (d.sizeBefore) for (const axis of ['w', 'h']) {
                if (d.sizeBefore[axis] === undefined) delete node[axis]; else node[axis] = d.sizeBefore[axis];
            }
        }
        for (const saved of d.groups ?? []) {
            const group = this.graph.groups?.[saved.id]; if (!group) continue;
            for (const key of ['x', 'y', 'frame']) delete group[key]; Object.assign(group, saved.original);
        }
    }

    #focusCommentGesture(event) {
        // Leaving a title editor may commit and replace the drawing. Capture the
        // gesture only after that focus change, using the current graph and view.
        this.host.focus({ preventScroll: true });
        this.gestureRect = this.host.getBoundingClientRect();
        this.gestureStart = { selection: this.selection && { ...this.selection }, multi: [...this.multi], wireMulti: [...this.wireMulti], cx: event.clientX, cy: event.clientY };
    }

    #beginCommentDrag(event, frame) {
        if (!this.#canEdit()) return;
        const capture = this.hooks.captureCommentEdit?.();
        if (!capture) return;
        const start = this.toGraph(event.clientX, event.clientY);
        let nodes;
        if (this.multi.size > 1 && this.multi.has(frame.id)) nodes = [...this.multi].map(id => this.graph.nodes[id]).filter(Boolean);
        else {
            nodes = [frame, ...(frame.moveContents !== false ? containedCommentNodes(this.graph, frame, node => ({ x: node.x, y: node.y, w: this.widthOf(node), h: this.heightOf(node) })).filter(node => !this.#folded(node)) : [])];
            this.setMulti([]); this.select({ kind: 'node', id: frame.id });
        }
        this.drag = { comment: true, capture, several: nodes.map(node => [node.id, node.x, node.y]), groups: this.#dragGroups(nodes.map(node => node.id)), sx: start.x, sy: start.y, moved: false };
    }

    #updateMarquee(e) {
        const m = this.marquee;
        if (!m) return;
        if (!m.moved && Math.hypot(e.clientX - m.cx, e.clientY - m.cy) < 4) return;
        m.moved = true;
        const p = this.toGraph(e.clientX, e.clientY);
        m.x1 = p.x; m.y1 = p.y;
        const r = rectangle({ x: m.x0, y: m.y0 }, p);
        Object.assign(m.box.style, { display: '', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        const hits = [];
        for (const n of Object.values(this.graph.nodes)) {
            if (!this.#folded(n) && intersects(r, { x: n.x, y: n.y, w: this.widthOf(n), h: this.heightOf(n) || 90 })) hits.push(n.id);
        }
        for (const g of Object.values(this.graph.groups ?? {})) {
            if (!g.collapsed) continue;
            if (intersects(r, { x: g.x, y: g.y, w: g.w || 260, h: this.geometry.get(`group:${g.id}`, 80) })) hits.push(...this.#groupMembers(g.id).map(n => n.id));
        }
        this.setMulti([...combineSelection(m.initial, hits, m.mode)]);
    }

    setCollapsed(gid, collapsed) {
        if (typeof gid !== 'string' || !Object.hasOwn(this.graph?.groups ?? {}, gid) || typeof collapsed !== 'boolean') return false;
        return this.hooks.onNativeGroupPresentation?.(gid, collapsed) === true;
    }

    #path(from, to) { return buildConnectionRoute(from, to).d; }

    #drawWires(changedNodes = null, scene = null, positions = null) {
        if (!this.graph) return;
        const affected = changedNodes ? new Set([...changedNodes].flatMap(id => [...(this.incident.get(id) ?? [])])) : null;
        const visible = affected ? null : new Set(), bounds = affected ? { ...this.wireBounds } : { w: 4000, h: 4000 };
        const nodes = affected ? [...changedNodes].map(id => this.graph.nodes[id]).filter(Boolean) : Object.values(this.graph.nodes);
        for (const n of nodes) { bounds.w = Math.max(bounds.w, n.x + 800); bounds.h = Math.max(bounds.h, n.y + 800); }
        let wiresChanged = false, wirePaintChanged = false;
        const wires = affected ? [...affected].map(id => this.graph.wires[id]).filter(Boolean) : Object.values(this.graph.wires);
        for (const wire of wires) {
            if (!wire.from || !wire.fromPort || !wire.to || !wire.toPort) continue;
            const from = this.endpoint(wire.from, 'out', wire.fromPort), to = this.endpoint(wire.to, 'in', wire.toPort);
            if (!from || !to || this.#folded(this.graph.nodes[wire.from]) || this.#folded(this.graph.nodes[wire.to])) { if (this.wireViews.delete(wire.id)) wiresChanged = wirePaintChanged = true; this.publishedWireClasses.delete(wire.id); continue; }
            visible?.add(wire.id);
            const off = [wire.from, wire.to].some(id => this.graph.nodes[id]?.enabled === false);
            const selected = this.selection?.kind === 'wire' && this.selection.id === wire.id || this.wireMulti.has(wire.id);
            const route = buildConnectionRoute(from, to);
            const next = { id: wire.id, kind: from.kind, d: route.d,
                className: 'pc-wire pc-wire-native' + (off ? ' pc-wire-off' : '') + (selected ? ' pc-selected' : ''),
                label: { ...route.label, text: from.kind, className: 'pc-wire-label' } };
            const previous = this.wireViews.get(wire.id);
            if (!previous || this.publishedWireClasses.get(wire.id) !== next.className || previous.d !== next.d || previous.kind !== next.kind || previous.className !== next.className
                || previous.label.x !== next.label.x || previous.label.y !== next.label.y || previous.label.text !== next.label.text) {
                this.wireViews.set(wire.id, next); wiresChanged = true;
                if (!previous || this.publishedWireClasses.get(wire.id) !== next.className) wirePaintChanged = true;
                this.publishedWireClasses.set(wire.id, next.className);
            }
        }
        if (visible) for (const id of this.wireViews.keys()) if (!visible.has(id)) { this.wireViews.delete(id); this.publishedWireClasses.delete(id); wiresChanged = wirePaintChanged = true; }
        this.wireBounds = bounds;
        const ghost = this.#wirePreview();
        const publication = {...scene, bounds, ghost};
        // Keep the settled wire array out of coordinate batches when routes are unchanged.
        if (!affected || wiresChanged) publication.wires = [...this.wireViews.values()];
        if (positions) this.layer.setPositions(positions, [], publication);
        else if (scene) this.layer.applyScene(publication);
        else this.layer.setWires([...this.wireViews.values()], bounds, ghost);
        if (wirePaintChanged) this.paintRevision++;
        this.#paintSelection();
    }

    #drawWirePreview() {
        this.layer.setWirePreview(this.#wirePreview());
        if (this.previewFocusChanged) this.#applyFocus();
        this.previewFocusChanged = false;
    }

    #wirePreview() {
        const native = this.nativeWireView?.gesture;
        const origin = native?.origin && this.endpoint(native.origin.nodeId, native.origin.dir, native.origin.portId);
        const target = native?.target && this.endpoint(native.target.nodeId, native.target.dir, native.target.portId);
        const loose = native?.ghost;
        const ghost = native && native.kind !== 'idle' && origin && loose ? {
            kind: origin.kind,
            d: target && native.feedback?.compatible === true ? (native.origin.dir === 'out' ? this.#path(origin, target) : this.#path(target, origin)) : buildDragConnectionRoute(origin, loose).d,
            className: 'pc-wire pc-wire-ghost pc-wire-native' + (native.feedback?.compatible === false ? ' pc-wire-invalid' : ''),
        } : null;
        return ghost;
    }

    #renderDrag() {
        const d = this.drag; if (!d) return;
        const ids = d.id ? [d.id] : d.several.map(([id]) => id);
        this.#renderPositions(ids, (d.groups ?? []).map(group => 'group:' + group.id));
    }

    #renderPositions(ids, groups = []) {
        const positions = ids.map(id => this.graph.nodes[id]).filter(Boolean).map(n => ({id:n.id, x:n.x, y:n.y, ...(isCommentFrame(n) ? {w:this.widthOf(n),h:this.heightOf(n)} : {})}));
        this.#drawWires(new Set(ids), {groups:this.#groupCards([...ids, ...groups]),nodeProfiles:this.#nodeProfileRows()}, positions);
    }

    #crossedDragThreshold(e) {
        return this.drag?.moved || Math.hypot(e.clientX - (this.gestureStart?.cx ?? e.clientX), e.clientY - (this.gestureStart?.cy ?? e.clientY)) >= 8;
    }

    #nativeBridge() { return this.graph ? this.hooks.nativeBridge?.() : null; }

    #canEdit() { return this.hooks.canEdit ? this.hooks.canEdit() === true : this.hooks.nativeScope?.()?.readOnly !== true; }

    hasContentGesture() { return !!(this.drag || this.#nativeBridge()?.hasContentGesture()); }

    updateNativeWire(view, requests = []) {
        const focusKey = value => { const g=value?.gesture; return JSON.stringify([g?.kind==='idle' ? null : g?.origin, g?.target, g?.feedback?.compatible]); };
        this.previewFocusChanged = this.previewFocusChanged || focusKey(view) !== focusKey(this.nativeWireView);
        this.nativeWireView = view;
        for (const request of requests ?? []) {
            if (request.type === 'capture-pointer' && !this.nativeCaptures.has(request.pointerId)) {
                this.nativeCaptures.add(request.pointerId);
                try { this.host.setPointerCapture(request.pointerId); } catch { /* no active synthetic pointer */ }
            } else if (request.type === 'release-pointer' && this.nativeCaptures.delete(request.pointerId)) {
                try { this.host.releasePointerCapture(request.pointerId); } catch { /* capture may already have ended */ }
            } else if (request.type === 'consume') {
                this.nativeEvent?.preventDefault(); this.nativeEvent?.stopPropagation();
            }
        }
        this.frames.schedule(8);
    }

    #dispatchNative(event, domEvent) {
        const bridge = this.#nativeBridge(); if (!bridge) return;
        this.nativeEvent = domEvent;
        try { const result = bridge.dispatch(event); this.updateNativeWire(result.view, result.requests); }
        finally { this.nativeEvent = null; }
    }

    #nativePin(element) {
        const pin = element?.closest?.('.pc-port[data-node][data-dir][data-port]');
        if (!pin || !this.host.contains(pin)) return null;
        const { node: nodeId, dir, port: portId } = pin.dataset;
        const metadata = this.#nativeCard(this.graph.nodes[nodeId]);
        const port = metadata?.ports.find(port => port.port === portId && port.dir === dir);
        const center = this.endpoint(nodeId, dir, portId), scope = this.hooks.nativeScope?.();
        if (!port || !center || !scope?.workflowId || !Array.isArray(scope.instancePath)) return null;
        return { nodeId, portId, dir, kind: port.kind, center: { x: center.x, y: center.y },
            address: { workflowId: scope.workflowId, instancePath: [...scope.instancePath], nodeId, portId } };
    }

    #nativeAttachments(pin) { return this.hooks.nativeAttachments?.(pin) ?? { originalBindings: [], jumps: [] }; }

    #nativeHit(e) {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (!element || !this.host.contains(element)) return { kind: 'outside' };
        if (element.closest('.pc-node-profile')) return { kind: 'surface' };
        const pin = this.#nativePin(element); if (pin) return { kind: 'pin', pin };
        if (element.closest('.pc-node, .pc-group-frame')) return { kind: 'body' };
        if (element.closest('button, input, textarea, select, summary, a, [contenteditable="true"], .pc-wire-hit, .pc-comment-header, .pc-comment-resize')) return { kind: 'surface' };
        return { kind: 'empty' };
    }

    #openNativeSearch(e) {
        if (!this.#canEdit()) return;
        const bridge = this.#nativeBridge(); if (!bridge) return;
        this.gestureStart = { selection: this.selection && { ...this.selection }, multi: [...this.multi], wireMulti: [...this.wireMulti] };
        const result = bridge.openUnconnectedSearch({ graphPoint: this.toGraph(e.clientX, e.clientY), screenAnchor: { x: e.clientX, y: e.clientY } });
        this.updateNativeWire(result.view, result.requests);
    }

    #bind() {
        const host = this.host;
        const on = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: this.eventController.signal });
        const inEditor = (e) => e.target?.closest?.('input, textarea, select, [contenteditable="true"]');
        const typing = (e) => inEditor(e) || document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]');
        on(host, 'scroll', () => {
            // Keyboard focus can scroll an overflow-hidden host to an offscreen
            // card. Adopt that movement into the camera so hit testing and the
            // background grid continue to match the graph's displayed position.
            const x = host.scrollLeft, y = host.scrollTop;
            if (!this.graph || !(x || y)) return;
            this.#finishZoom(false);
            this.view.x -= x; this.view.y -= y;
            host.scrollLeft = 0; host.scrollTop = 0;
            this.applyTransform(); this.hooks.onViewCommit?.();
        });
        on(host, 'pointerover', event => {
            if (inNodeProfile(event)) return;
            const wire = event.target.closest?.('.pc-wire-hit[data-id]');
            if (wire) { this.hoverWire = wire.dataset.id; this.#applyFocus(); }
        });
        on(host, 'pointerout', event => {
            if (inNodeProfile(event)) return;
            const wire = event.target.closest?.('.pc-wire-hit[data-id]');
            if (wire && !wire.contains(event.relatedTarget)) { this.hoverWire = null; this.#applyFocus(); }
        });
        on(document, 'keydown', (e) => {
            if (inNodeProfile(e)) return;
            const root = host.closest('.pc-root');
            if (root && !root.classList.contains('pc-open')) return;
            const zoomFactor = zoomShortcutFactor(e);
            if (zoomFactor !== null) {
                const controls = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], button, a, summary, [role="menu"], .pc-workspace-overlay';
                if (!this.graph || this.drag || this.marquee || this.pan || this.#nativeBridge()?.hasContentGesture()
                    || !host.contains(e.target) || !host.contains(document.activeElement)
                    || e.target?.closest?.(controls) || document.activeElement?.closest?.(controls)) return;
                const rect = host.getBoundingClientRect();
                e.preventDefault();
                this.zoomBy(zoomFactor, rect.left + rect.width / 2, rect.top + rect.height / 2);
                return;
            }
            if (e.key === 'Escape' && !typing(e) && (host.contains(e.target) || host.contains(document.activeElement))) {
                if (this.cancelGesture('escape')) e.preventDefault();
                return;
            }
            if ((e.code === 'Space' || e.key === ' ') && !typing(e) && !e.target?.closest?.('button, a, summary')) {
                e.preventDefault(); this.spaceDown = true; host.classList.add('pc-space-pan');
            }
        });
        on(document, 'keyup', (e) => {
            if (e.code === 'Space' || e.key === ' ') { this.spaceDown = false; host.classList.remove('pc-space-pan'); }
        }, { capture: true });
        on(window, 'blur', () => this.cancelGesture('blur'));
        // A drag begun on the canvas may end on a control that stops bubbling.
        // Cancel it before control isolation runs so it cannot remain stuck.
        on(window, 'mouseup', e => {
            if (inNodeProfile(e) && (this.drag || this.pan || this.marquee)) this.cancelGesture('profile-surface');
        }, { capture: true });
        on(window, 'resize', () => { this.cancelGesture(); this.#drawNodeProfiles(); });
        on(host, 'pointercancel', e => { if (!inNodeProfile(e)) this.cancelGesture('pointercancel'); });
        on(host, 'lostpointercapture', e => {
            if (inNodeProfile(e)) return;
            {
                if (this.drag || this.marquee || this.pan) { this.cancelGesture(); return; }
                this.nativeCaptures.delete(e.pointerId);
                this.#dispatchNative({ type: 'capture-lost', pointerId: e.pointerId, buttons: e.buttons }, e);
                return;
            }
        });
        on(host, 'pointerdown', (e) => {
            if (inNodeProfile(e)) return;
            this.#finishZoom(false);
            if (e.button === 0 && !inEditor(e) && !e.target.closest('.pc-node-action')) {
                const pinElement = e.target.closest('.pc-port'), pin = this.#nativePin(e.target);
                const wire = e.target.closest('.pc-wire-hit');
                if (pinElement || e.altKey && wire) {
                    e.preventDefault(); e.stopPropagation(); this.nativeMouseSuppressed = true;
                    host.focus({ preventScroll: true });
                    if (!this.#canEdit()) return;
                    this.gestureStart = { selection: this.selection && { ...this.selection }, multi: [...this.multi], wireMulti: [...this.wireMulti] };
                    this.gestureRect = host.getBoundingClientRect();
                    const attachment = pin ? this.#nativeAttachments(pin) : null;
                    if (e.altKey && (pin || wire)) this.#dispatchNative({ type: 'activate-target', target: pin ? { kind: 'pin', pin } : { kind: 'wire', id: wire.dataset.id },
                        timestamp: e.timeStamp, alt: true, ...(pin ? { originalBindings: attachment.originalBindings } : {}) }, e);
                    else if (pin) this.#dispatchNative({ type: 'begin-pin', pin, pointerId: e.pointerId, graphPoint: this.toGraph(e.clientX, e.clientY),
                        originalBindings: attachment.originalBindings, ctrl: e.ctrlKey }, e);
                    return;
                }
            }
            // Body drags and pans already use window mouse handlers. Generic
            // capture would retarget their click/double-click to the host.
        });
        on(window, 'pointermove', e => {
            if (this.nativeWireView?.gesture?.kind !== 'drag' || this.nativeWireView.gesture.released) return;
            this.#dispatchNative({ type: 'pointer-move', pointerId: e.pointerId, graphPoint: this.toGraph(e.clientX, e.clientY), hit: this.#nativeHit(e) }, e);
        });
        on(window, 'pointerup', e => {
            if (this.nativeWireView?.gesture?.kind === 'drag' && !this.nativeWireView.gesture.released) {
                this.#dispatchNative({ type: 'release', pointerId: e.pointerId, graphPoint: this.toGraph(e.clientX, e.clientY),
                    screenAnchor: { x: e.clientX, y: e.clientY }, hit: this.#nativeHit(e) }, e);
            }
            this.nativeMouseSuppressed = false;
            if (!this.drag && !this.pan && !this.marquee) this.gestureRect = null;
        });
        // Where the pointer is on the canvas, so a paste lands under it.
        on(host, 'mousemove', (e) => { if (!inNodeProfile(e) && this.graph) this.pointer = this.toGraph(e.clientX, e.clientY); });
        on(host, 'mouseleave', () => { this.pointer = null; });
        on(host, 'wheel', (e) => {
            if (inNodeProfile(e)) return;
            if (!this.graph || this.drag || this.marquee || this.pan || this.#nativeBridge()?.hasContentGesture()) return;
            e.preventDefault();
            const rect = this.wheelRect ?? host.getBoundingClientRect();
            const factor = wheelFactor(e.deltaY, e.deltaMode, rect.height);
            if (this.#queueZoom(factor, { x: e.clientX - rect.left, y: e.clientY - rect.top })) this.wheelRect = rect;
        }, { passive: false });
        on(host, 'mousedown', (e) => {
            if (inNodeProfile(e)) return;
            if (!this.graph) return;
            if (this.nativeMouseSuppressed || e.target.closest('.pc-port')) { e.preventDefault(); return; }
            if (e.target.closest('.pc-node-action')) return;
            if (inEditor(e)) return;
            this.#finishZoom(false);
            this.gestureRect = host.getBoundingClientRect();
            if (e.button === 1 || (e.button === 0 && (this.spaceDown || this.mode === 'pan'))) {
                e.preventDefault();
                const editor = inEditor({ target: document.activeElement });
                const workspace = host.closest('.pc-root');
                if (!editor || !(host.contains(editor) || workspace?.contains(editor))) host.focus({ preventScroll: true });
                this.gestureStart = { selection: this.selection && { ...this.selection }, multi: [...this.multi], wireMulti: [...this.wireMulti] };
                const v = this.view;
                this.pan = { x: e.clientX - v.x, y: e.clientY - v.y, start: { ...v } };
                host.classList.add('pc-panning');
                return;
            }
            if (e.button !== 0) return;
            this.gestureStart = { selection: this.selection && { ...this.selection }, multi: [...this.multi], wireMulti: [...this.wireMulti], cx: e.clientX, cy: e.clientY };
            const port = e.target.closest('.pc-port');
            const nodeEl = e.target.closest('.pc-node[data-id]');
            const groupEl = e.target.closest('.pc-node-group, .pc-group-frame-head, .pc-group-frame');
            const wireHit = e.target.closest('.pc-wire-hit');
            const commentResize = e.target.closest('.pc-comment-resize');
            if (commentResize) {
                const id = commentResize.closest('.pc-comment-frame')?.dataset.id;
                e.preventDefault(); this.#focusCommentGesture(e);
                const frame = this.graph.nodes[id];
                if (!isCommentFrame(frame) || !this.#canEdit()) return;
                const capture = this.hooks.captureCommentEdit?.(); if (!capture) return;
                e.preventDefault(); this.setMulti([]); this.select({ kind: 'node', id: frame.id });
                const start = this.toGraph(e.clientX, e.clientY);
                this.drag = { comment: true, resize: true, capture, id: frame.id, sx: start.x, sy: start.y, homeX: frame.x, homeY: frame.y,
                    homeW: this.widthOf(frame), homeH: this.heightOf(frame), sizeBefore: { w: frame.w, h: frame.h }, moved: false };
                return;
            }
            const commentHeader = e.target.closest('.pc-comment-header');
            if (commentHeader) {
                const id = commentHeader.closest('.pc-comment-frame')?.dataset.id;
                e.preventDefault(); this.#focusCommentGesture(e);
                const frame = this.graph.nodes[id];
                if (isCommentFrame(frame)) {
                    e.preventDefault();
                    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) {
                        const ids = this.#pickedIds();
                        if (e.altKey || ((e.ctrlKey || e.metaKey) && !e.shiftKey && ids.has(frame.id))) ids.delete(frame.id);
                        else ids.add(frame.id);
                        this.setMulti([...ids]);
                        if (!e.shiftKey || e.altKey) return;
                    }
                    if (!this.#canEdit()) { if (this.multi.size < 2 || !this.multi.has(frame.id)) { this.setMulti([]); this.select({ kind: 'node', id: frame.id }); } return; }
                    this.#beginCommentDrag(e, frame);
                }
                return;
            }
            if (groupEl && !port) {
                const gid = groupEl.dataset.group ?? groupEl.closest('[data-group]')?.dataset.group;
                if ([...this.#pickedIds()].some(id => isCommentFrame(this.graph.nodes[id]))) this.#focusCommentGesture(e);
                if (!this.graph.groups?.[gid]) return;
                e.preventDefault(); e.stopPropagation();
                const action = e.target.closest('[data-action]')?.dataset.action;
                if (action === 'collapse' || action === 'open') { this.setCollapsed(gid, action === 'collapse'); return; }
                const group = this.graph.groups[gid], members = this.#groupMembers(gid).map(node => node.id);
                if (!group.collapsed) {
                    this.multi.clear(); this.select({ kind: 'group', id: gid });
                    if (!e.target.closest('.pc-group-frame-head')) return;
                }
                let selected = this.#pickedIds();
                if (group.collapsed && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)) {
                    const remove = e.altKey || (e.ctrlKey || e.metaKey) && !e.shiftKey && members.every(id => selected.has(id));
                    for (const id of members) if (remove) selected.delete(id); else selected.add(id);
                    this.setMulti([...selected]); if (!e.shiftKey || remove) return;
                } else if (!members.length || !members.every(id => selected.has(id))) {
                    this.multi.clear(); this.select({ kind: 'group', id: gid }); selected = new Set(members);
                }
                const start = this.toGraph(e.clientX, e.clientY), ids = [...selected];
                const comment = ids.some(id => isCommentFrame(this.graph.nodes[id]));
                if (comment && !this.#canEdit()) return;
                const capture = comment ? this.hooks.captureCommentEdit?.() : null;
                if (comment && !capture) return;
                this.drag = { comment, capture, several: ids.map(id => [id, this.graph.nodes[id]?.x ?? 0, this.graph.nodes[id]?.y ?? 0]),
                    groups: this.#dragGroups(ids, gid), clickedGroup: e.shiftKey ? null : gid, sx: start.x, sy: start.y, moved: false };
                return;
            }
            if (nodeEl && e.button === 0) {
                const id = nodeEl.dataset.id;
                if ([...this.#pickedIds()].some(id => isCommentFrame(this.graph.nodes[id]))) this.#focusCommentGesture(e);
                const node = this.graph.nodes[id];
                if (!node) return;
                if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) {
                    const ids = this.#pickedIds();
                    if (e.altKey || ((e.ctrlKey || e.metaKey) && !e.shiftKey && ids.has(id))) ids.delete(id);
                    else ids.add(id);
                    this.setMulti([...ids]);
                    if (!e.shiftKey || e.altKey) return;
                }
                if (this.multi.size > 1 && this.multi.has(id)) {
                    // Drag them all together.
                    const comment = [...this.multi].some(id => isCommentFrame(this.graph.nodes[id]));
                    if (comment && !this.#canEdit()) return;
                    const capture = comment ? this.hooks.captureCommentEdit?.() : null;
                    if (comment && !capture) return;
                    const start = this.toGraph(e.clientX, e.clientY);
                    this.drag = { comment, capture, several: [...this.multi].map(m => [m, this.graph.nodes[m]?.x ?? 0, this.graph.nodes[m]?.y ?? 0]), groups: this.#dragGroups(this.multi), clicked: e.shiftKey ? null : id, sx: start.x, sy: start.y, moved: false };
                    return;
                }
                if (this.multi.size && !e.shiftKey) this.multi.clear();
                this.select({ kind: 'node', id });
                this.wireMulti.clear();
                const start = this.toGraph(e.clientX, e.clientY);
                this.drag = {
                    id,
                    dx: start.x - node.x,
                    dy: start.y - node.y,
                    homeX: node.x,
                    homeY: node.y,
                    moved: false,
                };
                return;
            }
            if (wireHit) {
                const sel = { kind: 'wire', id: wireHit.dataset.id };
                {
                    const modified = e.shiftKey || e.ctrlKey || e.metaKey;
                    if (!modified) this.wireMulti.clear();
                    if (modified && this.wireMulti.has(sel.id)) this.wireMulti.delete(sel.id); else this.wireMulti.add(sel.id);
                    this.multi.clear(); const primary = [...this.wireMulti].at(-1);
                    this.select(primary ? { kind: 'wire', id: primary } : null);
                }
                return;
            }
            if (e.button === 0) {
                const p = this.toGraph(e.clientX, e.clientY);
                const box = document.createElement('div');
                box.className = 'pc-marquee';
                box.style.display = 'none';
                this.nodeLayer.append(box);
                this.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, cx: e.clientX, cy: e.clientY, box, mode: selectionMode(e), initial: this.#pickedIds(), moved: false };
                host.classList.add('pc-interacting');
                e.preventDefault();
                return;
            }
        });
        on(window, 'mousemove', (e) => {
            if (inNodeProfile(e)) return;
            if (this.marquee) {
                this.#updateMarquee(e);
                return;
            }
            if (this.drag?.resize) {
                if (!this.#crossedDragThreshold(e)) return;
                const d = this.drag, frame = this.graph.nodes[d.id], point = this.toGraph(e.clientX, e.clientY);
                if (!isCommentFrame(frame)) return;
                frame.w = Math.max(180, Math.round(d.homeW + point.x - d.sx));
                frame.h = Math.max(100, Math.round(d.homeH + point.y - d.sy));
                d.moved = true; host.classList.add('pc-interacting'); this.frames.schedule(4); return;
            }
            if (this.drag?.several) {
                if (!this.#crossedDragThreshold(e)) return;
                const p = this.toGraph(e.clientX, e.clientY);
                const d = this.drag;
                const dx = Math.round(p.x - d.sx), dy = Math.round(p.y - d.sy);
                if (!dx && !dy && !d.moved) return;
                if (!d.moved && !d.comment) this.hooks.onDragBlock?.(true);
                d.moved = true;
                for (const [id, x, y] of d.several) {
                    const n = this.graph.nodes[id];
                    if (!n) continue;
                    n.x = x + dx; n.y = y + dy;
                }
                for (const saved of d.groups ?? []) {
                    const group = this.graph.groups?.[saved.id]; if (!group) continue;
                    group.x = saved.x + dx; group.y = saved.y + dy;
                    if (saved.original.frame) group.frame = { ...saved.original.frame, x: saved.original.frame.x + dx, y: saved.original.frame.y + dy };
                }
                this.host.classList.add('pc-interacting');
                this.frames.schedule(4);
                return;
            }
            if (this.drag) {
                if (!this.#crossedDragThreshold(e)) return;
                const p = this.toGraph(e.clientX, e.clientY);
                const node = this.graph.nodes[this.drag.id];
                if (!node) return;
                node.x = Math.round(p.x - this.drag.dx);
                node.y = Math.round(p.y - this.drag.dy);
                if (!this.drag.moved && !this.drag.comment) this.hooks.onDragBlock?.(true);
                this.drag.moved = true;
                this.host.classList.add('pc-interacting');
                this.frames.schedule(4);
                return;
            }
            if (this.pan) {
                const v = this.view;
                v.x = e.clientX - this.pan.x;
                v.y = e.clientY - this.pan.y;
                this.frames.schedule();
            }
        });
        on(window, 'mouseup', (e) => {
            if (inNodeProfile(e)) return;
            this.frames.flush(); this.gestureRect = null; this.host.classList.remove('pc-interacting');
            if (this.marquee) {
                this.#updateMarquee(e); const m = this.marquee; this.marquee = null; m.box.remove();
                if (!m.moved && m.mode === 'replace') this.setMulti([]);
                return;
            }
            if (this.drag) {
                const d = this.drag; this.drag = null;
                const ids = d.id ? [d.id] : d.several.map(([id]) => id);
                if (d.moved) {
                    this.hooks.onDragBlock?.(false);
                    if (d.comment) {
                        const draw = this.graph;
                        const positions = ids.map(id => draw.nodes[id]).filter(Boolean).map(node => ({ id: node.id, x: node.x, y: node.y, ...(isCommentFrame(node) ? { w: this.widthOf(node), h: this.heightOf(node) } : {}) }));
                        const groups = (d.groups ?? []).map(saved => draw.groups?.[saved.id]).filter(Boolean)
                            .map(group => ({ id: group.id, x: group.x, y: group.y, ...(group.frame ? { frame: structuredClone(group.frame) } : {}) }));
                        const result = this.#canEdit() && this.hooks.onCommentLayout?.(d.capture, positions, groups);
                        if ((!result || result.ok === false) && this.graph === draw) { this.#restoreDrag(d); if (!this.#canEdit()) this.render(); else this.#renderPositions(ids); }
                    } else this.hooks.onPresentationChange?.(ids, (d.groups ?? []).map(group => group.id));
                }
                else if (d.clickedGroup) { this.multi.clear(); this.select({ kind: 'group', id: d.clickedGroup }); }
                else if (d.clicked) this.setMulti([d.clicked]);
                this.#paintSelection();
            }
            if (this.pan) { this.frames.flush(); this.pan = null; this.host.classList.remove('pc-panning'); this.hooks.onViewCommit?.(); }
        });
        on(host, 'dblclick', (e) => {
            if (inNodeProfile(e)) return;
            if (inEditor(e)) return;
            if (e.target.closest('[data-action]')) return;
            const comment = e.target.closest('.pc-comment-header')?.closest('.pc-comment-frame');
            if (comment) { this.hooks.onReveal?.({ kind: 'node', id: comment.dataset.id }); return; }
            const groupEl = e.target.closest('.pc-node-group, .pc-group-frame-head');
            if (groupEl) {
                const gid = groupEl.dataset.group ?? groupEl.closest('[data-group]')?.dataset.group;
                const g = this.graph.groups?.[gid];
                if (g) this.setCollapsed(gid, !g.collapsed);
                return;
            }
            const nodeEl = e.target.closest('.pc-node[data-id]');
            if (nodeEl) {
                if (e.target.closest('.pc-port')) return;
                this.hooks.onOpen?.(this.graph.nodes[nodeEl.dataset.id]);
                return;
            }
            const wireHit = e.target.closest('.pc-wire-hit');
            if (wireHit) {
                {
                    e.preventDefault(); e.stopPropagation();
                    if (this.#canEdit()) this.#dispatchNative({ type: 'wire-double-click', wireId: wireHit.dataset.id,
                        direct: !!this.graph.wires[wireHit.dataset.id]?.from, graphPoint: this.toGraph(e.clientX, e.clientY), timestamp: e.timeStamp,
                        alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey }, e);
                }
                return;
            }
            this.#openNativeSearch(e);
        });
        on(host, 'contextmenu', (e) => {
            if (inNodeProfile(e)) return;
            if (inEditor(e)) return;
            e.preventDefault();
            {
                const pin = this.#nativePin(e.target), bridge = this.#nativeBridge();
                if (pin && bridge) {
                    this.gestureStart = { selection: this.selection && { ...this.selection }, multi: [...this.multi], wireMulti: [...this.wireMulti] };
                    const result = bridge.openPinMenu({ pin, screenAnchor: { x: e.clientX, y: e.clientY },
                        readOnly: !this.#canEdit(), ...this.#nativeAttachments(pin) });
                    this.updateNativeWire(result.view, result.requests); return;
                }
                if (!e.target.closest('.pc-node, .pc-group-frame, .pc-wire-hit, .pc-comment-frame')) {
                    if (this.hooks.onEmptyContextMenu?.({ event: e, at: this.toGraph(e.clientX, e.clientY) })) return;
                    this.#openNativeSearch(e); return;
                }
            }
            const nodeEl = e.target.closest('.pc-node[data-id], .pc-comment-frame[data-id]');
            const groupEl = e.target.closest('.pc-node-group, .pc-group-frame-head');
            const gid = groupEl ? (groupEl.dataset.group ?? groupEl.closest('[data-group]')?.dataset.group) : null;
            const wireHit = e.target.closest('.pc-wire-hit');
            this.hooks.onContextMenu?.({
                event: e,
                group: gid ? this.graph.groups?.[gid] ?? null : null,
                several: nodeEl && this.multi.size > 1 && this.multi.has(nodeEl.dataset.id) ? [...this.multi] : null,
                node: nodeEl ? this.graph.nodes[nodeEl.dataset.id] : null,
                wire: wireHit ? this.graph.wires[wireHit.dataset.id] : null,
                at: this.toGraph(e.clientX, e.clientY),
            });
        });
    }

    select(sel) {
        if (sel?.kind === 'wire') this.wireMulti.add(sel.id); else this.wireMulti.clear();
        this.selection = sel; this.#paintSelection();
        const pick = !sel ? null : sel.kind === 'node' ? this.graph.nodes[sel.id] : sel.kind === 'group' ? this.graph.groups?.[sel.id] : this.graph.wires[sel.id];
        this.hooks.onSelect?.(pick ?? null, sel?.kind ?? null);
    }

    async deleteSelection() {
        if (!this.graph || !this.#canEdit()) return false;
        if (this.wireMulti.size || this.selection?.kind === 'wire') {
            const ids = this.wireMulti.size ? [...this.wireMulti] : [this.selection.id];
            const bridge = this.#nativeBridge(); if (!bridge) return false;
            const result = bridge.disconnectWires(ids); this.updateNativeWire(result.view, result.requests); return true;
        }
        const sel = this.multi.size > 1 ? { kind: 'nodes', ids: [...this.multi] } : this.selection && { ...this.selection };
        return sel && this.hooks.onNativeDelete ? this.hooks.onNativeDelete(sel) : false;
    }
}
