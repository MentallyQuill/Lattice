import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './canvas-fixture.mjs';

test('camera motion with no profile badges does not measure the host or publish empty badge rows', async () => {
    const f=fixture();
    try {
        let reads=0,publications=0; const rect=f.host.getBoundingClientRect.bind(f.host),publish=f.canvas.layer.setNodeProfiles.bind(f.canvas.layer);
        f.host.getBoundingClientRect=()=>{reads++;return rect();};
        f.canvas.layer.setNodeProfiles=rows=>{publications++;return publish(rows);};
        for(let i=0;i<12;i++){f.canvas.view.x+=2;f.canvas.applyTransform();}
        assert.equal(publications,0,'empty profile metadata must not trigger camera-frame publications');
        assert.equal(reads,0,'a warmed camera path uses cached viewport and geometry');
    } finally {await f.canvas.destroy();f.host.remove();}
});

test('profile badges still track camera bounds and clear when the last profile is removed', async () => {
    const f=fixture();
    try {
        const row={id:'a',selection:{selectionKey:'a',address:{workflowId:f.graph.id,instancePath:[],nodeId:'a'}},value:'',label:'Profile',model:'',editable:false,options:[]};
        f.canvas.setNodeProfiles([row]);
        assert.equal(f.host.querySelectorAll('.pc-node-profile').length,1);
        let latest;const publish=f.canvas.layer.setNodeProfiles.bind(f.canvas.layer);f.canvas.layer.setNodeProfiles=rows=>{latest=rows;return publish(rows);};
        f.canvas.view.x=-50;f.canvas.applyTransform();
        assert.equal(latest[0].visibleBounds.x,50);
        f.canvas.setNodeProfiles([]);
        assert.deepEqual(latest,[]);assert.equal(f.host.querySelectorAll('.pc-node-profile').length,0);
    } finally {await f.canvas.destroy();f.host.remove();}
});
