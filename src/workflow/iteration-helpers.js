import {cloneDefinitionData,inspectPinnedDefinitionIdentity,definitionRefKey,artifactAddressKey,nodeBindingOverrideKey} from './definition-data.js?v=0.27.0';
import {inspectDefinitionGraph,nodeAddressKey} from './graph-validation.js?v=0.27.0';
import {prepareWorkflowPlanner,preparedWorkflowExpansion,resolveWorkflow} from './resolve.js?v=0.27.0';
import {definitionChain} from './composition-edit.js?v=0.27.0';
import {operationFor} from './catalog.js?v=0.27.0';
import {validIterationRoleOverrides} from './operations/control-nodes.js?v=0.27.0';
import {own,plain,freeze,nodeAddress} from './record-data.js?v=0.27.0';
import {cloneJsonValue} from './operations/json-data.js?v=0.27.0';
import {artifactVisibility,preserveArtifactPrivacy,validVisibilityMetadata} from './artifact-privacy.js?v=0.27.0';
import {applyTextModifiers} from './modifiers.js?v=0.27.0';
import {workflowDataPresetFor} from './workflow-data-defaults.js?v=0.27.0';

const programs=new WeakMap(),MOUNT='iteration-helper',ITEM_TEXT='iteration-item-text',ITEM_DATA='iteration-item-data',STATE_TEXT='iteration-state-text',STATE_DATA='iteration-state-data';
const fail=(code,message)=>({ok:false,error:{code,message}});
const stopped=()=>fail('ABORTED','Iteration was stopped; no partial result was published.');
const wire=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
const seed=(id,operation,phase)=>({id,type:'workflow',operation,phase,...(operation==='text'?{text:'null'}:{})});
const pathKey=path=>JSON.stringify(path);
const boundedAddress=address=>[address.workflowId,address.nodeId,...address.instancePath].every(id=>typeof id==='string'&&id.length>0&&id.length<=128);
const mergeRoles=(base,extra)=>{const roles=structuredClone(base??{});for(const [id,binding] of Object.entries(extra??{}))roles[id]={...(roles[id]??{}),...binding};return roles;};


// Instance-level authored overrides win over the invoking For Each role choice;
// nested definition defaults remain replaceable without changing their exact pins.
function roleOverridesAt(def,definitions,path,overrides) {
    let result=overrides??{};
    const chain=path.length?definitionChain({nodes:def.body.nodes,definitions},path):[];
    for(const item of chain??[])result=mergeRoles(result,item.node.roleOverrides);
    return result;
}
function mountedNodeBindings(def,definitions,primitives,overrides) {
    const bindings={};
    for(const unit of primitives){
        const op=operationFor(unit.node),role=unit.node.modelRole??op?.modelRole;
        if(!role)continue;
        const path=unit.address.instancePath,chain=path.length?definitionChain({nodes:def.body.nodes,definitions},path):[];
        const saved=(chain?.at(-1)?.definition.body??def.body).nodes[unit.address.nodeId];
        const explicit={};
        for(let depth=0;depth<(chain?.length??0);depth++)Object.assign(explicit,chain[depth].node.nodeBindingOverrides?.[nodeBindingOverrideKey(path.slice(depth+1),unit.address.nodeId)]??{});
        const configured=roleOverridesAt(def,definitions,path,overrides)[role]??{},binding={};
        for(const field of ['profileId','model'])if(Object.hasOwn(configured,field)&&saved?.[field]==null&&!Object.hasOwn(explicit,field)&&!(field==='model'&&saved?.profileId!=null))binding[field]=configured[field];
        if(Object.keys(binding).length)bindings[nodeBindingOverrideKey(path,unit.address.nodeId)]=binding;
    }
    return bindings;
}

/** Compile only portable, exact same-root snapshots. Tokens contain no executable source or host authority. */
export function compileIterationHelper(root,options) {
    try {
        const checkedRoot=cloneDefinitionData(root),checkedOptions=cloneDefinitionData(options);
        if(!checkedRoot.ok)return checkedRoot;if(!checkedOptions.ok)return checkedOptions;
        const graph=checkedRoot.data,settings=checkedOptions.data,at=nodeAddress(own(settings,'address'));
        if(!plain(graph)||graph.schema!==3||graph.runtime!==2||!['native-pre','native-post','native-unified'].includes(graph.mode)||!plain(settings)||!at||at.workflowId!==graph.id||!['pre','post'].includes(settings.phase)||!['map','projected-state'].includes(settings.mode)||!Number.isSafeInteger(settings.requestBoundPerIteration)||settings.requestBoundPerIteration<0||settings.requestBoundPerIteration>16)return fail('INVALID_ITERATION_SETTINGS','Compile a schema 3 pinned helper with an explicit phase, owner address and finite request bound.');
        if(!boundedAddress(at))return fail('ITERATION_ADDRESS_LIMIT','Iteration identities must fit the bounded root request history.');
        if(graph.mode!=='native-unified'&&graph.mode!=='native-'+settings.phase)return fail('ITERATION_PHASE','The root workflow and iteration stage must agree.');
        let roles=graph.roles??{},ownerScope=graph,ownerChain=[];
        if(at.instancePath.length){const chain=definitionChain(graph,at.instancePath);if(!chain)return fail('INVALID_ITERATION_ADDRESS','The iteration owner must belong to a real root definition scope.');for(const item of chain){roles=mergeRoles(roles,item.definition.body.roles);roles=mergeRoles(roles,item.node.roleOverrides);}ownerScope=chain.at(-1).definition.body;ownerChain=chain;}
        const owner=ownerScope.nodes?.[at.nodeId];let roleOverrides=owner?.operation==='for-each'?owner.roleOverrides??{}:{};
        for(let depth=ownerChain.length-1;depth>=0;depth--)for(const [id,value]of Object.entries(ownerChain[depth].node.parameterOverrides??{})){
            const parameter=ownerChain[depth].definition.parameters.find(parameter=>parameter.id===id);
            if(parameter?.target.controlId==='roleOverrides'&&parameter.target.nodeId===at.nodeId&&pathKey(parameter.target.instancePath)===pathKey(at.instancePath.slice(depth+1)))roleOverrides=value;
        }
        if(!validIterationRoleOverrides(roleOverrides))return fail('INVALID_ITERATION_SETTINGS','The iteration owner has invalid helper role bindings.');
        const compiled=compile(graph,{...settings,rootMode:graph.mode,roles,roleOverrides,ownRoleOverrides:roleOverrides},new Set(),{count:0});
        if(!compiled.ok)return compiled;
        if(at.instancePath.length+2+compiled.data.maxRelativeDepth>8)return fail('ITERATION_DEPTH','Qualified iteration helper addresses exceed depth 8.');
        const token=Object.freeze({});programs.set(token,compiled.data);
        return {ok:true,data:freeze({token,workflowDataNodes:workflowDataBindings(compiled.data),description:{helper:compiled.data.ref,phase:settings.phase,mode:settings.mode,requestBound:compiled.data.requestBound,unitCount:compiled.data.units.filter(unit=>unit.address.instancePath.length).length}})};
    }catch{return fail('INVALID_ITERATION_SETTINGS','The iteration helper could not be compiled from bounded own data.');}
}
/** Detached logical bindings from included units; compiler tokens and host authority stay private. */
function workflowDataBindings(program) {
    const bindings=[];
    for(const unit of program.units){
        const preset=workflowDataPresetFor(unit.node.operation),target=preset&&unit.node[preset.controlKey];
        if(preset&&typeof target==='string'&&target!=='')bindings.push({operation:unit.node.operation,[preset.controlKey]:target});
        const nested=program.nested.get(nodeAddressKey(unit.address));
        if(nested)bindings.push(...workflowDataBindings(nested));
    }
    return bindings;
}
function compile(graph,settings,active,work) {
    if(++work.count>1000)return fail('ITERATION_GRAPH_LIMIT','Iteration helper compilation exceeds its bounded graph limit.');
    const pinned=inspectPinnedDefinitionIdentity(settings.helper,graph.definitions??{});if(!pinned.ok)return pinned;
    const key=definitionRefKey(pinned.data.ref);if(active.has(key))return fail('ITERATION_CYCLE','Iteration helpers cannot recursively invoke an active pinned helper.');
    active.add(key);
    try {
        const inspected=inspectDefinitionGraph(graph.definitions[key],graph.definitions);if(!inspected.ok)return inspected;
        const def=inspected.data.definition,ports=def.interface;
        const find=(id,direction)=>ports.find(port=>port.id===id&&port.direction===direction&&port.kind==='data');
        if(ports.some(port=>!['item','projectedState','result','nextState'].includes(port.id)||port.kind!=='data')||!find('item','input')||!find('item','input').required||!find('result','output')||settings.mode==='projected-state'&&(!find('projectedState','input')||!find('nextState','output'))||ports.some(port=>['item','projectedState'].includes(port.id)!==(port.direction==='input')))return fail('ITERATION_INTERFACE','Helpers require Data item/result and explicit Data projectedState/nextState for stateful iteration.');
        const supportedRoles=new Set(inspected.data.expansion.scopes.flatMap(scope=>Object.keys(scope.graph.roles??{})));
        for(const unit of inspected.data.expansion.primitives){const role=unit.node.modelRole??operationFor(unit.node)?.modelRole;if(role)supportedRoles.add(role);}
        const mountOverrides=Object.fromEntries(Object.entries(settings.roleOverrides??{}).filter(([role])=>supportedRoles.has(role)));
        const nodes={[ITEM_TEXT]:seed(ITEM_TEXT,'text',settings.phase),[ITEM_DATA]:seed(ITEM_DATA,'json-decode',settings.phase),[MOUNT]:{id:MOUNT,type:'subgraph',definition:pinned.data.ref,roleOverrides:mountOverrides,nodeBindingOverrides:mountedNodeBindings(def,graph.definitions,inspected.data.expansion.primitives,settings.roleOverrides)}};
        const wires={itemDecode:wire('itemDecode',ITEM_TEXT,'out',ITEM_DATA,'in'),itemInput:wire('itemInput',ITEM_DATA,'out',MOUNT,'item')};
        if(find('projectedState','input')){nodes[STATE_TEXT]=seed(STATE_TEXT,'text',settings.phase);nodes[STATE_DATA]=seed(STATE_DATA,'json-decode',settings.phase);wires.stateDecode=wire('stateDecode',STATE_TEXT,'out',STATE_DATA,'in');wires.stateInput=wire('stateInput',STATE_DATA,'out',MOUNT,'projectedState');}
        const mounted={id:graph.id,schema:3,runtime:2,mode:'native-unified',roles:settings.roles,definitions:graph.definitions,nodes,wires};
        const planned=prepareWorkflowPlanner(mounted);if(!planned.ok)return planned;
        const expanded=preparedWorkflowExpansion(mounted,planned.data);if(!expanded.ok)return expanded;
        const expansion=expanded.data,scopes=new Map(expansion.scopes.map(scope=>[pathKey(scope.instancePath),scope.graph]));
        for(const scope of expansion.scopes)if(scope.instancePath.length&&scope.graph.mode!=='native-unified'&&scope.graph.mode!=='native-'+settings.phase)return fail('ITERATION_PHASE','A pinned legacy helper scope belongs to another stage.');
        const nested=new Map();let maxRelativeDepth=0;
        for(const unit of expansion.primitives){
            if(!unit.address.instancePath.length)continue;
            if(!boundedAddress(unit.address))return fail('ITERATION_ADDRESS_LIMIT','Helper identities must fit the bounded root request history.');
            const op=operationFor(unit.node,{phase:settings.phase,mode:'native-unified'});
            if(!op||op.phase!==settings.phase)return fail('ITERATION_PHASE','A helper operation conflicts with the invocation stage.');
            if(op.rootOnly||op.hostOperation||op.nativeBoundary||op.terminal||['scene-context','reply-snapshot','guidance','apply-reply'].includes(unit.node.operation))return fail('ITERATION_AUTHORITY','Helper graphs cannot acquire root host, publication or native generation authority.');
            if(op.requiresStateInDefinition&&!expansion.edges.some(edge=>nodeAddressKey(edge.to)===nodeAddressKey(unit.address)&&edge.to.portId==='state'))return fail('ITERATION_AUTHORITY','State in a repeated helper requires an explicit snapshot connection.');
            maxRelativeDepth=Math.max(maxRelativeDepth,unit.address.instancePath.length-1);
            // Every unit, including unused branches, must be complete before any effect.
            for(const port of unit.outputPorts){const complete=planned.data.summarize({...unit.address,portId:port.id});if(!complete.ok)return complete;}
            if(unit.node.operation==='for-each'){
                const child=compile(mounted,{helper:unit.node.helper,mode:unit.node.mode,phase:settings.phase,address:unit.address,requestBoundPerIteration:unit.node.requestBoundPerIteration,rootMode:settings.rootMode,roles:scopes.get(pathKey(unit.address.instancePath)).roles,roleOverrides:mergeRoles(roleOverridesAt(def,graph.definitions,unit.address.instancePath.slice(1),settings.roleOverrides),unit.node.roleOverrides),ownRoleOverrides:unit.node.roleOverrides??{}},active,work);
                if(!child.ok)return child;for(const role of child.data.supportedRoles)supportedRoles.add(role);nested.set(nodeAddressKey(unit.address),child.data);maxRelativeDepth=Math.max(maxRelativeDepth,unit.address.instancePath.length-1+2+child.data.maxRelativeDepth);
            }
        }
        for(const mapping of expansion.boundaryMappings)if(mapping.direction==='output'){const complete=planned.data.summarize({...mapping.instance,portId:mapping.portId});if(!complete.ok)return complete;}
        if(!validIterationRoleOverrides(settings.ownRoleOverrides??{})||Object.keys(settings.ownRoleOverrides??{}).some(role=>!supportedRoles.has(role)))return fail('INVALID_OVERRIDE','Select a role actually declared by this helper or its nested iteration helpers.');
        // Resolve actual wrapper outputs through the existing planner's checked collapse.
        const included=new Set(),targets={};
        for(const id of ['result',...(settings.mode==='projected-state'?['nextState']:[])]){
            const target={workflowId:graph.id,instancePath:[],nodeId:MOUNT,portId:id},complete=planned.data.summarize(target);if(!complete.ok)return complete;
            const resolved=resolveWorkflow(mounted,{target});if(!resolved.ok)return resolved;
            targets[id]=resolved.data.resolvedTarget;for(const unit of resolved.data.primitives)if(unit.included)included.add(nodeAddressKey(unit.address));
        }
        // Planner inventory is topologically ordered; multiple output closures execute once.
        const units=expansion.primitives.filter(unit=>included.has(nodeAddressKey(unit.address)));
        const requestBound=units.reduce((total,unit)=>total+(nested.has(nodeAddressKey(unit.address))?nested.get(nodeAddressKey(unit.address)).requestBound*unit.node.limit:unit.requestBound),0);
        if(requestBound>settings.requestBoundPerIteration)return fail('ITERATION_CALL_LIMIT','The real helper request bound exceeds the authored per-iteration limit.');
        return {ok:true,data:{ref:pinned.data.ref,phase:settings.phase,mode:settings.mode,requiresState:settings.mode==='projected-state'||find('projectedState','input')?.required===true,rootMode:settings.rootMode,owner:settings.address,supportedRoles:[...supportedRoles],units:freeze(units),edges:freeze(expansion.edges),targets:freeze(targets),scopes,nested,requestBound,maxRelativeDepth}};
    }finally{active.delete(key);}
}
function checkedArtifact(raw,kind) {
    if(!plain(raw)||own(raw,'kind')!==kind||!validVisibilityMetadata(raw))return null;
    if(kind==='data'&&!Object.hasOwn(raw,'value')||['text','guidance'].includes(kind)&&(typeof own(raw,'text')!=='string'||own(raw,'text').length>100000))return null;
    const checked=cloneJsonValue(raw);return checked.ok?checked.data.value:null;
}
/** Trusted root adapters execute real units; private seed units are substituted, never dispatched. */
export async function executeCompiledIteration(token,invocation,ports) {
    const program=programs.get(token);if(!program)return fail('INVALID_ITERATION_CAPABILITY','Use the private compiler capability for this exact helper.');
    try {
        const snapshot=cloneJsonValue(invocation);if(!snapshot.ok)return fail('INVALID_ITERATION_INVOCATION','Iteration invocation requires bounded own JSON.');
        const call=snapshot.data.value,at=nodeAddress(call.address);
        if(!at||!boundedAddress(at)||at.workflowId!==program.owner.workflowId||at.nodeId!==program.owner.nodeId||at.instancePath.length+2+program.maxRelativeDepth>8||definitionRefKey(call.helper)!==definitionRefKey(program.ref)||call.phase!==program.phase||call.rootMode!==program.rootMode||!Number.isSafeInteger(call.index)||call.index<0||call.index>127||!Object.hasOwn(call,'item')||!validVisibilityMetadata(call)||program.requiresState&&!Object.hasOwn(call,'projectedState'))return fail('INVALID_ITERATION_INVOCATION','The invocation must match the compiled pin, stage and qualified owner.');
        if(typeof ports?.executeUnit!=='function')return fail('ITERATION_ADAPTER_MISSING','The trusted root operation adapter is required.');
        if(ports.signal?.aborted)return stopped();
        const artifacts=new Map(),states=new Map();
        const mark=artifactVisibility(call),withMark=value=>{const artifact={kind:'data',value};return mark.kind==='public'?artifact:{...artifact,visibility:mark};};
        const actualAddress=unit=>({workflowId:at.workflowId,instancePath:[...at.instancePath,at.nodeId,'iteration-'+call.index,...unit.address.instancePath.slice(1)],nodeId:unit.address.nodeId});
        for(const unit of program.units){
            if(ports.signal?.aborted)return stopped();
            const key=nodeAddressKey(unit.address);
            if(!unit.address.instancePath.length){
                const value=unit.address.nodeId===ITEM_DATA?withMark(call.item):unit.address.nodeId===STATE_DATA&&Object.hasOwn(call,'projectedState')?withMark(call.projectedState):unit.node.operation==='text'?{kind:'text',text:'null'}:undefined;
                for(const port of unit.outputPorts){const pin={...unit.address,portId:port.id};states.set(artifactAddressKey(pin),{status:value===undefined?'skipped':'completed'});if(value!==undefined){const artifact=freeze(value);if(typeof ports.retainScopedOutput==='function'){const retained=await ports.retainScopedOutput({node:unit.node,address:actualAddress(unit),inputs:{},artifact,portId:port.id,seed:true});if(ports.signal?.aborted)return stopped();if(retained?.ok!==true||retained.data?.retained!==true)return retained?.ok===false?retained:fail('ACTOR_SCOPE_FAILED','The helper seed scope was not retained.');}artifacts.set(artifactAddressKey(pin),artifact);}}
                continue;
            }
            const inputs={},inputStates={};for(const edge of program.edges)if(nodeAddressKey(edge.to)===key){const state=states.get(artifactAddressKey(edge.from))??{status:'unresolved'};inputStates[edge.to.portId]=state;if(state.status==='completed')inputs[edge.to.portId]=artifacts.get(artifactAddressKey(edge.from));}
            const op=operationFor(unit.node,{phase:program.phase,mode:'native-unified'});
            let missing;
            for(const pin of unit.inputPorts){const state=inputStates[pin.id]??{status:pin.required?'unresolved':'skipped'};inputStates[pin.id]=state;if(state.status==='unresolved'||pin.required&&state.status!=='completed')missing=state;if(!op.acceptsSkippedInputs&&state.status==='skipped'&&pin.required)missing=state;}
            if(missing){for(const pin of unit.outputPorts)states.set(artifactAddressKey({...unit.address,portId:pin.id}),freeze({...missing}));continue;}
            const childProgram=program.nested.get(key),actual=freeze({...unit,phase:program.phase,address:actualAddress(unit)}),local={phase:program.phase,rootMode:program.rootMode,root:false,address:actual.address,inputStates:freeze(inputStates),roles:freeze(program.scopes.get(pathKey(unit.address.instancePath)).roles),...(ports.request?{request:ports.request}:{}),...(ports.signal?{signal:ports.signal}:{})};
            if(childProgram){const childToken=Object.freeze({});programs.set(childToken,childProgram);local.iterateHelper=(childInvocation,childPorts)=>executeCompiledIteration(childToken,childInvocation,{...ports,request:childPorts.request});}
            let result;try{result=await ports.executeUnit(actual,freeze(inputs),Object.freeze(local));}catch{return ports.signal?.aborted?stopped():fail('ITERATION_UNIT_FAILED','A helper operation failed; no partial result was published.');}
            if(ports.signal?.aborted)return stopped();
            if(own(result,'ok')!==true)return fail('ITERATION_UNIT_FAILED','A helper operation failed; no partial result was published.');
            const outputs=own(result,'outputs'),outputStates=own(result,'outputStates');
            if(outputs!==undefined&&!plain(outputs)||outputStates!==undefined&&!plain(outputStates)||[...Object.keys(outputs??{}),...Object.keys(outputStates??{})].some(id=>!unit.outputPorts.some(pin=>pin.id===id)))return fail('INVALID_ITERATION_OUTPUT','A helper returned undeclared output pins.');
            for(const pin of unit.outputPorts){let raw=outputs===undefined&&pin.id==='out'?own(result,'artifact'):own(outputs,pin.id);const rawState=own(outputStates,pin.id),status=rawState===undefined?(raw===undefined?'unresolved':'completed'):own(rawState,'status');
                if(!['completed','skipped','unresolved'].includes(status)||status==='completed'&&raw===undefined||status!=='completed'&&raw!==undefined)return fail('INVALID_ITERATION_OUTPUT','Helper output states must match declared artifacts.');
                const target={...unit.address,portId:pin.id};states.set(artifactAddressKey(target),freeze({status}));if(status!=='completed')continue;
                let artifact=checkedArtifact(raw,pin.kind);if(!artifact)return fail('INVALID_ITERATION_OUTPUT','A helper returned invalid bounded artifacts or disclosure metadata.');
                const inherited=preserveArtifactPrivacy({ok:true,artifact},inputs);if(!inherited.ok)return inherited;artifact=inherited.artifact;
                if(unit.node.modifiers?.length){const modified=applyTextModifiers(artifact.text,unit.node.modifiers);if(!modified.ok)return fail('INVALID_ITERATION_OUTPUT','A helper text modifier could not be applied.');artifact={...artifact,text:modified.data.text};}
                artifact=freeze(artifact);
                if(typeof ports.retainScopedOutput==='function'){const retained=await ports.retainScopedOutput({node:unit.node,address:actual.address,inputs,artifact,portId:pin.id,rawResult:result});if(ports.signal?.aborted)return stopped();if(retained?.ok!==true||retained.data?.retained!==true)return retained?.ok===false?retained:fail('ACTOR_SCOPE_FAILED','The helper output scope was not retained.');}
                artifacts.set(artifactAddressKey(target),artifact);
            }
        }
        if(ports.signal?.aborted)return stopped();
        const resultPin=program.targets.result,artifact=artifacts.get(artifactAddressKey(resultPin));if(states.get(artifactAddressKey(resultPin))?.status!=='completed'||own(artifact,'kind')!=='data')return fail('ITERATION_OUTPUT_UNRESOLVED','The helper result is skipped or unresolved.');
        const result={ok:true,artifact};
        if(program.mode==='projected-state'){const statePin=program.targets.nextState,next=artifacts.get(artifactAddressKey(statePin));if(states.get(artifactAddressKey(statePin))?.status!=='completed'||own(next,'kind')!=='data')return fail('ITERATION_OUTPUT_UNRESOLVED','The helper next state is skipped or unresolved.');result.projectedState=next.value;result.projectedStateVisibility=artifactVisibility(next);}
        return freeze(result);
    }catch{return ports?.signal?.aborted?stopped():fail('INVALID_ITERATION_OUTPUT','The helper returned invalid own data; no partial result was published.');}
}
