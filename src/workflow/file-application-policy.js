import {managedNodeFileMigration} from '../ui/node-file-projection.js?v=0.30.0';
import {nodeFileTargetId} from './node-file-targets.js?v=0.30.0';
import {prepareUnboundReader} from './file-initialization.js?v=0.30.0';
/** Only a trusted metadata absence check may adopt an empty previously unbound own target. */
export function migrateUnboundOwnFile(node,{canonicalDocuments={},legacyDocuments=[],nodes={},wires={}}={}){
 if(node.operation==='read-file')return prepareUnboundReader(node,{canonicalDocuments,legacyDocuments,nodes,wires});
 const targetId=nodeFileTargetId(node);
 const hasCanonicalData=Object.hasOwn(canonicalDocuments,targetId)||legacyDocuments.some(document=>document.targetId===targetId);
 const fileTarget=managedNodeFileMigration(node,{hasCanonicalData});
 return fileTarget?{...node,fileTarget}:node;
}
/** File type follows declared upstream serialization, without reading any runtime output. */
export function declaredFileInput(node,nodes,wires){
 if(!node)return {};
 const incoming=Object.values(wires??{}).find(wire=>wire.to===node.id&&['text','records'].includes(wire.toPort));
 const source=incoming&&nodes?.[incoming.from];
 return {...(incoming?.toPort==='records'?{inputKind:'data'}:{}),...(source?.operation==='format'?{inputFormat:source.format??'json',inputColumns:source.columns}:source?.operation==='json-encode'?{inputFormat:'json'}:{})};
}
