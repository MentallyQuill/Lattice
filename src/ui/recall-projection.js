import {recallActivationLabel,recallUseLabel,recallConsumeLabel,recallTargetLabel} from '../workflow/recall-labels.js?v=0.27.0';
import {inspectExpandedGraph,nodeAddressKey} from '../workflow/graph-validation.js?v=0.27.0';
const intersects=(a,b)=>a==='both'||b==='both'||a===b;
const policy=node=>JSON.stringify([node.actorId,node.memorySetId,node.target??'both',node.uses??'next-match',node.consumeOn??'accepted']);
const unique=values=>[...new Set(values)];
const keyLabel=hotkey=>[hotkey?.ctrl&&'Ctrl',hotkey?.alt&&'Alt',hotkey?.shift&&'Shift',hotkey?.meta&&'Meta',hotkey?.code?.replace(/^Key|^Digit/,'')].filter(Boolean).join('+');
/** Pure display projection. Authority and lifecycle metadata come from the trusted runtime. */
export function projectRecallView({rootGraph,inventory,status,enabled,issue='',nodeIds=[],viewKind='root',instancePath=[]}){
 const expanded=inventory===undefined&&rootGraph?inspectExpandedGraph(rootGraph):null;
 const units=inventory?.primitives??(expanded?.ok?expanded.data.primitives:Object.values(rootGraph?.nodes??{}).map(node=>({node,enabled:node.enabled!==false,address:null})));
 const relevant=units.filter(unit=>unit.enabled&&!unit.systemDisabled&&['recall','hotkey-arm'].includes(unit.node.operation));
 const identity=unit=>unit.address?nodeAddressKey(unit.address):unit.node.id;
 const nodes={},allNodes={},groups=new Map();
 const unavailable=!enabled?'Lattice disabled':!status?.scope?issue||'Memory recall requires an active user, chat, and character.':'';
 for(const unit of relevant){
  const node=unit.node,target=node.target??'both',matches=relevant.filter(other=>other.node.operation==='hotkey-arm'&&other.node.actorId===node.actorId&&other.node.memorySetId===node.memorySetId).sort((a,b)=>identity(a).localeCompare(identity(b)));
  const request=status?.requests?.find(request=>request.memorySetId===node.memorySetId&&request.queued);
  const actorCurrent=node.actorId===status?.scope?.actorId;
  const manual=node.operation==='hotkey-arm'||['armed','armed-or-keyword','armed-or-event','armed-or-character'].includes(node.activation??'armed');
  const compatible=new Set(matches.map(unit=>policy(unit.node))).size<=1;
  const shortcutUnit=matches[0],shortcut=shortcutUnit?.node,validPolicy=!!shortcut&&[recallTargetLabel(shortcut.target??'both'),recallUseLabel(shortcut.uses??'next-match'),recallConsumeLabel(shortcut.consumeOn??'accepted')].every(label=>label!=='Unavailable');
  const targetMatches=!!shortcut&&intersects(target,shortcut.target??'both');
  const registered=!!shortcut&&status?.shortcuts?.some(item=>shortcutUnit.address?item.address?nodeAddressKey(item.address)===identity(shortcutUnit):!shortcutUnit.address.instancePath.length&&(item.nodeId??item.id)===shortcut.id:(item.nodeId??item.id)===shortcut.id);
  const visible=!unavailable&&actorCurrent&&manual&&targetMatches;
  const queued=visible&&!!request;
  let reason=unavailable||(!actorCurrent?'This node belongs to another character.':!manual?'This Recall uses automatic triggers.':!matches.length?'Add a matching Recall Shortcut to queue this memory set.':!compatible?'Matching Recall Shortcuts use different policies. Make their target, repetition, and consumption settings match.':!validPolicy?'Choose supported Recall Shortcut settings.':!targetMatches?'The Recall and Shortcut generation targets do not overlap.':!registered?'The matching Recall Shortcut is unavailable.':'');
  const state=unavailable||!actorCurrent?'unavailable':queued?request.pendingState??'queued':'not-queued';
  const use=shortcut?.uses??'next-match',remaining=request?.remaining??{reply:false,swipe:false};
  const types=[remaining.reply&&'reply',remaining.swipe&&'generated swipe'].filter(Boolean).join(' and ');
  const statusText=state==='unavailable'?reason:state==='generation'?'Recall reserved for this generation':state==='acceptance'?'Recall awaiting acceptance':queued?use==='until-disarmed'?'Repeat until cancelled: '+types:use==='one-per-type'?'Queued once for each: '+types:'Queued for next '+types:'Not queued';
  const view={nodeId:node.id,...(unit.address?{address:unit.address}:{}),memorySetId:node.memorySetId??'',state,queued,queueAllowed:!reason&&!queued,cancelAllowed:queued,reason,targetLabel:recallTargetLabel(shortcut?.target??target),useLabel:recallUseLabel(shortcut?.uses??node.uses??'next-match'),consumeLabel:recallConsumeLabel(shortcut?.consumeOn??node.consumeOn??'accepted'),activationLabel:node.operation==='recall'?recallActivationLabel(node.activation??'armed'):'Manual queue',statusText,remaining,pendingCount:queued?request.pendingGenerationCount??0:0,remainingText:types||'None',consumerCount:relevant.filter(({node:other})=>other.operation==='recall'&&other.actorId===node.actorId&&other.memorySetId===node.memorySetId&&['armed','armed-or-keyword','armed-or-event','armed-or-character'].includes(other.activation??'armed')&&intersects(other.target??'both',shortcut?.target??target)).length,shortcutNodeIds:matches.map(identity),...(unit.address?{shortcutAddresses:matches.map(item=>item.address)}:{}),hotkeys:matches.map(item=>({nodeId:identity(item),label:keyLabel(item.node.hotkey)})),...(queued?{badge:{state,tooltip:statusText,ariaLabel:'Memory recall: '+statusText+'. Open recall details.'}}:{})};
  const globalId=identity(unit),globalView={...view,nodeId:globalId};allNodes[globalId]=globalView;
  const path=unit.address?.instancePath??[],currentPath=viewKind==='instance'?instancePath:[];
  if(JSON.stringify(path)===JSON.stringify(currentPath))nodes[node.id]=viewKind==='root'||viewKind==='instance'&&unit.address?view:{...view,state:'unavailable',queued:false,queueAllowed:false,cancelAllowed:false,badge:undefined,statusText:'Memory recall requires an active workflow instance.',reason:'Memory recall requires an active workflow instance.'};
  if(actorCurrent){const group=groups.get(view.memorySetId)??{memorySetId:view.memorySetId,nodeIds:[],linkedNodes:[],shortcutNodeIds:[],hotkeys:[],view:globalView};group.nodeIds.push(globalId);group.linkedNodes.push({nodeId:globalId,displayId:[...path,node.id].join(' / '),title:node.presentation?.alias||node.title||(node.operation==='recall'?'Recall':'Recall Shortcut')});group.shortcutNodeIds=unique([...group.shortcutNodeIds,...view.shortcutNodeIds]);group.hotkeys=view.hotkeys;groups.set(view.memorySetId,group);if(view.queueAllowed||view.cancelAllowed)group.view=globalView;}
 }
 const commands=(ids,source=nodes)=>{const views=unique(ids).map(id=>source[id]).filter(Boolean),queue=views.filter(node=>node.queueAllowed),cancel=views.filter(node=>node.cancelAllowed);return {queueNodeIds:queue.map(node=>node.nodeId),cancelNodeIds:cancel.map(node=>node.nodeId),queueShortcutNodeIds:unique(queue.map(node=>node.shortcutNodeIds[0])),cancelShortcutNodeIds:unique(cancel.map(node=>node.shortcutNodeIds[0])),queueMemorySetCount:unique(queue.map(node=>node.memorySetId)).length,cancelMemorySetCount:unique(cancel.map(node=>node.memorySetId)).length,queueReason:queue.length?'':views.find(node=>node.reason)?.reason??(views.some(node=>node.queued)?'Recall is already queued.':'Select an eligible Recall or Recall Shortcut node.'),cancelReason:cancel.length?'':unavailable||'No manual recall is queued for these nodes.',relevantNodeIds:views.map(node=>node.nodeId),excludedCount:ids.length-queue.length};};
 return {nodes,allNodes,scope:status?.scope?{userId:status.scope.userId,chatId:status.scope.chatId,workflowId:status.scope.workflowId,actorId:status.scope.actorId}:null,sets:[...groups.values()].map(group=>({...group,...group.view})).sort((a,b)=>a.memorySetId.localeCompare(b.memorySetId)),commands:{selected:commands(nodeIds),all:commands(relevant.map(identity),allNodes)},issue:unavailable||issue};
}
