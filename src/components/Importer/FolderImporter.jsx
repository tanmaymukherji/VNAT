import React from 'react';

export default function FolderImporter({ onImport, disabled }) {
  const handleClick = async () => {
    if (window.electronAPI && window.electronAPI.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) onImport(folder);
    } else {
      // Fallback for web dev: prompt for path
      const folder = prompt('Enter folder path:');
      if (folder) onImport(folder);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className="bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded text-sm disabled:opacity-50"
    >
      {disabled ? 'Importing...' : '+ Import Folder'}
    </button>
  );
}
