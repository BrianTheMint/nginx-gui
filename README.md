nginx-gui
=========

Simple single-user browser GUI to create and manage nginx config files.

Quick start (Linux):

1. Install Node.js (>=14) and npm.
2. From the project directory:

```bash
npm install
npm run dev    # or `npm start` to run without nodemon
```

Automatic install (curl | bash)

You can install and setup the app automatically on a Linux host with a single command (runs the installer in this repo):

```bash
# Run as root or with sudo
curl -fsSL https://raw.githubusercontent.com/BrianTheMint/nginx-gui/main/scripts/install.sh | sudo bash -s -- --dir /opt/nginx-gui --user nginx-gui --port 3000
```

Installer options (defaults shown):

- `--repo <git url>` (default: `https://github.com/BrianTheMint/nginx-gui.git`)
- `--branch <branch>` (default: `main`)
- `--dir <install dir>` (default: `/opt/nginx-gui`)
- `--user <system user>` (default: `nginx-gui`)
- `--port <port>` (default: `3000`)
- `--node-version <node setup version>` (default: `20.x`)

Notes:

- The installer will detect your package manager (apt/dnf/yum/apk), install Node.js, `git`, and the GitHub CLI (`gh`) when possible, clone the repo to the target install dir, install npm dependencies, create a systemd service `nginx-gui.service`, enable and start it.
- If your repo is private, set `GITHUB_TOKEN` in the environment before running the installer so it can clone non-public repositories (the script uses `git -c http.extraheader` to keep the token out of the process list).
- After installation you may want to run `gh auth login` on the server to configure `gh` for pushing or use `gh auth setup-git` to configure git credential helper.

3. Open http://localhost:3000 in your browser.

Writing to system nginx directory:

- By default the app reads/writes files in the local `configs/` folder.
- To attempt writing to `/etc/nginx` (system), use the UI save option "Write to system". The server process must have permission to write to `/etc/nginx` (run with sudo or as root).
- The app does not perform `nginx -t` validation automatically; you can run `sudo nginx -t` yourself. I can add server-side `nginx -t` integration on request.
 - The app reads/writes files in the local `configs/` folder by default.
 - To attempt writing to `/etc/nginx` (system), use the UI save option "Write to system". The server process must have permission to write to `/etc/nginx` (run with sudo or as root).
 - Server-side validation: a `Validate` button is provided in the UI which sends the current editor contents to the server; the server will write a temp file and run `nginx -t -c <tempfile>` and return the output. This requires `nginx` to be installed and accessible in `PATH` on the host.
 - Admin token: set `ADMIN_TOKEN` environment variable to enable token-based protection for mutating endpoints (create/update/delete). When set, provide `Authorization: Bearer <token>` from the UI (there's a token input). Example run:

```bash
ADMIN_TOKEN=your-secret-token npm start
```

The UI stores the token in `localStorage` when you save or validate.

Enable / disable sites:

- The UI now includes `Enable` and `Disable` buttons. Enabling will create a symbolic link in `/etc/nginx/sites-enabled` pointing to the configuration file (from `/etc/nginx/sites-available` or the local `configs/` folder). Disabling removes that symlink.
- These endpoints require the server process to have permission to create/remove symlinks in `/etc/nginx/sites-enabled` (run the server with appropriate privileges, e.g. via `sudo` or as a dedicated user with those permissions).

Example: enable a site named `example.conf` from the UI (server must be able to write `/etc/nginx/sites-enabled/example.conf`).
 
 Bulk operations and reload:
 
 - You can select multiple files in the list (Shift+click) and use `Enable Selected` / `Disable Selected` to operate in bulk. Results are shown as JSON in an alert — check for errors before reloading.
 - There's a `Reload nginx` button that will attempt to reload the `nginx` service. The server tries `systemctl reload nginx` first and falls back to `nginx -s reload`. The server process must have permission to reload nginx (run as root or via sudo-capable account).
 - Always `Validate` configs before enabling or reloading to avoid downtime.

Be careful: enabling a broken config will cause `nginx` to fail on reload — use the `Validate` button first.

Notes:

- This is an initial scaffold: the frontend is intentionally minimal. We can replace the editor with `Monaco` or `Ace`, add authentication, and add `nginx -t` validation next.

## Cluster management (SSH-based)

You can manage multiple nginx nodes from the GUI (push/pull configs and certificates, validate and reload remotely) using SSH.

Quick steps:

1. The installer generates a management SSH keypair under the app directory at `.ssh/id_manage` and the public key at `.ssh/id_manage.pub`.
2. Copy the public key to remote nodes' `~/.ssh/authorized_keys` for the user you will use to SSH (e.g., `root`):

```bash
ssh root@remote 'mkdir -p ~/.ssh && chmod 700 ~/.ssh'
cat /opt/nginx-gui/.ssh/id_manage.pub | ssh root@remote 'cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
```

3. In the GUI open `/cluster.html`, add nodes (host, port, user), select files, and push/pull configs or upload certificates.

Notes & security:

- Remote commands like moving files to `/etc/nginx` and reloading `nginx` are executed with `sudo` on the remote host; configure the remote SSH user with passwordless `sudo` for those commands or use the `root` user.
- Treat the management private key with care; it's stored under the app directory and should be protected by OS permissions; consider additional encryption or restricted access on multi-user systems.
