import {test,expect} from '@playwright/test';

const panel=page=>page.getByRole('region',{name:'Node details',exact:true});
test('reasoning edits persist Custom text across efforts, Undo, and active provider refreshes',async({page},testInfo)=>{
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async()=>{
  const h=window.canvasHarness,c=h.context;
  c.mainApi='openai';c.chatCompletionSettings.chat_completion_source='openai';c.chatCompletionSettings.current_model='gpt-5';
  c.getChatCompletionModel=settings=>settings.current_model;
  c.CONNECT_API_MAP={openai:{selected:'openai',source:'openai',label:'OpenAI'},claude:{selected:'openai',source:'claude',label:'OpenAI'}};
  const {operationDefaults}=await import('/src/workflow/catalog.js?v='+h.version);
  await h.activate({id:'reasoning-browser',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{call:{...operationDefaults('model-call'),id:'call',type:'workflow',x:200,y:100}},wires:{},definitions:{},groups:{},portals:{}});
  h.canvas.select({kind:'node',id:'call'});await h.settle();
 });
 const details=panel(page);await details.locator('[data-control-group="Limits & retries"]>summary').click();
 const effort=details.getByRole('combobox',{name:'Reasoning',exact:true});await expect(effort).toHaveValue('none');
 await expect(effort.locator('option[value="minimal"]')).toHaveCount(1);
 await effort.selectOption('custom');const custom=details.getByRole('textbox',{name:'Custom reasoning',exact:true});
 await expect(custom).toHaveAttribute('type','text');await custom.fill('future/value');await custom.press('Tab');
 await expect.poll(()=>page.evaluate(()=>window.canvasHarness.graph.nodes.call.reasoningCustom)).toBe('future/value');
 await effort.selectOption('high');await expect(custom).toHaveCount(0);
 await effort.selectOption('custom');await expect(custom).toHaveValue('future/value');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(effort).toHaveValue('high');
 await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(effort).toHaveValue('custom');await expect(custom).toHaveValue('future/value');
 await page.evaluate(async()=>{const c=window.canvasHarness.context;c.chatCompletionSettings.chat_completion_source='claude';c.chatCompletionSettings.current_model='claude-sonnet-4-6';await c.eventSource.emit(c.eventTypes.CHATCOMPLETION_MODEL_CHANGED);});
 await expect(effort.locator('option[value="enabled"]')).toHaveCount(1);await expect(effort.locator('option[value="minimal"]')).toHaveCount(0);
 await expect(effort).toHaveValue('custom');await expect(custom).toHaveValue('future/value');
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
 await page.screenshot({path:testInfo.outputPath('reasoning-controls.png')});
});
