import assert from 'node:assert/strict';
import {composeText} from '../../src/workflow/operations/compose.js';

// Supply ordinary text and data from your application; this function has no host or model.
const result = composeText({
    template: '{{section:scene}}\n\n{{data:/actor/name}}: {{section:direction}}',
    sections: [
        {name: 'scene', text: 'Rain taps against the inn windows.'},
        {name: 'direction', text: 'Offer a cautious welcome; leave the player free to respond.'},
    ],
    data: {actor: {name: 'Mara'}},
});
if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
assert.equal(result.data.text, 'Rain taps against the inn windows.\n\nMara: Offer a cautious welcome; leave the player free to respond.');
console.log(result.data.text);
