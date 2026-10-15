import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,mouse} from './canvas-fixture.mjs';

test('one all-node stack orders model over actionable readiness without moving pins',async()=>{
    const calls=[],env=fixture({onReadinessDetails:(...args)=>calls.push(args)});
    try {
        const before=env.canvas.endpoint('b','in','in');
        const selection={selectionKey:'b',revision:'1',address:{workflowId:env.graph.id,instancePath:[],nodeId:'b'}};
        const issue={code:'ACTOR_REQUIRED',message:'Choose an actor',field:'actorId',address:selection.address,category:'setup'};
        env.canvas.setNodeProfiles([{id:'b',selection,value:'',label:'Connection',model:'long-model',options:[],editable:true,readiness:{state:'setup',label:'Setup Required',issues:[issue],deferred:[],description:issue.message}}]);
        const stack=env.host.querySelector('.pc-node-decoration-stack');
        assert.ok(stack);
        assert.ok(stack.children[0].classList.contains('node-model-meta'));
        const badge=stack.querySelector('.pc-node-readiness');
        assert.equal(badge.getAttribute('aria-label'),'Setup Required: Choose an actor');
        mouse(badge,'mousedown',360,30); badge.click();
        assert.equal(env.canvas.hasContentGesture(),false);
        assert.deepEqual(calls,[[selection,issue]]);
        assert.deepEqual(env.canvas.endpoint('b','in','in'),before);
    } finally {await env.canvas.destroy();}
});

test('visual framing includes measured upper stack and lower controls while card anchors stay fixed',async()=>{
    const env=fixture();
    try {
        const pin=env.canvas.endpoint('b','in','in');
        env.canvas.setNodeProfiles([{id:'b',selection:{selectionKey:'b',revision:'1',address:{workflowId:env.graph.id,instancePath:[],nodeId:'b'}},model:'model',label:'Connection',value:'',editable:true,options:[]}]);
        const root=env.host.querySelector('.pc-node-profile[data-id="b"]');
        root.getBoundingClientRect=()=>({left:350,top:50,width:160,height:0});
        root.querySelector('.pc-node-decoration-stack').getBoundingClientRect=()=>({left:350,top:7,right:510,bottom:38,width:160,height:31});
        root.querySelector('.profile-bar').getBoundingClientRect=()=>({left:350,top:105,right:510,bottom:140,width:160,height:35});
        env.canvas.setNodeProfiles(env.canvas.nodeProfiles);
        assert.deepEqual(env.canvas.visualBoundsOf(env.b),{x:350,y:7,w:160,h:133});
        assert.deepEqual(env.canvas.endpoint('b','in','in'),pin);
        env.graph.groups.g={id:'g',collapsed:false};env.b.inGroup='g';env.canvas.render();
        const frame=env.host.querySelector('.pc-group-frame');
        assert.equal(frame.style.top,'-41px');
        assert.equal(frame.style.height,'205px');
    }finally{await env.canvas.destroy();}
});

test('clearing the last decoration releases its measured framing bounds',async()=>{
    const env=fixture();
    try{
        env.canvas.decorationExtents.set('b',{left:0,top:-60,right:160,bottom:120});
        env.canvas.setNodeProfiles([]);
        assert.deepEqual(env.canvas.visualBoundsOf(env.b),{x:350,y:50,w:160,h:48});
    }finally{await env.canvas.destroy();}
});
