import React, { useState, useRef, useCallback, useEffect } from 'react';

const SUGGESTION_API = 'https://api.mymemory.translated.net/get';

// Indian language Unicode ranges
const INDIC_RANGE = /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/;
const WORD_CHAR = /[\w\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/;
function getWordAt(text, pos) {
  if (!text || pos < 0 || pos > text.length) return '';
  let s = pos;
  while (s > 0 && WORD_CHAR.test(text[s - 1])) s--;
  let e = pos;
  while (e < text.length && WORD_CHAR.test(text[e])) e++;
  return text.slice(s, e);
}

async function fetchSuggestions(word) {
  try {
    const lang = INDIC_RANGE.test(word) ? 'hi' : 'en';
    const url = `${SUGGESTION_API}?q=${encodeURIComponent(word)}&langpair=${lang}|${lang}&mt=0&num=5`;
    const res = await fetch(url);
    const data = await res.json();
    const matches = data?.matches || [];
    return [...new Set(
      matches.map((m) => m.segment || '').filter((s) => s && s.toLowerCase() !== word.toLowerCase())
    )].slice(0, 5);
  } catch {
    return [];
  }
}

export default function SmartTextarea({ value, onChange, className, rows, placeholder, disabled }) {
  const textareaRef = useRef(null);
  const [state, setState] = useState({ x: 0, y: 0, word: '', visible: false, loading: false, suggestions: [] });

  const close = useCallback(() => setState((s) => ({ ...s, visible: false })), []);

  useEffect(() => {
    if (!state.visible) return;
    const handler = (e) => { if (!e.target.closest('.spell-menu')) close(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [state.visible, close]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    const ta = textareaRef.current;
    if (!ta) return;

    // Determine cursor position at the mouse click point
    let pos = ta.selectionStart;
    try {
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (r && r.startContainer && (r.startContainer === ta || ta.contains(r.startContainer))) {
          pos = r.startOffset;
        }
      }
    } catch {}

    const word = getWordAt(value, pos);

    if (word) {
      setState({ x: e.clientX, y: e.clientY, word, visible: true, loading: true, suggestions: [] });
      fetchSuggestions(word).then((sugs) => {
        setState((s) => s.word === word ? { ...s, loading: false, suggestions: sugs } : s);
      });
    } else {
      setState({ x: e.clientX, y: e.clientY, word: '', visible: true, loading: false, suggestions: [] });
    }
  }, [value]);

  const replace = useCallback((replacement) => {
    const ta = textareaRef.current;
    if (!ta || !state.word) return;
    // Find the word in the value and replace it
    const pos = ta.selectionStart;
    let s = pos;
    while (s > 0 && WORD_CHAR.test(value[s - 1])) s--;
    let e = pos;
    while (e < value.length && WORD_CHAR.test(value[e])) e++;
    const newValue = value.slice(0, s) + replacement + value.slice(e);
    onChange(newValue);
    close();
  }, [value, onChange, state.word, close]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={true}
        lang="hi"
        onContextMenu={handleContextMenu}
      />
      {state.visible && (
        <div
          className="spell-menu fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] text-sm"
          style={{ left: state.x, top: state.y }}
        >
          {!state.word ? (
            <div className="px-3 py-2 text-xs text-gray-400">Position cursor on a word, then right-click</div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 truncate max-w-[220px]">
                &ldquo;{state.word}&rdquo;
              </div>
              <div>
                {state.loading && (
                  <div className="px-3 py-2 text-xs text-gray-400">Looking up suggestions...</div>
                )}
                {!state.loading && state.suggestions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-400">No alternatives found</div>
                )}
                {!state.loading && state.suggestions.map((s, i) => (
                  <button
                    key={i}
                    onMouseDown={(ev) => { ev.preventDefault(); replace(s); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-green-50 text-gray-700 font-medium block"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
