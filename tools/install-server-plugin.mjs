import fs from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {runtimeFiles,safeDestination,digest} from './server-setup/runtime-bundle.mjs';
const marker='// Installed by Lattice file service installer.\n';
async function pluginSlot(host,value){
 const pluginsRoot=resolve(host,'plugins'),target=resolve(value);
 if(dirname(target)!==pluginsRoot||!/^lattice-files$|^\.lattice-files-(?:stage|previous)-[a-f0-9-]+$/.test(target.slice(pluginsRoot.length+1)))throw Error('Unsafe plugin staging path.');
 return safeDestination(host,target);
}
async function removePluginSlot(host,value){await fs.rm(await pluginSlot(host,value),{recursive:true,force:true});}
async function writeConfigurationCopy(host,value,text,metadata={mode:0o600}){
 const target=await safeDestination(host,value);
 // Never expose a new copy through the destination directory's initial group or umask.
 await fs.writeFile(target,text,{flag:'wx',mode:0o600});
 if(process.platform!=='win32'){
  const created=await fs.stat(target),hasOwner=Number.isInteger(metadata.uid)&&Number.isInteger(metadata.gid);
  if(hasOwner&&(created.uid!==metadata.uid||created.gid!==metadata.gid))await fs.chown(target,metadata.uid,metadata.gid);
  await fs.chmod(target,metadata.mode&0o777);
  const verified=await fs.stat(target);
  if((verified.mode&0o777)!==(metadata.mode&0o777)||hasOwner&&(verified.uid!==metadata.uid||verified.gid!==metadata.gid))throw Error('The configuration copy could not retain its original permissions and ownership.');
 }
}
function configFlag(text){
 const lines=text.split(/\r?\n/),candidates=lines.filter(line=>/^\s*["']?enableServerPlugins["']?\s*:/.test(line));
 if(candidates.length>1||candidates.some(line=>!/^enableServerPlugins:\s*(true|false)\s*(?:#.*)?$/.test(line))||/^(?:---|\.\.\.)\s*$/m.test(text)||/^\s*<<\s*:/m.test(text)||/^\s*[{[]/.test(text))throw Error('The config enableServerPlugins setting is ambiguous. Ask the host owner to set one top-level boolean value.');
 return {enabled:candidates.length===1&&/^enableServerPlugins:\s*true\b/.test(candidates[0]),line:candidates[0],lineIndex:lines.indexOf(candidates[0])};
}
/** Install a stable local runtime. Only the explicit enableServerPlugins option edits config. */
export async function installServerFilePlugin({sillyTavernPath,extensionPath=fileURLToPath(new URL('../',import.meta.url)),enableServerPlugins=false}){
 if(typeof sillyTavernPath!=='string'||!sillyTavernPath.trim()||/[\0\r\n]/.test(sillyTavernPath))throw Error('Specify the SillyTavern installation folder.');
 const host=await fs.realpath(resolve(sillyTavernPath));
 const server=await safeDestination(host,'server.js');if(!(await fs.stat(server)).isFile())throw Error('Choose the SillyTavern folder containing server.js.');
 const configPath=await safeDestination(host,'config.yaml');
 const configuration=await fs.readFile(configPath,'utf8'),flag=configFlag(configuration),configMetadata=await fs.stat(configPath);
 const pluginDirectory=await safeDestination(host,join('plugins','lattice-files')),destination=await safeDestination(host,join('plugins','lattice-files','index.mjs'));
 let previousEntry=null;
 try{previousEntry=await fs.readFile(destination,'utf8');if(!previousEntry.startsWith(marker))throw Error('An existing lattice-files plugin was not installed by this installer; preserve it and resolve the location before continuing.');}catch(error){if(error.code!=='ENOENT')throw error;}
 try{await fs.access(pluginDirectory);await fs.access(destination);}catch(error){if(error.code!=='ENOENT')throw error;try{if((await fs.readdir(pluginDirectory)).length)throw Error('An existing unmanaged plugin directory must be preserved.');}catch(problem){if(problem.code!=='ENOENT')throw problem;}}
 const files=await runtimeFiles(extensionPath);
 let manifest;try{manifest=JSON.parse(await fs.readFile(join(extensionPath,'setup-manifest.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(manifest&&(manifest.schemaVersion!==1||Object.keys(manifest.files??{}).length!==files.size||[...files].some(([name,bytes])=>manifest.files[name]!==digest(bytes))))throw Error('Setup source verification failed. Download and extract a fresh setup bundle.');
 const token=randomUUID(),stage=await pluginSlot(host,join(host,'plugins','.lattice-files-stage-'+token)),previous=await pluginSlot(host,join(host,'plugins','.lattice-files-previous-'+token));
 const configTemporary=await safeDestination(host,'config.yaml.lattice-pending-'+token);
 let configBackup=null,enabled=flag.enabled,updated=configuration,movedPrevious=false,published=false,configPublished=false,completed=false;
 if(enableServerPlugins===true&&!enabled){
  const newline=configuration.includes('\r\n')?'\r\n':'\n',lines=configuration.split('\n');
  if(flag.line)lines[flag.lineIndex]=lines[flag.lineIndex].replace(/false\b/,'true');
  updated=flag.line?lines.join('\n'):configuration+(configuration.endsWith('\n')?'':newline)+'enableServerPlugins: true'+newline;
  if(!configFlag(updated).enabled)throw Error('The active server plugin setting could not be enabled.');
 }
 try{
  await fs.mkdir(dirname(stage),{recursive:true});await fs.mkdir(await pluginSlot(host,stage));
  for(const [name,bytes] of files){const target=await safeDestination(stage,join('runtime',name));await fs.mkdir(dirname(target),{recursive:true});await fs.writeFile(target,bytes);if(digest(await fs.readFile(target))!==digest(bytes))throw Error('Installed runtime verification failed.');}
  await fs.writeFile(join(stage,'package.json'),JSON.stringify({type:'module',private:true})+'\n');
  await fs.writeFile(join(stage,'index.mjs'),marker+'export {info,init} from "./runtime/server-plugin/index.mjs";\n');
  const verified=await import(pathToFileURL(join(stage,'index.mjs')).href);
  if(verified.info?.id!=='lattice-files'||typeof verified.init!=='function')throw Error('Installed component verification failed.');
  if(await fs.readFile(configPath,'utf8')!==configuration)throw Error('The config changed during setup. Retry after the host owner finishes editing it.');
  if(updated!==configuration){
   configBackup=await safeDestination(host,'config.yaml.lattice-backup-'+token);await writeConfigurationCopy(host,configBackup,configuration,configMetadata);
   await writeConfigurationCopy(host,configTemporary,updated,configMetadata);
  }
  let currentEntry=null;try{currentEntry=await fs.readFile(await safeDestination(host,destination),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(currentEntry!==previousEntry)throw Error('The installed plugin changed during setup. Retry after the host owner finishes updating it.');
  try{await fs.rename(await pluginSlot(host,pluginDirectory),await pluginSlot(host,previous));movedPrevious=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.rename(await pluginSlot(host,stage),await pluginSlot(host,pluginDirectory));published=true;
  if(updated!==configuration){await fs.rename(await safeDestination(host,configTemporary),await safeDestination(host,configPath));configPublished=true;enabled=configFlag(await fs.readFile(configPath,'utf8')).enabled;if(!enabled)throw Error('The active server plugin setting was not saved.');}
  completed=true;
 }catch(error){
  try{
   if(published){await fs.rename(await pluginSlot(host,pluginDirectory),await pluginSlot(host,stage));published=false;}
   if(movedPrevious){await fs.rename(await pluginSlot(host,previous),await pluginSlot(host,pluginDirectory));movedPrevious=false;}
   if(configPublished&&await fs.readFile(configPath,'utf8')===updated){await writeConfigurationCopy(host,configTemporary,configuration,configMetadata);await fs.rename(await safeDestination(host,configTemporary),await safeDestination(host,configPath));}
  }catch(rollback){throw new AggregateError([error,rollback],'Setup failed; preserve the previous plugin at '+previous+' and configuration backup '+configBackup+' for host-owner recovery.');}
  throw error;
 }finally{
  // These resolved absolute slots must remain direct children of this host's plugins folder.
  try{await removePluginSlot(host,stage);}catch{}
  if(completed&&movedPrevious)try{await removePluginSlot(host,previous);}catch{}
  try{await fs.unlink(await safeDestination(host,configTemporary));}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return {pluginDirectory,entry:join(pluginDirectory,'runtime','server-plugin','index.mjs'),enabled,configBackup,requiresRestart:true,verified:true};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{const args=process.argv.slice(2),enabled=args.includes('--enable-server-plugins'),filtered=args.filter(value=>value!=='--enable-server-plugins');if(filtered.length!==2||filtered[0]!=='--sillytavern')throw Error('Usage: node tools/install-server-plugin.mjs --sillytavern "PATH" [--enable-server-plugins]');const result=await installServerFilePlugin({sillyTavernPath:filtered[1],enableServerPlugins:enabled});console.log('Lattice file support installed and verified at '+result.pluginDirectory);if(result.configBackup)console.log('Configuration backup: '+result.configBackup);if(!result.enabled)console.log('The host owner must explicitly set enableServerPlugins: true in config.yaml.');console.log('Restart SillyTavern, then return to File storage and check again.');}catch(error){console.error(error.message);process.exitCode=1;}
}
