import React, { useState, useCallback, useRef, useEffect } from 'react';
import { utils, write } from 'xlsx';
import { saveAs } from 'file-saver';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ASKGRE_URL = import.meta.env.DEV ? '/api/askgre' : 'https://askgre.grameee.org/api/chat';
const KEYWORD_MODEL = 'llama-3.3-70b-versatile';

async function groqFetch(prompt, maxTokens = 300) {
  const key = localStorage.getItem('groq_api_key');
  if (!key) throw new Error('No Groq API key. Add it in Settings.');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: KEYWORD_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq API error: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function extractKeywords(needText) {
  const prompt = `You are an expert at extracting search keywords from village need statements.
Given a need statement, extract 3-6 specific, diverse search keywords that would help find matching solutions from a livelihood/development solutions database.
Return ONLY a comma-separated list of keywords — no explanation, no quotes, no formatting.
If the need has multiple distinct topics, extract keywords for each topic separately.

Need statement: "${needText}"

Keywords:`;
  return groqFetch(prompt, 100);
}

async function groupKeywords(keywordsCsv) {
  const prompt = `Analyze the following comma-separated keywords and group them into distinct topic categories.
For each group, provide a concise category name and the list of relevant keywords from the input.
Return ONLY a valid JSON array, no other text:
[
  {"category": "Short Category Name", "keywords": ["keyword1", "keyword2"]},
  {"category": "Another Category", "keywords": ["keyword3", "keyword4"]}
]

If all keywords belong to one topic, return a single group.
Each keyword must appear in exactly one group.

Keywords: ${keywordsCsv}`;
  const raw = await groqFetch(prompt, 400);
  try {
    return JSON.parse(raw);
  } catch {
    return [{ category: 'General', keywords: keywordsCsv.split(',').map(k => k.trim()).filter(Boolean) }];
  }
}

async function searchAskGRE(query, state) {
  const key = localStorage.getItem('gre_api_key');
  if (!key) throw new Error('No AskGRE API key. Add it in Settings.');
  const body = { message: query };
  if (state) {
    body.filters = { geography: state };
  }
  const res = await fetch(ASKGRE_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AskGRE API error: ${res.status}`);
  const data = await res.json();
  return data.results || data.solutions || [];
}

function priorityClass(priority) {
  if (!priority) return '';
  const p = priority.toLowerCase();
  if (p === 'high') return 'text-red-600 font-semibold';
  if (p === 'medium') return 'text-amber-600 font-semibold';
  if (p === 'low') return 'text-green-600 font-semibold';
  return '';
}

export default function SolutionsTab({ result, onResultUpdate, onLog, currentLang }) {
  const resultRef = useRef(result);
  useEffect(() => { resultRef.current = result; }, [result]);

  const villageState = result?.district_state?.split(',').pop()?.trim() || '';

  const [needs, setNeeds] = useState(() => {
    if (!result?.needs) return [];
    return result.needs.map((n, i) => ({
      ...n,
      _id: i,
      _keywords: n._keywords || '',
      _keywordGroups: null,
      _generatingKeywords: false,
      _checkingSolutions: false,
      _solutionsExpanded: false,
      _apiError: null,
    }));
  });

  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkChecking, setBulkChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [limitToState, setLimitToState] = useState(false);

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
        completed++; setProgress(completed);
        onLog?.(`Keywords generated for need #${need._id + 1}`, 'success');
      } catch (e) {
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _generatingKeywords: false, _apiError: e.message } : n));
        completed++; setProgress(completed);
        onLog?.(e.message, 'error');
      }
    }
    setBulkGenerating(false);
  }, [needs, onLog]);

  const searchGroup = useCallback(async (group, state) => {
    const query = group.category + ': ' + group.keywords.join(', ');
    const solutions = await searchAskGRE(query, state);
    return { ...group, solutions };
  }, []);

  const handleCheckSolutions = useCallback(async (idx) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _checkingSolutions: true, _apiError: null } : n));
    const snapshot = needs;
    const need = snapshot[idx];
    if (!need?._keywords) return;
    try {
      const groups = await groupKeywords(need._keywords);
      const state = limitToState ? villageState : null;
      const groupedResults = await Promise.all(groups.map(g => searchGroup(g, state)));
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _keywordGroups: groupedResults, _checkingSolutions: false, _solutionsExpanded: false } : n));
      const total = groupedResults.reduce((s, g) => s + (g.solutions || []).length, 0);
      onLog?.(`Found ${total} solutions across ${groupedResults.length} groups for need #${idx + 1}`, 'success');
    } catch (e) {
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _checkingSolutions: false, _apiError: e.message } : n));
      onLog?.(e.message, 'error');
    }
  }, [needs, onLog, searchGroup, limitToState, villageState]);

  const handleCheckAll = useCallback(async () => {
    setBulkChecking(true);
    setProgress(0);
    const snapshot = needs;
    const todo = snapshot.filter(n => n._keywords);
    if (todo.length === 0) { setBulkChecking(false); return; }
    const state = limitToState ? villageState : null;
    let completed = 0;
    for (const need of todo) {
      try {
        const groups = await groupKeywords(need._keywords);
        const groupedResults = await Promise.all(groups.map(g => searchGroup(g, state)));
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _keywordGroups: groupedResults, _checkingSolutions: false } : n));
        completed++; setProgress(completed);
        const total = groupedResults.reduce((s, g) => s + (g.solutions || []).length, 0);
        onLog?.(`Found ${total} solutions across ${groupedResults.length} groups for need #${need._id + 1}`, 'success');
      } catch (e) {
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _checkingSolutions: false, _apiError: e.message } : n));
        completed++; setProgress(completed);
        onLog?.(e.message, 'error');
      }
    }
    setBulkChecking(false);
  }, [needs, onLog, searchGroup, limitToState, villageState]);

  const handleKeywordsChange = useCallback((idx, value) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _keywords: value } : n));
  }, []);

  const toggleSolutions = useCallback((idx) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _solutionsExpanded: !n._solutionsExpanded } : n));
  }, []);

  const handleClearSolutions = useCallback(() => {
    setNeeds(prev => prev.map(n => ({ ...n, _keywordGroups: null, _solutionsExpanded: false })));
  }, []);

  const handleExportXlsx = useCallback(() => {
    const snapshot = needs;
    const cols = ['Need', 'Need Keywords', 'Category', 'Priority', 'Group', 'Provider Name', 'Offering Name', '6M Type', 'Score', 'Offering Link'];
    const rows = [];
    for (const n of snapshot) {
      if (!n._keywordGroups || n._keywordGroups.length === 0) {
        rows.push({ 'Need': n.need, 'Need Keywords': n._keywords, 'Category': n.category, 'Priority': n.priority, 'Group': '', 'Provider Name': '', 'Offering Name': '', '6M Type': '', 'Score': '', 'Offering Link': '' });
      } else {
        for (const g of n._keywordGroups) {
          if (!g.solutions || g.solutions.length === 0) {
            rows.push({ 'Need': n.need, 'Need Keywords': g.keywords.join(', '), 'Category': g.category, 'Priority': n.priority, 'Group': g.category, 'Provider Name': '', 'Offering Name': '', '6M Type': '', 'Score': '', 'Offering Link': '' });
          } else {
            for (const sol of g.solutions) {
              rows.push({
                'Need': n.need, 'Need Keywords': g.keywords.join(', '), 'Category': g.category, 'Priority': n.priority, 'Group': g.category,
                'Provider Name': sol.solution?.trader?.organisation_name || sol.provider_name || '',
                'Offering Name': sol.offering_name || '',
                '6M Type': sol.domain_6m || sol['6m_type'] || '',
                'Score': sol.matchScore ?? sol.relevance_score ?? '',
                'Offering Link': sol.gre_link || sol.offering_link || '',
              });
            }
          }
        }
      }
    }
    const ws = utils.json_to_sheet(rows);
    ws['!cols'] = cols.map(() => ({ wch: 22 }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Solutions');
    const name = (resultRef.current?.village_name || 'solutions').replace(/[\\/:*?"<>|]/g, '_');
    const binStr = write(wb, { bookType: 'xlsx', type: 'binary' });
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i) & 0xFF;
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, name + '_solutions.xlsx');
  }, [needs]);

  const t = (key) => {
    const LABELS = {
      en: { LimitToState: 'Limit to State', Geography: 'Geography' },
      hi: { LimitToState: 'राज्य तक सीमित', Geography: 'भूगोल' },
    };
    return LABELS[currentLang]?.[key] || key;
  };

  if (!result?.needs || result.needs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No needs found. Run Need Analyser first.
      </div>
    );
  }

  const isBusy = bulkGenerating || bulkChecking;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b">
        <h3 className="text-sm font-semibold text-slate-700">Solutions</h3>
        <div className="flex gap-2 items-center">
          <button onClick={handleExportXlsx} className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">Export Solutions</button>
          <button onClick={handleGenerateAll} disabled={isBusy} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {bulkGenerating ? `Generating... (${progress}/${needs.filter(n => !n._keywords).length || 1})` : 'Generate All Keywords'}
          </button>
          <button onClick={handleCheckAll} disabled={isBusy} className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {bulkChecking ? `Checking... (${progress}/${needs.filter(n => n._keywords).length || 1})` : 'Check All Solutions'}
          </button>
          <button onClick={handleClearSolutions} disabled={isBusy} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50">Clear Solutions</button>
          {villageState && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none ml-2">
              <input
                type="checkbox"
                checked={limitToState}
                onChange={e => setLimitToState(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>{t('LimitToState')}: <span className="font-semibold text-slate-700">{villageState}</span></span>
            </label>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-100 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Need</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 w-96">Need Keywords</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Category</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Priority</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Potential Solution Stack</th>
            </tr>
          </thead>
          <tbody>
            {needs.map((need, idx) => (
              <tr key={need._id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-800 align-top">{need.need}</td>
                <td className="px-3 py-2 align-top">
                  <div className="flex gap-1 items-start">
                    <textarea
                      value={need._keywords}
                      onChange={(e) => handleKeywordsChange(idx, e.target.value)}
                      className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-indigo-400 resize-y min-h-[3.5em]"
                      placeholder="Enter keywords (comma-separated)..."
                      rows={2}
                    />
                    <button
                      onClick={() => handleGenerateKeywords(idx)}
                      disabled={need._generatingKeywords || isBusy}
                      className="shrink-0 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded hover:bg-indigo-200 disabled:opacity-50"
                      title="Generate keywords from need text"
                    >{need._generatingKeywords ? '...' : 'Gen'}</button>
                  </div>
                  {need._apiError && <p className="mt-1 text-red-600">{need._apiError}</p>}
                </td>
                <td className="px-3 py-2 align-top">
                  {need._keywordGroups ? (
                    <div className="flex flex-col gap-1">
                      {need._keywordGroups.map((g, gi) => (
                        <span key={gi} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">{g.category}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{need.category || 'Other'}</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <span className={priorityClass(need.priority)}>{need.priority || 'Medium'}</span>
                </td>
                <td className="px-3 py-2 align-top">
                  {!need._keywordGroups && !need._checkingSolutions && (
                    need._keywords ? (
                      <button onClick={() => handleCheckSolutions(idx)} className="text-indigo-600 hover:text-indigo-800 underline">Check Solutions</button>
                    ) : (
                      <span className="text-slate-400">Enter keywords first</span>
                    )
                  )}
                  {need._checkingSolutions && <span className="text-slate-500">Grouping & searching...</span>}
                  {need._keywordGroups && need._keywordGroups.length > 0 && (
                    <div className="space-y-3">
                      {need._keywordGroups.map((g, gi) => (
                        <div key={gi}>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{g.category}</p>
                          {(g.solutions || []).length > 0 ? (
                            <div className="space-y-1">
                              {(need._solutionsExpanded ? g.solutions : g.solutions.slice(0, 5)).map((sol, si) => (
                                <div key={si} className="text-xs border-b border-slate-100 pb-1 last:border-0">
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono text-[10px] text-slate-400">[{sol.matchScore ?? sol.relevance_score ?? 0}]</span>
                                    {sol.gre_link || sol.offering_link ? (
                                      <a href={sol.gre_link || sol.offering_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline font-medium">{sol.offering_name || 'Solution'}</a>
                                    ) : (
                                      <span className="font-medium text-slate-700">{sol.offering_name || 'Solution'}</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {sol.domain_6m || sol['6m_type'] ? <span>6M: {sol.domain_6m || sol['6m_type']} </span> : ''}
                                    {sol.solution?.trader?.organisation_name || sol.solution?.trader?.trader_name || sol.provider_name ? <span>Provider: {sol.solution?.trader?.organisation_name || sol.solution?.trader?.trader_name || sol.provider_name}</span> : ''}
                                    {sol.geographies_raw && (
                                      <span className="ml-1">| {t('Geography')}: {sol.geographies_raw}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {g.solutions.length > 5 && (
                                <button onClick={() => toggleSolutions(idx)} className="text-indigo-600 hover:text-indigo-800 text-[10px]">
                                  {need._solutionsExpanded ? '▴ Show less' : `▾ +${g.solutions.length - 5} more`}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">No solutions found</span>
                          )}
                        </div>
                      ))}
                    </div>
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
