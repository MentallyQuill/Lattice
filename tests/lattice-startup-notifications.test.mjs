import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {presentDiagnostic} from '../src/ui/diagnostics.js';
const source=fs.readFileSync(new URL('../index.js', import.meta.url),'utf8');
const boot=source.slice(source.indexOf('function boot()'),source.indexOf('\nif (globalThis.SillyTavern'));
test('startup failure remains visible until dismissed without exposing the exception text',()=>{
 const notices=[];
 const scope={ctx:()=>({}),settings:()=>({}),mountLauncher(){},initializeNativeWorkflowController(){throw new TypeError('private exception');},console:{error(){}},presentDiagnostic,safe:fn=>{try{return fn();}catch{}},toastr:{error(...args){notices.push(args);},info(...args){notices.push(args);}}};
 vm.runInNewContext(boot+'\nboot();',scope);
 assert.equal(notices.length,1);
 assert.equal(notices[0][1],'Lattice could not open');
 assert.doesNotMatch(notices[0][0],/private exception/);
 assert.equal(notices[0][2]?.timeOut,0);
 assert.equal(notices[0][2]?.extendedTimeOut,0);
 assert.equal(notices[0][2]?.closeButton,true);
 assert.equal(notices[0][2]?.escapeHtml,true);
});