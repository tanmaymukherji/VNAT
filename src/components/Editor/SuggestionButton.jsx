import React, { useState, useRef, useCallback, useEffect } from 'react';
import { fetchSuggestions } from '../../spellcheck';

function findLineBbox(lines, selStart, selEnd) {
  let offset = 0;
  for (const line of lines) {
    const lineLen = line.text.length;
    const lineStart = offset;
    const lineEnd = offset + lineLen;
    if (selStart < lineEnd && selEnd > lineStart) {
      return { bbox: line.bbox, lineText: line.text };
    }
    offset += lineLen + 1;
  }
  return null;
}

function PreviewCanvas({ imageData, lines, selStart, selEnd }) {
  const canvasRef = useRef(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [lineText, setLineText] = useState('');

  const found = findLineBbox(lines, selStart, selEnd);
  const hasBbox = found && found.bbox && typeof found.bbox.x0 === 'number';

  useEffect(() => {
    if (!hasBbox || !imageData) return;
    setLineText(found.lineText);
    setImgLoaded(false);

    const img = new window.Image();
    img.onload = () => {
      setImgLoaded(true);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      const { bbox } = found;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const bx0 = Math.max(0, bbox.x0);
      const by0 = Math.max(0, bbox.y0);
      const bx1 = Math.min(iw, bbox.x1);
      const by1 = Math.min(ih, bbox.y1);
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw < 2 || bh < 2) return;

      const pad = Math.max(4, bh * 0.3);
      const cropX = Math.max(0, bx0 - pad);
      const cropY = Math.max(0, by0 - pad);
      const cropW = Math.min(iw - cropX, bw + pad * 2);
      const cropH = Math.min(ih - cropY, bh + pad * 2);
      const aspect = cropW / cropH;
      const ch = Math.min(300 / aspect, 150);
      const cw = ch * aspect;

      canvas.width = cw;
      canvas.height = ch;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cw, ch);
    };
    img.onerror = () => setImgLoaded(false);
    img.src = imageData;
  }, [imageData, lines, selStart, selEnd]);

  if (!hasBbox) return <div className="text-[10px] text-gray-400 italic py-1">Image crop: re-import images to enable line-by-line preview</div>;
  if (!imgLoaded) return <div className="text-[10px] text-gray-400 italic py-1">Loading image preview...</div>;

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full rounded border border-gray-200 bg-gray-50"
        style={{ maxHeight: '150px' }}
      />
      {lineText && (
        <div className="mt-1.5 text-[11px] text-gray-500 bg-gray-50 rounded p-1.5 border border-gray-100 leading-relaxed">
          <span className="font-medium">OCR line:</span> {lineText}
        </div>
      )}
    </div>
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
  const [type, setType] = useState('none');
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
      setType(result.type);
      setSuggestions(result.alternatives);
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

  const showPreview = imageData && lines;

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
          className="suggest-popup fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[240px] text-sm"
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
            </div>
          )}
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 truncate max-w-[300px]">
            &ldquo;{word}&rdquo;
          </div>
          <div>
            {loading && <div className="px-3 py-2 text-xs text-gray-400">Loading dictionaries...</div>}
            {!loading && suggestions.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">No alternatives found</div>
            )}
            {!loading && type === 'corrections' && suggestions.length > 0 && (
              <div className="px-3 pt-1.5 pb-0.5 text-[10px] text-amber-500 font-medium">Spelling corrections</div>
            )}
            {!loading && type === 'alternatives' && suggestions.length > 0 && (
              <div className="px-3 pt-1.5 pb-0.5 text-[10px] text-indigo-500 font-medium">Similar alternatives</div>
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
