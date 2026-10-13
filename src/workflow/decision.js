import { cloneJsonValue } from './operations/json-data.js?v=0.27.1';
const fail = (code, message) => ({ ok: false, error: { code, message } });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stateValue = value => typeof value === 'string' || plain(value) || Array.isArray(value);
const exact = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key));
const probability = value => Number.isFinite(value) && value >= 0 && value <= 1;
const sameKeys = (left, right) => Object.keys(left).length === right.length && right.every(key => Object.hasOwn(left, key));
const freezeJson = value => { if (value !== null && typeof value === 'object') { Object.values(value).forEach(freezeJson); Object.freeze(value); } return value; };
/** Decision batches have a local 32-question bound, independent of provider limits. */
export function validateDecisionQuestions(value) {
    const checked = cloneJsonValue(value);
    if (!checked.ok || !plain(checked.data.value)) return fail('INVALID_QUESTIONS', 'Questions must be bounded own JSON records.');
    const questions = checked.data.value, ids = Object.keys(questions);
    if (!ids.length || ids.length > 32 || ids.some(id => !id.trim() || id.length > 128)) return fail('INVALID_QUESTIONS', 'Provide 1–32 questions with stable bounded IDs.');
    for (const question of Object.values(questions)) {
        if (!exact(question, ['type', 'instructions', 'criteria']) || !['noul','choice','score'].includes(question.type) || !stateValue(question.instructions) || typeof question.instructions === 'string' && !question.instructions.trim()) return fail('INVALID_QUESTIONS', 'Each question needs a typed question and text or structured instructions.');
        if (question.type === 'noul') {
            if (Object.hasOwn(question, 'criteria') && (!exact(question.criteria, ['true', 'false']) || !Object.keys(question.criteria).length || Object.values(question.criteria).some(item => !stateValue(item)))) return fail('INVALID_QUESTIONS', 'Yes/no descriptions use true and false criteria.');
        } else if (question.type === 'choice') {
            if (!plain(question.criteria) || Object.keys(question.criteria).length < 2 || Object.keys(question.criteria).length > 255 || Object.keys(question.criteria).some(key => !key.trim() || key.length > 128) || Object.values(question.criteria).some(item => item !== null && !stateValue(item))) return fail('INVALID_QUESTIONS', 'Choice needs 2–255 named alternatives.');
        } else if (!Array.isArray(question.criteria) || question.criteria.length < 2 || question.criteria.length > 10 || question.criteria.some(item => !stateValue(item))) return fail('INVALID_QUESTIONS', 'Score needs 2–10 ordered rubric levels.');
    }
    return { ok: true, data: { questions } };
}
export function prepareDecisionRequest(value) {
    const checked = cloneJsonValue(value);
    if (!checked.ok || !exact(checked.data.value, ['state','questions']) || !stateValue(checked.data.value.state)) return fail('INVALID_REQUEST', 'Provide bounded text or structured state and keyed questions.');
    const questions = validateDecisionQuestions(checked.data.value.questions);
    return questions.ok ? { ok: true, data: { state: checked.data.value.state, questions: questions.data.questions } } : questions;
}
const completeReasons = new Set(['stop','eos_token','eos','stop_sequence','end_turn','complete','completed']);
const requestFailure = (result, code = 'REQUEST_FAILED') => fail(typeof result?.error?.code === 'string' && /^[A-Z_]{1,64}$/.test(result.error.code) ? result.error.code : code, 'The decision request failed; no answer was inferred.');
function decisionOptions(value) {
    const checked = cloneJsonValue(value);
    if (!checked.ok || !exact(checked.data.value, ['state','questions','maxTokens'])) return fail('INVALID_SETTINGS', 'Decision settings require bounded supported controls.');
    const settings = checked.data.value;
    const prepared = prepareDecisionRequest({ state: settings.state, questions: settings.questions }); if (!prepared.ok) return prepared;
    const maxTokens = settings.maxTokens ?? 2048;
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 65536) return fail('INVALID_SETTINGS', 'The completion limit must be 1–65,536 tokens.');
    return { ok: true, data: freezeJson({ ...prepared.data, maxTokens }) };
}
function validateTextAnswers(raw, questions) {
    const checked = cloneJsonValue(raw);
    if (!checked.ok || !exact(checked.data.value,['answers']) || !plain(checked.data.value.answers) || !sameKeys(checked.data.value.answers,Object.keys(questions))) return fail('INVALID_DECISION_OUTPUT', 'Return one strict JSON answer for each requested question.');
    const answers = checked.data.value.answers;
    for (const [id, question] of Object.entries(questions)) {
        const answer = answers[id], field = question.type === 'noul' ? 'accepted' : question.type === 'choice' ? 'choice' : 'score';
        if (!exact(answer,['type',field,'confidence','evidence']) || answer.type !== question.type || !Object.hasOwn(answer,field) || Object.hasOwn(answer,'confidence') && !probability(answer.confidence) || Object.hasOwn(answer,'evidence') && (typeof answer.evidence !== 'string' || answer.evidence.length > 2048)) return fail('INVALID_DECISION_OUTPUT', 'The answer must match its declared type and bounded evidence.');
        const value = answer[field];
        if (value !== null && (question.type === 'noul' ? typeof value !== 'boolean' : question.type === 'choice' ? typeof value !== 'string' || !Object.hasOwn(question.criteria,value) : !Number.isFinite(value) || value < 0 || value > question.criteria.length - 1)) return fail('INVALID_DECISION_OUTPUT', 'The answer lies outside its authored alternatives or rubric.');
    }
    return { ok: true, data: { answers } };
}
/** The injected request must be an independently authenticated verified text connection. */
export async function runDecision(value, local = {}) {
    const checked = decisionOptions(value); if (!checked.ok) return checked;
    if (local.signal?.aborted) return fail('ABORTED','The decision was stopped.');
    if (typeof local.request !== 'function') return fail('SERVICE_UNAVAILABLE','Bind the independent text Decision connection.');
    const { state, questions, maxTokens } = checked.data;
    const system = 'Evaluate only the supplied state against the supplied questions. Return strict JSON with exactly an answers map using the same IDs and question types. For noul use accepted: true, false, or null if unresolved; for choice use choice: an offered key or null; for score use score: a zero-based number between the first and last ordered rubric level, or null. Each answer may include evidence (a short quote from the supplied state) and confidence (0 to 1, self-reported certainty). Do not invent absent evidence, add questions, output probabilities, or add prose outside JSON.';
    let result;
    try { result = await local.request({ messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ state, questions }) }], maxTokens, ...(local.signal ? { signal: local.signal } : {}) }); }
    catch { return requestFailure(null); }
    if (local.signal?.aborted) return fail('ABORTED','Ignore the stopped decision result.');
    if (result?.ok !== true) return requestFailure(result);
    const finish = result.data?.finish;
    if (typeof finish !== 'string' || !completeReasons.has(finish.toLowerCase())) return fail('COMPLETION_UNVERIFIED','The text connection did not verify a complete response.');
    const text = result.data?.text;
    if (typeof text !== 'string' || text.length > 100000 || new TextEncoder().encode(text).byteLength > 262144) return fail('INVALID_DECISION_OUTPUT','Decision output must be bounded JSON text.');
    let parsed; try { parsed = JSON.parse(text); } catch { return fail('INVALID_DECISION_OUTPUT','Decision output must be strict JSON without prose or fences.'); }
    const answers = validateTextAnswers(parsed, questions); if (!answers.ok) return answers;
    const usage = safeUsage(result.data?.usage ?? null);
    if (!usage.ok) return usage;
    return { ok: true, data: { schemaVersion: 1, recordType: 'decision', source: 'model-text', answers: answers.data.answers, confidenceSemantics: 'self-reported', usage: usage.data.value, actualCalls: 1 } };
}
function safeUsage(value) {
    const checked=cloneJsonValue(value);if(!checked.ok||checked.data.value!==null&&!plain(checked.data.value))return fail('INVALID_DECISION_OUTPUT','Usage must contain bounded token counters.');
    if(checked.data.value===null)return {ok:true,data:{value:null}};
    const fields=['inputTokens','outputTokens','totalTokens','promptTokens','completionTokens','input_tokens','output_tokens','total_tokens','prompt_tokens','completion_tokens','cached_tokens','reasoning_tokens'];
    const entries=Object.entries(checked.data.value).filter(([key])=>fields.includes(key));
    if(entries.some(([,item])=>!Number.isSafeInteger(item)||item<0))return fail('INVALID_DECISION_OUTPUT','Usage token counts must be nonnegative safe integers.');
    return {ok:true,data:{value:Object.fromEntries(entries)}};
}