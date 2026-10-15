import {test,expect} from '@playwright/test';

test('oversized causal node identity keeps exact paint and never reveals an existing prefix',async({page})=>{
 const prefix='n'.repeat(256),target=prefix+'x';
 await page.goto('/tests/browser/harness.html');await page.waitForFunction(()=>!!window.canvasHarness);
 await page.evaluate(async({prefix,target})=>{
  const h=window.canvasHarness,node=(id,x)=>({id,type:'workflow',operation:'json-decode',x,y:100,w:260});
  await h.activate({id:'exact-diagnostic-identity',name:'Exact cause',schema:3,runtime:2,mode:'native-unified',runTargets:[],nodes:{[prefix]:node(prefix,100),[target]:node(target,500)},wires:{},definitions:{},portals:{},groups:{}});
  await h.view({x:100,y:40,zoom:1});
 },{prefix,target});
 const card=page.locator(`.pc-node[data-id="${target}"]`),decoy=page.locator(`.pc-node[data-id="${prefix}"]`);
 await card.locator('.pc-native-heading').click({button:'right'});await page.getByRole('menuitem',{name:'Run to here',exact:true}).click();
 await expect(card).toHaveClass(/pc-run-failed/);await expect(decoy).not.toHaveClass(/pc-run-failed|pc-trace-failed/);
 await expect(card.locator('.pc-pin-run-failed')).toHaveCount(1);
 await expect(page.locator('.pc-output-preview .pc-diagnostic[data-severity="error"]')).toHaveCount(1);
 await expect(page.locator('.pc-output-preview').getByRole('button',{name:'Show node',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>window.canvasHarness.providerCalls())).toBe(0);
});
