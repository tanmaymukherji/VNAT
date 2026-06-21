import React, { useState, useRef, useCallback, useEffect } from 'react';

const LT_URL = 'https://api.languagetool.org/v2/check';

function detectLanguage(text) {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
  return 'en-US';
}

async function fetchSuggestions(word, fullText, selStart, selEnd) {
  try {
    const lang = detectLanguage(fullText);
    const params = new URLSearchParams({ text: fullText, language: lang, enabledOnly: 'false' });
    const res = await fetch(LT_URL, { method: 'POST', body: params });
    const data = await res.json();
    const matches = data?.matches || [];

    const overlapping = matches.filter((m) => {
      const mEnd = m.offset + m.length;
      return m.offset < selEnd && mEnd > selStart;
    });

    const all = overlapping.flatMap((m) =>
      (m.replacements || []).map((r) => r.value)
    ).filter(Boolean);

    const unique = [...new Set(all)].filter((s) => s !== word).slice(0, 6);
    return unique;
  } catch {
    return [];
  }
}

export default function SuggestionButton({ textareaRef }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [pos, setPos] = useState({});

  const close = useCallback(() => { setOpen(false); setSuggestions([]); }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!e.target.closest('.suggest-popup') && !e.target.closest('.suggest-btn')) close(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  const handleClick = useCallback(() => {
    const ta = textareaRef?.current;
    if (!ta) return;
    const sel = ta.selectionStart;
    const sele = ta.selectionEnd;
    if (sel === sele) { alert('Select a word first by highlighting it with the mouse.'); return; }
    const selected = ta.value.substring(sel, sele).trim();
    if (!selected || selected.includes(' ')) { alert('Please select a single word.'); return; }

    const rect = btnRef.current?.getBoundingClientRect();
    setPos({ left: rect ? rect.left : 0, top: rect ? rect.bottom + 4 : 0 });

    setWord(selected);
    setOpen(true);
    setLoading(true);
    setSuggestions([]);

    fetchSuggestions(selected, ta.value, sel, sele).then((result) => {
      setSuggestions(result);
      setLoading(false);
    });
  }, [textareaRef]);

  const handleReplace = useCallback((replacement) => {
    const ta = textareaRef?.current;
    if (!ta) return;
    const sel = ta.selectionStart;
    const sele = ta.selectionEnd;
    const newValue = ta.value.substring(0, sel) + replacement + ta.value.substring(sele);
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeInputValueSetter.call(ta, newValue);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    close();
  }, [textareaRef, close]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        className="suggest-btn text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded hover:bg-purple-200"
      >
        Suggest
      </button>
      {open && (
        <div
          className="suggest-popup fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] text-sm"
          style={{ left: pos.left, top: pos.top }}
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 truncate max-w-[240px]">
            &ldquo;{word}&rdquo;
          </div>
          <div>
            {loading && <div className="px-3 py-2 text-xs text-gray-400">Loading...</div>}
            {!loading && suggestions.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">No alternatives found</div>
            )}
            {!loading && suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleReplace(s)}
                className="w-full text-left px-3 py-1.5 hover:bg-green-50 text-gray-700 font-medium block"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
