# Server file setup

Lattice saves inside SillyTavern by default. This creates actual files in the authenticated user's SillyTavern files area without installing a server component or changing browser flags. Optional custom locations use the filesystem of the machine running SillyTavern. A remote installation saves on its server, not on the device displaying the browser.

## Choose file storage

On first use, Lattice checks the installed component's version, supported operations and your account's access, then offers **Save only inside SillyTavern** or **Save anywhere on this computer**. A remote host instead says **Choose locations on the SillyTavern server**. Both choices keep your existing destinations and data. Your choice and unfinished setup progress are saved for this authenticated user and host. Open **File storage** later to change the choice or resume setup.

Working compatible support skips installation. Missing support, an incompatible version, denied access and an unreachable server have different guidance. Retry a connection failure; it does not mean the component is missing. Setup can be closed or cancelled at any point, and saving inside SillyTavern remains available.

Inside storage uses read/check/write/verify and retained recovery copies. It reports verified acknowledgement, rather than atomic cross-device compare-and-swap. Two independent browsers or devices can still race. The optional component serializes requests through one service process and retains its stronger checked-write behavior, subject to external filesystem races described below.

## Guided setup for custom locations

Choose wider location access in **File storage**, then download the included setup bundle. The browser cannot install an absent backend through its own API. Extract the entire ZIP on the computer running SillyTavern:

- Windows: open **Setup-Windows.cmd**.
- macOS: open **Setup-macOS.command**, or run `sh Setup-macOS.command` from Terminal if extraction removed execution permission.
- Linux: run `sh Setup-Linux.sh`.

Node.js 20 or newer must be available as `node`; use the Node version required by your SillyTavern release. No extra npm dependencies are installed. macOS may require its ordinary approval for downloaded scripts. Linux folder selection uses Zenity when present; otherwise paste the folder path. The launcher opens the system browser when available and also prints the local setup link.

In that local page, select the SillyTavern installation folder containing `server.js` and `config.yaml`. Explicitly choose whether to enable server plugins. Setup preserves unrelated configuration and plugins and backs up `config.yaml` before changing its top-level `enableServerPlugins` boolean. Ambiguous config, unsafe symbolic-link destinations and existing unmanaged `lattice-files` plugins are refused for the host owner to resolve. Setup verifies the source manifest, copied bytes and installed module imports.

Restart SillyTavern yourself, return to Lattice, and choose **Check again**. Setup never restarts your host. Progress survives the restart; completion requires a fresh authenticated capability check. Installed modules live under `plugins/lattice-files/runtime`; the extracted download can be deleted afterward.

The setup page listens only on `127.0.0.1`, uses a random session token and expires after 15 minutes. Keep the printed link private and close setup after use. It is not a remote administration listener.

For remote/shared installations, the host owner must extract and run the bundle on the server. A laptop browser cannot show a folder picker on a headless server. The owner can use the command below in the extracted bundle. In containers, install into a persistent SillyTavern volume and restart through the deployment's normal controls. No administrator credentials are requested by Lattice.

## Advanced command-line installation

The component is included in the Lattice extension. From the installed Lattice folder, run:

```sh
node tools/install-server-plugin.mjs --sillytavern "PATH_TO_SILLYTAVERN"
```

For example, a Windows installation might use `--sillytavern "C:\SillyTavern"`; a macOS or Linux installation might use `--sillytavern "/home/me/SillyTavern"`. Use the actual installation folder containing `server.js`.

The installer copies the component and its relative runtime imports into `plugins/lattice-files`. It preserves other plugins and leaves server configuration unchanged by default. Its installed copy continues working if the extension/download is moved. Rerun setup after updating Lattice to install matching support.

Set this standard SillyTavern server-plugin option in the installation's `config.yaml` if it is not already enabled:

```yaml
enableServerPlugins: true
```

Restart SillyTavern. Open the node's File section and click **Retry file service**, or reload the page. The component requires the Node.js runtime supported by SillyTavern (Node 20 or newer), and no additional npm packages.

The host owner can instead explicitly authorize the same setting change, with a configuration backup:

```sh
node tools/install-server-plugin.mjs --sillytavern "PATH_TO_SILLYTAVERN" --enable-server-plugins
```

For maintainers, `node tools/build-server-setup.mjs` produces `assets/lattice-file-setup.zip` from the current component and all its runtime imports. Rebuild this download after changing runtime source. The bundle includes a module package manifest and launchers for all three platforms.

## Browse server files

The server chooser lists authorized roots and folders without writing files or granting a file binding. Select a listed file, or browse to a folder and enter a filename. Manual folder entry remains available for an unlisted drive, network mount or a very large directory. Listings return at most 200 entries after examining at most 400 candidates. The chooser explains when a listing is partial. Symbolic links and the service's metadata directory are excluded; direct traversal outside a normal user's root is denied. Administrators can browse the filesystem containing the user's root and enter other authorized roots, subject to OS permissions.

Selecting a path alone does not create or overwrite the file. The existing configure operation validates the selected path and grants the scoped binding; accepted Apply remains the document-write boundary.

## Configure a node

1. Open **Details → File**. New outputs and readers already have automatic destinations, names and types.
2. Use **Change…** to choose another authorized location. Custom server locations use the folder chooser after optional setup; manual paths remain under **Advanced**.
3. Choose **File handling → Replace / Append**. Valid configuration changes autosave and grant the chosen destination without writing its output contents. Accepted Apply remains the output-write boundary.

Examples:

| Path | Meaning |
| --- | --- |
| `Stories/SceneContext.txt` | Relative to this user's `files/lattice` folder on the server. |
| `C:\Stories\SceneContext.txt` | Windows server path. |
| `/Users/me/Stories/SceneContext.txt` | macOS server path. |
| `/home/me/stories/SceneContext.txt` | Linux server path. |

Lattice supplies a filename suffix matching the declared type. Existing physical names and destinations remain stable until explicitly changed; a type or physical destination change uses a new-copy flow. Administrators may configure paths outside their user-data folder. Other users remain within their authorized SillyTavern data folder. The server account's OS permissions also apply.

Read File owns its source. A connected Write to File and Clock Commit inherit their source node's destination. Existing browser/server grants remain with their provider. Ordinary managed outputs use inside-SillyTavern storage; custom paths use the optional server component. Portable exports retain suggested names and types while removing machine paths and writable binding authority.

For an unset reader, **When no file is set → Generate from story** reuses compatible saved state first, otherwise makes one bounded request with the reader's selected model and current conversation and character. **Valid starting template** uses a schema-valid seed without a request; **Require a file** waits for an authorized source. Existing configured paths and grants stay authoritative even when missing or revoked. Initialization settings and schema are portable; generated story contents are not workflow configuration. Generated or template contents are saved only when you accept the reviewed result, and later runs reuse them without another initialization request. Private state retains its character scope.

## Saving and recovery

Configuration, preview and rejection do not write document bytes. Accepted Apply saves the staged result after checking the captured file version. **Create if missing** creates a missing file and parent folders during Apply. An existing empty file stays empty until an accepted write; empty replacement content is supported.

The service stores receipts, scoped history and pending-write metadata in `<user-data-root>/lattice-file-service/state.json`. Keep this metadata with the user's data when backing up or moving the installation. Do not edit it manually. Server-side receipts survive browser changes and server restarts.

Concurrent requests through one service process are serialized. Files use checked reads and atomic replacement with a durable pending journal. A detected external edit requires a fresh run and review. Portable Node filesystem operations cannot completely exclude an independent process racing a directory or file replacement; detected uncertainty remains held for reconciliation. Do not run multiple SillyTavern processes against the same files concurrently.

File documents retain the 262,144-byte limit. Active clock history and receipts are checkpointed automatically at accepted save boundaries, preserving replay identities and private history. Content recovery retains up to 20 prior versions separately from replay archives. Disk-full or unavailable verified history remains an actionable save/recovery issue; no canonical state is silently deleted to make space. See [saving workflows and files](file-storage.md).
