# Thirty example workflows

[Documentation](README.md) · [Quick start](lattice-workspace.md) · [Operator’s manual](operators-manual.md)

Choose **File → Open examples…** to browse 30 lessons. Search by story goal or tool, filter by difficulty, and read a lesson’s requirements, steps, checkpoints, and model request budget before opening it.

![Examples browser with search, difficulty filters, and lesson details](images/examples-curriculum.png)

Opening a lesson makes an independent editable copy after offering to save modified work. It does not request a model or change **Enable Lattice**. Instructions stay with the copy in its description, comments, and named nodes. The portable files are also in [examples/remastered](../examples/remastered/).

Every lesson includes **On Send → Generate Reply → Review / Publish**. You can open any lesson directly; earlier lessons explain useful techniques rather than adding installation requirements. Foundations covers 1–8, Composition 9–17, Advanced 18–26, and Capstone 27–30.

## Set up a practice copy

1. Open a practice chat and select the SillyTavern character who will reply.
2. Read the lesson requirements and request budget. Replace sample instructions, actor IDs, item IDs, and aliases with your own story’s identities. Loaded character IDs normally use `character:<avatar filename>`; a display name alone is not enough.
3. For each model tool, choose **Active SillyTavern model** or a saved connection on its grey bar. The main reply always uses your usual SillyTavern connection. Configure **For Each → Helper model bindings** separately when the lesson uses model helpers.
4. If the lesson names story documents, authorize them in **Workflow → Configure → Workflow Data…**. Supply the document name, target ID, format, visibility, and initial content named in the lesson. Actor-private documents need that actor’s ID.
5. Resolve validation or connection issues. Keep the copy open, select **Enable Lattice**, and Send normally in SillyTavern.
6. Inspect the named checkpoints in Preview. At **Review / Publish → Host result**, compare the proposed reply and saved changes. **Apply reviewed reply** preserves the original as a swipe and accepts the proposal; **Reject reply** leaves its accepted-policy effects unapplied.

Extra model requests are additional to the normal reply. Helper iteration, authored branches, fallback settings, and larger limits can change the maximum. **Run to here** can spend tokens on model tools; opening, editing, and saving a lesson do not.

## Choose a lesson

| # | Goal | What you will try |
| --- | --- | --- |
| 1 | Follow a reply from Send to Review | Read the normal reply and apply or reject it; no extra model requests. |
| 2 | Give this scene one clear direction | Edit a Text instruction and inspect its guidance before Send. |
| 3 | Give the planner only the context it needs | Choose public scene context and inspect what was omitted. |
| 4 | Give a specialist model a different job | Separate its instructions, material, and model connection. |
| 5 | Reuse a prompt block from SillyTavern | Compare a prompt’s original and resolved text. |
| 6 | Bring a lore sheet into the scene | Import a file snapshot and select useful fields. |
| 7 | Let a second model polish the narration | Compare the revision while preserving selected wording. |
| 8 | Add an Observed Items dropdown | Extract items and append an expandable notes section. |
| 9 | Show a travel card only when there is a destination | Branch on a condition and retain the reply when the card skips. |
| 10 | Decide whether this scene needs a recap | Ask Decision a question and handle unresolved answers. |
| 11 | Detect a promise with Decision | Route yes, no, and unresolved answers explicitly. |
| 12 | Plan, write, polish, and annotate one reply | Connect several editorial jobs around the normal reply. |
| 13 | Build one reusable item-card processor | Reuse a saved helper with different parameters. |
| 14 | Give every clue its own explanation | Run a model helper over a list with a finite limit. |
| 15 | Keep useful context within a budget | Select or compress context while protecting important messages. |
| 16 | Consult the current campaign notebook | Read a live authorized document and compare it with a snapshot. |
| 17 | Record only the scene you accept | Propose a document update that saves with the reviewed reply. |
| 18 | Let existing memories shape the next reply | Read stored memories, reflect, and prepare character direction. |
| 19 | Turn narrated actions into confirmed events | Check exact reply evidence before treating an action as established. |
| 20 | React when an item is actually used | Check the player’s action and track who holds the item. |
| 21 | Give one present character their own direction | Verify participation before asking for private portrayal guidance. |
| 22 | Let an item remind its actual holder | Recall existing memories for the confirmed, present holder. |
| 23 | Advance the story clock when the scene is accepted | Propose explicit elapsed time and accept the clock change. |
| 24 | Make curses and routines happen on schedule | Test midnight, 14:00, and eight-hour crossings. |
| 25 | Award experience from confirmed progress | Apply authored rules and prevent duplicate rewards. |
| 26 | Recall a memory with a hotkey or a story trigger | Queue authorized records with an explicit use policy. |
| 27 | The broken wand: stable randomness with a wild branch | Confirm use, retain a weighted draw, and review its consequence. |
| 28 | The soul-stealing sword: an event ledger and a threshold | Count unique confirmed kills and test the 100-soul threshold. |
| 29 | One kiss, two private perspectives | Confirm a shared event and separately permit each private reflection. |
| 30 | A relationship that changes slowly over weeks | Inspect directed values, cooldowns, caps, and decay over story time. |

For a story-first introduction to the advanced lessons, read [Story systems](story-systems.md). Click a node’s **?** button when you need help with its settings.

## Sources, fixtures and acceptance

The [fixture files](../examples/remastered/fixtures/) provide demonstration content for lessons that need documents. Initialize the named shapes in your practice chat. Workflow Data stores scoped story documents; its target IDs are not paths to arbitrary files on your computer. **File Input** imports a UTF-8 snapshot and does not authorize a live document.

Use **Read File** when you need saved content and a reference for a later write to that same target. Keep that live reference connected through the update. **Format** validates and serializes supplied records; use Extract first when prose needs to become structured records.

File, memory, clock, and outcome changes are proposals until their configured acceptance path completes. Multiple saves have separate receipts and can partly succeed. Inspect the result before using **Retry failed saves** or reconciling an unknown save. See [acceptance and saving](unified-workflows.md#keep-acceptance-and-saving-distinct).

### Confirm actions and track time

A mention, plan, remembered event, negated action, or hypothetical action does not establish a new occurrence. Event confirmation needs exact unchanged evidence and declared actor/item identities. Current Holder also needs prior ownership and the confirmed events in order.

Preserve the authored event identities used by progression and randomness. Repeated events should not award progress or draw again. Lesson 28 grants one soul per canonical victim; a repeated victim with conflicting evidence holds as `IDENTITY_CONFLICT` rather than adding another soul.

Story Clock uses explicit forward integer minutes. It does not advance from message count or real-world waiting. Midnight is minute 0, 14:00 is 840, and eight hours is 480 minutes with an explicit origin. Interrupt retains the remaining duration; catch-up has a finite event limit. Clock Commit accepts the projected time and checked due events with the reviewed reply.

### Keep private perspectives separate

Private context and memories stay tied to their actor. Actor Context supplies each character’s own authorized material; only the selected native actor’s permitted Character Direction or Recall output can provide private guidance to the main reply. A generic Model Call followed by Compose cannot grant that access. Private reflections cannot become public notes by relabeling them.

Model Call’s **Instructions** supplies its system message. Character Direction has its own literal system prompt and can receive public Data or values authorized for that same actor. An absent actor’s portrayal call skips; an unresolved participation check holds.

Lesson 29 requires actual shared kiss evidence and both actors’ verified presence. Missing evidence or unresolved participation stops before Review. A rejected kiss skips reflections and leaves the original reply available for review; a null Decision answer holds before Review. Either actor’s absence skips both private branches. Each actor’s permission to author a reflection starts false and must be enabled separately. Shared observation and model-authored interpretation remain separate in the saved records. If only one reflection is permitted, only that actor’s reflection can run.

Lesson 30 can save elapsed-time decay for the authorized selected actor even when that actor is absent. That does not invent a supportive interaction or run private portrayal. Its directed relationship values influence NPC portrayal while leaving player choices open.

### Use existing memories deliberately

Lesson 18 reads genuine native state and episodes, then gives its private reflection to Character Direction. Accepted memory proposals remain tied to the accepted native revision. Later edits, swipe changes, deletion, or revoked visibility invalidate that evidence; extract new evidence for a changed narrative.

Lesson 22’s Prompted Memory reads the selected actor’s existing native episodes. Its separate `rowan-item-memories` Workflow Data target is an output ledger: starting it at `[]` does not create a recall episode. Recall does not invent history; opt-in creation needs explicit permission and review.

For lesson 26, use **Queue recall** on a Recall or Recall Shortcut node, **Details → Memory recall**, **Workflow → Memory recall**, or the configured shortcut. Green badges show queued requests; amber badges show reservations or results awaiting acceptance. Click a badge to inspect its policy. Previewing Recall Shortcut does not queue it. See [Recall setup and policies](unified-workflows.md#queue-memories-manually-or-recall-them-automatically).

## Reopen and share

Saved unified workflows and earlier unified example IDs remain supported. Portable exports omit local connection identifiers and credentials; reconfigure fixed connections, helper roles, and document authorization after importing.

Retired pre/post roots stay in a recovery archive. **File → Export archived workflows** saves a copy without model requests or conversion. They cannot run or import as current workflows. Use the [rebuilding steps](unified-workflows.md#move-an-existing-prepost-setup) to recover useful parts in a new unified graph.
