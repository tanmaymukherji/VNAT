import React, { useState, useCallback, useRef, useEffect } from 'react';
import { utils, write } from 'xlsx';
import { saveAs } from 'file-saver';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ASKGRE_URL = 'https://askgre.grameee.org/api/chat';
const KEYWORD_MODEL = 'llama-3.3-70b-versatile';

async function extractKeywords(needText) {
  const key = localStorage.getItem('groq_api_key');
  if (!key) throw new Error('No Groq API key. Add it in Settings.');

  const prompt = `You are an expert at extracting search keywords from village need statements.
Given a need statement, extract 3-6 specific, diverse search keywords that would help find matching solutions from a livelihood/development solutions database.
Return ONLY a comma-separated list of keywords — no explanation, no quotes, no formatting.
If the need has multiple distinct topics, extract keywords for each topic separately.

Need statement: "${needText}"

Keywords:`;

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: KEYWORD_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 100,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq API error: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function searchAskGRE(keywordsCsv) {
  const key = localStorage.getItem('gre_api_key');
  if (!key) throw new Error('No AskGRE API key. Add it in Settings.');

  const res = await fetch(ASKGRE_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: keywordsCsv }),
  });

  if (!res.ok) throw new Error(`AskGRE API error: ${res.status}`);
  const data = await res.json();
  return data.solutions || [];
}

function priorityClass(priority) {
  if (!priority) return '';
  const p = priority.toLowerCase();
  if (p === 'high') return 'text-red-600 font-semibold';
  if (p === 'medium') return 'text-amber-600 font-semibold';
  if (p === 'low') return 'text-green-600 font-semibold';
  return '';
}

function serializeNeeds(needsArr) {
  return needsArr.map(n => ({
    need: n.need,
    category: n.category,
    priority: n.priority,
    _keywords: n._keywords,
    _solutions: n._solutions,
  }));
}

export default function SolutionsTab({ result, onResultUpdate, onLog }) {
  const resultRef = useRef(result);
  useEffect(() => { resultRef.current = result; }, [result]);

  const [needs, setNeeds] = useState(() => {
    if (!result?.needs) return [];
    return result.needs.map((n, i) => ({
      ...n,
      _id: i,
      _keywords: n._keywords || '',
      _solutions: n._solutions || null,
      _generatingKeywords: false,
      _checkingSolutions: false,
      _solutionsExpanded: false,
      _apiError: null,
    }));
  });

  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkChecking, setBulkChecking] = useState(false);
  const [progress, setProgress] = useState(0);

  const saveToResult = useCallback(() => {
    if (!onResultUpdate) return;
    setNeeds(prev => {
      onResultUpdate({ ...resultRef.current, needs: serializeNeeds(prev) });
      return prev;
    });
  }, [onResultUpdate]);

  const handleGenerateKeywords = useCallback(async (idx) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _generatingKeywords: true, _apiError: null } : n));
    const snapshot = needs;
    const needText = snapshot[idx]?.need;
    if (!needText) return;
    try {
      const keywords = await extractKeywords(needText);
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _keywords: keywords, _generatingKeywords: false } : n));
      onLog?.(`Keywords generated for need #${idx + 1}`, 'success');
    } catch (e) {
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _generatingKeywords: false, _apiError: e.message } : n));
      onLog?.(e.message, 'error');
    }
  }, [needs, onLog]);

  const handleGenerateAll = useCallback(async () => {
    setBulkGenerating(true);
    setProgress(0);
    const snapshot = needs;
    const todo = snapshot.filter(n => !n._keywords);
    if (todo.length === 0) { setBulkGenerating(false); return; }
    let completed = 0;
    for (const need of todo) {
      try {
        const keywords = await extractKeywords(need.need);
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _keywords: keywords, _generatingKeywords: false } : n));
        completed++;
        setProgress(completed);
        onLog?.(`Keywords generated for need #${need._id + 1}`, 'success');
      } catch (e) {
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _generatingKeywords: false, _apiError: e.message } : n));
        completed++;
        setProgress(completed);
        onLog?.(e.message, 'error');
      }
    }
    setBulkGenerating(false);
    saveToResult();
  }, [needs, onLog, saveToResult]);

  const handleCheckSolutions = useCallback(async (idx) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _checkingSolutions: true, _apiError: null } : n));
    const snapshot = needs;
    const need = snapshot[idx];
    if (!need?._keywords) return;
    try {
      const solutions = await searchAskGRE(need._keywords);
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _solutions: solutions, _checkingSolutions: false, _solutionsExpanded: false } : n));
      onLog?.(`Found ${solutions.length} solutions for need #${idx + 1}`, 'success');
      saveToResult();
    } catch (e) {
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _checkingSolutions: false, _apiError: e.message } : n));
      onLog?.(e.message, 'error');
    }
  }, [needs, onLog, saveToResult]);

  const handleCheckAll = useCallback(async () => {
    setBulkChecking(true);
    setProgress(0);
    const snapshot = needs;
    const todo = snapshot.filter(n => n._keywords);
    if (todo.length === 0) { setBulkChecking(false); return; }
    let completed = 0;
    for (const need of todo) {
      try {
        const solutions = await searchAskGRE(need._keywords);
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _solutions: solutions, _checkingSolutions: false } : n));
        completed++;
        setProgress(completed);
        onLog?.(`Found ${solutions.length} solutions for need #${need._id + 1}`, 'success');
      } catch (e) {
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _checkingSolutions: false, _apiError: e.message } : n));
        completed++;
        setProgress(completed);
        onLog?.(e.message, 'error');
      }
    }
    setBulkChecking(false);
    saveToResult();
  }, [needs, onLog, saveToResult]);

  const handleKeywordsChange = useCallback((idx, value) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _keywords: value } : n));
  }, []);

  const toggleSolutions = useCallback((idx) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _solutionsExpanded: !n._solutionsExpanded } : n));
  }, []);

  if (!result?.needs || result.needs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No needs found. Run Need Analyser first.
      </div>
    );
  }

  const isBusy = bulkGenerating || bulkChecking;

  const handleClearSolutions = useCallback(() => {
    setNeeds(prev => prev.map(n => ({ ...n, _solutions: null, _solutionsExpanded: false })));
    if (onResultUpdate) {
      onResultUpdate({ ...resultRef.current, needs: [] });
    }
  }, [onResultUpdate]);

  const handleExportXlsx = useCallback(() => {
    const snapshot = needs;
    const rows = [];
    const cols = ['Need', 'Need Keywords', 'Category', 'Priority', 'Provider Name', 'Offering Name', '6M Type', 'Score', 'Offering Link'];
    for (const n of snapshot) {
      if (!n._solutions || n._solutions.length === 0) {
        rows.push({ 'Need': n.need, 'Need Keywords': n._keywords, 'Category': n.category, 'Priority': n.priority, 'Provider Name': '', 'Offering Name': '', '6M Type': '', 'Score': '', 'Offering Link': '' });
      } else {
        for (const sol of n._solutions) {
          rows.push({
            'Need': n.need,
            'Need Keywords': n._keywords,
            'Category': n.category,
            'Priority': n.priority,
            'Provider Name': sol.provider_name || '',
            'Offering Name': sol.offering_name || '',
            '6M Type': sol['6m_type'] || '',
            'Score': sol.relevance_score ?? '',
            'Offering Link': sol.offering_link || '',
          });
        }
      }
    }
    const ws = utils.json_to_sheet(rows);
    ws['!cols'] = cols.map(() => ({ wch: 25 }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Solutions');
    const name = (resultRef.current?.village_name || 'solutions').replace(/[\\/:*?"<>|]/g, '_');
    const binStr = write(wb, { bookType: 'xlsx', type: 'binary' });
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i) & 0xFF;
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, name + '_solutions.xlsx');
  }, [needs]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b">
        <h3 className="text-sm font-semibold text-slate-700">Solutions</h3>
        <div className="flex gap-2">
          <button
            onClick={handleExportXlsx}
            className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700"
          >
            Export Solutions
          </button>
          <button
            onClick={handleGenerateAll}
            disabled={isBusy}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {bulkGenerating ? `Generating... (${progress}/${needs.filter(n => !n._keywords).length || 1})` : 'Generate All Keywords'}
          </button>
          <button
            onClick={handleCheckAll}
            disabled={isBusy}
            className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {bulkChecking ? `Checking... (${progress}/${needs.filter(n => n._keywords).length || 1})` : 'Check All Solutions'}
          </button>
          <button
            onClick={handleClearSolutions}
            disabled={isBusy}
            className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            Clear Solutions
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-100 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Need</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 w-64">Need Keywords</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Category</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Priority</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Potential Solution Stack</th>
            </tr>
          </thead>
          <tbody>
            {needs.map((need, idx) => (
              <tr key={need._id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-800">{need.need}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={need._keywords}
                      onChange={(e) => handleKeywordsChange(idx, e.target.value)}
                      className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-indigo-400"
                      placeholder="Enter keywords..."
                    />
                    <button
                      onClick={() => handleGenerateKeywords(idx)}
                      disabled={need._generatingKeywords || isBusy}
                      className="shrink-0 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded hover:bg-indigo-200 disabled:opacity-50"
                      title="Generate keywords from need text"
                    >
                      {need._generatingKeywords ? '...' : 'Gen'}
                    </button>
                  </div>
                  {need._apiError && (
                    <p className="mt-1 text-red-600">{need._apiError}</p>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{need.category || 'Other'}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={priorityClass(need.priority)}>{need.priority || 'Medium'}</span>
                </td>
                <td className="px-3 py-2">
                  {need._solutions === null && !need._checkingSolutions && (
                    need._keywords ? (
                      <button
                        onClick={() => handleCheckSolutions(idx)}
                        className="text-indigo-600 hover:text-indigo-800 underline"
                      >
                        Check Solutions
                      </button>
                    ) : (
                      <span className="text-slate-400">Enter keywords first</span>
                    )
                  )}
                  {need._checkingSolutions && (
                    <span className="text-slate-500">Searching...</span>
                  )}
                  {need._solutions && need._solutions.length > 0 && (
                    <div className="space-y-1">
                      {(need._solutionsExpanded ? need._solutions : need._solutions.slice(0, 5)).map((sol, si) => (
                        <div key={si} className="text-xs border-b border-slate-100 pb-1 last:border-0">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[10px] text-slate-400">[{sol.relevance_score || 0}]</span>
                            {sol.offering_link ? (
                              <a href={sol.offering_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline font-medium">
                                {sol.offering_name || 'Solution'}
                              </a>
                            ) : (
                              <span className="font-medium text-slate-700">{sol.offering_name || 'Solution'}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {sol['6m_type'] ? <span>6M: {sol['6m_type']} </span> : ''}
                            {sol.provider_name ? <span>Provider: {sol.provider_name}</span> : ''}
                          </div>
                        </div>
                      ))}
                      {need._solutions.length > 5 && (
                        <button
                          onClick={() => toggleSolutions(idx)}
                          className="text-indigo-600 hover:text-indigo-800 text-[10px]"
                        >
                          {need._solutionsExpanded ? '▲ Show less' : `▼ +${need._solutions.length - 5} more`}
                        </button>
                      )}
                    </div>
                  )}
                  {need._solutions && need._solutions.length === 0 && (
                    <span className="text-slate-400">No solutions found</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
