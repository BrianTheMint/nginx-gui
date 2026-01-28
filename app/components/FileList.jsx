import React, { useState, useEffect } from 'react';

export default function FileList({ files, onSelect, selected, onToggleSelect }) {
  if (!files || !Array.isArray(files)) {
    return <ul className="file-list" />;
  }
  
  return (
    <ul className="file-list">
      {files.map(f => (
        <li
          key={f}
          className={`file-item ${selected && selected.has && selected.has(f) ? 'selected' : ''}`}
          onClick={(e) => {
            if (e.shiftKey) {
              onToggleSelect(f);
            } else {
              onSelect(f);
            }
          }}
        >
          {f}
        </li>
      ))}
    </ul>
  );
}
