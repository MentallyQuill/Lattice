import { ACTIVE_PROFILE_ID, ACTIVE_PROFILE_NAME, activeModelMetadata } from './model-profiles.js?v=0.27.3';
const fail = (code, message) => ({ok:false,error:{code,message}});
const resolved = new WeakMap();
const fingerprint = () => globalThis.crypto.randomUUID();
const safeSignature = value => JSON.stringify(value, (key,item) => /secret|password|api.?key|custom_headers|authorization/i.test(key) ? undefined : item);
const ENDPOINT_FIELDS = {custom:'custom_url',vertexai:'vertexai_region',zai:'zai_endpoint',siliconflow:'siliconflow_endpoint',minimax:'minimax_endpoint',pollinations:'pollinations_endpoint'};
// These installed CC sources can use a named or inherited reverse proxy.
const PROXY_SOURCES = new Set(['claude','openai','mistralai','makersuite','vertexai','deepseek','xai','zai','moonshot']);
// Installed nonstreaming wrappers discard the upstream completion reason.
const LOSSY_CC_SOURCES = new Set(['claude','makersuite','vertexai']);
const COMPLETE_REASONS = new Set(['stop','eos_token','eos','stop_sequence','end_turn','complete','completed']);
const TC_MODELS = {ooba:'custom_model',generic:'generic_model',mancer:'mancer_model',togetherai:'togetherai_model',infermaticai:'infermaticai_model',dreamgen:'dreamgen_model',openrouter:'openrouter_model',vllm:'vllm_model',aphrodite:'aphrodite_model',ollama:'ollama_model',featherless:'featherless_model',tabby:'tabby_model',llamacpp:'llamacpp_model'};
function presetByName(context, api, name) {
    if (!name) return {};
    const manager = context.getPresetManager?.(api);
    const found = manager?.getCompletionPresetByName?.(name);
    if (found !== undefined) return structuredClone(found);
    const list = manager?.getPresetList?.();
    const names = list?.preset_names;
    const index = Array.isArray(names) ? names.indexOf(name) : names?.[name];
    return index !== undefined && index >= 0 && list.presets?.[index] !== undefined ? structuredClone(list.presets[index]) : null;
}
function completionEvidence(raw, binding) {
    if (binding.api === 'textgenerationwebui' && binding.source === 'ollama') {
        const prompt = raw?.prompt_eval_count, completion = raw?.eval_count;
        const hasPrompt = Number.isSafeInteger(prompt) && prompt >= 0;
        const hasCompletion = Number.isSafeInteger(completion) && completion >= 0;
        const usage = hasPrompt || hasCompletion ? {...(hasPrompt ? {prompt_tokens:prompt} : {}),...(hasCompletion ? {completion_tokens:completion} : {}),...(hasPrompt && hasCompletion ? {total_tokens:prompt + completion} : {})} : null;
        return {finish:raw?.done === true ? raw?.done_reason : null,usage};
    }
    const choice = raw?.choices?.[0];
    const reasons = [choice?.finish_reason,choice?.native_finish_reason,raw?.finish_reason,raw?.stop_reason,raw?.results?.[0]?.finish_reason];
    const cutoff = reasons.find(reason=>typeof reason === 'string' && ['length','max_tokens','max_output_tokens'].includes(reason.toLowerCase()));
    const unverified = reasons.find(reason=>reason !== undefined && reason !== null && (typeof reason !== 'string' || !COMPLETE_REASONS.has(reason.toLowerCase())));
    return {finish:cutoff ?? unverified ?? reasons.find(reason=>reason !== undefined && reason !== null) ?? null,usage:raw?.usage ?? null};
}
/** Authenticate a captured binding and recheck its effective host dependencies. */
export function bindingStatus(binding, context) {
    try {
        context = typeof context === 'function' ? context() : context;
        const remembered = resolved.get(binding);
        if (!remembered || safeSignature(binding) !== remembered.metadata) return fail('BINDING_CHANGED', 'Resolve the fixed connection again before requesting.');
        const current = resolveBinding(remembered.node, remembered.graph, context);
        return current.ok && resolved.get(current.data).signature === remembered.signature
            ? { ok: true }
            : fail('BINDING_CHANGED', 'The fixed connection changed after preflight. Run preflight again.');
    } catch { return fail('BINDING_CHANGED', 'The fixed connection is no longer available. Run preflight again.'); }
}
/** Safe provenance is a detached selector, never request authority or a private signature. */
export function bindingSummary(binding) {
    const remembered = binding && resolved.get(binding);
    return remembered ? Object.freeze({...remembered.summary,fingerprint:remembered.fingerprint}) : undefined;
}
// Callback-free request state used only inside the trusted native transport guard.
// Select known public configuration; secrets and native prompt assembly stay out.
function requestStateWatch(context,binding){
    try{
        const own=(value,key)=>{const property=value&&Object.getOwnPropertyDescriptor(value,key);if(!property)return undefined;if(!Object.hasOwn(property,'value'))throw Error();return property.value;};
        const seen=new Set();let entries=0;
        const copy=(value,chat=false,depth=0)=>{
            if(++entries>20000||depth>32)throw Error();
            if(value===undefined||typeof value==='function'||typeof value==='symbol')return undefined;
            if(value===null||typeof value==='string'||typeof value==='boolean')return value;
            if(typeof value==='number'){if(!Number.isFinite(value))throw Error();return value;}
            if(typeof value!=='object'||seen.has(value))throw Error();
            const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);if(array?prototype!==Array.prototype&&prototype!==null:prototype!==Object.prototype&&prototype!==null)throw Error();
            seen.add(value);const out=array?[]:{};
            for(const key of Reflect.ownKeys(value)){
                if(array&&key==='length')continue;
                if(typeof key!=='string')throw Error();
                if(/secret|password|credentials?|(?:api|access)[_-]?token|api.?key|custom_headers|authorization/i.test(key)||chat&&NATIVE_CHAT_FIELDS.has(key))continue;
                const property=Object.getOwnPropertyDescriptor(value,key);if(!property||!Object.hasOwn(property,'value'))throw Error();if(!property.enumerable)continue;
                if(array&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length))throw Error();
                const item=copy(property.value,chat,depth+1);if(array)out[Number(key)]=item??null;else if(item!==undefined)Object.defineProperty(out,key,{value:item,enumerable:true});
            }
            seen.delete(value);if(array&&out.length!==value.length)throw Error();return out;
        };
        const power=own(context,'powerUserSettings'),profiles=own(own(own(context,'extensionSettings'),'connectionManager'),'profiles');let selectedProfile;
        if(profiles!==undefined){if(!Array.isArray(profiles)||profiles.length>10000)throw Error();for(let index=0;index<profiles.length;index++){const profile=own(profiles,String(index));if(profile&&own(profile,'id')===binding.profileId){if(selectedProfile)throw Error();selectedProfile=profile;}}}
        const stamp=JSON.stringify({mainApi:copy(own(context,'mainApi')),routes:copy(own(context,'CONNECT_API_MAP')),chat:copy(own(context,'chatCompletionSettings'),true),text:copy(own(context,'textCompletionSettings')),stopping:copy({custom_stopping_strings:own(power,'custom_stopping_strings'),custom_stopping_strings_macro:own(power,'custom_stopping_strings_macro'),...(binding.api==='textgenerationwebui'?{single_line:own(power,'single_line'),instruct:own(power,'instruct'),context:own(power,'context')}:{})}),profile:copy(selectedProfile)});
        if(new TextEncoder().encode(stamp).length>4000000)throw Error();return stamp;
    }catch{return null;}
}
/** Send owned messages through the selected fixed or active route without activation. */
export async function requestModel({binding,messages,maxTokens,signal},contextOrGetter,transport = {}) {
    const getContext = typeof contextOrGetter === 'function' ? contextOrGetter : () => contextOrGetter;
    if (signal?.aborted) return fail('ABORTED', 'The request was stopped.');
    if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0 || maxTokens > 65536 || !Array.isArray(messages) || !messages.length || messages.length > 1000 || messages.some(message=>!message || !['system','user','assistant','tool'].includes(message.role) || typeof message.content !== 'string')) return fail('INVALID_REQUEST', 'Provide owned messages and a positive bounded completion limit.');
    const context = getContext();
    const authentication = bindingStatus(binding, context);
    if (!authentication.ok) return authentication;
    const check = () => bindingStatus(binding, getContext).ok;
    if (!check()) return fail('BINDING_CHANGED', 'The fixed connection changed after preflight. Run preflight again.');
    try {
        const tc = binding.api === 'textgenerationwebui';
        const active = binding.profileId === ACTIVE_PROFILE_ID;
        const service = tc ? context.TextCompletionService : context.ChatCompletionService;
        if (active ? typeof service?.presetToGeneratePayload !== 'function' || typeof service?.sendRequest !== 'function' : typeof context.ConnectionManagerRequestService?.sendRequest !== 'function') return fail('SERVICE_UNAVAILABLE', 'The required SillyTavern request service is unavailable.');
        const receiver = active ? service : context.ConnectionManagerRequestService;
        const sendRequest = receiver.sendRequest;
        const fixedProfileId = binding.profileId;
        const beforeSend = transport.beforeSend;
        if (beforeSend !== undefined && typeof beforeSend !== 'function') return fail('REQUEST_SCOPE_FAILED', 'The trusted auxiliary request scope is unavailable.');
        const capture = resolved.get(binding).active;
        const payload = {model:binding.model,max_tokens:maxTokens,stream:false,...(tc ? {api_type:binding.source,api_server:binding.endpoint} : {chat_completion_source:binding.source,messages:structuredClone(messages)})};
        if (!tc && ENDPOINT_FIELDS[binding.source]) payload[ENDPOINT_FIELDS[binding.source]] = binding.endpoint;
        Object.assign(payload,binding.endpointDependencies ?? {});
        // The CC converter chooses max_tokens or max_completion_tokens for its model.
        // An owned max_tokens override would restore a field the host deliberately removes.
        if (active && !tc) delete payload.max_tokens;
        if (active && tc && binding.model === null) delete payload.model;
        let overrides = payload;
        if (active && tc) {
            if (capture.instruct?.enabled && typeof service.constructPrompt !== 'function') return fail('SERVICE_UNAVAILABLE', 'The host instruct formatter is unavailable.');
            payload.prompt = capture.instruct?.enabled ? service.constructPrompt(structuredClone(messages),structuredClone(capture.instruct)) : messages.map(message=>message.content).join('\n\n');
            overrides = service.presetToGeneratePayload({}, {genamt:maxTokens},payload);
        } else if (!tc) {
            overrides = await context.ChatCompletionService.presetToGeneratePayload(active ? structuredClone(capture.settings) : presetByName(context,'openai',binding.preset),{chat_completion_source:binding.source,...(active ? {openai_max_tokens:maxTokens} : {})},payload);
            overrides.custom_include_body = '';
            overrides.custom_exclude_body = '';
        }
        if (active) {
            // Bound the host-selected aliases without inventing unsupported model fields.
            if (tc || Object.hasOwn(overrides,'max_tokens') || !Object.hasOwn(overrides,'max_completion_tokens')) overrides.max_tokens = maxTokens;
            if (!tc && Object.hasOwn(overrides,'max_completion_tokens')) overrides.max_completion_tokens = maxTokens;
            overrides.stream = false;
        }
        if (signal?.aborted) return fail('ABORTED', 'The request was stopped before transmission.');
        const passiveState = beforeSend ? requestStateWatch(getContext(),binding) : null;
        if (beforeSend && passiveState === null || !check()) return fail('BINDING_CHANGED', 'The fixed connection changed before transmission. Run preflight again.');
        // Only a host-owned third-argument closure can authorize scope here. Request
        // fields and portable graph controls cannot replace it; asynchronous guards
        // would open another gap between authorization and native transmission.
        if (beforeSend) {
            const scoped = beforeSend(currentContext=>passiveState===requestStateWatch(currentContext,binding)?{ok:true}:fail('BINDING_CHANGED','The connection changed before transmission. Run preflight again.'));
            if (!scoped || scoped instanceof Promise || scoped.ok !== true) return scoped?.ok === false ? scoped : fail('REQUEST_SCOPE_FAILED', 'The trusted auxiliary request scope is unavailable.');
        }
        if (signal?.aborted) return fail('ABORTED', 'The request was stopped before transmission.');
        const raw = active ? await sendRequest.call(receiver,overrides,false,signal) : await sendRequest.call(receiver,fixedProfileId,messages,maxTokens,{stream:false,extractData:false,includePreset:tc,includeInstruct:true,signal},overrides);
        const choice = raw?.choices?.[0];
        if (signal?.aborted) return fail('ABORTED', 'The request was stopped; ignore its late output.');
        const {finish,usage} = completionEvidence(raw,binding);
        const reason = typeof finish === 'string' ? finish.toLowerCase() : '';
        if (['length','max_tokens','max_output_tokens'].includes(reason)) return {ok:false,error:{code:'TRUNCATED_OUTPUT',message:'The request reached its completion limit.',finish,usage}};
        if (!COMPLETE_REASONS.has(reason)) return {ok:false,error:{code:'COMPLETION_UNVERIFIED',message:'The host response does not expose a verified complete text result; keep the original.',finish:typeof finish === 'string' ? finish : null,usage}};
        const nativeText = Array.isArray(raw?.message?.content) ? raw.message.content.filter(part=>part.type === 'text' && typeof part.text === 'string').map(part=>part.text).join('') : undefined;
        let text = binding.api === 'openai' && binding.source === 'cohere' ? nativeText : undefined;
        if (text === undefined) {
            try { text = context.extractMessageFromData?.(raw,binding.api); } catch { /* Provider fallback below. */ }
        }
        text ||= choice?.message?.content ?? choice?.text ?? raw?.response ?? nativeText ?? raw?.results?.[0]?.text ?? raw?.content ?? raw?.text ?? (typeof raw === 'string' ? raw : '');
        if (typeof text !== 'string' || !text.trim()) return fail('EMPTY_OUTPUT', 'The auxiliary request returned no text.');
        return {ok:true,data:{text,usage,finish}};
    } catch {
        return fail(signal?.aborted ? 'ABORTED' : 'REQUEST_FAILED', 'The auxiliary request failed. Inspect the fixed connection; no retry was made.');
    }
}
export function resolveBinding(node, graph, context) {
    context = typeof context === 'function' ? context() : context;
    const role = graph.roles?.[node.modelRole];
    const profileId = node.profileId || role?.profileId;
    if (profileId === ACTIVE_PROFILE_ID) return resolveActiveBinding(node,context,role);
    if (!profileId) return fail('BINDING_MISSING', 'Choose a connection profile from the dropdown beneath this node.');
    if (typeof context.ConnectionManagerRequestService?.getProfile !== 'function') return fail('SERVICE_UNAVAILABLE', 'SillyTavern Connection Manager is unavailable.');
    let profile;
    try { profile = context.ConnectionManagerRequestService.getProfile(profileId); }
    catch { return fail('PROFILE_MISSING', 'The fixed connection profile is missing or unavailable.'); }
    if (!profile) return fail('PROFILE_MISSING', 'The fixed connection profile is missing.');
    const route = context.CONNECT_API_MAP?.[profile.api];
    if (!route || !['openai','textgenerationwebui'].includes(route.selected)) return fail('UNSUPPORTED_BINDING', 'Only mapped chat/text completion connections are supported.');
    if ((route.selected === 'openai' && LOSSY_CC_SOURCES.has(route.source)) || (route.selected === 'textgenerationwebui' && route.type === 'infermaticai')) return fail('UNSUPPORTED_BINDING', 'This installed host wrapper discards completion evidence. Use a connection that preserves its completion reason.');
    if (route.selected === 'openai' && PROXY_SOURCES.has(route.source) && profile.proxy) return fail('UNSUPPORTED_BINDING', 'Named proxy routes cannot be verified through the public host context. Use a directly resolved connection.');
    const preset = presetByName(context,route.selected,profile.preset);
    if (!preset) return fail('PRESET_MISSING', 'The fixed profile sampler preset is missing.');
    const inheritedProxy = Object.hasOwn(preset,'reverse_proxy') ? preset.reverse_proxy : context.chatCompletionSettings?.reverse_proxy;
    if (route.selected === 'openai' && PROXY_SOURCES.has(route.source) && inheritedProxy) return fail('UNSUPPORTED_BINDING', 'This route inherits a reverse proxy that cannot be isolated through the public host services. Use a direct connection.');
    const tc = route.selected === 'textgenerationwebui';
    if (tc && profile.instruct && !presetByName(context,'instruct',profile.instruct)) return fail('INSTRUCT_MISSING', 'The fixed profile instruct preset is missing.');
    if (tc && context.textCompletionSettings?.type !== route.type) return fail('UNSUPPORTED_BINDING', 'The host cannot convert text completion samplers across providers without switching the live connection.');
    const model = node.model || (!node.profileId && role?.model) || profile.model || (tc ? (route.type === 'huggingface' ? 'tgi' : context.textCompletionSettings?.[TC_MODELS[route.type]]) : context.getChatCompletionModel?.({...context.chatCompletionSettings,...preset,chat_completion_source:route.source}));
    if (!model && !(tc && route.type === 'koboldcpp')) return fail('MODEL_MISSING', 'Select a model in the fixed profile or node.');
    const field = ENDPOINT_FIELDS[route.source];
    const extraFields = route.source === 'azure' ? ['azure_base_url','azure_deployment_name','azure_api_version'] : route.source === 'workers_ai' ? ['workers_ai_account_id'] : [];
    const extras = Object.fromEntries(extraFields.map(key=>[key,preset[key] || context.chatCompletionSettings?.[key]]));
    if (extraFields.some(key=>!extras[key])) return fail('ENDPOINT_MISSING', 'The provider requires endpoint/account configuration in its preset or host settings.');
    const endpoint = tc ? profile['api-url'] || context.getTextGenServer?.(route.type) : field ? profile['api-url'] || preset[field] || context.chatCompletionSettings?.[field] : extras.azure_base_url || extras.workers_ai_account_id || null;
    if ((tc || field) && !endpoint) return fail('ENDPOINT_MISSING', 'The fixed profile requires an available endpoint.');
    const data = {profileId,profileName:profile.name,model:model || null,source:tc ? route.type : route.source,api:route.selected,endpoint:endpoint || null,endpointOrigin:(tc || field) && profile['api-url'] ? 'profile' : (field && preset[field]) || (extraFields.length && preset[extraFields[0]]) ? 'preset' : endpoint ? 'host' : 'provider',preset:profile.preset || null,instruct:profile.instruct || null,...(extraFields.length ? {endpointDependencies:extras} : {})};
    resolved.set(data,{node:{profileId:node.profileId,model:node.model,modelRole:node.modelRole},graph:{roles:{[node.modelRole]:{profileId:role?.profileId,model:role?.model}}},metadata:safeSignature(data),signature:safeSignature([data,preset,tc ? presetByName(context,'instruct',profile.instruct) : null]),summary:{role:node.modelRole??null,profileId,model:data.model},fingerprint:fingerprint()});
    return {ok:true,data};
}

const HOST_LOADED_TC_MODELS = new Set(['koboldcpp','ooba','generic','tabby','llamacpp']);
const NATIVE_CHAT_FIELDS = new Set(['prompts','prompt_order','send_if_empty','impersonation_prompt','new_chat_prompt','new_group_chat_prompt','new_example_chat_prompt','continue_nudge_prompt','wi_format','scenario_format','personality_format','group_nudge_prompt','assistant_prefill','assistant_impersonation','continue_prefill','continue_postfix']);
// Private captures retain request-affecting live values. They never become provenance.
function activeSettings(settings, chat = false) {
    return JSON.parse(JSON.stringify(settings ?? {}, (key,item) => /secret|password|credentials?|(?:api|access)[_-]?token|api.?key|custom_headers|authorization/i.test(key) || chat && NATIVE_CHAT_FIELDS.has(key) ? undefined : item));
}
function resolveActiveBinding(node, context, role) {
    const metadata = activeModelMetadata(context);
    if (!metadata) return fail('UNSUPPORTED_BINDING', 'Only active chat/text completion connections are supported.');
    const tc = context.mainApi === 'textgenerationwebui', source = metadata.api;
    if ((!tc && LOSSY_CC_SOURCES.has(source)) || tc && source === 'infermaticai') return fail('UNSUPPORTED_BINDING', 'This installed host wrapper discards completion evidence. Use a connection that preserves its completion reason.');
    const settings = activeSettings(tc ? context.textCompletionSettings : context.chatCompletionSettings, !tc);
    if (!tc && PROXY_SOURCES.has(source) && settings.reverse_proxy) return fail('UNSUPPORTED_BINDING', 'This route inherits a reverse proxy that cannot be isolated through the public host services. Use a direct connection.');
    const model = node.model || (!node.profileId && role?.model) || metadata.model;
    if (!model && !(tc && HOST_LOADED_TC_MODELS.has(source))) return fail('MODEL_MISSING', 'Select a model in SillyTavern or on the node.');
    const field = ENDPOINT_FIELDS[source];
    const extraFields = source === 'azure' ? ['azure_base_url','azure_deployment_name','azure_api_version'] : source === 'workers_ai' ? ['workers_ai_account_id'] : [];
    const extras = Object.fromEntries(extraFields.map(key=>[key,settings[key]]));
    if (extraFields.some(key=>!extras[key])) return fail('ENDPOINT_MISSING', 'The provider requires endpoint/account configuration in its host settings.');
    const endpoint = tc ? context.getTextGenServer?.(source) : field ? settings[field] : extras.azure_base_url || extras.workers_ai_account_id || null;
    if ((tc || field) && !endpoint) return fail('ENDPOINT_MISSING', 'The active connection requires an available endpoint.');
    const data = {profileId:ACTIVE_PROFILE_ID,profileName:ACTIVE_PROFILE_NAME,model:model || null,source,api:context.mainApi,endpoint:endpoint || null,endpointOrigin:endpoint ? 'host' : 'provider',preset:null,instruct:null,...(extraFields.length ? {endpointDependencies:extras} : {})};
    const stopping = activeSettings({custom_stopping_strings:context.powerUserSettings?.custom_stopping_strings,custom_stopping_strings_macro:context.powerUserSettings?.custom_stopping_strings_macro,...(tc ? {single_line:context.powerUserSettings?.single_line} : {})});
    const active = {settings,stopping,...(tc ? {instruct:activeSettings(context.powerUserSettings?.instruct),context:activeSettings(context.powerUserSettings?.context)} : {})};
    resolved.set(data,{node:{profileId:node.profileId,model:node.model,modelRole:node.modelRole},graph:{roles:{[node.modelRole]:{profileId:role?.profileId,model:role?.model}}},metadata:safeSignature(data),signature:safeSignature([data,active]),active,summary:{role:node.modelRole??null,profileId:ACTIVE_PROFILE_ID,model:data.model},fingerprint:fingerprint()});
    return {ok:true,data};
}
