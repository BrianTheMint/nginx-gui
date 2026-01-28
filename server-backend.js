const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const archiver = require('archiver');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, 'configs');
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

fs.mkdirSync(CONFIG_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function safeName(name) {
  return path.basename(name);
}

function requireAuth(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const auth = (req.headers.authorization || '').trim();
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing token' });
  const token = auth.slice(7).trim();
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'invalid token' });
  next();
}

app.get('/api/files', async (req, res) => {
  try {
    const files = listAllConfigs();
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/files/:name', async (req, res) => {
  try {
    const name = safeName(req.params.name);
    const filePath = resolveAvailablePath(name);
    const content = await fsp.readFile(filePath, 'utf8');
    res.json({ name, content });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/files/:name', requireAuth, async (req, res) => {
  try {
    const name = safeName(req.params.name);
    const { content, target } = req.body || {};
    let dest;
    if (target === 'system') {
      // attempt to write to system nginx directory
      dest = path.join('/etc/nginx', name);
    } else {
      dest = path.join(CONFIG_DIR, name);
    }
    await fsp.writeFile(dest, content || '', 'utf8');
    res.json({ ok: true, path: dest });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/files/:name', requireAuth, async (req, res) => {
  try {
    const name = safeName(req.params.name);
    const { target } = req.query || {};
    let dest = (target === 'system') ? path.join('/etc/nginx', name) : path.join(CONFIG_DIR, name);
    await fsp.unlink(dest);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/validate', async (req, res) => {
  try {
    let content = (req.body && req.body.content) || '';
    // If content doesn't already have a top-level http block, wrap it
    const trimmed = content.trim();
    if (!trimmed.match(/^\s*http\s*{/i)) {
      content = `http {\n${content}\n}`;
    }
    const tmpName = 'nginx-gui-' + crypto.randomBytes(6).toString('hex') + '.conf';
    const tmpPath = path.join(os.tmpdir(), tmpName);
    await fsp.writeFile(tmpPath, content, 'utf8');
    // Run nginx -t against the provided file. This requires `nginx` available on host.
    const cmd = `nginx -t -c "${tmpPath}"`;
    exec(cmd, { timeout: 10_000 }, (err, stdout, stderr) => {
      const output = String(stdout || '') + String(stderr || '');
      // best-effort cleanup
      fs.unlink(tmpPath, () => {});
      if (err) {
        // include exit code if present
        return res.json({ ok: false, code: err.code || 1, output });
      }
      res.json({ ok: true, code: 0, output });
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function resolveAvailablePath(name) {
  const candidates = [
    path.join('/etc/nginx/sites-available', name),
    path.join(CONFIG_DIR, name)
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[0]; // prefer system path when creating
}

function listAllConfigs() {
  const all = new Set();
  try {
    const sysConfigs = fs.readdirSync('/etc/nginx/sites-available', { withFileTypes: true });
    sysConfigs.filter(f => f.isFile()).forEach(f => all.add(f.name));
  } catch (e) { }
  try {
    const localConfigs = fs.readdirSync(CONFIG_DIR, { withFileTypes: true });
    localConfigs.filter(f => f.isFile()).forEach(f => all.add(f.name));
  } catch (e) { }
  return Array.from(all).sort();
}

app.get('/api/sites/:name/status', async (req, res) => {
  try {
    const name = safeName(req.params.name);
    const available = resolveAvailablePath(name);
    const enabled = path.join('/etc/nginx/sites-enabled', name);
    const availableExists = fs.existsSync(available);
    const enabledExists = fs.existsSync(enabled);
    let real = null;
    try { real = enabledExists ? fs.realpathSync(enabled) : null; } catch(e) { real = null; }
    res.json({ name, available, availableExists, enabled, enabledExists, enabledTarget: real });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/sites/:name/enable', requireAuth, async (req, res) => {
  try {
    const name = safeName(req.params.name);
    const available = resolveAvailablePath(name);
    const enabled = path.join('/etc/nginx/sites-enabled', name);
    if (!fs.existsSync(available)) return res.status(404).json({ error: 'available config not found', path: available });
    if (fs.existsSync(enabled)) return res.status(409).json({ error: 'already enabled', path: enabled });
    await fsp.symlink(available, enabled);
    res.json({ ok: true, enabled, target: available });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/sites/:name/enable', requireAuth, async (req, res) => {
  try {
    const name = safeName(req.params.name);
    const enabled = path.join('/etc/nginx/sites-enabled', name);
    if (!fs.existsSync(enabled)) return res.status(404).json({ error: 'not enabled' });
    await fsp.unlink(enabled);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Bulk enable selected files (body: { files: [name,...] })
app.post('/api/sites/enable', requireAuth, async (req, res) => {
  try {
    const files = (req.body && req.body.files) || [];
    if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'no files' });
    const results = [];
    for (const n of files) {
      const name = safeName(n);
      const available = resolveAvailablePath(name);
      const enabled = path.join('/etc/nginx/sites-enabled', name);
      try {
        if (!fs.existsSync(available)) { results.push({ name, ok: false, error: 'available not found', path: available }); continue; }
        if (fs.existsSync(enabled)) { results.push({ name, ok: false, error: 'already enabled' }); continue; }
        await fsp.symlink(available, enabled);
        results.push({ name, ok: true, enabled, target: available });
      } catch (e) { results.push({ name, ok: false, error: String(e) }); }
    }
    res.json({ results });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// Bulk disable selected files (body: { files: [name,...] })
app.delete('/api/sites/enable', requireAuth, async (req, res) => {
  try {
    const files = (req.body && req.body.files) || [];
    if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'no files' });
    const results = [];
    for (const n of files) {
      const name = safeName(n);
      const enabled = path.join('/etc/nginx/sites-enabled', name);
      try {
        if (!fs.existsSync(enabled)) { results.push({ name, ok: false, error: 'not enabled' }); continue; }
        await fsp.unlink(enabled);
        results.push({ name, ok: true });
      } catch (e) { results.push({ name, ok: false, error: String(e) }); }
    }
    res.json({ results });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// Reload nginx: try systemctl reload nginx, fall back to nginx -s reload
app.post('/api/nginx/reload', requireAuth, async (req, res) => {
  try {
    const tryCmd = (cmd) => new Promise((resolve) => {
      exec(cmd, { timeout: 10_000 }, (err, stdout, stderr) => {
        resolve({ err, stdout: String(stdout||''), stderr: String(stderr||'') });
      });
    });
    // prefer systemctl when available
    let out = await tryCmd('systemctl --no-pager status nginx');
    if (!out.err) {
      const reload = await tryCmd('systemctl reload nginx');
      return res.json({ ok: !reload.err, method: 'systemctl', stdout: reload.stdout, stderr: reload.stderr, code: reload.err ? reload.err.code : 0 });
    }
    // fallback to nginx -s reload
    const nginxReload = await tryCmd('nginx -s reload');
    res.json({ ok: !nginxReload.err, method: 'nginx -s reload', stdout: nginxReload.stdout, stderr: nginxReload.stderr, code: nginxReload.err ? nginxReload.err.code : 0 });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/download', async (req, res) => {
  try {
    const files = (req.query.files || '').split(',').map(f => safeName(f)).filter(Boolean);
    res.attachment('nginx-configs.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);
    for (const f of files) {
      const p = path.join(CONFIG_DIR, f);
      if (fs.existsSync(p)) archive.file(p, { name: f });
    }
    await archive.finalize();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- Cluster / Multi-node management (SSH-based MVP)
const { NodeSSH } = require('node-ssh');
const NODES_FILE = path.join(__dirname, 'nodes.json');
const SSH_DIR = path.join(__dirname, '.ssh');
const MANAGEMENT_KEY = path.join(SSH_DIR, 'id_manage');
const CLUSTER_LOG = path.join(__dirname, 'cluster.log');

function loadNodes() {
  try {
    if (!fs.existsSync(NODES_FILE)) return [];
    return JSON.parse(fs.readFileSync(NODES_FILE, 'utf8') || '[]');
  } catch (e) { return []; }
}
function saveNodes(nodes) {
  fs.mkdirSync(path.dirname(NODES_FILE), { recursive: true });
  fs.writeFileSync(NODES_FILE, JSON.stringify(nodes, null, 2), 'utf8');
}
function addLog(entry) {
  try {
    const line = `[${new Date().toISOString()}] ${entry}\n`;
    fs.appendFileSync(CLUSTER_LOG, line);
  } catch (e) { }
}

async function ensureManagementKey() {
  try {
    fs.mkdirSync(SSH_DIR, { recursive: true });
    if (fs.existsSync(MANAGEMENT_KEY) && fs.existsSync(MANAGEMENT_KEY + '.pub')) {
      return fs.readFileSync(MANAGEMENT_KEY + '.pub', 'utf8');
    }
    // generate using ssh-keygen
    await new Promise((resolve, reject) => {
      exec(`ssh-keygen -t rsa -b 4096 -f "${MANAGEMENT_KEY}" -N "" -C "nginx-gui management key"`, (err) => err ? reject(err) : resolve());
    });
    fs.chmodSync(MANAGEMENT_KEY, 0o600);
    fs.chmodSync(MANAGEMENT_KEY + '.pub', 0o644);
    return fs.readFileSync(MANAGEMENT_KEY + '.pub', 'utf8');
  } catch (e) { throw e; }
}

app.get('/api/cluster/key', requireAuth, async (req, res) => {
  try {
    const pub = await ensureManagementKey();
    res.json({ publicKey: pub });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/cluster/key', requireAuth, async (req, res) => {
  try {
    const pub = await ensureManagementKey();
    res.json({ publicKey: pub });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/nodes', requireAuth, async (req, res) => {
  try { res.json({ nodes: loadNodes() }); } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/nodes', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { name, host, port = 22, user = 'root', useManagementKey = true } = body;
    if (!host || !name) return res.status(400).json({ error: 'name and host required' });
    const nodes = loadNodes();
    const id = crypto.randomBytes(6).toString('hex');
    const node = { id, name, host, port, user, useManagementKey };
    nodes.push(node);
    saveNodes(nodes);
    addLog(`node:add ${id} ${host}`);
    res.json({ node });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.delete('/api/nodes/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    let nodes = loadNodes();
    nodes = nodes.filter(n => n.id !== id);
    saveNodes(nodes);
    addLog(`node:remove ${id}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

function findNode(id) {
  const nodes = loadNodes();
  return nodes.find(n => n.id === id);
}

async function sshConnectToNode(node) {
  const ssh = new NodeSSH();
  const opts = { host: node.host, port: node.port, username: node.user, tryKeyboard: false };
  if (node.useManagementKey) {
    if (!fs.existsSync(MANAGEMENT_KEY)) throw new Error('management key not found on server; generate it first via /api/cluster/key');
    opts.privateKey = MANAGEMENT_KEY;
  }
  // note: can be extended to support passwords or other keys
  await ssh.connect(opts);
  return ssh;
}

app.post('/api/nodes/:id/push-config', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const node = findNode(id);
    if (!node) return res.status(404).json({ error: 'node not found' });
    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ error: 'filename required' });
    const localPath = path.join(CONFIG_DIR, safeName(filename));
    if (!fs.existsSync(localPath)) return res.status(404).json({ error: 'local config not found' });

    const ssh = await sshConnectToNode(node);
    const remoteTmp = `/tmp/${path.basename(filename)}.${Date.now()}`;
    await ssh.putFile(localPath, remoteTmp);
    // move into place with sudo
    const remoteDest = `/etc/nginx/sites-available/${path.basename(filename)}`;
    const mvCmd = `sudo mv ${remoteTmp} ${remoteDest} && sudo chown root:root ${remoteDest} && sudo chmod 644 ${remoteDest}`;
    const result = await ssh.execCommand(mvCmd, { cwd: '/' });
    ssh.dispose();
    addLog(`push-config ${node.host} ${filename} -> ${remoteDest} : ${result.code || 0}`);
    if (result.stderr) return res.status(500).json({ ok: false, stdout: result.stdout, stderr: result.stderr });
    res.json({ ok: true, stdout: result.stdout });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/nodes/:id/pull-config', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const node = findNode(id);
    if (!node) return res.status(404).json({ error: 'node not found' });
    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ error: 'filename required' });
    const remotePath = `/etc/nginx/sites-available/${path.basename(filename)}`;
    const ssh = await sshConnectToNode(node);
    const localTmp = path.join(os.tmpdir(), `nginx-gui-${crypto.randomBytes(4).toString('hex')}-${path.basename(filename)}`);
    try {
      await ssh.getFile(localTmp, remotePath);
    } catch (err) {
      ssh.dispose();
      return res.status(500).json({ error: 'failed to fetch remote file: ' + String(err) });
    }
    const content = fs.readFileSync(localTmp, 'utf8');
    fs.unlinkSync(localTmp);
    ssh.dispose();
    addLog(`pull-config ${node.host} ${filename}`);
    res.json({ name: filename, content });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// push certs (body: { files: [{ name, contentBase64 }], targetDir: '/etc/ssl/nginx' })
app.post('/api/nodes/:id/push-certs', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const node = findNode(id);
    if (!node) return res.status(404).json({ error: 'node not found' });
    const body = req.body || {};
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0) return res.status(400).json({ error: 'no files' });
    const targetDir = body.targetDir || '/etc/ssl/nginx';
    const ssh = await sshConnectToNode(node);
    const results = [];
    for (const f of files) {
      const name = safeName(f.name || 'cert');
      const content = f.contentBase64 || '';
      const tmpLocal = path.join(os.tmpdir(), `nginx-gui-cert-${crypto.randomBytes(4).toString('hex')}-${name}`);
      fs.writeFileSync(tmpLocal, Buffer.from(content, 'base64'));
      const remoteTmp = `/tmp/${name}.${Date.now()}`;
      await ssh.putFile(tmpLocal, remoteTmp);
      const dest = path.posix.join(targetDir, name);
      const mv = `sudo mkdir -p ${targetDir} && sudo mv ${remoteTmp} ${dest} && sudo chown root:root ${dest} && sudo chmod 644 ${dest}`;
      const r = await ssh.execCommand(mv);
      results.push({ name, stdout: r.stdout, stderr: r.stderr, code: r.code || 0 });
      fs.unlinkSync(tmpLocal);
    }
    ssh.dispose();
    addLog(`push-certs ${node.host} files:${files.length}`);
    res.json({ results });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// bulk sync: body { files: [filename...], nodes: [id...], action: 'push' }
app.post('/api/cluster/sync', requireAuth, async (req, res) => {
  try {
    const { files = [], nodes = [], action = 'push' } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'no files' });
    if (!Array.isArray(nodes) || nodes.length === 0) return res.status(400).json({ error: 'no nodes' });
    const results = [];
    for (const nid of nodes) {
      for (const f of files) {
        try {
          if (action === 'push') {
            const r = await (async () => {
              const node = findNode(nid);
              if (!node) throw new Error('node not found: ' + nid);
              const localPath = path.join(CONFIG_DIR, safeName(f));
              if (!fs.existsSync(localPath)) throw new Error('local file not found: ' + f);
              const ssh = await sshConnectToNode(node);
              const remoteTmp = `/tmp/${path.basename(f)}.${Date.now()}`;
              await ssh.putFile(localPath, remoteTmp);
              const remoteDest = `/etc/nginx/sites-available/${path.basename(f)}`;
              const mvCmd = `sudo mv ${remoteTmp} ${remoteDest} && sudo chown root:root ${remoteDest} && sudo chmod 644 ${remoteDest}`;
              const result = await ssh.execCommand(mvCmd);
              ssh.dispose();
              if (result.stderr) throw new Error(result.stderr || 'unknown error');
              return { ok: true, node: node.host, file: f };
            })();
            results.push(r);
          } else {
            results.push({ ok: false, error: 'unsupported action' });
          }
        } catch (err) { results.push({ ok: false, error: String(err), node: nid, file: f }); }
      }
    }
    addLog(`cluster:sync nodes:${nodes.length} files:${files.length}`);
    res.json({ results });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Export app without listening - let server.js handle listening
module.exports = app;
