import type { WorkbenchView } from './types';
import { diagnosticText } from '../src/ui/diagnostics.js';
export interface WorkspaceMenuPanels { previewOpen: boolean; shelfOpen: boolean }
export type WorkspaceMenuIconTone = 'blue' | 'yellow' | 'green' | 'purple' | 'teal' | 'red';
export interface WorkspaceMenuItem { label: string; command: string; icon?: string; iconTone?: WorkspaceMenuIconTone; shortcut?: string; title?: string; reason?: string; disabled?: boolean; kind?: 'check' | 'radio'; checked?: boolean; children?: WorkspaceMenuItem[]; tone?: 'danger' }
export interface WorkspaceMenu { name: string; groups: WorkspaceMenuItem[][] }
// Color follows the action: shared glyphs such as Add also serve neutral zoom controls.
const iconTones: Record<string, WorkspaceMenuIconTone> = {
 new: 'yellow', save: 'blue', 'save-as': 'blue', 'download-document': 'blue', export: 'blue', 'export-archived-workflows': 'blue',
 'delete-selection': 'red', 'reset-layout': 'green', theme: 'purple', 'add-node': 'blue', 'details-selection': 'blue',
 'add-system': 'purple', 'create-subgraph': 'purple', 'save-subgraph': 'blue', 'comment-selection': 'yellow', 'add-comment': 'yellow', 'manage-portals': 'purple',
 'validate-workflow': 'green', 'review-host-result': 'blue', 'stop-workflow': 'red', 'run-preview': 'green', configure: 'blue',
 'story-documents': 'teal', 'memory-recall-menu': 'purple', 'recall-queue-selected': 'green', 'recall-queue-all': 'green',
 'recall-cancel-selected': 'red', 'recall-cancel-all': 'red', 'memory-recall': 'purple', help: 'blue',
};
const row = (label: string, command: string, icon = '', disabled = false, shortcut = ''): WorkspaceMenuItem => ({ label, command, icon, iconTone: iconTones[command], disabled, shortcut });
const check = (label: string, command: string, checked: boolean, disabled = false, kind: 'check' | 'radio' = 'check'): WorkspaceMenuItem => ({ label, command, checked, disabled, kind });
export function workspaceMenus(view: WorkbenchView, panels: WorkspaceMenuPanels = {previewOpen:true,shelfOpen:true}): WorkspaceMenu[] {
 const c: Partial<NonNullable<WorkbenchView["menuCapabilities"]>> = view.menuCapabilities ?? {}; const root = view.rootWorkflow ?? view.workflow, preview = view.outputPreview;
 const readOnly = !!view.readOnly, busy = !!root?.ownedBusy;
 const document = view.document, selectedRecall = view.recall?.commands.selected, allRecall = view.recall?.commands.all;
 return [
 {name:'File',groups:[
  [row('New workflow','new','add',!!document?.busy,'Ctrl N'),row('Open workflow…','open-workflow','open',!!document?.busy,'Ctrl O'),{...row('Open Recent','recent-menu','open',!document?.native || !document.recents.length || document.busy),children:[...(document?.recents ?? []).map(file=>row(file.name,'open-recent:'+file.id,'open')),{...row('Clear Recent','clear-recent','clear'),title:'Files stay on disk; only this recent list is cleared.'}]},row('Open examples…','examples','library',!!document?.busy)],
  [{...row('Recover previous workflows','recovery-menu','library',!document?.recovery.length || document.busy),children:(document?.recovery ?? []).map(file=>({...row(file.name,'recover-workflow:'+file.id,'open'),reason:file.issue ? diagnosticText(file.issue) : undefined}))}],
  [...(document?.native ? [row('Save workflow','save','save',document.busy,'Ctrl S'),row('Save As…','save-as','save',document.busy,'Ctrl Shift S')] : [row('Save As…','download-document','save',!!document?.busy,'Ctrl S')]),row('Rename workflow…','rename','rename',!root)],
  [row('Import into graph…','import-into-graph','open',readOnly),row('Export workflow JSON…','export','export',!root),...(view.hasArchivedWorkflows ? [row('Export archived workflows','export-archived-workflows','export')] : [])],
  [row('Close workspace','close','close')]
 ]},
 {name:'Edit',groups:[
  [row('Undo','undo','undo',!view.history.undo,'Ctrl Z'),row('Redo','redo','redo',!view.history.redo,'Ctrl Shift Z')],
  [row('Cut','cut','cut',!view.selectionActions?.cut,'Ctrl X'),row('Copy','copy','copy',!view.selectionActions?.copy,'Ctrl C'),row('Paste','paste','paste',readOnly,'Ctrl V'),row('Duplicate selection','duplicate-selection','duplicate',!c.duplicate,'Ctrl D'),{...row('Delete selection','delete-selection','delete',!view.selectionActions?.delete,'Del'),tone:'danger'}],
  [row('Select all','select-all','select',false,'Ctrl A'),row('Clear selection','clear-selection','clear',!c.hasSelection)]
 ]},
 {name:'View',groups:[
  [check('Show Details','inspector',!!view.inspectorOpen),check('Show preview','toggle-preview',panels.previewOpen),check('Show node shelf','toggle-shelf',panels.shelfOpen)],
  [check('Follow selection','follow-preview',preview?.followSelection ?? true,!preview,'radio'),check('Pin current output','pin-preview',!!preview?.pinned,!preview?.selectedKey || preview?.status === 'removed','radio')],
  [row('Fit graph','fit','fit'),row('Fit selection','fit-selection','fit',!c.fitSelection,'F'),row('Center selection','center-selection','fit',!c.hasSelection),row('Zoom in','zoom-in','add',false,']'),row('Zoom out','zoom-out','minus',false,'[')],
  [row('Reset panel layout','reset-layout','reset'),row('Theme and colours…','theme','theme')]
 ]},
 {name:'Graph',groups:[
  [row('Add node…','add-node','add',readOnly),row('Details for selection','details-selection','details',!c.inspect),row('Rename selection…','rename-selection','rename',!c.rename,'F2')],
  [row('Group selection','group-selection','group',!c.group,'Ctrl G'),row('Ungroup selection','ungroup-selection','ungroup',!c.ungroup,'Ctrl Shift G'),row('Create subgraph','create-subgraph','subgraph',!c.createSubgraph),row('Save subgraph…','save-subgraph','save',!c.saveSubgraph)],
  [row('Comment selection','comment-selection','comment',!c.comment,'C'),row('Add comment','add-comment','comment',readOnly),row('Manage portals…','manage-portals','portals')],
  [check('Select tool','select-tool',view.camera?.mode !== 'pan',false,'radio'),check('Pan tool','pan-tool',view.camera?.mode === 'pan',false,'radio'),check('Compact cards','compact-selection',!!c.compactChecked,!c.compact)]
 ]},
 {name:'Workflow',groups:[
  [row('Add system…','add-system','subgraph',!c.addSystem || busy)],
  [check('Enable Lattice','enable-workflow',!!view.enabled,!root)],
  [row('Validate workflow','validate-workflow','check',!root),row('Review host result','review-host-result','details',root?.reviewTerminals ? !root.reviewTerminals.length : !root?.nodes?.some(node=>node.terminal)),row('Stop workflow','stop-workflow','stop',!c.stop)],
  [{...row('Run to current output','run-preview','run',!preview?.runHere?.enabled || !!preview?.busy || busy),reason:preview?.busy || busy ? 'Wait for the current run to finish.' : preview?.runHere?.reason ?? (!preview?.selectedKey ? 'Select a node output to preview first.' : undefined)},row('Run details…','run-details','details',!view.runDetails)],
  [{...row('Configure','configure','details'),children:[row('Workflow Data…','story-documents','library')]}],
  [{...row('Memory recall','memory-recall-menu','arm'),children:[{...row('Queue recall for selected nodes','recall-queue-selected','add',!selectedRecall?.queueNodeIds.length),reason:!selectedRecall?.queueNodeIds.length ? selectedRecall?.queueReason || 'Select an eligible Recall node first.' : undefined},{...row('Cancel recall for selected nodes','recall-cancel-selected','clear',!selectedRecall?.cancelNodeIds.length),reason:!selectedRecall?.cancelNodeIds.length ? selectedRecall?.cancelReason || 'Select a node with queued recall first.' : undefined},{...row('Queue recall for all eligible nodes','recall-queue-all','add',!allRecall?.queueNodeIds.length),reason:!allRecall?.queueNodeIds.length ? allRecall?.queueReason || 'No Recall nodes are eligible to queue.' : undefined},{...row('Cancel all queued recall','recall-cancel-all','clear',!allRecall?.cancelNodeIds.length),reason:!allRecall?.cancelNodeIds.length ? allRecall?.cancelReason || 'No recall is queued to cancel.' : undefined},row('Memory recall overview…','memory-recall','details')]}]
 ]},
 {name:'Help',groups:[[row('Workspace guide','help','help'),row('Node reference','node-reference','library'),row('Keyboard shortcuts','shortcuts','keyboard')],[row('About Lattice','about','info')]]}
 ];
}
export const localMenuCommands = new Set(['toggle-preview','toggle-shelf','reset-layout','follow-preview','pin-preview','run-preview','run-details','validate-workflow','help','node-reference','shortcuts','about','examples','add-node','story-documents','memory-recall']);
