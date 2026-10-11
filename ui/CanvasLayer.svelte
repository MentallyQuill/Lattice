<script lang="ts">
    import type {RecallBadgeView} from './recall-types';
    import { updateRenderSlots } from '../src/canvas/retained-scene.js';
    import NodeCard from './NodeCard.svelte';
    import GroupCard from './GroupCard.svelte';
    import WireLayer from './WireLayer.svelte';
    import CommentFrame from './CommentFrame.svelte';
    import NodeProfilePicker from './NodeProfilePicker.svelte';
    import type { NodeProfileData } from './node-profile-types';
    import type { CommentFrameData, CommentFrameActions } from './comment-types';
    import type { CanvasActions, NodeCardData, GroupCardData, WireData, PositionUpdate } from './types';
    let { actions }: { actions: CanvasActions } = $props();
    class Slot<T extends {id: string}> {
        id: string;
        value = $state.raw<T>(null as unknown as T);
        constructor(value: T) { this.id = value.id; this.value = value; }
    }
    const nodeSlots = new Map<string, Slot<NodeCardData>>(), groupSlots = new Map<string, Slot<GroupCardData>>(), commentSlots = new Map<string, Slot<CommentFrameData>>();
    let nodes = $state.raw<Slot<NodeCardData>[]>([]), groups = $state.raw<Slot<GroupCardData>[]>([]), wires = $state.raw<WireData[]>([]);
    let trace = $state.raw<Readonly<Record<string, {status: string}>>>({});
    let recall = $state.raw<Readonly<Record<string,RecallBadgeView>>>({});
    let previewTarget = $state<string | null>(null);
    let comments = $state.raw<Slot<CommentFrameData>[]>([]);
    let nodeProfiles = $state.raw<NodeProfileData[]>([]);
    let commentActions = $state.raw<CommentFrameActions>({ select() {}, update() {}, command() {} });
    let ghost = $state.raw<{ d: string; className: string; kind: string } | null>(null);
    let bounds = $state.raw({ w: 4000, h: 4000 });
    let viewport: HTMLDivElement, svg: SVGSVGElement, nodeLayer: HTMLDivElement, commentLayer: HTMLDivElement;
    export function getLayers() { return { viewport, svg, nodeLayer, commentLayer }; }
    export function setComments(value: CommentFrameData[], callbacks: CommentFrameActions) { comments = updateRenderSlots(value, comments, commentSlots, (row: CommentFrameData) => new Slot(row)); commentActions = callbacks; }
    export function setVisualStatus(value: Readonly<Record<string, {status: string}>>) { trace = value; }
    export function setWirePreview(value: typeof ghost) { ghost = value; }
    export function applyScene(value: {nodes?: NodeCardData[]; comments?: CommentFrameData[]; commentActions?: CommentFrameActions; groups?: GroupCardData[]; wires?: WireData[]; bounds?: typeof bounds; ghost?: typeof ghost; nodeProfiles?: NodeProfileData[]}) {
        if (value.nodes) setNodes(value.nodes);
        if (value.comments) comments = updateRenderSlots(value.comments, comments, commentSlots, (row: CommentFrameData) => new Slot(row));
        if (value.commentActions) commentActions = value.commentActions;
        if (value.groups) setGroups(value.groups);
        if (value.wires) wires = value.wires;
        if (value.bounds) bounds = value.bounds;
        if ('ghost' in value) ghost = value.ghost ?? null;
        if (value.nodeProfiles) nodeProfiles = value.nodeProfiles;
    }
    export function setRecallStatus(value:Readonly<Record<string,RecallBadgeView>>) { recall = value; }
    export function setPreviewTarget(id: string | null) { previewTarget = id; }
    export function setNodes(value: NodeCardData[]) { nodes = updateRenderSlots(value, nodes, nodeSlots, (row: NodeCardData) => new Slot(row)); }
    export function setNodeProfiles(value: NodeProfileData[]) { nodeProfiles = value; }
    export function setGroups(value: GroupCardData[]) { groups = updateRenderSlots(value, groups, groupSlots, (row: GroupCardData) => new Slot(row)); }
    export function setWires(value: WireData[], size: { w: number; h: number }, preview: typeof ghost) { wires = value; bounds = size; ghost = preview; }
    export function setPositions(nodeUpdates: PositionUpdate[], groupUpdates: PositionUpdate[]) {
        for (const update of nodeUpdates) for (const slots of [nodeSlots, commentSlots]) {
            const slot = slots.get(update.id);
            if (slot) slot.value = {...slot.value, ...update};
        }
        for (const update of groupUpdates) {
            const slot = groupSlots.get(update.id);
            if (slot) slot.value = {...slot.value, ...update};
        }
    }
</script>
<div class="pc-viewport" data-pc-renderer="svelte" bind:this={viewport}>
    <div class="pc-comment-layer" bind:this={commentLayer}>
        {#each comments as slot (slot.id)}<CommentFrame comment={slot.value} actions={commentActions} />{/each}
    </div>
    <svg class="pc-wires" width={bounds.w} height={bounds.h} viewBox={`0 0 ${bounds.w} ${bounds.h}`} bind:this={svg} aria-label="Canvas connections">
        <WireLayer {wires} {ghost} />
    </svg>
    <div class="pc-nodes" bind:this={nodeLayer}>
        {#each groups.filter(slot => !slot.value.collapsed) as slot (slot.id)}<GroupCard group={slot.value} {actions} />{/each}
        {#each nodes as slot (slot.id)}<NodeCard card={slot.value} recall={recall[slot.id]} status={trace[slot.id]?.status} targeted={previewTarget === slot.id} {actions} />{/each}
        {#each groups.filter(slot => slot.value.collapsed) as slot (slot.id)}<GroupCard group={slot.value} {actions} />{/each}
    </div>
    <div class="pc-node-profile-layer">
        {#each nodeProfiles as row (row.id)}<NodeProfilePicker {row} editProfile={actions.editProfile} refreshProfiles={actions.refreshProfiles} />{/each}
    </div>
</div>
<style>
    .pc-comment-layer { position: absolute; top: 0; left: 0; pointer-events: none; }
    .pc-node-profile-layer { position: absolute; top: 0; left: 0; pointer-events: none; }
</style>
