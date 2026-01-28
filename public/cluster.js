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

function show(msg) { 
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  output.textContent = (output.textContent || '') + '\n' + line; 
  output.scrollTop = output.scrollHeight;
}

function showStatusModal(message, title, type) {
  let modal = document.getElementById('status-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'status-modal';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:2px solid #333;padding:20px;border-radius:8px;z-index:10000;max-width:600px;max-height:80vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3)';
    document.body.appendChild(modal);
  }
  const titleEl = document.createElement('h3');
  titleEl.textContent = title;
  titleEl.style.margin = '0 0 12px 0';
  const msgEl = document.createElement('pre');
  msgEl.textContent = message;
  msgEl.style.cssText = 'white-space:pre-wrap;word-wrap:break-word;margin:0 0 12px 0;font-size:12px;background:#f5f5f5;padding:10px;border-radius:4px;max-height:300px;overflow-y:auto';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✓ Close';
  closeBtn.style.cssText = 'padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer';
  closeBtn.addEventListener('click', () => modal.style.display = 'none');
  modal.innerHTML = '';
  modal.appendChild(titleEl);
  modal.appendChild(msgEl);
  modal.appendChild(closeBtn);
  modal.style.display = 'block';
}

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
    li.style.marginBottom = '10px';
    li.innerHTML = `<strong>${n.name}</strong> (${n.host})`;
    
    const btnGroup = document.createElement('div');
    btnGroup.style.marginTop = '6px';
    
    const pushBtn = document.createElement('button');
    pushBtn.textContent = '📤 Push'; pushBtn.style.marginRight = '6px';
    pushBtn.addEventListener('click', async () => {
      const file = fileSelect.value;
      if (!file) return alert('Select a file first');
      output.textContent = `Pushing ${file} to ${n.name}...`;
      try {
        const res = await api('/api/nodes/' + n.id + '/push-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file }) });
        show(`✅ Pushed to ${n.name}`);
      } catch (e) { show(`❌ Push failed on ${n.name}: ${e}`); }
    });
    btnGroup.appendChild(pushBtn);
    
    const enableBtn = document.createElement('button');
    enableBtn.textContent = '🔁 Enable+Reload'; enableBtn.style.marginRight = '6px';
    enableBtn.addEventListener('click', async () => {
      const file = fileSelect.value;
      if (!file) return alert('Select a file first');
      if (!confirm(`Enable and reload ${file} on ${n.name}?`)) return;
      showStatusModal(`Enabling & reloading ${file}...`, `${n.name}`, null);
      try {
        const res = await api('/api/nodes/' + n.id + '/enable-and-reload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file }) });
        const status = res.ok ? '✅ Success' : '⚠️ Warning';
        showStatusModal(`${status}\n\nTest output:\n${res.testOut}\n\nReload output:\n${res.reloadOut}`, `${n.name} Result`, 'success');
        show(`${status}: ${n.name} - ${file}`);
      } catch (e) { showStatusModal(`❌ Error\n\n${e}`, `${n.name} Failed`, 'error'); show(`❌ Failed: ${n.name} - ${e}`); }
    });
    btnGroup.appendChild(enableBtn);
    
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑'; delBtn.style.color = '#999';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete node ' + n.name + '?')) return;
      await api('/api/nodes/' + n.id, { method: 'DELETE' });
      await loadNodes();
    });
    btnGroup.appendChild(delBtn);
    
    li.appendChild(btnGroup);
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
if (enableReloadBtn) {
  enableReloadBtn.addEventListener('click', async () => {
    const file = fileSelect.value; const nodes = Array.from(nodesSelect.selectedOptions).map(o => o.value);
    if (!file) return alert('Select a file');
    if (nodes.length === 0) return alert('Select target nodes (multi-select)');
    if (!confirm(`Enable and reload ${file} on ${nodes.length} node(s)?`)) return;
    output.textContent = 'Enabling and reloading...';
    for (const nid of nodes) {
      try {
        showStatusModal(`Processing node ${nid}...`, 'In Progress', null);
        const res = await api('/api/nodes/' + nid + '/enable-and-reload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file }) });
        const status = res.ok ? '✅ Success' : '⚠️ Warning';
        showStatusModal(`${status}\n\nTest output:\n${res.testOut}\n\nReload output:\n${res.reloadOut}`, `Node ${nid}`, 'success');
        show(`${status} - ${nid}`);
      } catch (e) { 
        showStatusModal(`❌ Error:\n${e}`, `Node ${nid} Failed`, 'error');
        show(`❌ Failed - ${nid}: ${e}`); 
      }
    }
  });
}

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
setInterval(loadNodes, 60000); // refresh nodes every 60s