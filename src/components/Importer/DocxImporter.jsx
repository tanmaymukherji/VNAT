import React, { useState, useRef } from 'react';
import * as mammoth from 'mammoth';

export default function DocxImporter({ onImport, disabled }) {
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const processFile = async (file, handle) => {
    setBusy(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = result.value;

      const div = document.createElement('div');
      div.innerHTML = html;
      const paraElements = div.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');

      const allParagraphs = [];
      let page = 1;
      for (const el of paraElements) {
        const text = el.innerText.trim();
        if (text) {
          allParagraphs.push({
            id: `para_${allParagraphs.length}`,
            index: allParagraphs.length,
            page,
            filename: file.name,
            text,
          });
        }
      }

      // Try to detect page breaks from page-break-after or similar
      const pageBreakEls = div.querySelectorAll('[style*="page-break"], hr');
      if (pageBreakEls.length === 0) {
        // If more than 50 paragraphs, split into pages of ~15 paragraphs each
        if (allParagraphs.length > 50) {
          const perPage = Math.ceil(allParagraphs.length / Math.ceil(allParagraphs.length / 15));
          for (let i = 0; i < allParagraphs.length; i++) {
            allParagraphs[i].page = Math.floor(i / perPage) + 1;
          }
        }
      } else {
        page = 1;
        for (let i = 0; i < allParagraphs.length; i++) {
          const el = paraElements[i];
          if (el && (el.matches('hr') || getComputedStyle(el).pageBreakAfter === 'always')) {
            page++;
          }
          allParagraphs[i].page = page;
        }
      }

      if (allParagraphs.length === 0) {
        alert('No text could be extracted from the document.');
        setBusy(false);
        return;
      }

      const name = file.name.replace(/\.docx$/i, '') || 'Untitled Document';

      onImport({
        name,
        folder: file.name,
        paragraphs: allParagraphs,
        isDocx: true,
        fileHandle: handle || null,
      });
    } catch (err) {
      console.error('DOCX import failed:', err);
      alert('Failed to read DOCX: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleClick = () => {
    if ('showOpenFilePicker' in window) {
      window.showOpenFilePicker({
        multiple: false,
        types: [{ accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }],
      }).then(async ([handle]) => {
        const file = await handle.getFile();
        if (!file.name.toLowerCase().endsWith('.docx')) {
          alert('Please select a .docx file.');
          return;
        }
        await processFile(file, handle);
      }).catch((err) => {
        if (err.name !== 'AbortError') fileInputRef.current?.click();
      });
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      alert('Please select a .docx file.');
      e.target.value = '';
      return;
    }
    processFile(file, null);
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={disabled || busy}
        className="bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded text-sm disabled:opacity-50 flex items-center gap-1.5"
      >
        {busy ? 'Reading DOCX...' : '+ Import DOCX'}
      </button>
    </>
  );
}
