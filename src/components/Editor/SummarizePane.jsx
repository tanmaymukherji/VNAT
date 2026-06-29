import React, { useState, useCallback } from 'react';
import SummaryTab from '../Summarizer/SummaryTab';
import NeedsTab from '../Summarizer/NeedsTab';
import ImagesTab from '../Summarizer/ImagesTab';
import ExportBar from '../Summarizer/ExportBar';
import { summarizeReport } from '../Summarizer/ApiClient';
import { downloadReportDocx, downloadReportXlsx } from '../Summarizer/ExportUtils';
import { readImage } from '../../storage';

export default function SummarizePane({ project, analysisResult, onAnalysisResult, onLog }) {
  const [summarized, setSummarized] = useState(!!analysisResult);
  const [result, setResult] = useState(analysisResult);
  const [images, setImages] = useState([]);
  const [currentLang, setCurrentLang] = useState(() => localStorage.getItem('vna_lang') || 'en');
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [progressLogs, setProgressLogs] = useState([]);
  const [error, setError] = useState(null);

  const t = (key) => {
    const LABELS = {
      en: {
        clickToSummarize: 'Review the text on the left, then click Summarize to generate the village need analysis report.',
        Summarize_Report: 'Summarize Report',
        summarising: 'Summarising report...',
        Summary_Data: 'Summary Data',
        Needs: 'Needs',
        Images: 'Images',
        Error: 'Error',
        all_APIs_failed: 'All AI APIs failed. Check your API keys in Settings.',
      },
      hi: {
        clickToSummarize: 'बाईं ओर के टेक्स्ट की समीक्षा करें, फिर गाँव ज़रूरत विश्लेषण रिपोर्ट बनाने के लिए सारांशित करें पर क्लिक करें।',
        Summarize_Report: 'रिपोर्ट सारांशित करें',
        summarising: 'रिपोर्ट सारांशित की जा रही है...',
        Summary_Data: 'सारांश डेटा',
        Needs: 'ज़रूरतें',
        Images: 'चित्र',
        Error: 'त्रुटि',
        all_APIs_failed: 'सभी AI API विफल। Settings में अपनी API keys जाँचें।',
      },
    };
    return LABELS[currentLang]?.[key] || key;
  };

  const log = useCallback((msg, type = '') => {
    setProgressLogs(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }]);
    onLog?.(msg, type);
  }, [onLog]);

  const loadImages = useCallback(async () => {
    if (!project?.id) return;
    const imgs = [];
    const totalPages = project.paragraphsArray?.length
      ? Math.max(...(project.paragraphsArray || []).map(p => p.page || 1))
      : 0;
    for (let page = 1; page <= Math.max(1, totalPages); page++) {
      try {
        const file = await readImage(project.id, page);
        if (file) {
          const dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
          });
          imgs.push({ name: `Page ${page}`, dataUrl });
        }
      } catch {}
    }
    setImages(imgs);
  }, [project]);

  const handleSummarize = useCallback(async () => {
    if (!project?.paragraphsArray || project.paragraphsArray.length === 0) {
      alert(currentLang === 'hi' ? 'कोई टेक्स्ट उपलब्ध नहीं है।' : 'No text available to summarize.');
      return;
    }
    setLoading(true);
    setProgressLogs([]);
    setError(null);
    log(t('summarising'));

    try {
      const text = (project.paragraphsArray || [])
        .map(p => p.text || '')
        .filter(Boolean)
        .join('\n\n');

      const aiResult = await summarizeReport(text, currentLang, log);

      if (aiResult.success) {
        const needs = (aiResult.data.needs || []).map(n => ({
          need: n.need || '',
          category: n.category || 'Other',
          priority: n.priority || 'Medium',
          source: n.source || project.name || '',
          suggested_action: n.suggested_action || '',
          timeline: n.timeline || '',
          responsible_party: n.responsible_party || '',
          budget_estimate: n.budget_estimate || '',
          status: n.status || 'Identified',
          remarks: n.remarks || '',
        }));

        const normalized = {
          village_name: aiResult.data.village_name || project.name || '',
          district_state: aiResult.data.district_state || '',
          population: aiResult.data.population || '',
          context: aiResult.data.context || '',
          needs,
          key_findings: aiResult.data.key_findings || [],
          languages_detected: aiResult.data.languages_detected || ['English'],
        };

        setResult(normalized);
        setSummarized(true);
        await loadImages();
        onAnalysisResult?.(normalized);
        log(currentLang === 'hi' ? 'विश्लेषण पूर्ण' : 'Analysis complete', 'success');
      } else {
        const errMsg = aiResult.error || t('all_APIs_failed');
        setError(errMsg);
        log(errMsg, 'error');
      }
    } catch (e) {
      const errMsg = e.message || 'Error';
      setError(errMsg);
      log(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  }, [project, currentLang, log, loadImages, onAnalysisResult, t]);

  const handleExportDocx = useCallback(() => {
    if (!result) return;
    downloadReportDocx(result, images, currentLang).catch(e => alert('Export failed: ' + e.message));
  }, [result, images, currentLang]);

  const handleExportExcel = useCallback(() => {
    if (!result) return;
    try {
      downloadReportXlsx(result, images, currentLang);
    } catch (e) {
      alert('Export failed: ' + e.message);
    }
  }, [result, images, currentLang]);

  const handleLangChange = useCallback((lang) => {
    setCurrentLang(lang);
    localStorage.setItem('vna_lang', lang);
  }, []);

  const tabLabels = {
    summary: t('Summary_Data'),
    needs: t('Needs'),
    images: t('Images'),
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full mb-4" />
          <p className="text-sm text-slate-600 mb-4">{t('summarising')}</p>
          <div className="w-full max-w-sm text-xs bg-slate-100 rounded p-3 max-h-40 overflow-y-auto">
            {progressLogs.map((l, i) => (
              <div key={i} className={l.type === 'error' ? 'text-red-600' : l.type === 'success' ? 'text-green-600' : 'text-slate-600'}>
                <span className="text-slate-400 mr-1">[{l.time}]</span>{l.msg}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!summarized) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <div className="text-4xl mb-4">📋</div>
        <p className="text-sm text-slate-600 mb-6 max-w-xs">{t('clickToSummarize')}</p>
        {error && (
          <div className="mb-4 w-full max-w-xs bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 text-left">
            {error}
          </div>
        )}
        <button
          onClick={handleSummarize}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-semibold text-sm"
        >
          {t('Summarize_Report')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ExportBar
        onExportDocx={handleExportDocx}
        onExportExcel={handleExportExcel}
        currentLang={currentLang}
        onLangChange={handleLangChange}
      />

      <div className="flex border-b bg-slate-100">
        {['summary', 'needs', 'images'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === tab
                ? 'bg-white text-indigo-700 border-b-2 border-indigo-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
        {activeTab === 'summary' && <SummaryTab data={result} currentLang={currentLang} />}
        {activeTab === 'needs' && <NeedsTab needs={result.needs} currentLang={currentLang} />}
        {activeTab === 'images' && <ImagesTab images={images} currentLang={currentLang} />}
      </div>
    </div>
  );
}