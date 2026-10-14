import type { NativeNode, OperationDescriptor, OperationDescription, OperationResult, Result, WorkflowPhase, WorkflowArtifact } from '../types';
import type { JsonValue } from './json-data';
import type { DocumentSnapshot, PreparedDocumentMutation } from './document-mutations';
import type { FileReference, FileStore, PreparedFileIntent } from '../file-store';

export type FileOperationId = 'format' | 'read-file' | 'write-file' | 'project-document';
export type FileVisibility = { kind: 'public' } | { kind: 'hidden' } | { kind: 'actor-private'; actorId: string };
export interface FileNodeExecution {
    phase?: WorkflowPhase;
    /** Read and Write are root-only even when an execution capability is present. */
    root?: boolean;
    signal?: AbortSignal;
    files?: Pick<FileStore, 'read' | 'prepare'>;
    /** Required in presence mode; exact presence/reference must retain a private per-actor host grant. */
    authorizeActorFileScope?: (request: {actorId: string; presence: WorkflowArtifact; reference?: FileReference}) => Result<{actorId: string}> | Promise<Result<{actorId: string}>>;
    /** Optional trusted read policy may strengthen, never erase, captured actor/record restrictions. */
    fileVisibility?: (capture: { reference: FileReference; snapshot: DocumentSnapshot }) => Result<FileVisibility> | Promise<Result<FileVisibility>>;
    /** Host derives identity from canonical event/source lineage, not a transient revision or model text. */
    createIntentId?: (node: NativeNode, evidence: JsonValue[]) => Result<string> | Promise<Result<string>>;
    /** Required for every write. Authorizes current user/chat/actor scope and the actual destination. */
    authorizeFileWrite?: (request: {
        reference: FileReference;
        visibility: FileVisibility;
        evidence: JsonValue[];
        projection: PreparedDocumentMutation;
    }) => Result<{ destinationVisibility: FileVisibility }> | Promise<Result<{ destinationVisibility: FileVisibility }>>;
    /** Privately retain handle authority in the accepted-root settlement bundle. Never commit here. */
    stageFileIntent?: (prepared: PreparedFileIntent, evidence: JsonValue[]) => Result<void> | Promise<Result<void>>;
}
export const FILE_OPERATIONS: Record<FileOperationId, OperationDescriptor>;
/** Native control descriptors and explicit phase-dependent ports. All operations reserve zero requests. */
export function describeFileNode(node: NativeNode | Record<string, unknown>, options?: { phase?: WorkflowPhase }): Result<OperationDescription>;
/** Project Document is pure: source Text + records/Text emits projected text/data/receipt without authority or staging.`n * Format is pure. Read/Write use exclusively injected trusted host capabilities.
 * Format emits records/text/report. Read emits text/document/value/reference; value is skipped for plain text/Markdown, and reference.value preserves
 * the exact opaque FileReference identity. Copied/imported reference DTOs cannot authorize Write.
 * Write consumes reference + records or text + optional evidence and emits projection/receipt,
 * retaining handles only through stageFileIntent. No execution path commits or writes a backend.
 * Mapped defaults are scanned for restrictions before records, serialized Text and reports are emitted.
 * Capability failures expose known bounded codes and locally authored messages only; raw diagnostics are private.
 * JSON Read schemas describe the entire document; JSONL/CSV schemas describe each record.
 */
export function executeFileNode(node: NativeNode | Record<string, unknown>, inputs: Record<string, unknown>, execution?: FileNodeExecution): Promise<OperationResult>;
