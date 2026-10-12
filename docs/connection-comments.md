# Connections and workflow comments

[Documentation](README.md) · [Operator’s manual](operators-manual.md)

Connections show what feeds the next step. Comments label sections of the canvas without changing execution.

## Follow a connection

A wire leaves each pin horizontally, turns near the endpoint, and takes a direct route through the middle. Backward connections also use direct routes, with a shallow return when pins are nearly level. Wires can pass behind cards.

Hover over or select a wire to highlight it and both endpoint pins and show its type label. Ember’s translucent cards let wires show faintly through while labels, icons, and pins stay solid.

All themes use the same shapes:

| Type | Pin shape |
| --- | --- |
| Context | Filled circle |
| Guidance | Diamond |
| Draft | Pentagon |
| Patches | Triangle |
| Candidate | Ring with a center dot |
| Text | Capsule |
| Data | Square |

Wire colors match their pins. Harbor and Signal also use accessible palettes and wire patterns. Changing the theme changes colors and surfaces while retaining the type shapes.

## Frame a section with a comment

Select nodes, right-click a selected node, and choose **Add comment around selection**. You can also press **C** outside text inputs. With no selection, C creates an empty comment at the canvas cursor or current view. The new title is ready to edit.

Edit the title in the header, or select the comment to change its title, multiline notes, color, and **Move contents** setting. Drag the header grip to move it; drag the lower-right handle to resize it.

**Fit to contents** frames the node cards currently enclosed by the comment. Resizing or fitting changes the frame without moving those nodes.

## Move, copy, or remove a comment

**Move contents** is on by default. A header drag moves the ordinary nodes fully enclosed below the header when the drag begins. That set stays fixed during the drag; other comments remain in place. Turn the setting off to move only the frame. You can interact with nodes and connections through the comment’s interior.

To move a comment with a chosen set of nodes, select them together before dragging its header. A selected folded group moves with them and stays folded. Undo restores the move in one step.

**Delete comment** removes only the frame; its nodes and connections stay in place. Undo/redo restores edits and moves. Copy/paste, saved workflows, and subgraph export/import retain title, notes, color, position, size, and Move contents. Select both the comment and its nodes to copy them together.

Comments do not group nodes for execution. Read-only comments can be viewed but not edited, moved, resized, or deleted.
