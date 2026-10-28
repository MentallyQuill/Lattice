import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/ui/controller.js',import.meta.url),'utf8');
const start=source.indexOf('function renderDocumentState()'),end=source.indexOf('\n}',start)+2;
assert.ok(start>=0&&end>start);
function render(library,documentBusy=false){let output;const env={workbench:{update:value=>output=value},applicationFiles:()=>({controller:{view:()=>library},origins:{get:()=>null},setup:{view:()=>({open:false})}}),ensureDocumentCommands:()=>({view:()=>({busy:documentBusy})}),current:{id:'graph',name:'Example'},pendingExampleFileSetup:null,pendingFileRecovery:null,libraryOpen:true,libraryIssue:'',pendingServerChooser:null,settings:()=>({enabled:true,archivedWorkflows:{graphs:{},definitions:{}}})};Function('env','with(env){'+source.slice(start,end)+';renderDocumentState();}')(env);return output;}
const view=overrides=>({busy:true,commandBusy:false,source:null,status:{state:'idle'},autosave:{state:'idle',saving:false},items:[],...overrides});
test('runtime activity leaves explicit replacement enabled while library operations remain busy',()=>{const result=render(view({}));assert.equal(result.document.busy,false);assert.equal(result.workflowLibrary.busy,true);});
test('document and file operations still disable replacement',()=>{assert.equal(render(view({commandBusy:true})).document.busy,true);assert.equal(render(view({autosave:{state:'saving',saving:true}})).document.busy,true);assert.equal(render(view({busy:false}),true).document.busy,true);});
