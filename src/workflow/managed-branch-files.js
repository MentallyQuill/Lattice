import {prepareTrustedBranchSnapshot} from './file-history-maintenance.js?v=0.30.1';
const fail=(code,message)=>({ok:false,error:{code,message}});
const sameBinding=(left,right)=>left?.messageCount===right.messageCount&&left?.prefixHash===right.prefixHash;
const missingSnapshot=snapshot=>typeof snapshot?.revision==='string'&&snapshot.revision.startsWith('missing:');
/** Host branch metadata nominates a parent; only an exact retained prefix authorizes a state copy. */
export async function prepareManagedBranchFiles({definitions,access,scope,branch,isCurrent}){
 const resolved=[],adoptions=[];
 for(const definition of definitions){
  if(!isCurrent())return fail('STALE_FILE_SCOPE','The branch changed while its state was prepared.');
  const childScope=definition.visibility.kind==='actor-private'?{...scope,actorId:definition.visibility.actorId}:scope;
  const child=access.backend([definition],{scope:childScope,isCurrent}),loaded=await child.load(definition.targetId);if(!loaded.ok)return loaded;
  if(!branch||typeof loaded.data.revision!=='string'||!loaded.data.revision.startsWith('missing:')){resolved.push(definition);continue;}
  const parentScope={...childScope,chatId:branch.parentChatId};
  const found=await access.ensureManaged(definition,{managed:true,create:false,scope:parentScope,isCurrent});
  if(!isCurrent())return fail('STALE_FILE_SCOPE','The branch changed while its parent state was checked.');
  if(!found.ok){
   // A successfully checked absence is a new resource, not lost inherited
   // history. Access failures and existing unstamped parent state stay held.
   if(found.error?.code==='MANAGED_FILE_NOT_FOUND'&&definition.missing==='create'){resolved.push(definition);continue;}
   return fail('BRANCH_POINT_UNAVAILABLE','The parent state at this branch point is unavailable. Keep the branch and recover a retained state before running.');
  }
  const parent=access.backend([found.data],{scope:parentScope,isCurrent}),current=await parent.readVersion(definition.targetId,{versionId:'current'});if(!current.ok)return current;
  let selected=!missingSnapshot(current.data.snapshot)&&sameBinding(current.data.snapshot.branchBinding,branch.binding)?current:null;
  if(!selected){const versions=await parent.listVersions(definition.targetId);if(!versions.ok)return versions;const version=versions.data.versions.find(version=>sameBinding(version.branchBinding,branch.binding));if(version)selected=await parent.readVersion(definition.targetId,{versionId:version.versionId});}
  if(!selected)return fail('BRANCH_POINT_UNAVAILABLE','No verified file state is retained at this exact branch point. The parent’s later state was kept separate.');
  if(!selected.ok)return selected;
  if(missingSnapshot(selected.data.snapshot))return fail('BRANCH_POINT_UNAVAILABLE','The retained parent file contents are unavailable at this branch point.');
  const rebased=await prepareTrustedBranchSnapshot({...selected.data,branchScope:childScope,branchBinding:branch.binding,visibility:definition.visibility});if(!rebased.ok)return rebased;
  if(!isCurrent())return fail('STALE_FILE_SCOPE','The branch changed while its retained state was checked.');
  resolved.push({...definition,content:rebased.data.snapshot.content});adoptions.push(rebased.data);
 }
 return {ok:true,data:{definitions:resolved,adoptions}};
}
