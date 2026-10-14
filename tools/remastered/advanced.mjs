import { builder } from './builder.mjs';
import { actor, partner, liveJson, draftEvidence, eventCandidates, confirmEach, cast, present, writeState, unwrapEvent } from './shared.mjs';
export function advanced() {
    const entries = [];
    let r;
    {
        r = builder(18, 'Let existing memories shape the next reply', 'Read genuine actor memory, reflect and express private portrayal Guidance; internalize only already settled events and stage accepted Commit.', 'Memory Read/Recall, Reflect, Express, Internalize and Commit');
        r.add('context', 'scene-context', { visibilityMode: 'public', includeCharacter: false }, 'public observations');
        r.add('state', 'memory', { mode: 'read', view: 'state' });
        r.add('recall-query', 'text', { text: 'lighthouse' }, 'episode search');
        r.add('episodes', 'memory', { mode: 'recall', query: 'current scene', limit: 4 });
        r.connect('recall-query', 'out', 'episodes', 'query');
        r.add('settled', 'memory', { mode: 'read', view: 'events', phase: 'post' });
        r.add('reflect', 'reflect', { mode: 'character', instructions: 'Treat private state as this selected actor’s perspective. Preserve uncertainty and observed facts.' });
        r.connect('context', 'out', 'reflect', 'context');
        r.connect('state', 'out', 'reflect', 'state');
        r.connect('episodes', 'out', 'reflect', 'episodes');
        r.add('express', 'express', { instructions: 'Offer restrained portrayal hints for this selected actor; never decide the player action.' });
        r.connect('reflect', 'out', 'express', 'assessment');
        r.add('express-material', 'collect', { artifactKind: 'guidance', inputs: [{ id: 'behavior', label: 'Private deterministic behavior hints', required: true }] });
        r.connect('express', 'out', 'express-material', 'behavior');
        const memoryPresence = cast(r, 'context', { context: true })[actor];
        r.add('memory-direction', 'character-direction', { actorId: actor, systemPrompt: 'Use only the supplied private Express behavior hints and genuine authorized actor context for restrained NPC portrayal. Reflection is an interpretation, not a settled fact. Do not choose player actions or reveal private records publicly.' });
        r.connect(memoryPresence, 'out', 'memory-direction', 'presence');
        r.connect('express-material', 'out', 'memory-direction', 'data');
        r.connect('memory-direction', 'out', 'generate', 'guidance');
        r.add('internalize', 'internalize', { phase: 'post', instructions: 'Propose updates only from genuine settled events supplied by Memory Read. Empty or unsettled evidence grants no new history.' });
        r.connect('state', 'out', 'internalize', 'state');
        r.connect('settled', 'out', 'internalize', 'events');
        r.add('commit', 'memory', { mode: 'commit', idempotencyKey: 'lattice-memory-commit' });
        r.connect('internalize', 'out', 'commit', 'proposal');
        r.requirements = ['Select native Rowan and replace character:rowan.png consistently with the selected loaded actor identity. Use actual existing native memory state/episodes/events; imported files cannot create native private authority.'];
        r.steps = ['Inspect the lighthouse Text query wire, Read state, Recall episodes and the event record provenance. Connected Query overrides the saved query.', 'Express renders private hints deterministically; Collect retains their typed Guidance as private Data for the verified Character Direction native producer.', 'Post Memory Read captures the exact just-generated native event evidence; Internalize remains a pending proposal and Commit settles only on accepted review.'];
        r.budget = 'At most 4 auxiliary requests: Reflect, current participation interpretation, Character Direction and post Internalize. Express behavior and native Memory read/recall/commit are deterministic. One ordinary native generation.';
        r.check('internalize', 'out', 'A private proposal descends from genuine settled memory events; rejection leaves memory unchanged.');
        entries.push(r.finish());
    }
    {
        r = builder(19, 'Turn narrated actions into confirmed events', 'Normalize exact native body evidence against closed canonical identities, then deliberately confirm each actual event.', 'Draft Event Source, Event Normalize, Decision, Confirm Events');
        const source = draftEvidence(r), candidates = eventCandidates(r, source, { eventType: 'scene-action', instructions: 'Collect only actions involving the listed actors, at most three.' }), confirmed = confirmEach(r, candidates);
        r.requirements = ['Replace canonical Rowan/Iris avatar IDs with actors actually loaded in this disposable story.'];
        r.steps = ['Native Draft Event Source owns the unchanged body, source revision and exact evidence spans.', 'The extraction model yields candidates; confirmation alone can mark an actual event confirmed.', 'A negated, proposed or uncertain action is excluded or holds; notes never establish canon.'];
        r.budget = 'At most 4 auxiliary requests: 1 candidate extraction + up to 3 Decision confirmations; one ordinary native generation.';
        r.check(confirmed, 'out', 'Only exact, actual, accepted occurrences reach public event notes.');
        entries.push(r.finish(...r.summary(confirmed)));
    }
    {
        r = builder(20, 'React when an item is actually used', 'Confirm ordered player item uses and transfers, resolve the actual holder, and guide consequences before generation.', 'Player Event Source, Item Use Trigger, Current Holder');
        r.add('player', 'player-event-source');
        const candidates = eventCandidates(r, 'player', { itemId: 'signal-lantern', phase: 'pre', instructions: 'Extract at most three actual uses/transfers in source order; exclude mere mentions.' }), confirmed = confirmEach(r, candidates, { phase: 'pre' }), holders = liveJson(r, 'holders', 'accepted-item-holders');
        r.add('holder', 'current-holder');
        r.connect(confirmed, 'out', 'holder', 'events');
        r.connect(holders, 'out', 'holder', 'holders');
        r.add('actual-uses', 'collection', { mode: 'filter', fieldPath: ['eventType'], value: 'item-used' });
        r.connect('holder', 'events', 'actual-uses', 'in');
        r.guidance('actual-uses', 'out', 'Resolve the supplied ordered confirmed signal-lantern uses for their actual holders. Do not invent another use or choose the player’s next action.');
        r.requirements = ['accepted-item-holders contains {"signal-lantern":"character:rowan.png"} only when this is established accepted ownership. Replace avatar IDs for this story.'];
        r.steps = ['Trace the new real player message through extraction and bounded confirmation.', 'Current Holder applies intervening confirmed transfers in order; mention alone does not establish use.'];
        r.budget = 'At most 4 auxiliary requests: 1 Item Use Trigger extraction + up to 3 Decision confirmations; one ordinary native generation.';
        r.check('holder', 'events', 'Confirmed uses receive actual holder IDs after ordered transfers.');
        entries.push(r.finish());
    }
    {
        r = builder(21, 'Give one present character their own direction', 'Verify current participation and give the selected native actor a literal private portrayal system prompt.', 'Scene Presence and Character Direction');
        r.add('scene', 'scene-context', { visibilityMode: 'public', includeCharacter: false });
        const presence = cast(r, 'scene', { context: true })[actor];
        r.add('direction', 'character-direction', { actorId: actor, systemPrompt: 'Portray Rowan with patient attention to concrete evidence and restrained humor. Preserve the player’s agency. These instructions apply only while Rowan participates.' });
        r.connect(presence, 'out', 'direction', 'presence');
        r.connect('direction', 'out', 'generate', 'guidance');
        r.requirements = ['Select native Rowan and replace character:rowan.png with the actual loaded canonical avatar ID.'];
        r.steps = ['Inspect cast evidence; name mention or character-card text cannot establish presence.', 'Character Direction.systemPrompt is literal, separately authored text for this actor.', 'Absent skips the direction; unresolved holds. The private result may guide only the selected native actor.'];
        r.budget = 'At most 2 auxiliary requests: 1 participation interpretation + 1 Character Direction only if present; one ordinary native generation.';
        r.check('direction', 'out', 'Only the genuinely present selected native actor contributes private Guidance.');
        entries.push(r.finish());
    }
    {
        r = builder(22, 'Let an item remind its actual holder', 'Match a real item mention, use explicit accepted ownership, and stage one private prompted memory for the actual holder.', 'Item Mention Trigger and Prompted Memory');
        const mentionSource = draftEvidence(r, 'mention-source');
        r.data('entities', { actorIds: [actor, partner], itemIds: ['signal-lantern'] });
        r.add('mention', 'item-mention-trigger', {
            actorId: actor, itemId: 'signal-lantern', aliases: ['signal lantern', 'lantern'], watch: 'draft', activation: 'once-per-source'
        });
        r.connect(mentionSource, 'out', 'mention', 'source');
        r.connect('entities', 'out', 'mention', 'entities');
        const holders = liveJson(r, 'holders', 'accepted-item-holders');
        r.add('holder', 'current-holder');
        r.connect('mention', 'out', 'holder', 'events');
        r.connect(holders, 'out', 'holder', 'holders');
        r.add('actor-events', 'collection', { mode: 'filter', fieldPath: ['holderId'], value: actor });
        r.connect('holder', 'events', 'actor-events', 'in');
        r.add('event-count', 'collection', { mode: 'count' });
        r.connect('actor-events', 'out', 'event-count', 'in');
        r.add('has-event', 'condition', { operator: 'greater-than', value: 0 });
        r.connect('event-count', 'out', 'has-event', 'in');
        r.add('mention-route', 'branch');
        r.connect('actor-events', 'out', 'mention-route', 'in');
        r.connect('has-event', 'out', 'mention-route', 'condition');
        r.add('one-event', 'collection', { mode: 'lookup', fieldPath: ['holderId'], value: actor });
        r.connect('mention-route', 'yes', 'one-event', 'in');
        const event = unwrapEvent(r, 'one-event', 'owned-mention'), presence = cast(r, mentionSource, { phase: 'post' })[actor], live = present(r, presence, 'rowan');
        r.add('remember', 'prompted-memory', {
            actorId: actor, mode: 'recall', allowCreate: false, prompt: 'Select one of Rowan’s supplied authorized existing memories associated with the signal lantern. No invented memory or partner’s private history.'
        });
        r.connect(event, 'out', 'remember', 'event');
        r.connect(live, 'yes', 'remember', 'presence');
        r.add('memories', 'read-file', { targetId: 'rowan-item-memories', actorScope: 'presence', actorId: actor });
        r.connect(live, 'yes', 'memories', 'presence');
        r.add('save', 'write-file', {
            actorScope: 'presence', actorId: actor, mode: 'add-unique', key: 'eventId'
        });
        r.connect(live, 'yes', 'save', 'presence');
        r.connect('memories', 'reference', 'save', 'reference');
        r.connect('remember', 'out', 'save', 'records');
        r.connect(event, 'out', 'save', 'evidence');
        r.requirements = ['Select native Rowan and existing accepted native memory episodes associated with the signal lantern. Prompted Memory recall reads that host episode store; the output file cannot seed native memory authority.', 'Accepted item-holders must identify Rowan as holder; a mention by another actor grants no ownership. Create actor-private JSON Workflow Data rowan-item-memories as an initially empty output array.'];
        r.steps = ['This reminder pipeline watches the exact just-generated owned native Draft, after generation. A real on-page signal-lantern mention triggers current post presence, native episode recall and private save staging. It stages a remembered event for later portrayal; it does not inject Guidance into this generation.', 'This root is scoped to Rowan: another holder yields no matching private proposal.', 'Default recall/allowCreate false requires existing permitted memories; a checked model no-match skips the reminder and save while the ordinary reply remains reviewable. No available authorized memories holds recall before a request. Opt-in exercise may explicitly permit a new pending invented memory.', 'Review the private receipt separately; private memory never enters public notes.'];
        r.budget = 'At most 2 auxiliary requests: cast interpretation and prompted memory when holder/presence match; one ordinary native generation.';
        r.check('save', 'receipt', 'Only Rowan’s private target receives a pending memory with canonical mention evidence.');
        for (const n of Object.values(r.graph.nodes))
            if (!['send', 'generate', 'review', 'player'].includes(n.id))
                n.phase = 'post';
        entries.push(r.finish());
    }
    {
        r = builder(23, 'Advance the story clock when the scene is accepted', 'Project an explicit forward story duration from a real Story Clock and commit only on accepted review.', 'Story Clock, Advance Time proposal, Clock Commit');
        r.add('clock', 'story-clock', { clockId: 'story-clock', calendarId: 'campaign-days' });
        r.data('duration', { kind: 'duration', minutes: 60, evidence: { kind: 'authored-rule', origin: 'agreed-hour-of-travel' } });
        r.add('advance', 'advance-time', { policy: 'catch-up', limit: 16 });
        r.connect('clock', 'out', 'advance', 'clock');
        r.connect('duration', 'out', 'advance', 'proposal');
        r.guidance('advance', 'report', 'Continue the scene after this explicit agreed travel duration. Story minutes are independent of message count and wall time.');
        r.add('commit-clock', 'commit-clock');
        r.connect('advance', 'report', 'commit-clock', 'projection');
        r.connect('advance', 'occurrences', 'commit-clock', 'occurrences');
        r.requirements = ['Create/authorize Story Clock Workflow Data story-clock with calendarId campaign-days, dayLengthMinutes 1440, accepted absoluteMinute and positive revision.'];
        r.steps = ['Edit the sixty-minute authored proposal only to an actually agreed duration.', 'Inspect previous/effective clock, report and remainder. Reject leaves the accepted clock untouched.'];
        r.check('commit-clock', 'receipt', 'Clock settlement is pending; Apply advances the genuine accepted clock once.');
        entries.push(r.finish());
    }
    {
        r = builder(24, 'Make curses and routines happen on schedule', 'Project a finite duration through midnight, daily 14:00 and an origin-anchored eight-hour recurrence; preserve interrupts and consumed identities.', 'Time Trigger schedules and bounded catch-up');
        r.add('clock', 'story-clock', { clockId: 'story-clock', calendarId: 'campaign-days' });
        r.data('duration', { kind: 'duration', minutes: 1500, evidence: { kind: 'authored-rule', origin: 'agreed-rest' } });
        const schedules = [{
                scheduleId: 'midnight-curse', revision: 1, kind: 'daily', minuteOfDay: 0
            }, {
                scheduleId: 'daily-routine', revision: 1, kind: 'daily', minuteOfDay: 840
            }, {
                scheduleId: 'eight-hour-pulse', revision: 1, kind: 'interval', anchorMinute: 0, intervalMinutes: 480
            }];
        r.add('advance', 'advance-time', { policy: 'interrupt', schedules, limit: 12 });
        r.connect('clock', 'out', 'advance', 'clock');
        r.connect('duration', 'out', 'advance', 'proposal');
        r.add('due', 'collect', { inputs: schedules.map((s, i) => ({ id: 'schedule-' + i, label: s.scheduleId, required: true })) });
        for (const [i, s] of schedules.entries()) {
            const id = 'trigger-' + i;
            r.add(id, 'time-trigger', {
                scheduleId: s.scheduleId, scheduleRevision: 1, mode: s.kind, clockId: 'story-clock', calendarId: 'campaign-days', ...(s.kind === 'daily' ? { minuteOfDay: s.minuteOfDay } : { anchorMinute: 0, intervalMinutes: 480 }), limit: 12
            });
            r.connect('clock', 'out', id, 'previous');
            r.connect('advance', 'clock', id, 'destination');
            r.connect(id, 'occurrences', 'due', 'schedule-' + i);
        }
        r.add('due-events', 'collection', { mode: 'flatten' });
        r.connect('due', 'out', 'due-events', 'in');
        r.guidance('due-events', 'out', 'Apply only these due scheduled occurrences at the effective interruption point. Do not spend the unprocessed remainder or choose the player response.');
        r.add('commit-clock', 'commit-clock');
        r.connect('advance', 'report', 'commit-clock', 'projection');
        r.connect('advance', 'occurrences', 'commit-clock', 'occurrences');
        r.requirements = ['Authorize story-clock as in lesson23. midnight=0, 14:00=840, eight hours=480 anchored at origin0.'];
        r.steps = ['Default interrupt stops at the first due boundary and reports a remaining duration.', 'Switch to catch-up only to enumerate all due events within limit12.', 'Story Clock consumed identities prevent duplicate due events on accepted replay; no wall-clock timer is used.'];
        r.check('advance', 'remainder', 'The explicit unprocessed duration survives an interrupt.');
        r.check('due-events', 'out', 'Three genuine Time Triggers supply finite ordered occurrences for accepted settlement.');
        entries.push(r.finish());
    }
    {
        r = builder(25, 'Award experience from confirmed progress', 'Project generic authored State rules from confirmed native objectives with identity-ledger deduplication and accepted persistence.', 'State progression rules, Collection thresholds and identity ledger');
        const source = draftEvidence(r), candidates = eventCandidates(r, source, { eventType: 'scene-action', instructions: 'Extract only an explicitly completed objective with exact evidence; at most three.' }), confirmed = confirmEach(r, candidates);
        r.add('progression-file', 'read-file', { targetId: 'player-progression' }, 'authorized live state');
        r.data('rules', { ruleSetId: 'objective-rewards', revision: 1, rules: [{
                    ruleId: 'completed-objective', eventType: 'objective-completed', targetKey: 'experience', identityFields: ['occurrenceId'], mode: 'add', amount: 20, min: 0, max: 1000
                }] });
        r.add('progress-events', 'event-normalize', { mode: 'progression', eventType: 'objective-completed', phase: 'post' });
        r.connect(confirmed, 'out', 'progress-events', 'events');
        r.add('award', 'state', { mode: 'progression', phase: 'post' });
        r.connect('progression-file', 'value', 'award', 'state');
        r.connect('rules', 'out', 'award', 'rules');
        r.connect('progress-events', 'out', 'award', 'events');
        r.add('before-experience', 'collection', {
            phase: 'post', mode: 'lookup', collectionPath: ['values'], fieldPath: ['key'], value: 'experience'
        });
        r.connect('progression-file', 'value', 'before-experience', 'in');
        r.add('after-experience', 'collection', {
            phase: 'post', mode: 'lookup', collectionPath: ['values'], fieldPath: ['key'], value: 'experience'
        });
        r.connect('award', 'out', 'after-experience', 'in');
        r.add('experience-pair', 'collect', { phase: 'post', inputs: [{ id: 'before', label: 'Original experience', required: true }, { id: 'after', label: 'Final projected experience', required: true }] });
        r.connect('before-experience', 'out', 'experience-pair', 'before');
        r.connect('after-experience', 'out', 'experience-pair', 'after');
        r.add('change', 'select-fields', { phase: 'post', fields: [{ name: 'before', path: ['0', 'value', 'value'] }, { name: 'after', path: ['1', 'value', 'value'] }] });
        r.connect('experience-pair', 'out', 'change', 'in');
        r.add('levels', 'collection', { phase: 'post', mode: 'threshold', thresholds: '[100,300,600]' });
        r.connect('change', 'out', 'levels', 'in');
        writeState(r, 'award', 'progression-file');
        r.requirements = ['Public JSON player-progression starts {"values":[{"key":"experience","value":80}],"ledger":[]}. Replace actor IDs for actual participants.'];
        r.steps = ['An occurrence identity earns at most one rule award; replay reuses the identity ledger.', 'Collection compares the original experience to the final projected experience after every confirmed objective. The default 80→100 crosses 100; an initial 260 plus two rewards of 20 reaches 300 and crosses 300.', 'No confirmed objective preserves the original experience and produces no threshold crossing. Missing or ambiguous experience records hold; no receipt position is assumed.'];
        r.budget = 'At most 4 auxiliary requests: 1 extraction + up to 3 confirmations; one ordinary native generation.';
        r.check('award', 'receipt', 'Ordered per-event receipts and duplicate status come from generic authored rules.');
        r.check('change', 'out', 'The original and final experience values include every ordered confirmed reward.');
        r.check('levels', 'out', 'All thresholds crossed by the complete before→after projection appear in notes.');
        entries.push(r.finish(...r.summary('levels')));
    }
    {
        r = builder(26, 'Recall a memory with a hotkey or a story trigger', 'Recall unchanged accepted actor records using a real shortcut or real player keyword while consuming activation only on acceptance.', 'Recall and Recall Shortcut reply/swipe/both');
        r.add('scene', 'scene-context', { visibilityMode: 'public', includeCharacter: false });
        const presence = cast(r, 'scene', { context: true })[actor];
        r.add('player', 'player-event-source');
        r.add('memories-file', 'read-file', { targetId: 'rowan-moments', actorScope: 'selected', actorId: '' });
        r.add('memories', 'json-decode');
        r.connect('memories-file', 'text', 'memories', 'in');
        r.add('hotkey', 'hotkey-arm', {
            actorId: actor, memorySetId: 'rowan-moments', target: 'both', uses: 'one-per-type', consumeOn: 'accepted'
        });
        r.add('recall', 'recall', {
            actorId: actor, memorySetId: 'rowan-moments', activation: 'armed-or-keyword', keywords: ['lighthouse'], target: 'both'
        });
        r.connect('memories', 'out', 'recall', 'records');
        r.connect(presence, 'out', 'recall', 'presence');
        r.connect('player', 'out', 'recall', 'source');
        r.connect('recall', 'out', 'generate', 'guidance');
        r.requirements = ['Select native Rowan; replace canonical avatar ID. Authorize actor-private JSON rowan-moments with accepted Recall-compatible {id,actorId,text} records.'];
        r.steps = ['Recall Shortcut configures Ctrl+Shift+M; use Queue recall on a relevant node, Node → Memory recall, or the shortcut before an owned generation. Preview never queues recall.', 'Use target reply/swipe/both deliberately; this default one-per-type consumes only on Apply.', 'The keyword watches real player text; rejected or stopped replies retain the queued recall request.'];
        r.budget = '1 auxiliary cast interpretation; Recall tokenization and accepted activation settlement make no model requests. One ordinary native generation.';
        r.check('recall', 'report', 'Selected accepted records retain provenance, private scope and pending consumption.');
        entries.push(r.finish());
    }
    return entries;
}
