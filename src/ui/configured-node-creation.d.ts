import type {ArtifactKind,DefinitionRef,NativeWorkflowMode,OperationDescription,PortDescriptor,Result,WorkflowPhase,NativeGraph3} from '../workflow/types';
import type {JsonValue} from '../workflow/operations/json-data';
export interface IterationHelperChoice {key:string;label:string;ref:DefinitionRef;stateful:boolean;bindings?:Omit<import('../../ui/detail-types').DetailHelperBindings,'editable'>}
export interface ConfiguredCreationOptions {phase:WorkflowPhase;phaseLocked?:boolean;targets:{targetId:string;name?:string;format:string}[];helpers:IterationHelperChoice[];originKind?:ArtifactKind;originDirection?:'in'|'out';documentScopeKey?:string;shelf?:boolean;at?:{x:number;y:number}|null}
export interface ConfiguredCreationCommand {kind?:string;operation:string;controls?:Record<string,JsonValue>;requiresConfiguration?:boolean;connection?:{origin:{nodeId:string;portId:string};portId:string;replace?:boolean};graphPoint?:{x:number;y:number};artifactKind?:ArtifactKind}
export interface ConfiguredCreationView {key:string;operation:string;title:string;controls:string;fields?:import('../../ui/detail-types').DetailControl[];phase:WorkflowPhase;phaseLocked:boolean;targets:ConfiguredCreationOptions['targets'];helpers:IterationHelperChoice[]}
/** Pure honest discovery metadata; no executable identities or capabilities are manufactured. */
export function deferredNodeDescription(operation:string,controls?:Record<string,unknown>):OperationDescription|null;
/** Schema, question and schedule nodes expose configured forms; other usable presets retain immediate creation. */
export function nodeNeedsConfiguration(operation:string,controls?:Record<string,unknown>):boolean;
export function configuredCreationStage(operation:string,mode:NativeWorkflowMode,effectivePhase?:WorkflowPhase,inDefinition?:boolean,controls?:Record<string,unknown>):{phase:WorkflowPhase;phaseLocked:boolean};
export function iterationHelperChoices(root:NativeGraph3,profiles?:{id:string;name:string}[]):IterationHelperChoice[];
export function validateConfiguredNodeControls(operation:string,text:string,options:ConfiguredCreationOptions):Result<{controls:Record<string,JsonValue>;ports:PortDescriptor[]}>;
export interface ConfiguredNodeSession<Capture,Prepared> {
 open(capture:Capture,command:ConfiguredCreationCommand,options:ConfiguredCreationOptions):{view:ConfiguredCreationView;result:Promise<Result<Prepared>>};
 cancel(key:string):void;
 apply(key:string,text:string,phase:WorkflowPhase):{ok:true}|{ok:false;error:{code:string;message:string}};
}
/** Exact captures remain host owned. Preparation never commits or obtains runtime authority. */
export function createConfiguredNodeSession<Capture,Prepared>(ports:{isCurrent(capture:Capture):boolean;isOptionsCurrent?(options:ConfiguredCreationOptions):boolean;prepare(capture:Capture,command:ConfiguredCreationCommand,options:ConfiguredCreationOptions):Result<Prepared>}):ConfiguredNodeSession<Capture,Prepared>;
