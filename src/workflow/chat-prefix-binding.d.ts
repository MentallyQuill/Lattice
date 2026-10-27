export interface ChatSourceBinding {schemaVersion:1;messageCount:number;prefixHash:string;}
export interface ChatPrefixBinding {readonly stamp:Readonly<ChatSourceBinding>;matches(value:unknown):boolean;}
export function validChatSourceBinding(value:unknown):value is ChatSourceBinding;
/** The host supplies its visibility-aware canonical accepted-prefix serialization. */
export function createChatPrefixBinding(chat:unknown[],serialize:(chat:unknown[])=>string|null):ChatPrefixBinding|null;
