import assert from 'node:assert/strict';
import test from 'node:test';
import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

test('extension checkout fits a 157-character Windows install root without long-path configuration',async()=>{
    const root=fileURLToPath(new URL('../',import.meta.url));
    const localOnly=new Set(['.git','node_modules','.tmp','.superpowers','.codex-remote-attachments','test-results','playwright-report','benchmark-results','work']);
    const tooLong=[];
    async function inspect(directory,prefix=''){
        for(const item of await readdir(directory,{withFileTypes:true})){
            if(localOnly.has(item.name))continue;
            const relative=prefix+item.name;
            if(item.isDirectory())await inspect(join(directory,item.name),relative+'/');
            else if(157+1+relative.length>259)tooLong.push(relative);
        }
    }
    await inspect(root);
    assert.deepEqual(tooLong,[],'Shorten repository paths so ordinary Windows Git checkout needs no global core.longpaths setting.');
});
