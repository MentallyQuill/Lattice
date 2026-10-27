import {access,mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const marker='// Installed by Lattice file service installer.\n';
/** Register the component from this extension; never alter server security settings implicitly. */
export async function installServerFilePlugin({sillyTavernPath,extensionPath=fileURLToPath(new URL('../',import.meta.url))}){
 if(typeof sillyTavernPath!=='string'||!sillyTavernPath.trim())throw Error('Specify --sillytavern followed by the SillyTavern installation folder.');
 const host=await realpath(resolve(sillyTavernPath));await access(join(host,'server.js'));
 const entry=await realpath(join(extensionPath,'server-plugin','index.mjs'));
 const pluginDirectory=join(host,'plugins','lattice-files'),destination=join(pluginDirectory,'index.mjs');
 try{const existing=await readFile(destination,'utf8');if(!existing.startsWith(marker))throw Error('An existing lattice-files plugin was not installed by this installer; preserve it and resolve the location before continuing.');}
 catch(error){if(error.code!=='ENOENT')throw error;}
 await mkdir(pluginDirectory,{recursive:true});
 await writeFile(destination,marker+'export {info,init} from '+JSON.stringify(pathToFileURL(entry).href)+';\n');
 let configuration='';try{configuration=await readFile(join(host,'config.yaml'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 return {pluginDirectory,entry,enabled:/^\s*enableServerPlugins:\s*true\b/m.test(configuration),requiresRestart:true};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const args=process.argv.slice(2),index=args.indexOf('--sillytavern');
  if(index<0||!args[index+1]||args.length!==2)throw Error('Usage: node tools/install-server-plugin.mjs --sillytavern "PATH_TO_SILLYTAVERN"');
  const result=await installServerFilePlugin({sillyTavernPath:args[index+1]});
  console.log('Lattice file service registered at '+result.pluginDirectory);
  if(!result.enabled)console.log('Set enableServerPlugins: true in '+join(dirname(dirname(result.pluginDirectory)),'config.yaml')+'.');
  console.log('Restart SillyTavern, then open a file node and save its File path settings.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
