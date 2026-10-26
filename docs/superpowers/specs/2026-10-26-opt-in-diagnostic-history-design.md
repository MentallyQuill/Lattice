# Opt-in diagnostic history

Status: approved by the user on 2026-10-26; implementation authorized.

## Intent

Make JSON, schema mismatch, and other workflow failures reviewable after a
later run or reload. The user requested better logging with a toggle after an
audit found that failed model output, schema findings, and retry reasons are
lost and that run recordings exist only in memory.

## Proposed user experience

- Add **Save diagnostic logs** in Run details, available before any run. Default
  off. Remember this preference separately for each SillyTavern user.
- Explain beside the switch: "Saves recent workflow attempts and model output
  in this browser. Logs may contain private story text."
- Add a **Saved logs** section to Run details, filtered to the current user and
  chat. Show timestamp, workflow name, result, failing node, error, and attempts.
  Opening an entry shows each request attempt and retry reason, finish/usage,
  validation findings, and any permitted retained response text.
- Provide **Export logs** and **Clear logs for this chat**. Export downloads
  versioned diagnostic JSON. Clearing logs never changes the chat or workflow.
- Turning logging off stops collection immediately and discards unsaved capture
  buffers. Already saved entries remain available until cleared or evicted.
  Turning it on during a run applies to the next run.
- Describe this as browser-local storage: another browser/device does not share
  the history. Show a storage warning if persistence is unavailable or fails.
  Logging failures must never interrupt generation, retries, Apply, or saving.

## Approaches

1. **Browser-local IndexedDB history (recommended).** Fits the existing
   extension and local file-access architecture, survives reloads, supports a
   bounded store and JSON export, and needs no server plugin. Does not follow
   the user to other browsers.
2. **Chat metadata history.** Would travel with chat files, but adds potentially
   private debugging output to normal story saves, backups and exports, and
   couples logging failures and size to chat persistence.
3. **Server log files.** Convenient for developer inspection but requires a new
   server plugin or other host support outside this extension's current scope.

The proposal uses option 1. The user may choose a different approach before
implementation. Retention values and UI placement below are builder proposals,
not preferences previously stated by the user.

## Capture and privacy boundaries

- Capture an immutable origin at host run creation before activity/event
  observers can change context: authenticated user, exact chat and character or
  group identity, workflow id/name, run id, and timestamp. Never derive origin
  later from whichever chat is currently selected.
- Include automatic Send and explicit Run to here, preflight/validation
  failures, cancellations, and successful runs whose earlier attempts failed.
  Superseded work may close its own original log; it cannot write into the new
  chat's history or restore old UI authority.
- Completion-text capture covers auxiliary workflow model requests only.
  SillyTavern's native Generate Reply remains represented by its stage/result
  metadata; its narrative already belongs to the normal chat and is not copied
  into this diagnostic history.
- Retain bounded per-attempt metadata and retry reasons even when a later
  attempt succeeds. Distinguish a completed transport from a failed JSON/schema
  validation. Preserve schema findings as bounded path, keyword, and message;
  do not embed schema values or full inputs into an error message.
- Capture response text through a separate, optional diagnostic sink inside
  the authorized runtime request boundary. Raw completion text must not enter
  public progress events or ordinary portable workflow recordings.
- Label captured text with trusted visibility and actor scope. Never retain
  hidden or unauthorized response text. The proposed opt-in is an explicit
  **operator diagnostic permission**: it allows the authenticated owner to
  review previously authorized actor-private model completion text within that
  same user's exact chat, including after reload. Reads/exports must require
  that captured user/chat identity, but do not require an expired run-local
  source grant or the same currently selected story actor. Preserve the captured
  actor label on every private payload. This proposed policy is subject to user
  approval; it is not an existing privacy guarantee inferred from the code.
  Logs remain human-facing diagnostic data and may never be used as story/model
  input or as a way to acquire or broaden any live actor authority. Unknown or
  untrusted scope must yield an explicit omission reason.
- Do not retain prompts, credentials, headers, endpoint URLs, transport/binding
  objects, hidden reasoning, or full request/provider envelopes. Keep only safe
  connection/model identifiers already admitted for diagnostics and completion
  text allowed by the preceding scope rules.
- Keep diagnostic history separate from authored workflows, chat metadata,
  accepted story state, memory, and file permissions. Logs have no execution,
  replay, publication, or write authority.

## Storage and limits

- Use a dedicated IndexedDB database, accessed through a small injectable
  storage adapter and typed plain-data contracts. No new dependency.
- Bound each user's history by both **50 runs total** and **5 MiB encoded JSON**,
  evicting oldest entries first. Filter the retained entries by current chat.
- Bound each run by **256 KiB**, each completion text by **32 KiB**, and each
  error to the existing bounded code/message plus at most **32 findings**.
  Text limits count encoded bytes and preserve Unicode scalar boundaries.
- Preserve run identity, terminal result, failure code/node, attempt counts,
  and explicit truncation/omission markers ahead of optional response text.
  Bound active buffers as well as persisted entries.
- Save on run settlement, including failure/cancellation. A tab closed during
  an unfinished run may have no saved entry; do not claim crash recovery.
- Reject malformed stored envelopes safely. Serialize writes and perform
  eviction atomically so rapid runs, clears and reloads cannot resurrect logs.
  A clear operation invalidates pending writes for its chat. User/chat changes
  invalidate asynchronous UI reads and export selections.

## Implementation seams

- `src/state.js`: admit and default the per-user logging preference, preserving
  existing settings and recovery migration behavior.
- `src/workflow/host.js` and `src/run.js`: captured origin, optional private
  diagnostic sink, settlement capture, and safe observer orchestration.
- `src/workflow/runtime.js`, model retry/JSON helpers, and diagnostic error
  projection: per-attempt completion/validation correlation and bounded schema
  findings without broadening public progress payloads.
- New focused history projection/storage service and `.d.ts` contracts: byte
  budgets, capture buffers, isolation, persistence, selection, export and clear.
- `src/ui/controller.js`, `ui/types.ts`, `ui/detail-types.ts`, and
  `ui/RunDetails.svelte`: toggle, storage status, saved history, inspection and
  actions. Preserve current live run diagnostics and navigation behavior.
- Rebuild committed `dist/lattice-ui.js` with the existing toolchain. Preserve
  all unrelated uncommitted changes. Installation/deployment is a separate step.

## Verification

Use incremental red/green tests for default-off/no-capture behavior, preference
reload, scoped origin before observer mutation, failure and recovered retry
history, malformed/fenced/truncated JSON, schema finding bounds, Unicode byte
limits/eviction, private output restrictions, off-mid-run revocation, chat/user
switches during reads/writes/export, clear versus queued writes, and IndexedDB
unavailable/quota failures. Browser coverage must show the toggle, stored failure
after reload, inspection/export, and clearing using synthetic data and zero
provider requests. Run the repository's full required product checks and inspect
the built UI before completion. Do not run experiments in the user's real chat.

## Exclusions and builder decisions

No server plugin, remote telemetry, provider requests, automatic upload, log
import/replay, chat mutation, or attempt to reconstruct past lost failures.
The builder may choose exact module/function names and compact presentation
within Run details. Changes to the storage destination, privacy rules, logging
default, or inclusion of prompts require revisiting this design.

## Builder check

A read-only review identified two decisions that are now explicit above:
auxiliary model completions are captured while native reply text is not
duplicated; durable actor-private review uses the proposed authenticated owner
diagnostic permission instead of attempting to reuse expired source grants.
