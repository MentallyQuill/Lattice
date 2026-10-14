import { builder } from './builder.mjs';
import { actor, partner, liveJson, draftEvidence, eventCandidates, confirmEach, cast, present, writeState, unwrapEvent } from './shared.mjs';
const composeCollect = (r, id, sources, phase = 'post') => {
    r.add(id, 'collect', { phase, inputs: sources.map(([slot]) => ({ id: slot, label: slot, required: true })) });
    for (const [slot, node, port = 'out'] of sources)
        r.connect(node, port, id, slot);
    return id;
};
const optionalRevision = (r, condition, instructions) => {
    r.add('level-route', 'branch', { artifactKind: 'draft', phase: 'post' });
    r.connect('generate', 'draft', 'level-route', 'in');
    r.connect(condition, 'out', 'level-route', 'condition');
    r.add('level-polish', 'revise-draft', { scope: 'narration', instructions });
    r.connect('level-route', 'yes', 'level-polish', 'draft');
    r.add('draft-join', 'join', { artifactKind: 'draft', phase: 'post' });
    r.connect('generate', 'draft', 'draft-join', 'base');
    r.connect('level-polish', 'out', 'draft-join', 'optional');
    return ['draft-join', 'out'];
};
export function capstones() {
    const entries = [];
    let r;
    {
        r = builder(27, 'The broken wand: stable randomness with a wild branch', 'Confirm one real wand use and ordered transfers, reuse the event draw, resolve a fixed or novelty-accepted wild effect, guide native prose and settle the outcome only on acceptance.', 'Event-keyed Random Pick, Saved Outcome, Effect Author and Outcome Commit');
        r.add('player', 'player-event-source');
        const candidates = eventCandidates(r, 'player', { itemId: 'broken-wand', phase: 'pre', instructions: 'At most one actual use and two intervening transfers, in order.' }), confirmed = confirmEach(r, candidates, { phase: 'pre' }), holders = liveJson(r, 'holders', 'wand-holders');
        r.add('holder', 'current-holder');
        r.connect(confirmed, 'out', 'holder', 'events');
        r.connect(holders, 'out', 'holder', 'holders');
        r.add('actual-uses', 'collection', { mode: 'filter', fieldPath: ['eventType'], value: 'item-used' });
        r.connect('holder', 'events', 'actual-uses', 'in');
        r.add('library-file', 'read-file', { targetId: 'wand-effects' });
        r.add('library', 'parse-effect-library', {
            format: 'json', libraryId: 'wand-effects', revision: 'r1', itemId: 'broken-wand'
        });
        r.connect('library-file', 'text', 'library', 'in');
        const saved = liveJson(r, 'saved', 'wand-outcomes');
        r.add('pick', 'random-pick', { ledgerId: 'wand-outcomes', rerollPolicy: 'reuse' });
        r.connect('actual-uses', 'out', 'pick', 'events');
        r.connect('library', 'out', 'pick', 'library');
        r.connect(saved, 'out', 'pick', 'saved');
        const ref = r.helper('wand-resolver', 'Resolve one frozen draw', (add, c) => {
            add('wild', 'condition', { path: ['selection', 'kind'], value: 'generate' });
            add('route', 'branch');
            add('author', 'effect-author', { instructions: 'Invent one distinct bounded effect absent from the frozen library. Return explicit spellOutcome, duration and consequence. No permanent death, new ownership or loss of player agency.' });
            add('novelty', 'decision', { questions: { novel: { type: 'noul', instructions: 'Is this proposed effect substantively absent from all library effects and within the explicit mechanical policy? Null holds; exact IDs alone do not establish novelty.' } } });
            add('acceptance', 'select-fields', { fields: [{ name: 'accepted', path: ['answers', 'novel', 'accepted'] }] });
            add('stage', 'stage-outcome');
            add('join', 'join', { inputs: [{ id: 'fixed', label: 'Frozen fixed effect', required: false }, { id: 'wild', label: 'Accepted novel effect', required: false }] });
            c('item', 'out', 'wild', 'in');
            c('item', 'out', 'route', 'in');
            c('wild', 'out', 'route', 'condition');
            c('route', 'yes', 'author', 'in');
            c('author', 'out', 'novelty', 'in');
            c('novelty', 'out', 'acceptance', 'in');
            c('author', 'out', 'stage', 'in');
            c('acceptance', 'out', 'stage', 'novelty');
            c('route', 'no', 'join', 'fixed');
            c('stage', 'out', 'join', 'wild');
            c('join', 'out', 'result', 'in');
        });
        r.add('resolve-effects', 'for-each', {
            helper: ref, limit: 1, requestBoundPerIteration: 2, roleOverrides: { effectAuthor: { profileId: 'lattice:active-sillytavern' }, decision: { profileId: 'lattice:active-sillytavern' } }
        });
        r.connect('pick', 'out', 'resolve-effects', 'in');
        r.guidance('resolve-effects', 'out', 'Narrate only this actual wand use using its frozen fixed or resolved wild effect and confirmed holder. Do not reroll or invent another use.');
        r.add('first-use', 'collection', { mode: 'lookup', fieldPath: ['itemId'], value: 'broken-wand' });
        r.connect('actual-uses', 'out', 'first-use', 'in');
        const one = unwrapEvent(r, 'first-use', 'use');
        r.add('saved-outcome', 'saved-outcome');
        r.connect(one, 'out', 'saved-outcome', 'event');
        r.connect(saved, 'out', 'saved-outcome', 'saved');
        r.add('outcome-commit', 'commit-outcomes', { targetId: 'wand-outcomes' });
        r.connect('resolve-effects', 'out', 'outcome-commit', 'outcomes');
        r.add('polish', 'revise-draft', { scope: 'narration', instructions: 'Clarify the observed wand effect without changing the confirmed use, holder, frozen effect or player choice.' });
        r.connect('generate', 'draft', 'polish', 'draft');
        const summary = composeCollect(r, 'outcome-notes', [['resolved', 'resolve-effects'], ['prior', 'saved-outcome']]);
        r.requirements = ['Authorize public JSON wand-holders as accepted {"broken-wand":"character:rowan.png"}; wand-outcomes as [].', 'Authorize wand-effects JSON {libraryId:"wand-effects",revision:"r1",itemId:"broken-wand",effects:[{id:"sparks",kind:"fixed",weight:80,description:"Blue sparks replace the spell."},{id:"wild",kind:"generate",weight:20}]}.'];
        r.steps = ['The bounded recipe admits one use and up to two transfers; a second use holds rather than silently truncating.', 'Plain-text library exercise: use weights such as 80 | Blue sparks and 20 | @generate:wild, change format to text while preserving library identities.', 'Saved Outcome inspects the same event ledger. Random Pick reuses that draw; rejected review never silently rerolls.', 'Only the generate branch calls Effect Author and novelty Decision. False/null novelty prevents settlement.'];
        r.budget = 'At most 7 auxiliary requests: Item Use extraction 1 + up to 3 confirmations + wild Effect Author 1 + novelty Decision 1 + narration revision 1; fixed branch at most 5. One ordinary native generation.';
        r.check('pick', 'out', 'The event identity keys a stable frozen draw; saved outcomes avoid rerolls.');
        r.check('outcome-commit', 'receipt', 'Resolved outcomes stage to the authorized ledger only on accepted review.');
        entries.push(r.finish(...r.summary(summary, 'out', 'polish', 'out')));
    }
    {
        r = builder(28, 'The soul-stealing sword: an event ledger and a threshold', 'Confirm exact native kills, project an add-unique soul ledger, derive tier from soul count and revise only on the 99-to-100 crossing before accepted same-target persistence.', 'Soul event ledger, before/after count and level threshold');
        const source = draftEvidence(r), candidates = eventCandidates(r, source, { instructions: 'Target only scene-action candidates whose exact quote establishes a completed kill by the soul-stealing sword; preserve the identified victim objectId. At most three.' }), confirmed = confirmEach(r, candidates, { question: 'Does this exact quote establish an actual completed kill by the soul-stealing sword now, with the canonical attacker and victim? Reject proposed, negated, recalled and duplicate kills.' });
        r.add('ledger', 'read-file', { targetId: 'sword-souls' });
        r.add('before-ledger', 'json-decode');
        r.connect('ledger', 'text', 'before-ledger', 'in');
        r.add('before', 'collection', { mode: 'count' });
        r.connect('before-ledger', 'out', 'before', 'in');
        r.add('format', 'format', { phase: 'post', mapping: 'select', fields: [{ name: 'id', path: ['objectId'] }, { name: 'eventId', path: ['eventId'] }, { name: 'attackerId', path: ['actorId'] }, { name: 'victimId', path: ['objectId'] }, { name: 'quote', path: ['evidence', 'text'] }, { name: 'source', path: ['source'] }] });
        r.connect(confirmed, 'out', 'format', 'in');
        r.add('project', 'project-document', { mode: 'add-unique', key: 'id', phase: 'post' });
        r.connect('ledger', 'text', 'project', 'source');
        r.connect('format', 'records', 'project', 'records');
        r.add('after', 'collection', { mode: 'count', phase: 'post' });
        r.connect('project', 'data', 'after', 'in');
        composeCollect(r, 'counts', [['before', 'before'], ['after', 'after']], 'post');
        r.add('count-pair', 'select-fields', { phase: 'post', fields: [{ name: 'before', path: ['0'] }, { name: 'after', path: ['1'] }] });
        r.connect('counts', 'out', 'count-pair', 'in');
        r.add('tier', 'collection', { phase: 'post', mode: 'threshold', thresholds: '[100,250,500]' });
        r.connect('count-pair', 'out', 'tier', 'in');
        r.add('crossed', 'condition', { phase: 'post', path: ['crossings'], operator: 'nonempty' });
        r.connect('tier', 'out', 'crossed', 'in');
        const draft = optionalRevision(r, 'crossed', 'Describe the sword’s new tier after this confirmed soul-count crossing. Preserve the exact kill, actor/victim identity, dialogue and chronology. A count of 99 reaching 100 unlocks the first tier; do not add another kill.');
        r.add('save', 'write-file', { mode: 'replace' });
        r.connect('ledger', 'reference', 'save', 'reference');
        r.connect('project', 'text', 'save', 'text');
        r.connect(confirmed, 'out', 'save', 'evidence');
        r.requirements = ['Create public JSON sword-souls with actual accepted unique soul records. To exercise the boundary use a disposable fixture with 99 existing records; no invented live history.', 'Use loaded canonical attacker/victim avatar IDs and real native evidence; extraction establishes candidates only.'];
        r.steps = ['Inspect count-pair before/after and tier: tier derives from the ledger, never a separate level store.', 'Add-unique canonical victim identity grants one soul per victim; eventId/source/span retain the actual kill evidence. Regenerated narration cannot grant a second soul for the same victim. A repeated victim with changed event/source evidence deliberately holds as IDENTITY_CONFLICT, preserving the existing ledger for human reconciliation. Proposed/negated kills add nothing.', 'Only crossing a threshold triggers the conditional narration pass; ordinary Draft survives a skipped pass.', 'Apply replaces exactly the target read by ledger.reference. Reject preserves the original file and soul count.'];
        r.budget = 'At most 5 auxiliary requests: extraction 1 + up to 3 confirmations + conditional revision 1; one ordinary native generation.';
        r.check('count-pair', 'out', 'The actual accepted ledger count 99 projects 100 for one new confirmed kill.');
        r.check('tier', 'out', 'The crossing and derived tier come from the real before/after counts.');
        entries.push(r.finish(...draft));
    }
    {
        r = builder(29, 'One kiss, two private perspectives', 'Confirm shared native kiss evidence, verify both actors, then separately permit and stage each actor’s private model-authored reflection with independent receipts.', 'Ordinary Decision gate, Actor Context isolation and partial private persistence');
        const source = draftEvidence(r);
        const candidates = eventCandidates(r, source, { instructions: 'At most one scene-action candidate: an actual on-page kiss between Rowan and Iris. Return [] for a plan, recollection, claim or negation.' });
        r.add('one-kiss', 'collection', {
            phase: 'post', mode: 'lookup', fieldPath: ['eventType'], value: 'scene-action'
        });
        r.connect(candidates, 'out', 'one-kiss', 'in');
        const candidate = unwrapEvent(r, 'one-kiss', 'kiss-candidate', 'post');
        r.add('kiss-decision', 'decision', { phase: 'post', questions: { kiss: { type: 'noul', instructions: 'Does this exact canonical candidate evidence establish a kiss actually occurring now between Rowan and Iris? Reject planned, negated or recalled intimacy. Return accepted true, false or null when unresolved; this answer does not establish consent or authorize escalation.' } } });
        r.connect(candidate, 'out', 'kiss-decision', 'in');
        r.add('kiss-gate', 'select-fields', { phase: 'post', fields: [{ name: 'accepted', path: ['answers', 'kiss', 'accepted'] }] });
        r.connect('kiss-decision', 'out', 'kiss-gate', 'in');
        r.add('kiss-record', 'format', { phase: 'post' });
        r.connect(candidate, 'out', 'kiss-record', 'in');
        r.add('confirmed-kiss', 'confirm-events', { phase: 'post', mode: 'single-gate' });
        r.connect('kiss-record', 'records', 'confirmed-kiss', 'events');
        r.connect('kiss-gate', 'out', 'confirmed-kiss', 'decisions');
        const presences = cast(r, source, { phase: 'post', actors: [actor, partner] });
        r.data('presence-policy', [{ match: { status: 'present' }, accepted: true }, { match: { status: 'absent' }, accepted: false }], 'post');
        for (const [key, actorId] of [['rowan', actor], ['iris', partner]]) {
            const live = present(r, presences[actorId], key, 'post');
            for (const [id, wire] of Object.entries(r.graph.wires))
                if (wire.to === key + '-present')
                    delete r.graph.wires[id];
            r.add(key + '-status', 'select-fields', { phase: 'post', fields: [{ name: 'status', path: ['status'] }] });
            r.connect(presences[actorId], 'out', key + '-status', 'in');
            r.add(key + '-presence-policy', 'collection', {
                phase: 'post', mode: 'lookup', fieldPath: ['match'], missingPolicy: 'hold'
            });
            r.connect('presence-policy', 'out', key + '-presence-policy', 'in');
            r.connect(key + '-status', 'out', key + '-presence-policy', 'match');
            r.add(key + '-present', 'select-fields', { phase: 'post', fields: [{ name: 'accepted', path: ['value', 'accepted'] }] });
            r.connect(key + '-presence-policy', 'out', key + '-present', 'in');
            r.data(key + '-permission', { allowModelAuthoredReflection: false }, 'post');
            r.add(key + '-permitted', 'condition', { phase: 'post', path: ['allowModelAuthoredReflection'], value: true });
            r.connect(key + '-permission', 'out', key + '-permitted', 'in');
            r.add(key + '-grant', 'branch', { phase: 'post' });
            r.add(key + '-pair-grant', 'branch', { phase: 'post' });
            r.connect(live, 'yes', key + '-pair-grant', 'in');
            r.connect((key === 'rowan' ? 'iris' : 'rowan') + '-present', 'out', key + '-pair-grant', 'condition');
            r.connect(key + '-pair-grant', 'yes', key + '-grant', 'in');
            r.connect(key + '-permitted', 'out', key + '-grant', 'condition');
            r.add(key + '-context', 'actor-context', { actorId, phase: 'post' });
            r.connect(key + '-grant', 'yes', key + '-context', 'presence');
            r.add(key + '-file', 'read-file', {
                targetId: key + '-moments', actorScope: 'presence', actorId, phase: 'post'
            });
            r.connect(key + '-grant', 'yes', key + '-file', 'presence');
            r.add(key + '-prompt', 'text', { phase: 'post', text: 'Return exactly {reflection:string}. The author explicitly permits private model-authored inner feelings for this actor. Reflect on the one supplied confirmed shared kiss, your own authorized context and your own prior memories. Keep shared observed evidence distinct from your private interpretation; never infer the partner’s private feelings or choose player actions.' });
            r.add(key + '-prompt-gate', 'branch', { artifactKind: 'text', phase: 'post' });
            r.add(key + '-present-prompt', 'branch', { artifactKind: 'text', phase: 'post' });
            r.connect(key + '-prompt', 'out', key + '-present-prompt', 'in');
            r.connect(key + '-present', 'out', key + '-present-prompt', 'condition');
            r.add(key + '-kiss-prompt', 'branch', { artifactKind: 'text', phase: 'post' });
            r.add(key + '-partner-prompt', 'branch', { artifactKind: 'text', phase: 'post' });
            r.connect(key + '-present-prompt', 'yes', key + '-partner-prompt', 'in');
            r.connect((key === 'rowan' ? 'iris' : 'rowan') + '-present', 'out', key + '-partner-prompt', 'condition');
            r.connect(key + '-partner-prompt', 'yes', key + '-kiss-prompt', 'in');
            r.connect('kiss-gate', 'out', key + '-kiss-prompt', 'condition');
            r.connect(key + '-kiss-prompt', 'yes', key + '-prompt-gate', 'in');
            r.connect(key + '-permitted', 'out', key + '-prompt-gate', 'condition');
            r.add(key + '-reflect', 'model-call', { phase: 'post', outputKind: 'data', instructions: 'Private reflection belongs only to ' + actorId + '. Label it model-authored; do not invent another shared action.' });
            r.connect(key + '-prompt-gate', 'yes', key + '-reflect', 'prompt');
            r.connect(key + '-context', 'out', key + '-reflect', 'context');
            r.add(key + '-prior', 'json-decode', { phase: 'post' });
            r.connect(key + '-file', 'text', key + '-prior', 'in');
            composeCollect(r, key + '-material', [['event', 'confirmed-kiss'], ['prior', key + '-prior']], 'post');
            r.connect(key + '-material', 'out', key + '-reflect', 'data');
            composeCollect(r, key + '-parts', [['event', 'confirmed-kiss'], ['reflection', key + '-reflect']], 'post');
            r.add(key + '-record', 'select-fields', { phase: 'post', fields: [{ name: 'id', path: ['0', '0', 'eventId'] }, {
                        name: 'actorId', path: ['authoredActorId'], required: false, default: actorId
                    }, { name: 'text', path: ['1', 'reflection'] }, { name: 'sharedQuote', path: ['0', '0', 'evidence', 'text'] }, { name: 'sceneEvidence', path: ['0', '0', 'evidence'] }, { name: 'reflection', path: ['1', 'reflection'] }, {
                        name: 'reflectionOrigin', path: ['origin'], required: false, default: 'model-authored'
                    }] });
            r.connect(key + '-parts', 'out', key + '-record', 'in');
            r.add(key + '-save', 'write-file', {
                actorScope: 'presence', actorId, mode: 'add-unique', key: 'id'
            });
            r.connect(key + '-grant', 'yes', key + '-save', 'presence');
            r.connect(key + '-file', 'reference', key + '-save', 'reference');
            r.connect(key + '-record', 'out', key + '-save', 'records');
            r.connect('confirmed-kiss', 'out', key + '-save', 'evidence');
        }
        r.requirements = ['Choose an ordinary connection on the Decision node bar or use Active SillyTavern.', 'Replace both canonical avatar IDs with loaded actors; authorize separate actor-private JSON rowan-moments and iris-moments as [].', 'Both per-actor allowModelAuthoredReflection flags default false. Change each separately only when authoring permission exists for that actor, especially a player-controlled actor.'];
        r.cases = [{ when: 'No candidate kiss or unresolved presence', expect: 'This lesson explicitly holds before Review: no private reflection call, file settlement or native publication. Required canonical evidence barriers are not bypassed.' }, { when: 'Decision rejects the evidence', expect: 'No private reflection is called or staged; the original owned Draft remains available for Review.' }, { when: 'Decision returns null', expect: 'Confirm Events holds as UNRESOLVED_INPUT before Review, with no private reflection calls or file writes.' }, { when: 'Either actor is absent', expect: 'Both private model legs and saves are skipped; the owned Draft remains available. Both actors must be genuinely present before either reflection is eligible.' }, { when: 'Only one actor permission is enabled', expect: 'Only that present actor may request and stage a private reflection; the other private leg is skipped.' }, { when: 'One private save fails', expect: 'Each receipt remains independently durable; native publication and the other accepted save do not imply an atomic rollback.' }];
        r.steps = ['No candidate kiss or unresolved actor presence deliberately holds before Review. Rejected kiss evidence preserves the original Draft with no private reflection calls or saves; a null Decision answer holds Confirm Events before Review. Inspect the gate instead of treating the scene as accepted intimacy.', 'The shared quote/source/span are observed evidence; reflectionOrigin remains model-authored.', 'Both actors must first be verified present. After that shared prerequisite, each permitted leg reads only its own Actor Context and private target; no private text enters public notes.', 'Review separate receipts: native publication and each actor file have independent durability; one failed file is not an atomic rollback of both.'];
        r.budget = 'Default at most 3 auxiliary requests: extraction 1 + ordinary Decision 1 + cast 1. With both explicit permissions at most 5, adding one private reflection request per present actor. One ordinary native generation.';
        r.check('confirmed-kiss', 'out', 'Only accepted exact shared native kiss evidence can authorize the two independently permitted legs.');
        r.check('rowan-save', 'receipt', 'Rowan’s pending private receipt is independent of Iris’s receipt.');
        entries.push(r.finish());
    }
    {
        r = builder(30, 'A relationship that changes slowly over weeks', 'Use directional private generic State with confirmed interactions, caps, cooldowns, diminishing returns and accepted story-time decay to guide NPC portrayal without choosing the player response.', 'Directional State progression pacing and Story Clock decay');
        r.add('player', 'player-event-source');
        const candidates = eventCandidates(r, 'player', { phase: 'pre', instructions: 'At most three scene-action candidates for a genuinely completed supportive interaction by Rowan toward Iris. Exact quote and canonical actor/object IDs are required.' }), confirmed = confirmEach(r, candidates, { phase: 'pre' });
        r.add('scene', 'scene-context', { visibilityMode: 'public', includeCharacter: false });
        const presence = cast(r, 'scene', { context: true })[actor], live = present(r, presence, 'rowan');
        r.add('relationship-state-file', 'read-file', { targetId: 'rowan-relationship', actorScope: 'selected', actorId: '' }, 'authorized live state');
        r.add('clock', 'story-clock', { clockId: 'story-clock', calendarId: 'campaign-days' });
        r.data('decay-rules', [['trust', 10080], ['desire', 40320], ['tension', 10080], ['excitement', 480]].map(([dimension, minutes]) => ({
            decayId: dimension + '-eases', revision: 1, targetKey: 'rowan-toward-iris-' + dimension, subjectId: actor, objectId: partner, baseline: 0, unitsPerMinute: 1 / minutes, min: 0, max: 10, initialMinute: 0
        })));
        r.add('decay', 'state', { mode: 'time-decay' });
        r.connect('relationship-state-file', 'value', 'decay', 'state');
        r.connect('decay-rules', 'out', 'decay', 'rules');
        r.connect('clock', 'out', 'decay', 'clock');
        r.data('relationship-rules', {
            ruleSetId: 'slow-relationship', revision: 1, dayLengthMinutes: 1440, rules: [['trust', 1, 1, 1, 1440], ['desire', .1, .1, .2, 1440], ['tension', -.25, 0, 0, 720], ['excitement', .5, .5, 1, 120]].map(([dimension, amount, sceneCap, dayCap, cooldown]) => ({
                ruleId: dimension + '-support', eventType: 'supportive-interaction', targetKey: 'rowan-toward-iris-' + dimension, subjectId: actor, objectId: partner, identityFields: ['occurrenceId'], mode: 'add', amount, min: 0, max: 10, positiveSceneCap: sceneCap, positiveDayCap: dayCap, cooldownMinutes: cooldown, diminishingFactors: [1, .5, .25], zeroDeltaPolicy: 'consume', repeatOnZero: false, cooldownOnZero: false
            }))
        });
        r.add('interaction-events', 'event-normalize', { mode: 'progression', eventType: 'supportive-interaction' });
        r.connect(confirmed, 'out', 'interaction-events', 'events');
        r.connect('clock', 'out', 'interaction-events', 'clock');
        r.add('relationship', 'state', { mode: 'progression' });
        r.connect('decay', 'out', 'relationship', 'state');
        r.connect('relationship-rules', 'out', 'relationship', 'rules');
        r.connect('interaction-events', 'out', 'relationship', 'events');
        r.add('portrayal', 'character-direction', { actorId: actor, systemPrompt: 'Portray only Rowan using the supplied explicit directional trust, desire, tension and temporary excitement values and authorized private context. Keep trust/desire gradual, tension nuanced and temporary excitement brief. Values influence NPC portrayal only; they never establish consent or settled player feelings, choose player actions, or force escalation. Keep the player choice explicit.' });
        r.connect(live, 'yes', 'portrayal', 'presence');
        r.connect('relationship', 'out', 'portrayal', 'data');
        r.connect('portrayal', 'out', 'generate', 'guidance');
        writeState(r, 'relationship', 'relationship-state-file');
        r.requirements = ['Select native Rowan and replace actual avatar IDs. Authorize actor-private JSON rowan-relationship as {values:[...] ,ledger:[]}; include keys rowan-toward-iris-trust, rowan-toward-iris-desire, rowan-toward-iris-tension and rowan-toward-iris-excitement, each with subjectId Rowan, objectId Iris, visibility {kind:actor-private,actorId:Rowan}, and initial values 0,0,2,0 respectively.', 'Authorize genuine story-clock; advance accepted elapsed story time using lesson 23, not message count or wall time.'];
        r.steps = ['The direction Rowan→Iris is separate from Iris→Rowan; this root portrays only the selected NPC.', 'Authored support gains trust 1, desire 0.1 and temporary excitement 0.5; tension eases 0.25. Trust/desire cooldown 1440 minutes, tension 720, excitement 120; scene/day caps and diminishing factors 1, .5, .25 prevent fast escalation. Duplicate occurrence IDs do not progress.', 'Accepted story-time decay returns trust/tension toward baseline by one point per 10080 minutes (week), desire per 40320 minutes (four weeks), and temporary excitement per 480 minutes (eight hours).', 'The selected actor grants lawful private file access independently of scene presence. Presence gates Character Direction only. While Rowan is absent, accepted elapsed-time decay can still update and persist authorized private state; no absent interaction is inferred or awarded.', 'Private state and portrayal Guidance stay actor-scoped; Apply persists the proposed state and pacing ledgers. Rejection preserves them.'];
        r.budget = 'At most 6 auxiliary requests: interaction extraction 1 + up to 3 confirmations + cast 1 + private portrayal 1; one ordinary native generation. State rules, decay and file staging are deterministic.';
        r.cases = [{ when: 'The selected actor is absent', expect: 'Character Direction is skipped. Selected-actor file access remains authorized; accepted elapsed-time decay may persist, but absent participation never creates a confirmed interaction reward.' }, { when: 'The same occurrence repeats or its cooldown is active', expect: 'Identity ledger, caps and diminishing returns prevent extra progression.' }, { when: 'Review is rejected', expect: 'Private state, pacing and decay timestamps remain unchanged.' }];
        r.check('relationship', 'receipt', 'Directional before/after, pacing reasons and identity ledger remain a pending private proposal.');
        entries.push(r.finish());
    }
    return entries;
}
