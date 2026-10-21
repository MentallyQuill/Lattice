/** Real focused teaching recipes; importing does not install or publish a catalog. */
import {buildUnifiedRoot,assembleMemoryExample} from './builder.mjs';
import {buildHarborArchiveChatJsonl} from './fixtures.mjs';
import {lessonCommentSize} from '../remastered/comment-layout.mjs';

const loreChapter=`# The harbor archive

The west bindery faces Sable Quay. Rain from the broken gutter once reached the map drawers. Mara and Ivo move loose sheets to the drying boards and label their original places before carrying anything away.

## The tower route

The old tower stair has a rotten tread. Pell closes that route and marks the sound platform beside it. Visitors use the platform to see the storm chart; a plan to repair the stair does not mean the repair has happened.

## Conservators and visitors

A family sign shows 👨‍👩‍👧‍👦 beside a sample label, and the handwritten word café uses a combining accent. Keep these graphemes intact when comparing small passage sizes. The long conservation note records why weights remain beside damp paper, why a source label stays with its sheet, and why an attractive paraphrase must never replace the original evidence of where an item was found.
`;
function guidance(root,label){
 root.add('render','format',{inputMode:'records',format:'text',mapping:'select',fields:[{name:'text',path:['text']}],separator:'\n\n'},'passage text');
 root.add('guidance','compose',{outputKind:'guidance',sections:[{name:'Memory',text:''}]},label);
 root.connect('passages','out','render','in');root.connect('render','text','guidance','section.Memory');root.connect('guidance','out','generate','guidance');
}
function teachingNote(root,goal,lesson){
 const content=[goal,'',...lesson.learn,'',...lesson.steps,'',lesson.callBudget].join('\n');root.graph.description=goal;
 root.graph.nodes['lesson-note']={id:'lesson-note',type:'note',content,title:'Lesson instructions',x:100,y:0,...lessonCommentSize(content),enabled:true,commentFrame:true,moveContents:false};
}
function buildLorePassages(){
 const root=buildUnifiedRoot({id:'memory-lesson-34',label:'Lore passages'}),goal='Split an included lore chapter at useful boundaries and inspect exact source spans without making a model call.';
 root.add('chapter','file-input',{fileName:'harbor-lore-chapter.txt',content:loreChapter,loaded:true},'saved lore chapter');
 root.add('passages','chunk',{inputMode:'text',strategy:'paragraph',sizeUnit:'utf16',targetSize:256,overlap:0,maxChunks:32,maxTokenizerCalls:4096},'lore passages');root.connect('chapter','out','passages','in');guidance(root,'passage guidance');
 root.checkpoint('passages','out','Raw passage records preserve complete graphemes and fit the selected size.');root.checkpoint('passages','manifest','Half-open spans refer to this saved snapshot; overlap never increases original coverage.');root.checkpoint('passages','report','Inspect the actual unit, passage count and tokenizer work.');root.checkpoint('guidance','out','These rendered passages causally reach native Guidance.');
 const lesson={difficulty:'Composition',focus:'Chunk: paragraphs, spans and exact token sizing',learn:[
  'Chunk segmentation is independent of scheduling and history retention. This source is an included file snapshot, not a live lorebook or chat grant.',
  'Paragraph boundaries and deliberate overlap retain exact snapshot spans; complete graphemes are never cut.',
  'Token sizing requires your actual tokenizer binding. A manifest alone cannot authorize omission of saved chat.'
 ],requirements:['Inspect the included harbor-lore-chapter.txt snapshot. No index, model helper, document write or subscription is required.','For the optional token experiment, bind the exact tokenizer used for the intended model.'],steps:[
  'Open this workflow and inspect File Input · saved lore chapter. Opening and Preview make no request or save.',
  'Run read-only to Chunk · lore passages. Compare each text with its half-open span in the snapshot.',
  'Increase overlap from 0 and inspect repeated text alongside the unchanged union of original spans.',
  'Bind an exact tokenizer, select token sizing, target size 512 and overlap 64; keep maxTokenizerCalls at 4096 and inspect actual count.',
  'Compare paragraph with fixed strategy. Optionally Send after checking the bounded Compose · passage guidance output.'
 ],experiments:[{change:'Edit one paragraph and compare identities.',expect:'Affected text/settings change identity; the saved snapshot still supplies no live source authority.'},{change:'Apply cleanup without a verified offset map.',expect:'Inspect derived-only/unmapped lineage rather than assuming full original coverage.'}],cases:[{when:'The snapshot is empty.',expect:'A completed empty raw array, no tokenizer or model call.'},{when:'The tokenizer is missing, an indivisible grapheme cannot fit, or maxChunks is exceeded.',expect:'Atomic failure with no silently dropped final passage.'}],callBudget:'Read-only: T0/E0/IR0/IW0/N0. Optional Send: N1. One included snapshot read; no writes or coverage lookups. UTF-16 mode uses 0 tokenizer calls; the optional token experiment allows at most 4,096 exact local tokenizer calls.',requestBudget:{T:0,E:0,IR:0,IW:0,N:1,other:['One saved snapshot read; no document/metadata writes or coverage lookups.','UTF-16 mode uses 0 tokenizer calls; optional token mode admits max4096 exact local calls and reports actual usage.']},requiredCapabilities:[]};
 teachingNote(root,goal,lesson);return assembleMemoryExample({number:34,goal,roots:[root],ownedFixtures:{'harbor-lore-chapter.txt':loreChapter},lesson});
}
function buildTurnPassages(){
 const root=buildUnifiedRoot({id:'memory-lesson-35',label:'Three-turn passages'}),goal='Group older verified assistant turns and their paired user material while keeping the newest ten turns raw.';
 root.add('history','scene-context',{selection:'before-window',activationMode:'root',keepRecentAssistantTurns:10,maxMessages:1000,maxTextUnits:100000,includeCharacter:false,visibilityMode:'public'},'older than recent ten');
 root.add('passages','chunk',{inputMode:'context',strategy:'assistant-turns',turnsPerChunk:3,overlap:0,maxChunks:32},'three-turn passages');
 root.connect('history','out','passages','in');root.connect('history','manifest','passages','sourceManifest');guidance(root,'older passage guidance');
 root.checkpoint('history','out','The thirteen-turn fixture selects its oldest three verified turn groups; newest ten remain raw.');root.checkpoint('passages','out','Whole assistant turns retain their verified paired user messages, grouped in threes, followed by a smaller final group.');root.checkpoint('passages','manifest','Inspect exact original dependencies; this is not a processing or omission acknowledgement.');
 const lesson={difficulty:'Composition',focus:'Chunk: verified assistant-turn grouping',learn:[
  'Scene Context chooses the eligible history window; Chunk groups that current selection. The retained recent window is independent of passage size.',
  'The host proves selected source identities and user/assistant pairing. Descriptive imported Context cannot supply that proof.',
  'This focused preparation is read-only and makes no summary call or omission acknowledgement.'
 ],requirements:['Import thirteen-turn-harbor-chat.jsonl into an explicitly disposable practice chat through the normal host import. For the protected/unpaired exercise, separately import thirteen-turn-harbor-chat-protected.jsonl; its public system barrier must never be guessed into a pair.','Require the host selected-source/pairing capability. Imported IDs and timestamps create no accepted-reply or coverage authority.'],steps:[
  'Before sending another reply, inspect Scene Context · older than recent ten: before-window, keepRecentAssistantTurns: 10.',
  'Run read-only to Chunk · three-turn passages; inspect the three oldest eligible assistant turns and their paired users.',
  'Compare Chunk out with manifest. It should contain one three-turn record for the supplied thirteen-turn fixture.',
  'Use only two verified older turns and inspect the explicit smaller final group. With five eligible turns, expect groups of 3 and 2.',
  'In the failure exercise replace the live Context with descriptive imported Context and inspect CHUNK_TURN_SOURCE_REQUIRED.'
 ],experiments:[{change:'Set turnsPerChunk to 2 while retaining the newest ten.',expect:'Segmentation changes; protected recent history does not.'},{change:'Set the window to eight while keeping groups of three.',expect:'The source selection changes independently of grouping and passage sizing.'}],cases:[{when:'No history is older than the newest ten.',expect:'A completed empty array with no model request.'},{when:'There are two eligible verified turns.',expect:'One smaller final group, with both whole pairs.'},{when:'Pairing is missing or the captured source changes.',expect:'A pairing/source failure; do not invent groups from imported IDs or use stale text.'}],callBudget:'Read-only preparation T0/E0/IR0/IW0/N0; optional Send N1. At most one bounded history page, no document or metadata writes, 0 tokenizer calls and no coverage lookups.',requestBudget:{T:0,E:0,IR:0,IW:0,N:1,other:['At most one bounded history page.','No document or metadata writes, 0 tokenizer calls, no coverage lookups.']},requiredCapabilities:['selected-source-pairing']};
 teachingNote(root,goal,lesson);const chat=buildHarborArchiveChatJsonl().trimEnd().split('\n').slice(0,27).join('\n')+'\n';
 const protectedRows=chat.trimEnd().split('\n').map(row=>JSON.parse(row));protectedRows.splice(2,0,{name:'Practice system',is_user:false,is_system:true,mes:'Public practice barrier: do not infer a user/assistant pair across this system message.',extra:{}});
 return assembleMemoryExample({number:35,goal,roots:[root],ownedFixtures:{'thirteen-turn-harbor-chat.jsonl':chat,'thirteen-turn-harbor-chat-protected.jsonl':protectedRows.map(row=>JSON.stringify(row)).join('\n')+'\n'},lesson});
}

export function buildFoundationLesson(number){if(number===34)return buildLorePassages();if(number===35)return buildTurnPassages();throw new RangeError("Only foundation lessons34 and35 are available.");}
