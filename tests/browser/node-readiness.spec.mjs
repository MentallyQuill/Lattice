import {test,expect} from '@playwright/test';

async function fixture(page,compact=false) {
    await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
    await page.evaluate(async compact=>{
        const h=window.canvasHarness;
        const c=h.context;c.mainApi='openai';c.chatCompletionSettings.chat_completion_source='nanogpt';c.chatCompletionSettings.current_model='host-model';c.getChatCompletionModel=settings=>settings.current_model;c.CONNECT_API_MAP={nanogpt:{selected:'openai',source:'nanogpt',label:'NanoGPT'}};
        const {operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
        const make=(id,operation,x)=>({id,type:'workflow',...operationDefaults(operation),phase:'pre',x,y:180,w:260});
        const root={id:'readiness-browser',name:'Readiness',schema:3,runtime:2,mode:'native-unified',nodes:{memory:make('memory','prompted-memory',50),model:make('model','model-call',390)},wires:{},portals:{},definitions:{},groups:{}};
        Object.assign(root.nodes.model,{profileId:'missing-profile',model:'organization/'+ 'very-long-model-identifier-'.repeat(18),modifiers:[{id:'trim',type:'trim',version:1,enabled:true,settings:{edges:'both'}}],presentation:{compact}});
        await h.activate(root);await h.view({x:280,y:160,zoom:1});h.canvas.setPreviewTarget('model');
    },compact);
}

test('readiness opens existing Details and progressively saves required fields without effects',async({page})=>{
    await fixture(page);
    const badge=page.locator('.pc-node-profile[data-id="memory"] .pc-node-readiness');
    await expect(badge).toHaveAttribute('data-readiness','setup');
    await badge.focus();await page.keyboard.press('Enter');
    await expect(page.locator('.pc-node-details')).toContainText('Setup Required');
    await expect(page.getByLabel('Actor id',{exact:true})).toBeFocused();
    await page.getByLabel('Actor id',{exact:true}).fill('real-actor');await page.getByLabel('Actor id',{exact:true}).press('Tab');
    await expect(badge).toHaveAttribute('data-readiness','input');
    expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.memory.actorId)).toBe('real-actor');
    expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});

test('missing model connection readiness focuses the actual connection picker',async({page})=>{
    await fixture(page);
    await page.locator('.pc-node-profile[data-id="model"] .pc-node-readiness').click();
    await expect(page.locator('.pc-node-details')).toBeVisible();
    await expect(page.locator('.pc-node-profile[data-id="model"] .profile-bar')).toBeFocused();
});

for(const compact of [false,true])test(`model/readiness stack and corner badges remain distinct at every zoom (${compact?'compact':'full'})`,async({page},testInfo)=>{
    await fixture(page,compact);
    const anchors=await page.evaluate(()=>window.canvasHarness.canvas.endpoint('model','out','out'));
    for(const zoom of [1,.5,.25]){
        await page.evaluate(async zoom=>{const h=window.canvasHarness;await h.view({x:450,y:60,zoom});h.canvas.setPreviewTarget('model');},zoom);
        const geometry=await page.evaluate(()=>{
            const h=window.canvasHarness,card=document.querySelector('.pc-node[data-id="model"]'),root=document.querySelector('.pc-node-profile[data-id="model"]');
            const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
            return{card:rect(card),model:rect(root.querySelector('.node-model-meta')),badge:rect(root.querySelector('.pc-node-readiness')),target:rect(card.querySelector('.pc-node-target')),modifier:rect(card.querySelector('.pc-modifier-badge')),bar:rect(root.querySelector('.profile-bar')),bounds:h.canvas.visualBoundsOf(h.canvas.graph.nodes.model),pin:h.canvas.endpoint('model','out','out'),full:root.querySelector('.node-model-meta').title};
        });
        expect(geometry.model.bottom).toBeLessThanOrEqual(geometry.badge.y);
        expect(geometry.badge.bottom).toBeLessThanOrEqual(geometry.card.y-12*zoom+.5);
        expect(geometry.target.y).toBeGreaterThan(geometry.badge.bottom);
        expect(geometry.bar.y).toBeGreaterThan(geometry.card.bottom);
        expect(geometry.model.h).toBeLessThanOrEqual(31*zoom+.5);
        expect(geometry.full.length).toBeGreaterThan(200);
        expect(geometry.pin).toEqual(anchors);
        await page.screenshot({path:testInfo.outputPath(`readiness-${compact?'compact':'full'}-${zoom}.png`)});
    }
});

test('placement measurement includes an optional prepared decoration row and cleans up its preview',async({page})=>{
    await fixture(page,true);
    const result=await page.evaluate(async()=>{
        const h=window.canvasHarness,{measureNodeCard}=await import('/dist/lattice-ui.js?v='+h.version),count=document.querySelectorAll('.pc-node-profile').length;
        const size=measureNodeCard(h.canvas.nodeLayer,h.canvas.preparedCards.get('model'),h.canvas.nodeProfiles.find(row=>row.id==='model'));
        return {size,before:count,after:document.querySelectorAll('.pc-node-profile').length};
    });
    expect(result.size.visualBounds.y).toBeLessThan(0);
    expect(result.size.visualBounds.h).toBeGreaterThan(result.size.height);
    expect(result.before).toBe(result.after);
});

test('folded groups summarize unique sources, open Details, and Fit includes every decoration',async({page},testInfo)=>{
    await fixture(page);
    await page.evaluate(async()=>{
        const h=window.canvasHarness,root=structuredClone(h.graph),{operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
        root.nodes.input={id:'input',type:'workflow',...operationDefaults('guidance'),phase:'pre',x:730,y:180};
        root.groups={g:{id:'g',title:'Needs attention',collapsed:true,x:300,y:150,w:350}};
        for(const node of Object.values(root.nodes))node.inGroup='g';
        await h.activate(root);await h.view({x:280,y:60,zoom:1});
    });
    const summary=page.locator('.pc-group-readiness');
    await expect(summary).toHaveText('2 need setup · 1 needs input');
    await summary.focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox',{name:'Node name',exact:true})).toHaveValue('Prompted Memory');
    await summary.focus();await page.keyboard.press('Delete');
    expect(await page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes).length)).toBe(3);
    await page.getByRole('button',{name:'Open group',exact:true}).click();
    await page.evaluate(async()=>{const h=window.canvasHarness;h.canvas.fit({avoidShelf:false});await h.settle();});
    const framed=await page.evaluate(()=>{
        const h=window.canvasHarness,outer=h.canvas.host.getBoundingClientRect();
        return [...h.canvas.viewport.querySelectorAll('.pc-node[data-id],.pc-group-frame,.pc-node-decoration-stack,.profile-bar,.pc-native-alias')].filter(element=>element.getBoundingClientRect().width&&element.getBoundingClientRect().height).every(element=>{const r=element.getBoundingClientRect();return r.left>=outer.left-1&&r.top>=outer.top-1&&r.right<=outer.right+1&&r.bottom<=outer.bottom+1;});
    });
    expect(framed).toBe(true);
    await page.screenshot({path:testInfo.outputPath('readiness-expanded-group-fit.png')});
});

test('production shelf placement at quarter zoom clears the long readiness stack of the node above',async({page},testInfo)=>{
    await fixture(page);
    const family=await page.evaluate(async()=>{
        const h=window.canvasHarness,{operationDefaults,OPERATIONS}=await import('/src/workflow/catalog.js?v='+h.version);
        h.context.chatCompletionSettings.current_model='organization/'+ 'long-live-model-name-'.repeat(18);
        const root={id:'quarter-shelf',name:'Quarter zoom placement',schema:3,runtime:2,mode:'native-unified',nodes:{above:{id:'above',type:'workflow',...operationDefaults('model-call'),phase:'pre',x:0,y:0,profileId:'missing-profile',model:'organization/'+ 'long-existing-model-name-'.repeat(18)}},wires:{},groups:{},definitions:{},portals:{}};
        await h.activate(root);await h.view({x:0,y:0,zoom:.25});
        const rect=h.canvas.host.getBoundingClientRect(),center=h.canvas.toGraph(rect.left+rect.width/2,rect.top+rect.height/2),node=h.canvas.graph.nodes.above,bounds=h.canvas.visualBoundsOf(node),height=h.canvas.heightOf(node);
        // Reproduces the old 64px upper reservation's exact 24px gap: its live
        // quarter-zoom stack then extended 19 graph pixels into this blocker.
        root.nodes.above.x=center.x-h.canvas.widthOf(node)/2;
        root.nodes.above.y=center.y-height/2-80-(bounds.y+bounds.h-node.y);
        await h.activate(root);await h.view({x:0,y:0,zoom:.25});
        return OPERATIONS['model-call'].family;
    });
    await page.locator(`[data-family="${family}"]`).click();
    await page.locator('[data-shelf-choice="operation:model-call"]').click();
    const newId=await page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes).find(id=>id!=='above'));
    expect(newId).toBeTruthy();
    await expect(page.locator(`.pc-node-profile[data-id="${newId}"] .node-model-meta`)).toContainText('long-live-model-name');
    await expect(page.locator(`.pc-node-profile[data-id="${newId}"] .pc-node-readiness`)).toBeVisible();
    const geometry=await page.evaluate(id=>{
        const h=window.canvasHarness,node=h.canvas.graph.nodes[id],a=h.canvas.visualBoundsOf(h.canvas.graph.nodes.above),b=h.canvas.visualBoundsOf(node),rect=h.canvas.host.getBoundingClientRect(),center=h.canvas.toGraph(rect.left+rect.width/2,rect.top+rect.height/2);
        const formerOriginY=center.y+64-(h.canvas.heightOf(node)+48+64)/2;
        const formerVisualTop=formerOriginY+b.y-node.y;
        return {a,b,formerOverlap:a.y+a.h-formerVisualTop,zoom:h.canvas.view.zoom,clear:a.x+a.w+24<=b.x||b.x+b.w+24<=a.x||a.y+a.h+24<=b.y||b.y+b.h+24<=a.y};
    },newId);
    expect(geometry.zoom).toBe(.25);expect(geometry.a.y).toBeLessThan(geometry.b.y);expect(geometry.clear).toBe(true);
    expect(geometry.formerOverlap).toBeCloseTo(19,0);
    expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
    await page.screenshot({path:testInfo.outputPath('readiness-quarter-shelf-placement.png')});
});

test('unavailable live document readiness focuses the existing advanced source selector',async({page})=>{
    await page.route('**/scripts/user.js',route=>route.fulfill({contentType:'text/javascript',body:'export const getCurrentUserHandle=()=>"readiness-document-user";'}));
    await page.route('**/script.js',route=>route.fulfill({contentType:'text/javascript',body:'export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'}));
    await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
    await page.evaluate(async()=>{
        const h=window.canvasHarness,c=h.context;
        Object.assign(c,{chatId:'readiness-document-chat',characters:[{name:'Companion',avatar:'companion.png',chat:'readiness-document'}],characterId:0,groupId:null,chat:[],chatMetadata:{},saveMetadata:async()=>true,getRequestHeaders:()=>({'Content-Type':'application/json'})});
        await (await import('/src/run.js?v='+h.version)).initializeNativeWorkflowController();
        const {operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
        await h.activate({id:'document-readiness',name:'Document readiness',schema:3,runtime:2,mode:'native-unified',nodes:{file:{id:'file',type:'workflow',...operationDefaults('read-file'),targetId:'missing-custom-document',phase:'pre',x:250,y:140}},wires:{},groups:{},definitions:{},portals:{}});
        await h.view({x:160,y:60,zoom:1});
    });
    const badge=page.locator('.pc-node-profile[data-id="file"] .pc-node-readiness');
    await expect(badge).toHaveAttribute('data-readiness','setup');await badge.click();
    await expect(page.locator('[data-workflow-advanced]')).toHaveAttribute('open','');
    await expect(page.locator('[data-workflow-source]').first()).toBeFocused();
    expect(await page.evaluate(()=>window.canvasHarness.graph.nodes.file.targetId)).toBe('missing-custom-document');
    expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});

test('nested library readiness opens the exact descendant definition before selecting a same-ID source',async({page})=>{
    await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
    const before=await page.evaluate(async()=>{
        const h=window.canvasHarness,{operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version),{computeDefinitionIdentity,definitionRefKey}=await import('/src/workflow/definitions.js?v='+h.version);
        const finish=raw=>{const result=computeDefinitionIdentity(raw);if(!result.ok)throw Error(JSON.stringify(result.error));return {...result.data.materializedDefinition,semanticHash:result.data.semanticHash};};
        const ref=def=>({id:def.id,version:def.version,semanticHash:def.semanticHash});
        const child=finish({id:'readiness-leaf',version:1,name:'Actual leaf',parameters:[],interface:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{memory:{id:'memory',type:'workflow',...operationDefaults('prompted-memory'),x:100,y:140}},wires:{}}});
        const parent=finish({id:'readiness-parent',version:1,name:'Parent with same ID',parameters:[],interface:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{wrapper:{id:'wrapper',type:'subgraph',definition:ref(child),x:100,y:140},memory:{id:'memory',type:'workflow',...operationDefaults('text'),text:'Wrong parent source',title:'Parent decoy',x:460,y:140}},wires:{}}});
        const root={id:'library-readiness',name:'Nested library readiness',schema:3,runtime:2,mode:'native-unified',nodes:{parent:{id:'parent',type:'subgraph',definition:ref(parent),x:250,y:140}},wires:{},groups:{},definitions:{[definitionRefKey(child)]:child,[definitionRefKey(parent)]:parent},portals:{}};
        await h.activate(root);await h.view({x:200,y:60,zoom:1});return JSON.stringify(h.graph);
    });
    await page.locator('.pc-node[data-id="parent"] .pc-native-heading').click({button:'right'});
    await page.getByRole('menuitem',{name:'Open saved definition',exact:true}).click();
    await expect(page.locator('.pc-graph-tab[aria-selected="true"]')).toContainText('Parent with same ID');
    await page.evaluate(async()=>{await window.canvasHarness.view({x:220,y:60,zoom:1});});
    await page.locator('.pc-node-profile[data-id="wrapper"] .pc-node-readiness').click();
    await expect(page.locator('.pc-graph-tab[aria-selected="true"]')).toContainText('Actual leaf');
    await expect(page.getByRole('textbox',{name:'Node name',exact:true})).toHaveValue('Prompted Memory');
    await expect(page.getByLabel('Actor id',{exact:true})).toBeDisabled();
    expect(await page.evaluate(()=>JSON.stringify(window.canvasHarness.graph))).toBe(before);
    expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
