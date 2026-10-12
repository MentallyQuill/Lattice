# Lattice documentation

Choose a route based on what you want to do. The [project README](../README.md) introduces Lattice and the story systems you can build.

## Start using Lattice

1. [Quick start](lattice-workspace.md) — install the extension in SillyTavern, send your first reply, review it, and save your workflow.
2. [Operator’s manual](operators-manual.md) — learn the canvas, node settings, Preview, connections, subgraphs, and file commands through illustrated instructions.
3. [30 example workflows](examples.md) — choose a lesson, configure its requirements, and try a complete workflow in a practice chat.

For a particular node, click its **?** button in the editor. Its guide explains the purpose, settings, connections, and examples beside your work.

## Build a story system

| Guide | Use it to… |
| --- | --- |
| [Story systems](story-systems.md) | Build a weighted chaos wand, gradual relationships, private perspectives, timed events, or an accepted campaign notebook. |
| [Unified workflows](unified-workflows.md) | Connect preparation and reply processing, combine reusable systems, and manage memories, documents, clocks, and accepted changes. |
| [Model setup and troubleshooting](native-workflows.md) | Choose a connection for each model tool, understand request budgets, and investigate reply or save problems. |
| [Reference tools and workflow library](lattice-reference-library.md) | Apply style or terminology references, inspect repeated wording, and reuse context or cleanup tools. |
| [Connections and workflow comments](connection-comments.md) | Follow typed connections and label, move, or resize sections of the canvas. |
| [Node reference](node-reference.md) | Look up the complete inputs, outputs, controls, and limits when you need detail beyond the in-editor guide. |
| [Introspection](introspection-package.md) | Work with character reflection, memories, and state. |

For common settings, see [familiar node settings](operators-manual.md#familiar-node-settings). For recorded results, see [Read Preview](operators-manual.md#read-preview). The [Pattern lesson](unified-workflows.md#detect-and-filter-a-reply) shows how to detect terms and filter paragraphs without an extra model request.

## Develop or contribute

- [Developer guide](developer-guide.md) — architecture, rendering, local setup, checks, and contribution guidance.
- [Development commands](development.md) — build and verification commands, including documentation capture tools.
- [Documentation media](media.md) — screenshot and animation inventory and how to reproduce the captures.

Screenshots use synthetic story material on the real local editor. The research and superpowers directories retain historical working records; use the user guides above for current operation.

## Workflow design records

These records explain the unified-workflow design, including proposals and open choices. An optional design alternative is not necessarily an available control. The [unified workflow guide](unified-workflows.md) describes the implemented authoring path.

| Document | Covers |
| --- | --- |
| [Workflow Unification Summary](design/workflow-unification-summary.md) | The lifecycle from preparation to publication, file updates, recall, story time, runtime, and host integration. |
| [Expanded Nodes](design/expanded-nodes.md) | Proposed node contracts and story recipes for triggers, decisions, files, recall, clocks, progression, and relationship pacing. |

Implemented requirements and validation appear in the [requirement evidence](design/workflow-unification-requirements.md) and [release report](superpowers/reports/2026-10-10-workflow-unification.md).
