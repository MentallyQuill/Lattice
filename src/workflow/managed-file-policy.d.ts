import type { NodeAddress, Result } from './types';
import type { NodeFileDefinition } from './node-file-targets';
export type ManagedFileFormat='json'|'jsonl'|'csv'|'text'|'markdown';
export interface ManagedFileContext {
 /** Trusted saved-library ID or host document namespace, never the imported graph ID alone. */
 workflowId:string;address?:NodeAddress;actorId?:string;legacyDocuments?:{targetId:string;format?:ManagedFileFormat;visibility?:import('./document-catalog').DocumentVisibility}[];
 /** Existing explicit definitions whose bindings the captured backend successfully loaded. */
 authorizedDefinitions?:NodeFileDefinition[];
 /** Trusted bundled example content, keyed by JSON.stringify([address.workflowId,address.instancePath,address.nodeId]); never imported graph fields. */
 initialTemplates?:Record<string,string>;
 /** Host-derived registered sample resource aliases; only compatible present managed candidates can share ownership. */
 fileOwners?:Record<string,NodeAddress>;
 /** Captured host availability; authored actor IDs alone cannot allocate private storage. */
 isActorAvailable?:(actorId:string)=>boolean;
 inputFormat?:ManagedFileFormat;inputKind?:'data'|'text';inputColumns?:string[];
 /** Trusted planner edges; typed outcome lineage shares one commit-owned ledger. */
 edges?:{from:NodeAddress&{portId:string};to:NodeAddress&{portId:string}}[];
}
export interface ManagedFileEntry {node:Record<string,unknown>;address:NodeAddress;inputFormat?:ManagedFileFormat;inputKind?:'data'|'text';inputColumns?:string[];}
export function canonicalFileName(name:unknown,format?:ManagedFileFormat):string;
export function inferManagedFileFormat(node:Record<string,unknown>,input?:{inputFormat?:ManagedFileFormat;inputKind?:'data'|'text'}):ManagedFileFormat;
export function resolveManagedFileNode(node:Record<string,unknown>,context:ManagedFileContext):Result<{node:Record<string,unknown>;definition:NodeFileDefinition|null}>;
export function prepareManagedNodeFiles(nodes:(Record<string,unknown>|ManagedFileEntry)[]|Record<string,Record<string,unknown>|ManagedFileEntry>,context:ManagedFileContext&{scope:{userId:string;chatId:string;actorId?:string};isCurrent:()=>boolean;access?:{ensureManaged(definition:NodeFileDefinition,controls:{scope:{userId:string;chatId:string;actorId?:string};isCurrent:()=>boolean;managed:true}):Promise<Result<NodeFileDefinition>>}}):Promise<Result<{nodes:Record<string,unknown>[];definitions:NodeFileDefinition[]}>>;
