import { test, expect } from '@playwright/test';
const root = (page, name) => page.getByRole('menubar', { name: 'Workspace menus' }).getByRole('menuitem', { name, exact: true });
const menu = (page, name) => page.getByRole('menu', { name, exact: true });
async function start(page) { await page.goto('/tests/browser/harness.html'); await page.waitForFunction(() => !!window.canvasHarness); await page.evaluate(() => window.canvasHarness.reset()); }
test('opening a workspace menu cancels held Space pan before isolated key release',async({page})=>{await start(page);await page.locator('.pc-canvas-host').focus();await page.keyboard.down('Space');expect(await page.evaluate(()=>window.canvasHarness.canvas.spaceDown)).toBe(true);await root(page,'File').click();await page.keyboard.up('Space');await page.keyboard.press('Escape');expect(await page.evaluate(()=>window.canvasHarness.canvas.spaceDown)).toBe(false);await expect(page.locator('.pc-canvas-host')).not.toHaveClass(/pc-space-pan/);});
test('six menus start closed, click arms hover, and dismissal disarms hover', async ({ page }) => {
    await start(page);
    await expect(page.locator('.pc-flat-menu')).toHaveText(['File', 'Edit', 'View', 'Graph', 'Workflow', 'Help']);
    await root(page, 'Edit').hover(); await expect(page.getByRole('menu')).toHaveCount(0);
    await root(page, 'File').click(); await expect(menu(page, 'File')).toBeVisible();
    await root(page, 'Edit').hover(); await expect(menu(page, 'Edit')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toHaveCount(0); await expect(root(page, 'Edit')).toBeFocused();
    await root(page, 'View').hover(); await expect(page.getByRole('menu')).toHaveCount(0);
    await root(page, 'View').click(); await page.locator('.pc-canvas-host').click({ position: { x: 10, y: 10 } });
    await root(page, 'Help').hover(); await expect(page.getByRole('menu')).toHaveCount(0);
    await root(page, 'Help').click(); await page.keyboard.press('Tab'); await expect(page.getByRole('menu')).toHaveCount(0);
    await root(page, 'Graph').hover(); await expect(page.getByRole('menu')).toHaveCount(0);
    await root(page, 'Graph').click(); await page.setViewportSize({ width: 1300, height: 900 }); await expect(page.getByRole('menu')).toHaveCount(0);
});
test('menu keys and paste cannot edit or move the selected background graph', async ({ page }) => {
    await start(page);
    const before = await page.evaluate(async () => { const h = window.canvasHarness; h.S.settings().ui.confirmDelete = false; h.canvas.select({kind:'node', id:Object.keys(h.graph.nodes)[0]}); await h.view({x:123,y:67,zoom:.8}); return {graph:JSON.stringify(h.graph), camera:{...h.canvas.view}, selection:h.canvas.selection}; });
    await root(page, 'Edit').click(); await menu(page, 'Edit').getByRole('menuitem', {name:/^Copy/}).focus();
    for (const key of ['c', 'f', 'Delete', 'Control+z', 'Control+x', 'Control+v']) await page.keyboard.press(key);
    await page.evaluate(() => { const transfer = new DataTransfer(); transfer.setData('text/plain','must stay outside graph'); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:transfer})); });
    expect(await page.evaluate(() => ({graph:JSON.stringify(window.canvasHarness.graph),camera:{...window.canvasHarness.canvas.view},selection:window.canvasHarness.canvas.selection}))).toEqual(before);
});

test('submenus preserve hover session, keyboard focus and action dismissal', async ({ page }) => {
    await start(page); await root(page,'Workflow').focus(); await page.keyboard.press('ArrowDown');
    const recall=menu(page,'Workflow').getByRole('menuitem',{name:'Memory recall',exact:true});
    await recall.focus(); await page.keyboard.press('ArrowRight');
    const submenu=menu(page,'Memory recall options'); await expect(submenu).toBeVisible();
    await expect(submenu.getByRole('menuitem',{name:'Memory recall overview…',exact:true})).toBeFocused();
    await page.keyboard.press('End'); await expect(submenu.getByRole('menuitem',{name:'Memory recall overview…',exact:true})).toBeFocused();
    await page.keyboard.press('Home'); await page.keyboard.press('m'); await expect(submenu.getByRole('menuitem',{name:'Memory recall overview…',exact:true})).toBeFocused();
    await page.keyboard.press('ArrowLeft'); await expect(submenu).toHaveCount(0); await expect(recall).toBeFocused();
    await root(page,'Graph').hover(); await expect(menu(page,'Graph')).toBeVisible();
    await menu(page,'Graph').getByRole('menuitemradio',{name:'Pan tool',exact:true}).click();
    await expect(page.getByRole('menu')).toHaveCount(0);await expect(root(page,'Graph')).toBeFocused();
    await root(page,'File').hover();await expect(page.getByRole('menu')).toHaveCount(0);
    await root(page,'Graph').click();await expect(menu(page,'Graph').getByRole('menuitemradio',{name:'Pan tool',exact:true})).toBeChecked();
});
test('menu hit targets and column rails remain reachable in narrow viewports', async ({ page }) => {
    await start(page);
    const sizes=await page.locator('.pc-flat-menu').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().width));expect(Math.min(...sizes)).toBeGreaterThanOrEqual(44);
    const gap=await page.getByRole('menubar',{name:'Workspace menus'}).evaluate(el=>getComputedStyle(el).columnGap);expect(parseFloat(gap)).toBeGreaterThanOrEqual(4);
    await root(page,'Edit').click();
    const rowSizes=await menu(page,'Edit').locator('button').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));expect(Math.min(...rowSizes)).toBe(34);
    const rails=await menu(page,'Edit').locator('button').evaluateAll(items=>items.map(item=>[...item.children].map(child=>child.getBoundingClientRect().left)));
    expect(rails.every(row=>JSON.stringify(row)===JSON.stringify(rails[0]))).toBe(true);
    await page.setViewportSize({width:360,height:520}); await root(page,'Workflow').click();await menu(page,'Workflow').getByRole('menuitem',{name:'Memory recall',exact:true}).hover();
    for(const name of ['Workflow','Memory recall options']){const box=await menu(page,name).boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(360);expect(box.y+box.height).toBeLessThanOrEqual(520);}
    await menu(page,'Memory recall options').getByRole('menuitem',{name:'Memory recall overview…',exact:true}).focus(); await page.keyboard.press('Escape');await expect(menu(page,'Workflow').getByRole('menuitem',{name:'Memory recall',exact:true})).toBeFocused();await expect(menu(page,'Memory recall options')).toHaveCount(0);await page.keyboard.press('Escape');await expect(root(page,'Workflow')).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('checkbox choices and root toggle both reset hover, and Tab resumes outside the menu', async ({ page }) => {
    await start(page); await root(page,'View').click();await menu(page,'View').getByRole('menuitemcheckbox',{name:'Show node shelf',exact:true}).click();
    await root(page,'File').hover();await expect(page.getByRole('menu')).toHaveCount(0);
    await root(page,'File').click();await root(page,'File').click();await root(page,'Help').hover();await expect(page.getByRole('menu')).toHaveCount(0);
    await root(page,'File').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await page.evaluate(()=>document.activeElement.tagName!=='BODY' && !document.activeElement.closest('.pc-workspace-menus'))).toBe(true);
});
test('coarse pointers provide 44 pixel targets and all menu roots remain reachable', async ({ browser, baseURL }) => {
    const context=await browser.newContext({hasTouch:true,viewport:{width:360,height:640}});const page=await context.newPage();await page.goto(`${baseURL}/tests/browser/harness.html`);await page.waitForFunction(()=>!!window.canvasHarness);await page.evaluate(()=>window.canvasHarness.reset());
    await root(page,'Workflow').tap();const sizes=await menu(page,'Workflow').locator('button').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));expect(Math.min(...sizes)).toBeGreaterThanOrEqual(44);
    const targets=await page.locator('.pc-flat-menu').evaluateAll(items=>items.map(item=>({width:item.getBoundingClientRect().width,height:item.getBoundingClientRect().height,right:item.getBoundingClientRect().right,top:item.getBoundingClientRect().top})));expect(targets.every(item=>item.width>=44 && item.height>=44 && item.right<=360 && item.top===targets[0].top)).toBe(true);
    await menu(page,'Workflow').getByRole('menuitem',{name:'Memory recall',exact:true}).tap();await expect(menu(page,'Memory recall options')).toBeVisible();await context.close();
});

test('heading text gaps stay consistent and all six headings fit a narrow screen', async ({ page }) => {
    await start(page);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1440, 1024, 736, 360]) {
        await page.setViewportSize({ width, height: 640 });
        const labels = await page.locator('.pc-flat-menu').evaluateAll(items => items.map(item => {
            const range = document.createRange(); range.selectNodeContents(item);
            const label = range.getBoundingClientRect(), button = item.getBoundingClientRect();
            return { left: label.left, right: label.right, top: label.top, width: button.width, height: button.height };
        }));
        const gaps = labels.slice(1).map((label, index) => label.left - labels[index].right);
        expect(Math.max(...gaps) - Math.min(...gaps), `text gaps at ${width}px`).toBeLessThanOrEqual(2);
        expect(labels.every(label => label.top === labels[0].top && label.width >= 44 && label.height >= 34 && label.right <= width)).toBe(true);
        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(24);
    }
});

test('host keyboard styles cannot add badges or empty bars to any workspace dropdown', async ({ page }, testInfo) => {
    await start(page);
    await page.addStyleTag({ content: `kbd {
        display: inline-block; padding: 2px 4px; font-family: var(--monoFontFamily); white-space: nowrap;
        background-color: rgba(255, 255, 255, 0.9); color: #333; border: 1px solid #b4b4b4;
        border-radius: 3px; box-shadow: 0 1px 1px rgba(0, 0, 0, 0.2), 0 2px 0 0 rgba(255, 255, 255, 0.7) inset;
        font-size: 90%; line-height: 1;
    }` });
    let shortcutCount = 0;
    const checkShortcuts = async popup => {
        const shortcuts = await popup.locator('kbd').evaluateAll(items => items.map(item => {
            const style = getComputedStyle(item);
            return { text: item.textContent.trim(), background: style.backgroundColor, padding: style.padding,
                border: style.borderWidth, radius: style.borderRadius, shadow: style.boxShadow, fontSize: style.fontSize };
        }));
        shortcutCount += shortcuts.length;
        for (const shortcut of shortcuts) {
            expect(shortcut.background).toBe('rgba(0, 0, 0, 0)');
            expect(shortcut).toEqual({ text: shortcut.text, background: 'rgba(0, 0, 0, 0)', padding: '0px',
                border: '0px', radius: '0px', shadow: 'none', fontSize: '11px' });
            expect(shortcut.text.length).toBeGreaterThan(0);
        }
        const rows = await popup.locator('.pc-workspace-menu-item').evaluateAll(items => items.map(item => ({
            height: item.getBoundingClientRect().height, reason:!!item.querySelector('.pc-workspace-menu-label small'), rails: [...item.children].map(child => child.getBoundingClientRect().left),
        })));
        expect(rows.every(row => (row.reason ? row.height >= 34 : row.height === 34) && JSON.stringify(row.rails) === JSON.stringify(rows[0].rails))).toBe(true);
    };
    for (const name of ['File', 'Edit', 'View', 'Graph', 'Workflow', 'Help']) {
        await root(page, name).click();
        await checkShortcuts(menu(page, name));
        if (name === 'File' || name === 'View') await page.screenshot({ path: testInfo.outputPath(`${name.toLowerCase()}-desktop.png`) });
        if (name === 'Workflow') {
            await menu(page, name).getByRole('menuitem', { name: 'Memory recall', exact: true }).hover();
            await checkShortcuts(menu(page, 'Memory recall options'));
            await page.keyboard.press('Escape');
        }
        await page.keyboard.press('Escape');
    }
    expect(shortcutCount).toBeGreaterThan(0);
    await page.setViewportSize({ width: 360, height: 640 });
    await root(page, 'View').click(); await checkShortcuts(menu(page, 'View'));
    await page.screenshot({ path: testInfo.outputPath('view-narrow.png') });
});

test('dropdown icons use selective reference colors with readable theme and disabled states', async ({ page }, testInfo) => {
    await start(page);
    await page.evaluate(async () => {
        const h = window.canvasHarness; h.canvas.select({ kind: 'node', id: Object.keys(h.graph.nodes)[0] }); await h.settle();
    });
    const paint = async (name, command) => {
        const row = menu(page, name).locator(`[data-command="${command}"]`);
        if (!(await row.isDisabled())) await row.hover();
        return row.evaluate(async row => {
        const read = selector => getComputedStyle(row.querySelector(selector)).color;
        const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
        // Resolve and composite modern CSS color-mix onto the real popup surface.
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = getComputedStyle(row.closest('[role="menu"]')).backgroundColor; ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = getComputedStyle(row).backgroundColor; ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data, surface = { r, g, b };
        return { icon: read('.pc-workspace-menu-icon'), label: read('.pc-workspace-menu-label'),
            caret: read('.pc-workspace-menu-caret'), opacity: getComputedStyle(row).opacity, disabled: row.disabled,
            contrast: T.contrast(T.parseColor(read('.pc-workspace-menu-icon')), surface) };
        });
    };
    for (const preset of ['ember', 'lattice', 'ash', 'graphite', 'slate', 'obsidian', 'harbor', 'signal', 'light', 'mid-gray', 'hover-gray']) {
        await page.evaluate(async preset => {
            const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
            T.setPreset('ember');
            if (preset === 'light' || preset === 'mid-gray' || preset === 'hover-gray') T.setColor('panel', preset === 'light' ? '#f5f5f1' : preset === 'mid-gray' ? '#777777' : '#4a4a4a'); else T.setPreset(preset);
            await h.settle();
        }, preset);
        await root(page, 'File').click();
        const create = await paint('File', 'new'), save = await paint('File', 'save'), open = await paint('File', 'open-workflow');
        if (preset === 'signal') expect(create.icon).toBe(create.label);
        else { expect(create.icon).not.toBe(open.icon); expect(save.icon).not.toBe(create.icon); }
        for (const icon of [create, save]) expect(icon.contrast).toBeGreaterThanOrEqual(3);
        expect(save.label).toBe(open.label); expect(save.caret).toBe(open.caret);
        await page.keyboard.press('Escape');
        await root(page, 'Workflow').click();
        const validate = await paint('Workflow', 'validate-workflow'), recall = await paint('Workflow', 'memory-recall-menu'), stop = await paint('Workflow', 'stop-workflow');
        if (preset !== 'signal') { expect(validate.icon).not.toBe(save.icon); expect(recall.icon).not.toBe(validate.icon); expect(stop.icon).not.toBe(recall.icon); }
        for (const icon of [validate, recall]) expect(icon.contrast).toBeGreaterThanOrEqual(3);
        expect(stop.disabled).toBe(true); expect(Number(stop.opacity)).toBeLessThan(0.5);
        await menu(page, 'Workflow').getByRole('menuitem', { name: 'Memory recall', exact: true }).hover();
        const overview = await paint('Memory recall options', 'memory-recall');
        if (preset !== 'signal') expect(overview.icon).toBe(recall.icon);
        expect(overview.contrast).toBeGreaterThanOrEqual(3);
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
        await root(page, 'View').click();
        const reset = await paint('View', 'reset-layout'), theme = await paint('View', 'theme');
        if (preset !== 'signal') { expect(reset.icon).not.toBe(save.icon); expect(theme.icon).toBe(recall.icon); }
        const contrast = await page.evaluate(async () => {
            const h = window.canvasHarness, T = await import('/src/theme.js?v=' + h.version);
            const panel = document.querySelector('.pc-workspace-menu-panel'), surface = T.parseColor(getComputedStyle(panel).backgroundColor);
            return [...panel.querySelectorAll('.pc-workspace-menu-item:enabled .pc-workspace-menu-icon[data-icon-tone]')]
                .map(icon => T.contrast(T.parseColor(getComputedStyle(icon).color), surface));
        });
        expect(contrast.length).toBeGreaterThan(0); expect(Math.min(...contrast)).toBeGreaterThanOrEqual(3);
        await page.screenshot({ path: testInfo.outputPath(`${preset}-icons.png`) });
        await page.keyboard.press('Escape');
        await root(page, 'Edit').click();
        const deletion = await paint('Edit', 'delete-selection'), copy = await paint('Edit', 'copy');
        expect(deletion.disabled).toBe(false); expect(deletion.contrast).toBeGreaterThanOrEqual(3);
        if (preset !== 'signal') expect(deletion.icon).not.toBe(copy.icon);
        await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => window.canvasHarness.providerCalls())).toBe(0);
});

test('keyboard navigation scrolls focused rows inside a short popup viewport', async ({ page }) => {
    await start(page); await page.setViewportSize({width:360,height:300});
    await root(page,'Graph').focus();await page.keyboard.press('ArrowDown');
    const popup=menu(page,'Graph');
    const visibleFocus=async()=>{
        const bounds=await popup.evaluate(element=>{const row=document.activeElement,box=row.getBoundingClientRect(),panel=element.getBoundingClientRect();return{top:box.top,bottom:box.bottom,visibleTop:panel.top+element.clientTop,visibleBottom:panel.top+element.clientTop+element.clientHeight};});
        expect(bounds.top).toBeGreaterThanOrEqual(bounds.visibleTop);expect(bounds.bottom).toBeLessThanOrEqual(bounds.visibleBottom);
    };
    await page.keyboard.press('End');await expect(popup.getByRole('menuitemradio',{name:'Pan tool',exact:true})).toBeFocused();await visibleFocus();
    await page.keyboard.press('Home');await expect(popup.getByRole('menuitem',{name:'Add node…',exact:true})).toBeFocused();await visibleFocus();
    await page.keyboard.press('p');await expect(popup.getByRole('menuitemradio',{name:'Pan tool',exact:true})).toBeFocused();await visibleFocus();
    await page.keyboard.press('ArrowDown');await expect(popup.getByRole('menuitem',{name:'Add node…',exact:true})).toBeFocused();await visibleFocus();
});
test('closed menubar permits history and paste accelerators after a selection command', async ({ page }) => {
    await start(page);
    const original=await page.evaluate(async()=>{const h=window.canvasHarness;h.canvas.select({kind:'node',id:Object.keys(h.graph.nodes)[0]});await h.settle();return Object.keys(h.graph.nodes).length;});
    await root(page,'Edit').click();await menu(page,'Edit').getByRole('menuitem',{name:'Duplicate selection',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes).length)).toBe(original+1);
    await expect(root(page,'Edit')).toBeFocused();await expect(page.getByRole('menu')).toHaveCount(0);
    await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes).length)).toBe(original);
    await expect(root(page,'Edit')).toBeFocused();await root(page,'View').hover();await expect(page.getByRole('menu')).toHaveCount(0);
    await page.keyboard.press('Control+Shift+z');await expect.poll(()=>page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes).length)).toBe(original+1);
    await page.evaluate(()=>{const transfer=new DataTransfer();transfer.setData('text/plain','Paste after a closed menu');document.activeElement.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:transfer}));});
    await expect.poll(()=>page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes).length)).toBe(original+2);
    await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>Object.keys(window.canvasHarness.graph.nodes).length)).toBe(original+1);
    await root(page,'Graph').hover();await expect(page.getByRole('menu')).toHaveCount(0);
});
