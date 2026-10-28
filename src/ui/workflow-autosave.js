import {serializeWorkflowDocument} from '../workflow/document-file.js?v=0.29.0';
const fail=(code,message)=>({ok:false,error:{code,message}});

/** Checkpoints acknowledge captured bytes, never the graph after a pending write. */
export function createWorkflowAutosave({session,library,isBusy=()=>false,activate=(graph,options)=>session.activate(graph,options),onStatus=()=>{},getContext=()=>null,canAdopt=()=>false,onAdopt=async()=>({ok:true}),delay=250}) {
    let timer=null,pending=null,disposed=false,deferred=false,lastStatus={state:'idle'},drafts=[],creation=null;
    const status=(state,result)=>{lastStatus={state,...(result?{result}:{})};try{onStatus(lastStatus);}catch{}return result;};
    const contextCurrent=(token,context)=>!disposed&&session.stillCurrent(token)&&context===getContext();
    const retain=draft=>{drafts=drafts.filter(item=>item.token!==draft.token);drafts.push(draft);};
    const stale=()=>fail('STALE_WORKFLOW_CONTEXT','The workflow or chat changed. The attempted draft is retained.');
    function clearTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
    async function write() {
        const source=session.source();
        if(!session.dirty()||source?.kind!=='library'&&(source||!canAdopt()))return {ok:true,data:{unchanged:true}};
        if(!source&&isBusy()){deferred=true;return status('deferred',{ok:true,data:{deferred:true}});}
        const token=session.capture(),context=getContext(),snapshot=session.snapshot();
        const encoded=serializeWorkflowDocument(session.current(),session.workspaceViews(),{exampleMetadata:session.exampleMetadata?.()});
        if(!encoded.ok)return status('error',encoded);
        const draft=!source&&creation?.token===token&&creation.context===context?creation:{token,context,source:source?{...source}:null,snapshot,json:encoded.data.json};if(!source)creation=draft;retain(draft);status('saving');
        let result;
        try {result=draft.result??await (source?library.save({id:source.id,expectedRevision:source.revision,json:draft.json}):library.adopt({json:draft.json}));}
        catch {result=fail('WORKFLOW_SAVE_FAILED','The workflow save could not be confirmed. Your draft is retained.');}
        if(!contextCurrent(token,context))return stale();
        if(!result.ok)return status(/CONFLICT|STALE/.test(result.error?.code??'')?'conflict':'error',result);
        if(result.data?.acknowledged!==true||typeof result.data.revision!=='string')return status('error',fail('WORKFLOW_ACK_MISSING','The workflow save was not acknowledged. Your draft is retained.'));
        if(!source&&isBusy()){draft.result=result;deferred=true;return status('deferred',{ok:true,data:{deferred:true}});}
        deferred=false;session.markSaved(token,draft.snapshot,{kind:'library',id:result.data.id??source.id,name:result.data.source?.name??session.current().name??source?.name,revision:result.data.revision});
        if(!source){creation=null;const selected=await onAdopt(result.data.id,context);if(!contextCurrent(token,context))return stale();if(!selected.ok)return status('error',selected);}
        drafts=drafts.filter(item=>item!==draft);
        return status(session.dirty()?'pending':'saved',{...result,data:{...result.data,snapshot:draft.snapshot}});
    }
    async function flush() {
        clearTimer();if(disposed)return stale();
        // Capture at invocation; a caller waiting on another write cannot save its replacement.
        const token=session.capture(),context=getContext();
        if(pending){const result=await pending;if(!contextCurrent(token,context))return stale();return result;}
        pending=write();try{return await pending;}finally{
            pending=null;
            if(contextCurrent(token,context)&&lastStatus.state==='pending'&&session.dirty())schedule();
        }
    }
    async function refresh() {
        if(disposed)return stale();
        if(isBusy()){deferred=true;return status('deferred',{ok:true,data:{deferred:true}});}
        if(pending){const result=await pending;if(!result.ok)return result;}
        const source=session.source();if(!source&&session.dirty()&&canAdopt())return flush();if(source?.kind!=='library')return {ok:true,data:{unchanged:true}};
        const token=session.capture(),context=getContext(),snapshot=session.snapshot();
        let result;try{result=await library.read(source.id);}catch{return status('error',fail('WORKFLOW_READ_FAILED','The latest saved workflow could not be checked.'));}
        if(!contextCurrent(token,context))return stale();if(!result.ok)return status('error',result);
        if(isBusy()){deferred=true;return status('deferred',{ok:true,data:{deferred:true}});}
        if(result.data.revision===session.source()?.revision){deferred=false;return {ok:true,data:{unchanged:true,revision:result.data.revision}};}
        if(session.dirty()||session.snapshot()!==snapshot){retain({token,context,source:{...source},snapshot:session.snapshot(),json:serializeWorkflowDocument(session.current(),session.workspaceViews(),{exampleMetadata:session.exampleMetadata?.()}).data?.json});return status('conflict',fail('WORKFLOW_REVISION_CONFLICT','This workflow changed elsewhere. Your draft is retained; save it as a new workflow or reopen the saved version.'));}
        const activated=activate(result.data.graph,{source:result.data.source,workspaceViews:result.data.workspaceViews??null,exampleMetadata:result.data.exampleMetadata,clean:true});
        if(activated?.ok===false)return status('error',activated);
        deferred=false;return status('saved',result);
    }
    function schedule(){clearTimer();timer=setTimeout(()=>{timer=null;void flush();},delay);}
    return Object.freeze({
        changed(){if(disposed)return;status('pending');schedule();},
        flush,refresh,
        view:()=>({...lastStatus,deferred,saving:!!pending,storage:'host',capabilities:library.capabilities,label:lastStatus.state==='saved'?'Saved in SillyTavern':lastStatus.state}),
        recovery:()=>drafts.filter(draft=>draft.context===getContext()).map(({token,context,...draft})=>structuredClone(draft)),
        dispose(){disposed=true;clearTimer();},
    });
}
