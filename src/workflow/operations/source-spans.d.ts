import type {SourceMapping} from '../source-reader';
import type {SourceRef} from '../source-manifests';
import type {PrivateSourceProofView} from '../source-provenance';
export function projectSourceSpan(mapping:SourceMapping|undefined,start:number,end:number):SourceRef[]|null;
export function sameSourceIdentity(a:PrivateSourceProofView,b:PrivateSourceProofView):boolean;
