async function api(path, opts) {
  const headers = (opts && opts.headers) ? Object.assign({}, opts.headers) : {};
  const token = localStorage.getItem('adminToken') || document.getElementById('admin-token')?.value || '';
  if (token && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, Object.assign({}, opts || {}, { headers }));
  if (res.headers.get('content-type')?.includes('application/json')) return res.json();
  return res.text();
}

const showKeyBtn = document.getElementById('show-key-btn');
const pubKeyEl = document.getElementById('pub-key');
const nodeListEl = document.getElementById('node-list');
const addNodeBtn = document.getElementById('add-node-btn');
const nodeName = document.getElementById('node-name');
const nodeHost = document.getElementById('node-host');
const nodePort = document.getElementById('node-port');
const nodeUser = document.getElementById('node-user');
const fileSelect = document.getElementById('file-select');
const nodesSelect = document.getElementById('nodes-select');
const pushConfigBtn = document.getElementById('push-config-btn');
const pullConfigBtn = document.getElementById('pull-config-btn');
const uploadCertBtn = document.getElementById('upload-cert-btn');
const certFile = document.getElementById('cert-file');
const certTarget = document.getElementById('cert-target');
const output = document.getElementById('cluster-output');

function show(msg) { output.textContent = (output.textContent || '') + '\n' + msg; }

async function loadKey() {
  try {
    const res = await api('/api/cluster/key');
    pubKeyEl.textContent = res.publicKey || 'no key';
    pubKeyEl.style.display = 'block';
  } catch (e) { pubKeyEl.textContent = 'error: ' + e; pubKeyEl.style.display = 'block'; }
}

showKeyBtn.addEventListener('click', loadKey);

async function loadNodes() {
  const res = await api('/api/nodes');
  nodeListEl.innerHTML = '';
  nodesSelect.innerHTML = '';
  (res.nodes || []).forEach(n => {
    const li = document.createElement('li');
    li.textContent = `${n.name} (${n.host})`;
    const del = document.createElement('button'); del.textContent = '🗑'; del.addEventListener('click', async () => {
      if (!confirm('Delete node ' + n.name + '?')) return;
      await api('/api/nodes/' + n.id, { method: 'DELETE' });
      await loadNodes();
    });
    li.appendChild(del);
    nodeListEl.appendChild(li);

    const opt = document.createElement('option'); opt.value = n.id; opt.textContent = `${n.name} (${n.host})`; nodesSelect.appendChild(opt);
  });
}

addNodeBtn.addEventListener('click', async () => {
  const name = nodeName.value.trim(); const host = nodeHost.value.trim(); const port = parseInt(nodePort.value || '22') || 22; const user = nodeUser.value.trim() || 'root';
  if (!name || !host) return alert('Enter name and host');
  const res = await api('/api/nodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, host, port, user, useManagementKey: true }) });
  if (res.error) return alert('Error: ' + res.error);
  await loadNodes();
});

async function loadFiles() {
  const res = await api('/api/files');
  fileSelect.innerHTML = '';
  (res.files || []).forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; fileSelect.appendChild(o); });
}

pushConfigBtn.addEventListener('click', async () => {
  const file = fileSelect.value; const nodes = Array.from(nodesSelect.selectedOptions).map(o => o.value);
  if (!file) return alert('Select a file');
  if (nodes.length === 0) return alert('Select target nodes (multi-select)');
  output.textContent = 'Pushing...';
  for (const nid of nodes) {
    const res = await api('/api/nodes/' + nid + '/push-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file }) });
    show(JSON.stringify({ node: nid, result: res }));
  }
  alert('Push complete (see results)');
});

const enableReloadBtn = document.getElementById('enable-reload-btn');
enableReloadBtn.addEventListener('click', async () => {
  const file = fileSelect.value; const nodes = Array.from(nodesSelect.selectedOptions).map(o => o.value);
  if (!file) return alert('Select a file');
  if (nodes.length === 0) return alert('Select target nodes (multi-select)');
  output.textContent = 'Enabling and reloading...';
  for (const nid of nodes) {
    try {
      const res = await api('/api/nodes/' + nid + '/enable-and-reload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file }) });
      show(JSON.stringify({ node: nid, result: res }));
    } catch (e) { show(JSON.stringify({ node: nid, error: String(e) })); }
  }
  alert('Enable + Reload complete (see results)');
});

pullConfigBtn.addEventListener('click', async () => {
  const file = fileSelect.value; const nodes = Array.from(nodesSelect.selectedOptions).map(o => o.value);
  if (!file) return alert('Select a file');
  if (nodes.length !== 1) return alert('Select exactly one node to pull from');
  const nid = nodes[0];
  const res = await api('/api/nodes/' + nid + '/pull-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file }) });
  if (res.error) return alert('Error: ' + res.error);
  // open in editor (redirect back to index and show file)
  alert('Pulled file; content will be shown on config page. Click OK to go there.');
  window.location = '/';
  setTimeout(() => { localStorage.setItem('cluster_pulled_file', JSON.stringify(res)); }, 500);
});

uploadCertBtn.addEventListener('click', async () => {
  const nodes = Array.from(nodesSelect.selectedOptions).map(o => o.value);
  if (nodes.length !== 1) return alert('Select exactly one node to upload cert to');
  if (!certFile.files.length) return alert('Select a certificate file');
  const file = certFile.files[0];
  const reader = new FileReader();
  reader.onload = async () => {
    const b64 = btoa(reader.result);
    const targetDir = certTarget.value.trim() || '/etc/ssl/nginx';
    const nid = nodes[0];
    const res = await api('/api/nodes/' + nid + '/push-certs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ name: file.name, contentBase64: b64 }], targetDir }) });
    show(JSON.stringify(res));
    alert('Upload complete');
  };
  reader.readAsBinaryString(file);
});

// when returning from pull, populate editor
if (localStorage.getItem('cluster_pulled_file')) {
  try {
    const p = JSON.parse(localStorage.getItem('cluster_pulled_file'));
    localStorage.removeItem('cluster_pulled_file');
    // open index then set editor content later
    // store pulled content to a special key
    localStorage.setItem('pulled_file_content', JSON.stringify(p));
  } catch (e) { }
}

loadNodes(); loadFiles();