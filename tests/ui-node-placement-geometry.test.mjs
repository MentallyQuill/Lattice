import assert from 'node:assert/strict';
import {test} from 'node:test';
const api=await import('../src/ui/node-placement-geometry.js').catch(()=>({}));

test('automatic placement clears occupied upper and lower decorations',()=>{
 assert.equal(typeof api.findVacantNodePoint,'function');
 const footprint={x:0,y:-64,w:260,h:252},occupied=[{x:0,y:240,w:260,h:200}];
 const point=api.findVacantNodePoint({preferred:{x:0,y:120},footprint,occupied});
 assert.notDeepEqual(point,{x:0,y:120});
 const rect={x:point.x+footprint.x,y:point.y+footprint.y,w:footprint.w,h:footprint.h};
 assert.ok(rect.x+rect.w+24<=occupied[0].x||rect.x>=occupied[0].x+occupied[0].w+24||rect.y+rect.h+24<=occupied[0].y||rect.y>=occupied[0].y+occupied[0].h+24);
});

test('placement footprint normalizes screen measurements at fractional zoom and reserves new metadata',()=>{
 const footprint=api.nodePlacementFootprint({width:130,height:70,visualBounds:{x:0,y:0,w:130,h:70}},.5);
 assert.deepEqual(footprint,{x:0,y:-78,w:260,h:266});
});

test('quarter-zoom metadata clears the node above before the live row is published',()=>{
 const footprint=api.nodePlacementFootprint({width:65,height:35},.25);
 assert.equal(footprint.y,-108);
 const point=api.findVacantNodePoint({preferred:{x:0,y:188},footprint,occupied:[{x:0,y:0,w:260,h:100}]});
 assert.notDeepEqual(point,{x:0,y:188});
});
