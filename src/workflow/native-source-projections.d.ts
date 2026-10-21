import type {Result} from './types';
import type {Scope,RecordV1} from './source-manifests';
import type {SourceActorGrant} from './source-reader';
declare const characterProjectionBrand:unique symbol;
export interface NativeCharacterProjection {readonly [characterProjectionBrand]:true;}
export interface NativeCharacterProjectionView {readonly scope:Scope;readonly entries:readonly RecordV1[];readonly sourceSetKey:string;readonly snapshotKey:string;}
/** Host constructor capability only; copied records cannot create an authorized projection. */
export function captureNativeCharacterProjection(ports:{getContext:()=>unknown;getUserId:()=>string|undefined;scope:Scope;getActorGrant?:()=>SourceActorGrant|null;isCurrent:()=>boolean;signal?:AbortSignal}):Result<NativeCharacterProjection>;
export function inspectNativeCharacterProjection(projection:unknown):Result<NativeCharacterProjectionView>;
