/** Both the live canvas and transient placement preview measure the same decorations. */
export function nodeDecorationElements(card, profile) {
    return [...(profile?.querySelectorAll('.pc-node-decoration-stack,.pc-node-readiness,.profile-bar') ?? []),...(card?.querySelectorAll('.pc-native-alias,.pc-node-target,.pc-modifier-badge') ?? [])];
}
export function measureDecorationExtents(elements, origin, scale, size) {
    let left=0,top=0,right=size.width,bottom=size.height,measured=false;
    for(const element of elements) {
        const box=element.getBoundingClientRect();if(!box.width || !box.height)continue;
        measured=true;left=Math.min(left,(box.left-origin.left)/scale);top=Math.min(top,(box.top-origin.top)/scale);right=Math.max(right,(box.right-origin.left)/scale);bottom=Math.max(bottom,(box.bottom-origin.top)/scale);
    }
    return {left,top,right,bottom,measured};
}
