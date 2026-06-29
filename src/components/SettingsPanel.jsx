import React, { useState, useEffect, useRef } from 'react';
import CONFIG from '../config';
import { listProjects, saveProject, getWorkingInfo, changeWorkingDirectory } from '../storage';

export default function SettingsPanel({ onClose }) {
  const [hfOcrKey, setHfOcrKey] = useState(
    localStorage.getItem('hf_api_key') || ''
  );
  const [groqKey, setGroqKey] = useState(
    localStorage.getItem('groq_api_key') || ''
  );
  const [hfSumKey, setHfSumKey] = useState(() => {
    // Migrate existing hf_api_key to hf_summarise_api_key if not yet set
    if (!localStorage.getItem('hf_summarise_api_key') && localStorage.getItem('hf_api_key')) {
      localStorage.setItem('hf_summarise_api_key', localStorage.getItem('hf_api_key'));
    }
    return localStorage.getItem('hf_summarise_api_key') || '';
  });
  const [nvidiaKey, setNvidiaKey] = useState(
    localStorage.getItem('nvidia_api_key') || ''
  );
  const [useHFallback, setUseHFallback] = useState(
    localStorage.getItem('vna_use_hf_fallback') !== 'false'
  );
  const [greKey, setGreKey] = useState(
    localStorage.getItem('gre_api_key') || ''
  );
  const [groqStatus, setGroqStatus] = useState('');
  const [nvidiaStatus, setNvidiaStatus] = useState('');
  const [hfSumStatus, setHfSumStatus] = useState('');
  const [saved, setSaved] = useState(false);
  const [storageInfo, setStorageInfo] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [changingDir, setChangingDir] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const info = await getWorkingInfo();
        setStorageInfo(info);
      } catch { setStorageInfo({ name: 'Unknown', count: 0 }) }
    })();
  }, []);

  const handleChangeDirectory = async () => {
    setChangingDir(true);
    try {
      const info = await changeWorkingDirectory();
      setStorageInfo(info);
    } catch (err) {
      if (err.name !== 'AbortError') alert('Failed to change directory: ' + err.message);
    } finally {
      setChangingDir(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const projects = await listProjects();
      const blob = new Blob([JSON.stringify(projects, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vnat-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Importing...');
    try {
      const text = await file.text();
      const projects = JSON.parse(text);
      if (!Array.isArray(projects)) throw new Error('Invalid backup file');
      let imported = 0;
      for (const p of projects) {
        if (p.id && (p.paragraphsArray || p.content)) {
          await saveProject(p);
          imported++;
        }
      }
      setImportStatus(`Imported ${imported} document(s). Refresh the library.`);
    } catch (err) {
      setImportStatus('Import failed: ' + err.message);
    }
    e.target.value = '';
  };

  const handleSave = () => {
    localStorage.setItem('hf_api_key', hfOcrKey);
    localStorage.setItem('groq_api_key', groqKey);
    localStorage.setItem('hf_summarise_api_key', hfSumKey);
    localStorage.setItem('nvidia_api_key', nvidiaKey);
    localStorage.setItem('gre_api_key', greKey);
    localStorage.setItem('vna_use_hf_fallback', useHFallback);
    CONFIG.HUGGINGFACE_API_KEY = hfOcrKey;
    CONFIG.GROQ_API_KEY = groqKey;
    CONFIG.HF_SUMMARISE_API_KEY = hfSumKey;
    CONFIG.NVIDIA_API_KEY = nvidiaKey;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestGroq = async () => {
    if (!groqKey) { setGroqStatus('No key'); return; }
    setGroqStatus('Testing...');
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + groqKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'Say OK in one word' }], max_tokens: 10 }),
      });
      setGroqStatus(resp.ok ? 'OK' : 'Error ' + resp.status);
    } catch { setGroqStatus('Failed'); }
  };

  const handleTestHfSum = async () => {
    const key = hfSumKey || hfOcrKey;
    if (!key) { setHfSumStatus('No key'); return; }
    setHfSumStatus('Testing...');
    try {
      const resp = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'meta-llama/llama-3.1-8b-instruct', messages: [{ role: 'user', content: 'Say OK in one word' }], max_tokens: 10 }),
      });
      setHfSumStatus(resp.ok ? 'OK' : 'Error ' + resp.status);
    } catch { setHfSumStatus('Failed'); }
  };

  const handleTestNvidia = async () => {
    if (!nvidiaKey) { setNvidiaStatus('No key'); return; }
    setNvidiaStatus('Testing...');
    try {
      const resp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + nvidiaKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'meta/llama-3.1-8b-instruct', messages: [{ role: 'user', content: 'Say OK in one word' }], max_tokens: 10 }),
      });
      setNvidiaStatus(resp.ok ? 'OK' : 'Error ' + resp.status);
    } catch { setNvidiaStatus('Failed'); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md my-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">&times;</button>
        </div>

        <div className="space-y-6">

          {/* ------------- OCR & TRANSLATION SECTION ------------- */}
          <div>
            <h3 className="text-sm font-bold text-indigo-800 border-b border-indigo-200 pb-1 mb-3">
              🔍 OCR & Translation (preloaded in T³ module)
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Hugging Face API Key <span className="text-gray-400">(for IndicTrans2)</span>
              </label>
              <input
                type="password"
                value={hfOcrKey}
                onChange={(e) => setHfOcrKey(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="hf_..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Used by OCR/translation features. <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-indigo-600">Get token</a>
              </p>
            </div>
          </div>

          {/* ------------- SUMMARISATION SECTION ------------- */}
          <div>
            <h3 className="text-sm font-bold text-emerald-800 border-b border-emerald-200 pb-1 mb-3">
              📊 Summarisation (Village Report Analysis)
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Groq API Key <span className="text-gray-400">(primary)</span>
                </label>
                <input
                  type="password"
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="gsk_..."
                />
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={handleTestGroq} className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">Test</button>
                  {groqStatus && <span className={`text-xs ${groqStatus === 'OK' ? 'text-green-600' : 'text-red-600'}`}>{groqStatus}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Primary summarisation AI. <a href="https://console.groq.com/" target="_blank" className="text-indigo-600">Get free key</a>
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Hugging Face API Key <span className="text-gray-400">(fallback, separate from OCR)</span>
                </label>
                <input
                  type="password"
                  value={hfSumKey}
                  onChange={(e) => setHfSumKey(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="hf_... (or leave empty to reuse OCR key)"
                />
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={handleTestHfSum} className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">Test</button>
                  {hfSumStatus && <span className={`text-xs ${hfSumStatus === 'OK' ? 'text-green-600' : 'text-red-600'}`}>{hfSumStatus}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Fallback for summarisation when Groq fails. Uses OCR key if left empty.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  NVIDIA API Key <span className="text-gray-400">(optional 3rd fallback)</span>
                </label>
                <input
                  type="password"
                  value={nvidiaKey}
                  onChange={(e) => setNvidiaKey(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="nvapi-..."
                />
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={handleTestNvidia} className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">Test</button>
                  {nvidiaStatus && <span className={`text-xs ${nvidiaStatus === 'OK' ? 'text-green-600' : 'text-red-600'}`}>{nvidiaStatus}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Third fallback. <a href="https://build.nvidia.com/" target="_blank" className="text-indigo-600">Get free key</a>
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="useHFallback"
                  checked={useHFallback}
                  onChange={(e) => setUseHFallback(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="useHFallback" className="text-xs text-gray-700">Use HuggingFace fallback when Groq fails</label>
              </div>
            </div>
          </div>

          {/* ------------- ASKGRE SECTION ------------- */}
          <div>
            <h3 className="text-sm font-bold text-blue-800 border-b border-blue-200 pb-1 mb-3">
              🌐 AskGRE API (Solution Matching)
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                AskGRE API Key
              </label>
                <input
                  type="password"
                  value={greKey}
                  onChange={(e) => setGreKey(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="gre_..."
                />
              <p className="text-xs text-gray-500 mt-1">
                Used by the Solutions tab to match village needs with GRE solutions.
                Get your key from askgre.grameee.org/admin
              </p>
            </div>
          </div>

          <hr className="my-2" />

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Storage</h3>
            <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 space-y-2">
              <p>
                All project data is stored in your selected working directory on your file system.
                Images are saved to disk and loaded on demand, keeping browser memory usage low.
              </p>
              {storageInfo && (
                <div className="space-y-1">
                  <p><strong>Working directory:</strong> {storageInfo.name}</p>
                  <p><strong>Local projects:</strong> {storageInfo.count}</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleChangeDirectory}
                  disabled={changingDir}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs disabled:opacity-50"
                >
                  {changingDir ? 'Selecting...' : 'Change Working Directory'}
                </button>
              </div>
            </div>
          </div>

          <hr className="my-2" />
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Backup & Restore</h3>
            <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 space-y-2">
              <p>
                Export or import project metadata as a JSON file.
                Images and project files on disk are not included.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs disabled:opacity-50"
                >
                  {exporting ? 'Exporting...' : 'Export All (JSON)'}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs"
                >
                  Import Backup
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </div>
              {importStatus && (
                <p className="text-blue-700">{importStatus}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={handleSave}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm"
          >
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
  );
}