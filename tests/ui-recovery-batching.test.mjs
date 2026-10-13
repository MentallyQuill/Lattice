import test from 'node:test';
import assert from 'node:assert/strict';
import { installMock } from './mock.js';
import * as S from '../src/state.js?v=0.27.2';
import { starterGraph } from '../src/workflow/starters.js?v=0.27.2';
import { prepareGraphCandidate } from '../src/workflow/composition.js?v=0.27.2';
import { captureGraphEditContext } from '../src/workflow/transactions.js?v=0.27.2';
import { createViewState } from '../src/ui/view-state.js?v=0.27.2';

test('accepted edit and reconciled presentation produce one immediate recovery envelope', () => {
    const host=installMock(); let writes=0, saves=0; host.saveSettingsDebounced=()=>saves++;
    const owner=S.settings(), root=starterGraph('unified-basic');
    S.activateWorkflow(root); saves=0; let recovery=owner.recoveryDraft;
    Object.defineProperty(owner,'recoveryDraft',{configurable:true,enumerable:true,get:()=>recovery,set:value=>{writes++;recovery=value;}});
    const candidate=structuredClone(root); candidate.name='Recovered edit';
    const prepared=prepareGraphCandidate(root,candidate);
    const command={...prepared.data,context:captureGraphEditContext(root,()=>({sessionId:'recovery',viewPath:[],readOnly:false})).data};
    const views=createViewState({workflowId:root.id}).serialize().data;
    const result=S.commitGraphEdit(root,command,{reconcileViews(){S.setActiveWorkspaceViews(views);}});
    assert.equal(result.ok,true,JSON.stringify(result)); assert.equal(writes,1); assert.equal(saves,1);
    assert.equal(recovery.graph.name,'Recovered edit'); assert.deepEqual(recovery.workspaceViews,views);
    S.save({recovery:false}); assert.equal(writes,1); assert.equal(saves,2,'Preferences/save timer does not encode an already published recovery');
    root.name='Raw external mutation'; S.save(); assert.equal(recovery.graph.name,'Raw external mutation');
});
test('recovery encoding failure is returned and does not overwrite the previous good envelope',()=>{
    installMock();const owner=S.settings(),root=starterGraph('unified-basic');S.activateWorkflow(root);
    const previous=owner.recoveryDraft;root.nodes.bad={id:'bad',type:'invalid'};
    const result=S.save();assert.equal(result?.ok,false);assert.equal(owner.recoveryDraft,previous);
    delete root.nodes.bad; assert.equal(S.save().ok, true, 'Repair and retry the retained invalid current snapshot');
});

test('batched host save failure reports recovery failure and can be retried', () => {
    const host = installMock(); let fail = true, saves = 0;
    host.saveSettingsDebounced = () => { if (fail) throw new Error('host unavailable'); saves++; };
    const owner = S.settings(), root = starterGraph('unified-basic'); S.activateWorkflow(root);
    const candidate = structuredClone(root); candidate.name = 'Batched retained edit';
    const prepared = prepareGraphCandidate(root, candidate);
    const command = { ...prepared.data, context: captureGraphEditContext(root, () => ({ sessionId: 'recovery', viewPath: [], readOnly: false })).data };
    const errors = [];
    const result = S.commitGraphEdit(root, command, { onRecoveryIssue: error => errors.push(error) });
    assert.equal(result.ok, true); assert.equal(result.recovery?.ok, false);
    assert.equal(result.recovery.error.code, 'HOST_SAVE'); assert.equal(errors.at(-1).code, 'HOST_SAVE');
    assert.equal(owner.recoveryDraft.graph.name, 'Batched retained edit');
    fail = false; assert.equal(S.retryPendingRecovery().ok, true); assert.equal(saves, 1);
});

test('accepted Undo returns its independent host recovery failure', () => {
    const host = installMock(); let fail = false;
    host.saveSettingsDebounced = () => { if (fail) throw new Error('host unavailable'); };
    const root = starterGraph('unified-basic'); S.activateWorkflow(root);
    const candidate = structuredClone(root); candidate.name = 'Undo retained edit';
    const prepared = prepareGraphCandidate(root, candidate);
    const command = { ...prepared.data, context: captureGraphEditContext(root, () => ({ sessionId: 'recovery', viewPath: [], readOnly: false })).data };
    assert.equal(S.commitGraphEdit(root, command).ok, true); fail = true;
    const result = S.stepGraphHistory(root, 'undo');
    assert.equal(result.ok, true); assert.equal(result.data.changed, true);
    assert.equal(result.recovery?.ok, false); assert.equal(result.recovery.error.code, 'HOST_SAVE');
    fail = false; assert.equal(S.retryPendingRecovery().ok, true);
});
