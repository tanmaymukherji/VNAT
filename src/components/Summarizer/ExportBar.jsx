import React from 'react';

export default function ExportBar({ onExportDocx, onExportExcel, currentLang, onLangChange }) {
  const t = (key) => {
    const LABELS = {
      en: { Export_DOCX: 'Export DOCX', Export_Excel: 'Export Excel' },
      hi: { Export_DOCX: 'DOCX निर्यात करें', Export_Excel: 'Excel निर्यात करें' },
    };
    return LABELS[currentLang]?.[key] || key;
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b">
      <div className="flex gap-2">
        <button
          onClick={onExportDocx}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded font-medium"
        >
          {t('Export_DOCX')}
        </button>
        <button
          onClick={onExportExcel}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded font-medium"
        >
          {t('Export_Excel')}
        </button>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onLangChange('en')}
          className={`text-xs px-2 py-1 rounded font-medium ${currentLang === 'en' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border'}`}
        >
          EN
        </button>
        <button
          onClick={() => onLangChange('hi')}
          className={`text-xs px-2 py-1 rounded font-medium ${currentLang === 'hi' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border'}`}
        >
          हिंदी
        </button>
      </div>
    </div>
  );
}