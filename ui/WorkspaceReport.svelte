<script lang="ts">
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import { presentDiagnostics } from '../src/ui/diagnostics.js';
    import type { WorkflowView } from './types';
    let { panel, workflow, version, referenceUrl, guideUrl }: { panel: string; workflow?: WorkflowView; version: string; referenceUrl: string; guideUrl: string } = $props();
    let diagnostics = $derived(workflow?.diagnostics ?? presentDiagnostics(workflow?.issues ?? []));
</script>
{#if panel === 'validate-workflow'}
    {#if workflow}
        <p>Root workflow: <strong>{workflow.name}</strong> · {workflow.phase} · maximum {workflow.callBound} model requests.</p>
        {#if diagnostics.length}<ul>{#each diagnostics as diagnostic (diagnostic.id)}<li><DiagnosticMessage {diagnostic} /></li>{/each}</ul>
        {:else}<p role="status">No validation issues found.</p>{/if}
        <p>Validation checks the current workflow without running it. Diagnostic previews and Apply recheck their inputs when used.</p>
    {:else}<p>Workflow validation is unavailable.</p>{/if}
{:else if panel === 'about'}
    <p><strong>Lattice {version}</strong></p>
    <p>Named-pin workflows, optional scene guidance and reviewed reply repairs for SillyTavern.</p>
    <p><a href={guideUrl} target="_blank" rel="noreferrer">Project guide</a></p>
{:else if panel === 'node-reference'}
    <p>Browse the node shelf by family. Select a node to read its controls, connections and help in Details.</p>
    <p><a href={referenceUrl} target="_blank" rel="noreferrer">Open the complete node reference</a></p>
{:else if panel === 'shortcuts'}
    <table><thead><tr><th>Action</th><th>Shortcut</th></tr></thead><tbody>
        <tr><td>Undo / Redo</td><td>Ctrl Z / Ctrl Shift Z</td></tr>
        <tr><td>Cut / Copy / Paste</td><td>Ctrl X / Ctrl C / Ctrl V</td></tr>
        <tr><td>Duplicate / Delete selection</td><td>Ctrl D / Delete</td></tr>
        <tr><td>Select all</td><td>Ctrl A</td></tr>
        <tr><td>Group / Ungroup</td><td>Ctrl G / Ctrl Shift G</td></tr>
        <tr><td>Comment selection / Add comment</td><td>C</td></tr>
        <tr><td>Fit and center selection</td><td>F</td></tr>
        <tr><td>Rename selection</td><td>F2</td></tr>
        <tr><td>Run to selected node</td><td>R</td></tr>
        <tr><td>Target selected node / Clear target</td><td>T</td></tr>
        <tr><td>Pan / Zoom</td><td>Middle mouse / Wheel</td></tr>
        <tr><td>Zoom out / Zoom in</td><td>[ / ] with a graph camera focused</td></tr>
        <tr><td>Dismiss a menu or panel</td><td>Escape</td></tr>
    </tbody></table>
    <p>In menus, use arrows to move, Home/End to jump, type a label to find it, and Enter/Space to choose it. Tab dismisses the menu.</p>
{:else}
    <p>Browse node families on the floating shelf. Middle mouse pans the graph; the wheel zooms around the pointer. Use the dividers or their arrow keys to resize Preview and Details. View controls panel visibility and restores the default layout.</p>
    <p>File opens workflow documents, saves the current file, imports a fragment into the current graph, and exports a portable copy without local connections. Graph tabs open child views of the current document.</p>
    <p>Enable Lattice while the unified document is open, then Send in SillyTavern. Choose model connections on the node bar and advanced overrides in Details. Workflow › Configure opens Workflow Data, and Memory recall offers queue actions and an overview.</p>
    <p>Graph groups nodes, creates and saves subgraphs, adds comments and manages portals. Right-click actions remain available beside the relevant node or pin.</p>
    <p>Preview follows selection until you pin an output or target a node with T. Targeting keeps that node's output visible while you select other nodes; T moves or clears the target. Workflow › Run to current output tests its dependencies within the displayed request bound. Apply and Reject stay beside the exact result they review.</p>
    <p><a href={guideUrl} target="_blank" rel="noreferrer">Open the project guide</a> · <a href={referenceUrl} target="_blank" rel="noreferrer">Node reference</a></p>
{/if}
<style>
    p, li, td, th { font-size: 13px; line-height: 1.55; }
    p { margin: 12px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--pc-border); }
    th { color: var(--pc-muted); }
    a { color: var(--pc-accent); }
</style>
