import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,mouse} from './canvas-fixture.mjs';

test('single-card drag frames do not revisit unrelated cached card bounds or measure DOM',async()=>{
    const f=fixture();
    try {
        f.graph.nodes.c={...f.a,id:'c',x:5000,y:5000};f.graph.nativeCards.c={...f.graph.nativeCards.a};f.canvas.render();
        f.canvas.geometry.measure('c',160,48,[]);f.canvas.render();
        const heading=f.host.querySelector('[data-id="a"] .pc-native-heading');mouse(heading,'mousedown',80,80);mouse(window,'mousemove',120,100);f.canvas.frames.flush();
        let unrelatedReads=0,measurements=0;const x=f.graph.nodes.c.x,measure=f.canvas.geometry.measure.bind(f.canvas.geometry);
        Object.defineProperty(f.graph.nodes.c,'x',{configurable:true,get(){unrelatedReads++;return x;}});
        f.canvas.geometry.measure=(...args)=>{measurements++;return measure(...args);};
        for(let i=0;i<20;i++){mouse(window,'mousemove',125+i,105+i);f.canvas.frames.flush();}
        assert.equal(unrelatedReads,0,'steady drag must not scan unrelated card positions');assert.equal(measurements,0,'steady drag uses retained geometry');
        Object.defineProperty(f.graph.nodes.c,'x',{configurable:true,writable:true,value:x});mouse(window,'mouseup',145,125);
    } finally {await f.canvas.destroy();f.host.remove();}
});
