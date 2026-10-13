import { getNodeGuide, describeGuideControl } from './node-guide-content.js?v=0.27.3';

/** A guide is a display projection of the selected node, never an editor. */
export function projectNodeGuide(details) {
    if (!details) return null;
    const key = details.guideKey ?? details.operation;
    const content = getNodeGuide(key);
    if (!content) return null;
    const settings = details.controls.map(control => ({
        key: control.key, label: control.label,
        description: describeGuideControl(key, control.key) || control.help,
    }));
    const add = (key, label) => settings.push({key, label, description: describeGuideControl(content.key, key)});
    if (details.fileInput) add('file', 'Choose / replace file');
    if (details.workflowData) add('workflowData', 'Workflow Data');
    if (details.boundary) {
        add('label', 'Port name'); add('kind', 'Type'); add('required', 'Required');
    } else {
        add('alias', 'Node name'); add('compact', 'Compact card');
        if (details.system || details.guideKey !== 'note' && details.guideKey !== 'subgraph') add('enabled', details.system ? 'Run this system' : 'Enabled');
        if (details.guideKey === 'subgraph') { add('definition', 'Pinned definition'); add('parameters', 'Exposed settings'); add('bindings', 'Model bindings'); }
        if (details.guideKey === 'note') add('content', 'Notes');
    }
    if (details.phaseEditable) add('phase', 'Workflow stage');
    if (details.model) { add('profileId', 'Connection'); add('model', 'Model override'); add('modelRole', 'Model role'); }
    if (details.helperBindings) add('helperBindings', 'Helper model connections');
    if (details.modifiers) add('modifiers', 'Text modifiers');
    return { ...content, card: details.guideCard ?? null, settings };
}

export function projectCommentGuide(comment) {
    const content = getNodeGuide('comment');
    if (!content) return null;
    return { ...content, card: null, comment, settings: ['title', 'content', 'color', 'moveContents'].map(key => ({
        key, label: ({title: 'Title', content: 'Notes', color: 'Color', moveContents: 'Move contents'})[key],
        description: describeGuideControl('comment', key),
    })) };
}
