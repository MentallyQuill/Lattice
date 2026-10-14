/** Teaching copy only: graph behavior remains defined in advanced.mjs and capstones.mjs. */
export const ADVANCED_TEACHING = {
    18: {
        goal: 'Teach Rowan to draw on existing private memories, then propose a memory update from the reply you accept. You will follow memory into portrayal and inspect the proposed update before it is saved.',
        learn: [
            'Memory Read supplies the selected actor’s stored state; Memory Recall searches that actor’s existing episodes, or remembered scenes. A connected Text Query replaces its saved query.',
            'Reflect interprets those records. Express turns the interpretation into portrayal hints; neither makes an interpretation a fact.',
            'Internalize proposes changes from native event evidence. Memory Commit saves the proposal only when the reply is accepted.'
        ],
        requirements: [
            'Select the loaded Rowan actor and replace character:rowan.png everywhere with that actor’s actual avatar ID. Use Rowan’s authorized native memory store.',
            'For a useful recall test, have an accepted native episode about Rowan and the lighthouse. A JSON fixture or an imported story paragraph cannot create native memory records.'
        ],
        steps: [
            'Build on lesson 17’s proposed-save pattern. Establish Rowan as participating in the current scene, then send: “Rowan returns to the lighthouse and studies the dark lantern.”',
            'Follow Text · episode search into Memory Recall.query. Its lighthouse text overrides the saved current scene query; the limit is four. Compare Memory Read’s state with the recalled episodes and check which recorded scenes actually reached Reflect.',
            'Follow Reflect into Express and Collect, then into Character Direction. Look for a restrained Rowan reaction that draws on the supplied memories while leaving the player’s response open.',
            'After generation, inspect the post-generation Memory Read events and Internalize.out. The proposed changes should cite the native event records they came from, including the completed reply’s exact evidence.',
            'Compare the memory store before and after Apply. Reject a second test: its proposed episode should never become a stored memory.'
        ],
        checkpoints: ['Internalize.out shows proposed private changes backed by the supplied native events. Rowan’s stored memory stays unchanged until Apply.'],
        experiments: [{ change: 'Edit Text · episode search from lighthouse to another phrase in an accepted Rowan episode and reduce Memory Recall limit from 4 to 1.', expect: 'Reflect receives only the matching permitted episode returned by the connected Text search; changing the saved query has no effect while the Query wire is connected. Inspect its input rather than expecting a particular sentence in the reply.' }],
        cases: [
            { when: 'There are no eligible native event records.', expect: 'Internalize stops and reports the missing evidence. Imported prose cannot fill that gap.' },
            { when: 'The reply is rejected.', expect: 'The proposed update is discarded and the stored actor memory remains unchanged.' }
        ],
        callBudget: 'Up to four extra model requests: Reflect, the participation check, Character Direction and Internalize. Express and Memory read, recall and commit make no model requests. There is also one ordinary SillyTavern reply.'
    },
    19: {
        goal: 'Turn actions in a generated reply into carefully checked event records. You will distinguish something that happened from something merely planned, mentioned or denied, then append the confirmed records as public notes.',
        learn: [
            'Draft Event Source supplies the unchanged reply and the exact position of each quoted action.',
            'Event Normalize checks suggested events against that source and the allowed actor IDs. A candidate is a suggestion, not a confirmed occurrence.',
            'Decision checks each candidate; Confirm Events keeps accepted occurrences and stops on an unresolved answer.'
        ],
        requirements: [
            'Use a disposable story with loaded Rowan and Iris actors. Replace character:rowan.png and character:iris.png consistently with their actual avatar IDs.',
            'Arrange a simple scene that can produce an observable action by either listed actor. This lesson reads the newly generated reply, rather than treating your request as the event itself.'
        ],
        steps: [
            'Recall lesson 8: a literal mention proved only that a word appeared. This lesson adds the Decision check from lesson 10 to determine whether an action actually occurred.',
            'Send: “Continue the scene as Rowan opens the lighthouse door.” Check that the resulting reply actually describes Rowan opening it before expecting an event record.',
            'Inspect Draft Event Source.out, then Event Normalize.out. Compare each candidate’s evidence text and position with the unchanged reply; actorId should match a loaded actor.',
            'Select For Each and read its limit and Helper model bindings in Details. Its helper checks at most three candidates separately, then Collection flattens the confirmed results. Compare the candidate evidence with the confirmed collection.',
            'Read the appended event notes alongside the narration. The notes report confirmed evidence; adding a note does not create an additional story action.'
        ],
        checkpoints: ['The final Collection.out contains only confirmed occurrences whose exact quoted actions appear in the native reply. Public notes show those records.'],
        experiments: [{ change: 'Use a scene where the reply says “Rowan plans to open the door” or “Rowan did not open the door.”', expect: 'The planned or negated action is excluded or rejected. Compare that result with the completed-action test.' }],
        cases: [
            { when: 'Decision cannot tell whether a candidate happened.', expect: 'A null answer stops confirmation for the collection; uncertain events are not partly accepted.' },
            { when: 'The reply contains no eligible completed action.', expect: 'No confirmed action is added. The lesson does not invent one to fill the notes.' },
            { when: 'More than three candidates reach For Each.', expect: 'The limit stops the run rather than silently checking only part of the evidence.' }
        ],
        callBudget: 'Up to four extra model requests: one extraction and one Decision for each of at most three candidates. There is also one ordinary SillyTavern reply.'
    },
    20: {
        goal: 'Make the next reply react to an item that was actually used. You will check actions in the player message, follow transfers in their written order and attach the consequence to the holder at the moment of use.',
        learn: [
            'Player Event Source reads the new player message before generation; lesson 19 instead inspected the generated reply.',
            'Item Use Trigger suggests uses and transfers. Decision confirms completed actions, and Current Holder applies confirmed transfers in order.',
            'A mention can identify an item without proving use or ownership. Only confirmed item-used events reach the consequence guidance.'
        ],
        requirements: [
            'In Workflow › Configure › Workflow Data, set Logical target ID to accepted-item-holders, Format to JSON and Visibility to Public. Paste fixtures/accepted-item-holders.json into Initial template and choose Save authorization. Its signal-lantern entry must name the accepted holder.',
            'Load Rowan and Iris, then replace both example avatar IDs throughout the graph and holder file with their actual IDs. Keep the item ID signal-lantern.'
        ],
        steps: [
            'Start with the confirmation process from lesson 19, now placed before the reply. Send: “Rowan uses the signal lantern to flash a signal toward the harbor.”',
            'Compare the player source with Item Use Trigger’s candidates and the confirmed collection. Check that the use is an actual action with an exact quote, rather than an intention.',
            'Inspect Current Holder.events. The use should carry Rowan’s holderId from the accepted holder map.',
            'Follow the item-used filter into Compose and Generate Reply.guidance. The reply should respond to the supplied use without inventing a second use or choosing what the player does next.',
            'Test a transfer with: “Rowan hands the signal lantern to Iris. Iris uses it to flash a signal.” Check that Iris receives the use consequence. This recipe reads ownership and resolves this message; it does not save a changed holder map.'
        ],
        checkpoints: ['Current Holder.events attaches the holder at each confirmed use, including transfers that came earlier in the player message.'],
        experiments: [{ change: 'Compare “Rowan uses the signal lantern. Rowan hands it to Iris.” with the transfer-then-use message.', expect: 'The earlier use belongs to Rowan. Reversing the action order changes who holds the item when it is used.' }],
        cases: [
            { when: 'The message says only “Rowan talks about the signal lantern.”', expect: 'No item-use consequence is supplied.' },
            { when: 'A proposed transfer is not confirmed.', expect: 'It cannot establish a new holder. Inspect rejected or unresolved evidence before trusting the resulting use.' },
            { when: 'The accepted holder data is missing or invalid.', expect: 'Resolve that setup error instead of assuming the person mentioning the item owns it.' }
        ],
        callBudget: 'Up to four extra model requests: one Item Use Trigger extraction and up to three Decision checks. There is also one ordinary SillyTavern reply.'
    },
    21: {
        goal: 'Give one participating character a private portrayal instruction. You will verify that Rowan is actually in the scene, then see how a separate Character Direction prompt influences Rowan’s next reply.',
        learn: [
            'Scene Presence checks current participation using scene evidence. A name in a memory or character card is not enough.',
            'Character Direction.systemPrompt is the instruction you author for this actor; it is separate from the ordinary reply prompt.',
            'The resulting private Guidance can shape Rowan’s portrayal while leaving player actions and other actors’ private feelings open.'
        ],
        requirements: [
            'Select the loaded Rowan actor. Replace character:rowan.png with Rowan’s actual avatar ID in the presence check and Character Direction.',
            'Establish a recent scene where Rowan visibly participates, such as Rowan and Iris standing beside the lighthouse door. No workflow data file is needed.'
        ],
        steps: [
            'Lesson 18 used memories to shape portrayal. Here, remove that mental overhead and study only participation plus one explicit character instruction.',
            'Read Character Direction.systemPrompt. The default asks for patient attention to evidence and restrained humor. Identify those traits in a scene where Rowan can express them.',
            'Send: “Iris points to fresh scratches on the lighthouse door and asks Rowan what they suggest.” Read Scene Context.out and the cast answer, then find the participation quote in Scene Presence.out.',
            'Inspect Character Direction.out before comparing Rowan’s generated response with the instruction. Check both the participation status and the supplied direction, rather than judging only the prose.',
            'Create a later scene that clearly places Rowan elsewhere while Iris examines the door. A mention such as “Iris remembers Rowan’s advice” should not make Rowan a participant.'
        ],
        checkpoints: ['Character Direction.out contributes private Guidance only when the supplied scene evidence verifies Rowan’s current participation.'],
        experiments: [{ change: 'Edit systemPrompt to ask Rowan for careful, concise observations and one dry joke. Repeat the same participating scene.', expect: 'The supplied portrayal direction changes for Rowan. Compare the direction input as well as the prose; exact wording is still generated by the model.' }],
        cases: [
            { when: 'Scene Presence reports absent.', expect: 'Character Direction skips its model request; the ordinary reply can continue.' },
            { when: 'Scene Presence reports unresolved.', expect: 'The private direction stops for clarification of the evidence. A name mention does not resolve participation.' },
            { when: 'The selected actor and configured actorId do not match.', expect: 'Correct the identity setup before expecting private character access.' }
        ],
        callBudget: 'Up to two extra model requests: one participation check and one Character Direction request if Rowan is present. There is also one ordinary SillyTavern reply.'
    },
    22: {
        goal: 'Let a mentioned item remind its actual holder of an existing memory. You will connect item ownership and scene participation to a private recall, then stage a separate output record for Rowan.',
        learn: [
            'Item Mention Trigger watches the newly generated reply after generation. A mention starts a reminder, not an item-use consequence.',
            'Prompted Memory selects from authorized native actor episodes. Its default mode recall and allowCreate false prevent invention; a checked model no-match skips the reminder and save path.',
            'The output is a private remembered-event record for later use; this workflow does not feed that reminder back into the reply just generated.'
        ],
        requirements: [
            'Select loaded Rowan and replace both example actor IDs consistently. Have an accepted native Rowan episode associated with the signal lantern, using the native memory work from lesson 18.',
            'In Workflow › Configure › Workflow Data, authorize JSON targets accepted-item-holders and rowan-item-memories using their fixtures as Initial template. Choose Public for the holder map and Actor private with Rowan’s Actor ID for the empty reminder array; choose Save authorization. The map must establish Rowan’s ownership.'
        ],
        steps: [
            'Combine the holder check from lesson 20 and the participation check from lesson 21. Send: “Rowan holds the signal lantern beside the lighthouse.” Confirm that the generated reply itself mentions signal lantern or lantern.',
            'Follow the mention into Current Holder, then the Rowan filter. The mentioned item must belong to Rowan for this Rowan-only reminder path to continue.',
            'Inspect the post-generation Scene Presence result and Prompted Memory output. The recalled memory should identify an existing permitted episode, with its text kept private.',
            'Inspect Write to File.receipt. Apply should add one event-linked record to rowan-item-memories; Reject should leave the array unchanged. Check the file rather than expecting extra prose in the same reply.'
        ],
        checkpoints: ['Write to File.receipt proposes a Rowan-private reminder record backed by the exact item mention. It is pending until Apply.'],
        experiments: [{ change: 'With explicit authoring permission, change Prompted Memory mode to recall-or-create and allowCreate to true in this disposable story.', expect: 'If no existing memory fits, a newly invented recollection may be proposed and labelled accordingly. Saving the output record does not silently add a native episode.' }],
        cases: [
            { when: 'No matching mention, Rowan is absent, or another actor holds the item.', expect: 'No Rowan reminder record is staged.' },
            { when: 'The model returns an explicit no-match result for the authorized memories.', expect: 'Prompted Memory.out and the connected save path skip, so the ordinary reply remains reviewable and no reminder is staged.' },
            { when: 'No authorized native memories are available in default recall mode.', expect: 'Recall stays unresolved before making a request. Changing mode alone does not grant creation permission.' },
            { when: 'The reply is rejected.', expect: 'The private output file remains unchanged.' }
        ],
        callBudget: 'Up to two extra model requests: the post-generation participation check and Prompted Memory when its prerequisites match. There is also one ordinary SillyTavern reply.'
    },
    23: {
        goal: 'Advance story time by an agreed duration and save that advance only with the accepted scene. You will compare the current clock with a proposed clock and test that rejection preserves the original time.',
        learn: [
            'Story Clock reads accepted time in story minutes, independent of message count and time spent at the computer.',
            'Advance Time projects a forward duration. A projection is the proposed result, not a saved clock change.',
            'Clock Commit stages that result for Apply and protects against saving the same accepted advance twice.'
        ],
        requirements: [
            'In Workflow › Configure › Workflow Data, set Logical target ID to story-clock, Format JSON and Visibility Public. Paste fixtures/story-clock.json into Initial template and choose Save authorization. Keep calendarId campaign-days, dayLengthMinutes 1440 and a positive revision.',
            'The fixture starts at absoluteMinute 780, or 13:00 on day zero. Set up the live authorized clock; importing JSON alone does not create the host’s clock access.'
        ],
        steps: [
            'Use lesson 17’s distinction between a proposed change and a saved change, now for time. Note the starting absoluteMinute and revision in the clock’s initial template.',
            'Inspect Text · authored input feeding duration. It declares minutes 60 with the agreed-hour-of-travel reason. Agree on that hour in the test story; the workflow does not infer it from your wording.',
            'Send: “Rowan and Iris spend the agreed hour traveling along the harbor road.” Inspect Advance Time.clock and report: from the fixture, the proposed destination is absoluteMinute 840, or 14:00.',
            'Check that no remainder is left by this simple duration. The guidance tells the reply to continue after the agreed hour, without deciding the player’s next action.',
            'Apply and reread the live clock: it should now show 840 and the next revision. In another practice chat with a fresh clock initialized from the fixture, Reject and verify that time stays at 780.'
        ],
        checkpoints: ['Clock Commit.receipt proposes the sixty-minute advance. The live clock changes once on Apply and stays at its starting time on Reject.'],
        experiments: [{ change: 'Use another practice chat with a fresh fixture clock, and edit the authored duration’s minutes from 60 to 30 for an agreed shorter journey.', expect: 'The proposed clock becomes absoluteMinute 810, or 13:30. Sending more messages does not itself advance time. Editing Initial template does not reset a clock that has already been saved.' }],
        cases: [
            { when: 'The scene is rejected or stopped.', expect: 'The accepted clock keeps its original minute and revision.' },
            { when: 'The authorized clock or required clock fields are missing.', expect: 'The run reports a setup error rather than choosing a time.' },
            { when: 'The same accepted review is applied again.', expect: 'The clock does not advance for a second copy of that review.' }
        ],
        callBudget: 'No extra model requests. Clock reading, projection and commit are deterministic; the workflow generates one ordinary SillyTavern reply.'
    },
    24: {
        goal: 'Run story events at scheduled times during an agreed rest. You will stop at the first due event, inspect the time still remaining, then compare that interruption with processing the whole duration.',
        learn: [
            'A Time Trigger describes a story schedule: daily midnight, daily 14:00, or every eight hours counted from minute zero.',
            'Advance Time policy interrupt stops at the first due boundary. Policy catch-up processes all due events within the configured limit.',
            'Accepted clock records remember which scheduled occurrences were consumed so replay cannot repeat them.'
        ],
        requirements: [
            'Authorize a fresh story-clock in a new practice chat as in lesson 23, using the provided fixture’s absoluteMinute 780 so the expected times below match. Editing Initial template leaves an already saved clock unchanged.',
            'Read the three schedules in Advance Time and their matching Time Trigger nodes: midnight minuteOfDay 0, daily-routine minuteOfDay 840, and eight-hour-pulse intervalMinutes 480 with anchorMinute 0.'
        ],
        steps: [
            'Start with lesson 23’s forward-time proposal. This duration is 1500 minutes, or 25 hours. Send: “Rowan rests for the agreed duration, unless the next scheduled occurrence interrupts.”',
            'Leave policy interrupt. From 13:00, the first due event is daily-routine at 14:00. Inspect the effective clock at 840 and the remainder of 1440 minutes: only one hour has passed.',
            'Inspect the three Time Trigger outputs and the flattened due-events collection. Only the routine is due at this first interruption; the reply receives those due events rather than spending the remaining day.',
            'Apply and inspect the live clock’s pendingTimeAdvance and consumed event IDs. The unprocessed duration remains recorded for continuation; this example does not run a background timer.',
            'Use another practice chat with a fresh clock initialized from the original fixture for the catch-up experiment, so both policies start from the same time.'
        ],
        checkpoints: [
            'Advance Time.remainder retains 1440 unprocessed minutes for the fixture’s interrupt run.',
            'The due-events Collection.out gathers occurrences from all three Time Triggers. The first interrupt has one routine occurrence; catch-up from the fixture has six total.'
        ],
        experiments: [{ change: 'Change Advance Time policy from interrupt to catch-up, keeping the 1500-minute duration and limit 12.', expect: 'The proposed destination is absoluteMinute 2280, the next day at 14:00, with no remainder. Six occurrences are due, including both midnight and the eight-hour pulse at minute 1440.' }],
        cases: [
            { when: 'A longer catch-up would exceed the configured occurrence limit.', expect: 'The run stops and reports the limit instead of silently omitting scheduled events.' },
            { when: 'The review is rejected.', expect: 'Neither the clock advance nor the consumed occurrence IDs are saved.' }
        ],
        callBudget: 'No extra model requests. Time projection and triggers calculate their results directly; the workflow generates one ordinary SillyTavern reply.'
    },
    25: {
        goal: 'Award experience for completed objectives and report the levels crossed by the full award. You will project a reusable State rule, prevent duplicate rewards and save the result only with the accepted reply.',
        learn: [
            'State stores values and a ledger of processed occurrence IDs. The ledger prevents the same objective occurrence from earning another reward.',
            'Read File’s Parsed value feeds the state directly; its separate live Reference authorizes the proposed save.',
            'A progression rule describes an authored change: here, add 20 to experience for each confirmed objective, within 0–1000.',
            'Collection threshold compares the original value with the final projected value and reports every threshold crossed.'
        ],
        requirements: [
            'In Workflow › Configure › Workflow Data, create JSON target player-progression with Visibility Public. Paste its fixture into Initial template and choose Save authorization: experience starts at 80 and ledger is empty.',
            'Load the participating Rowan and Iris actors and replace their example avatar IDs. This lesson extracts completed objectives from the generated reply, using lesson 19’s evidence checks.'
        ],
        steps: [
            'Combine lesson 19’s confirmed actions with lesson 17’s proposed file save. Establish an objective such as delivering the harbor chart, then Send a request for the scene where Rowan completes that delivery.',
            'Inspect the generated reply and confirmed events. A plan to deliver the chart is insufficient. Follow the completed action through Event Normalize’s progression mode into State.',
            'Follow Read File.value directly into State.state and the original-experience lookup. Read State.receipt for each processed occurrence. With one new confirmed objective, the fixture projects experience from 80 to 100 and adds its occurrence ID to the ledger.',
            'Inspect Select Fields.out for the original and final experience values, then Collection.out for the thresholds [100,300,600]. The public notes should report crossing 100.',
            'Apply and inspect player-progression: both the experience value and ledger should be saved. Reject a fresh test to confirm that neither changes.'
        ],
        checkpoints: [
            'State.receipt lists the result for each confirmed objective, including duplicate records that earned no additional reward.',
            'Select Fields.out shows the original experience and the final value after all rewards, rather than just one intermediate award.',
            'The threshold Collection.out reports every crossed threshold from that complete before-and-after comparison.'
        ],
        experiments: [{ change: 'In another practice chat, initialize a fresh player-progression document with experience 260 and arrange two distinct completed objectives in the reply.', expect: 'Two confirmed rewards of 20 project a final value of 300 and a crossing at 300. Inspect both receipts and the final comparison; changing Initial template does not reset an already saved progression document.' }],
        cases: [
            { when: 'An already processed occurrence ID repeats.', expect: 'The ledger reports a duplicate and grants no additional experience.' },
            { when: 'No objective is confirmed.', expect: 'Experience stays unchanged and there is no threshold crossing.' },
            { when: 'The experience record is missing or appears ambiguously more than once.', expect: 'The run stops for correction rather than guessing which value to use.' }
        ],
        callBudget: 'Up to four extra model requests: one extraction and up to three Decision checks. State, thresholds and file staging make no model requests. There is also one ordinary SillyTavern reply.'
    },
    26: {
        goal: 'Bring an accepted private memory into the next reply using a shortcut or a player-message keyword. You will queue recall, inspect the selected record and see when the queued request is consumed.',
        learn: [
            'Recall selects unchanged accepted records from an actor-private workflow file. Unlike Prompted Memory in lesson 22, it does not ask a model to choose or invent an episode.',
            'Recall Shortcut queues an activation for a reply, a swipe, or both. One-per-type gives separate available uses for those generation types.',
            'A queued request is consumed on Apply, so rejecting or stopping a reply keeps it available.'
        ],
        requirements: [
            'Select loaded Rowan and replace character:rowan.png with that actor’s actual avatar ID. Establish Rowan’s current participation using the presence work from lesson 21.',
            'In Workflow › Configure › Workflow Data, create JSON target rowan-moments with Visibility Actor private and Rowan’s Actor ID. Paste its fixture into Initial template and Save authorization. Records need id, actorId and text; adjust the example actorId consistently.'
        ],
        steps: [
            'Read the rowan-moments initial template. Confirm that the lighthouse-promise record belongs to Rowan and is the accepted text you intend to reuse.',
            'Read Recall Shortcut settings: target both, uses one-per-type, consumeOn accepted. Queue recall on the relevant node, use Node → Memory recall, or press Ctrl+Shift+M before generating.',
            'For the shortcut test, send: “Rowan walks along the harbor wall.” This avoids the lighthouse keyword. Inspect Recall.records, Recall.report and Generate Reply.guidance for the selected private record.',
            'Reject that reply and check that the queued recall remains available. Try again and Apply: the reply use should now be consumed, with the separate swipe use still available.',
            'Test the other trigger with “Rowan visits the lighthouse.” The actual player-message keyword can activate recall without a queued shortcut. Compare both reports; neither path edits the memory text.'
        ],
        checkpoints: ['Recall.report identifies the accepted private records supplied to guidance and reports the recall activation. Queued consumption stays pending until Apply.'],
        experiments: [{ change: 'Set Recall Shortcut target to swipe. Queue recall, use a player message without lighthouse, and compare a new reply with a new swipe.', expect: 'The queued request can be reserved by the swipe, not the reply. The keyword is a separate trigger, so omit it while testing the shortcut target.' }],
        cases: [
            { when: 'The workflow is only previewed.', expect: 'Preview does not queue a recall request.' },
            { when: 'Rowan is absent or neither activation matches.', expect: 'No private record is supplied to portrayal.' },
            { when: 'A queued reply is rejected or stopped.', expect: 'The available recall use and accepted memory file are preserved.' }
        ],
        callBudget: 'One extra model request checks participation. Recall selection and queued-use tracking make no model requests. There is also one ordinary SillyTavern reply.'
    },
    27: {
        goal: 'Give a broken wand a weighted effect that stays stable on replay. You will confirm one use and resolve either a fixed effect or a checked new effect.',
        learn: [
            'Random Pick ties a weighted draw to the confirmed event ID. Reuse preserves it when that event is processed again.',
            'A fixed library effect needs no effect-writing model. A generate selection calls Effect Author, then Decision checks whether the proposal is distinct and allowed.',
            'Outcome Commit saves the resolved effect in a ledger only with the accepted reply.'
        ],
        requirements: [
            'In Workflow › Configure › Workflow Data, authorize wand-holders, wand-effects and wand-outcomes as Public JSON. Paste their fixtures into Initial template and Save authorization. The map must establish Rowan’s ownership; outcomes starts as [].',
            'Replace Rowan and Iris avatar IDs consistently with loaded actors. Keep libraryId wand-effects, revision r1 and itemId broken-wand. The fixture weights are 80 for blue sparks and 20 for a generated wild effect.'
        ],
        steps: [
            'Combine lesson 20’s confirmed item use with lesson 14’s per-item processing. Send: “Rowan uses the broken wand to cast a spell toward the empty harbor wall.” Include at most one use and two transfers.',
            'Inspect Current Holder.events and Random Pick.out. Record the confirmed event ID, selected effect and frozen library identity.',
            'Follow the resolver helper. A fixed draw supplies blue sparks directly. A wild draw asks Effect Author for one effect with an explicit spellOutcome, duration and consequence, then checks novelty and the mechanical policy.',
            'Inspect the revised narration, notes and Outcome Commit.receipt. The prose should preserve the confirmed use, holder and resolved effect.',
            'Apply and inspect wand-outcomes. That same event reuses its outcome; a new use has a new ID and may draw differently.'
        ],
        checkpoints: [
            'Random Pick.out ties the draw to the confirmed event ID and freezes the effect and library for reuse.',
            'Outcome Commit.receipt proposes the result for wand-outcomes; Apply saves it.'
        ],
        experiments: [{ change: 'Use fixtures/wand-effects.txt in a separate Plain text document and bind Read File to it. Set Parse Effect Library format to text; preserve library, item and revision settings.', expect: 'Both weighted choices remain available. Changing formats does not reroll an existing event; saved documents keep their original format.' }],
        cases: [
            { when: 'A second actual use reaches the resolver.', expect: 'The one-use limit stops the run instead of dropping an effect.' },
            { when: 'Wild-effect novelty is false or null.', expect: 'The invented effect cannot resolve or be saved; the existing draw is retained.' },
            { when: 'Review is rejected.', expect: 'No outcome is saved and the event’s draw is not silently rerolled.' }
        ],
        callBudget: 'Up to seven extra model requests: extraction, three confirmations, wild Effect Author, novelty Decision and narration revision. A fixed effect uses at most five. There is also one ordinary SillyTavern reply.'
    },
    28: {
        goal: 'Let a soul-stealing sword gain a tier from recorded kills. You will add one confirmed victim to a 99-record test ledger, detect the crossing to 100 and revise the narration only when a threshold is crossed.',
        learn: [
            'The soul ledger is the source of the count; a separate stored level cannot drift away from it.',
            'Project Document add-unique uses the victim ID to allow one soul per victim, while retaining the event ID and exact kill evidence.',
            'Collection threshold compares counts before and after the proposed additions. A crossing activates the optional narration revision.'
        ],
        requirements: [
            'In Workflow › Configure › Workflow Data, create JSON target sword-souls with Visibility Public. Paste fixtures/sword-souls-99.json into Initial template and Save authorization. These 99 demonstration records are for the disposable test only.',
            'Use loaded Rowan and Iris as attacker and opponent for this test, replacing both example avatar IDs consistently. Other victims require the corresponding actual actor identities; do not substitute an unlisted name.'
        ],
        steps: [
            'Combine confirmed actions from lesson 19, unique-record saves from lesson 17 and thresholds from lesson 25. Note the fixture’s starting count of 99.',
            'Send a continuation request for a disposable, already resolved combat scene where the reply describes Rowan killing Iris with the soul-stealing sword. Inspect the reply; a threat or intention should not count.',
            'Inspect the exact candidate quote and Decision answer. Follow the confirmed kill into Format: id and victimId should identify Iris, and the quote should match the native reply.',
            'Inspect count-pair.out for before 99 and after 100. Then inspect tier.out against thresholds [100,250,500]. The crossing at 100 should activate the narration pass describing the new tier.',
            'Compare the revision with the original kill: attacker, victim, dialogue and chronology should be preserved. Apply replaces the same sword-souls file that was read; Reject leaves its 99 records unchanged.'
        ],
        checkpoints: [
            'count-pair.out shows 99 before and 100 after one new confirmed victim is proposed for the test ledger.',
            'tier.out derives the new tier and crossing at 100 from those counts. Without a crossing, the original reply survives the skipped revision.'
        ],
        experiments: [{ change: 'Reject the proposed 99-to-100 crossing, then reread sword-souls.', expect: 'The ledger still has 99 entries, and the revised tier narration was not accepted.' }],
        cases: [
            { when: 'The same victim is submitted again with identical evidence.', expect: 'The unique victim record grants no second soul.' },
            { when: 'An existing victim arrives with changed event or source evidence.', expect: 'IDENTITY_CONFLICT stops the run. Compare the records and reconcile the conflict without rewriting prior evidence.' },
            { when: 'The kill is planned, denied or rejected by Decision.', expect: 'No soul is added and no threshold revision is triggered.' }
        ],
        callBudget: 'Up to five extra model requests: one extraction, up to three Decision checks and one revision only if a threshold is crossed. There is also one ordinary SillyTavern reply.'
    },
    29: {
        goal: 'Record separate private perspectives on one shared kiss. You will confirm the action, verify both participants and separately permit each model-authored reflection.',
        learn: [
            'Confirming the observed kiss does not establish consent, future intimacy or either actor’s private feelings.',
            'Actor Context supplies each actor’s own private material. The shared quote stays separate from inner interpretation.',
            'Each file has its own save receipt. One successful save does not guarantee that the other file was saved.'
        ],
        requirements: [
            'Replace both avatar IDs with loaded actors. In Workflow › Configure › Workflow Data, authorize JSON targets rowan-moments and iris-moments as [], with Visibility Actor private and the respective Actor ID. Choose Save authorization for each.',
            'Choose Active SillyTavern or an ordinary connection on Decision’s node bar. Both allowModelAuthoredReflection flags start false; enable each only with that actor’s authoring permission, especially for a player-controlled actor.'
        ],
        steps: [
            'Combine lessons 19, 21 and 17: confirmation, presence and file staging. Prepare a scene where both actors participate and agreed to a brief kiss. If permitted, enable only Rowan’s reflection flag before testing.',
            'Send a continuation request. Inspect the actual kiss quote, kiss-decision answer and confirmed-kiss.out. Planned or remembered intimacy is insufficient.',
            'Inspect Rowan’s Actor Context and reflection inputs: the shared event and Rowan’s records may be included, never Iris’s private history. Both false permission flags skip both reflections.',
            'Inspect sharedQuote and reflectionOrigin in the proposed record. The quote records observation; model-authored labels interpretation. These private records add no public notes.',
            'After Apply, check each file receipt. Rowan’s permitted record should be saved; Iris’s disabled path stays skipped. If permitting both later, inspect both save results.'
        ],
        checkpoints: [
            'confirmed-kiss.out contains the accepted shared-action evidence for the permitted reflection paths.',
            'Rowan’s Write to File.receipt proposes a private rowan-moments record independently of Iris’s receipt.'
        ],
        experiments: [{ change: 'Permit only Rowan’s reflection while both actors are verified present.', expect: 'Only Rowan’s reflection model request and file proposal run; Iris’s private reflection path stays skipped.' }],
        cases: [
            { when: 'No kiss candidate exists or participation is unresolved.', expect: 'The run stops before Review with no private reflections or saves.' },
            { when: 'Decision rejects the kiss.', expect: 'No reflection is requested or staged; the original reply remains available for Review.' },
            { when: 'Decision answers null.', expect: 'Confirm Events reports UNRESOLVED_INPUT before Review; no private reflection or write runs.' },
            { when: 'Either actor is absent.', expect: 'Both private reflection and save paths skip; the original reply remains available.' },
            { when: 'Only one actor’s permission is enabled.', expect: 'Only that actor’s private reflection path may run after both participation checks pass.' },
            { when: 'One private save fails.', expect: 'Inspect each receipt. The accepted reply and other successful file save are not automatically undone.' }
        ],
        callBudget: 'Up to three extra requests by default: extraction, Decision and participation. One permitted reflection raises the maximum to four; both raise it to five. There is also one ordinary SillyTavern reply.'
    },
    30: {
        goal: 'Make Rowan’s feelings toward Iris change gradually through confirmed support and story time. You will inspect private values and pacing limits, then use the proposed state to guide portrayal.',
        learn: [
            'Directional state describes Rowan toward Iris, separately from Iris toward Rowan. Values guide portrayal, never consent or player decisions.',
            'Read File’s Parsed value supplies private state directly to decay, while its separate live Reference authorizes the save.',
            'Cooldowns require story time between rewards; scene/day caps limit gains, and diminishing factors reduce repeated rewards.',
            'Time decay moves values toward zero using accepted Story Clock minutes, rather than messages or wall time.'
        ],
        requirements: [
            'Select loaded Rowan and replace both avatar IDs consistently. In Workflow › Configure › Workflow Data, authorize JSON rowan-relationship with Visibility Actor private and Rowan’s Actor ID. Paste its fixture into Initial template and Save authorization: trust/desire/excitement 0, tension 2, empty ledger.',
            'Keep each row’s subjectId Rowan, objectId Iris and private visibility for Rowan. Authorize story-clock and accept elapsed time using lesson 23.'
        ],
        steps: [
            'Combine lessons 25, 23 and 21: State, time and Character Direction. Establish both actors’ participation, then send: “Rowan finishes repairing Iris’s lantern and hands it back to her.”',
            'Follow Read File.value directly into the decay State.state input, preserving Rowan’s private visibility. Inspect the confirmed interaction. Decay runs first; progression then proposes trust +1, desire +0.1, tension −0.25 and excitement +0.5, subject to pacing.',
            'Read State.receipt for changes and reasons. Cooldowns are trust/desire 1440 minutes, tension 720, excitement 120. For trust/desire/excitement, positive scene caps are 1/0.1/0.5 and day caps 1/0.2/1. Diminishing factors are 1, 0.5 and 0.25.',
            'Inspect Character Direction’s values and Rowan’s reply for gradual reactions that leave player choice open. Apply saves values and pacing records; Reject preserves the previous file.',
            'Accept time using lesson 23, then test without support. Per point, trust/tension ease over 10080 minutes, desire 40320, excitement 480. The first run starts decay at initialMinute 0; the fixture’s minute 780 already eases some tension.'
        ],
        checkpoints: ['State.receipt shows Rowan-toward-Iris values before and after, reward limits, processed occurrence IDs and pending private changes.'],
        experiments: [{ change: 'Save some positive values, accept a week in lesson 23 and run without new support.', expect: 'Trust/tension move one point toward zero, desire 0.25; excitement fades to zero within eight hours. Values cannot drop below zero.' }],
        cases: [
            { when: 'Rowan is absent.', expect: 'Character Direction skips. Authorized selected-actor file access still permits elapsed-time decay to be saved; absence does not invent a supportive interaction.' },
            { when: 'An occurrence repeats or a cooldown applies.', expect: 'No extra reward is granted. Inspect the receipt’s reason instead of inferring progress from repeated prose.' },
            { when: 'Review is rejected.', expect: 'Private values, pacing records and decay timestamps remain unchanged.' }
        ],
        callBudget: 'Up to six extra requests: extraction, three confirmations, participation and private portrayal. State rules, decay and file staging make no model requests. There is also one ordinary SillyTavern reply.'
    }
};
