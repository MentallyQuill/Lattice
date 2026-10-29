import {MEMORY_EXAMPLE_FIXTURES} from './memory-example-fixtures.js?v=0.30.3';
// Generated from the exact UTF-8 text/JSON files in examples/remastered/fixtures.
// These demonstration bytes grant no host authorization or accepted native memory.
const CONTENTS = {
    "campaign-notebook.txt": "North Harbor: the lighthouse is dark. The player has not chosen what to investigate next.\n",
    "accepted-scene-journal.json": "[]\n",
    "accepted-item-holders.json": "{\n  \"signal-lantern\": \"character:rowan.png\"\n}\n",
    "rowan-item-memories.json": "[]\n",
    "story-clock.json": "{\n  \"schemaVersion\": 1,\n  \"clockId\": \"story-clock\",\n  \"calendarId\": \"campaign-days\",\n  \"revision\": 1,\n  \"absoluteMinute\": 780,\n  \"dayLengthMinutes\": 1440,\n  \"settledTimeEventIds\": []\n}\n",
    "player-progression.json": "{\n  \"values\": [\n    {\n      \"key\": \"experience\",\n      \"value\": 80\n    }\n  ],\n  \"ledger\": []\n}\n",
    "rowan-moments.json": "[\n  {\n    \"id\": \"lighthouse-promise\",\n    \"revision\": \"r1\",\n    \"actorId\": \"character:rowan.png\",\n    \"text\": \"Rowan remembers promising to return to the lighthouse.\",\n    \"tags\": [\n      \"lighthouse\"\n    ]\n  }\n]\n",
    "wand-holders.json": "{\n  \"broken-wand\": \"character:rowan.png\"\n}\n",
    "wand-effects.json": "{\n  \"libraryId\": \"wand-effects\",\n  \"revision\": \"r1\",\n  \"itemId\": \"broken-wand\",\n  \"effects\": [\n    {\n      \"id\": \"sparks\",\n      \"kind\": \"fixed\",\n      \"weight\": 80,\n      \"description\": \"Blue sparks replace the spell.\"\n    },\n    {\n      \"id\": \"wild\",\n      \"kind\": \"generate\",\n      \"weight\": 20\n    }\n  ]\n}\n",
    "wand-outcomes.json": "[]\n",
    "iris-moments.json": "[]\n"
};
const LESSON_FIXTURES = {
    "lesson-16": [
        "campaign-notebook.txt"
    ],
    "lesson-17": [
        "accepted-scene-journal.json"
    ],
    "lesson-20": [
        "accepted-item-holders.json"
    ],
    "lesson-22": [
        "accepted-item-holders.json",
        "rowan-item-memories.json"
    ],
    "lesson-23": [
        "story-clock.json"
    ],
    "lesson-24": [
        "story-clock.json"
    ],
    "lesson-25": [
        "player-progression.json"
    ],
    "lesson-26": [
        "rowan-moments.json"
    ],
    "lesson-27": [
        "wand-holders.json",
        "wand-effects.json",
        "wand-outcomes.json"
    ],
    "lesson-29": [
        "iris-moments.json"
    ]
};

/** Only setup data needed by the selected lesson; results are detached plain DTOs. */
export function getNodeGuideFixtures(lessonId) {
    const names = typeof lessonId === "string" && Object.hasOwn(LESSON_FIXTURES, lessonId) ? LESSON_FIXTURES[lessonId] : [];
    const memoryNames=typeof lessonId==='string'&&Object.hasOwn(MEMORY_EXAMPLE_FIXTURES.lessonFixtures,lessonId)?MEMORY_EXAMPLE_FIXTURES.lessonFixtures[lessonId]:[];
    return [...names.map(name => ({name,content:CONTENTS[name]})),...memoryNames.map(name=>({name,content:MEMORY_EXAMPLE_FIXTURES.contents[name]}))];
}
