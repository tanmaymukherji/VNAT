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
    return [...new Set(all)].filter((s) => s !== word).slice(0, 6);
  } catch {
    return [];
  }
}

function findLineBbox(lines, selStart, selEnd) {
  let offset = 0;
  for (const line of lines) {
    const lineLen = line.text.length;
    const lineStart = offset;
    const lineEnd = offset + lineLen;
    if (selStart < lineEnd && selEnd > lineStart) {
      return line.bbox;
    }
    offset += lineLen + 1; // +1 for the \n joiner
  }
  return null;
}

const PREVIEW_WIDTH = 300;

function PreviewCanvas({ imageData, lines, selStart, selEnd }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      const bbox = findLineBbox(lines, selStart, selEnd);
      if (!bbox) return;

      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const bx0 = Math.max(0, bbox.x0);
      const by0 = Math.max(0, bbox.y0);
      const bx1 = Math.min(iw, bbox.x1);
      const by1 = Math.min(ih, bbox.y1);
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw < 1 || bh < 1) return;

      const pad = Math.max(4, bh * 0.3);
      const cropX = Math.max(0, bx0 - pad);
      const cropY = Math.max(0, by0 - pad);
      const cropW = Math.min(iw - cropX, bw + pad * 2);
      const cropH = Math.min(ih - cropY, bh + pad * 2);

      const aspect = cropW / cropH;
      const ch = Math.min(PREVIEW_WIDTH / aspect, 180);
      const cw = ch * aspect;

      canvas.width = cw;
      canvas.height = ch;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cw, ch);
    };
    img.src = imageData;
  }, [imageData, lines, selStart, selEnd]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded border border-gray-200"
      style={{ maxHeight: '180px' }}
    />
  );
}

export default function SuggestionButton({ textareaRef, imageData, lines }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
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
    setSelStart(sel);
    setSelEnd(sele);
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

  const showPreview = imageData && lines && lines.length > 0;

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
          className="suggest-popup fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px] text-sm"
          style={{ left: pos.left, top: pos.top }}
        >
          {showPreview && (
            <div className="px-3 py-2 border-b border-gray-100">
              <PreviewCanvas
                imageData={imageData}
                lines={lines}
                selStart={selStart}
                selEnd={selEnd}
              />
              <div className="text-[10px] text-gray-400 mt-1 text-center">Image crop of selected line</div>
            </div>
          )}
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 truncate max-w-[280px]">
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
