async function api(path, opts) {
  const headers = (opts && opts.headers) ? Object.assign({}, opts.headers) : {};
  const token = localStorage.getItem('adminToken') || document.getElementById('admin-token')?.value || '';
  if (token && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, Object.assign({}, opts || {}, { headers }));
  if (res.headers.get('content-type')?.includes('application/json')) return res.json();
  return res.text();
}

const fileListEl = document.getElementById('file-list');
const editor = document.getElementById('editor');
const newName = document.getElementById('new-name');
const newBtn = document.getElementById('new-btn');
const saveBtn = document.getElementById('save-btn');
const deleteBtn = document.getElementById('delete-btn');
const writeSystem = document.getElementById('write-system');
const downloadBtn = document.getElementById('download-btn');

let current = null;
let selected = new Set();
let siteStatus = null;

async function loadFiles(){
  const res = await api('/api/files');
  fileListEl.innerHTML = '';
  res.files.forEach(f => {
    const li = document.createElement('li');
    li.textContent = f;
    li.dataset.name = f;
    li.addEventListener('click', async (e) => {
      if (e.shiftKey) { // toggle selection
        if (selected.has(f)) { selected.delete(f); li.classList.remove('selected'); }
        else { selected.add(f); li.classList.add('selected'); }
        return;
      }
      current = f;
      const data = await api('/api/files/' + encodeURIComponent(f));
      editor.value = data.content || '';
      // fetch site status
      try {
        siteStatus = await api('/api/sites/' + encodeURIComponent(f) + '/status');
      } catch (err) { siteStatus = null; }
      refreshSiteButtons();
      document.querySelectorAll('#file-list li').forEach(n=>n.classList.remove('active'));
      li.classList.add('active');
    });
    fileListEl.appendChild(li);
  });
}

newBtn.addEventListener('click', async () => {
  const name = newName.value.trim();
  if (!name) return alert('Enter a filename');
  current = name;
  editor.value = '# New config\n';
  await loadFiles();
});

saveBtn.addEventListener('click', async () => {
  if (!current) return alert('Open or create a file first');
  const target = writeSystem.checked ? 'system' : 'local';
  const token = document.getElementById('admin-token')?.value || '';
  if (token) localStorage.setItem('adminToken', token);
  const res = await api('/api/files/' + encodeURIComponent(current), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: editor.value, target })
  });
  if (res.error) alert('Error: ' + res.error);
  else { alert('Saved'); await loadFiles(); }
});

deleteBtn.addEventListener('click', async () => {
  if (!current) return alert('Select a file');
  const target = writeSystem.checked ? 'system' : 'local';
  if (!confirm('Delete ' + current + ' ?')) return;
  const res = await api('/api/files/' + encodeURIComponent(current) + '?target=' + target, { method: 'DELETE' });
  if (res.error) alert('Error: ' + res.error);
  else { current = null; editor.value = ''; await loadFiles(); }
});

const validateBtn = document.getElementById('validate-btn');
const validateOutput = document.getElementById('validate-output');
validateBtn.addEventListener('click', async () => {
  if (!current) return alert('Open or create a file first');
  const content = editor.value;
  validateOutput.textContent = 'Validating...';
  try {
    const res = await api('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (res.error) validateOutput.textContent = 'Error: ' + res.error;
    else validateOutput.textContent = (res.output || '') + '\n\nResult: ' + (res.ok ? 'OK' : 'FAIL');
  } catch (err) {
    validateOutput.textContent = 'Validation failed: ' + String(err);
  }
});

const enableBtn = document.getElementById('enable-btn');
const disableBtn = document.getElementById('disable-btn');

function refreshSiteButtons() {
  if (!current) { enableBtn.disabled = true; disableBtn.disabled = true; return; }
  if (!siteStatus) { enableBtn.disabled = false; disableBtn.disabled = false; return; }
  enableBtn.disabled = !!siteStatus.enabledExists;
  disableBtn.disabled = !siteStatus.enabledExists;
}

enableBtn.addEventListener('click', async () => {
  if (!current) return alert('Open a file first');
  try {
    const res = await api('/api/sites/' + encodeURIComponent(current) + '/enable', { method: 'POST' });
    if (res.error) alert('Error: ' + res.error);
    else { alert('Enabled'); siteStatus = await api('/api/sites/' + encodeURIComponent(current) + '/status'); refreshSiteButtons(); }
  } catch (err) { alert('Enable failed: ' + err); }
});

disableBtn.addEventListener('click', async () => {
  if (!current) return alert('Open a file first');
  if (!confirm('Disable ' + current + ' ?')) return;
  try {
    const res = await api('/api/sites/' + encodeURIComponent(current) + '/enable', { method: 'DELETE' });
    if (res.error) alert('Error: ' + res.error);
    else { alert('Disabled'); siteStatus = await api('/api/sites/' + encodeURIComponent(current) + '/status'); refreshSiteButtons(); }
  } catch (err) { alert('Disable failed: ' + err); }
});

// refresh buttons on load
refreshSiteButtons();

// Bulk enable/disable selected files
const enableSelectedBtn = document.getElementById('enable-selected-btn');
const disableSelectedBtn = document.getElementById('disable-selected-btn');
enableSelectedBtn.addEventListener('click', async () => {
  if (selected.size === 0) return alert('Shift+click to select files');
  if (!confirm('Enable selected files?')) return;
  const files = Array.from(selected);
  try {
    const res = await api('/api/sites/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) });
    if (res.error) return alert('Error: ' + res.error);
    alert('Results:\n' + JSON.stringify(res.results, null, 2));
    await loadFiles();
  } catch (err) { alert('Enable selected failed: ' + err); }
});

disableSelectedBtn.addEventListener('click', async () => {
  if (selected.size === 0) return alert('Shift+click to select files');
  if (!confirm('Disable selected files?')) return;
  const files = Array.from(selected);
  try {
    const res = await api('/api/sites/enable', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) });
    if (res.error) return alert('Error: ' + res.error);
    alert('Results:\n' + JSON.stringify(res.results, null, 2));
    await loadFiles();
  } catch (err) { alert('Disable selected failed: ' + err); }
});

// Reload nginx button
const reloadBtn = document.getElementById('reload-btn');
if (reloadBtn) {
  reloadBtn.addEventListener('click', async () => {
    if (!confirm('Reload nginx now? This requires server privileges.')) return;
    const res = await api('/api/nginx/reload', { method: 'POST' });
    if (res.error) alert('Reload error: ' + res.error);
    else alert('Reload result:\n' + JSON.stringify(res, null, 2));
  });
}

downloadBtn.addEventListener('click', () => {
  if (selected.size === 0) return alert('Shift+click to select files for download');
  const q = Array.from(selected).map(encodeURIComponent).join(',');
  window.location = '/api/download?files=' + q;
});

loadFiles();

// If we came from a cluster pull, write pulled file into local configs and open it
(async function handlePulledFile(){
  try {
    const s = localStorage.getItem('pulled_file_content');
    if (!s) return;
    const p = JSON.parse(s); // { name, content }
    localStorage.removeItem('pulled_file_content');
    await api('/api/files/' + encodeURIComponent(p.name), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: p.content, target: 'local' }) });
    await loadFiles();
    const li = Array.from(document.querySelectorAll('#file-list li')).find(n => n.dataset.name === p.name);
    if (li) li.click();
  } catch (e) { console.error('pulled file handling failed', e); }
})();
