import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './canvas-fixture.mjs';

function countWork(canvas) {
    const counts = { renders: 0, wires: 0, geometry: 0, preview: 0 };
    for (const [owner, key, count] of [[canvas,'render','renders'],[canvas.layer,'setWires','wires'],[canvas.geometry,'measure','geometry']]) {
        const original = owner[key].bind(owner); owner[key] = (...args) => { counts[count]++; return original(...args); };
    }
    const publish = canvas.layer.applyScene; canvas.layer.applyScene = scene => { if (scene.wires) counts.wires++; return publish(scene); };
    if (canvas.layer.setWirePreview) { const original = canvas.layer.setWirePreview; canvas.layer.setWirePreview = value => { counts.preview++; return original(value); }; }
    return counts;
}
const preview = (x = 500) => ({gesture:{kind:'drag',origin:{nodeId:'a',dir:'out',portId:'out'},ghost:{x,y:180}}});

test('trace and free ghost motion preserve cards, selection and settled routes without layout work', async () => {
    const { canvas, host } = fixture(); const card = host.querySelector('[data-id="a"].pc-node'), path = host.querySelector('.pc-wire-native');
    canvas.select({kind:'node',id:'a'}); card.focus(); const counts = countWork(canvas);
    canvas.setTrace([{id:'a',status:'running'}]);
    canvas.updateNativeWire(preview()); canvas.frames.flush();
    canvas.updateNativeWire(preview(540)); canvas.frames.flush();
    assert.deepEqual({renders:counts.renders,wires:counts.wires,geometry:counts.geometry},{renders:0,wires:0,geometry:0});
    assert.equal(counts.preview,2); assert.equal(host.querySelector('[data-id="a"].pc-node'),card); assert.equal(host.querySelector('.pc-wire-native'),path);
    assert.equal(document.activeElement,card); assert.ok(card.classList.contains('pc-selected')); assert.ok(card.classList.contains('pc-trace-running'));
    canvas.setTrace([]); assert.ok(!card.classList.contains('pc-trace-running')); assert.ok(card.classList.contains('pc-selected'));
    await canvas.destroy();
});

test('same-view content changes measure one card and retain unchanged card and wire DTOs', async () => {
    const {canvas,graph} = fixture(); let published;
    const original = canvas.layer.applyScene; canvas.layer.applyScene = scene => { if (scene.nodes) published = scene.nodes; return original(scene); };
    canvas.render(); const before = published; const wire = canvas.wireViews.get('edge'); const counts = countWork(canvas);
    graph.nativeCards.a.ports[0].label = 'A changed wrapped label'; canvas.render();
    assert.equal(counts.geometry,1); assert.equal(published[1],before[1]); assert.equal(canvas.wireViews.get('edge'),wire);
    await canvas.destroy();
});

test('qualified fold geometry survives same-view graph replacement and remeasures on remount', async () => {
    const {canvas,graph,host} = fixture(); canvas.geometry.measure('a',310,140,[{id:'out',direction:'out',x:310,y:70,side:'right',kind:'context'}]);
    graph.groups.fold={id:'fold',title:'Fold',collapsed:true}; graph.nodes.a.inGroup='fold'; canvas.render();
    const replacement=structuredClone(graph); canvas.setGraph(replacement);
    assert.equal(canvas.geometry.width('a'),310); assert.equal(canvas.geometry.get('a'),140);
    replacement.groups.fold.collapsed=false; const counts=countWork(canvas); canvas.render(); assert.equal(counts.geometry,1);
    assert.ok(host.querySelector('.pc-node[data-id="a"]')); await canvas.destroy();
});

test('active preview follows moved origin and geometry invalidation with unchanged pointer', async () => {
    const {canvas,host}=fixture(); canvas.updateNativeWire(preview()); canvas.frames.flush(); const before=host.querySelector('.pc-wire-ghost').getAttribute('d');
    canvas.setPositions([{id:'a',x:100,y:70}]); const moved=host.querySelector('.pc-wire-ghost').getAttribute('d'); assert.notEqual(moved,before);
    canvas.geometry.measure('a',200,70,[{id:'out',direction:'out',x:200,y:35,side:'right',kind:'context'}]);
    canvas.setPositions([{id:'a',x:100,y:70}]); assert.notEqual(host.querySelector('.pc-wire-ghost').getAttribute('d'),moved); await canvas.destroy();
});

test('observer subscriptions persist, unchanged notices skip pin reads and removed notices are ignored', async () => {
    const previous=globalThis.ResizeObserver; let observer;
    globalThis.ResizeObserver=class { constructor(callback){this.callback=callback;this.observed=[];this.removed=[];this.disconnections=0;observer=this;} observe(el){this.observed.push(el);} unobserve(el){this.removed.push(el);} disconnect(){this.disconnections++;} };
    try {
        const {canvas,graph,host}=fixture(); const a=host.querySelector('.pc-node[data-id="a"]'); const count=observer.observed.length; const counts=countWork(canvas);
        canvas.render(); assert.equal(observer.observed.length,count); assert.equal(observer.disconnections,0); assert.equal(counts.geometry,0);
        observer.callback([{target:a,contentRect:{width:0,height:0}}]); assert.equal(counts.geometry,0);
        delete graph.nodes.a; delete graph.nativeCards.a; delete graph.wires.edge; canvas.render(); assert.ok(observer.removed.includes(a));
        const measured=counts.geometry; observer.callback([{target:a,contentRect:{width:99,height:99}}]); assert.equal(counts.geometry,measured);
        await canvas.destroy();
    } finally {globalThis.ResizeObserver=previous;}
});

test('structural scene publishes in at most two batched DOM stages', async () => {
    const {canvas,graph}=fixture(); let batches=0,unbatched=0; const apply=canvas.layer.applyScene;
    canvas.layer.applyScene=scene=>{batches++;return apply(scene);};
    for(const key of ['setNodes','setComments','setGroups','setWires','setNodeProfiles']) { const original=canvas.layer[key]; canvas.layer[key]=(...args)=>{unbatched++;return original(...args);}; }
    canvas.setGraph(structuredClone(graph),{viewKey:'same-activation:root'});
    assert.equal(unbatched,0); assert.ok(batches<=2); await canvas.destroy();
});

test('theme layout invalidation measures same-size cards and pointer layouts requalify hidden members', async () => {
    const {canvas,graph}=fixture(); const counts=countWork(canvas);
    document.documentElement.style.setProperty('--pc-font','Changed font'); await Promise.resolve();
    assert.equal(counts.geometry,2);
    graph.groups.fold={id:'fold',collapsed:true}; graph.nodes.a.inGroup='fold'; canvas.render();
    const before=counts.geometry; canvas.invalidateGeometry(['a'],'pointer-layout'); assert.equal(counts.geometry,before);
    graph.groups.fold.collapsed=false; canvas.render(); assert.equal(counts.geometry,before+1); await canvas.destroy();
    document.documentElement.style.removeProperty('--pc-font');
});


test('content and coordinate updates retain an existing trace class and selected focus', async () => {
    const {canvas,graph,host}=fixture(); canvas.setTrace([{id:'a',status:'running'}]); canvas.select({kind:'node',id:'a'});
    const card=host.querySelector('.pc-node[data-id="a"]'); card.focus(); graph.nodes.a.presentation={alias:'Changed title'}; canvas.render();
    assert.ok(card.classList.contains('pc-trace-running')); assert.ok(card.classList.contains('pc-selected')); assert.equal(document.activeElement,card);
    canvas.setPositions([{id:'a',x:75,y:75}]); assert.ok(card.classList.contains('pc-trace-running')); await canvas.destroy();
});

test('group-only coordinate publications carry authored anchors and expanded frame bounds', async () => {
    const {canvas,graph,host}=fixture(); graph.groups.empty={id:'empty',title:'Empty',frame:{x:0,y:0,w:300,h:200}}; canvas.render();
    const card=host.querySelector('[data-group="empty"]'); canvas.setPositions([],[{id:'empty',x:80,y:90,frame:{x:60,y:70,w:330,h:230}}]);
    assert.deepEqual(graph.groups.empty.frame,{x:60,y:70,w:330,h:230}); assert.equal(card.style.left,'60px'); assert.equal(card.style.top,'70px');
    await canvas.destroy();
});

test('observer entries from a replaced qualified view cannot measure a reused keyed element', async () => {
    const previous=globalThis.ResizeObserver; const observers=[];
    globalThis.ResizeObserver=class {constructor(callback){this.callback=callback;observers.push(this);} observe(){} unobserve(){} disconnect(){}};
    try {
        const {canvas,graph,host}=fixture(); const old=observers.at(-1), card=host.querySelector('.pc-node[data-id="a"]');
        canvas.setGraph(structuredClone(graph),{viewKey:'replacement-activation:root'}); const counts=countWork(canvas);
        old.callback([{target:card,contentRect:{width:400,height:500}}]); assert.equal(counts.geometry,0); await canvas.destroy();
    } finally {globalThis.ResizeObserver=previous;}
});

test('same-root activation cancels drag coordinates before projecting its admitted scene', async () => {
    const {canvas,graph,host}=fixture(); const {mouse}=await import('./canvas-fixture.mjs');
    const card=host.querySelector('.pc-node[data-id="a"]'); mouse(card,'mousedown',80,80); mouse(window,'mousemove',130,120);
    canvas.setGraph(graph); assert.equal(graph.nodes.a.x,50); assert.equal(card.style.left,'50px'); assert.equal(card.style.top,'50px'); await canvas.destroy();
});

test('live dragging of an empty collapsed group publishes its card each frame',async()=>{
 const {canvas,graph,host}=fixture(),{mouse}=await import('./canvas-fixture.mjs');graph.groups.empty={id:'empty',title:'Empty',collapsed:true,x:100,y:120,w:180};canvas.render();const card=host.querySelector('[data-group="empty"]');mouse(card,'mousedown',115,135);mouse(window,'mousemove',215,235);canvas.frames.flush();assert.equal(graph.groups.empty.x,200);assert.equal(card.style.left,'200px');assert.equal(card.style.top,'220px');await canvas.destroy();
});

test('raw same-ID refresh preserves LOD hysteresis while invalidating a changed geometry qualifier', async () => {
    const {canvas,graph,host}=fixture(); canvas.setGraph(structuredClone(graph),{viewKey:'activation:root'});
    canvas.view.zoom=.25; canvas.applyTransform(); canvas.view.zoom=.55; canvas.applyTransform(); const epoch=canvas.geometryEpoch;
    canvas.setGraph(structuredClone(canvas.graph)); assert.equal(host.dataset.pcDetail,'overview'); assert.ok(canvas.geometryEpoch>epoch); await canvas.destroy();
});

test('new activation keeps LOD with a stable explicit document-view key and clears geometry', async () => {
    const {canvas,graph,host}=fixture(); canvas.setGraph(structuredClone(graph),{viewKey:'activation1:root',lodKey:'document1:root'});
    canvas.view.zoom=.25; canvas.applyTransform(); canvas.view.zoom=.55; canvas.applyTransform(); const epoch=canvas.geometryEpoch;
    canvas.setGraph(structuredClone(canvas.graph),{viewKey:'activation2:root',lodKey:'document1:root'});
    assert.equal(host.dataset.pcDetail,'overview'); assert.ok(canvas.geometryEpoch>epoch); await canvas.destroy();
});

for(const nextKey of ['document2:root','document1:child']) test('same-ID LOD resets for distinct document/view '+nextKey, async () => {
    const {canvas,graph,host}=fixture(); canvas.setGraph(structuredClone(graph),{viewKey:'geometry:root',lodKey:'document1:root'});
    canvas.view.zoom=.25; canvas.applyTransform(); canvas.view.zoom=.55; canvas.applyTransform(); const epoch=canvas.geometryEpoch;
    canvas.setGraph(structuredClone(canvas.graph),{viewKey:'geometry:root',lodKey:nextKey});
    assert.equal(host.dataset.pcDetail,'full'); assert.equal(canvas.geometryEpoch,epoch); await canvas.destroy();
});

test('controller LOD hook changes document lifetime independently of the geometry key', async () => {
    let lodKey='document1:root'; const {canvas,graph,host}=fixture({lodKey:()=>lodKey});
    canvas.setGraph(structuredClone(graph),{viewKey:'activation:root'}); canvas.view.zoom=.25; canvas.applyTransform(); canvas.view.zoom=.55; canvas.applyTransform();
    lodKey='document2:root'; canvas.setGraph(structuredClone(canvas.graph),{viewKey:'activation:root'}); assert.equal(host.dataset.pcDetail,'full'); await canvas.destroy();
});

test('standalone viewKey hook changes reset LOD on a same-ID raw activation', async () => {
    let key='view1'; const {canvas,host}=fixture({viewKey:()=>key});
    canvas.view.zoom=.25; canvas.applyTransform(); canvas.view.zoom=.55; canvas.applyTransform(); const epoch=canvas.geometryEpoch;
    key='view2'; canvas.setGraph(structuredClone(canvas.graph)); assert.equal(host.dataset.pcDetail,'full'); assert.ok(canvas.geometryEpoch>epoch); await canvas.destroy();
});

test('native instance-path changes reset LOD on a same-ID raw activation', async () => {
    let path=[]; const {canvas,host}=fixture({nativeScope:()=>({workflowId:'same-root',instancePath:path})});
    canvas.view.zoom=.25; canvas.applyTransform(); canvas.view.zoom=.55; canvas.applyTransform(); const epoch=canvas.geometryEpoch;
    path=['child']; canvas.setGraph(structuredClone(canvas.graph)); assert.equal(host.dataset.pcDetail,'full'); assert.ok(canvas.geometryEpoch>epoch); await canvas.destroy();
});

test('same-graph drag replacement skips the outgoing full render and restores coordinates', async () => {
    const {canvas,graph,host}=fixture(); const {mouse}=await import('./canvas-fixture.mjs');
    mouse(host.querySelector('.pc-node[data-id="a"]'),'mousedown',80,80); mouse(window,'mousemove',130,120);
    const counts=countWork(canvas); canvas.setGraph(graph);
    assert.equal(counts.renders,0); assert.equal(counts.wires,1); assert.equal(graph.nodes.a.x,50); assert.equal(host.querySelector('.pc-node[data-id="a"]').style.left,'50px'); await canvas.destroy();
});

test('active native wire replacement cancels and releases capture without outgoing scene rendering', async () => {
    const {createNativeWireBridge}=await import('../src/ui/native-wire-bridge.js?v=0.27.3');
    const {prepareNativeSearchCatalog}=await import('../src/ui/native-search-catalog.js?v=0.27.3');
    let bridge; const {canvas,graph,host}=fixture({nativeBridge:()=>bridge,nativeScope:()=>({workflowId:'wire-cancel-root',instancePath:[]})});
    bridge=createNativeWireBridge({adapter:{capture:()=>({ok:true,data:{}}),isCurrent:()=>true},catalog:prepareNativeSearchCatalog({schema:3,runtime:2,mode:'native-unified',workflowId:'wire-cancel-root',viewPath:[],inDefinition:false}).data,onUpdate:(view,requests)=>canvas.updateNativeWire(view,requests)});
    const pin=host.querySelector('.pc-port[data-node="a"][data-dir="out"]');
    const event=new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:210,clientY:74,button:0});Object.defineProperty(event,'pointerId',{value:7});pin.dispatchEvent(event);canvas.frames.flush();
    assert.equal(bridge.hasContentGesture(),true); assert.equal(canvas.nativeCaptures.size,1); assert.ok(host.querySelector('.pc-wire-ghost'));
    const counts=countWork(canvas);canvas.setGraph(graph);assert.equal(counts.renders,0);assert.equal(counts.wires,1);assert.equal(bridge.hasContentGesture(),false);assert.equal(canvas.nativeCaptures.size,0);assert.equal(host.querySelector('.pc-wire-ghost'),null);assert.ok(!pin.classList.contains('pc-pin-highlight'));await canvas.destroy();
});

test('default drag cancellation retains full rollback rendering and selection callbacks', async () => {
    let selections=0,multis=0,blocks=0;const {canvas,graph,host}=fixture({onSelect:()=>selections++,onMulti:()=>multis++,onDragBlock:()=>blocks++});const {mouse}=await import('./canvas-fixture.mjs');
    canvas.select({kind:'node',id:'b'});mouse(host.querySelector('.pc-node[data-id="a"]'),'mousedown',80,80);mouse(window,'mousemove',130,120);
    const before=[selections,multis,blocks],counts=countWork(canvas);assert.equal(canvas.cancelGesture(),true);
    assert.equal(counts.renders,1);assert.equal(graph.nodes.a.x,50);assert.equal(host.querySelector('.pc-node[data-id="a"]').style.left,'50px');assert.equal(canvas.selection.id,'b');assert.ok(selections>before[0]);assert.ok(multis>before[1]);assert.ok(blocks>before[2]);await canvas.destroy();
});

test('rejected incoming graph admission leaves the active drag and overlay untouched', async () => {
    const {canvas,graph,host}=fixture();const {mouse}=await import('./canvas-fixture.mjs');mouse(host.querySelector('.pc-node[data-id="a"]'),'mousedown',80,80);mouse(window,'mousemove',130,120);const drag=canvas.drag,counts=countWork(canvas);
    const invalid=structuredClone(graph);invalid.schema=99;assert.throws(()=>canvas.setGraph(invalid),/prepared current workflow graph/);
    assert.equal(canvas.drag,drag);assert.equal(graph.nodes.a.x,100);assert.equal(host.querySelector('.pc-node[data-id="a"]').style.left,'50px');assert.equal(counts.renders,0);canvas.frames.flush();assert.equal(host.querySelector('.pc-node[data-id="a"]').style.left,'100px');await canvas.destroy();
});

test('explicit replacement cancellation rolls back pan and selection without scene publication', async () => {
    let selections=0,multis=0,commits=0;const {canvas,graph,host}=fixture({onSelect:()=>selections++,onMulti:()=>multis++,onViewCommit:()=>commits++});const {mouse}=await import('./canvas-fixture.mjs');
    canvas.select({kind:'node',id:'b'});const beforeView={...graph.view};mouse(host,'mousedown',20,20,{button:1});mouse(window,'mousemove',80,90,{button:1});
    const counts=countWork(canvas),before=[selections,multis,commits];assert.equal(canvas.cancelGesture('view-change',{render:false}),true);
    assert.equal(counts.renders,0);assert.equal(counts.wires,0);assert.deepEqual(graph.view,beforeView);assert.equal(canvas.selection.id,'b');assert.ok(selections>before[0]);assert.ok(multis>before[1]);assert.ok(commits>before[2]);assert.equal(canvas.pan,null);await canvas.destroy();
});

test('steady drag frames skip unchanged focus and selection DOM scans while retaining highlights', async () => {
    const {canvas,host}=fixture(),{mouse}=await import('./canvas-fixture.mjs');
    const card=host.querySelector('.pc-node[data-id="a"]'),pin=card.querySelector('.pc-port'),path=host.querySelector('.pc-wire-native');
    mouse(card,'mousedown',80,80);pin.dispatchEvent(new window.MouseEvent('mouseenter'));mouse(window,'mousemove',100,100);canvas.frames.flush();
    const scans=[];for(const layer of [canvas.nodeLayer,canvas.commentLayer,canvas.svg]) {const query=layer.querySelectorAll.bind(layer);layer.querySelectorAll=selector=>{scans.push(selector);return query(selector);};}
    const before=path.getAttribute('d'),stringify=JSON.stringify;let serializations=0;
    try {JSON.stringify=(...args)=>{serializations++;return stringify(...args);};for(let i=0;i<12;i++){mouse(window,'mousemove',110+i*4,110+i*3);canvas.frames.flush();}} finally {JSON.stringify=stringify;}
    assert.equal(serializations,0);assert.deepEqual(scans,[]);assert.notEqual(path.getAttribute('d'),before);assert.ok(card.classList.contains('pc-selected'));assert.ok(pin.classList.contains('pc-pin-highlight'));assert.ok(path.classList.contains('pc-wire-feeds'));
    canvas.cancelGesture();assert.equal(card.style.left,'50px');await canvas.destroy();
});

test('repeated identical coordinate publications omit unchanged settled wire DTO batches', async () => {
    const {canvas,graph}=fixture();const wire=canvas.wireViews.get('edge');let publications=0;const publish=canvas.layer.setPositions;canvas.layer.setPositions=(nodes,groups,scene)=>{if(scene?.wires)publications++;return publish(nodes,groups,scene);};
    for(let i=0;i<5;i++)canvas.setPositions([{id:'a',x:graph.nodes.a.x,y:graph.nodes.a.y}]);
    assert.equal(publications,0);assert.equal(canvas.wireViews.get('edge'),wire);await canvas.destroy();
});

test('focus qualification restores hover and selected endpoints after structural changes and clears them on cancellation', async () => {
    const {canvas,graph,host}=fixture();const pin=()=>host.querySelector('.pc-port[data-node="a"][data-dir="out"]'),path=()=>host.querySelector('.pc-wire-native');
    pin().dispatchEvent(new window.MouseEvent('mouseenter'));assert.ok(path().classList.contains('pc-wire-feeds'));
    graph.nodes.a.enabled=false;canvas.render();assert.ok(path().classList.contains('pc-wire-off'));assert.ok(path().classList.contains('pc-wire-feeds'));assert.ok(pin().classList.contains('pc-pin-highlight'));
    pin().dispatchEvent(new window.MouseEvent('mouseleave'));assert.ok(!path().classList.contains('pc-wire-feeds'));canvas.select({kind:'wire',id:'edge'});assert.ok(path().classList.contains('pc-selected'));assert.ok(pin().classList.contains('pc-pin-highlight'));
    canvas.updateNativeWire({gesture:{kind:'drag',origin:{nodeId:'a',dir:'out',portId:'out'},target:{nodeId:'b',dir:'in',portId:'in'},ghost:{x:350,y:74},feedback:{compatible:true}}});canvas.frames.flush();
    const target=host.querySelector('.pc-port[data-node="b"][data-dir="in"]');assert.ok(target.classList.contains('pc-pin-compatible'));
    canvas.updateNativeWire({gesture:{kind:'drag',origin:{nodeId:'a',dir:'out',portId:'out'},target:{nodeId:'b',dir:'in',portId:'in'},ghost:{x:350,y:74},feedback:{compatible:false}}});canvas.frames.flush();assert.ok(target.classList.contains('pc-pin-invalid'));assert.ok(!target.classList.contains('pc-pin-compatible'));
    canvas.updateNativeWire({gesture:{kind:'idle'}});canvas.frames.flush();assert.ok(!target.classList.contains('pc-pin-target'));assert.ok(pin().classList.contains('pc-pin-highlight'));
    canvas.select({kind:'node',id:'b'});assert.ok(!pin().classList.contains('pc-pin-highlight'));assert.ok(!path().classList.contains('pc-selected'));
    await canvas.destroy();
});

test('selected wire focus survives the next route class publication and later deselection', async () => {
    const {canvas,host}=fixture();const path=host.querySelector('.pc-wire-native'),pin=host.querySelector('.pc-port[data-node="a"]');
    canvas.select({kind:'wire',id:'edge'});assert.ok(path.classList.contains('pc-wire-feeds'));canvas.setPositions([{id:'a',x:90,y:80}]);
    assert.ok(path.classList.contains('pc-selected'));assert.ok(path.classList.contains('pc-wire-feeds'));assert.ok(pin.classList.contains('pc-pin-highlight'));
    canvas.select({kind:'node',id:'a'});canvas.setPositions([{id:'a',x:100,y:90}]);assert.ok(!path.classList.contains('pc-selected'));assert.ok(!path.classList.contains('pc-wire-feeds'));await canvas.destroy();
});

test('wire hover, mode and LOD qualify paint once, then steady coordinate updates skip scans', async () => {
    const {canvas,host}=fixture();const hit=host.querySelector('.pc-wire-hit'),path=host.querySelector('.pc-wire-native');let scans=0;
    for(const layer of [canvas.nodeLayer,canvas.commentLayer,canvas.svg]) {const query=layer.querySelectorAll.bind(layer);layer.querySelectorAll=selector=>{scans++;return query(selector);};}
    hit.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));assert.ok(path.classList.contains('pc-wire-feeds'));assert.ok(scans>0);scans=0;
    hit.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));canvas.setPositions([{id:'a',x:90,y:80}]);assert.equal(scans,0);
    hit.dispatchEvent(new window.MouseEvent('pointerout',{bubbles:true}));assert.ok(!path.classList.contains('pc-wire-feeds'));assert.ok(scans>0);scans=0;
    canvas.setMode('pan');assert.ok(scans>0);scans=0;canvas.setMode('pan');canvas.setPositions([{id:'a',x:95,y:80}]);assert.equal(scans,0);
    canvas.view.zoom=.25;canvas.applyTransform();canvas.setPositions([{id:'a',x:100,y:80}]);assert.ok(scans>0);scans=0;canvas.setPositions([{id:'a',x:105,y:80}]);assert.equal(scans,0);await canvas.destroy();
});

test('fold remount restores highlighted pins and replaced views clear old hover focus', async () => {
    const {canvas,graph,host}=fixture();const first=host.querySelector('.pc-port[data-node="a"]');first.dispatchEvent(new window.MouseEvent('mouseenter'));
    graph.groups.fold={id:'fold',collapsed:true};graph.nodes.a.inGroup='fold';canvas.render();assert.equal(host.querySelector('.pc-port[data-node="a"]'),null);
    graph.groups.fold.collapsed=false;canvas.render();const mounted=host.querySelector('.pc-port[data-node="a"]');assert.notEqual(mounted,first);assert.ok(mounted.classList.contains('pc-pin-highlight'));assert.ok(host.querySelector('.pc-wire-native').classList.contains('pc-wire-feeds'));
    canvas.setGraph(structuredClone(graph),{viewKey:'new-activation:root'});assert.ok(!host.querySelector('.pc-port[data-node="a"]').classList.contains('pc-pin-highlight'));
    // JSDOM has no intrinsic card sizes after the qualified geometry reset.
    for(const node of Object.values(graph.nodes))canvas.geometry.measure(node.id,160,48,graph.nativeCards[node.id].ports.map(p=>({id:p.port,direction:p.dir,x:p.dir==='in'?0:160,y:24,side:p.side,kind:p.kind})));
    canvas.setPositions([{id:'a',x:50,y:50}]);assert.ok(!host.querySelector('.pc-wire-native').classList.contains('pc-wire-feeds'));await canvas.destroy();
});

test('expanded group motion retains selection without scans and same-graph replacement rolls back its saved frame', async () => {
    const {canvas,graph,host}=fixture(),{mouse}=await import('./canvas-fixture.mjs');
    const group={id:'open',title:'Open',collapsed:false,x:50,y:50,frame:{x:20,y:10,w:600,h:200}};
    graph.groups.open=group;graph.nodes.a.inGroup=graph.nodes.b.inGroup='open';canvas.render();const before=structuredClone(graph);
    const frame=host.querySelector('.pc-group-frame'),a=host.querySelector('.pc-node[data-id="a"]'),wire=host.querySelector('.pc-wire-native');
    mouse(frame.querySelector('.pc-group-frame-head'),'mousedown',60,20);mouse(window,'mousemove',100,50);canvas.frames.flush();
    assert.equal(group.frame.x,60);const initialRoute=wire.getAttribute('d'),counts=countWork(canvas),scans=[];
    for(const layer of [canvas.nodeLayer,canvas.commentLayer,canvas.svg]) {const query=layer.querySelectorAll.bind(layer);layer.querySelectorAll=selector=>{scans.push(selector);return query(selector);};}
    for(let i=0;i<8;i++){mouse(window,'mousemove',105+i*5,55+i*4);canvas.frames.flush();}
    assert.deepEqual(scans,[]);assert.equal(counts.renders,0);assert.equal(counts.geometry,0);assert.ok(frame.classList.contains('pc-selected'));assert.notEqual(wire.getAttribute('d'),initialRoute);
    assert.deepEqual([graph.nodes.a.x,graph.nodes.b.x,group.x,group.frame.x],[130,430,130,100]);assert.equal(frame.style.left,'100px');
    canvas.setGraph(graph);assert.deepEqual(graph,before);assert.equal(counts.renders,0);assert.equal(counts.wires,1);assert.equal(frame.style.left,'20px');assert.equal(a.style.left,'50px');assert.equal(canvas.drag,null);await canvas.destroy();
});
