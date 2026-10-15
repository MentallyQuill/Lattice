import type { Result, NativeGraph3, DefinitionSnapshot, SnapshotTable, Endpoint, ArtifactKind, ArtifactAddress, InterfacePort, ExposedParameter } from './types';
export type GuidanceDestination = {
    kind: 'new-compose';
} | {
    kind: 'existing-compose';
    nodeId: string;
};
export interface AddSystemCommand {
    definition: DefinitionSnapshot;
    snapshots: SnapshotTable;
    graphPoint: {
        x: number;
        y: number;
    };
    inputs?: Record<string, Endpoint>;
    outputs?: {
        outputPortId: string;
        destination: Endpoint;
    }[];
    parameterOverrides?: Record<string, unknown>;
    guidance?: {
        outputPortId: string;
        destination: GuidanceDestination;
    };
}
export interface SystemAssistanceCommand extends Omit<AddSystemCommand, 'definition' | 'snapshots'> {
    instanceId: string;
    expectedInstanceRef: import('./types').DefinitionRef;
}
export type SystemPreview = {
    kind: 'template';
    nodeId: string;
    before: string;
    after: string;
} | {
    kind: 'guidance';
    nodeId: string;
    sectionName: string;
};
export interface PreparedSystemEdit {
    candidate: NativeGraph3;
    changed: boolean;
    baseSignature: string;
    baseDocumentSignature: string;
    viewPath: [
    ];
    instanceId: string;
    addedNodeIds: string[];
    addedEdgeIds: string[];
    removedEdgeIds: string[];
    addedDefinitionKeys: string[];
    preview: SystemPreview[];
}
export interface GuidanceMerges {
    generatorId: string;
    canCreate: boolean;
    destinations: {
        nodeId: string;
        label: string;
        route: ArtifactAddress[];
    }[];
}
export interface SystemChoice {
    key: string;
    name: string;
    definition: DefinitionSnapshot;
    snapshots: SnapshotTable;
    inputs: InterfacePort[];
    outputs: InterfacePort[];
    parameters: ExposedParameter[];
}
export interface SystemPin extends Endpoint {
    label: string;
    kind: ArtifactKind;
    direction: 'input' | 'output';
    occupied: boolean;
}
export interface SystemPicker extends GuidanceMerges {
    choices: SystemChoice[];
    pins: SystemPin[];
}
export interface AddSystemSpec {
    prepare(root: NativeGraph3, input: unknown): Result<PreparedSystemEdit>;
    project(root: NativeGraph3, library: {
        definition: DefinitionSnapshot;
        snapshots?: SnapshotTable;
    }[]): Result<SystemPicker>;
}
export function prepareSystemAssistance(root: NativeGraph3, input: unknown): Result<PreparedSystemEdit>;
export function prepareAddSystem(root: NativeGraph3, input: unknown): Result<PreparedSystemEdit>;
export function projectGuidanceMerges(root: NativeGraph3): Result<GuidanceMerges>;
export function projectSystemAuthoring(root: NativeGraph3, library: {
    definition: DefinitionSnapshot;
    snapshots?: SnapshotTable;
}[]): Result<SystemPicker>;
