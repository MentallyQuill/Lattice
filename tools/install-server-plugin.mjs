import * as fs from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {runtimeFiles,safeDestination,digest} from './server-setup/runtime-bundle.mjs';
const marker='// Installed by Lattice file service installer.\n';
function configFlag(text){
 const candidates=text.split(/\r?\n/).filter(line=>/^\s*["']?enableServerPlugins["']?\s*:/.test(line));
 if(candidates.length>1||candidates.some(line=>!/^enableServerPlugins:\s*(true|false)\s*(?:#.*)?$/.test(line))||/^(?:---|\.\.\.)\s*$/m.test(text)||/^\s*<<\s*:/m.test(text)||/^\s*[{[]/.test(text))throw Error('The config enableServerPlugins setting is ambiguous. Ask the host owner to set one top-level boolean value.');
 return {enabled:candidates.length===1&&/^enableServerPlugins:\s*true\b/.test(candidates[0]),line:candidates[0]};
}
/** Install a stable local runtime. Only the explicit enableServerPlugins option edits config. */
export async function installServerFilePlugin({sillyTavernPath,extensionPath=fileURLToPath(new URL('../',import.meta.url)),enableServerPlugins=false}){
 if(typeof sillyTavernPath!=='string'||!sillyTavernPath.trim()||/[\0\r\n]/.test(sillyTavernPath))throw Error('Specify the SillyTavern installation folder.');
 const host=await fs.realpath(resolve(sillyTavernPath));
 const server=await safeDestination(host,'server.js');if(!(await fs.stat(server)).isFile())throw Error('Choose the SillyTavern folder containing server.js.');
 const configPath=await safeDestination(host,'config.yaml');
 const configuration=await fs.readFile(configPath,'utf8'),flag=configFlag(configuration);
 const pluginDirectory=await safeDestination(host,join('plugins','lattice-files')),destination=await safeDestination(host,join('plugins','lattice-files','index.mjs'));
 try{if(!(await fs.readFile(destination,'utf8')).startsWith(marker))throw Error('An existing lattice-files plugin was not installed by this installer; preserve it and resolve the location before continuing.');}catch(error){if(error.code!=='ENOENT')throw error;}
 try{await fs.access(pluginDirectory);await fs.access(destination);}catch(error){if(error.code!=='ENOENT')throw error;try{if((await fs.readdir(pluginDirectory)).length)throw Error('An existing unmanaged plugin directory must be preserved.');}catch(problem){if(problem.code!=='ENOENT')throw problem;}}
 const files=await runtimeFiles(extensionPath);
 let manifest;try{manifest=JSON.parse(await fs.readFile(join(extensionPath,'setup-manifest.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(manifest&&(manifest.schemaVersion!==1||Object.keys(manifest.files??{}).length!==files.size||[...files].some(([name,bytes])=>manifest.files[name]!==digest(bytes))))throw Error('Setup source verification failed. Download and extract a fresh setup bundle.');
 for(const name of files.keys())await safeDestination(host,join('plugins','lattice-files','runtime',name));
 await fs.mkdir(pluginDirectory,{recursive:true});
 for(const [name,bytes] of files){const target=await safeDestination(host,join('plugins','lattice-files','runtime',name));await fs.mkdir(resolve(target,'..'),{recursive:true});await fs.writeFile(target,bytes);if(digest(await fs.readFile(target))!==digest(bytes))throw Error('Installed runtime verification failed.');}
 const packagePath=await safeDestination(host,join('plugins','lattice-files','package.json'));await fs.writeFile(packagePath,JSON.stringify({type:'module',private:true})+'\n');
 const entry=join(pluginDirectory,'runtime','server-plugin','index.mjs');const verified=await import(pathToFileURL(entry).href+'?setup='+randomUUID());
 if(verified.info?.id!=='lattice-files'||typeof verified.init!=='function')throw Error('Installed component verification failed.');
 await fs.writeFile(destination,marker+'export {info,init} from "./runtime/server-plugin/index.mjs";\n');
 let configBackup=null,enabled=flag.enabled;
 if(enableServerPlugins===true&&!enabled){
  if(await fs.readFile(configPath,'utf8')!==configuration)throw Error('The config changed during setup. Retry after the host owner finishes editing it.');
  configBackup=join(host,'config.yaml.lattice-backup-'+randomUUID());await fs.writeFile(configBackup,configuration,{flag:'wx'});
  const newline=configuration.includes('\r\n')?'\r\n':'\n',updated=flag.line?configuration.replace(flag.line,flag.line.replace(/false\b/,'true')):configuration+(configuration.endsWith('\n')?'':newline)+'enableServerPlugins: true'+newline;
  await fs.writeFile(configPath,updated);enabled=true;
 }
 return {pluginDirectory,entry,enabled,configBackup,requiresRestart:true,verified:true};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{const args=process.argv.slice(2),enabled=args.includes('--enable-server-plugins'),filtered=args.filter(value=>value!=='--enable-server-plugins');if(filtered.length!==2||filtered[0]!=='--sillytavern')throw Error('Usage: node tools/install-server-plugin.mjs --sillytavern "PATH" [--enable-server-plugins]');const result=await installServerFilePlugin({sillyTavernPath:filtered[1],enableServerPlugins:enabled});console.log('Lattice file support installed and verified at '+result.pluginDirectory);if(result.configBackup)console.log('Configuration backup: '+result.configBackup);if(!result.enabled)console.log('The host owner must explicitly set enableServerPlugins: true in config.yaml.');console.log('Restart SillyTavern, then return to File storage and check again.');}catch(error){console.error(error.message);process.exitCode=1;}
}
