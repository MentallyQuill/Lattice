/** Lattice launcher and host integration. The workflow never replaces SillyTavern's prompt. */
import { MODULE, settings, save, ctx, safe, activeWorkflow, documentSession, onWorkflowActivated } from './src/state.js?v=0.26.0';
import { getNativeWorkflowController, initializeNativeWorkflowController, workflowSignature, sendWorkflowState } from './src/run.js?v=0.26.0';
import * as UI from './src/ui.js?v=0.26.0';
import { applyTheme } from './src/theme.js?v=0.26.0';
import { renderThemeEditor } from './src/theme-editor.js?v=0.26.0';
const logoUrl = new URL('./assets/lattice-logo.svg', import.meta.url).href;

globalThis.latticeGenerationInterceptor = async (chat, contextSize, abort, type) => {
    await initializeNativeWorkflowController();
    return getNativeWorkflowController().beforeGenerate(chat, contextSize, abort, type);
};
const armed = () => settings().enabled === true;
function updateState() {
    save(); document.dispatchEvent(new CustomEvent('pc-state'));
    UI.refreshIfOpen(); paintSendbar();
}
function addLauncher() {
    const menu = document.getElementById('extensionsMenu');
    if (menu && !document.getElementById('pc-menu-launch')) {
        const item = document.createElement('div');
        item.id = 'pc-menu-launch'; item.className = 'list-group-item flex-container flexGap5 interactable'; item.tabIndex = 0;
        item.innerHTML = '<i class="fa-solid fa-diagram-project"></i><span>Lattice</span>';
        item.addEventListener('click', () => UI.open());
        item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); UI.open(); } });
        menu.append(item);
    }
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host || document.getElementById('pc-settings')) return;
    const block = document.createElement('div'); block.id = 'pc-settings'; block.className = 'pc-settings-block';
    block.innerHTML = '<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>Lattice</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"><label class="checkbox_label" for="pc-enabled"><input id="pc-enabled" type="checkbox"><span id="pc-arm-label"></span></label><div class="pc-settings-hint">When enabled, Send follows the open workflow. Legacy post workflows run manually and require review. SillyTavern builds its normal prompt.</div><label class="checkbox_label" for="pc-sendbar-opt"><input id="pc-sendbar-opt" type="checkbox"><span>Show Lattice in the chat bar</span></label><div id="pc-theme-editor"></div><button id="pc-open-btn" class="menu_button">Open Lattice</button></div></div>';
    host.append(block);
    const enabled = block.querySelector('#pc-enabled'); enabled.checked = armed();
    enabled.addEventListener('change', () => { settings().enabled = enabled.checked; updateState(); });
    const show = block.querySelector('#pc-sendbar-opt'); show.checked = settings().ui.sendbarButton !== false;
    show.addEventListener('change', () => { settings().ui.sendbarButton = show.checked; updateState(); addSendbarButton(); });
    block.querySelector('#pc-open-btn').addEventListener('click', () => UI.open());
    renderThemeEditor(block.querySelector('#pc-theme-editor')); paintSendbar();
}
function addSendbarButton() {
    const existing = document.getElementById('pc-sendbar');
    if (settings().ui.sendbarButton === false) { existing?.remove(); return true; }
    const bar = document.getElementById('leftSendForm'); if (!bar) return false;
    if (existing) { if (existing.parentElement !== bar) bar.append(existing); paintSendbar(); return true; }
    const button = document.createElement('button');
    button.id = 'pc-sendbar'; button.className = 'pc-chat-launcher interactable'; button.type = 'button'; button.setAttribute('aria-label', 'Open Lattice');
    const logo = document.createElement('img'); logo.src = logoUrl; logo.alt = ''; logo.draggable = false; logo.setAttribute('aria-hidden', 'true'); button.append(logo);
    button.addEventListener('click', () => UI.open());
    button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); UI.open(); } });
    button.addEventListener('contextmenu', event => {
        event.preventDefault(); settings().enabled = !armed(); updateState();
        const status = sendWorkflowState(); safe(() => globalThis.toastr?.info(armed() ? status.armedText : status.offText, 'Lattice'));
    });
    button.addEventListener('mouseenter', paintSendbar);
    bar.append(button);
    paintSendbar(); return true;
}
function paintSendbar() {
    const status = sendWorkflowState(), enabled = armed();
    const label = document.getElementById('pc-arm-label'); if (label) label.textContent = status.armLabel;
    const checkbox = document.getElementById('pc-enabled'); if (checkbox) checkbox.checked = enabled;
    const button = document.getElementById('pc-sendbar'); if (!button) return;
    button.classList.toggle('pc-sendbar-on', enabled && status.automatic);
    button.classList.toggle('pc-sendbar-nograph', enabled && !status.automatic);
    button.title = (enabled ? status.armedText : status.offText) + '\nClick to open. Right-click to enable or disable.';
}
function mountLauncher() {
    let attempts = 0;
    const mount = () => {
        addLauncher(); const bar = addSendbarButton();
        if ((!bar || !document.getElementById('pc-menu-launch') || !document.getElementById('pc-settings')) && attempts++ < 40) setTimeout(mount, 250);
    }; mount();
}
function addSlashCommand() {
    const context = ctx();
    try {
        const { SlashCommandParser, SlashCommand } = context;
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'lattice',
            helpString: 'Open Lattice, or enable workflows with <code>/lattice on</code> and <code>/lattice off</code>.',
            unnamedArgumentList: [],
            callback: (_args, value) => {
                const action = String(value ?? '').trim().toLowerCase();
                if (['on', 'arm', 'off', 'disarm'].includes(action)) { settings().enabled = ['on', 'arm'].includes(action); updateState(); return settings().enabled ? 'enabled' : 'off'; }
                UI.toggle(); return '';
            },
        }));
    } catch (error) { console.warn('[Lattice] slash command unavailable', error); }
}
function boot() {
    try {
        const context = ctx(); settings(); void initializeNativeWorkflowController();
        globalThis.addEventListener?.('unload', () => getNativeWorkflowController().dispose(), { once: true });
        const snapshot = () => {
            const graph = activeWorkflow();
            return { token: documentSession.capture(), signature: JSON.stringify([settings().enabled, workflowSignature(graph)]) };
        };
        let previous = snapshot();
        document.addEventListener('pc-state', () => {
            const next = snapshot();
            if (next.signature !== previous.signature || !documentSession.stillCurrent(previous.token)) getNativeWorkflowController().cancel('Workflow settings changed');
            previous = next; paintSendbar();
        });
        onWorkflowActivated(() => {
            previous = snapshot(); UI.refreshIfOpen(); paintSendbar();
        });
        applyTheme();
        for (const name of ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED']) {
            const event = context.eventTypes?.[name];
            if (event) context.eventSource.on(event, () => { UI.refreshIfOpen(); paintSendbar(); });
        }
        mountLauncher(); addSlashCommand();
        globalThis.lattice = { open: UI.open, close: UI.close, toggle: UI.toggle };
        console.log('[' + MODULE + '] ready');
    } catch (error) {
        console.error('[Lattice] failed to start', error);
        safe(() => globalThis.toastr?.error(error.message, 'Lattice could not open'));
    }
}
if (globalThis.SillyTavern?.getContext) boot();
else document.addEventListener('DOMContentLoaded', boot, { once: true });
