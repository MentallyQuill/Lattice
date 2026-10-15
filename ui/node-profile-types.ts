import type { DetailSelection, DetailEditResponse } from './detail-types';

/** Host-prepared metadata. The canvas never resolves profiles or binding authority. */
export interface NodeProfileOption { value: string; label: string; apiLabel: string; model: string; active: boolean }
export interface PreparedNodeProfile {
    selected?: boolean; hasProfile?: boolean; compact?: boolean; readiness?: import('./readiness-types').NodeReadiness;
    id: string; selection: DetailSelection; value: string; label: string; model: string; editable: boolean;
    options: readonly NodeProfileOption[];
}
export interface NodeProfileData extends PreparedNodeProfile {
    x: number; y: number; w: number; h: number; clearance: number; authorityVersion: number;
    visibleBounds: { x: number; y: number; w: number; h: number };
}
export type EditNodeProfile = (selection: DetailSelection, value: string) => DetailEditResponse;
