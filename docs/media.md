# Documentation media

[Documentation](README.md) · [Operator’s manual](operators-manual.md) · [Development](development.md)

The beta screenshots and animations use Lattice’s production UI on the local browser harness. Story content, chat identity, example layouts, and model-profile names are synthetic. No capture contacts a provider. Completed diagnostic runs are checked for zero auxiliary calls.

## Animated walkthroughs

| Animation | What it demonstrates | Where it appears |
| --- | --- | --- |
| [Search and place](images/search-and-place.gif) | Open shelf search, type Text Rules, drag a result onto the canvas | README and manual |
| [Connect nodes](images/connect-nodes.gif) | Create Text and Data wires with pin-to-pin mouse gestures | README and manual |
| [Create a subgraph](images/create-subgraph.gif) | Shift-select three processing nodes from a larger graph, extract typed boundaries, return to the reconnected parent | README and manual |
| [Inspect and pin](images/inspect-and-pin.gif) | Browse recorded outputs, keep one visible while selecting another node, resume following | Manual |
| [Frame a workflow](images/frame-a-workflow.gif) | Select nodes, create a comment, name the section | Manual |

Animations are 1280 pixels wide at 10 frames per second, loop continuously, and hold the result long enough to read it. The captures add a visible cursor overlay because browser screenshots omit the system pointer. Pointer position and press indication follow the actual mouse events; the UI and graph results are real. For a still alternative, the manual illustrates each of the same actions.

## Still coverage

- Workspace orientation, the three-node starter, and the combined wand/weather/relationship workflow.
- Thirty-lesson browser and a lesson’s setup/checkpoints.
- Shelf browsing, search, placement, typed connections, and multiselection.
- Operation settings, structured composition, deterministic text rules, and context preparation.
- Model connection picker, node guides, Workflow Data, clock settings, and validation.
- Recorded artifacts, pinned Preview, owned reply review, and run details.
- Subgraph instances, extraction, typed interfaces, body tabs, saving, and adding systems.
- Comment frames and the File menu.

All current stills are embedded where they are explained in the manual or node reference. Click an image to inspect its full resolution. The README uses a deliberately smaller selection.

## Reproduce and verify

Use Node.js 24+, the installed Playwright Chromium browser, and FFmpeg on PATH:

```powershell
node tools/capture-documentation.mjs
node tools/capture-beta-documentation.mjs
node tools/check-documentation.mjs
```

The first script refreshes the existing operation/reference stills on port 4186. The second records the beta scenes and five animations on port 4187. Both use temporary servers, block external and mutating HTTP requests, and close their own browsers and servers. They read the current bundle; build first if source and bundle are out of sync.

For an individual beta take, pass `--only=screenshots`, `--only=shelf`, `--only=connect`, `--only=subgraph`, `--only=preview`, or `--only=comments`. `LATTICE_BETA_DOC_PORT` changes the second port. `LATTICE_DOC_PORT` and `LATTICE_DOC_SHOTS` configure the first script.

Capture evidence and source frames stay in ignored `benchmark-results/` output. Commit only the selected PNG/GIF assets, documentation, and capture tools. The checker validates document links, anchors, operation coverage, image references, PNG/GIF headers, and a 3 MiB limit for each animation. It does not replace visual inspection or a live-provider acceptance test.
