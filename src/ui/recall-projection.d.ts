import type {NativeGraph3} from '../workflow/types';
import type {NativeRecallStatus} from '../workflow/native-recall';
import type {prepareWorkflowPlanner} from '../workflow/resolve.js';
import type {RecallProjection} from '../../ui/recall-types';
type RecallInventory=Extract<ReturnType<typeof prepareWorkflowPlanner>,{data:object}>['data']['inventory'];
export function projectRecallView(input:{rootGraph:NativeGraph3|null;inventory?:RecallInventory;status:NativeRecallStatus|null;enabled:boolean;issue?:string;nodeIds:readonly string[];viewKind:'root'|'instance'|'library';instancePath?:readonly string[]}):RecallProjection;
