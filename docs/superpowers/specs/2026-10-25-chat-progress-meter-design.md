# Chat progress meter

The user selected the existing pixel-meter visual language with a stage percentage above the SillyTavern Lattice logo. Show the meter only for an active workflow; when it settles, gradually fade it out over exactly three seconds and remove it. A new run immediately restores full opacity and cancels the previous removal timer.

Use the existing green completed pixels, accent pulsing active pixels, and dim pending pixels. Keep the logo's enabled color and normal click/right-click behavior. Anchor the compact meter above the button without changing chat control layout. Give the meter an accessible status label and a tooltip identifying stage progress rather than time remaining.

Percentage counts included primitive stages completed or skipped, without double counting subgraph wrappers. Cap running progress at 99%; only successful run settlement displays 100%. Retrying or iterating within a stage does not create extra percentage units. Failure/cancellation fades with its actual status, satisfying the request that nothing remains at idle. Before a plan is available, show a waiting pixel and an unknown percentage.

Approaches considered: a generic activity bar, a sweep through the logo, and reuse of the existing pixel meter. The user chose pixel meter plus percentage for consistency and visible stage activity.

Listen to existing host activity and runtime events even when the editor is closed. Bind all updates to run identity; stale events and old fade timers must not replace a newer run. Preserve state across shortcut remounts. Do not validate/rebuild workflows on every event, expose prompt content, add dependencies, or change execution behavior.

The completed feature is selectively ported onto the clean 0.28.0 integration worktree. Preserve the existing host behavior, exclude unfinished memory work, and leave integration commits to the coordinating task. The design follows the agreed conversation and the user's explicit instruction to use a three-second fade.
