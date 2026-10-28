# Branch file startup patch verification

Release: 0.30.1.

## Cause and correction

Branch preparation treated an authenticated parent lookup with no managed binding as unavailable inherited history. That stopped first-use readers before automatic initialization. The host now reports verified absence separately; only a reader allowing creation can proceed to the existing initializer. Access failures, required-file policy and unavailable inherited history remain protective stops.

Virtual missing-file seeds are excluded from branch adoption and retained content versions. Exact real retained versions remain usable, including after the current parent output disappears.

A live rerun exposed a separate launcher race after saved node edits: opening the workspace compared the new run against an older settings fingerprint. The launcher now captures its baseline once per new run. Same-run graph, enabled-state and document changes still cancel work.

## Verification

- Branch initialization regressions cover absent parent bindings, public/private ownership, acceptance, reload and reuse without another initialization call.
- Deleted-parent regressions cover both direct virtual snapshots and actual host save/delete/recreate history.
- Corrected file/history batch: 11 test files passed, including the full history maintenance stress scenarios.
- Host/native file access: 53 tests passed. Launcher: 14 tests passed, plus the related progress test files.
- File/settings browser journeys: 22 tests passed.
- Type check: zero errors and warnings. Production build, 957-import asset audit, unchanged memory examples and installation smoke passed.

## Live branch result

The installed extension was tested against the user's existing branch with real configured providers. Both first-use readers initialized from the conversation and character. The workflow then generated and published a native reply and saved both managed documents automatically. Run details reported Completed: 14 completed stages and two expected skipped collectors, with both readers, review and save stages completed. The saved text document was nonempty and the structured document parsed as valid JSON.

The live workflow's always-reasoning planner model had insufficient output limits. Assessment was raised from 4,608 to 16,384 tokens and Development from 768 to 8,192. Instructions, schemas and file contents were not manually rewritten. The successful run required no intervention after Send; no manual file selection, template editing or acceptance step was used.

Earlier failed/cancelled test attempts remain in the browser's diagnostic history and the test turns remain in the branch. Private story text and provider credentials are excluded from this report.
