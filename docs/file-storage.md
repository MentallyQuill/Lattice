# Saving workflows and files

[Documentation](README.md) · [Quick start](lattice-workspace.md) · [Optional server setup](server-files.md)

Lattice saves workflow designs automatically and gives new output nodes working destinations. You can use the defaults without entering a path, adding a filename suffix, or preparing a data template.

## Choose where files can live

On first use, choose one of two options:

- **Save only inside SillyTavern:** use automatically managed storage immediately.
- **Save anywhere on this computer:** choose other locations on the machine running SillyTavern. Lattice checks the required server component and opens a short setup wizard if it is missing or needs updating.

For a remote installation, the second choice identifies the SillyTavern server. It saves on that machine. **Import from device…** and downloads use the device displaying your browser.

You can change the choice or resume setup through **File → File storage…**. Cancelling optional setup keeps saving inside SillyTavern available. Existing chosen destinations stay configured; changing this preference does not move their files.

The optional wizard includes the matching component, guides installation and any required restart, and checks that it is accessible afterward. Remote or shared hosts may need their owner's help. See [server setup](server-files.md) for the guided steps and advanced fallback. Experimental browser flags are not required.

## Keep a workflow

Workflow edits autosave. **Saved in SillyTavern** means Lattice verified the saved contents. **Unsaved draft**, **Saving…**, or **Save needs attention** should be resolved before relying on a completed host save. A failed save retains your work.

Use **File → Open saved…** to find a saved workflow. The same saved workflow can be used in several chats: saving an edit changes its design everywhere it is used. Story state remains separate for each chat, and a running execution finishes against its captured workflow revision.

If a recovered draft differs from the workflow selected for the chat, Lattice keeps your draft and pauses execution. Open Lattice to choose which workflow to use.

Choose **Save As…** and enter a different friendly name when you want an independent workflow. Later edits to that copy do not update the original. **Rename workflow…** keeps the existing workflow identity.

**Import workflow…** opens a copy from your device. **Download / share workflow…** creates a portable sharing copy; it does not replace an acknowledged live save. Sharing excludes local connection identifiers, writable file bindings and machine paths. Keep private input data out of a sharing copy unless you deliberately include it. **Download workflow backup…** retains your local workflow configuration; it does not include the contents or recovery history of its input and output files.

## Let nodes manage their files

Select a file node and open **Details → File**. New file outputs have an automatic destination and suggested friendly name. Clocks and outcomes start with valid state; users do not need to paste their storage JSON.

The type follows the node's purpose and declared inputs. Lattice supplies the correct filename suffix automatically. Entering an existing suffix does not double it. Changing a name never converts the contents to another type.

Every file-saving node offers **File handling**:

| Choice | What happens when you accept the result |
| --- | --- |
| **Replace** | Update the same file with the new contents. This is the default for new nodes. |
| **Append** | Retain existing material and add the new material once. Structured data stays in a valid form. |

Use **Change…** to choose another destination. Wider server locations use the folder chooser after optional setup. **Open** inspects the saved output; **Download** creates a copy on your device. A friendly label can change without moving the existing physical file. Changing an existing file's type or physical destination uses an explicit new destination so the original is retained.

**Advanced** contains custom locations, explicit formats, creation policy, specialized mutations and access choices. Choose a character by name for character-private files. An unavailable character does not turn private data into public data. Public here describes workflow access, not internet publication.

## Choose an input

A reader cannot guess which personal file you want. Use **Import from device…** to bring in a managed copy, or choose an existing source. Changes to the original device file will not update an imported copy.

A connected writer uses the exact source reference. **Clock Commit** uses its Story Clock's destination. Separate workflows own separate state by default; deliberate connections or choosing existing data establish sharing.

## Understand when saving happens

Editing a workflow saves its configuration. Previewing or rejecting a result does not write its output files. Accepting a reviewed result saves the staged changes attached to that result. Importing an input copy is a separate, explicit action.

Read each save's result if a workflow writes several files. A confirmed first save and an uncertain second save can require different recovery actions. Follow the offered retry or recovery action; Lattice retains identities so a retry does not append the same accepted material twice.

History maintenance runs automatically at accepted save boundaries. Select a file node and choose **File → Recover selected file…** to inspect and confirm an earlier version. Recovery keeps up to 20 prior content versions separately from the history used to prevent duplicate story effects. Restoring earlier contents checks the current destination and retains its privacy and accepted-history protections. A missing verified version is reported instead of silently resetting story state.

Inside-SillyTavern saving verifies file contents and retains recovery copies. Its host API cannot atomically exclude writes from independent clients; storage details state this limitation. The optional server component serializes checked writes through its service. Neither mode silently redirects a configured external file when access is lost.

Older chat data, configured paths, browser grants and accepted history remain preserved. The old global Workflow Data / Legacy chat data setup screen is no longer needed; use each node's File section.
