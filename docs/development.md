# LATTICE development guide

[Documentation](README.md) · [Architecture and source reuse](developer-guide.md) · [Operator's manual](operators-manual.md)

The installed extension uses the committed self-contained UI bundle in `dist/lattice-ui.js`. Users do not need Node.js, npm dependencies, or a CDN connection to load it. Development uses Node.js 24 or later and the pinned lockfile.

Use this guide to build the extension, choose checks, and contribute a change. For adapting parts into another application, start with the [developer guide](developer-guide.md#reuse-the-source) and its runnable examples. The package is private; source imports do not imply a published SDK or a stable versioned API.

## Build and check

```powershell
npm ci
npx playwright install chromium
npm run check
```

`check` runs the Node behavior suite, Svelte type checks, production build, asset import checks, and browser acceptance tests. Commit regenerated `dist/lattice-ui.js` with UI source changes. Documentation-only edits do not require rebuilding the bundle.

Use the complete check before submitting product changes. During development, run the relevant behavior file directly, or use `node --test` for files that use Node's test runner. For example, these cover the source-reuse examples' contracts:

```powershell
node tests/workflow-compose.test.mjs
node --test tests/introspection-contracts.test.mjs tests/introspection-memory.test.mjs tests/introspection-nodes.test.mjs
node tests/introspection-types.test.mjs
```

`npm run test` discovers the repository's unit files through [tools/test-all.mjs](../tools/test-all.mjs). `npm run check:types` checks Svelte and TypeScript consumers, and `npm run test:browser` exercises the actual built UI with the mock host. Browser tests require installed Playwright Chromium. Tests and capture fixtures use synthetic story data; they are not live-provider validation.

| Location | Responsibility |
| --- | --- |
| `ui/*.svelte` | Workbench, nodes, shelf, Details, Preview, and manager presentation |
| `src/ui/` | Host orchestration, editor projections, scoped editing, navigation, and presentation state |
| `src/ui/graph-view-session.js`, `src/ui/workspace-preparation.js` | Captured editor scopes and prepared display contracts |
| `src/ui/native-search-catalog.js` | Canonical family node choices, search aliases, and checked pin-aware creation |
| `src/canvas.js`, `src/canvas/` | Graph gestures, camera, selection, geometry, cards, and connections |
| `src/workflow/catalog.js` | Registered operations, controls, phases, and artifact contracts |
| `src/workflow/operations/` | Operation implementations and deterministic primitives |
| `src/workflow/introspection/` | Versioned actor records, pure proposals, injected inference and scoped memory |
| `src/workflow/graph-validation.js`, `src/workflow/resolve.js` | Checked local/expanded graphs and addressed run planning |
| `src/workflow/host.js`, `src/run.js` | Trusted native generation, source capture, review, and effect authority |
| `src/workflow/starters.js` | The single zero-auxiliary-call unified starter |
| `src/workflow/examples.js`, `src/workflow/remastered-example-data.js`, `src/workflow/unified-example-data.js` | Validated curriculum/earlier unified recipes and independent-copy opening |
| `src/ui/example-catalog.js`, `ui/ExamplesBrowser.svelte` | Actual-package thumbnail projection and compact example picker |
| `tools/build-remastered-examples.mjs`, `tools/remastered/` | Generate the 30 numbered curriculum lessons, fixtures and bundled runtime data |
| `tools/build-unified-examples.mjs` | Regenerate earlier unified packages retained for existing example IDs |
| `examples/remastered/`, `examples/unified/` | Thirty visible curriculum lessons and earlier independent unified packages |
| `workflows/subgraphs/`, `examples/library/subgraphs/` | Retained stage-specific reusable processing packages |
| `tests/browser/` | Mock host and production UI acceptance fixtures |

## Contribute a change

Choose the owning layer before editing. A new control or node must agree across the engine, operation descriptor, named ports, Details, search, node guide, and saved-data validation. A change to host effects must also preserve scope, source revision, cancellation, preview, replay, and persistence checks. The [architecture](developer-guide.md#architecture) and [add-a-node checklist](developer-guide.md#add-a-node) show the relevant files.

Keep user-authored documents and pinned subgraph revisions readable. Test an existing saved configuration as well as the new default when changing modes, controls, or ports. Keep display DTOs separate from private edit/host handles, and keep secrets and authenticated transports outside portable JSON and diagnostics.

Use focused regression checks while working, then the full product check. Explain the behavior changed, why it matters to the author, and what was verified. If a source-reuse contract changes, update its `.d.ts`, consumer fixtures, and documentation together. Documentation changes should pass:

```powershell
node docs/developer-examples/compose.mjs
node docs/developer-examples/state-and-memory.mjs
node docs/developer-examples/introspection.mjs
node tools/check-documentation.mjs
```

Read [LICENSE](../LICENSE) when copying or distributing the technology and preserve its copyright and permission notice.

## Releases and example generation

Use `node tools/bump-version.mjs <version>` for release metadata and versioned import queries, then rebuild. Hard reload SillyTavern after updating installed assets so its modules load together.

Current curriculum authoring lives in **tools/remastered/**. After changing lesson nodes, wires, teaching instructions or pinned helpers, regenerate the portable packages, fixtures and **src/workflow/remastered-example-data.js**:

```powershell
node tools/build-remastered-examples.mjs
```

Earlier unified example IDs use **tools/build-unified-examples.mjs** and **src/workflow/unified-example-data.js**; regenerate that catalog separately when changing those compatibility examples.

The generator validates every package and embedded definition. Runtime opening uses bundled local data to create one independent unified copy as the active document. It makes no provider request and does not change **Enable Lattice**. Catalog tests verify detached copies; unified execution suites verify representative owned sources, actor privacy, review and effects without provider requests. Shared test-only operation layouts live under tests/helpers and never enter the production catalog.

## Local UI harness

`npm run harness` serves the mock host at `http://127.0.0.1:4178`. It loads the actual entry point, controllers, stylesheet, and committed bundle. The host provides synthetic data and does not represent a live provider integration.

`npm run smoke:install` checks an installed asset copy without developer source or `node_modules`. `npm run benchmark` measures camera and drag rendering on synthetic graphs. `npm run capture` records general renderer visuals in ignored development output.

`node tools/profile-workspace-interactions.mjs --label=final` measures pan, zoom, drag, and selection in the full mounted workspace on 25, 100, and 250-node fixtures. `--source=<checkout>` profiles an existing build for a matched comparison. Timings include instrumentation overhead; use the operation counts alongside them. `node tools/capture-interaction-polish.mjs` captures the search, Details handle, shelf scrolling, pin feedback, and left chat-bar logo using synthetic data. Both tools block provider requests and write ignored evidence under `benchmark-results/`.

## Reproduce documentation screenshots and GIFs

```powershell
node tools/capture-documentation.mjs
node tools/capture-beta-documentation.mjs
node tools/check-documentation.mjs
```

The reference-still script uses the installed Playwright Chromium browser and a temporary local server on port 4186. It captures the current production UI into `docs/images/`; it does not build the bundle or download a browser. Make sure the port is free and the committed bundle matches the UI you intend to document.

The second capture script also needs FFmpeg on PATH. It records the workflow overview, systems, example details, profile picker, node help, clock/data setup, validation, focused manual controls, and five gesture walkthroughs. Its screenshots go to `docs/images/`; source frames and checks go to ignored `benchmark-results/beta-media/`. Use `--only=manual`, `--only=shelf`, `--only=connect`, `--only=subgraph`, `--only=preview`, `--only=comments`, or `--only=screenshots` for a single take. See [documentation media](media.md) for the inventory and capture conventions.

The fixtures supply synthetic writing material, saved workflow data, layout positions, and the supplied Literal cleanup subgraph. Captures use actual navigation, settings panels, Run to here diagnostics, and native review controls. Completed examples must succeed with zero auxiliary model calls. All nonlocal requests and mutating HTTP requests are blocked; any page error or blocked request fails the capture. The script closes its browser and server afterward.

The 19 captures cover workspace orientation, context assembly, node shelf/search, operation Details, recorded preview, reply review, execution details, and subgraph instances, tabs, interfaces, and parameter overrides. The capture flow opens the unified document and enables Lattice for its owned native-review demonstration. Connection profiles and optional model overrides belong in each node's Details. The shelf capture opens a family directly to canonical node rows; operation modes belong in Details. Subgraphs are created from canvas selection, edited through boundary Details, and saved with the wrapper context menu. The shelf offers Input/Output nodes and saved-definition context actions. An ignored evidence report is written to `benchmark-results/documentation-capture.json`.

When changing discovery metadata, keep one public choice per operation and retain mode/kind names as search aliases. Pin-aware creation can select a compatible checked configuration without adding duplicate public rows. Preserve saved node settings and distinct subgraph revision identities. Transpose's new Text creation defaults must coexist with saved nodes whose omitted Input type retains Draft → Patches behavior.

The capture also samples rendered wire paths to require forward flow and reject crossings through unrelated cards. Endpoint cards are excluded because wires originate at their pins.

After capturing, inspect the images for readable node names, controls, graph layout, and visible results. Run `node tools/check-documentation.mjs` to check local links/anchors, the registered-node inventory, current screenshot references, and public branding. Use ordinary screenshots of the running UI for operator instructions.

## Live model checks

`tools/provider-test-guard.mjs` retains reusable opt-in, loopback, exact-payload and attempt-accounting safeguards for separately authorized provider tests. Callers supply approved models and a current per-run request bound; the helper does not run browser workflows or authorize historical allowances. Documentation capture makes no provider requests.
