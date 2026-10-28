const methods=['load','compareAndSwap','lookupHistory','adoptLegacy','listVersions','readVersion','restoreVersion'];
/** Each private resource keeps its own actor scope while public resources stay actorless. */
export function createScopedNodeFileBackend(access,definitions,controls){
 const targets=new Map(definitions.map(definition=>{
  const actorId=definition.visibility?.kind==='actor-private'?definition.visibility.actorId:undefined;
  const scope={userId:controls.scope.userId,chatId:controls.scope.chatId,...(actorId?{actorId}:{})};
  const isCurrent=()=>controls.isCurrent()&&(!actorId||controls.isActorAvailable?.(actorId)===true);
  return [definition.targetId,access.backend([definition],{scope,isCurrent,...(controls.signal?{signal:controls.signal}:{}),...(controls.getBranchBinding?{getBranchBinding:controls.getBranchBinding}:{}),...(controls.branchBinding?{branchBinding:controls.branchBinding}:{})})];
 }));
 return Object.freeze(Object.fromEntries(methods.map(method=>[method,(...args)=>{const targetId=method==='compareAndSwap'?args[0]?.targetId:args[0],backend=targets.get(targetId);return backend?.[method]?.(...args)??Promise.resolve({ok:false,error:{code:'FILE_TARGET_UNAUTHORIZED',message:'This file is outside the captured scope.'}});}])));
}
