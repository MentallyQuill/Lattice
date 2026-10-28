import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {installServerFilePlugin} from '../install-server-plugin.mjs';
const execute=promisify(execFile);
async function selectFolder(){
 const options={windowsHide:true,timeout:120000,maxBuffer:8192};
 try{
  let result;
  if(process.platform==='win32')result=await execute('powershell.exe',['-NoProfile','-STA','-Command','Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description = "Choose the SillyTavern folder containing server.js"; if ($picker.ShowDialog() -eq "OK") { [Console]::Write($picker.SelectedPath) }'],options);
  else if(process.platform==='darwin')result=await execute('osascript',['-e','POSIX path of (choose folder with prompt "Choose the SillyTavern folder containing server.js")'],options);
  else result=await execute('zenity',['--file-selection','--directory','--title=Choose the SillyTavern folder containing server.js'],options);
  return result.stdout.trim();
 }catch{throw Error('Folder selection was cancelled or is unavailable. Paste the SillyTavern folder path instead.');}
}
function openPage(url){
 const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
 const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
 const child=spawn(command,args,{shell:false,windowsHide:true,stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();
}
/** No browser launch or host mutation occurs merely by importing this module. */
export async function startSetupServer({openBrowser=true}={}){
 const token=randomBytes(32).toString('hex'),page=await readFile(new URL('./setup.html',import.meta.url));let origin='',busy=false;
 const server=createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  if(req.headers.host!==origin.slice(7)||req.headers.origin&&req.headers.origin!==origin)return reply(403,{ok:false,error:'Use the local setup window.'});
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});return res.end(page);}
  const received=Buffer.from(req.headers.authorization??''),expected=Buffer.from('Bearer '+token);
  if(req.method!=='POST'||received.length!==expected.length||!timingSafeEqual(received,expected))return reply(403,{ok:false,error:'Open the setup link printed by the launcher.'});
  if(req.headers['content-type']!=='application/json')return reply(415,{ok:false,error:'Use JSON setup requests.'});
  try{
   let bytes=0,text='';for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)return reply(413,{ok:false,error:'Setup request too large.'});text+=chunk;}
   const body=JSON.parse(text||'{}');
   if(req.url==='/select-folder')return reply(200,{ok:true,data:{path:await selectFolder()}});
   if(req.url==='/close'){reply(200,{ok:true});server.close();return;}
   if(req.url!=='/install')return reply(404,{ok:false,error:'Unknown setup action.'});
   if(busy)return reply(409,{ok:false,error:'Setup is already running.'});
   if(typeof body.sillyTavernPath!=='string'||typeof body.enableServerPlugins!=='boolean')return reply(400,{ok:false,error:'Choose a SillyTavern folder and confirm the server setting choice.'});
   busy=true;try{const data=await installServerFilePlugin({sillyTavernPath:body.sillyTavernPath,enableServerPlugins:body.enableServerPlugins});reply(200,{ok:true,data});}finally{busy=false;}
  }catch(error){reply(400,{ok:false,error:error.message});}
 });
 await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
 const address=server.address();origin='http://127.0.0.1:'+address.port;const url=origin+'/#'+token;
 const timer=setTimeout(()=>server.close(),15*60*1000);timer.unref();server.on('close',()=>clearTimeout(timer));
 if(openBrowser)openPage(url);
 return {url,token,address,close:()=>new Promise((accept,reject)=>{server.closeAllConnections();server.close(error=>error?reject(error):accept());})};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{const setup=await startSetupServer();console.log('Open this link on the computer running setup:\n'+setup.url+'\nSetup closes after 15 minutes. Press Ctrl+C to stop.');}catch(error){console.error(error.message);process.exitCode=1;}
}
