# Descriptive workflow failure notifications

User approved the notification design in chat: identify the displayed node, report the concrete validation failure and show actual attempts. Preserve the automatic-run fallback caveat, persistent closeable notifications and safe rendering.

## Constraints

- Read node labels and per-node dispatched attempts from the failed run's recording, never the currently edited graph or the workflow-wide request count.
- Match the complete qualified node address; fall back to a unique node ID only for older unaddressed errors.
- Reuse sanitized schema findings. Show bounded field paths and validator-generated expected/actual descriptions, never model response text or arbitrary exception messages.
- Keep node ID/code available, show a bounded subset of findings and direct users to Details for the rest.
- Preserve concurrent external-view work. No retry/schema/settings changes, commits or publication in this task.

## Task 1: Notification presentation — complete

Write failing facade tests using real runtime recordings, then implement a pure notification presenter and wire it into the existing result callback. Incrementally cover node names, exact addresses, attempts, validation details, safe fallbacks and malformed metadata. Run notification and related diagnostic/runtime tests.

## Task 2: Verify and install — complete

Run the full unit suite, type and asset checks, relevant browser checks, and a fresh independent review of this task's diff. Update only this task's changed runtime files in the local SillyTavern installation with backups and immediate before-hash guards. Verify installed files and preserve settings/chat files. No shared-branch push is included.

Verified all 402 test files in isolated batches, 54 focused tests, type and asset checks, browser diagnostics and installation smoke. Both review findings were reproduced and fixed: redact generated additional-property keys and reject malformed address indices without conversion hooks. Installed the presenter and facade only; hashes match, settings and chat files stayed unchanged. A synthetic run using the installed runtime confirmed the displayed name, two attempts and the 280/322 character finding without a real provider request.
