import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runtimeFiles,digest} from './server-setup/runtime-bundle.mjs';
const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
/** Dependency-free ZIP with stored entries and Unix executable launcher permissions. */
function zip(files){
 const local=[],central=[];let offset=0;
 for(const [name,bytes] of files){
  const filename=Buffer.from(name),crc=crc32(bytes),header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(filename.length,26);
  local.push(header,filename,bytes);
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(0x314,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(33,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(bytes.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(((/\.(command|sh)$/.test(name)?0o100755:0o100644)<<16)>>>0,38);directory.writeUInt32LE(offset,42);central.push(directory,filename);offset+=header.length+filename.length+bytes.length;
 }
 const end=Buffer.alloc(22),directory=Buffer.concat(central);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
export async function buildServerSetup({outputPath=path.join(sourceRoot,'assets','lattice-file-setup.zip'),root=sourceRoot}={}){
 const files=await runtimeFiles(root),manifest={schemaVersion:1,files:Object.fromEntries([...files].map(([name,bytes])=>[name,digest(bytes)]))};
 for(const name of ['tools/install-server-plugin.mjs','tools/server-setup/runtime-bundle.mjs','tools/server-setup/setup.mjs','tools/server-setup/setup.html','tools/server-setup/README.md'])files.set(name,await fs.readFile(path.join(root,name)));
 files.set('package.json',Buffer.from(JSON.stringify({type:'module',private:true})+'\n'));
 files.set('setup-manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
 files.set('README.txt',await fs.readFile(path.join(root,'tools/server-setup/README.md')));
 files.set('Setup-Windows.cmd',Buffer.from('@echo off\r\nnode "%~dp0tools\\server-setup\\setup.mjs"\r\nif errorlevel 1 pause\r\n'));
 files.set('Setup-macOS.command',Buffer.from('#!/bin/sh\nset -eu\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec node "$ROOT/tools/server-setup/setup.mjs"\n'));
 files.set('Setup-Linux.sh',Buffer.from('#!/bin/sh\nset -eu\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec node "$ROOT/tools/server-setup/setup.mjs"\n'));
 await fs.mkdir(path.dirname(outputPath),{recursive:true});await fs.writeFile(outputPath,zip(files));return {outputPath,files:files.size};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){const result=await buildServerSetup();console.log('Built '+result.outputPath+' ('+result.files+' files).');}
