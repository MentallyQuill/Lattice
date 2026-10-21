import type {Result} from './types';
import type {Visibility} from './source-manifests';
/** Internal descriptive projection. No native objects, grants, unselected swipes or reasoning. */
export interface NativeSourceIdentity {
 readonly text:string;
 readonly name:string|null;
 readonly role:'user'|'assistant'|'system';
 readonly protocol:'chat'|'tool'|'system'|'narrator'|'unsupported';
 readonly visibility:Visibility;
 readonly visibleTo:readonly string[]|null;
 readonly settled:boolean;
 readonly selectionDigest:string;
 readonly fingerprint:string;
 readonly revision:string;
}
/** Each selected message is admitted independently within the existing JSON bounds.
 * Input is a dense native chat array with at most 16,384 messages. Pure, no authority. */
export function normalizeNativeSourceMessages(chat:unknown):Result<readonly NativeSourceIdentity[]>;
