import assert from 'node:assert/strict';
import {unifiedRecipeHost} from './helpers/unified-recipe-host.mjs';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {createNativePersistenceVerifier} from '../src/workflow/native-persistence.js';
import {operationDefaults} from '../src/workflow/catalog.js';
import {resolveManagedFileNode} from '../src/workflow/managed-file-policy.js';
import {sha256Text} from '../src/workflow/definition-data.js';
const files=new Map();let host,savedChat;
const fetch=async(url,options)=>{
 if(url==='/api/chats/get')return Response.json(savedChat);
 if(url==='/api/files/upload'){const {name,data}=JSON.parse(options.body);files.set(name,Buffer.from(data,'base64').toString('utf8'));return Response.json({path:'user/files/'+name});}
 if(url==='/api/files/delete'){files.delete(JSON.parse(options.body).path.split('/').at(-1));return Response.json({ok:true});}
 const name=url.split('/').at(-1);return files.has(name)?new Response(files.get(name)):new Response('',{status:404});
};
const access=createHostFileAccess({store:createHostFileStore({fetch,getUserId:()=> 'default-user'}),getUserId:()=> 'default-user'});await access.ready;
const graph={id:'authored',name:'Accepted automatic file',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},groups:{},definitions:{},portals:{},runTargets:[{instancePath:[],nodeId:'review'},{instancePath:[],nodeId:'writer'}]};
for(const [id,operation,extra] of [['send','on-send',{}],['generate','generate-reply',{}],['review','review-publish',{}],['text','text',{text:'Accepted file'}],['writer','write-file',{...operationDefaults('write-file',{managedFiles:true}),fileHandling:'append'}]])graph.nodes[id]={id,type:'workflow',...operationDefaults(operation),...extra};
for(const [id,from,fromPort,to,toPort] of [['send','send','activation','generate','activation'],['reply','generate','draft','review','draft'],['content','text','out','writer','text']])graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};
const verifier=createNativePersistenceVerifier({getContext:()=>host.c,getUserId:()=> 'default-user',fetch});
host=unifiedRecipeHost(graph,{configureContext:c=>{Object.assign(c.characters[0],{name:'Mara',chat:'Story-2'});c.getRequestHeaders=()=>({'Content-Type':'application/json'});c.saveChat=async()=>{savedChat=[{chat_metadata:structuredClone(c.chatMetadata)},...structuredClone(c.chat)];};c.eventSource.on('MESSAGE_RECEIVED',()=>c.saveChat());},ports:{nodeFileAccess:access,getWorkflowIdentity:()=> 'trusted-library',persistenceVerifier:verifier}});
const proposed=await host.generate('Native accepted reply');assert.equal(proposed.ok,true,JSON.stringify(proposed.error));assert.equal([...files.values()].includes('Accepted file'),false,'preview and pending review create no output bytes');
const accepted=await host.controller.apply(proposed.reviewHandles[0]);assert.equal(accepted.ok,true,JSON.stringify(accepted));assert.equal([...files.values()].includes('Accepted file'),true);assert.equal(host.calls(),0);
const definition=resolveManagedFileNode(graph.nodes.writer,{workflowId:'trusted-library',address:{workflowId:graph.id,instancePath:[],nodeId:'writer'}}).data.definition;
const scope={userId:'default-user',chatId:'Story-2'},resolved=await access.ensureManaged(definition,{managed:true,create:false,scope,isCurrent:()=>true});assert.equal(resolved.ok,true);
const backend=access.backend([resolved.data],{scope,isCurrent:()=>true}),versions=await backend.listVersions(definition.targetId);assert.equal(versions.data.branchBinding.messageCount,2,'accepted stamp includes actual assistant reply');
const before=await backend.load(definition.targetId);assert.equal((await backend.compareAndSwap({targetId:definition.targetId,expectedRevision:before.data.revision,expectedContent:before.data.content,projectedDocument:{format:'text',content:'Future parent'},intentId:'parent-future',fingerprint:sha256Text('future')})).ok,true);
host.c.chatId='branch';host.c.characters[0].chat='branch';host.c.chatMetadata={main_chat:'Story-2',integrity:crypto.randomUUID()};host.c.chat=structuredClone(host.c.chat);await host.c.eventSource.emit('CHAT_CHANGED');
const preview=await host.controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'writer',portId:'projection'});assert.equal(preview.ok,true,JSON.stringify(preview.error));assert.equal(preview.recording.artifacts.find(artifact=>typeof artifact.value?.value?.content==='string').value.value.content,'Accepted file\nAccepted file','branch projection appends to the exact retained state, not the later parent');assert.equal([...files.values()].includes('Accepted file\nAccepted file'),false,'branch preview remains virtual');assert.equal((await backend.load(definition.targetId)).data.content,'Future parent','branch cannot modify parent');
host.controller.dispose();console.log('application accepted files: actual host output, verified assistant branch point and no branch preview writes passed');
