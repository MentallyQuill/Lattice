import { resolveComposeContributions } from './compose-guidance.js?v=0.27.2';
import { composeText } from './operations/compose.js?v=0.27.2';
import { describePrimitive } from './operations/nodes.js?v=0.27.2';
import { artifactVisibility } from './artifact-privacy.js?v=0.27.2';
import { own } from './record-data.js?v=0.27.2';

const failure = () => ({ ok: false, error: { code: 'ACTOR_GUIDANCE_UNVERIFIED', message: 'Use exact retained current-actor guidance with unmodified Compose rendering.' } });
/** One native run owns exact aggregates. No proof fields enter artifacts or recordings. */
export function createNativeGuidanceComposition() {
    let proofs = new WeakMap(), epoch = 0, closed = false;
    function retain(payload) {
        try {
            if (closed) return failure();
            const started = epoch;
            const { node, artifact, inputs, inputStates = {}, portId } = payload;
            if (own(node, 'operation') !== 'compose' || own(node, 'outputKind') !== 'guidance' || portId !== 'out') return { ok: true, data: { retained: true } };
            if (!Object.isFrozen(artifact) || own(artifact, 'kind') !== 'guidance') return failure();
            const described = describePrimitive(node); if (!described.ok) return failure();
            const plan = resolveComposeContributions(node, inputs, inputStates); if (!plan.ok) return failure();
            const options = { sections: plan.data.sections, separator: own(node, 'separator') ?? '\n\n' };
            if (own(node, 'mode') === 'template') options.template = own(node, 'template') ?? '';
            if (Object.hasOwn(inputs, 'data')) options.data = own(inputs.data, 'value');
            const rendered = composeText(options); if (!rendered.ok || rendered.data.text !== own(artifact, 'text')) return failure();
            const mark = artifactVisibility({ inputs, artifact }), actual = artifactVisibility(artifact);
            if (mark.kind !== actual.kind || mark.actorId !== actual.actorId || plan.data.originals.some(original => !Object.isFrozen(original))) return failure();
            if (closed || started !== epoch) return failure();
            proofs.set(artifact, Object.freeze({ originals: Object.freeze([...plan.data.originals]), text: rendered.data.text }));
            return { ok: true, data: { retained: true } };
        } catch { return failure(); }
    }
    function authorize(artifact, authorizeOriginal) {
        const started = epoch, visiting = new Set(); let count = 0;
        function check(value, depth) {
            if (closed || started !== epoch || ++count > 4096 || depth > 32 || visiting.has(value)) return failure();
            const mark = artifactVisibility(value);
            if (mark.kind === 'public') return { ok: true };
            if (mark.kind !== 'actor-private' || own(value, 'kind') !== 'guidance' || !Object.isFrozen(value)) return failure();
            const proof = proofs.get(value);
            if (!proof) {
                let result; try { result = authorizeOriginal(value); } catch { return failure(); }
                const authorized = own(result, 'ok') === true;
                return !closed && started === epoch && authorized ? { ok: true } : failure();
            }
            if (own(value, 'text') !== proof.text) return failure();
            visiting.add(value);
            for (const original of proof.originals) { const checked = check(original, depth + 1); if (!checked.ok) return checked; }
            visiting.delete(value);
            return started === epoch ? { ok: true } : failure();
        }
        try { return check(artifact, 0); } catch { return failure(); }
    }
    return Object.freeze({ retain, authorize, clear() { closed = true; epoch++; proofs = new WeakMap(); } });
}
