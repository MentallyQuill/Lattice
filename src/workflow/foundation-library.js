/** Keep explicitly deferred saved revisions cold without admitting them to the live shelf. */
import {cloneDefinitionData,definitionRefKey} from './definition-data.js?v=0.30.0';
import {FOUNDATION_RELEASE,deferredFoundationControl} from './foundation-release.js?v=0.30.0';
import {referencedDefinitionKeys} from './retired-workflows.js?v=0.30.0';
import {validateGraphStructure} from './contracts.js?v=0.30.0';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keyText=value=>typeof value==='string'&&value.length>0&&!['__proto__','constructor','prototype'].includes(value);
const fail=(code,message)=>({ok:false,error:{code,message}});
const deferred=node=>node?.type==='workflow'&&(FOUNDATION_RELEASE.deferredOperations.includes(node.operation)||deferredFoundationControl(node)||node.operation==='scene-context'&&(FOUNDATION_RELEASE.deferredSceneControls.some(key=>Object.hasOwn(node,key))||node.selection!==undefined&&!FOUNDATION_RELEASE.sourceSelections.includes(node.selection)||node.activationMode!==undefined&&node.activationMode!=='root'));
export function partitionFoundationLibrary(input){
 const copied=cloneDefinitionData(input);if(!copied.ok)return copied;const raw=copied.data;
 if(!record(raw)||Object.keys(raw).some(key=>!['definitions','entries'].includes(key))||!record(raw.definitions)||raw.entries!==undefined&&!record(raw.entries))return fail('DEFINITION_DATA','Expected saved definitions and optional shelf entries.');
 const definitions=raw.definitions,blocked=new Set(),parents=new Map();
 try{for(const [key,definition]of Object.entries(definitions)){
  if(!record(definition)||!keyText(definition.id)||!Number.isSafeInteger(definition.version)||definition.version<1||typeof definition.semanticHash!=='string'||!/^sha256:[a-f0-9]{64}$/.test(definition.semanticHash)||key!==definitionRefKey(definition)||!record(definition.body))return fail('DEFINITION_METADATA','Expected exact saved definition metadata.');
  if(definition.body.mode==='native-maintenance'||Object.values(definition.body.nodes??{}).some(deferred))blocked.add(key);
  for(const child of referencedDefinitionKeys(definition,definitions)){const owners=parents.get(child)??new Set();owners.add(key);parents.set(child,owners);}
 }
 if(raw.entries!==undefined&&Object.entries(raw.entries).some(([id,ref])=>!keyText(id)||!record(ref)||Object.keys(ref).length!==3||Object.keys(ref).some(key=>!['id','version','semanticHash'].includes(key))||ref.id!==id||!Object.hasOwn(definitions,definitionRefKey(ref))))return fail('DEFINITION_REF','Shelf entries must pin an existing exact saved revision.');
 const pending=[...blocked];for(let i=0;i<pending.length;i++)for(const parent of parents.get(pending[i])??[])if(!blocked.has(parent)){blocked.add(parent);pending.push(parent);}
 const live=Object.fromEntries(Object.entries(definitions).filter(([key])=>!blocked.has(key))),runtime=Object.values(live).some(definition=>definition.body.runtime===3)?3:2;
 const checked=validateGraphStructure({schema:runtime===3?4:3,runtime,mode:'native-unified',nodes:{},wires:{},definitions:live});if(!checked.ok)return checked;
 const data=cloneDefinitionData({definitions:live,...(raw.entries!==undefined?{entries:Object.fromEntries(Object.entries(raw.entries).filter(([,ref])=>!blocked.has(definitionRefKey(ref))))}:{})});if(!data.ok)return data;
 const unavailable=Object.freeze([...blocked].map(key=>Object.freeze({key,id:definitions[key].id,name:definitions[key].name??definitions[key].id,code:'UNSUPPORTED_FOUNDATION_CAPABILITY',message:'This saved revision needs capabilities outside the foundation release and remains stored.'})));
 return {ok:true,data:data.data,raw,unavailable};
 }catch{return fail('DEFINITION_DATA','Malformed saved definition metadata.');}
}
