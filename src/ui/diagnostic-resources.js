const error = (id, title, message) => ({ id, severity: 'error', title, message });
const info = (id, title, message) => ({ id, severity: 'info', title, message });
const warning = (id, title, message) => ({ id, severity: 'warning', title, message });
const authorized = error('document-authorization', 'Choose an authorized document', 'Select the affected node and open Details → File to choose an accessible source or destination. Check the selected character for private files.');
const privacy = error('private-material', 'Private material is protected', 'This output contains restricted or private material and cannot be published here. Check the source visibility and the intended actor.');
const actor = error('actor-mismatch', 'Character scope does not match', 'This data belongs to a different character or chat. Select the intended character and check the node’s actor settings.');
const changedScope = error('resource-scope-changed', 'The active scope changed', 'The active user, chat, character, or workflow changed. Reopen the affected controls for the current scope.');

// Logical documents and workflow files have different remedies. A file conflict
// never authorizes overwriting another revision; an uncertain save never authorizes retry.
export const resourceCopy = {
    HOST_FILE_UNAVAILABLE: error('host-file-connection', 'SillyTavern file connection failed', 'SillyTavern saved files could not be read after retrying the connection. Check that SillyTavern is reachable, then retry the workflow.'),
    HOST_FILE_DENIED: error('host-file-denied', 'SillyTavern file access was denied', 'SillyTavern refused access to its saved files. Check the connection and signed-in user before retrying.'),
    HOST_FILE_METADATA_INVALID: error('host-file-metadata', 'Saved file metadata could not be verified', 'The saved file metadata is missing or invalid. Preserve the files and their history, and restore a complete valid backup before retrying.'),
    FILE_STORAGE_FAILED: error('local-file-state', 'Browser file state could not be restored', 'Local file access records could not be read from this browser. Reopen file access for the current browser and user; preserve existing files before choosing another destination.'),
    FILE_TOO_LARGE: error('file-size', 'File is too large', 'Choose a file no larger than 400,000 bytes.'),
    FILE_CONTENT_TOO_LARGE: error('file-text-size', 'File text is too long', 'Choose a file containing no more than 100,000 characters.'),
    FILE_NAME_INVALID: error('file-name', 'Filename is invalid', 'Choose a file with a filename between 1 and 255 characters.'),
    FILE_INVALID_UTF8: error('file-encoding', 'File text cannot be read', 'Choose a UTF-8 text file.'),
    FILE_PERMISSION: error('file-permission', 'File access was denied', 'Choose the workflow file again and allow access, or use Save As to choose another destination.'),
    FILE_NOT_FOUND: error('file-missing', 'File is missing', 'The selected file or document no longer exists. For a node file, check Details → File. For a workflow, use File → Open saved… or Import workflow…'),
    FILE_READ_FAILED: error('file-read', 'File could not be read', 'The selected file could not be read. Choose an accessible file and check its permissions.'),
    FILE_WRITE_FAILED: error('file-save', 'Workflow file could not be saved', 'The workflow file could not be saved. Your draft remains open. Use Save As to choose an accessible destination.'),
    FILE_DOWNLOAD_FAILED: error('file-download', 'Workflow copy could not be saved', 'The workflow JSON copy could not be saved. Your draft remains open. Check browser download permissions.'),
    FILE_CONFLICT: error('workflow-file-conflict', 'Workflow file changed', 'The workflow file changed outside Lattice. Use Save As to preserve your draft without overwriting those changes.'),
    FILE_REVISION_CONFLICT: error('document-revision-conflict', 'Document changed', 'The target document changed after it was read. Prepare a new projection and its dependent story output from the current document before acceptance.'),
    FILE_REFERENCE_UNAUTHORIZED: error('file-reference', 'Read the document first', 'Connect the Reference output from the current authorized Read File node. An older or substituted reference cannot authorize a write.'),
    FILE_RECEIPT_LIMIT: error('document-receipts', 'Document history is full', 'The document reached its revision or save history limit. Reconcile its stored history before preparing another write.'),
    FILE_DOCUMENT_LIMIT: error('document-limit', 'Document exceeds the storage limit', 'The proposed document and save history are too large to store. Reduce the document size before preparing another write.'),
    FILE_FORMAT_LOCKED: error('document-format', 'Document format is fixed', 'An existing file keeps its format. To use another format, open the node’s Details → File → Advanced and create a new copy; the original is retained.'),
    FILE_ACCEPTANCE_REQUIRED: info('file-acceptance', 'Saving waits for acceptance', 'File changes are proposed during execution and are saved only when the full workflow result is accepted.'),
    FILE_STAGE_FAILED: error('file-staging', 'File change could not be prepared', 'The file change could not be prepared. Check the target document, current reference, and source evidence.'),
    FILE_INTENT_CONFLICT: error('file-intent-conflict', 'File change identity conflicts', 'A previously prepared file change uses this identity for different content. Inspect the retained change and prepare a distinct current change.'),
    FILE_BACKEND_FAILED: error('document-storage', 'Document storage is unavailable', 'The storage service could not complete this action. Check the active chat and the node’s Details → File. For custom location setup, open File → File storage…'),
    FILE_EVIDENCE_FAILED: error('file-evidence', 'File evidence could not be checked', 'The source evidence for this file change could not be checked. Inspect the current source and prepare evidence from it.'),
    DOCUMENT_SETUP_UNAVAILABLE: info('document-setup', 'File settings are unavailable', 'Open an active chat, select the affected node and open Details → File.'),
    CHAT_REQUIRED: info('chat-required', 'Open a chat', 'Open an active chat before using this feature.'),
    ACTOR_REQUIRED: info('actor-required', 'Select a character', 'Select an active character before using character memory.'),
    PRIVATE_MATERIAL: privacy,
    PRIVATE_DESTINATION: error('private-destination', 'Destination cannot receive private data', 'Choose a destination that preserves the data’s private character access. Check Visibility and Character in the node’s Details → File → Advanced.'),
    INVALIDATED_SOURCES: warning('historical-source-changed', 'Stored evidence changed', 'Some stored evidence changed or was removed. Review and reconcile that evidence before using it for another memory change.'),
    FINAL_EVIDENCE_REEXTRACT_REQUIRED: error('final-evidence', 'Evidence does not match the final reply', 'The final reply changed after its evidence was captured. Extract or rebase the evidence from the final narrative before accepting it.'),
    STALE_VERSION: error('memory-version', 'Memory changed', 'The memory store changed after this proposal was prepared. Read the current memory and prepare a new proposal before acceptance.'),
    IDEMPOTENCY_CONFLICT: error('memory-identity-conflict', 'Memory change identity conflicts', 'This memory change identity already refers to different or unconfirmed content. Inspect the stored change before preparing another write.'),
    MEMORY_SAVE_UNAVAILABLE: error('memory-save-unavailable', 'Memory saving is unavailable', 'SillyTavern’s metadata save service is unavailable. Check the active chat and host installation.'),
    MEMORY_BACKEND_FAILED: error('memory-backend', 'Memory storage could not complete this action', 'The memory storage service could not complete this action. Check the active chat, character, and memory configuration.'),
    RECEIPT_LIMIT: error('memory-receipts', 'Memory history is full', 'The memory save history reached its limit. Reconcile stored receipts before preparing another write.'),
    VERSION_LIMIT: error('memory-version-limit', 'Memory version limit reached', 'The memory store reached its version limit. Reconcile the store before preparing another write.'),
    RECALL_UNAVAILABLE: info('recall-setup', 'Recall needs setup', 'Enable Lattice and open a unified workflow for the active character to use Recall.'),
    RECALL_QUEUE_CONFLICT: error('recall-policy', 'Recall settings do not match', 'Matching Recall Shortcuts must use matching generation target, repetition, and consumption settings. Check their Details.'),
    RECALL_HOTKEY_CONFLICT: error('recall-shortcut-conflict', 'Shortcut is already assigned', 'This key is assigned to another active Recall Shortcut. Choose a different key in Details.'),
    INVALID_RECALL_HOTKEY: error('recall-shortcut-key', 'Choose a supported shortcut', 'Choose a physical key with Control, Alt, or Meta, or a function key in Recall Shortcut Details.'),
    RECALL_HOTKEY_UNAVAILABLE: error('recall-key-unavailable', 'Recall shortcut is unavailable', 'The Recall keyboard listener is unavailable. Check the active workflow and host installation.'),
    RECALL_NOT_QUEUED: info('recall-not-queued', 'Recall is not queued', 'Use Queue recall on a matching Recall Shortcut to arm manual Recall. Automatic triggers use their own conditions.'),
    RECALL_TARGET_INELIGIBLE: info('recall-ineligible', 'Recall does not target this generation', 'This generation does not match the configured Recall target. Check the generation target in Details.'),
    RECALL_ALREADY_ACTIVATED: info('recall-activated', 'Recall already activated', 'This memory set already activated for this generation.'),
    RECALL_USE_RESERVED: info('recall-reserved', 'Recall is reserved', 'A matching Recall allowance is reserved by another generation. Wait for that generation to finish.'),
    RECALL_QUEUE_LIMIT: error('recall-queue-limit', 'Recall queue is full', 'Cancel unused Recall requests before adding more.'),
    RECALL_GRAPH_INVALID: error('recall-workflow', 'Recall workflow needs attention', 'Recall requires a valid active unified workflow. Review Workflow validation before queueing Recall.'),
    RECALL_NODE_UNAVAILABLE: error('recall-node', 'Choose a current Recall Shortcut', 'Select a configured Recall Shortcut in the current workflow.'),
    RECALL_RECORDS_UNVERIFIED: error('recall-records', 'Recall records are not verified', 'Use records from a current authorized File or Memory read. Changed or invented records cannot be used for Recall.'),
    RECALL_PRESENCE_UNVERIFIED: error('recall-presence', 'Character presence is not verified', 'Recall needs the intended character’s current scene presence and supporting source evidence.'),
};
for (const code of ['DOCUMENT_NOT_AUTHORIZED', 'FILE_NOT_AUTHORIZED', 'FILE_TARGET_UNAUTHORIZED', 'DOCUMENT_LEASE_UNAUTHORIZED']) resourceCopy[code] = authorized;
for (const code of ['SCOPE_MISMATCH', 'RECALL_ACTOR_MISMATCH', 'ACTOR_FILE_SCOPE_MISMATCH', 'ACTOR_GUIDANCE_SCOPE']) resourceCopy[code] = actor;
for (const code of ['STALE_DOCUMENT_SETUP', 'STALE_DOCUMENT_SCOPE', 'STALE_FILE_SCOPE', 'STALE_RECALL_SCOPE', 'STALE_RECALL_CONTEXT', 'STALE_RECALL_SHORTCUT', 'STALE_RECALL_GENERATION', 'STALE_EFFECT_SCOPE']) resourceCopy[code] = changedScope;

const safeValidationGroups = [
    ['INVALID_MEMORY_CONFIG INVALID_MEMORY_CONTEXT INVALID_MEMORY_METADATA INVALID_MEMORY_READ INVALID_MEMORY_RECALL INVALID_MEMORY_SNAPSHOT INVALID_MEMORY_RECEIPTS INVALID_MEMORY_CONTROLS INVALID_MEMORY_CAS', error('memory-settings', 'Memory settings need attention', 'The memory settings or stored data are invalid. Check the active character, store, and node settings in Details.')],
    ['INVALID_RECALL_SCOPE INVALID_RECALL_QUEUE INVALID_RECALL_ACTIVATION INVALID_RECALL_TRIGGER INVALID_RECALL_OWNER INVALID_RECALL_AUTHORITY INVALID_RECALL_PORTS INVALID_RECALL_GENERATION INVALID_RECALL_SETTLEMENT', error('recall-settings', 'Recall settings need attention', 'Check the Recall actor, memory set, generation target, and activation settings in Details.')],
    ['INVALID_FILE_CONFIG INVALID_FILE_BACKEND_CONFIG INVALID_FILE_METADATA INVALID_FILE_SNAPSHOT INVALID_FILE_INTENT INVALID_FILE_CONTROLS INVALID_FILE_BACKEND_UPDATE INVALID_FILE_RESPONSE', error('document-settings', 'Document data needs attention', 'The document data or storage configuration is invalid. Select the affected node and check Details → File before changing its saved data.')],
    ['INVALID_DOCUMENT_SETUP INVALID_WORKFLOW_DATA INVALID_CLOCK_TEMPLATE DOCUMENT_SETUP_FAILED', error('document-setup-invalid', 'Check file settings', 'Open the affected node’s Details → File. Check its Name and selected source or destination; Advanced contains format and visibility settings. Keep existing saved data intact.')],
    ['INVALID_INTROSPECTION_EVIDENCE INVALID_ACCEPTED_MEMORY STATE_EVIDENCE_CHANGED', error('memory-evidence', 'Memory evidence needs attention', 'Use current settled source evidence that belongs to the intended character and matches the accepted narrative.')],
    ['FILE_CAPTURE_RELEASED FILE_INTENT_UNAUTHORIZED MEMORY_AUTHORITY_RELEASED RECALL_STATE_RELEASED RECALL_CLAIM_CLOSED RECALL_CLAIM_UNAUTHORIZED RECALL_OWNER_MISSING RECALL_SOURCE_UNAVAILABLE RECALL_PROVENANCE_REQUIRED STALE_RECALL_SOURCE STALE_MEMORY_EVIDENCE', error('resource-expired', 'Recorded source is no longer current', 'The recorded source or permission is no longer current. Inspect the active source and prepare this action again.')],
];
for (const [codes, copy] of safeValidationGroups) for (const code of codes.split(' ')) resourceCopy[code] = copy;
