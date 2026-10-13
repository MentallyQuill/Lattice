import { cloneJsonValue } from '../workflow/operations/json-data.js?v=0.27.3';
import { validateDecisionQuestions } from '../workflow/decision.js?v=0.27.3';
const fail = message => ({ok:false,error:{code:'INVALID_QUESTIONS',message}});
/** Rows are complete snapshots; currentValue is contextual only. Absence never inherits a previous criterion. */
export function compileQuestionRows(rows, currentValue) {
    const checked=cloneJsonValue(rows);
    if(!checked.ok || !Array.isArray(checked.data.value)) return fail('Question cards require bounded own JSON rows.');
    const questions={};
    for(const row of checked.data.value) {
        if(!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).some(key=>!['id','type','instructions','criteria'].includes(key)) || typeof row.id!=='string' || Object.hasOwn(questions,row.id)) return fail('Use unique stable question IDs and supported question fields.');
        const {id,...question}=row;
        if(question.type==='yes/no') question.type='noul';
        Object.defineProperty(questions,id,{value:question,enumerable:true,configurable:true,writable:true});
    }
    const valid=validateDecisionQuestions(questions);
    return valid.ok ? {ok:true,data:{value:valid.data.questions}} : valid;
}
