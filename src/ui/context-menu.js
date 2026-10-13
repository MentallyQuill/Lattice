const activeMenus = new WeakMap();
let nextMenuId = 0;

import { menuIconPaths as iconPaths } from './menu-icons.js?v=0.27.2';

function svgIcon(document, path, className) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.append(shape);
    return svg;
}

/** Render a context menu and return its idempotent dismissal function. */
export function showContextMenu({ root, x, y, label = 'Context actions', items = [], isCurrent = () => true, restoreFocus }) {
    activeMenus.get(root)?.();
    const document = root.ownerDocument, view = document.defaultView, previousFocus = document.activeElement;
    const menus = [];
    let dismissed = false;
    const listen = (state, target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        state.cleanup.push(() => target.removeEventListener(type, handler, options));
    };
    const closeAfter = index => {
        while (menus.length > index + 1) {
            const state = menus.pop();
            for (const cleanup of state.cleanup) cleanup();
            state.element.remove();
            state.parent?.button.setAttribute('aria-expanded', 'false');
            state.parent?.button.removeAttribute('aria-controls');
        }
    };
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        closeAfter(-1);
        document.removeEventListener('pointerdown', outsidePointer, true);
        view.removeEventListener('resize', dismiss);
        view.removeEventListener('scroll', outsideScroll, true);
        if (activeMenus.get(root) === dismiss) activeMenus.delete(root);
    };
    const inside = target => target?.nodeType && menus.some(state => state.element.contains(target));
    const outsidePointer = event => { if (!inside(event.target)) dismiss(); };
    const outsideScroll = event => { if (!inside(event.target)) dismiss(); };
    const live = entry => !dismissed && entry && menus.includes(entry.menu) && !entry.item.disabled;
    const current = () => { if (isCurrent()) return true; dismiss(); return false; };
    const focusFirst = state => (state.entries.find(entry => !entry.item.disabled)?.button ?? state.element).focus();
    const position = (state, left, top, anchor) => {
        const width = view.innerWidth || document.documentElement.clientWidth;
        const height = view.innerHeight || document.documentElement.clientHeight;
        const rect = state.element.getBoundingClientRect();
        if (anchor && left + rect.width > width - 8) left = anchor.left - rect.width;
        state.element.style.left = Math.max(8, Math.min(left, width - rect.width - 8)) + 'px';
        state.element.style.top = Math.max(8, Math.min(top, height - rect.height - 8)) + 'px';
    };
    const openChildren = (entry, focus) => {
        if (!live(entry) || !entry.item.children?.length || !current()) return;
        const index = menus.indexOf(entry.menu), existing = menus[index + 1];
        if (existing?.parent === entry) { if (focus) focusFirst(existing); return; }
        closeAfter(index);
        const state = render(entry.item.children, entry.item.label + ' options', entry);
        entry.button.setAttribute('aria-expanded', 'true');
        entry.button.setAttribute('aria-controls', state.element.id);
        const anchor = entry.button.getBoundingClientRect();
        position(state, anchor.right, anchor.top, anchor);
        if (focus) focusFirst(state);
    };
    const choose = entry => {
        if (!live(entry) || !current()) return;
        if (entry.item.children?.length) { openChildren(entry, true); return; }
        dismiss();
        entry.item.action?.();
    };
    const keydown = (state, event) => {
        event.stopPropagation();
        const shortcut = menus.flatMap(menu => menu.entries).find(entry => entry.item.matchesShortcut?.(event));
        if (shortcut) {
            if (event.defaultPrevented) return;
            event.preventDefault();
            if (!event.repeat) choose(shortcut);
            return;
        }
        if (event.key === 'Tab') { dismiss(); return; }
        if (event.key === 'Escape') {
            event.preventDefault();
            dismiss();
            if (restoreFocus) restoreFocus();
            else if (previousFocus?.isConnected) previousFocus.focus?.();
            return;
        }
        const enabled = state.entries.filter(entry => !entry.item.disabled);
        const selected = state.entries.find(entry => entry.button === document.activeElement);
        const index = enabled.indexOf(selected);
        let next;
        if (event.key === 'ArrowDown') next = enabled[(index + 1) % enabled.length];
        else if (event.key === 'ArrowUp') next = enabled[(index - 1 + enabled.length) % enabled.length];
        else if (event.key === 'Home') next = enabled[0];
        else if (event.key === 'End') next = enabled.at(-1);
        else if (event.key === 'ArrowRight') openChildren(selected, true);
        else if (event.key === 'ArrowLeft') {
            if (state.parent) { closeAfter(menus.indexOf(state) - 1); state.parent.button.focus(); }
        } else if (event.key === 'Enter' || event.key === ' ') choose(selected);
        else return;
        event.preventDefault();
        if (next) { closeAfter(menus.indexOf(state)); next.button.focus(); }
    };
    const render = (descriptors, menuLabel, parent) => {
        const element = document.createElement('div');
        element.className = 'pc-context-menu' + (parent ? ' pc-context-submenu' : '');
        element.id = 'pc-context-menu-' + ++nextMenuId;
        element.setAttribute('role', 'menu');
        element.setAttribute('aria-label', menuLabel);
        element.tabIndex = -1;
        const state = { element, parent, entries: [], cleanup: [] };
        menus.push(state);
        for (const item of descriptors) {
            if (item.separator) {
                const divider = document.createElement('div');
                divider.className = 'pc-context-separator';
                divider.setAttribute('role', 'separator');
                element.append(divider);
                continue;
            }
            const button = document.createElement('button'), checked = typeof item.checked === 'boolean';
            button.type = 'button';
            button.className = 'pc-context-item';
            button.setAttribute('role', checked ? 'menuitemcheckbox' : 'menuitem');
            button.setAttribute('aria-label', item.label);
            button.setAttribute('aria-disabled', String(!!item.disabled));
            button.tabIndex = -1;
            button.disabled = !!item.disabled;
            if (checked) button.setAttribute('aria-checked', String(item.checked));
            if (item.id) button.dataset.command = item.id;
            if (item.tone) button.dataset.tone = item.tone;
            if (item.hint) button.title = item.hint;
            if (iconPaths[item.icon]) button.append(svgIcon(document, iconPaths[item.icon], 'pc-context-icon'));
            else {
                const gutter = document.createElement('span');
                gutter.className = 'pc-context-icon';
                gutter.setAttribute('aria-hidden', 'true');
                button.append(gutter);
            }
            const text = document.createElement('span');
            text.className = 'pc-context-label';
            text.textContent = item.label;
            button.append(text);
            const trailing = document.createElement('span');
            trailing.className = 'pc-context-trailing';
            if (item.shortcut) {
                const shortcut = document.createElement('kbd');
                shortcut.className = 'pc-context-shortcut';
                shortcut.setAttribute('aria-hidden', 'true');
                shortcut.textContent = item.shortcut;
                trailing.append(shortcut);
            }
            if (checked) {
                const check = document.createElement('span');
                check.className = 'pc-context-check';
                check.setAttribute('aria-hidden', 'true');
                check.textContent = item.checked ? '✓' : '';
                trailing.append(check);
            }
            if (item.children?.length) {
                button.setAttribute('aria-haspopup', 'menu');
                button.setAttribute('aria-expanded', 'false');
                trailing.append(svgIcon(document, 'M9 5l7 7-7 7', 'pc-context-chevron'));
            }
            if (trailing.children.length) button.append(trailing);
            if (item.disabled && item.hint) {
                const reason = document.createElement('span');
                reason.id = element.id + '-reason-' + state.entries.length;
                reason.className = 'pc-context-reason';
                reason.textContent = item.hint;
                button.setAttribute('aria-describedby', reason.id);
                button.append(reason);
            }
            const entry = { button, item, menu: state };
            state.entries.push(entry);
            listen(state, button, 'click', event => { event.stopPropagation(); choose(entry); });
            listen(state, button, 'pointerenter', () => {
                if (!live(entry)) return;
                if (entry.item.children?.length) openChildren(entry, false);
                else closeAfter(menus.indexOf(state));
            });
            element.append(button);
        }
        listen(state, element, 'keydown', event => keydown(state, event));
        listen(state, element, 'keyup', event => event.stopPropagation());
        listen(state, element, 'pointerdown', event => event.stopPropagation());
        root.append(element);
        return state;
    };
    const main = render(items, label);
    position(main, x, y);
    document.addEventListener('pointerdown', outsidePointer, true);
    view.addEventListener('resize', dismiss);
    view.addEventListener('scroll', outsideScroll, true);
    activeMenus.set(root, dismiss);
    focusFirst(main);
    return dismiss;
}
