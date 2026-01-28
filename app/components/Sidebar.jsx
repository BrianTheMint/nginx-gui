import React from 'react';

export default function Sidebar({ files, onNew, onDownload, onEnableSelected, onDisableSelected, newName, setNewName, selectedCount, busy }) {
  return (
    <aside className="sidebar">
      <h3>Configs</h3>
      <div className="sidebar-actions">
        <input
          id="new-name"
          type="text"
          placeholder="new-file.conf"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button onClick={onNew} className="btn-primary">New</button>
        <button onClick={onDownload} disabled={selectedCount === 0} className="btn-secondary">Download Selected</button>
        <button onClick={onEnableSelected} disabled={selectedCount === 0 || busy} className="btn-secondary">Enable Selected</button>
        <button onClick={onDisableSelected} disabled={selectedCount === 0 || busy} className="btn-secondary">Disable Selected</button>
      </div>
    </aside>
  );
}
