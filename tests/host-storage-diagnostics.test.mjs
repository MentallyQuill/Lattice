import assert from 'node:assert/strict';
import test from 'node:test';
import {presentDiagnostic} from '../src/ui/diagnostics.js';

for(const [code,words] of [['HOST_FILE_UNAVAILABLE',/connection/i],['HOST_FILE_DENIED',/sign.*in|access/i],['HOST_FILE_METADATA_INVALID',/metadata.*verif|saved.*metadata/i],['FILE_STORAGE_FAILED',/browser.*file|local.*file/i]])test(`${code} explains the storage problem without disclosing source text`,()=>{
 const view=presentDiagnostic({code,message:'PRIVATE STORY password=hidden'});
 assert.doesNotMatch(view.id,/^unknown/);assert.match(view.message,words);assert.doesNotMatch(JSON.stringify(view),/PRIVATE STORY|password=hidden/);
});
