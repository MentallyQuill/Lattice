import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as H from '../src/history.js?v=0.27.1';
import {createWorkflowDocumentSession} from '../src/ui/document-session.js';

const graph = () => ({id:'same-id',name:'Draft',schema:3,runtime:2,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'text',text:'before'}},wires:{}});

test('history stamp advances across commit, undo, redo and resets without tracking reads', () => {
    const root=graph();
    const initial=H.graphHistoryStamp(root);
    assert.equal(initial.revision,0);
    assert.equal(H.peek(root).undo,null);
    H.track(root);
    const next=structuredClone(root);next.nodes.text.text='after';
    assert.equal(H.commitGraphDocument(root,next),true);
    const changed=H.graphHistoryStamp(root);assert.equal(changed.revision,initial.revision+1);
    H.undo(root);assert.equal(root.nodes.text.text,'before');
    const undone=H.graphHistoryStamp(root);assert.equal(undone.revision,changed.revision+1);
    H.redo(root);assert.equal(H.graphHistoryStamp(root).revision,undone.revision+1);
    const beforeNoop=H.graphHistoryStamp(root);
    assert.equal(H.commitGraphDocument(root,structuredClone(root)),false);
    assert.deepEqual(H.graphHistoryStamp(root),beforeNoop);
    H.reset(root);assert.notEqual(H.graphHistoryStamp(root).generation,beforeNoop.generation);
    H.dispose(root);
});

test('Details draft namespace distinguishes replacements and restores retained document identity', () => {
    const session=createWorkflowDocumentSession(), first=graph(), replacement=graph();
    assert.equal(session.draftNamespace(),null);
    session.activate(first);const namespace=session.draftNamespace(), activation=session.capture();
    assert.equal(typeof namespace,'string');assert.ok(namespace);
    session.activate(replacement);assert.notEqual(session.draftNamespace(),namespace);
    session.activate(first);assert.equal(session.draftNamespace(),namespace);
    assert.notEqual(session.capture(),activation,'write authority expires independently from restored draft identity');
});
