import {serializeWorkflowDocument} from '../workflow/document-file.js?v=0.29.0';
import {exportWorkflow} from '../workflow/packages.js?v=0.29.0';
import {createWorkflowAutosave} from './workflow-autosave.js?v=0.29.0';
const fail=(code,message)=>({ok:false,error:{code,message}});
const cancelled=()=>({ok:false,cancelled:true});

/** Application hooks keep chat selection apart from shared authored documents. */
export function createWorkflowLibraryController(env) {
    const {session,library}=env, getContext=env.getContext??(()=>null),isBusy=env.isBusy??(()=>false);
    const activate=env.activate??((graph,options)=>session.activate(graph,options));
    const listeners=new Set();let busy=false,items=[],status={state:'idle'},selection=null,disposed=false;
    const notify=()=>{for(const listener of listeners)try{listener();}catch{}env.changed?.();};
    const autosave=createWorkflowAutosave({session,library,getContext,isBusy,activate,delay:env.delay,canAdopt:env.canAdopt,onAdopt:(id,context)=>select(id,context),onStatus:value=>{status=value;notify();}});
    const encode=()=>serializeWorkflowDocument(session.current(),session.workspaceViews(),{exampleMetadata:session.exampleMetadata?.()});
    const current=(token,context)=>!disposed&&session.capture()===token&&context===getContext();
    async function select(id,context) {
        const value={kind:'library',id};
        if(!env.persistSelection){selection={value,context};notify();return {ok:true,data:{persisted:false}};}
        let result;try{result=await env.persistSelection(value,context);}catch{return fail('WORKFLOW_SELECTION_FAILED','The chat workflow selection could not be saved.');}
        if(context!==getContext())return cancelled();
        if(!result.ok)return result;
        if(result.data?.acknowledged!==true)return fail('WORKFLOW_SELECTION_ACK_MISSING','The chat workflow selection was not acknowledged.');
        selection={value,context};notify();return result;
    }
    async function storeCurrent(name,independent) {
        if(busy||isBusy())return cancelled();
        const token=session.capture(),context=getContext(),encoded=encode(),snapshot=session.snapshot();if(!encoded.ok)return encoded;
        busy=true;notify();
        try {
            const result=await library[independent?'saveAs':'adopt']({json:encoded.data.json,name});
            if(!current(token,context))return cancelled();if(!result.ok)return result;
            if(result.data?.acknowledged!==true)return fail('WORKFLOW_ACK_MISSING','The workflow copy save was not acknowledged. Your draft remains open.');
            if(session.snapshot()!==snapshot)return fail('WORKFLOW_CHANGED_DURING_COPY','The copy was saved. Newer edits remain in the current draft; open the copy from Saved workflows.');
            // Explicit Save As detaches file authority; ordinary adoption preserves local configuration.
            const adopted=activate(result.data.graph,{source:result.data.source,workspaceViews:result.data.workspaceViews??null,exampleMetadata:result.data.exampleMetadata,clean:true});
            if(adopted?.ok===false)return adopted;
            const activationToken=session.capture(),savedSnapshot=session.snapshot();
            const selected=await select(result.data.id,context);return selected.ok?{...result,data:{...result.data,activationToken,snapshot:savedSnapshot}}:selected;
        }finally{busy=false;notify();}
    }
    async function saveAs(name){return storeCurrent(name,true);}
    async function save(){return session.source()?.kind==='library'?autosave.flush():storeCurrent(session.current()?.name||'Untitled',false);}
    async function openSaved(id) {
        if(busy||isBusy())return cancelled();
        const context=getContext();
        if(env.replace) {
            const result=await env.replace(()=>library.read(id),true,{reloadAfterSave:true});
            if(result.ok&&context===getContext()){const selected=await select(id,context);if(!selected.ok)return selected;}
            return result;
        }
        const token=session.capture();busy=true;notify();
        try {
            let result=await library.read(id);if(!current(token,context))return cancelled();if(!result.ok)return result;
            if(session.dirty()) {
                const snapshot=session.snapshot(),choice=await env.prompt?.(session.source()?.name||session.current()?.name||'Untitled');
                if(!current(token,context)||choice==='cancel'||!choice)return cancelled();
                if(choice==='save'){
                    const saved=await autosave.flush();if(!saved.ok||session.dirty())return saved.ok?cancelled():saved;
                    result=await library.read(id);if(!current(token,context)||session.dirty())return cancelled();if(!result.ok)return result;
                }
                else if(choice!=='discard'||snapshot!==session.snapshot())return cancelled();
            }
            if(!current(token,context)||isBusy())return cancelled();
            const adopted=activate(result.data.graph,{source:result.data.source,workspaceViews:result.data.workspaceViews??null,exampleMetadata:result.data.exampleMetadata,clean:true});
            if(adopted?.ok===false)return adopted;
            const selected=await select(id,context);return selected.ok?result:selected;
        }finally{busy=false;notify();}
    }
    return Object.freeze({
        openSaved,save,saveAs,
        async downloadCopy(){
            const encoded=encode();if(!encoded.ok)return encoded;
            const portable=JSON.stringify(exportWorkflow(session.current(),{exampleMetadata:session.exampleMetadata?.()}),null,2);
            return env.downloadCopy?env.downloadCopy(portable,(session.current()?.name||'Untitled')+'.workflow.json'):fail('WORKFLOW_DOWNLOAD_UNAVAILABLE','Download is unavailable.');
        },
        async beforeRun(){
            if(isBusy()||busy)return fail('WORKFLOW_BUSY','Finish the current run or review before starting another run.');
            const context=getContext(),token=session.capture();
            for(let attempt=0;attempt<4;attempt++) {
                const result=await autosave.flush();if(!current(token,context))return cancelled();if(!result.ok)return result;
                if(!session.dirty()||session.source()?.kind!=='library'&&(session.source()||!env.canAdopt?.()))break;
            }
            if(session.dirty()&&(session.source()?.kind==='library'||!session.source()&&env.canAdopt?.()))return fail('WORKFLOW_EDIT_PENDING','New workflow edits are still arriving. Finish editing before running.');
            const latest=await autosave.refresh();
            if(context!==getContext())return cancelled();
            if(isBusy()||busy||latest.ok&&latest.data?.deferred)return fail('WORKFLOW_BUSY','Finish the current run or review before starting another run.');
            return latest;
        },
        changed:()=>autosave.changed(),refresh:()=>autosave.refresh(),flush:()=>autosave.flush(),
        async reloadList(){const result=await library.list();if(result.ok){items=result.data;notify();}return result;},
        async restoreSelection(){const selected=env.getSelection?.();return selected?.kind==='library'?openSaved(selected.id):{ok:true,data:{unchanged:true}};},
        getWorkflowIdentity:()=>session.source()?.kind==='library'?session.source().id:session.draftNamespace(),
        view:()=>({items:[...items],source:session.source(),selected:selection&&selection.context===getContext()?selection.value:env.getSelection?.()??null,status,dirty:session.dirty(),busy:busy||isBusy(),autosave:autosave.view(),capabilities:library.capabilities}),
        recovery:()=>autosave.recovery(),subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
        dispose(){disposed=true;autosave.dispose();listeners.clear();},
    });
}
