import React, { useState, useCallback } from 'react';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ASKGRE_URL = 'https://askgre.grameee.org/api/chat';
const KEYWORD_MODEL = 'llama-3.3-70b-versatile';

async function extractKeywords(needText, onLog) {
  const key = localStorage.getItem('groq_api_key');
  if (!key) throw new Error('No Groq API key. Add it in Settings.');

  const prompt = `You are an expert at extracting search keywords from village need statements.
Given a need statement, extract 3-6 specific, diverse search keywords that would help find matching solutions from a livelihood/development solutions database.
Return ONLY a comma-separated list of keywords — no explanation, no quotes, no formatting.
If the need has multiple distinct topics, extract keywords for each topic separately.

Need statement: "${needText}"

Keywords:`;

  onLog?.('Extracting keywords via Groq...', 'info');
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
  const content = (data.choices?.[0]?.message?.content || '').trim();
  const keywords = content.split(',').map(k => k.trim()).filter(Boolean);
  return keywords.length > 0 ? keywords : [needText.slice(0, 80)];
}

async function searchAskGRE(keywords, onLog) {
  const key = localStorage.getItem('gre_api_key');
  if (!key) throw new Error('No AskGRE API key. Add it in Settings.');

  onLog?.(`Searching GRE for: ${keywords.join(', ')}`, 'info');
  const res = await fetch(`${ASKGRE_URL}?api_key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: keywords.join(', ') }),
  });

  if (!res.ok) {
    throw new Error(`AskGRE API error: ${res.status}`);
  }

  const data = await res.json();
  return data.solutions || [];
}

function get6mType(domain6m) {
  if (!domain6m) return 'Method';
  const d = domain6m.toLowerCase();
  if (d.includes('manpower') || d.includes('man')) return 'Manpower';
  if (d.includes('machine') || d.includes('equipment')) return 'Machine';
  if (d.includes('material') || d.includes('raw material')) return 'Material';
  if (d.includes('market')) return 'Market';
  if (d.includes('money') || d.includes('finance') || d.includes('fund')) return 'Money';
  return 'Method';
}

export default function SolutionsTab({ result, onLog }) {
  const [needs, setNeeds] = useState(() => {
    if (!result?.needs) return [];
    return result.needs.map((n, i) => ({
      ...n,
      _id: i,
      _keywords: n._keywords || null,
      _generatingKeywords: false,
      _checkingSolutions: false,
      _solutions: n._solutions || null,
      _apiError: null,
      _solutionsOpen: false,
    }));
  });

  const handleGenerateKeywords = useCallback(async (idx) => {
    const need = needs[idx];
    if (!need) return;
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _generatingKeywords: true, _apiError: null } : n));
    try {
      const keywords = await extractKeywords(need.need, onLog);
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _keywords: keywords, _generatingKeywords: false } : n));
      onLog?.(`Keywords: ${keywords.join(', ')}`, 'success');
    } catch (e) {
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _generatingKeywords: false, _apiError: e.message } : n));
      onLog?.(e.message, 'error');
    }
  }, [needs, onLog]);

  const handleSearchGRE = useCallback(async (idx) => {
    const need = needs[idx];
    if (!need?._keywords) return;
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _checkingSolutions: true, _apiError: null } : n));
    try {
      const solutions = await searchAskGRE(need._keywords, onLog);
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _solutions: solutions, _checkingSolutions: false, _solutionsOpen: true } : n));
      onLog?.(`Found ${solutions.length} solutions for need #${idx + 1}`, 'success');
    } catch (e) {
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _checkingSolutions: false, _apiError: e.message } : n));
      onLog?.(e.message, 'error');
    }
  }, [needs, onLog]);

  const toggleSolutions = (idx) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _solutionsOpen: !n._solutionsOpen } : n));
  };

  if (!result?.needs || result.needs.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm">
        No needs found. Run the summarizer first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {needs.map((need, idx) => (
        <div key={need._id} className="border rounded-lg overflow-hidden bg-white">
          <div className="p-4 bg-slate-50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{need.need}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {need.category}
                  {need.priority && <span> · <span className={need.priority === 'High' ? 'text-red-600 font-semibold' : need.priority === 'Medium' ? 'text-amber-600 font-semibold' : 'text-green-600 font-semibold'}>{need.priority}</span></span>}
                </p>
              </div>
              <div className="flex flex-col gap-2 items-end shrink-0">
                <button
                  onClick={() => handleGenerateKeywords(idx)}
                  disabled={need._generatingKeywords}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {need._generatingKeywords ? '...' : 'Generate Keywords'}
                </button>
                {need._keywords && (
                  <button
                    onClick={() => handleSearchGRE(idx)}
                    disabled={need._checkingSolutions}
                    className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {need._checkingSolutions ? '...' : 'Search GRE'}
                  </button>
                )}
              </div>
            </div>

            {need._keywords && (
              <div className="mt-3">
                <p className="text-xs text-slate-500 mb-1.5">Keywords:</p>
                <div className="flex flex-wrap gap-1.5">
                  {need._keywords.map((kw, ki) => (
                    <span key={ki} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {need._apiError && (
              <p className="mt-2 text-xs text-red-600">{need._apiError}</p>
            )}

            {need._solutions && need._solutions.length > 0 && (
              <button
                onClick={() => toggleSolutions(idx)}
                className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {need._solutionsOpen ? '▲' : '▼'} Solutions ({need._solutions.length})
              </button>
            )}
          </div>

          {need._solutionsOpen && need._solutions && need._solutions.length > 0 && (
            <div className="border-t">
              <table className="w-full text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Provider</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Solution</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">6M Type</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Score</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {need._solutions.map((sol, si) => (
                    <tr key={si} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-600">{sol.provider_name || sol.provider || 'Unknown'}</td>
                      <td className="px-3 py-2 text-slate-800 font-medium">{sol.offering_name || sol.name || 'Solution'}</td>
                      <td className="px-3 py-2 text-slate-600">{get6mType(sol['6m_type'] || sol.domain_6m)}</td>
                      <td className="px-3 py-2">
                        <span className={`font-semibold ${(sol.relevance_score || sol.matchScore || 0) >= 100 ? 'text-green-600' : 'text-slate-600'}`}>
                          {sol.relevance_score || sol.matchScore || 0}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {sol.offering_link || sol.gre_link ? (
                          <a href={sol.offering_link || sol.gre_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline">View</a>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {need._solutionsOpen && need._solutions && need._solutions.length === 0 && (
            <div className="border-t p-4 text-center text-slate-400 text-sm">
              No solutions found for these keywords.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}