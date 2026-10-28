import assert from 'node:assert/strict';
import test from 'node:test';
import {createWorkflowLibraryController} from '../src/ui/workflow-library-controller.js';
import {createWorkflowDocumentSession} from '../src/ui/document-session.js';
import {createWorkflowLibrary} from '../src/ui/workflow-library.js';
import {memoryStore,graph} from './workflow-saved-library.test.mjs';
test('passive library status does not run authoritative review validation',async()=>{let bindingChecks=0;const session=createWorkflowDocumentSession();session.activate(graph());const library=createWorkflowLibrary({store:memoryStore()}),controller=createWorkflowLibraryController({session,library,isBusy:()=>{bindingChecks++;return true;},isBusyView:()=>true});for(let i=0;i<5;i++)assert.equal(controller.view().busy,true);assert.equal(bindingChecks,0);const result=await controller.beforeRun();assert.equal(result.ok,false);assert.equal(bindingChecks,1,'run gate still validates the actionable review');controller.dispose();});
