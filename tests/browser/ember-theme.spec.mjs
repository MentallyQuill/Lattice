import { rootCommand, expectRootBusy } from './workflow-commands.mjs';
import { setCompact } from './details-helpers.mjs';
import { test, expect } from '@playwright/test';
import { approvedEmber, openEmber, measureEmber, assertEmber, assertColor, hasOuterRing } from './ember-fixture.mjs';

test('approved Dark Lite Ember verifies fresh unified startup then preserves fill-only alpha and family colors',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await openEmber(page);const initial=await measureEmber(page);assertEmber(initial);
    expect(initial.nodes).toHaveLength(5);expect(initial.shelf.find(row=>row.family==='Transpose').disabled).toBe(false);
    const before=initial.graphBytes,hostSheet=initial.hostSheet;
    for(let update=0;update<3;update++)await page.evaluate(async()=>{const h=window.canvasHarness,theme=await import('/src/theme.js?v='+h.version);theme.setPreset('ash');theme.setPreset('ember');h.UI.refreshIfOpen();await h.settle();});
    const repeated=await measureEmber(page);assertEmber(repeated);expect(repeated.hostSheet).toBe(hostSheet);expect(repeated.graphBytes).toBe(before);
    expect(repeated.nodes.map(node=>[node.heading.color,node.pins.map(pin=>pin.dot)])).toEqual(initial.nodes.map(node=>[node.heading.color,node.pins.map(pin=>pin.dot)]));
    expect(repeated.wires).toEqual(initial.wires);expect(errors).toEqual([]);
    await page.screenshot({path:testInfo.outputPath('ember-approved-dark-lite.png'),animations:'disabled'});
});

test('Ember inherits a different live host theme without changing host colors or compounding labels',async({page})=>{
    const alternate={...approvedEmber.settings.tokens,SmartThemeBodyColor:'rgba(201, 216, 238, 1)',SmartThemeEmColor:'rgba(119, 128, 150, 1)',SmartThemeQuoteColor:'rgba(238, 153, 66, 1)',SmartThemeBlurTintColor:'rgba(18, 20, 25, 1)',SmartThemeChatTintColor:'rgba(18, 20, 25, 1)',SmartThemeUserMesBlurTintColor:'rgba(33, 38, 46, 0.9)',SmartThemeBotMesBlurTintColor:'rgba(39, 43, 50, 0.9)',SmartThemeBorderColor:'rgba(61, 67, 75, 0.5)'};
    await openEmber(page,{tokens:alternate});const initial=await measureEmber(page);assertEmber(initial,alternate);
    await page.evaluate(tokens=>{document.getElementById('ember-host-theme').textContent=':root{'+Object.entries(tokens).map(([key,value])=>'--'+key+':'+value+';').join('')+'}';},approvedEmber.settings.tokens);
    const changed=await measureEmber(page);assertEmber(changed);expect(changed.graphBytes).toBe(initial.graphBytes);expect(changed.wires).toEqual(initial.wires);
});

test('Ember keeps orange selection and compact aliases while real JSON failure retains its error priority',async({page},testInfo)=>{
    const ids=await openEmber(page),initial=await measureEmber(page),selected=initial.nodes.find(node=>node.id===ids.firstCompose);
    assertColor(selected.border,approvedEmber.settings.tokens.SmartThemeQuoteColor,'orange selected border');expect(hasOuterRing(selected.shadow,approvedEmber.settings.tokens.SmartThemeQuoteColor)).toBe(true);
    await page.getByLabel('Node name',{exact:true}).fill('Local Scene');await page.getByLabel('Node name',{exact:true}).press('Tab');await setCompact(page, true);await page.evaluate(()=>window.canvasHarness.settle());
    const compact=await measureEmber(page);assertEmber(compact);expect(compact.nodes.find(node=>node.id===ids.firstCompose).classes).toContain('pc-node-compact');
    await setCompact(page, false);
    await page.evaluate(id=>{const h=window.canvasHarness;h.graph.nodes[id].sections[0].text='{broken';h.S.save();h.UI.refreshIfOpen();},ids.firstCompose);await page.evaluate(()=>window.canvasHarness.settle());
    const failed=page.locator('.pc-node-native[data-id="'+ids.jsonDecode+'"]'),before=await failed.boundingBox();
    await rootCommand(page);await expect(failed).toHaveClass(/pc-trace-failed/);await expect(page.locator('.pc-run-meter-label')).toHaveText('Failed');await failed.locator('.pc-native-heading').click();
    const result=await measureEmber(page),paint=result.nodes.find(node=>node.id===ids.jsonDecode);
    expect(paint.classes).toContain('pc-selected');assertColor(paint.border,result.roles.error,'failure border has priority');expect(hasOuterRing(paint.shadow,result.roles.error)).toBe(true);expect(hasOuterRing(paint.shadow,approvedEmber.settings.tokens.SmartThemeQuoteColor)).toBe(false);
    expect(Number(paint.heading.opacity)).toBeGreaterThan(0);expect(Number(paint.heading.opacity)).toBeLessThan(1);expect(paint.heading.filter).toContain('grayscale');expect(result.nodes.some(node=>node.classes.includes('pc-trace-blocked')&&Number(node.opacity)<1)).toBe(true);expect(result.providerCalls).toBe(0);
    const after=await failed.boundingBox();expect(after.width).toBe(before.width);expect(after.height).toBe(before.height);
    await page.screenshot({path:testInfo.outputPath('ember-selected-failure.png'),animations:'disabled'});
});

test('actual Run details and meter inherit alternate host roles while completion and failure retain semantic colors',async({page})=>{
    const tokens={...approvedEmber.settings.tokens,SmartThemeBodyColor:'rgba(201, 216, 238, 1)',SmartThemeEmColor:'rgba(119, 128, 150, 1)',SmartThemeQuoteColor:'rgba(238, 153, 66, 1)',SmartThemeBlurTintColor:'rgba(18, 20, 25, 1)',SmartThemeChatTintColor:'rgba(18, 20, 25, 1)',SmartThemeUserMesBlurTintColor:'rgba(33, 38, 46, 0.9)',SmartThemeBotMesBlurTintColor:'rgba(39, 43, 50, 0.9)',SmartThemeBorderColor:'rgba(61, 67, 75, 0.5)'};
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const ids=await openEmber(page,{tokens}),initial=await measureEmber(page);
    await rootCommand(page);await expect(page.locator('.pc-run-meter-label')).toHaveText('Completed');await page.mouse.move(0,0);
    const readRun=async()=>page.evaluate(()=>{
        const read=selector=>{const e=document.querySelector(selector);if(!e)return null;const c=getComputedStyle(e);return {color:c.color,background:c.backgroundColor,border:c.borderTopColor,bottomBorder:c.borderBottomColor};};
        return {meter:read('.pc-run-meter'),label:read('.pc-run-meter-label'),elapsed:read('[data-run-elapsed]'),completedPixel:read('[data-run-pixel][data-status="completed"]'),failedPixel:read('[data-run-pixel][data-status="failed"]'),details:read('.pc-run-details'),header:read('.pc-run-details header'),title:read('.pc-run-details h3'),summary:read('.pc-run-summary'),completedRow:read('.pc-run-details li[data-status="completed"]'),completedTitle:read('.pc-run-details li[data-status="completed"] button'),completedQuiet:read('.pc-run-details li[data-status="completed"] .pc-run-row-meta small'),usageSummary:read('.pc-run-details li[data-status="completed"] summary'),completedStatus:read('.pc-run-details .pc-run-status[data-status="completed"]'),failedRow:read('.pc-run-details li[data-status="failed"]'),failedTitle:read('.pc-run-details li[data-status="failed"] button'),failedQuiet:read('.pc-run-details li[data-status="failed"] .pc-run-row-meta small'),failedStatus:read('.pc-run-details .pc-run-status[data-status="failed"]'),failedIssue:read('.pc-run-details .pc-run-error'),calls:window.canvasHarness.providerCalls()};
    });
    const assertMeter=paint=>{
        assertColor(paint.meter.background,tokens.SmartThemeBotMesBlurTintColor,'ordinary meter surface');assertColor(paint.meter.border,tokens.SmartThemeBorderColor,'ordinary meter border');assertColor(paint.label.color,tokens.SmartThemeBodyColor,'ordinary meter label');assertColor(paint.elapsed.color,tokens.SmartThemeEmColor,'ordinary elapsed text');expect(paint.calls).toBe(0);
    };
    const completedMeter=await readRun();assertMeter(completedMeter);assertColor(completedMeter.completedPixel.background,'#8aad96','semantic completed meter pixel');
    await page.locator('.pc-run-meter').click();await expect(page.getByRole('region',{name:'Run details',exact:true})).toBeVisible();await page.mouse.move(0,0);
    const completed=await readRun();assertMeter(completed);
    for(const key of ['details','title','completedTitle'])assertColor(completed[key].color,tokens.SmartThemeBodyColor,key+' ordinary main text');
    for(const key of ['summary','completedQuiet','usageSummary'])assertColor(completed[key].color,tokens.SmartThemeEmColor,key+' ordinary quiet text');
    assertColor(completed.header.bottomBorder,tokens.SmartThemeBorderColor,'ordinary Run details header border');assertColor(completed.completedRow.background,tokens.SmartThemeBotMesBlurTintColor,'ordinary completed row surface');assertColor(completed.completedRow.border,tokens.SmartThemeBorderColor,'ordinary completed row border');assertColor(completed.completedStatus.color,'#a4c2ad','semantic completed status');
    expect((await measureEmber(page)).graphBytes).toBe(initial.graphBytes);
    await page.getByRole('button',{name:'Close panel',exact:true}).click();
    await page.evaluate(id=>{const h=window.canvasHarness;h.graph.nodes[id].sections[0].text='{broken';h.S.save();h.UI.refreshIfOpen();},ids.firstCompose);await page.evaluate(()=>window.canvasHarness.settle());
    await rootCommand(page);await expect(page.locator('.pc-run-meter-label')).toHaveText('Failed');await page.mouse.move(0,0);
    const failedMeter=await readRun();assertMeter(failedMeter);assertColor(failedMeter.failedPixel.background,'#d76a74','semantic failed meter pixel');
    await page.locator('.pc-run-meter').click();await expect(page.getByRole('region',{name:'Run details',exact:true})).toBeVisible();await page.mouse.move(0,0);
    const failed=await readRun();assertMeter(failed);assertColor(failed.failedTitle.color,tokens.SmartThemeBodyColor,'failed row ordinary title');assertColor(failed.failedQuiet.color,tokens.SmartThemeEmColor,'failed row ordinary quiet text');assertColor(failed.failedStatus.color,'#e58d94','semantic failed status');assertColor(failed.failedIssue.color,'#e58d94','semantic failure issue');assertColor(failed.failedRow.border,'#a44d59','semantic failed row border');assertColor(failed.failedRow.background,'#1a1b1c','semantic failed row surface');
    const final=await measureEmber(page);expect(final.hostTokens).toEqual(initial.hostTokens);expect(final.hostSheet).toBe(initial.hostSheet);expect(errors).toEqual([]);
});
