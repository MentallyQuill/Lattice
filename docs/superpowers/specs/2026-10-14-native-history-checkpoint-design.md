# Native History Checkpoint Design

Date: 2026-10-14. Scope approved for investigation by the node-capability goal; this concrete storage design is for user review before implementation.

## Intent

Continue long-running story workflows beyond active clock/outcome/save-receipt limits without forgetting duplicate detection, changing current story values, weakening actor privacy or automatically pruning records. One explicit Workflow Data action retires active history into immutable scoped archives. No new node, provider request, background process or dependency.

## User flow and visual design

In the existing Workflow Data dialog, a selected authorized target offers Preview history checkpoint. Show target/name/visibility, current revision, history epoch, and counts to archive/retain. Preview performs reads only. Cancel leaves storage unchanged; Apply checkpoint performs one checked metadata save. The current dialog uses the flat charcoal Gaea2 surfaces, restrained outlines, compact action rows and existing pending/status/error feedback.

After application, show local application separately from durable save acknowledgement. An unverified save holds further writes to that target until reconciliation. A concise archive listing shows checkpoint metadata; archived content retains its original authorization/visibility and remains read-only.

Original references inspected: Cartography, Swirl and Erosion2 property-editor screenshots from the Details overhaul chat. Reuse current theme variables, ordinary controls and existing modal shell.

## Alternatives and selected approach

1. Raise limits: small patch but postpones failure; rejected.
2. Clear active history behind a turn cutoff: smaller than exact lookup, but unordered turn hashes and authored cross-turn progression identities make it unsafe; rejected.
3. Immutable archived history plus an epoch: selected. Current values stay in the active document; exact lookup supplies only the identities needed by a run. This adds one storage lifecycle, not separate policies to each node.

## Data contract

An active native document retains targetId/revision/format/content/receipts/scope and adds a constant-size optional history header:

history = { schemaVersion:1, epoch:<nonnegative integer>, head:<archive page ID or null> }

Missing header means epoch 0 and no archive.

Native metadata stores immutable per-user archive pages under latticeDocumentHistory. A page contains schemaVersion, pageId, targetId, scope, checkpoint-time visibility, epoch, checkpointId, previous page ID, history kind and checked payload. Pages form a linked chain, avoiding a growing archive-ID array in the active packet.

Each page independently obeys existing plain-JSON admission (262144 bytes, 10000 values, depth32). Records can be packed into multiple pages. A record exceeding page admission fails preview without mutation. Traversal validates page identity/scope/target/linkage and fails on missing pages or cycles. Existing native persistence read bounds remain controlled; archive capacity failures are explicit.

## Native interfaces

previewStoryHistoryCheckpoint(targetId) returns a public count/reason preview plus an opaque handle retained privately by the host.

applyStoryHistoryCheckpoint(handle) consumes that current preview and returns local applied/acknowledged state, new revision and epoch.

inspectStoryHistory(targetId) returns authorized read-only archive metadata, without granting a writable target.

One internal lookupHistory(targetId, query) retrieves relevant backend receipts, clock turns, outcomes or compact progression identity matches. It does not expose the entire archive as a portable node input.

The preview handle captures exact catalog lease, user/chat/native context identity, target bytes/format/revision/receipts/history header and checked archive head. Apply rechecks currentness after every awaited callback. Construct and validate every new page and active packet before synchronously installing both with no intervening await. Increment backend revision and epoch even for receipt-only checkpoints; save once.

Old captured file/review handles compare their captured epoch before cached receipt success. Fresh executions can still recognize exact archived duplicates.

## Retirement rules

| Kind | Archived | Retained active |
| --- | --- | --- |
| Ordinary document | Backend save receipts | All canonical content unchanged |
| Story clock | Full accepted turn/projection/preturn records; provably past consumed IDs | Current minute/calendar/revision/pending remainder; future or opaque consumed IDs |
| Outcome ledger | Full validated accepted outcomes | Empty active outcome array |
| Progression state | Full consumed ledger receipts | Values, budgets, cooldowns, repetitions, decayTimes and every authored field unchanged |

Retire known state shapes only after complete structural validation. Do not guess from a property named ledger. Ambiguous or malformed known histories are reported; arbitrary documents get receipt-only checkpoints.

Checkpointed progression content receives historyCheckpoint:{targetId,epoch}. The host validates this descriptive marker against the actual authorized backend header. Ordinary file mutations must preserve it, including keyed mutation and replacement.

## Replay and safety invariants

- File preflight searches active and archived receipt identities. Same identity/fingerprint remains acknowledged; conflicting fingerprints still fail.
- Clock read locates the current turn in active or archived history. An exact replay exposes its original preturn clock, checks the same projection and leaves the latest accepted clock unchanged.
- Outcomes look up eventId/libraryId/rerollId exactly and retain existing fingerprint/stakes conflict checks. Only accepted archived records qualify.
- Progression derives archived queries using the reducer's same authored identity and event-identity logic. Feed only matching compact identities to the pure reducer; retain its event conflict checks and keep output ledger limited to active/new receipts. Keep all pacing aggregates exact.
- A checkpointed pure/offline progression state without checked history lookup fails explicitly; it never treats the archive as empty.
- Archives retain their original visibility. A later public catalog definition cannot disclose an older private archive.
- Checkpoint errors and capacity diagnostics remain controlled local messages. No raw provider/private payload is added to public diagnostics.
- Preview and canceled UI actions never mutate storage. No canonical user data is checkpointed merely by deploying the feature.

## Files and ownership

Shared new document-history.js/.d.ts owns page validation, safe retirement preview and lookup. Existing file-store/native-settlement/native-persistence owns authorized preview/apply, exact epoch/receipt fences and acknowledgement. Native-story-state owns clock/outcome replay integration; progression/operation/host adapters own checked archived identity lookup. Controller and the existing StoryDocuments dialog expose the three native interfaces.

Avoid generic service frameworks and unrelated refactoring. Keep seven small node extensions separate from this storage change.

## Validation

Meaningful one-at-a-time failing tests cover: 32-turn clock capacity then continued advance; 256 receipt capacity then continued save; archived exact replay and conflicting replay; stable outcome reuse; progression authored duplicate/event conflict and unchanged caps/cooldowns; stale captured candidate after checkpoint; malformed/missing/cyclic archives; private archive after a visibility change; preview/cancel no mutation; save applied but acknowledgement unverified; and scope changes during awaited work.

Browser QA covers the actual existing dialog at desktop/narrow widths, keyboard flow, disabled pending controls, cancel and bounded status/error messages. Repository tests, type checking, build and assets checks run before the authorized main push.

