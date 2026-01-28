import React from 'react';

export default function Editor({ value, onChange, onSave, onDelete, onValidate, onEnable, onDisable, onReload, writeSystem, setWriteSystem, token, setToken, validationOutput, enableDisableBusy, reloadBusy }) {
  return (
    <main className="editor-main">
      <div className="toolbar">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={writeSystem}
            onChange={(e) => setWriteSystem(e.target.checked)}
          />
          {' '}Write to system (/etc/nginx)
        </label>
        <button onClick={onSave} className="btn-primary">Save</button>
        <button onClick={onDelete} className="btn-danger">Delete</button>
        <button onClick={onValidate} className="btn-secondary">Validate</button>
        <button onClick={onEnable} disabled={enableDisableBusy} className="btn-secondary">Enable</button>
        <button onClick={onDisable} disabled={enableDisableBusy} className="btn-secondary">Disable</button>
        <button onClick={onReload} disabled={reloadBusy} className="btn-warning">Reload nginx</button>
        <label className="token-label">
          Token: <input
            id="admin-token"
            type="password"
            placeholder="optional admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
      </div>
      {validationOutput && (
        <div className="validation-output">
          <pre>{validationOutput}</pre>
        </div>
      )}
      <textarea
        className="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck="false"
      />
    </main>
  );
}
