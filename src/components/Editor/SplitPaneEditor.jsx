import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

const LANGUAGES = [
  { code: 'bn', name: 'Bengali' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ur', name: 'Urdu' },
];

export default function SplitPaneEditor({ project, onSave, onSaveTranslation, loading }) {
  const [originalHtml, setOriginalHtml] = useState('');
  const [translationHtml, setTranslationHtml] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [provider, setProvider] = useState(() => localStorage.getItem('translation_provider') || 'huggingface');
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('target_lang') || 'bn');

  useEffect(() => {
    if (project?.content) {
      setOriginalHtml(project.content);
    }
  }, [project]);

  useEffect(() => {
    const savedProvider = localStorage.getItem('translation_provider');
    const savedLang = localStorage.getItem('target_lang');
    if (savedProvider) setProvider(savedProvider);
    if (savedLang) setTargetLang(savedLang);
  }, []);

  // Extract paragraphs from original HTML
  const paragraphs = useMemo(() => {
    const div = document.createElement('div');
    div.innerHTML = originalHtml;
    const paraElements = div.querySelectorAll('p');
    const result = [];
    paraElements.forEach((p, i) => {
      const text = p.innerText.trim();
      if (text) {
        result.push({ index: i, text, html: p.outerHTML });
      }
    });
    // Fallback: if no <p> tags, split by double-newlines
    if (result.length === 0) {
      const lines = originalHtml.split(/\n\s*\n/);
      lines.forEach((line, i) => {
        const text = line.replace(/<[^>]*>/g, '').trim();
        if (text) {
          result.push({ index: i, text, html: `<p>${text}</p>` });
        }
      });
    }
    return result;
  }, [originalHtml]);

  const handleTextSelect = (text) => {
    setSelectedText(text);
  };

  const handleTranslateParagraph = async (paragraph, index) => {
    setIsTranslating(true);
    setSelectedParagraphIndex(index);
    try {
      let res;
      if (provider === 'huggingface') {
        res = await axios.post(`${API_BASE}/api/translate/hf`, {
          text: paragraph.text,
          src_lang: 'auto',
          tgt_lang: targetLang,
        });
      } else {
        res = await axios.post(`${API_BASE}/api/translate/bhashini`, {
          text: paragraph.text,
          src_lang: 'auto',
          tgt_lang: targetLang,
        });
      }
      return res.data.translation;
    } catch (err) {
      console.error('Translation failed:', err);
      return 'Translation failed. Please try again.';
    } finally {
      setIsTranslating(false);
    }
  };

  const handleAddToTranslation = (translatedText, paragraphIndex) => {
    // Build translation HTML by replacing the original paragraph in a copy
    const div = document.createElement('div');
    div.innerHTML = originalHtml;
    const paras = div.querySelectorAll('p');
    if (paras[paragraphIndex]) {
      // Detect if Sanskrit -> keep original
      const originalText = paragraphs[paragraphIndex].text;
      const isSanskrit = /[\u0900-\u097F]{3,}/.test(originalText) && paragraphIndex !== -1;
      if (isSanskrit) {
        // Keep original in translation pane too
      }
      paras[paragraphIndex].innerHTML = translatedText;
    }
    setTranslationHtml(div.innerHTML);
  };

  const handleSaveTranslation = () => {
    onSaveTranslation(translationHtml, targetLang);
  };

  return (
    <div className="h-full flex">
      {/* Left Pane: Original */}
      <div className="w-1/2 border-r border-gray-300 flex flex-col">
        <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 text-sm font-medium text-gray-700">
          Original Document
          {selectedText && (
            <span className="ml-2 text-xs text-indigo-600">({selectedText.length} chars selected)</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {paragraphs.map((p, i) => (
            <div key={i} className="mb-3 group relative">
              <div
                className="p-3 bg-white rounded border border-gray-200 hover:border-indigo-300 cursor-pointer"
                onClick={() => {
                  setSelectedText(p.text);
                  setSelectedParagraphIndex(i);
                }}
                onMouseUp={(e) => {
                  const sel = window.getSelection();
                  if (sel && sel.toString().trim()) {
                    handleTextSelect(sel.toString().trim());
                    setSelectedParagraphIndex(i);
                  }
                }}
                dangerouslySetInnerHTML={{ __html: p.html }}
              />
              <div className="mt-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleTranslateParagraph(p, i).then((t) => handleAddToTranslation(t, i))}
                  disabled={isTranslating}
                  className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-200"
                >
                  {isTranslating && selectedParagraphIndex === i ? 'Translating...' : 'Translate'}
                </button>
                <button
                  onClick={() => handleAddToTranslation(p.text, i)}
                  className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded hover:bg-gray-200"
                >
                  Keep Original
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Pane: Translation */}
      <div className="w-1/2 flex flex-col">
        <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Translation</span>
            <div className="flex items-center gap-2">
              <select
                value={targetLang}
                onChange={(e) => {
                  setTargetLang(e.target.value);
                  localStorage.setItem('target_lang', e.target.value);
                }}
                className="text-xs border rounded px-2 py-1"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  localStorage.setItem('translation_provider', e.target.value);
                }}
                className="text-xs border rounded px-2 py-1"
              >
                <option value="huggingface">Hugging Face</option>
                <option value="bhashini">Bhashini</option>
              </select>
              <button
                onClick={handleSaveTranslation}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Translation'}
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {translationHtml ? (
            <div
              className="p-3 bg-white rounded border border-gray-200 min-h-full"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => setTranslationHtml(e.currentTarget.innerHTML)}
              dangerouslySetInnerHTML={{ __html: translationHtml }}
            />
          ) : (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-lg">No translations yet.</p>
              <p className="text-sm mt-2">Click "Translate" on any paragraph in the left pane to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
