import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const approvedEmber = JSON.parse(readFileSync(new URL('../../docs/superpowers/handoffs/2026-10-09-ember-theme-tokens.json', import.meta.url), 'utf8'));
export const familyColors = { Input:'#96ad52', Shaping:'#589aab', Surface:'#92c9ad', Transpose:'#9080b6', Derive:'#b65b9e', Introspection:'#b39d71', Output:'#c96d82', Subgraphs:'#a3aa99' };
export const pinColors = { context:'#72adc0', guidance:'#c190be', draft:'#92c9ad', findings:'#b65b9e', patches:'#b65b9e', text:'#a5bfa0', data:'#7e9bc5', candidate:'#cca56d' };

export function colorChannels(value) {
    if (Array.isArray(value)) return value;
    const hex = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(value);
    if (hex) return [0,2,4].map(i=>parseInt(hex[1].slice(i,i+2),16)/255).concat(hex[2]?parseInt(hex[2],16)/255:1);
    const srgb = /^color\(srgb\s+([^)]*)\)$/.exec(value);
    const rgb = /^rgba?\(([^)]*)\)$/.exec(value);
    assert.ok(srgb||rgb,'Unsupported measured color: '+value);
    const parts=(srgb?.[1]??rgb[1]).trim().split(/[\s,/]+/).map(Number);
    return (srgb?parts.slice(0,3):parts.slice(0,3).map(v=>v/255)).concat(parts[3]??1);
}
export const mixColor = (source, body, ratio) => colorChannels(source).map((value,index)=>value*ratio+colorChannels(body)[index]*(1-ratio));
export function assertColor(actual, expected, label) {
    const a=colorChannels(actual),b=colorChannels(expected);
    for(let index=0;index<4;index++)assert.ok(Math.abs(a[index]-b[index])<=1/1024,label+': '+actual+' != '+JSON.stringify(expected));
}
export function hasOuterRing(shadow, color) {
    return shadow.split(/,(?![^(]*\))/).some(part=>{
        const match=part.trim().match(/^(.*?)\s+0px\s+0px\s+0px\s+([\d.]+)px$/);
        return !!match&&Number(match[2])>0&&colorChannels(match[1]).every((value,index)=>Math.abs(value-colorChannels(color)[index])<=1/1024);
    });
}

export async function openEmber(page, { url='/tests/browser/harness.html', tokens=approvedEmber.settings.tokens }={}) {
    // Establish the host fixture before product imports. Product code must leave
    // these SmartTheme values and the outside-host sentinel unchanged.
    const declarations=Object.entries(tokens).map(([key,value])=>'--'+key+':'+value+';').join('');
    await page.route('**/tests/browser/harness.html*',async route=>{
        const response=await route.fetch(),html=await response.text();
        await route.fulfill({response,body:html.replace('</head>','<style id="ember-host-theme">:root{'+declarations+'}</style></head>').replace('<body>','<body><div hidden id="ember-host-sentinel" style="color:var(--SmartThemeBodyColor);background:var(--SmartThemeBlurTintColor);border:1px solid var(--SmartThemeBorderColor)"></div>')});
    });
    await page.goto(url);await page.waitForFunction(()=>!!window.canvasHarness);
    await page.evaluate(async()=>{await window.canvasHarness.settle();await document.fonts.ready;});
    const ids=await page.evaluate(async()=>{
        const h=window.canvasHarness,g=h.graph,s=h.S.settings();
        const {validateWorkflow}=await import('/src/workflow/contracts.js?v='+h.version),fresh=validateWorkflow(g);
        if(!h.freshSettingsAbsent||g.name!=='Unified story workflow'||g.template?.id!=='unified-basic'||g.mode!=='native-unified'||g.schema!==3||g.runtime!==2||s.enabled!==false||Object.hasOwn(s,'graphs')||Object.hasOwn(s,'nativeBindings')||h.providerCalls()!==0||!fresh.ok||fresh.data.callBound!==0)throw Error('Ember must first verify the actual fresh unified, disabled, zero-call default.');
        // The approved theme fixture covers five cards, all original semantic
        // pins and four wires. Activate the public starter after checking startup.
        const {starterGraph}=await import('/src/workflow/starters.js?v='+h.version);
        await h.activate(starterGraph('structured-guidance'));
        const nodes=Object.values(h.graph.nodes);
        return {firstCompose:nodes.find(n=>n.operation==='compose'&&n.sections?.some(s=>s.name==='Scene')).id,jsonDecode:nodes.find(n=>n.operation==='json-decode').id,guidanceCompose:nodes.find(n=>n.operation==='compose'&&n.outputKind==='guidance').id};
    });
    await page.locator('.pc-node-native[data-id="'+ids.firstCompose+'"] .pc-native-heading').click();
    await page.evaluate(()=>window.canvasHarness.settle());
    return ids;
}

export async function measureEmber(page) {
    return page.evaluate(()=>{
        const h=window.canvasHarness,root=document.querySelector('.pc-root'),css=getComputedStyle(root);
        const read=(selector)=>{const e=typeof selector==='string'?document.querySelector(selector):selector;if(!e)return null;const c=getComputedStyle(e),r=e.getBoundingClientRect();return {background:c.backgroundColor,color:c.color,opacity:c.opacity,border:c.borderTopColor,borderWidth:c.borderTopWidth,radius:c.borderTopLeftRadius,shadow:c.boxShadow,filter:c.filter,x:r.x,y:r.y,width:r.width,height:r.height};};
        const tokenNames=['SmartThemeBodyColor','SmartThemeEmColor','SmartThemeQuoteColor','SmartThemeBlurTintColor','SmartThemeChatTintColor','SmartThemeUserMesBlurTintColor','SmartThemeBotMesBlurTintColor','SmartThemeBorderColor','SmartThemeShadowColor'];
        return {preset:document.documentElement.dataset.pcPreset,providerCalls:h.providerCalls(),graphBytes:JSON.stringify(h.graph),hostTokens:Object.fromEntries(tokenNames.map(key=>[key,getComputedStyle(document.documentElement).getPropertyValue('--'+key).trim()])),hostSheet:document.getElementById('ember-host-theme').textContent,host:read('#ember-host-sentinel'),roles:Object.fromEntries(['text','muted','accent','error','field','control','border'].map(key=>[key,css.getPropertyValue('--pc-'+key).trim()])),surfaces:{header:read('.pc-header'),menubar:read('.pc-menubar'),preview:read('.pc-preview-pane'),details:read('.pc-inspector'),canvas:read('.pc-canvas-host'),field:read('.pc-inspector input:not([type="checkbox"]):not(.pc-detail-name)'),control:read('.pc-arm')},nodes:[...document.querySelectorAll('.pc-node-native')].map(e=>({id:e.dataset.id,classes:e.className,family:h.canvas.graph.nativeCards[e.dataset.id].family,...read(e),heading:read(e.querySelector('.pc-native-heading')),icon:read(e.querySelector('.pc-native-icon')),alias:read(e.querySelector('.pc-native-alias')),pins:[...e.querySelectorAll('.pc-port')].map(pin=>({kind:pin.dataset.kind,port:pin.dataset.port,opacity:getComputedStyle(pin).opacity,dot:getComputedStyle(pin,'::after').backgroundColor,label:read(pin.closest('.pc-native-row').querySelector('.pc-native-pin-label'))}))})),shelf:[...document.querySelectorAll('.pc-family-row')].map(e=>({family:e.dataset.family,disabled:e.disabled,...read(e),icon:read(e.querySelector('svg'))})),wires:[...document.querySelectorAll('.pc-wire-native[data-id]')].map(e=>({id:e.dataset.id,kind:e.dataset.kind,stroke:getComputedStyle(e).stroke}))};
    });
}

export function assertEmber(metrics,tokens=approvedEmber.settings.tokens) {
    assert.equal(metrics.preset,'ember');assert.equal(metrics.providerCalls,0);
    for(const [key,value]of Object.entries(tokens))assertColor(metrics.hostTokens[key],value,'unchanged host '+key);
    assertColor(metrics.host.color,tokens.SmartThemeBodyColor,'outside host text');assertColor(metrics.host.background,tokens.SmartThemeBlurTintColor,'outside host panel');assertColor(metrics.host.border,tokens.SmartThemeBorderColor,'outside host border');
    for(const name of ['header','menubar','preview','details'])assertColor(metrics.surfaces[name].background,tokens.SmartThemeBlurTintColor,name+' panel');
    assertColor(metrics.surfaces.canvas.background,approvedEmber.settings.canvasOverride,'neutral canvas');
    assertColor(metrics.surfaces.field.background,tokens.SmartThemeUserMesBlurTintColor,'field');assertColor(metrics.surfaces.control.background,tokens.SmartThemeBotMesBlurTintColor,'raised control');
    assertColor(metrics.roles.text,tokens.SmartThemeBodyColor,'main text');assertColor(metrics.roles.muted,tokens.SmartThemeEmColor,'quiet text');assertColor(metrics.roles.accent,tokens.SmartThemeQuoteColor,'selection accent');assertColor(metrics.roles.border,tokens.SmartThemeBorderColor,'general border');
    for(const node of metrics.nodes){
        assertColor(node.background,approvedEmber.settings.nodeOverride,node.id+' fill-only alpha');assert.equal(node.opacity,'1',node.id+' whole-card opacity');assert.equal(node.radius,'6px');
        if(!/pc-selected|pc-trace-/.test(node.classes)){
            assert.equal(node.borderWidth,'0px',node.id+' no ordinary border');
            const shadow=node.shadow.match(/^(.*?)\s+0px\s+1px\s+2px\s+0px$/);assert.ok(shadow,node.id+' only the approved soft shadow: '+node.shadow);assertColor(shadow[1],'#00000050',node.id+' shadow alpha');
        }
        const heading=familyColors[node.family];
        assertColor(node.heading.color,heading,node.id+' family heading');assertColor(node.icon.color,heading,node.id+' heading icon inheritance');
        if(node.alias)assertColor(node.alias.color,heading,node.id+' compact family alias');
        for(const pin of node.pins){assert.equal(pin.opacity,'1');assertColor(pin.dot,mixColor(pinColors[pin.kind],tokens.SmartThemeBodyColor,.86),pin.kind+' original dot 86/14');assertColor(pin.label.color,mixColor(tokens.SmartThemeEmColor,tokens.SmartThemeBodyColor,.68),pin.kind+' original quiet label 68/32');}
    }
    for(const row of metrics.shelf){assertColor(row.color,familyColors[row.family],row.family+' shelf label');assertColor(row.icon.color,familyColors[row.family],row.family+' shelf semantic icon');assertColor(row.background,tokens.SmartThemeBotMesBlurTintColor,row.family+' shelf surface');if(row.disabled)assert.ok(Number(row.opacity)>0&&Number(row.opacity)<1);else assert.equal(row.opacity,'1');}
    assert.equal(metrics.wires.length,4);for(const wire of metrics.wires)assertColor(wire.stroke,pinColors[wire.kind],wire.kind+' unchanged wire hue');
}
