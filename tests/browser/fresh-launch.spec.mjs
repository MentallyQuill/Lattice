import {test,expect} from '@playwright/test';
for(const width of [1024,736,360,320])for(const dpr of [1,1.25,2])test('settings-free host base CSS launch '+width+'px DPR '+dpr,async({browser},testInfo)=>{
    const context=await browser.newContext({baseURL:testInfo.project.use.baseURL,viewport:{width,height:900},deviceScaleFactor:dpr,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    try {
        await page.goto('/tests/browser/harness.html?hostCss=1');await page.waitForFunction(()=>!!window.canvasHarness);
        await page.evaluate(()=>document.fonts.ready);
        const actual=await page.evaluate(async()=>{
            const h=window.canvasHarness,s=h.S.settings(),g=h.graph,{validateWorkflow}=await import('/src/workflow/contracts.js?v='+h.version),valid=validateWorkflow(g);
            const rect=selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect(),css=getComputedStyle(e);return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height,radius:css.borderTopRightRadius,background:css.backgroundColor,border:css.borderTopColor};};
            const menus=[...document.querySelectorAll('.pc-flat-menu')].map(el=>{const css=getComputedStyle(el);return {border:css.borderTopWidth,background:css.backgroundColor};});
            const activeTab=document.querySelector('.pc-graph-tab[aria-selected="true"]'),tabAfter=getComputedStyle(activeTab,'::after'),tabBox=activeTab.getBoundingClientRect(),paintBottom=tabBox.bottom-parseFloat(tabAfter.bottom);
            const join={position:tabAfter.position,bottom:tabAfter.bottom,height:tabAfter.height,background:tabAfter.backgroundColor,paintTop:paintBottom-parseFloat(tabAfter.height),paintBottom};
            const pins=[...document.querySelectorAll('.pc-node-native .pc-port')].slice(0,8).map(pin=>{const dot=getComputedStyle(pin,'::after'),r=pin.getBoundingClientRect(),label=pin.closest('.pc-native-row').querySelector('.pc-native-pin-label').getBoundingClientRect(),card=pin.closest('.pc-node-native').getBoundingClientRect(),zoom=h.canvas.view.zoom;return {dir:pin.dataset.dir,position:dot.position,width:dot.width,height:dot.height,x:r.x+r.width/2,y:r.y+r.height/2,labelX:label.x,labelRight:label.right,labelY:label.y+label.height/2,cardLeft:card.left,cardRight:card.right,zoom};});
            return {fresh:h.freshSettingsAbsent,hostCss:h.hostCss,name:g.name,schema:g.schema,runtime:g.runtime,enabled:s.enabled,collection:Object.hasOwn(s,'graphs'),bound:valid.data?.callBound,calls:h.providerCalls(),mode:Object.hasOwn(s,'workflowMode'),brand:document.querySelector('.pc-brand').textContent.trim(),font:document.fonts.check('600 20px "Bricolage Grotesque"'),overflow:document.documentElement.scrollWidth>innerWidth,graph:rect('.pc-canvas-area'),details:rect('.pc-inspector'),tab:rect('.pc-graph-tab[aria-selected="true"]'),accent:getComputedStyle(document.querySelector('.pc-graph-tab[aria-selected="true"]')).color,oldPins:document.querySelectorAll('.pc-node-output,.pc-port-key,.pc-port-stage,.pc-tok').length,menus,pins,join,canvas:rect('.pc-canvas-host')};
        });
        expect(actual).toMatchObject({fresh:true,name:'Unified story workflow',schema:3,runtime:2,enabled:false,collection:false,bound:0,calls:0,mode:false,brand:'LATTICE',font:true,overflow:false,oldPins:0});
        expect(['current','fallback']).toContain(actual.hostCss);
        expect(actual.graph.w).toBeGreaterThan(100);expect(actual.graph.h).toBeGreaterThan(140);expect(actual.graph.radius).toBe('4px');expect(actual.graph.border).toBe(actual.accent);
        // The selected tab overlaps the frame by one CSS pixel; its painted bridge covers the frame border at every DPR.
        expect(actual.tab.bottom-actual.graph.y).toBeCloseTo(1,3);
        expect(actual.join).toMatchObject({position:'absolute',bottom:'0px',height:'1px',background:actual.tab.background});
        expect(actual.join.background).toBe(actual.canvas.background);expect(actual.join.paintTop).toBeLessThanOrEqual(actual.graph.y);expect(actual.join.paintBottom).toBeGreaterThanOrEqual(actual.graph.y+1);
        expect(actual.menus).toHaveLength(7);for(const menu of actual.menus)expect(menu).toEqual({border:'0px',background:'rgba(0, 0, 0, 0)'});
        expect(actual.pins.length).toBeGreaterThan(0);for(const pin of actual.pins){expect(pin.position).toBe('absolute');expect(pin.width).toBe('7px');expect(pin.height).toBe('7px');expect(Math.abs(pin.y-pin.labelY)).toBeLessThanOrEqual(1);expect(Math.abs((pin.dir==='in'?pin.x-pin.cardLeft:pin.cardRight-pin.x)-12*pin.zoom)).toBeLessThanOrEqual(1);if(pin.dir==='in')expect(pin.x).toBeLessThan(pin.labelX);else expect(pin.x).toBeGreaterThan(pin.labelRight);}
        if(width>760)expect(actual.details.x).toBeGreaterThanOrEqual(actual.graph.right-1);else expect(actual.details.y).toBeGreaterThanOrEqual(actual.graph.bottom-1);
        expect(requests.some(url=>new URL(url).pathname==='/__host/style.css')).toBe(true);expect(requests.some(url=>new URL(url).pathname.startsWith('/api/'))).toBe(false);expect(errors).toEqual([]);
        if(width<=760){
            const before=await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph));
            const scene=await page.evaluate(()=>{
                const h=window.canvasHarness,node=Object.values(h.graph.nodes).find(item=>item.operation==='on-send'),card=[...document.querySelectorAll('.pc-node-native')].find(item=>item.dataset.id===node.id),pin=card.querySelector('.pc-port[data-dir="out"][data-port="activation"]'),label=pin.closest('.pc-native-row').querySelector('.pc-native-pin-label'),a=pin.getBoundingClientRect(),l=label.getBoundingClientRect(),b=document.querySelector('.pc-run-meter').getBoundingClientRect(),canvas=document.querySelector('.pc-canvas-host').getBoundingClientRect(),pixel=1/devicePixelRatio,hit=document.elementFromPoint(a.left+a.width/2,a.top+a.height/2);
                const overlap=rect=>rect.left<b.right&&rect.right>b.left&&rect.top<b.bottom&&rect.bottom>b.top;
                const inside=rect=>rect.left>=canvas.left-pixel&&rect.right<=canvas.right+pixel&&rect.top>=canvas.top-pixel&&rect.bottom<=canvas.bottom+pixel;
                return {id:node.id,port:pin.dataset.port,label:label.textContent,width:a.width,height:a.height,pinInside:inside(a),labelInside:inside(l),pinOverlap:overlap(a),labelOverlap:overlap(l),hit:hit?.closest('.pc-port')===pin};
            });
            expect(scene.id).toBeTruthy();expect(scene.port).toBe('activation');expect(scene.label).toBe('Send activation');expect(scene.width).toBeGreaterThan(0);expect(scene.height).toBeGreaterThan(0);expect(scene.pinInside).toBe(true);expect(scene.labelInside).toBe(true);expect(scene.pinOverlap).toBe(false);expect(scene.labelOverlap).toBe(false);expect(scene.hit).toBe(true);
            const rows=page.locator('.pc-node-shelf .pc-family-row');expect(await rows.count()).toBe(8);
            for(let index=0;index<await rows.count();index++){
                const clearance=await rows.nth(index).evaluate(row=>{
                    row.scrollIntoView({block:'nearest',inline:'nearest'});
                    const shelf=row.closest('.pc-node-shelf').getBoundingClientRect(),a=row.getBoundingClientRect(),b=document.querySelector('.pc-run-meter').getBoundingClientRect(),hit=document.elementFromPoint(a.left+a.width/2,a.top+a.height/2),pixel=1/devicePixelRatio;
                    return {family:row.dataset.family,top:a.top,bottom:a.bottom,shelfTop:shelf.top,shelfBottom:shelf.bottom,meterTop:b.top,horizontalOverlap:a.left<b.right&&a.right>b.left,hit:hit?.closest('.pc-family-row')===row,pixel};
                });
                expect(clearance.top,clearance.family+' is reachable inside the shelf').toBeGreaterThanOrEqual(clearance.shelfTop-clearance.pixel);
                expect(clearance.bottom,clearance.family+' fits inside the shelf').toBeLessThanOrEqual(clearance.shelfBottom+clearance.pixel);
                if(clearance.horizontalOverlap)expect(clearance.bottom,clearance.family+' stays above the run meter').toBeLessThanOrEqual(clearance.meterTop+clearance.pixel);
                expect(clearance.hit,clearance.family+' owns its visible hit target').toBe(true);
            }
            await page.locator('.pc-node-shelf').evaluate(shelf=>{shelf.scrollTop=0;});
            expect(await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph))).toBe(before);expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
        }
        await page.screenshot({path:testInfo.outputPath('fresh-host-'+width+'-dpr'+dpr+'.png'),animations:'disabled'});
        if(width<=760){const before=await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph));const access=await page.locator('.pc-inspector').evaluate(panel=>{const body=document.querySelector('.pc-body'),pane=body.getBoundingClientRect(),initial=panel.getBoundingClientRect(),viewport=Math.min(innerHeight,pane.bottom),pixel=1/devicePixelRatio,requiresScroll=initial.bottom>viewport+pixel;panel.scrollIntoView({block:'end'});const box=panel.getBoundingClientRect();return {overflow:getComputedStyle(body).overflowY,scrollable:body.scrollHeight>body.clientHeight,requiresScroll,top:box.top,bottom:box.bottom,viewport,pixel};});expect(access.overflow).toBe('auto');if(access.requiresScroll)expect(access.scrollable).toBe(true);expect(access.top).toBeGreaterThanOrEqual(-access.pixel);expect(access.bottom).toBeLessThanOrEqual(access.viewport+access.pixel);expect(await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph))).toBe(before);}
    } finally {await context.close();}
});
