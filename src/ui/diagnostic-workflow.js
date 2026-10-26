const error = (id, title, message) => ({ id, severity: 'error', title, message });
const info = (id, title, message) => ({ id, severity: 'info', title, message });
const wire = error('wire-invalid', 'Connection needs attention', 'Reconnect existing compatible output and input pins. Remove connections to deleted nodes.');
const subgraph = error('subgraph-invalid', 'Subgraph data needs attention', 'The subgraph data does not match its saved definition. Check its definition, ports, and overrides before using it.');
const local = info('definition-read-only', 'Definition is read-only', 'Make a local copy before editing this subgraph definition.');

export const workflowCopy = {
    UPSTREAM_FAILED: error('upstream-failed', 'An earlier step failed', 'This step could not run because an earlier step failed. Inspect the earlier step’s diagnostic first.'),
    ARTIFACT_KIND: error('wire-type', 'Connection types do not match', 'Connect pins with compatible types. The output type must match the input type.'),
    AMBIGUOUS_INPUT: error('input-multiple', 'Input has more than one source', 'Each named input accepts one source. Remove the extra connection or combine the data in an appropriate node first.'),
    CYCLE: error('workflow-loop', 'Connections form a loop', 'The connections form a dependency loop. Remove a connection that feeds a later step back into an earlier step.'),
    MISSING_PORTAL: error('portal-missing', 'Portal source is missing', 'This portal consumer has no publisher in this graph. Select an existing portal or publish a matching output.'),
    INVALID_PORTAL: error('portal-invalid', 'Portal needs attention', 'Check the portal’s name, source output, and type. Publish an existing output with the same type.'),
    MISSING_TERMINAL: error('terminal-missing', 'Workflow needs an output', 'Add Review / Publish to finish a unified workflow, or a stage output to finish a helper.'),
    DISABLED_OPERATION: error('dependency-disabled', 'A required step is disabled', 'Enable the selected step and its required dependencies before using Run to here.'),
    INVALID_STAGE_DEPENDENCY: error('stage-reversed', 'Preparation depends on a reply', 'A preparation step cannot read response-stage output. Move a compatible node to the response stage or remove the reverse connection.'),
    WRONG_PHASE: error('stage-mismatch', 'Workflow stage does not match', 'Choose nodes and subgraphs that support the containing workflow stage. Retired workflows are available for archived export.'),
    INVALID_PHASE: error('node-stage', 'Node stage does not match', 'Choose a supported preparation or response stage in Details for this node.'),
    ROOT_ONLY_OPERATION: error('root-only', 'Step belongs in the root workflow', 'Place this step in the root workflow. Reusable helpers need explicit snapshot inputs for state.'),
    ROOT_BOUNDARY: error('root-boundary', 'Boundary belongs inside a subgraph', 'Add Input and Output boundary nodes inside an editable subgraph.'),
    ROOT_ONLY: error('root-authority', 'Full workflow acceptance is required', 'This action requires the authorized root workflow and cannot run as an isolated helper.'),
    ROOT_REQUIRED: error('root-settlement', 'Full workflow acceptance is required', 'Accept the full workflow result to commit its prepared changes. A manual preview does not authorize saving.'),
    UNKNOWN_OPERATION: error('operation-unsupported', 'Node type is not supported', 'This node type or version is not supported by the installed Lattice version. Check the workflow version and node reference.'),
    INVALID_SETTINGS: error('node-settings', 'Node settings need attention', 'Some saved settings are invalid. Check the affected node’s controls in Details.'),
    INVALID_CONFIGURATION: error('node-configuration', 'Node configuration needs attention', 'Use valid JSON containing the declared node controls, then complete the required settings in node configuration.'),
    INVALID_INPUT: error('input-invalid', 'Input data does not match', 'The input data does not match this step’s expected type or shape. Check the connected source and the node’s Details.'),
    INVALID_CONTEXT: error('context-invalid', 'Context data does not match', 'The context input is invalid. Check the connected context source and its message data.'),
    INVALID_TARGET: error('target-invalid', 'Choose a current output', 'Select an existing output pin or terminal step in the current workflow.'),
    INVALID_SELECTION: error('selection-changed', 'Selection needs attention', 'Select current workflow nodes before continuing.'),
    INVALID_GROUP: error('group-selection', 'Group selection needs attention', 'Select an editable group to ungroup, or at least two ordinary nodes to create a group.'),
    INVALID_JSON: error('workflow-json', 'JSON could not be read', 'The text is not valid JSON. Check the JSON syntax or choose a valid workflow file.'),
    MALFORMED_WORKFLOW: error('workflow-malformed', 'Workflow data is invalid', 'The workflow data is invalid or exceeds its size limit. Choose a valid Lattice workflow file.'),
    UNSUPPORTED_PACKAGE: error('workflow-package', 'Choose a Lattice workflow', 'Choose a compatible Lattice workflow document or supported portable workflow JSON.'),
    UNSUPPORTED_VERSION: error('workflow-version', 'Workflow version is not supported', 'This workflow uses an unsupported format or runtime version. Open a compatible workflow or check the installed Lattice version.'),
    MISSING_DEFINITION: error('definition-missing', 'Subgraph definition is missing', 'The subgraph’s exact saved definition is not included. Import a workflow or subgraph package that includes its pinned definition.'),
    DEFINITION_CONFLICT: error('definition-conflict', 'Subgraph versions conflict', 'Two subgraphs use the same identity and version for different content. Use an unambiguous saved definition or create a local copy.'),
    DEFINITION_RECURSION: error('definition-recursion', 'Subgraph includes itself', 'A subgraph cannot include itself through nested definitions. Remove the recursive instance.'),
    DEFINITION_DEPTH: error('definition-depth', 'Subgraphs are nested too deeply', 'The workflow exceeds eight nested subgraph levels. Flatten or simplify the nested definitions.'),
    DEFINITION_IN_USE: error('definition-in-use', 'Subgraph is still in use', 'Another saved subgraph uses this revision. Remove that dependency before deleting the saved definition.'),
    PARAMETER_IN_USE: error('parameter-in-use', 'Parameter is still in use', 'Reset the surviving override or remove the enclosing parameter exposure before removing this parameter.'),
    BOUNDARY_SELECTION: error('boundary-copy', 'Copy the subgraph or its interior', 'Input and Output boundary nodes belong to their subgraph definition. Copy the interior nodes or the whole subgraph instance.'),
    STALE_CONTEXT: error('view-changed', 'The view changed', 'The view or selection changed after this action was prepared. Reopen the affected controls or select the current node.'),
    STALE_DOCUMENT: error('document-changed', 'Workflow changed during editing', 'The workflow changed after the edit began. Prepare the edit again from the current workflow.'),
    UNSUPPORTED_VIEW: error('view-unavailable', 'Graph view is unavailable', 'This graph view is unavailable. Open an existing view in the current workflow.'),
    VIEW_INACTIVE: error('view-inactive', 'Graph view is unavailable', 'This graph view is unavailable. Open an existing view in the current workflow.'),
    STALE_DEFINITION: error('definition-changed', 'Subgraph changed', 'The subgraph definition changed after this action was prepared. Reopen the current subgraph and prepare the edit again.'),
    STALE_CANDIDATE: error('candidate-expired', 'Review is no longer current', 'This candidate is no longer available or no longer matches the selected reply. Prepare a new review from the current source; running model steps again makes another model request.'),
    APPLY_UNAVAILABLE: error('apply-unavailable', 'Reply application is unavailable', 'Required SillyTavern reply, save, or swipe services are unavailable. Check the host installation before applying this review.'),
    AUTO_APPLY_AMBIGUOUS: error('automatic-review-ambiguous', 'More than one automatic reply', 'Enable Automatically apply revised reply on only one selected Review / Publish node. The pending replies remain available for manual review.'),
    APPLY_FAILED: error('apply-failed', 'Reply could not be applied', 'The revision could not be applied and the original local message was restored. A save that was attempted may still be unverified; inspect the stored chat before taking another action.'),
    MULTIPLE_NATIVE_GENERATIONS: error('native-multiple', 'More than one Generate Reply path', 'A unified workflow supports one Generate Reply boundary. Keep one generation path in the selected workflow.'),
    NATIVE_ACTIVATION_REQUIRED: error('activation-required', 'Generate Reply needs On Send', 'Connect one root On Send activation to Generate Reply. This workflow starts during SillyTavern message generation.'),
    NATIVE_OWNER_MISSING: info('native-start', 'Starts with a message', 'This step starts when you send a message. Enable Lattice, then send a message in SillyTavern to run this workflow.'),
    UNSUPPORTED_NATIVE_SOURCE: error('native-source', 'Chat source is not supported', 'Send a new user message, or generate a new swipe of the latest completed assistant reply. Lattice did not make a model request for this attempt.'),
    OVERLAPPING_GENERATION: error('generation-overlap', 'Generations overlapped', 'Another generation started before this workflow finished. Wait for the active generation to finish before starting another.'),
    GUIDANCE_OVERFLOW: error('guidance-budget', 'Guidance exceeds the budget', 'The guidance exceeds Token budget at Generate Reply. Reduce the guidance or increase Token budget in Details.'),
    READ_ONLY: local, READ_ONLY_DEFINITION: local,
};
// Only exact host-owned messages choose a specific explanation; arbitrary native
// message text and diagnostic details never become presentation copy.
export const nativeSourceVariants = new Map([
    error('native-source-user', 'Send needs a user message', 'Send requires the latest chat message to be a user message. Send a new user message, or generate a new swipe of a completed assistant reply.'),
    error('native-source-assistant', 'Swipe needs an assistant reply', 'A new swipe requires the latest chat message to be an assistant reply. Select a completed assistant reply or send a new user message.'),
    error('native-source-incomplete', 'Reply is unfinished', 'The latest assistant reply is unfinished. Finish or remove the unfinished reply before generating a new swipe.'),
    error('native-source-text', 'Reply needs completed text', 'The latest assistant reply has no completed text. Generate a complete reply before requesting a new swipe.'),
    error('native-source-tools', 'Tool reply is not supported', 'The latest assistant reply contains tool output. Send a new user message to generate a supported text reply.'),
    error('native-source-media', 'Media reply is not supported', 'The latest assistant reply contains media. Send a new user message to generate a supported text reply.'),
    error('native-source-history', 'Swipe history is unavailable', 'The latest assistant reply has no usable swipe history. Reload the chat and select a completed reply before generating a new swipe.'),
].map(copy => [copy.message, copy]));
for (const code of ['DANGLING_WIRE', 'INVALID_WIRE', 'INVALID_PORT', 'CONFIGURATION_PORT_CHANGED']) workflowCopy[code] = wire;
for (const code of ['DEFINITION_REF', 'DEFINITION_HASH', 'DEFINITION_DATA', 'DEFINITION_METADATA', 'DEFINITION_BODY', 'DEFINITION_INTERFACE', 'DEFINITION_PARAMETER', 'INVALID_OVERRIDE', 'LOCAL_COPY_OWNERSHIP']) workflowCopy[code] = subgraph;
for (const code of ['GRAPH_LIMIT', 'DEFINITION_LIMIT', 'OUTPUT_LIMIT', 'INPUT_LIMIT_EXCEEDED', 'EVIDENCE_LIMIT', 'EFFECT_BUNDLE_LIMIT', 'EFFECT_PREVIEW_LIMIT']) workflowCopy[code] = error('workflow-limit', 'Workflow exceeds a size limit', 'This workflow or its data exceeds a supported size limit. Simplify the selected workflow or reduce its input data.');
