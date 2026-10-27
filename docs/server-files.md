# Server file setup

Lattice file nodes use the filesystem of the machine running SillyTavern. Windows, macOS and Linux paths work through the Lattice file service; no browser file-access flags are needed. A remote SillyTavern installation saves on its server, not on the device displaying the browser.

## Install the server component

The component is included in the Lattice extension. From the installed Lattice folder, run:

```sh
node tools/install-server-plugin.mjs --sillytavern "PATH_TO_SILLYTAVERN"
```

For example, a Windows installation might use `--sillytavern "C:\SillyTavern"`; a macOS or Linux installation might use `--sillytavern "/home/me/SillyTavern"`. Use the actual installation folder containing `server.js`.

The installer registers `plugins/lattice-files/index.mjs`, which loads the component from this extension. It preserves existing plugins and does not change your server configuration. Keep the extension in its installed location; rerun the installer if you move it.

Set this standard SillyTavern server-plugin option in the installation's `config.yaml` if it is not already enabled:

```yaml
enableServerPlugins: true
```

Restart SillyTavern. Open the node's File section and click **Retry file service**, or reload the page. The component requires the Node.js runtime supported by SillyTavern (Node 20 or newer), and no additional npm packages.

## Configure a node

1. Open **Details → File**. For Write to File, choose **Own file** when it should own its destination.
2. Enter **File path**, including the filename, then choose the format, missing-file policy, initial content and visibility.
3. Click **Save file settings**. This authorizes the destination and clears its setup caution. It does not create or overwrite the document.

Examples:

| Path | Meaning |
| --- | --- |
| `Stories/SceneContext.txt` | Relative to this user's `files/lattice` folder on the server. |
| `C:\Stories\SceneContext.txt` | Windows server path. |
| `/Users/me/Stories/SceneContext.txt` | macOS server path. |
| `/home/me/stories/SceneContext.txt` | Linux server path. |

Leaving File path blank uses **Filename** in the default folder shown in the panel. The filename and path fields stay consistent when edited. Administrators may configure paths outside their user-data folder. Other users must select a destination within their own SillyTavern data folder. Filesystem permissions of the account running SillyTavern also apply.

Read File owns its source. A connected Write to File and Clock Commit inherit their source node's destination. Existing granted browser-file bindings remain available; newly configured destinations use the server service. Portable exports retain suggested filenames but remove machine paths and binding authority, so recipients configure their own location.

## Saving and recovery

Configuration, preview and rejection do not write document bytes. Accepted Apply saves the staged result after checking the captured file version. **Create if missing** creates a missing file and parent folders during Apply. An existing empty file stays empty until an accepted write; empty replacement content is supported.

The service stores receipts, scoped history and pending-write metadata in `<user-data-root>/lattice-file-service/state.json`. Keep this metadata with the user's data when backing up or moving the installation. Do not edit it manually. Server-side receipts survive browser changes and server restarts.

Concurrent requests through one service process are serialized. Files use checked reads and atomic replacement with a durable pending journal. A detected external edit requires a fresh run and review. Portable Node filesystem operations cannot completely exclude an independent process racing a directory or file replacement; detected uncertainty remains held for reconciliation. Do not run multiple SillyTavern processes against the same files concurrently.

File documents retain the existing 262,144-byte limit, 32 active clock turns and 256 active save receipts. Migrated archives remain preserved; additional disk-history checkpoint creation is not part of this change.
