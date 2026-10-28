import { FOUNDATION_TEACHING } from './teaching-foundations.mjs';
import { COMPOSITION_TEACHING } from './teaching-composition.mjs';
import { ADVANCED_TEACHING } from './teaching-advanced.mjs';

export const TEACHING = { ...FOUNDATION_TEACHING, ...COMPOSITION_TEACHING, ...ADVANCED_TEACHING };

export function teachingFor(number, checkpoints) {
    const teaching = TEACHING[number];
    if (!teaching || teaching.checkpoints.length !== checkpoints.length)
        throw new Error(`Lesson ${number} needs teaching copy for each checkpoint.`);
    return {
        goal: teaching.goal,
        difficulty: number <= 8 ? 'Foundations' : number <= 17 ? 'Composition' : number <= 26 ? 'Advanced' : 'Capstone',
        learn: teaching.learn,
        requirements: [
            number <= 8
                ? 'Use a practice SillyTavern chat where you can try things freely. Open this example, then turn on Enable Lattice before sending a message. Your usual SillyTavern connection writes the reply.'
                : 'Open this lesson in a practice chat and enable Lattice before Send. The main reply uses your current SillyTavern connection.',
            ...teaching.requirements,
            ...(number>=16?['Known practice files prepare automatically in this independent copy. Opening and previewing make no paid requests or output writes. Existing saved content always wins. For personal inputs, use the node File section to Choose file or Import from device; importing creates an independent input copy.']:[]),
        ],
        steps: [...teaching.steps,
            number <= 8
                ? 'Finish at Review / Publish. Open its Host result in Preview, then choose Apply reviewed candidate to keep the proposed version or Reject candidate to discard it. Previewing an output does not make that choice for you.'
                : 'Review the final reply and any proposed saved changes at Review / Publish. Choose Apply reviewed candidate to accept them, or Reject candidate to discard them. Preview alone does not save changes.',
        ],
        checkpoints: checkpoints.map((checkpoint, index) => ({ ...checkpoint, expect: teaching.checkpoints[index] })),
        experiments: teaching.experiments,
        cases: teaching.cases,
        callBudget: teaching.callBudget,
    };
}

export function lessonComment(goal, lesson) {
    return [
        goal,
        "What you'll learn:\n" + lesson.learn.map(text => '• ' + text).join('\n'),
        'Before you start:\n' + lesson.requirements.map(text => '• ' + text).join('\n'),
        'Steps:\n' + lesson.steps.map((text, index) => `${index + 1}. ${text}`).join('\n'),
        'Checkpoints:\n' + lesson.checkpoints.map(checkpoint => `${checkpoint.node} → ${checkpoint.port}: ${checkpoint.expect}`).join('\n'),
        'Try this:\n' + lesson.experiments.map(experiment => `${experiment.change}\n${experiment.expect}`).join('\n'),
        'If something is different:\n' + lesson.cases.map(example => `${example.when}: ${example.expect}`).join('\n'),
        'Model requests: ' + lesson.callBudget,
    ].join('\n\n');
}
