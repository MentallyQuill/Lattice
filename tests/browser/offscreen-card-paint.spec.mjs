import { test, expect } from '@playwright/test';

async function open(page){await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);await page.evaluate(()=>canvasHarness.reset(100,10));await page.mouse.move(1439,999);}

test('offscreen paint suppression retains cards, pins and wires and reveals cards after pan or zoom',async({page})=>{
    await open(page);
    await expect(page.locator('.pc-node-native[data-id="n99"]')).toHaveCSS('opacity','0');
    const result=await page.evaluate(async()=>{
        const h=canvasHarness,c=h.canvas,card=c.nodeLayer.querySelector('[data-id="n99"]'),pin=card.querySelector('.pc-port'),wire=c.svg.querySelector('.pc-wire-native');
        const before={width:c.widthOf(c.graph.nodes.n99),height:c.heightOf(c.graph.nodes.n99),endpoint:c.endpoint('n99','out','out'),d:wire.getAttribute('d')};
        await h.view({x:-c.graph.nodes.n99.x+100,y:-c.graph.nodes.n99.y+100});
        const revealed=getComputedStyle(card).opacity;
        await h.view({x:0,y:0,zoom:.1});
        return {revealed,hidden:[...c.nodeLayer.querySelectorAll('.pc-node-native')].filter(el=>getComputedStyle(el).opacity==='0').length,sameCard:c.nodeLayer.querySelector('[data-id="n99"]')===card,samePin:card.querySelector('.pc-port')===pin,sameWire:c.svg.querySelector('.pc-wire-native')===wire,before,after:{width:c.widthOf(c.graph.nodes.n99),height:c.heightOf(c.graph.nodes.n99),endpoint:c.endpoint('n99','out','out'),d:wire.getAttribute('d')}};
    });
    expect(result).toMatchObject({revealed:'1',hidden:0,sameCard:true,samePin:true,sameWire:true});expect(result.after).toEqual(result.before);
});

test('keyboard focus can reveal an offscreen card and keeps the camera aligned',async({page})=>{
    await open(page);await expect(page.locator('.pc-node-native[data-id="n99"]')).toHaveCSS('opacity','0');
    const result=await page.evaluate(async()=>{const c=canvasHarness.canvas,card=c.nodeLayer.querySelector('[data-id="n99"]');card.focus();await canvasHarness.settle();const r=card.getBoundingClientRect();return{focused:document.activeElement===card,opacity:getComputedStyle(card).opacity,actual:c.toGraph(r.left,r.top),expected:{x:c.graph.nodes.n99.x,y:c.graph.nodes.n99.y},scroll:[c.host.scrollLeft,c.host.scrollTop]};});
    expect(result).toMatchObject({focused:true,opacity:'1',scroll:[0,0]});expect(result.actual.x).toBeCloseTo(result.expected.x,3);expect(result.actual.y).toBeCloseTo(result.expected.y,3);
});

test('selection and active native pin targets keep offscreen cards painted; pin menus suspend suppression',async({page})=>{
    await open(page);
    const result=await page.evaluate(async()=>{
        const c=canvasHarness.canvas,opacity=id=>getComputedStyle(c.nodeLayer.querySelector('[data-id="'+id+'"]')).opacity;
        c.select({kind:'node',id:'n99'});await canvasHarness.settle();const selected=opacity('n99');c.select(null);
        c.setMulti(['n98','n99']);await canvasHarness.settle();const multi=[opacity('n98'),opacity('n99')];c.setMulti([]);
        c.updateNativeWire({gesture:{kind:'drag',origin:{nodeId:'n98',dir:'out',portId:'out'},target:{nodeId:'n99',dir:'in',portId:'section.Text'},feedback:{compatible:true}}});c.frames.flush();await canvasHarness.settle();const pins=[opacity('n98'),opacity('n99')];
        c.updateNativeWire({gesture:{kind:'idle'},menu:{kind:'pin'}});c.frames.flush();await canvasHarness.settle();const menu=opacity('n97');
        c.updateNativeWire({gesture:{kind:'idle'}});c.frames.flush();await canvasHarness.settle();const after=opacity('n97');
        return{selected,multi,pins,menu,after};
    });
    expect(result).toEqual({selected:'1',multi:['1','1'],pins:['1','1'],menu:'1',after:'0'});
});

test('coordinate edits and canvas resizing refresh paint decisions without camera-frame measurements',async({page})=>{
    await open(page);
    const result=await page.evaluate(async()=>{
        const c=canvasHarness.canvas,card=c.nodeLayer.querySelector('[data-id="n99"]');c.setPositions([{id:'n99',x:50,y:100}]);await canvasHarness.settle();const moved=getComputedStyle(card).opacity;
        c.setPositions([{id:'n99',x:1700,y:100}]);await canvasHarness.settle();const narrow=getComputedStyle(card).opacity;
        c.host.style.minWidth='3000px';await new Promise(r=>setTimeout(r,80));await canvasHarness.settle();const resized=getComputedStyle(card).opacity;
        let hostReads=0,cardReads=0;const hostRect=c.host.getBoundingClientRect.bind(c.host),nodeRect=card.getBoundingClientRect.bind(card);c.host.getBoundingClientRect=()=>{hostReads++;return hostRect();};card.getBoundingClientRect=()=>{cardReads++;return nodeRect();};
        for(let i=0;i<20;i++){c.view.x+=1;c.applyTransform();}await canvasHarness.settle();
        return{moved,narrow,resized,hostReads,cardReads};
    });
    expect(result).toEqual({moved:'1',narrow:'0',resized:'1',hostReads:0,cardReads:0});
});


test('profile editing keeps its offscreen owner painted without moving the camera',async({page})=>{
    await open(page);
    const result=await page.evaluate(async()=>{
        const c=canvasHarness.canvas,before={...c.view};
        c.setNodeProfiles([{id:'n99',selection:{selectionKey:'n99',address:{workflowId:canvasHarness.graph.id,instancePath:[],nodeId:'n99'}},value:'',label:'Profile',model:'',editable:true,options:[]}]);
        c.host.querySelector('.pc-node-profile[data-id="n99"] button').focus({preventScroll:true});await canvasHarness.settle();
        return{focused:document.activeElement.closest('.pc-node-profile')?.dataset.id,opacity:getComputedStyle(c.nodeLayer.querySelector('[data-id="n99"]')).opacity,before,after:{...c.view}};
    });
    expect(result.focused).toBe('n99');expect(result.opacity).toBe('1');expect(result.after).toEqual(result.before);
});

test('envelope boundaries reveal cards before they enter view and scope replacement resets cached bounds',async({page})=>{
    await open(page);
    const result=await page.evaluate(async()=>{
        const c=canvasHarness.canvas,card=c.nodeLayer.querySelector('[data-id="n99"]'),x=c.host.clientWidth+513,opacity=()=>getComputedStyle(card).opacity;
        c.setPositions([{id:'n99',x,y:100}]);await canvasHarness.settle();const outside=opacity();
        await canvasHarness.view({x:-200});const withinEnvelope=opacity();await canvasHarness.view({x:-300});const beyondEnvelope=opacity();
        const replacement=structuredClone(c.graph);replacement.id='reused-ids';replacement.view={x:0,y:0,zoom:1};replacement.nodes.n99.x=50;replacement.nodes.n99.y=100;c.setGraph(replacement);await canvasHarness.settle();
        return{outside,withinEnvelope,beyondEnvelope,replaced:opacity(),sameCard:c.nodeLayer.querySelector('[data-id="n99"]')===card};
    });
    expect(result).toEqual({outside:'0',withinEnvelope:'0',beyondEnvelope:'1',replaced:'1',sameCard:true});
});

test('offscreen card resizing retains layout measurements and admits newly overlapping paint',async({page})=>{
    await open(page);
    const result=await page.evaluate(async()=>{
        const c=canvasHarness.canvas,card=c.nodeLayer.querySelector('[data-id="n99"]');c.setPositions([{id:'n99',x:-900,y:100}]);await canvasHarness.settle();const before=getComputedStyle(card).opacity;
        card.style.maxWidth='none';card.style.width='1100px';await new Promise(r=>setTimeout(r,80));await canvasHarness.settle();
        return{before,after:getComputedStyle(card).opacity,width:c.widthOf(c.graph.nodes.n99)};
    });
    expect(result.before).toBe('0');expect(result.after).toBe('1');expect(result.width).toBeGreaterThan(1000);
});
