import { builder } from './builder.mjs';
const optionalDraft = (r, branch, port) => {
    r.add('draft-join', 'join', { artifactKind: 'draft', phase: 'post' });
    r.connect('generate', 'draft', 'draft-join', 'base');
    r.connect(branch, port, 'draft-join', 'optional');
    return ['draft-join', 'out'];
};
export function composition() {
    const entries = [];
    let r;
    {
        r = builder(9, 'Show a travel card only when there is a destination', 'Conditionally add a travel card while preserving an ordinary Draft when no destination is authored.', 'Condition, Branch and Join');
        r.data('route', { destination: 'North Harbor', landmark: 'the dark lighthouse' });
        r.add('has-destination', 'condition', { path: ['destination'], operator: 'nonempty' });
        r.connect('route', 'out', 'has-destination', 'in');
        r.add('travel-route', 'branch', { artifactKind: 'text', phase: 'post' });
        r.connect('has-destination', 'out', 'travel-route', 'condition');
        const noted = r.summary('route');
        r.connect('notes', 'out', 'travel-route', 'in');
        for (const [id, w] of Object.entries(r.graph.wires))
            if (w.from === 'notes' && w.to === 'append')
                delete r.graph.wires[id];
        r.connect('travel-route', 'yes', 'append', 'section');
        const output = optionalDraft(r, ...noted);
        r.steps = ['Edit the authored destination; empty string chooses the no route.', 'Condition controls Branch; the optional card reaches Join after the base Draft.', 'Missing destination is unresolved and deliberately holds Join; inspect Branch.unresolved.'];
        r.check('travel-route', 'yes', 'A nonempty destination produces a card; no destination skips the optional contribution.');
        r.experiments = [{ change: 'Set destination to an empty string.', expect: 'The native Draft remains reviewable without the travel card.' }, { change: 'Remove destination.', expect: 'The explicit unresolved route holds review; resolve the missing input.' }];
        entries.push(r.finish(...output));
    }
    {
        r = builder(10, 'Decide whether this scene needs a recap', 'Ask a semantic yes/no question, then route an optional recap with a visible unresolved result.', 'Decision structured semantic answer');
        r.add('body', 'draft-text');
        r.connect('generate', 'draft', 'body', 'draft');
        r.add('recap-decision', 'decision', { inputKind: 'text', phase: 'post', questions: { recap: { type: 'noul', instructions: 'Does this scene contain at least three distinct completed actions that would benefit from a short public recap? Answer null when unclear.' } } });
        r.connect('body', 'out', 'recap-decision', 'in');
        r.add('accepted', 'select-fields', { phase: 'post', fields: [{ name: 'accepted', path: ['answers', 'recap', 'accepted'] }] });
        r.connect('recap-decision', 'out', 'accepted', 'in');
        r.add('recap-route', 'branch', { artifactKind: 'draft', phase: 'post' });
        r.connect('generate', 'draft', 'recap-route', 'in');
        r.connect('accepted', 'out', 'recap-route', 'condition');
        r.add('recap', 'extract', { phase: 'post', instructions: 'Return concise records of the distinct public actions in this exact narrative with literal evidence.' });
        r.connect('recap-route', 'yes', 'recap', 'source');
        const noted = r.notes('recap');
        r.budget = 'Up to 2 auxiliary requests: 1 Decision, plus 1 Extract only on yes; one ordinary native generation.';
        r.steps = ['Inspect answers.recap.accepted as true, false or null.', 'False skips the recap; null takes the explicit unresolved route and preserves the native Draft without claiming semantic acceptance.'];
        r.check('recap-decision', 'out', 'The semantic answer is structured; uncertain scenes remain unresolved.');
        const joined = optionalDraft(r, ...noted);
        r.graph.nodes['draft-join'].inputs.push({ id: 'unresolved', label: 'Unresolved: retain native Draft', required: false });
        r.connect('recap-route', 'unresolved', 'draft-join', 'unresolved');
        entries.push(r.finish(...joined));
    }
    {
        r = builder(11, 'Detect a promise with Decision', 'Use an ordinary Decision with explicit accepted, rejected and unresolved routes for promise detection.', 'Decision, Select Fields and Branch');
        r.add('promise-text', 'text', { text: 'I promise to bring your lantern back tomorrow.' });
        r.add('promise-decision', 'decision', { inputKind: 'text', questions: { promise: { type: 'noul', instructions: 'Does this exact text contain an explicit promise by its speaker? A hope or hypothetical promise is insufficient. Return accepted true, false or null when unresolved.' } } });
        r.connect('promise-text', 'out', 'promise-decision', 'in');
        r.add('promise-acceptance', 'select-fields', { fields: [{ name: 'accepted', path: ['answers', 'promise', 'accepted'] }] });
        r.connect('promise-decision', 'out', 'promise-acceptance', 'in');
        r.add('promise-gate', 'branch');
        r.connect('promise-decision', 'out', 'promise-gate', 'in');
        r.connect('promise-acceptance', 'out', 'promise-gate', 'condition');
        r.add('gate-outcome', 'join', { phase: 'post', inputs: ['accepted', 'rejected', 'unresolved'].map(id => ({ id, label: id, required: false })) });
        for (const [port, input] of [['yes', 'accepted'], ['no', 'rejected'], ['unresolved', 'unresolved']])
            r.connect('promise-gate', port, 'gate-outcome', input);
        const output = r.summary('gate-outcome');
        r.requirements = ['Choose an ordinary connection on the Decision node bar or use Active SillyTavern.'];
        r.steps = ['Inspect answers.promise.accepted as true, false or null.', 'Branch routes all three outcomes explicitly; the optional Join preserves the native Draft for Review. Try hopeful or hypothetical wording without treating unresolved evidence as acceptance.'];
        r.budget = '1 ordinary Decision auxiliary request and one ordinary native generation.';
        r.check('promise-gate', 'unresolved', 'A null answer remains an explicit unresolved route without claiming acceptance.');
        entries.push(r.finish(...output));
    }
    {
        r = builder(12, 'Plan, write, polish, and annotate one reply', 'Combine a public plan with native generation, narration revision, item extraction and suggested enrichment.', 'Public planning → generation → revision → notes');
        r.add('scene', 'scene-context', { visibilityMode: 'public', includeCharacter: false, recentMessages: 5 });
        r.add('plan', 'response-plan', { instructions: 'Plan the next public beat, leaving the player decision open.' });
        r.connect('scene', 'out', 'plan', 'in');
        r.connect('plan', 'out', 'generate', 'guidance');
        r.add('polish', 'revise-draft', { scope: 'narration', instructions: 'Make narration clear and concise. Copy dialogue, facts and actions unchanged.' });
        r.connect('generate', 'draft', 'polish', 'draft');
        r.add('items', 'extract', { phase: 'post', instructions: 'Extract explicitly observed physical items with exact quotes. Mentions do not establish ownership.' });
        r.connect('polish', 'out', 'items', 'source');
        r.add('suggestions', 'enrich', { phase: 'post', instructions: 'For each observed item suggest one sensory detail consistent with public context. Label additions as suggestions, never observed facts.' });
        r.connect('items', 'out', 'suggestions', 'data');
        r.connect('scene', 'out', 'suggestions', 'context');
        r.budget = '4 auxiliary requests: Response Plan, Revise Draft, Extract and Enrich; one ordinary native generation.';
        r.check('suggestions', 'out', 'Observations keep evidence; suggestions remain labeled separately.');
        r.steps = ['Follow preparation and response groups by wires. Folding a group changes presentation only.'];
        entries.push(r.finish(...r.notes('suggestions', 'out', 'polish', 'out')));
    }
    {
        r = builder(13, 'Build one reusable item-card processor', 'Reuse one exact pinned pure helper twice with a typed data boundary and an exposed title.', 'Pinned pure subgraph and exposed parameters');
        const ref = r.helper('item-card', 'Observed item card', (add, c) => {
            add('select', 'select-fields', { fields: [{ name: 'name', path: ['name'] }, { name: 'description', path: ['description'] }] });
            add('render', 'compose', { mode: 'template', template: 'Observed item: {{data:/name}}  -  {{data:/description}}' });
            c('item', 'out', 'select', 'in');
            c('select', 'out', 'render', 'data');
            c('render', 'out', 'result', 'in');
        }, { output: 'text', parameters: [{ id: 'card-title', label: 'Card title', target: { instancePath: [], nodeId: 'render', controlId: 'template' } }] });
        for (const [id, value] of [['lantern', { name: 'Lantern', description: 'A cracked glass lantern.' }], ['chart', { name: 'Chart', description: 'A folded coastal chart.' }]]) {
            r.data(id, value);
            r.graph.nodes[id + '-card'] = {
                id: id + '-card', type: 'subgraph', definition: ref, enabled: true, alias: 'Subgraph · ' + id + ' card', parameterOverrides: { 'card-title': id === 'lantern' ? 'Lantern card: {{data:/name}}  -  {{data:/description}}' : 'Chart card: {{data:/name}}  -  {{data:/description}}' }, roleOverrides: {}
            };
            r.connect(id, 'out', id + '-card', 'item');
        }
        r.add('cards', 'compose', { phase: 'post', sections: [{ name: 'Lantern', text: '' }, { name: 'Chart', text: '' }] });
        r.connect('lantern-card', 'result', 'cards', 'section.Lantern');
        r.connect('chart-card', 'result', 'cards', 'section.Chart');
        r.add('append', 'append', { sectionId: r.id });
        r.connect('generate', 'draft', 'append', 'draft');
        r.connect('cards', 'out', 'append', 'section');
        r.steps = ['Open either helper instance and inspect Item:data → Result:text.', 'Change one card-title override and observe that the other instance retains its own title.', 'The pure helper has no host source, native generation, file write or private grant.'];
        r.check('lantern-card', 'result', 'The first exact helper snapshot yields its own overridden item-card title.');
        entries.push(r.finish('append', 'out'));
    }
    {
        r = builder(14, 'Give every clue its own explanation', 'Map a bounded ordered clue collection through a pure explanation helper.', 'Bounded For Each and helper model bindings');
        r.data('clues', [{ id: 'wet-boots', quote: 'The guard’s boots drip seawater.' }, { id: 'warm-wax', quote: 'The broken seal is still warm.' }, { id: 'quiet-bell', quote: 'The bell rope lies slack.' }]);
        const clueRef = r.helper('clue-explanation', 'Explain one public clue', (add, c) => {
            add('prompt', 'text', { text: 'Explain one possible significance of this supplied public clue. Return {id,quote,interpretation}; copy id and quote exactly and label the explanation as an interpretation.' });
            add('explain', 'model-call', { outputKind: 'data', instructions: 'You are a cautious investigator. No hidden facts or solved mystery.', modelRole: 'ClueAnalyst' });
            c('prompt', 'out', 'explain', 'prompt');
            c('item', 'out', 'explain', 'data');
            c('explain', 'out', 'result', 'in');
        });
        r.add('explain-each', 'for-each', {
            helper: clueRef, limit: 3, requestBoundPerIteration: 1, roleOverrides: { ClueAnalyst: { profileId: 'lattice:active-sillytavern' } }
        });
        r.connect('clues', 'out', 'explain-each', 'in');
        r.steps = ['Inspect three input clues and their ordered helper results.', 'Set ClueAnalyst under For Each helper bindings; the per-iteration bound is one call.', 'A fourth clue exceeds the explicit limit and holds without silently processing an unbounded list.'];
        r.budget = 'At most 3 auxiliary Model Calls: 3 iterations × 1. One ordinary native generation.';
        r.check('explain-each', 'out', 'Three ordered results preserve clue identity and label interpretation.');
        entries.push(r.finish(...r.summary('explain-each')));
    }
    {
        r = builder(15, 'Keep useful context within a budget', 'Join two public context windows and retain selected recent/protected material under a token budget.', 'Context Join and Smart Compactor');
        r.add('recent', 'scene-context', { visibilityMode: 'public', includeCharacter: false, recentMessages: 3 });
        r.add('wider', 'scene-context', { visibilityMode: 'public', includeCharacter: false, recentMessages: 12 });
        r.add('join-context', 'context-join');
        r.connect('wider', 'out', 'join-context', 'context-1');
        r.connect('recent', 'out', 'join-context', 'context-2');
        r.add('compact', 'smart-compactor', {
            targetTokens: 700, method: 'select', keepRecent: 2, pins: ['lantern'], purpose: 'Keep the immediate public obstacle and protected lantern reference.'
        });
        r.connect('join-context', 'out', 'compact', 'in');
        r.add('plan', 'response-plan', { instructions: 'Plan from retained material only; respect omissions and missing facts.' });
        r.connect('compact', 'out', 'plan', 'in');
        r.connect('plan', 'out', 'generate', 'guidance');
        r.steps = ['Inspect Context Join source identity/deduplication and Smart Compactor omissions.', 'Selection makes no auxiliary call; compress is an optional exercise with one additional call.'];
        r.budget = 'Default select: 1 auxiliary Response Plan request. Compress exercise: up to 2. One ordinary native generation.';
        r.check('compact', 'out', 'Recent messages and protected lantern material are retained; omissions remain reported.');
        entries.push(r.finish());
    }
    {
        r = builder(16, 'Consult the current campaign notebook', 'Read an authorized live campaign notebook and causally guide the reply from its current contents.', 'Read File live reference versus imported snapshot');
        r.add('notebook', 'read-file', { targetId: 'campaign-notebook' }, 'live Workflow Data');
        r.textGuidance('notebook', 'text');
        r.requirements = ['Create/authorize a public Text Workflow Data target campaign-notebook containing current campaign facts.'];
        r.steps = ['Read File captures a live target and revision; edit the target and compare the next run.', 'Contrast lesson6 File Input: imported content is a snapshot and cannot supply a live write reference.'];
        r.check('notebook', 'text', 'The current authorized notebook text reaches native Guidance.');
        entries.push(r.finish());
    }
    {
        r = builder(17, 'Record only the scene you accept', 'Extract narrative records, format them against a schema, project an add-unique journal and stage an accepted same-target replacement.', 'Format, Project Document and Write to File');
        r.add('journal', 'read-file', { targetId: 'accepted-scene-journal' }, 'live journal');
        r.add('records', 'extract', { phase: 'post', instructions: 'Return an array of public scene records {id,text}. Use stable IDs for identical quoted completed actions; copy exact narrative quotes into text. Exclude hypothetical actions.' });
        r.connect('generate', 'draft', 'records', 'source');
        const schema = JSON.stringify({ type: 'array', items: {
                type: 'object', required: ['id', 'text'], properties: { id: { type: 'string' }, text: { type: 'string' } }, additionalProperties: false
            } });
        r.add('record-array', 'select-fields', { phase: 'post', fields: [{ name: 'records', path: ['records'] }] });
        r.connect('records', 'out', 'record-array', 'in');
        r.add('record-list', 'collection', {
            phase: 'post', mode: 'project', collectionPath: ['records'], fieldPath: []
        });
        r.connect('record-array', 'out', 'record-list', 'in');
        r.add('format', 'format', {
            phase: 'post', schema: JSON.stringify(JSON.parse(schema).items), mapping: 'select', fields: [{ name: 'id', path: ['id'] }, { name: 'text', path: ['text'] }], jsonShape: 'records'
        });
        r.connect('record-list', 'out', 'format', 'in');
        r.add('project', 'project-document', {
            phase: 'post', mode: 'add-unique', key: 'id', schema: JSON.stringify(JSON.parse(schema).items)
        });
        r.connect('journal', 'text', 'project', 'source');
        r.connect('format', 'records', 'project', 'records');
        r.add('save', 'write-file', { mode: 'replace', schema });
        r.connect('journal', 'reference', 'save', 'reference');
        r.connect('project', 'text', 'save', 'text');
        r.requirements = ['Create public JSON Workflow Data accepted-scene-journal as []. Bind Prose for extraction.'];
        r.steps = ['Inspect Format.records and Project Document.receipt before Apply.', 'Write to File.reference is the exact live Read File reference; preview never saves.', 'Each file receipt is separate from native chat durability.'];
        r.budget = '1 auxiliary Extract request; one ordinary native generation. Formatting, projection and staging make no model requests.';
        r.check('save', 'receipt', 'The same-target journal replacement is pending until acceptance.');
        entries.push(r.finish());
    }
    return entries;
}
