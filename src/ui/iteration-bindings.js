import {inspectPinnedDefinitionIdentity,cloneDefinitionData,definitionRefKey,nodeBindingOverrideKey} from '../workflow/definition-data.js?v=0.27.2';
import {inspectDefinitionGraph} from '../workflow/graph-validation.js?v=0.27.2';
import {definitionChain} from '../workflow/composition-edit.js?v=0.27.2';
import {operationFor} from '../workflow/catalog.js?v=0.27.2';
import {validIterationRoleOverrides} from '../workflow/operations/control-nodes.js?v=0.27.2';
import {diagnosticText,presentDiagnostic} from './diagnostics.js?v=0.27.2';
const fail=(code,message)=>({ok:false,error:{code,message}});
const merge=(base,extra)=>{const next=structuredClone(base??{});for(const [role,binding]of Object.entries(extra??{}))next[role]={...(next[role]??{}),...binding};return next;};
/** Bounded metadata inspection only; never resolve connections or execute a helper. */
export function inspectIterationTextRoles(helper,definitions,inheritedRoles={},roleOverrides={}) {
    try {
        const roles=new Map(),active=new Set();let visits=0;
        function visit(ref,inherited,overrides,depth,nestedFields=new Set()) {
            if(++visits>1000||depth>8)return fail('ITERATION_DEPTH','Helper role inspection exceeds its bounded graph limit.');
            const pinned=inspectPinnedDefinitionIdentity(ref,definitions);if(!pinned.ok)return pinned;
            const key=definitionRefKey(pinned.data.ref);if(active.has(key))return fail('ITERATION_CYCLE','A helper cannot recursively invoke itself.');
            active.add(key);
            try {
                const checked=inspectDefinitionGraph(definitions[key],definitions);if(!checked.ok)return checked;
                const scopes=new Map(checked.data.expansion.scopes.map(scope=>[JSON.stringify(scope.instancePath),scope.graph]));
                for(const unit of checked.data.expansion.primitives) {
                    const op=operationFor(unit.node),scope=scopes.get(JSON.stringify(unit.address.instancePath)),path=unit.address.instancePath;
                    const chain=path.length?definitionChain({nodes:checked.data.definition.body.nodes,definitions},path):[];
                    let configured=overrides;const explicitFields=new Set(nestedFields);
                    for(const item of chain??[]){configured=merge(configured,item.node.roleOverrides);for(const [role,binding]of Object.entries(item.node.roleOverrides??{}))for(const field of Object.keys(binding))explicitFields.add(role+':'+field);}
                    if(unit.node.operation==='for-each') {const next=visit(unit.node.helper,merge(inherited,scope.roles),merge(configured,unit.node.roleOverrides),depth+1,new Set([...explicitFields,...Object.entries(unit.node.roleOverrides??{}).flatMap(([role,binding])=>Object.keys(binding).map(field=>role+':'+field))]));if(!next.ok)return next;continue;}
                    if(!op||!unit.requestBound||unit.enabled===false)continue;
                    const role=unit.node.modelRole??op.modelRole;if(!role)continue;
                    const binding={...(inherited[role]??{}),...(scope.roles?.[role]??{}),...(configured[role]??{})};
                    const saved=(chain?.at(-1)?.definition.body??checked.data.definition.body).nodes[unit.address.nodeId],explicit={};
                    for(let depth=(chain?.length??0)-1;depth>=0;depth--)Object.assign(explicit,chain[depth].node.nodeBindingOverrides?.[nodeBindingOverrideKey(path.slice(depth+1),unit.address.nodeId)]??{});
                    if(saved?.profileId!=null)binding.profileId=saved.profileId;
                    if(saved?.model!=null)binding.model=saved.model;else if(saved?.profileId!=null||Object.hasOwn(explicit,'profileId')&&!Object.hasOwn(configured[role]??{},'model'))binding.model=null;
                    Object.assign(binding,explicit);
                    const row=roles.get(role)??{role,bindings:[],calls:[],nestedOverride:false,explicitNodeBinding:false};
                    const profileEditable=saved?.profileId==null&&!Object.hasOwn(explicit,'profileId')&&!explicitFields.has(role+':profileId');
                    const modelEditable=saved?.model==null&&saved?.profileId==null&&!Object.hasOwn(explicit,'model')&&!explicitFields.has(role+':model');
                    const fixedNode=saved?.profileId!=null||saved?.model!=null||Object.keys(explicit).length>0;
                    row.bindings.push(binding);row.calls.push({label:op.title,binding,profileEditable,modelEditable,fixedNode});
                    row.nestedOverride ||= [...explicitFields].some(field=>field.startsWith(role+':'));row.explicitNodeBinding ||= fixedNode;roles.set(role,row);
                    if(roles.size>64)return fail('ITERATION_ROLE_LIMIT','A helper can expose up to 64 text model roles.');
                }
                return {ok:true};
            }finally{active.delete(key);}
        }
        const result=visit(helper,inheritedRoles,roleOverrides,0);return result.ok?{ok:true,data:[...roles.values()]}:result;
    }catch{return fail('INVALID_ITERATION_BINDINGS','The exact helper role bindings could not be inspected.');}
}
export function prepareIterationBindings(node,definitions,profiles=[],inheritedRoles={}) {
    const checked=inspectIterationTextRoles(node.helper,definitions,inheritedRoles,node.roleOverrides??{});
    if(!checked.ok)return {helperKey:definitionRefKey(node.helper),roles:[],issue:diagnosticText(checked.error,{operation:'iteration'}),issueDiagnostic:presentDiagnostic(checked.error,{operation:'iteration'})};
    const field=(binding,key)=>({mode:Object.hasOwn(binding,key)?binding[key]===null?'block':'override':'inherit',value:binding[key]??null,allowedModes:[{value:'inherit',label:key==='model'?'Use helper model':'Use helper connection'},{value:'override',label:'Override'},...(key==='model'?[{value:'block',label:'Use profile model'}]:[])]});
    return {helperKey:definitionRefKey(node.helper),roles:checked.data.map(row=>{
        const saved=node.roleOverrides?.[row.role]??{},total=row.calls.length;
        const display=binding=>[profiles.find(profile=>profile.id===binding.profileId)?.name||binding.profileId,binding.model??(binding.profileId?'Profile model':'')].filter(Boolean).join(' · ')||'Choose a connection for this helper role';
        const profileCalls=row.calls.filter(call=>call.profileEditable).length,modelCalls=row.calls.filter(call=>call.modelEditable).length;
        const fixed=row.calls.filter(call=>call.fixedNode).map(call=>call.label+' · '+display(call.binding));
        const caveats=[...(profileCalls<total?['Connection choice affects '+profileCalls+' of '+total+' helper calls.']:[]),...(modelCalls<total?['Model override affects '+modelCalls+' of '+total+' helper calls.']:[]),...(fixed.length?['Explicit helper-node bindings: '+[...new Set(fixed)].join('; ')+'.']:[]),...(row.nestedOverride?['An explicit nested helper binding takes precedence for that occurrence.']:[])];
        return {role:row.role,label:row.role.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]+/g,' ').replace(/^./,char=>char.toUpperCase()),profile:{...field(saved,'profileId'),editable:profileCalls>0,options:profiles.map(profile=>({value:profile.id,label:profile.name}))},model:{...field(saved,'model'),editable:modelCalls>0},effective:[...new Set(row.bindings.map(display))].join('; '),source:row.explicitNodeBinding?'Explicit helper-node binding':row.nestedOverride?'Explicit nested helper binding':Object.keys(saved).length?'For Each role override':'Pinned helper or inherited binding',...(caveats.length?{caveat:caveats.join(' ')}:{})};
    })};
}
/** Prepare a detached sparse override; the controller owns captured graph authorization/commit. */
export function prepareIterationBindingOverride(node,definitions,input) {
    const copied=cloneDefinitionData({node,input});if(!copied.ok)return copied;
    const {node:saved,input:edit}=copied.data;
    if(saved.operation!=='for-each'||!edit||Object.keys(edit).some(key=>!['role','field','mode','value'].includes(key))||!['profileId','model'].includes(edit.field)||!['inherit','override','block'].includes(edit.mode)||edit.field==='profileId'&&edit.mode==='block')return fail('INVALID_ITERATION_BINDING','Choose a helper role and a supported binding field.');
    const inspected=inspectIterationTextRoles(saved.helper,definitions);if(!inspected.ok)return inspected;
    if(!inspected.data.some(row=>row.role===edit.role))return fail('INVALID_ITERATION_BINDING','Choose a text model role required by this exact helper.');
    const roleOverrides=structuredClone(saved.roleOverrides??{}),binding={...(roleOverrides[edit.role]??{})};
    if(edit.mode==='inherit'){delete binding[edit.field];if(edit.field==='profileId'&&binding.model===null)delete binding.model;}
    else {binding[edit.field]=edit.mode==='block'?null:edit.value;if(edit.field==='profileId'&&!Object.hasOwn(binding,'model'))binding.model=null;}
    if(Object.keys(binding).length)roleOverrides[edit.role]=binding;else delete roleOverrides[edit.role];
    return validIterationRoleOverrides(roleOverrides)?{ok:true,data:{roleOverrides}}:fail('INVALID_ITERATION_BINDING','Model and profile selectors must be nonempty bounded text.');
}
