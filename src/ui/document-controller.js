import { parseWorkflowDocument, serializeWorkflowDocument } from '../workflow/document-file.js?v=0.26.0';

const cancelled = () => ({ok:false,cancelled:true});
const failure = message => ({ok:false,error:{message}});

/** File/document commands share a replacement guard, independent of the canvas. */
export function createWorkflowDocumentController(env) {
    const {session,files} = env;
    let replacing = false, saving = false, status = '', storageWarning = '', replacementEpoch = 0;
    const changed = () => env.changed?.();
    const report = (message,type='error') => {status=message;env.report?.(message,type);changed();};
    const error = result => {if (!result?.cancelled) report(result?.error?.message || 'The document operation failed.');return result;};
    async function save(saveAs=false, insideReplacement=false) {
        if (saving || replacing && !insideReplacement) return cancelled();
        const graph=session.current();if (!graph) return error(failure('No workflow document is open.'));
        const token=session.capture(),workspaceViews=env.views?.() ?? null,snapshot=session.snapshot(graph);
        const encoded=serializeWorkflowDocument(graph,workspaceViews);if (!encoded.ok) return error(encoded);
        saving=true;changed();
        try {
            const result=await files.save(encoded.data.json,session.source(),{saveAs,suggestedName:(graph.name || 'Untitled')+'.workflow.json'});
            if (!session.stillCurrent(token)) return cancelled();
            if (!result.ok) return error(result);
            if (!result.data.downloaded) {
                session.markSaved(token,snapshot,result.data.source);
                report('Saved '+(result.data.source?.name || 'workflow')+'.','success');
            } else report('Downloaded a JSON copy. Saving it to disk is handled by your browser.','info');
            return {ok:true,data:{...result.data,snapshot}};
        } catch (cause) {return session.stillCurrent(token) ? error(failure(cause?.message || 'The workflow could not be saved.')) : cancelled();}
        finally {saving=false;changed();}
    }
    async function guard(token) {
        if (!session.dirty()) return true;
        const before=session.snapshot(),choice=await env.prompt(session.source()?.name || session.current()?.name || 'Untitled');
        if (!session.stillCurrent(token) || choice==='cancel') return false;
        if (choice==='discard') {
            if (session.snapshot()!==before) {report('The document changed while the prompt was open. Try again.');return false;}
            return true;
        }
        if (choice!=='save') return false;
        const result=await save(false,true);
        if (!result.ok || !session.stillCurrent(token)) return false;
        if (result.data.downloaded) {report('The JSON copy was downloaded. Choose Don’t Save when you are ready to switch documents.','info');return false;}
        if (session.snapshot()!==result.data.snapshot) {report('New changes arrived while saving. Save them before switching documents.','info');return false;}
        return true;
    }
    async function replace(load,clean=false) {
        if (replacing || saving) return cancelled();
        const token=session.capture(),epoch=++replacementEpoch;
        const current=()=>epoch===replacementEpoch && session.stillCurrent(token);
        replacing=true;
        try {
            // Invoke the picker in the click's turn, before any asynchronous guard.
            const candidatePromise=load();changed();
            const result=await candidatePromise;
            if (!current()) return cancelled();
            if (!result.ok) return error(result);
            if (!await guard(token) || !current()) return cancelled();
            const next=result.data;
            const activated=env.activate(next.graph,{source:next.source ?? null,workspaceViews:next.workspaceViews ?? null,clean});
            if (activated?.ok===false) return error(activated);
            if (next.companions?.length) env.retainCompanions?.(next.companions);
            status='';changed();return {ok:true,data:next};
        } catch (cause) {return current() ? error(failure(cause?.message || 'The workflow could not be opened.')) : cancelled();}
        finally {replacing=false;changed();}
    }
    const read = async resultPromise => {
        const result=await resultPromise;if (!result.ok) return result;
        const parsed=parseWorkflowDocument(result.data.text);
        return parsed.ok ? {ok:true,data:{...parsed.data,source:result.data.source}} : parsed;
    };
    return {
        save,
        storageIssue(message) {storageWarning=message;changed();},
        cancelReplacement() {replacementEpoch++;},
        newDocument:()=>replace(()=>({ok:true,data:{graph:env.create()}})),
        open:()=>replace(()=>read(files.open()),true),
        recent:id=>replace(()=>read(files.readRecent(id)),true),
        example:id=>replace(()=>env.examples(id)),
        recover:id=>replace(()=>{
            const entry=env.recovery().find(value=>value.id===id);
            return entry?.graph ? {ok:true,data:{graph:structuredClone(entry.graph),workspaceViews:entry.workspaceViews,source:{kind:'recovery',name:entry.name}}} : failure(entry?.issue || 'This previous workflow is unavailable.');
        }),
        async clearRecent() {try {const result=await files.clearRecent();if (result?.ok===false) return error(result);changed();return {ok:true};}catch(cause){return error(failure(cause?.message || 'Recent files could not be cleared.'));}},
        view:()=>{const recent=files.recents();return {name:session.source()?.name || 'Untitled',dirty:session.dirty(),busy:replacing || saving,native:files.native,status:[status,storageWarning].filter(Boolean).join(' '),recents:Array.isArray(recent)?recent:recent?.data ?? [],recovery:env.recovery().map(({id,name,issue})=>({id,name,issue}))};},
    };
}
