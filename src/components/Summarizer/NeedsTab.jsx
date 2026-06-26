import React, { useState, useMemo } from 'react';

export default function NeedsTab({ needs, currentLang }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [priFilter, setPriFilter] = useState('');
  const [sortCol, setSortCol] = useState(0);
  const [sortAsc, setSortAsc] = useState(true);

  const t = (key) => {
    const LABELS = {
      en: {
        Need: 'Need', Category: 'Category', Priority: 'Priority',
        Source: 'Source', Suggested_Action: 'Suggested Action',
        Timeline: 'Timeline', Responsible_Party: 'Responsible Party',
        Budget_Estimate: 'Budget Estimate', Status: 'Status', Remarks: 'Remarks',
        All_Categories: 'All Categories', All_Priorities: 'All Priorities',
        Search_needs: 'Search needs...', matchNeeds: 'matching needs', allNeeds: 'all',
        High: 'High', Medium: 'Medium', Low: 'Low',
        noNeedsFound: 'No needs found',
      },
      hi: {
        Need: 'ज़रूरत', Category: 'श्रेणी', Priority: 'प्राथमिकता',
        Source: 'स्रोत', Suggested_Action: 'सुझाई गई कार्रवाई',
        Timeline: 'समयसीमा', Responsible_Party: 'ज़िम्मेदार पक्ष',
        Budget_Estimate: 'बजट अनुमान', Status: 'स्थिति', Remarks: 'टिप्पणियाँ',
        All_Categories: 'सभी श्रेणियाँ', All_Priorities: 'सभी प्राथमिकताएँ',
        Search_needs: 'ज़रूरतें खोजें...', matchNeeds: 'मिलती ज़रूरतें', allNeeds: 'सभी',
        High: 'उच्च', Medium: 'मध्यम', Low: 'निम्न',
        noNeedsFound: 'कोई ज़रूरत नहीं मिली',
      },
    };
    return LABELS[currentLang]?.[key] || key;
  };

  const cols = ['need', 'category', 'priority', 'source', 'suggested_action', 'timeline', 'responsible_party', 'budget_estimate', 'status', 'remarks'];
  const colLabels = [t('Need'), t('Category'), t('Priority'), t('Source'), t('Suggested_Action'), t('Timeline'), t('Responsible_Party'), t('Budget_Estimate'), t('Status'), t('Remarks')];

  const categories = useMemo(() => [...new Set((needs || []).map(n => n.category).filter(Boolean))], [needs]);
  const filtered = useMemo(() => {
    let list = needs || [];
    if (catFilter) list = list.filter(n => n.category === catFilter);
    if (priFilter) list = list.filter(n => n.priority === priFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(n => (n.need || '').toLowerCase().includes(s) || (n.category || '').toLowerCase().includes(s));
    }
    if (sortCol >= 0) {
      list = [...list].sort((a, b) => {
        const av = (a[cols[sortCol]] || '').toLowerCase();
        const bv = (b[cols[sortCol]] || '').toLowerCase();
        if (sortCol === 2) {
          const p = { high: 0, medium: 1, low: 2 };
          return sortAsc ? (p[av] || 0) - (p[bv] || 0) : (p[bv] || 0) - (p[av] || 0);
        }
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return list;
  }, [needs, search, catFilter, priFilter, sortCol, sortAsc]);

  const priClass = (p) => {
    if (p === 'High') return 'text-red-600 font-semibold';
    if (p === 'Medium') return 'text-amber-600 font-semibold';
    if (p === 'Low') return 'text-green-600 font-semibold';
    return 'text-slate-600';
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('Search_needs')}
          className="flex-1 min-w-[180px] border rounded px-3 py-1.5 text-sm"
        />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
          <option value="">{t('All_Categories')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={priFilter} onChange={e => setPriFilter(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
          <option value="">{t('All_Priorities')}</option>
          <option value="High">{t('High')}</option>
          <option value="Medium">{t('Medium')}</option>
          <option value="Low">{t('Low')}</option>
        </select>
      </div>

      <div className="text-xs text-slate-500">
        {filtered.length} {t('matchNeeds')} · {(needs || []).length} {t('allNeeds')}
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-slate-100">
            <tr>
              {colLabels.map((label, i) => (
                <th
                  key={i}
                  onClick={() => { if (sortCol === i) setSortAsc(!sortAsc); else { setSortCol(i); setSortAsc(true); } }}
                  className="px-2 py-1.5 text-left font-semibold text-slate-700 cursor-pointer hover:text-indigo-600 whitespace-nowrap"
                >
                  {label} {sortCol === i ? (sortAsc ? '▲' : '▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-8 text-slate-400">{t('noNeedsFound')}</td></tr>
            ) : filtered.map((n, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                {cols.map((col, ci) => (
                  <td key={ci} className={`px-2 py-1.5 align-top ${col === 'priority' ? priClass(n[col]) : 'text-slate-600'}`}>
                    {String(n[col] || '').slice(0, 80)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}