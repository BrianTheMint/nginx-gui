'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import FileList from './components/FileList';
import Editor from './components/Editor';
import './globals.css';

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...opts, headers });
  if (res.headers.get('content-type')?.includes('application/json')) return res.json();
  return res.text();
}

export default function Home() {
  const [files, setFiles] = useState([]);
  const [current, setCurrent] = useState(null);
  const [content, setContent] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [newName, setNewName] = useState('');
  const [writeSystem, setWriteSystem] = useState(false);
  const [token, setToken] = useState('');
  const [validationOutput, setValidationOutput] = useState('');
  const [siteStatus, setSiteStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('adminToken');
    if (stored) setToken(stored);
    loadFiles();
  }, []);

  async function loadFiles() {
    try {
      const res = await api('/api/files');
      console.log('API response:', res);
      // Handle both {"files": [...]} and direct array responses
      const filesList = Array.isArray(res) ? res : (res.files || []);
      console.log('Files to set:', filesList);
      setFiles(filesList);
    } catch (err) {
      console.error('Load files failed:', err);
      setFiles([]);
    }
  }

  async function loadFile(name) {
    try {
      const data = await api(`/api/files/${encodeURIComponent(name)}`);
      setContent(data.content || '');
      setCurrent(name);
      // fetch site status
      try {
        const status = await api(`/api/sites/${encodeURIComponent(name)}/status`);
        setSiteStatus(status);
      } catch (e) {
        setSiteStatus(null);
      }
    } catch (err) {
      alert('Error loading file: ' + err);
    }
  }

  const onSelectFile = (name) => {
    loadFile(name);
    setSelected(new Set());
  };

  const onToggleSelect = (name) => {
    const s = new Set(selected);
    if (s.has(name)) s.delete(name);
    else s.add(name);
    setSelected(s);
  };

  const onNew = () => {
    if (!newName.trim()) return alert('Enter a filename');
    setCurrent(newName);
    setContent('# New config\n');
    setNewName('');
    loadFiles();
  };

  const onSave = async () => {
    if (!current) return alert('Open or create a file first');
    if (token) localStorage.setItem('adminToken', token);
    try {
      const res = await api(`/api/files/${encodeURIComponent(current)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, target: writeSystem ? 'system' : 'local' })
      });
      if (res.error) alert('Error: ' + res.error);
      else { alert('Saved'); loadFiles(); }
    } catch (err) {
      alert('Save failed: ' + err);
    }
  };

  const onDelete = async () => {
    if (!current) return alert('Select a file');
    if (!confirm('Delete ' + current + ' ?')) return;
    try {
      const res = await api(`/api/files/${encodeURIComponent(current)}?target=${writeSystem ? 'system' : 'local'}`, { method: 'DELETE' });
      if (res.error) alert('Error: ' + res.error);
      else { setCurrent(null); setContent(''); loadFiles(); }
    } catch (err) {
      alert('Delete failed: ' + err);
    }
  };

  const onValidate = async () => {
    if (!current) return alert('Open or create a file first');
    setValidationOutput('Validating...');
    try {
      const res = await api('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.error) setValidationOutput('Error: ' + res.error);
      else setValidationOutput((res.output || '') + '\n\nResult: ' + (res.ok ? 'OK ✓' : 'FAIL ✗'));
    } catch (err) {
      setValidationOutput('Validation failed: ' + err);
    }
  };

  const onEnable = async () => {
    if (!current) return alert('Open a file first');
    setBusy(true);
    try {
      const res = await api(`/api/sites/${encodeURIComponent(current)}/enable`, { method: 'POST' });
      if (res.error) alert('Error: ' + res.error);
      else { alert('Enabled'); setSiteStatus(await api(`/api/sites/${encodeURIComponent(current)}/status`)); }
    } catch (err) {
      alert('Enable failed: ' + err);
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    if (!current) return alert('Open a file first');
    if (!confirm('Disable ' + current + ' ?')) return;
    setBusy(true);
    try {
      const res = await api(`/api/sites/${encodeURIComponent(current)}/enable`, { method: 'DELETE' });
      if (res.error) alert('Error: ' + res.error);
      else { alert('Disabled'); setSiteStatus(await api(`/api/sites/${encodeURIComponent(current)}/status`)); }
    } catch (err) {
      alert('Disable failed: ' + err);
    } finally {
      setBusy(false);
    }
  };

  const onEnableSelected = async () => {
    if (selected.size === 0) return alert('Shift+click to select files');
    if (!confirm('Enable selected files?')) return;
    setBusy(true);
    try {
      const res = await api('/api/sites/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: Array.from(selected) })
      });
      if (res.error) alert('Error: ' + res.error);
      else { alert('Results:\n' + JSON.stringify(res.results, null, 2)); loadFiles(); }
    } catch (err) {
      alert('Enable selected failed: ' + err);
    } finally {
      setBusy(false);
    }
  };

  const onDisableSelected = async () => {
    if (selected.size === 0) return alert('Shift+click to select files');
    if (!confirm('Disable selected files?')) return;
    setBusy(true);
    try {
      const res = await api('/api/sites/enable', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: Array.from(selected) })
      });
      if (res.error) alert('Error: ' + res.error);
      else { alert('Results:\n' + JSON.stringify(res.results, null, 2)); loadFiles(); }
    } catch (err) {
      alert('Disable selected failed: ' + err);
    } finally {
      setBusy(false);
    }
  };

  const onDownload = () => {
    if (selected.size === 0) return alert('Shift+click to select files');
    const q = Array.from(selected).map(encodeURIComponent).join(',');
    window.location = '/api/download?files=' + q;
  };

  const onReload = async () => {
    if (!confirm('Reload nginx now?')) return;
    setBusy(true);
    try {
      const res = await api('/api/nginx/reload', { method: 'POST' });
      if (res.error) alert('Reload error: ' + res.error);
      else alert('Reload result:\n' + JSON.stringify(res, null, 2));
    } catch (err) {
      alert('Reload failed: ' + err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        files={files}
        onNew={onNew}
        onDownload={onDownload}
        onEnableSelected={onEnableSelected}
        onDisableSelected={onDisableSelected}
        newName={newName}
        setNewName={setNewName}
        selectedCount={selected.size}
        busy={busy}
      />
      <div className="file-panel">
        <FileList
          files={files}
          onSelect={onSelectFile}
          selected={selected}
          onToggleSelect={onToggleSelect}
        />
      </div>
      <Editor
        value={content}
        onChange={setContent}
        onSave={onSave}
        onDelete={onDelete}
        onValidate={onValidate}
        onEnable={onEnable}
        onDisable={onDisable}
        onReload={onReload}
        writeSystem={writeSystem}
        setWriteSystem={setWriteSystem}
        token={token}
        setToken={setToken}
        validationOutput={validationOutput}
        enableDisableBusy={busy}
        reloadBusy={busy}
      />
    </div>
  );
}
