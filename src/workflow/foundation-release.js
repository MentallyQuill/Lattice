/** Single supported surface for the 0.28 foundation release, not runtime authority. */
export const FOUNDATION_RELEASE=Object.freeze({
 id:'foundation-028',
 newLessonNumbers:Object.freeze([34,35]),
 newOperations:Object.freeze(['chunk']),
 deferredNodeControls:Object.freeze({'read-file':Object.freeze(['effectClass']),'write-file':Object.freeze(['effectClass']),'generate-reply':Object.freeze(['historyPolicy'])}),
 deferredOperations:Object.freeze(['on-event','cadence','job','embed','index','search','history-policy']),
 sourceSelections:Object.freeze(['recent','before-window']),
 deferredSceneControls:Object.freeze(['firstSourceId','lastSourceId','confirmed','protectRecentWindow','allowAppendRebase']),
 multiRootExamples:false,
});

/** Hook-free reserved-control check shared by admission and authoring projection. */
export function deferredFoundationControl(node){
 const operation=node&&Object.getOwnPropertyDescriptor(node,'operation');
 if(!operation||!Object.hasOwn(operation,'value')||typeof operation.value!=='string'||!Object.hasOwn(FOUNDATION_RELEASE.deferredNodeControls,operation.value))return null;
 for(const key of FOUNDATION_RELEASE.deferredNodeControls[operation.value]){
  const value=Object.getOwnPropertyDescriptor(node,key);
  if(value&&(!Object.hasOwn(value,'value')||value.value!==undefined))return key;
 }
 return null;
}
