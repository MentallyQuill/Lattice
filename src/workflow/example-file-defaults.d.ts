import type {NodeAddress,Result} from './types';
import type {ManagedFileEntry} from './managed-file-policy';
/** previousWorkflowId must come from authenticated origin metadata for the last authored normalization; never graph control text. */
export function prepareExampleFileDefaults(context:{exampleId:string;nodes:ManagedFileEntry[]|Record<string,ManagedFileEntry>;workflowId:string;previousWorkflowId?:string;actorBindings?:Record<string,string>;canonicalDocuments?:Record<string,unknown>;legacyDocuments?:{targetId:string}[]}):Result<{nodes:ManagedFileEntry[];initialTemplates:Record<string,string>;fileOwners:Record<string,NodeAddress>;actorChoices:{sampleActorId:string;label:string}[]}>;
