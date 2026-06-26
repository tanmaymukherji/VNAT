import React from 'react';

export default function SummaryTab({ data, currentLang }) {
  const t = (key) => {
    const LABELS = {
      en: {
        Village_Name: 'Village Name', District_State: 'District / State',
        Population: 'Population', Languages: 'Languages',
        Needs_Identified: 'Needs Identified', Documents: 'Documents',
        Context: 'Context', Key_Findings: 'Key Findings',
        Village_Context: 'Village Context', Village_Details: 'Village Details',
      },
      hi: {
        Village_Name: 'गाँव का नाम', District_State: 'ज़िला / राज्य',
        Population: 'आबादी', Languages: 'भाषाएँ',
        Needs_Identified: 'पहचानी गई ज़रूरतें', Documents: 'दस्तावेज़',
        Context: 'संदर्भ', Key_Findings: 'मुख्य निष्कर्ष',
        Village_Context: 'गाँव संदर्भ', Village_Details: 'गाँव विवरण',
      },
    };
    return LABELS[currentLang]?.[key] || key;
  };

  const items = [
    { label: t('Village_Name'), value: data.village_name || '-' },
    { label: t('District_State'), value: data.district_state || '-' },
    { label: t('Population'), value: data.population || '-' },
    { label: t('Languages'), value: (data.languages_detected || ['English']).join(', ') },
    { label: t('Needs_Identified'), value: data.needs?.length || 0 },
    { label: t('Documents'), value: '1' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-bold text-slate-800 mb-3">{t('Village_Details')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {items.map(item => (
            <div key={item.label} className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">{item.label}</div>
              <div className="text-sm font-semibold text-slate-900">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-bold text-slate-800 mb-3">{t('Context')}</h3>
        <div className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
          {data.context || '—'}
        </div>
      </div>

      {data.key_findings && data.key_findings.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-bold text-slate-800 mb-3">{t('Key_Findings')}</h3>
          <ul className="space-y-1">
            {data.key_findings.map((f, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="text-indigo-500 font-bold mt-0.5">→</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}