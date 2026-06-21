import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DocumentLibrary from './components/Library/DocumentLibrary';
import SplitPaneEditor from './components/Editor/SplitPaneEditor';
import FolderImporter from './components/Importer/FolderImporter';

const API_BASE = 'http://localhost:8000';

export default function App() {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('library');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/projects`);
      setProjects(res.data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  const handleImportFolder = async (folderPath) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_BASE}/api/import`, { folder_path: folderPath });
      const project = res.data;
      setProjects((prev) => [...prev, project]);
      setActiveProject(project);
      setView('editor');
    } catch (err) {
      setError(err.response?.data?.detail || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = (project) => {
    setActiveProject(project);
    setView('editor');
  };

  const handleSave = async () => {
    if (!activeProject) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/save`, {
        docx_path: activeProject.docx_path,
        content: activeProject.content,
      });
      setActiveProject({ ...activeProject, ...res.data });
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTranslation = async (translatedContent, lang) => {
    if (!activeProject) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/save-translation`, {
        docx_path: activeProject.docx_path,
        content: translatedContent,
        target_lang: lang,
      });
      setActiveProject({ ...activeProject, ...res.data });
    } catch (err) {
      setError(err.response?.data?.detail || 'Save translation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Translation Tool</h1>
          <button
            onClick={() => setView('library')}
            className={`px-3 py-1 rounded text-sm ${view === 'library' ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
          >
            Library
          </button>
        </div>
        <div className="flex items-center gap-3">
          {activeProject && (
            <>
              <button onClick={handleSave} disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded text-sm disabled:opacity-50">
                {loading ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
          <FolderImporter onImport={handleImportFolder} disabled={loading} />
        </div>
      </header>
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 px-4 py-2 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">&times;</button>
        </div>
      )}
      <main className="flex-1 overflow-hidden">
        {view === 'library' && (
          <DocumentLibrary projects={projects} onSelect={handleSelectProject} onRefresh={loadProjects} />
        )}
        {view === 'editor' && activeProject && (
          <SplitPaneEditor
            project={activeProject}
            onSave={handleSave}
            onSaveTranslation={handleSaveTranslation}
            loading={loading}
          />
        )}
      </main>
    </div>
  );
}
