import { preserveArtifactPrivacy, validVisibilityMetadata } from '../artifact-privacy.js?v=0.27.1';
import { cloneJsonValue, readJsonPath } from './json-data.js?v=0.27.1';
import { resolveThresholds } from '../progression.js?v=0.27.1';
import { own, plain, freeze } from '../record-data.js?v=0.27.1';

const fail=(code,message)=>({ok:false,error:{code,message}});
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':plain(value)?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const exact=(value,keys)=>plain(value)&&Object.keys(value).every(key=>keys.includes(key));
const path=value=>Array.isArray(value)&&value.length<=32&&value.every(key=>typeof key==='string'&&key.length<=256);
const modes=['lookup','filter','count','sum','threshold','merge','rule-lookup','project','flatten'];
const defaults={mode:'count',collectionPath:[],fieldPath:[],value:'',operator:'equals',missingPolicy:'hold',thresholds:'[]',mergePolicy:'keep-all',identityPath:['id']};
const controls={
    mode:{type:'enum',values:modes,default:'count'},
    collectionPath:{type:'array',items:'string',default:[],max:32},
    fieldPath:{type:'array',items:'string',default:[],max:32},
    value:{type:'string',default:'',maxLength:4096,help:'A wired Match Data value overrides this literal.'},
    operator:{type:'enum',values:['equals','not-equals','at-least','at-most','contains','exists'],default:'equals'},
    missingPolicy:{type:'enum',values:['hold','exclude','include'],default:'hold'},
    thresholds:{type:'string',default:'[]',editor:'json',maxLength:4096},
    mergePolicy:{type:'enum',values:['keep-all','add-unique'],default:'keep-all'},
    identityPath:{type:'array',items:'string',default:['id'],max:32},
};
export const COLLECTION_OPERATIONS={
    collection:{id:'collection',title:'Collection',family:'Collections',phase:'both',minimumSchema:3,minimumRuntime:2,operationVersion:1,input:'data',output:'data',controls:Object.keys(defaults),defaults,controlDescriptors:controls,requestBound:0,modelRole:null,terminal:false,dynamicPorts:true,modes},
};
function settingsFor(raw) {
    const cloned=cloneJsonValue(raw);if(!cloned.ok)return cloned;
    if(!exact(cloned.data.value,Object.keys(defaults)))return fail('INVALID_SETTINGS','Use supported Collection controls.');
    const settings={...defaults,...cloned.data.value};
    if(!modes.includes(settings.mode)||!path(settings.collectionPath)||!path(settings.fieldPath)||!path(settings.identityPath)
        ||typeof settings.value!=='string'||settings.value.length>4096||!controls.operator.values.includes(settings.operator)
        ||!controls.missingPolicy.values.includes(settings.missingPolicy)||typeof settings.thresholds!=='string'||settings.thresholds.length>4096
        ||!controls.mergePolicy.values.includes(settings.mergePolicy))return fail('INVALID_SETTINGS','Use bounded Collection modes, paths and policies.');
    if(settings.mode==='threshold') {
        try{settings.parsedThresholds=JSON.parse(settings.thresholds);}catch{return fail('INVALID_SETTINGS','Thresholds must be an authored JSON number array.');}
        const checked=resolveThresholds(0,0,settings.parsedThresholds);if(!checked.ok)return checked;
    }
    return {ok:true,data:settings};
}
function collectionAt(value,settings) {
    let collection=value;
    if(settings.mode==='rule-lookup'&&!settings.collectionPath.length&&plain(value)&&Object.hasOwn(value,'rules'))collection=value.rules;
    else {
        const selected=readJsonPath(value,settings.collectionPath);if(!selected.ok)return selected;
        if(!selected.data.found)return fail('UNRESOLVED_COLLECTION','The collection path is missing.');
        collection=selected.data.value;
    }
    if(!Array.isArray(collection)||collection.length>1024)return fail('INVALID_COLLECTION','The selected value must be an array of at most 1024 entries.');
    return {ok:true,data:collection};
}
function compare(actual,expected,operator) {
    if(operator==='equals'||operator==='not-equals'){const equal=canonical(actual)===canonical(expected);return {ok:true,data:operator==='equals'?equal:!equal};}
    if(operator==='contains') {
        if(typeof actual==='string'&&typeof expected==='string')return {ok:true,data:actual.includes(expected)};
        if(Array.isArray(actual))return {ok:true,data:actual.some(value=>canonical(value)===canonical(expected))};
        return fail('INVALID_COMPARISON','Contains requires a string or array.');
    }
    if(typeof actual!=='number'||typeof expected!=='number')return fail('INVALID_COMPARISON','Numeric comparisons require finite numbers.');
    return {ok:true,data:operator==='at-least'?actual>=expected:actual<=expected};
}
/** General collection reducers retain ordered records; authored tables determine rewards elsewhere. */
export function reduceCollection(rawValue,rawSettings={},rawExtras={}) {
    const parsed=settingsFor(rawSettings);if(!parsed.ok)return parsed;
    const input=cloneJsonValue({value:rawValue,extras:rawExtras});if(!input.ok)return input;
    const settings=parsed.data,value=input.data.value.value,extras=input.data.value.extras;
    if(!exact(extras,['other','match']))return fail('INVALID_INPUT','Collection extras contain only Other and Match values.');
    let output;
    if(settings.mode==='threshold') {
        if(!plain(value)||!Object.hasOwn(value,'before')||!Object.hasOwn(value,'after'))return fail('INVALID_INPUT','Threshold mode requires explicit before and after numbers.');
        const result=resolveThresholds(value.before,value.after,settings.parsedThresholds);if(!result.ok)return result;output=result.data;
    } else {
        const collection=collectionAt(value,settings);if(!collection.ok)return collection;
        if(settings.mode==='project') {
            output=[];
            for(const record of collection.data) {
                const selected=readJsonPath(record,settings.fieldPath);if(!selected.ok)return selected;
                if(!selected.data.found) {
                    if(settings.missingPolicy==='hold')return fail('UNRESOLVED_COLLECTION','A projection field is missing.');
                    if(settings.missingPolicy==='include')output.push(null);
                } else output.push(selected.data.value);
            }
        } else if(settings.mode==='flatten') {
            output=[];
            for(const records of collection.data) {
                if(!Array.isArray(records))return fail('INVALID_COLLECTION','Flatten requires explicit array entries.');
                if(output.length+records.length>1024)return fail('COLLECTION_LIMIT','Flattened collections contain at most 1024 entries.');
                output.push(...records);
            }
        } else if(settings.mode==='count')output=collection.data.length;
        else if(settings.mode==='sum') {
            let total=0;
            for(const record of collection.data) {
                const selected=readJsonPath(record,settings.fieldPath);if(!selected.ok)return selected;
                if(!selected.data.found)return fail('UNRESOLVED_COLLECTION','A sum field is missing.');
                if(typeof selected.data.value!=='number'||Math.abs(selected.data.value)>Number.MAX_SAFE_INTEGER)return fail('INVALID_SUM','Sum fields require bounded finite numbers.');
                total+=selected.data.value;if(!Number.isFinite(total)||Math.abs(total)>Number.MAX_SAFE_INTEGER)return fail('VALUE_OVERFLOW','The numeric sum exceeds safe bounds.');
            }
            output=total;
        } else if(settings.mode==='merge') {
            if(!Object.hasOwn(extras,'other'))return fail('MISSING_INPUT','Merge requires an explicit Other collection.');
            const other=collectionAt(extras.other,settings);if(!other.ok)return other;
            const all=[...collection.data,...other.data];
            if(all.length>1024)return fail('COLLECTION_LIMIT','Merged collections contain at most 1024 entries.');
            if(settings.mergePolicy==='keep-all')output=all;
            else {
                const values=new Map();output=[];
                for(const record of all) {
                    const selected=readJsonPath(record,settings.identityPath);if(!selected.ok)return selected;
                    if(!selected.data.found||!['string','number'].includes(typeof selected.data.value)||typeof selected.data.value==='string'&&!selected.data.value.trim())return fail('INVALID_IDENTITY','Unique merging requires an explicit nonempty scalar identity.');
                    const key=canonical(selected.data.value);
                    if(values.has(key)){if(canonical(values.get(key))!==canonical(record))return fail('IDENTITY_CONFLICT','The same identity has different record content.');continue;}
                    values.set(key,record);output.push(record);
                }
            }
        } else {
            const expected=Object.hasOwn(extras,'match')?extras.match:settings.value;
            const fieldPath=settings.mode==='rule-lookup'&&!settings.fieldPath.length?['eventType']:settings.fieldPath;
            const retained=[];
            for(const record of collection.data) {
                const selected=readJsonPath(record,fieldPath);if(!selected.ok)return selected;
                if(settings.operator==='exists'){if(selected.data.found)retained.push(record);continue;}
                if(!selected.data.found) {
                    if(settings.missingPolicy==='hold')return fail('UNRESOLVED_COLLECTION','A filter or lookup field is missing.');
                    if(settings.missingPolicy==='include')retained.push(record);continue;
                }
                const matched=compare(selected.data.value,expected,settings.mode==='rule-lookup'?'equals':settings.operator);if(!matched.ok)return matched;
                if(matched.data)retained.push(record);
            }
            if(settings.mode==='lookup') {
                if(retained.length>1)return fail('AMBIGUOUS_LOOKUP','Multiple records match this lookup.');
                if(!retained.length&&settings.missingPolicy==='hold')return fail('UNRESOLVED_COLLECTION','No record matches this lookup.');
                output={found:retained.length===1,value:retained[0]??null};
            } else output=retained;
        }
    }
    const checked=cloneJsonValue({value:output,actualCalls:0});if(!checked.ok)return fail('COLLECTION_LIMIT','The collection result exceeds portable JSON limits.');
    return {ok:true,data:freeze(checked.data.value)};
}
const pin=(id,direction,required=false)=>({id,label:id,kind:'data',direction,required,cardinality:'one'});
function resolve(node,options={}) {
    if(!plain(node)||!plain(options))return fail('INVALID_SETTINGS','Use plain node metadata.');
    for(const [value,keys] of [[node,['operation','operationVersion','phase','type']],[options,['phase']]])for(const key of keys) {
        const property=Object.getOwnPropertyDescriptor(value,key);
        if(property&&(!property.enumerable||!Object.hasOwn(property,'value')))return fail('INVALID_SETTINGS','Routing metadata requires own data properties.');
    }
    if(!plain(node)||!plain(options)||own(node,'operation')!=='collection'||own(node,'operationVersion')!==undefined&&own(node,'operationVersion')!==1)return fail('UNKNOWN_OPERATION','Unknown Collection operation.');
    const phase=own(options,'phase')??own(node,'phase')??'pre';
    if(!['pre','post'].includes(phase)||own(node,'phase')!==undefined&&own(node,'phase')!==phase)return fail('INVALID_PHASE','Collection phase must match its effective phase.');
    const raw={};
    for(const key of Object.keys(defaults)) {
        const property=Object.getOwnPropertyDescriptor(node,key);
        if(property&&(!property.enumerable||!Object.hasOwn(property,'value')))return fail('INVALID_SETTINGS','Controls require own data properties.');
        raw[key]=property?property.value:defaults[key];
    }
    const parsed=settingsFor(raw);if(!parsed.ok)return parsed;
    const ports=[pin('in','input',true),...(parsed.data.mode==='merge'?[pin('other','input',true)]:['lookup','filter','rule-lookup'].includes(parsed.data.mode)?[pin('match','input')]:[]),pin('out','output')];
    return {ok:true,data:{descriptor:{...COLLECTION_OPERATIONS.collection,phase},ports,settings:raw}};
}
export function describeCollection(node,options={}) {
    const result=resolve(node,options);if(!result.ok)return result;return {ok:true,data:{descriptor:result.data.descriptor,ports:result.data.ports}};
}
function executeCollectionRaw(node,namedInputs,local={}) {
    try {
        const described=resolve(node,{phase:own(local,'phase')});if(!described.ok)return described;
        const checked=cloneJsonValue(namedInputs);if(!checked.ok)return checked;const inputs=checked.data.value,allowed=described.data.ports.filter(port=>port.direction==='input');
        if(!plain(inputs)||Object.keys(inputs).some(key=>!allowed.some(port=>port.id===key)))return fail('UNSUPPORTED_INPUT','Use declared Collection inputs.');
        for(const port of allowed) {
            if(!Object.hasOwn(inputs,port.id)){if(port.required)return fail('MISSING_INPUT','Required input is missing: '+port.id);continue;}
            if(!exact(inputs[port.id],['kind','value','visibility','status','acceptance','scope','sourceRefs'])||!validVisibilityMetadata(inputs[port.id])||inputs[port.id].kind!=='data'||!Object.hasOwn(inputs[port.id],'value'))return fail('INVALID_INPUT','Collection inputs require bounded Data artifacts.');
        }
        const result=reduceCollection(inputs.in.value,described.data.settings,{...(inputs.other?{other:inputs.other.value}:{}),...(inputs.match?{match:inputs.match.value}:{})});
        if(!result.ok)return result.error.code==='UNRESOLVED_COLLECTION'?{ok:true,outputStates:{out:{status:'unresolved',reason:result.error}}}:result;
        return {ok:true,artifact:{kind:'data',value:result.data.value},reports:[{operation:'collection',mode:described.data.settings.mode,actualCalls:0}]};
    }catch{return fail('INVALID_INPUT','Collection reducers require bounded own plain data.');}
}
export function executeCollection(node,namedInputs,local = {}) { return preserveArtifactPrivacy(executeCollectionRaw(node,namedInputs,local),namedInputs); }
