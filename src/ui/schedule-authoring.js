import { cloneJsonValue } from '../workflow/operations/json-data.js?v=0.27.1';
import { validateStorySchedules } from '../workflow/story-time.js?v=0.27.1';
import { describeTimeNode } from '../workflow/operations/time-nodes.js?v=0.27.1';
const fail=(code,message)=>({ok:false,error:{code,message}});
const integer=value=>Number.isSafeInteger(value) && value>=0;
export function durationToMinutes(quantity, unit, dayLengthMinutes) {
    if(!Number.isFinite(quantity) || quantity<0) return fail('INVALID_DURATION','Use a nonnegative finite duration.');
    if(!['minutes','hours','days'].includes(unit)) return fail('INVALID_DURATION','Choose minutes, hours or days.');
    if(unit==='days' && (!integer(dayLengthMinutes) || dayLengthMinutes<1)) return fail('DAY_LENGTH_REQUIRED','Select an authored calendar day length in minutes before using days.');
    const minutes=quantity*(unit==='minutes'?1:unit==='hours'?60:dayLengthMinutes);
    return integer(minutes) ? {ok:true,data:{minutes}} : fail('TIME_RANGE','Duration must convert to safe integer minutes.');
}
/** Clock matching and daily day bounds remain runtime checks against the explicit input clock. */
export function compileScheduleRows(rows) {
    const result=validateStorySchedules(rows);
    return result.ok ? {ok:true,data:{value:result.data}} : result;
}
/** Reuse Time Trigger admission; the local ID only satisfies its unrelated identity requirement. */
export function validateScheduleMetadata(value) {
    const checked=cloneJsonValue(value);if(!checked.ok)return checked;
    const result=describeTimeNode({operation:'time-trigger',scheduleId:'metadata-validation',metadata:checked.data.value});
    return result.ok ? {ok:true,data:{value:checked.data.value}} : result;
}
