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
