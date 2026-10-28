import {createHostFileFixture} from '../helpers/host-file-fixture.mjs';

/** Exercise host byte acknowledgement while keeping every fixture file in memory. */
export async function installHostFileRoutes(page) {
    const host=createHostFileFixture();
    await page.route(/\/(?:user\/files\/[^/?]+|api\/files\/(?:upload|delete)|api\/plugins\/lattice-files\/status)(?:\?.*)?$/,async route=>{
        const request=route.request(),response=await host.fetch(new URL(request.url()).pathname,{method:request.method(),body:request.postData()});
        await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
    });
    await page.route('**/api/chats/get',async route=>{
        const saved=await page.evaluate(()=>window.workflowSavedMetadataChat);
        if(!saved||route.request().method()!=='POST')return route.fulfill({status:404,body:''});
        if(JSON.stringify(route.request().postDataJSON())!==JSON.stringify(saved.request))return route.fulfill({status:400,body:'Wrong saved chat scope'});
        return route.fulfill({json:saved.chat});
    });
    return host;
}

/** Authoring metadata saves remain separate from reviewed reply saveChat counts. */
export async function configureWorkflowSelectionPersistence(page,{chatId}) {
    await page.evaluate(({chatId})=>{
        const c=window.canvasHarness.context;
        c.chatId=chatId;c.characterId??=0;c.groupId??=null;c.characters??=[];
        const previous=c.characters[c.characterId]??{};
        c.characters[c.characterId]={...previous,avatar:previous.avatar??'workflow-fixture.png',name:previous.name??c.name2,chat:chatId};
        c.getRequestHeaders=()=>({'Content-Type':'application/json'});
        c.saveMetadata=async()=>{
            const character=c.characters[c.characterId];
            window.workflowSavedMetadataChat={request:{ch_name:character.name,file_name:character.chat,avatar_url:character.avatar},chat:[{chat_metadata:structuredClone(c.chatMetadata)},...structuredClone(c.chat)]};
        };
    },{chatId});
}
