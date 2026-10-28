# Lattice optional file setup

Run this setup on the computer running SillyTavern. Extract the entire ZIP first. Node.js 20 or newer must be installed and available as `node` (use the Node version required by your SillyTavern release). No additional npm packages are needed.

- Windows: open Setup-Windows.cmd.
- macOS: open Setup-macOS.command. If extraction removed execution permission, run `sh Setup-macOS.command` from Terminal in the extracted folder. macOS may require you to approve a downloaded script under its normal security controls.
- Linux desktop: run `sh Setup-Linux.sh`. Folder selection uses Zenity when available; otherwise paste the folder path. A desktop browser opens through xdg-open when available. The launcher also prints the local link.

Choose your SillyTavern installation folder (containing server.js and config.yaml), explicitly choose whether to enable server plugins, then install. Setup backs up config.yaml before changing its single top-level enableServerPlugins boolean. It rejects ambiguous configuration and preserves unrelated plugins. Restart SillyTavern yourself and return to Lattice's File storage to check access.

The loopback setup page uses a random one-session token, runs only at 127.0.0.1, and expires after 15 minutes. Keep its printed link private. Close setup when finished. Importing its modules does not launch the UI or change a host.

For a remote or shared host, send this bundle to the host owner to extract and run on that server. A browser on your laptop cannot open a folder dialog on the server. For a headless server, the owner can use this advanced command in the extracted folder:

    node tools/install-server-plugin.mjs --sillytavern "/path/to/SillyTavern" --enable-server-plugins

Omit --enable-server-plugins to leave config.yaml unchanged. The command prints restart guidance; it does not restart the host. Run as the normal server owner, not an elevated account. For containers, install into a persistent SillyTavern volume and restart through the deployment owner. The component is copied into plugins/lattice-files/runtime; extracted Downloads files can be deleted after a successful installation.

Normal saving inside SillyTavern works while setup is unfinished. Retry the same bundle to resume installation. Existing unmanaged lattice-files directories and symbolic-link destinations require the host owner's review; setup will not overwrite them.
