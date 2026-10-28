/** Lattice launcher and host integration. The workflow never replaces SillyTavern's prompt. */
import { MODULE, settings, save, ctx, safe, activeWorkflow, documentSession, onWorkflowActivated } from './src/state.js?v=0.30.1';
import { getNativeWorkflowController, initializeNativeWorkflowController, workflowSignature, sendWorkflowState, subscribeWorkflowRunEvents } from './src/run.js?v=0.30.1';
import * as UI from './src/ui.js?v=0.30.1';
import { applyTheme } from './src/theme.js?v=0.30.1';
import { presentDiagnostic } from './src/ui/diagnostics.js?v=0.30.1';
import { createChatProgress } from './src/ui/chat-progress.js?v=0.30.1';
const logoUrl = new URL('./assets/lattice-logo.svg', import.meta.url).href;
let chatProgress;

globalThis.latticeGenerationInterceptor = async (chat, contextSize, abort, type) => {
    await initializeNativeWorkflowController();
    return getNativeWorkflowController().beforeGenerate(chat, contextSize, abort, type);
};
const isEnabled = () => settings().enabled === true;
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
    block.style.setProperty('--pc-settings-logo', `url("${logoUrl}")`);
    block.innerHTML = `<div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header pc-settings-header">
            <span class="pc-settings-brand"><span class="pc-settings-logo" aria-hidden="true"></span><b>Lattice</b></span>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content"><div class="pc-settings-content">
            <div class="pc-settings-controls">
                <label class="pc-settings-toggle" for="pc-enabled">
                    <span class="pc-settings-copy"><strong id="pc-enable-label">Enable Lattice</strong><small id="pc-enabled-hint">Use the open workflow when you send a message.</small></span>
                    <span class="pc-settings-toggle-control"><input id="pc-enabled" class="pc-enable-input" type="checkbox" role="switch" aria-labelledby="pc-enable-label" aria-describedby="pc-enabled-hint"><span class="pc-enable-state" aria-hidden="true">Off</span></span>
                </label>
                <label class="pc-settings-toggle" for="pc-sendbar-opt">
                    <span class="pc-settings-copy"><strong id="pc-sendbar-label">Chat-bar shortcut</strong><small id="pc-sendbar-hint">Show Lattice beside the message box.</small></span>
                    <span class="pc-settings-toggle-control"><input id="pc-sendbar-opt" class="pc-enable-input" type="checkbox" role="switch" aria-label="Show Lattice in the chat bar" aria-describedby="pc-sendbar-hint"><span class="pc-enable-state" aria-hidden="true">Off</span></span>
                </label>
            </div>
            <div class="pc-settings-workflow"><span>Current workflow</span><strong id="pc-settings-workflow-name"></strong></div>
            <button id="pc-open-btn" class="pc-settings-open" type="button"><span class="pc-settings-logo" aria-hidden="true"></span><span>Open Lattice</span><span class="pc-settings-open-arrow" aria-hidden="true">→</span></button>
        </div></div>
    </div>`;
    host.append(block);
    const enabled = block.querySelector('#pc-enabled'); enabled.checked = isEnabled();
    enabled.addEventListener('change', () => { settings().enabled = enabled.checked; updateState(); });
    const show = block.querySelector('#pc-sendbar-opt'); show.checked = settings().ui.sendbarButton !== false;
    show.addEventListener('change', () => { settings().ui.sendbarButton = show.checked; updateState(); addSendbarButton(); });
    block.querySelector('#pc-open-btn').addEventListener('click', () => UI.open());
    paintSendbar();
}
function addSendbarButton() {
    const existing = document.getElementById('pc-sendbar');
    if (settings().ui.sendbarButton === false) { chatProgress?.mount(null); existing?.remove(); return true; }
    const bar = document.getElementById('leftSendForm'); if (!bar) return false;
    if (existing) { if (existing.parentElement !== bar) bar.append(existing); chatProgress?.mount(existing); paintSendbar(); return true; }
    const button = document.createElement('button');
    button.id = 'pc-sendbar'; button.className = 'pc-chat-launcher interactable'; button.type = 'button'; button.setAttribute('aria-label', 'Open Lattice');
    const logo = document.createElement('span'); logo.className = 'pc-chat-launcher-icon'; logo.style.setProperty('--pc-launcher-logo', `url("${logoUrl}")`); logo.setAttribute('aria-hidden', 'true'); button.append(logo);
    button.addEventListener('click', () => UI.open());
    button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); UI.open(); } });
    button.addEventListener('contextmenu', event => {
        event.preventDefault(); settings().enabled = !isEnabled(); updateState();
        const status = sendWorkflowState(); safe(() => globalThis.toastr?.info(isEnabled() ? status.enabledText : status.offText, 'Lattice'));
    });
    button.addEventListener('mouseenter', paintSendbar);
    bar.append(button);
    chatProgress?.mount(button);
    paintSendbar(); return true;
}
function paintSendbar() {
    const status = sendWorkflowState(), active = isEnabled();
    document.getElementById('pc-settings')?.classList.toggle('pc-settings-enabled', active);
    const label = document.getElementById('pc-enable-label'); if (label) label.textContent = status.enableLabel;
    for (const [id, on] of [['pc-enabled', active], ['pc-sendbar-opt', settings().ui.sendbarButton !== false]]) {
        const checkbox = document.getElementById(id); if (!checkbox) continue;
        checkbox.checked = on;
        const row = checkbox.closest('.pc-settings-toggle');
        row?.classList.toggle('pc-on', on);
        const state = row?.querySelector('.pc-enable-state'); if (state) state.textContent = on ? 'On' : 'Off';
    }
    const workflowName = document.getElementById('pc-settings-workflow-name');
    if (workflowName) workflowName.textContent = activeWorkflow()?.name || 'No workflow open';
    const button = document.getElementById('pc-sendbar'); if (!button) return;
    button.classList.toggle('pc-sendbar-on', active);
    button.classList.toggle('pc-sendbar-nograph', active && !status.automatic);
    const progress = button.querySelector('.pc-chat-progress:not([hidden])');
    button.title = (progress?.title ? progress.title + '\n' : '') + (active ? status.enabledText : status.offText) + '\nClick to open. Right-click to enable or disable.';
}
function mountLauncher() {
    chatProgress ??= createChatProgress({ document,
        subscribeActivity: listener => getNativeWorkflowController().subscribeActivity(listener),
        subscribeEvents: subscribeWorkflowRunEvents,
    });
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
                if (['on', 'off'].includes(action)) { settings().enabled = action === 'on'; updateState(); return settings().enabled ? 'enabled' : 'off'; }
                UI.toggle(); return '';
            },
        }));
    } catch (error) { console.warn('[Lattice] slash command unavailable', error); }
}
function boot() {
    try {
        const context = ctx(); settings(); mountLauncher(); void initializeNativeWorkflowController();
        globalThis.addEventListener?.('unload', () => { chatProgress?.dispose(); getNativeWorkflowController().dispose(); }, { once: true });
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
            previous = snapshot(); paintSendbar();
        });
        applyTheme();
        for (const name of ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED']) {
            const event = context.eventTypes?.[name];
            if (event) context.eventSource.on(event, () => { UI.refreshIfOpen(); paintSendbar(); });
        }
        addSlashCommand();
        globalThis.lattice = { open: UI.open, close: UI.close, toggle: UI.toggle };
        console.log('[' + MODULE + '] ready');
    } catch (error) {
        console.error('[Lattice] failed to start', error);
        const issue = presentDiagnostic(error, { action: 'open Lattice' });
        safe(() => globalThis.toastr?.[issue.severity]?.(issue.message, 'Lattice could not open', { timeOut: 0, extendedTimeOut: 0, closeButton: true, tapToDismiss: false, escapeHtml: true }));
    }
}
if (globalThis.SillyTavern?.getContext) boot();
else document.addEventListener('DOMContentLoaded', boot, { once: true });
