# Documentation images and walkthroughs

[Documentation](README.md) · [Operator’s manual](operators-manual.md) · [Development](development.md)

The manual uses screenshots of the running Lattice interface. Most images show just the control, dialog, result, or connected group being explained. The full workspace image provides orientation; the README uses a small selection to introduce what you can build.

The local demonstration host supplies fictional story material, characters, and connection names. The capture tools use the production UI and block external requests. They check that demonstrated preview runs succeed without extra model calls. The supplied reply in the review screenshot demonstrates the controls; it is not a provider-generated performance or quality result.

## Logo and banner

[The banner](images/lattice-banner.png) combines the existing [logo](../assets/lattice-logo.svg) and the bundled Bricolage Grotesque font used by the extension. It contains the logo and LATTICE wordmark. To rebuild it:

```powershell
node tools/build-documentation-banner.mjs
```

## Focused manual images

| Task | Images |
| --- | --- |
| Find help for a node | [Question mark button](images/node-help-button.png), [opened guide and example](images/node-guide.png) |
| Add or organize a node | [Node actions](images/node-actions.png), [placed node Details](images/node-creation.png), [shelf families](images/node-shelf.png), [search](images/node-search.png), [dragging from search](images/shelf-drag.png) |
| Read a result | [Readable and Source controls](images/preview-modes.png), [guidance](images/guidance-preview.png), [pinned preview](images/pinned-preview.png), [review controls](images/review-candidate.png), [run details](images/run-details.png) |
| Change settings | [Compose](images/compose-details.png), [Select Fields](images/select-fields-details.png), [JSON Decode](images/json-decode-details.png), [Text Rules](images/text-rules-details.png), [text modifiers](images/text-modifiers.png), [Smart Compactor](images/compactor-details.png), [model settings](images/model-details.png), [connection picker](images/profile-picker.png) |
| Keep the graph readable | [Comment frame](images/workflow-comments.png), [portals](images/portals.png), [themes and type cues](images/themes.png) |
| Save and share | [File menu](images/file-menu.png), [save choice](images/save-changes.png) |
| Set up story data | [Workflow Data](images/workflow-data.png), [clock settings](images/clock-settings.png), [recall overview](images/recall-controls.png) |
| Inspect placement readiness | [Setup Required](images/node-setup-required.png), [setup reasons in Details](images/node-setup-details.png), [Input Required](images/node-input-required.png) |
| Diagnose a problem | [Valid starter](images/workflow-validation.png), [missing reply connection](images/validation-issue.png) |

The node settings captures also support the existing technical reference. The operator’s manual teaches how to find the in-app **?** guide instead of reproducing every node’s settings.

## Workflow and example images

| Subject | Images |
| --- | --- |
| Orientation and first reply | [Workspace overview](images/workspace-overview.png), [three-node starter](images/unified-starter.png) |
| Choose a lesson | [Examples browser](images/examples-curriculum.png), [lesson details](images/example-lesson.png) |
| Connected processes | [Text and Data connections](images/connecting-nodes.png), [text cleanup](images/text-rules-graph.png), [scene planning](images/scene-planning-graph.png), [context assembly](images/context-assembly.png) |
| Reusable tools | [Selected nodes](images/selection-subgraph.png), [extracted body](images/created-subgraph.png), [reconnected parent](images/subgraph-parent.png), [placed instance](images/subgraph-instance.png), [body tab](images/subgraph-tab.png), [port settings](images/subgraph-interface.png), [save dialog](images/subgraph-save.png) |
| Story systems | [Combined workflow](images/beta-overview.png), [system settings](images/system-settings.png), [saved-system chooser](images/add-system.png), [placed-system connection assistance](images/system-connections.png), [wand system body](images/wand-system.png) |

## Animated walkthroughs

| Animation | What it shows |
| --- | --- |
| [Search and place](images/search-and-place.gif) | Search for Text Rules, drag it onto the canvas to place it immediately, then open its settings in Details |
| [Connect nodes](images/connect-nodes.gif) | Draw a Text connection and a Data connection between compatible pins |
| [Create a subgraph](images/create-subgraph.gif) | Select three nodes, package them, inspect the new body, and return to the parent |
| [Inspect and pin](images/inspect-and-pin.gif) | Keep one result visible while selecting another node, then resume following selection |
| [Frame a workflow](images/frame-a-workflow.gif) | Select nodes, create a comment frame, and give the section a name |

The GIFs show actual gestures, with a cursor overlay because browser screenshots omit the system pointer. They loop at 10 frames per second and pause on the result. The manual provides still images alongside these actions.

## Capture and check

Use Node.js 24+, the locked project dependencies, an installed Playwright Chromium browser, and FFmpeg on PATH:

```powershell
node tools/capture-documentation.mjs
node tools/capture-beta-documentation.mjs
node tools/check-documentation.mjs
```

The first script captures operation and graph examples on port 4186. The second captures the manual close-ups, story systems, dialogs, and GIFs on port 4187. Both start temporary local servers and close their browsers and servers when finished. They read the committed UI bundle; rebuild first when documenting UI source changes.

For an individual take, use `--only=manual`, `--only=screenshots`, `--only=shelf`, `--only=connect`, `--only=subgraph`, `--only=system-placement`, `--only=preview`, or `--only=comments` with the second script. The system-placement take captures the saved-revision chooser, explicit later connection assistance, and Prompted Memory changing from Setup Required to Input Required. The shelf take captures immediate placement and the placed node’s Details. `LATTICE_BETA_DOC_PORT` selects its port. `LATTICE_DOC_PORT` and `LATTICE_DOC_SHOTS` select the first script’s port and named captures.

`tools/documentation-framing.mjs` captures the visible bounds of one control or a group of related elements, with a little padding. It captures that region directly from the browser rather than modifying an earlier image. Keep settings text readable and leave enough context to identify the target. Recapture a changed interface instead of cropping an outdated screenshot.

Capture reports and animation frames stay in ignored `benchmark-results/` output. Keep selected image assets, documentation, and capture tools in the repository. The checker validates links, anchors, the technical operation inventory, PNG/GIF headers, image references, and the 3 MiB limit for each GIF. Inspect the images as well: an automated check cannot tell whether a crop teaches the intended action.
