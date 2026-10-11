import type {NativeRecallStatus} from '../src/workflow/native-recall';
import type {NodeAddress} from '../src/workflow/types';
import type {DetailEditResponse} from './detail-types';
export interface RecallBadgeView {state:'queued'|'generation'|'acceptance';tooltip:string;ariaLabel:string;}
export interface RecallNodeStatus {nodeId:string;address?:NodeAddress;memorySetId:string;state:'unavailable'|'not-queued'|'queued'|'generation'|'acceptance';queued:boolean;queueAllowed:boolean;cancelAllowed:boolean;reason:string;targetLabel:string;useLabel:string;consumeLabel:string;activationLabel:string;statusText:string;remaining:{reply:boolean;swipe:boolean};pendingCount:number;remainingText:string;consumerCount:number;shortcutNodeIds:string[];shortcutAddresses?:NodeAddress[];hotkeys:{nodeId:string;label:string}[];badge?:RecallBadgeView;}
export interface RecallCommandScope {queueNodeIds:string[];cancelNodeIds:string[];queueShortcutNodeIds:string[];cancelShortcutNodeIds:string[];queueMemorySetCount:number;cancelMemorySetCount:number;queueReason:string;cancelReason:string;relevantNodeIds:string[];excludedCount:number;}
export interface RecallSetView extends RecallNodeStatus {nodeIds:string[];linkedNodes:{nodeId:string;displayId?:string;title:string}[];}
export interface RecallProjection {nodes:Record<string,RecallNodeStatus>;allNodes?:Record<string,RecallNodeStatus>;scope:NativeRecallStatus['scope'];sets:RecallSetView[];commands:{selected:RecallCommandScope;all:RecallCommandScope};issue:string;}
export interface RecallActions {capture(nodeIds:readonly string[],scope?:'selected'|'all'):{queue:()=>DetailEditResponse;cancel:()=>DetailEditResponse};reportIssue(message:string):void;refresh():void;change(nodeIds:readonly string[],action:'queue'|'cancel',scope?:'selected'|'all'):DetailEditResponse;reveal(nodeId:string):void;}
export interface RecallContext {editorToken:unknown;documentToken:object;selectionEpoch:number;viewKind?:'root'|'instance'|'library';projection:RecallProjection;}
export type RecallNativeStatus=NativeRecallStatus;
