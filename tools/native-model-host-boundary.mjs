import {createServer} from 'node:net';

export async function assertLoopbackPortFree(host){
    const url=new URL(host);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||!url.port)throw Error('Use a plain HTTP loopback test host.');
    await new Promise((resolve,reject)=>{
        const probe=createServer();
        probe.once('error',error=>reject(Error(error.code==='EADDRINUSE'?'Native test port is occupied; refusing to use an existing server.':'Cannot reserve native test port.')));
        probe.listen({host:url.hostname,port:Number(url.port),exclusive:true},()=>probe.close(error=>error?reject(error):resolve()));
    });
}

export function waitForOwnedNativeHost(child,host,timeoutMs=90000){
    const marker='SillyTavern is listening on IPv4: '+new URL(host).host;
    return new Promise((resolve,reject)=>{
        let output='';
        const finish=error=>{clearTimeout(timer);child.stdout.off('data',onData);child.off('exit',onExit);child.off('error',onError);error?reject(error):resolve();};
        const onData=chunk=>{output=(output+chunk.toString()).slice(-8192).replace(/\u001b\[[0-9;]*m/g,'');if(output.includes(marker))finish();};
        const onExit=()=>finish(Error('Owned native test server exited before readiness.'));
        const onError=()=>finish(Error('Owned native test server could not start.'));
        const timer=setTimeout(()=>finish(Error('Owned native test server readiness timed out.')),timeoutMs);
        child.stdout.on('data',onData);child.once('exit',onExit);child.once('error',onError);
        if(child.exitCode!==null||child.signalCode!==null)onExit();
    });
}

const localAPI=new Set([
    'GET /api/extensions/discover','GET /api/users/me',
    'POST /api/settings/get','POST /api/settings/save','POST /api/ping',
    'POST /api/secrets/read','POST /api/secrets/settings',
    'POST /api/characters/all','POST /api/characters/get','POST /api/characters/import',
    'POST /api/characters/edit','POST /api/groups/all',
    'POST /api/chats/get','POST /api/chats/save','POST /api/chats/search',
    'POST /api/avatars/get','POST /api/backgrounds/all','POST /api/worldinfo/get',
    'POST /api/backgrounds/folders','POST /api/image-metadata/all',
    'POST /api/presets/get','POST /api/stats/get','POST /api/files/sanitize-filename',
]);
export function allowNativeLocalRequest({url,method},host){
    let target;try{target=new URL(url);}catch{return false;}
    if(target.origin!==new URL(host).origin||target.username||target.password)return false;
    const path=target.pathname;
    if(path.startsWith('/api/')){
        if(!target.search&&localAPI.has(method+' '+path))return true;
        if(method!=='POST')return false;
        const tokenizer=/^\/api\/tokenizers\/(gpt2|openai|llama|nerdstash|nerdstash_v2|mistral|yi|claude|llama3|gemma|jamba|qwen2|command-r|command-a|nemo|deepseek)\/(count|encode|decode)$/;
        if(!tokenizer.test(path))return false;
        const parameters=[...target.searchParams];
        return !target.search||path.startsWith('/api/tokenizers/openai/')&&parameters.length===1&&parameters[0][0]==='model'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(parameters[0][1]);
    }
    if(method!=='GET')return false;
    if(['/','/version','/csrf-token','/thumbnail'].includes(path))return true;
    return /^\/(?:scripts|lib|css|img|fonts|webfonts|sounds|locales|dist|characters|backgrounds|User%20Avatars)\//.test(path)&&/\.(js|mjs|css|html|json|png|jpg|jpeg|svg|ico|gif|webp|woff2?|ttf|wasm|mp3|ogg|wav)$/i.test(path)||['/script.js','/lib.js','/style.css','/manifest.json','/favicon.ico'].includes(path);
}

export function readReplayCompletion(document,index=0){
    const rows=Array.isArray(document)?document:document?.attempts;
    const record=Number.isSafeInteger(index)&&index>=0&&Array.isArray(rows)?rows[index]:null;
    if(!record||record.outcome!=='complete'||record.finish!=='stop'||typeof record.output!=='string'||!record.output.trim()||record.output.length>100000)throw Error('Select a complete captured replay response.');
    return record;
}
