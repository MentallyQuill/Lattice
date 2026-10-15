import { nodeDecorationElements, measureDecorationExtents } from '../src/ui/node-decorations.js';
import NodeProfilePicker from './NodeProfilePicker.svelte';
import { mount, unmount, flushSync } from 'svelte';
import CanvasLayer from './CanvasLayer.svelte';
import Workbench from './Workbench.svelte';
import NodeCard from './NodeCard.svelte';
/** Measure the real card in the canvas cascade before committing its position. */
export function measureNodeCard(target, card, decorationRow) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
    host.setAttribute('aria-hidden', 'true'); host.inert = true; target.append(host);
    let component,decoration;
    try {
        component = mount(NodeCard, { target: host, props: { card:{...card,x:0,y:0}, actions: { hoverPin() {}, hostResult() {} } } });
        flushSync();
        const element=host.querySelector('.pc-node'),box=element.getBoundingClientRect();
        const {width,height}=box,scale=element.offsetWidth>0?width/element.offsetWidth:1;
        if(decorationRow) {
            decoration=mount(NodeProfilePicker,{target:host,props:{row:{...decorationRow,x:0,y:0,w:width/scale,h:height/scale,clearance:card.compact?38:0,authorityVersion:0,visibleBounds:{x:0,y:0,w:10000,h:10000}}}});flushSync();
        }
        const bounds=measureDecorationExtents(nodeDecorationElements(element,host.querySelector('.pc-node-profile')),box,1,{width,height});
        return {width,height,visualBounds:{x:bounds.left,y:bounds.top,w:bounds.right-bounds.left,h:bounds.bottom-bounds.top}};
    } finally {
        if(decoration)unmount(decoration);
        if (component) unmount(component);
        host.remove();
    }
}
export function mountCanvas(target, actions) {
    const component = mount(CanvasLayer, { target, props: { actions } });
    flushSync();
    return {
        ...component.getLayers(),
        applyScene: scene => flushSync(() => component.applyScene(scene)), setWirePreview: ghost => flushSync(() => component.setWirePreview(ghost)), setVisualStatus: trace => flushSync(() => component.setVisualStatus(trace)), setComments: (comments, actions) => flushSync(() => component.setComments(comments, actions)),
        setRecallStatus: status => flushSync(() => component.setRecallStatus(status)),
        setPreviewTarget: id => flushSync(() => component.setPreviewTarget(id)),
        setNodes: nodes => flushSync(() => component.setNodes(nodes)),
        setNodeProfiles: rows => flushSync(() => component.setNodeProfiles(rows)),
        setGroups: groups => flushSync(() => component.setGroups(groups)),
        setWires: (wires, bounds, ghost) => flushSync(() => component.setWires(wires, bounds, ghost)),
        setPositions: (nodes, groups, scene) => flushSync(() => { component.setPositions(nodes, groups); if (scene) component.applyScene(scene); }),
        destroy: () => unmount(component),
    };
}
export function mountWorkbench(target, actions) {
    const component = mount(Workbench, { target, props: { actions } }); flushSync();
    return { ...component.getParts(), update: view => flushSync(() => component.update(view)), updateActions: actions => flushSync(() => component.updateActions(actions)), revealPreview: () => flushSync(() => component.revealPreview()), renameGraphView: key => component.renameGraphView(key), focusCommentTitle: (id, isCurrent) => component.focusCommentTitle(id, isCurrent), destroy: () => unmount(component) };
}
